import {DeltaOperation, IBlockSnapshot, InlineModel} from "../types";
import {YBlock} from "../reactive";
import * as Y from "yjs";
import {BlockCraftError, ErrorCode, nextTick} from "../../global";
import {IBlockSelectionJSON} from "../modules";
import {EditableBlockComponent} from "../block";
import {Subject} from "rxjs";

// This origin will skip Y.Event sync (to model)
export const ORIGIN_SKIP_SYNC = Symbol('skip_sync')
// This origin will not be recorded in undo/redo stack
export const ORIGIN_NO_RECORD = Symbol('no_record')

export interface IChildrenChangeEvent {
  isUndoRedo: boolean,
  transactions: {
    inserted?: BlockCraft.BlockComponent[]
    deleted?: {
      index: number,
      length: number
    }[]
    block: BlockCraft.BlockComponent,
  }[]
}

export interface IPropsChangeEvent {
  isUndoRedo: boolean
  transactions: {
    block: BlockCraft.BlockComponent
    changes: Map<string, {
      oldValue: any
      action: "add" | "update" | "delete"
    }>
  }[]
}

export class DocCRUD {

  readonly yDoc = new Y.Doc({
    guid: this.doc.config.docId
  })
  readonly yBlockMap = this.yDoc.getMap<YBlock>()
  readonly yUndoManager = new Y.UndoManager(this.yBlockMap, {
    trackedOrigins: new Set([ORIGIN_SKIP_SYNC, null])
  })

  private _undoSelectionStack: Array<IBlockSelectionJSON | null> = []
  private _redoSelectionStack: Array<IBlockSelectionJSON | null> = []

  readonly onChildrenUpdate$ = new Subject<IChildrenChangeEvent>()
  readonly onPropsUpdate$ = new Subject<IPropsChangeEvent>()

  constructor(
    public readonly doc: BlockCraft.Doc
  ) {
    this.yBlockMap.observeDeep(this._syncYEvent)

    this.yUndoManager.on('stack-item-added', (evt) => {
      console.log('undo stack', this.yUndoManager.undoStack)
    })
  }

  get schemas() {
    return this.doc.schemas
  }

  get vm() {
    return this.doc.vm
  }

  getYBlock(id: string) {
    return this.yBlockMap.get(id)
  }

  transact(fn: () => void, origin: any = null) {
    return this.yDoc.transact(fn, origin)
  }

  private _syncYEvent = (event: Y.YEvent<any>[], tr: Y.Transaction) => {
    // local change with skip
    if (tr.origin === ORIGIN_NO_RECORD) return

    const isUndoRedo = tr.origin instanceof Y.UndoManager

    const added: Record<string, YBlock> = {}
    const deleted: string[] = []

    const propsChanges: IPropsChangeEvent['transactions'] = []

    const delay_childrenEvent_handlers: [BlockCraft.BlockComponentRef, Y.YEvent<Y.Array<string>>['changes']['delta']][] = []

    // sync to model
    event.forEach(ev => {
      const {path, changes, target} = ev

      // at top level, it`s mean that block is created or deleted
      // No need handle ORIGIN_SKIP_SYNC
      if (!path.length) {
        tr.origin !== ORIGIN_SKIP_SYNC && changes.keys.forEach((change, key) => {
          if (change.action === 'delete') {
            deleted.push(key)
          }
        })

        return
      }

      const blockId = path[0] as string
      const keyProp = path[1]
      const bm = this.vm.get(blockId)
      if (!bm) throw new BlockCraftError(ErrorCode.SyncYEventError, `Block ${blockId} not found`)

      if (keyProp === "children") {
        if (target instanceof Y.Array) {
          if (tr.origin !== ORIGIN_SKIP_SYNC) {
            changes.delta.forEach(change => {
              if (change.insert) {
                (change.insert as string[]).forEach(id => {
                  added[id] = this.getYBlock(id)!
                })
              }
            })

            delay_childrenEvent_handlers.push([bm, changes.delta])
          }

          // @ts-expect-error
          bm.instance._childrenIds = target.toArray()
          return
        }

        // Y.Text
        if (tr.origin !== ORIGIN_SKIP_SYNC) {
          const bm = this.vm.get(blockId)
          if (!bm) throw new BlockCraftError(ErrorCode.SyncYEventError, `Block ${blockId} not found`)
          this.doc.inlineManager.applyDeltaToView(changes.delta as DeltaOperation[], (bm.instance as EditableBlockComponent).containerElement)
        }
        return
      }

      const propKey = path[1] as 'props' | 'meta'

      if (tr.origin !== ORIGIN_SKIP_SYNC) {
        changes.keys.forEach((change, key) => {
          switch (change.action) {
            case 'add':
            case "update":
              // @ts-expect-error
              Reflect.set(bm.instance._native[propKey], key, target.get(key))
              break;
            case 'delete':
              // @ts-expect-error
              Reflect.deleteProperty(bm.instance._native[propKey], key)
              break;
          }
        })
        // 触发视图检查
        Promise.resolve().then(() => {
          bm.instance.changeDetectorRef.markForCheck()
          bm.instance.onPropsChange.emit(changes.keys as any)
        })
      }

      propKey === 'props' && propsChanges.push({
        block: bm.instance,
        changes: changes.keys
      })
    })

    if (propsChanges.length) {
      this.onPropsUpdate$.next({
        isUndoRedo,
        transactions: propsChanges
      })

      // propsChanges.forEach(v => {
      //   v.block.onPropsChange.next(v.changes as any)
      // })
    }

    if (delay_childrenEvent_handlers.length) {
      this._syncYBlockChildrenUpdate(added, deleted, delay_childrenEvent_handlers, isUndoRedo)
    }
  }

  private _syncYBlockChildrenUpdate = async (added: Record<string, YBlock>,
                                             deleted: string[],
                                             events: [BlockCraft.BlockComponentRef, Y.YEvent<Y.Array<string>>['changes']['delta']][],
                                             isUndoRedo = false) => {

    const emitEvents: IChildrenChangeEvent = {isUndoRedo, transactions: []}

    const childComps = await this.vm.createComponentByYBlocks(added)
    const insertDelay: Map<BlockCraft.BlockComponentRef, [number, BlockCraft.BlockComponentRef[]][]> = new Map()

    events.forEach(([bm, deltas]) => {
      const _delay_inserts: [number, BlockCraft.BlockComponentRef[]][] = []
      const deletedMap: { index: number, length: number }[] = []

      let r = 0
      deltas.forEach(d => {
        if (d.retain) {
          r += d.retain
        } else if (d.insert) {
          // 所有的插入操作需要延迟执行
          const _insertComps = (d.insert as string[]).map(id => childComps[id])
          _delay_inserts.push([r, _insertComps])
        } else if (d.delete) {
          this.vm.remove(bm, r, d.delete)
          deletedMap.push({index: r, length: <number>d.delete})
        }
      })

      insertDelay.set(bm, _delay_inserts)
      emitEvents.transactions.push({
        block: bm.instance,
        deleted: deletedMap.length ? deletedMap : undefined,
        inserted: _delay_inserts.map(v => v[1].map(v => v.instance)).flat()
      })
    })

    ;[...insertDelay.keys()].forEach(bm => {
      let _ir = 0
      const item = insertDelay.get(bm)!
      item.forEach(([r, comps]) => {
        this.vm.insert(bm, r, comps)
        _ir += comps.length
      })
    })

    this.vm.detach(deleted)
    this.onChildrenUpdate$.next(emitEvents)
  }

  async insertNewParagraph(parentId: string, index: number, content: string | InlineModel = '') {
    const op = typeof content === 'string' ? [{insert: content}] : content
    const p = this.doc.schemas.createSnapshot('paragraph', [op])
    await this.insertBlocks(parentId, index, [p])
    return this.doc.getBlockById(p.id)
  }

  async insertBlocks(parentId: string, index: number, snapshots: IBlockSnapshot[]) {
    const comps = await Promise.all(
      snapshots.map(s => this.vm.createComponentBySnapshot(s, (m) => {
        this.transact(() => {
          this.yBlockMap.set(m.instance.id, m.instance.yBlock)
        }, ORIGIN_SKIP_SYNC)
      }))
    )
    const parentComp = this.vm.get(parentId)!
    this.transact(() => {
      this.vm.insert(parentId, index, comps);
      (parentComp.instance.yBlock.get('children') as Y.Array<string>).insert(index, comps.map(c => c.instance.id))
      // emit
      this.onChildrenUpdate$.next({
        isUndoRedo: false,
        transactions: [{
          block: parentComp.instance,
          inserted: comps.map(v => v.instance),
        }]
      })
    }, ORIGIN_SKIP_SYNC)
  }

  async insertBlocksBefore(block: string | BlockCraft.BlockComponent, snapshots: IBlockSnapshot[]) {
    block = typeof block === 'string' ? this.doc.getBlockById(block) : block
    const index = block.getIndexOfParent()
    await this.insertBlocks(block.parentId!, index, snapshots)
  }

  async insertBlocksAfter(block: string | BlockCraft.BlockComponent, snapshots: IBlockSnapshot[]) {
    block = typeof block === 'string' ? this.doc.getBlockById(block) : block
    const index = block.getIndexOfParent() + 1
    await this.insertBlocks(block.parentId!, index, snapshots)
  }

  async deleteBlocks(parent: string, index: number, count = 1) {
    const parentComp = this.vm.get(parent)!
    this.transact(() => {
      const sliceIds = parentComp.instance.childrenIds.slice(index, index + count)
      this.vm.remove(parentComp, index, count)
      this.vm.detach(sliceIds)
      ;(parentComp.instance.yBlock.get('children') as Y.Array<string>).delete(index, count)
      sliceIds.forEach(id => this.yBlockMap.delete(id))
      // emit
      this.onChildrenUpdate$.next({
        isUndoRedo: false,
        transactions: [{
          block: parentComp.instance,
          deleted: [{
            index,
            length: count
          }],
        }]
      })
    }, ORIGIN_SKIP_SYNC)
  }

  async deleteBlockById(blockId: string) {
    const block = this.doc.getBlockById(blockId)
    const index = block.getIndexOfParent()
    await this.deleteBlocks(block.parentId!, index, 1)
  }

  async replaceWithSnapshots(blockId: string, snapshots?: IBlockSnapshot[]) {
    const block = this.doc.getBlockById(blockId)
    const index = block.getIndexOfParent()
    const parentId = block.parentId!
    await this.deleteBlocks(parentId, index, 1)
    if (!snapshots?.length) return
    await this.insertBlocks(parentId, index, snapshots)
  }

  async moveBlocks(parentId: string, index: number, count: number, targetId: string, targetIndex: number) {
    const parentComp = this.vm.get(parentId)
    const targetComp = this.vm.get(targetId)
    if (!parentComp || !targetComp) return
    this.transact(() => {
      const sliceIds = parentComp.instance.childrenIds.slice(index, index + count)
      const sliceComps = sliceIds.map(id => this.vm.get(id)!)
      this.vm.remove(parentComp, index, count)
      this.vm.insert(targetComp, targetIndex, sliceComps)
      parentComp.instance.yBlock.get('children').delete(index, count)
      ;(targetComp.instance.yBlock.get('children') as Y.Array<string>).insert(targetIndex, sliceIds)
    }, ORIGIN_SKIP_SYNC)
  }

  isCanUndo() {
    return this.yUndoManager.canUndo()
  }

  isCanRedo() {
    return this.yUndoManager.canRedo()
  }

  undo() {
    if (!this.isCanUndo) return
    this.yUndoManager.undo()

    const last = this._undoSelectionStack.pop()
    if (last === undefined) return
    this._redoSelectionStack.push(last)
    nextTick().then(() => {
      try {
        this.doc.selection.replay(last)
      } catch (e) {
      }
    })
  }

  redo() {
    if (!this.isCanRedo) return
    this.yUndoManager.redo()

    const last = this._redoSelectionStack.pop()
    if (last === undefined) return
    this._undoSelectionStack.push(last)
    nextTick().then(() => {
      try {
        this.doc.selection.replay(last)
      } catch (e) {
      }
    })
  }

  clearHistory() {
    this.yUndoManager.clear()
    this._undoSelectionStack = []
    this._redoSelectionStack = []
  }

}
