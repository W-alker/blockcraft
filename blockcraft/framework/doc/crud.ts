import {DeltaOperation, IBlockSnapshot, InlineModel} from "../types";
import {YBlock} from "../reactive";
import * as Y from "yjs";
import {BlockCraftError, ErrorCode} from "../../global";
import {IBlockSelectionJSON} from "../modules";
import {EditableBlockComponent} from "../block";
import {Subject} from "rxjs";

// This origin will skip Y.Event sync (to model)
export const ORIGIN_SKIP_SYNC = Symbol('skip_sync')
// This origin will not be recorded in undo/redo stack
export const ORIGIN_NO_RECORD = Symbol('no_record')

export interface IChildrenChangeEvent {
  inserted?: string[]
  deleted?: {
    index: number,
    length: number
  }
  block: BlockCraft.BlockComponent
}

export interface IPropsChangeEvent {
  block: BlockCraft.BlockComponent
  changes: Map<string, {
    oldValue: any
    action: "add" | "update" | "delete"
  }>
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
  readonly onPropsUpdate$ = new Subject<IPropsChangeEvent[]>()

  constructor(
    public readonly doc: BlockCraft.Doc
  ) {
    this.yBlockMap.observeDeep(this._syncYEvent)

    this.yUndoManager.on('stack-item-added', (e) => {
      // console.log('undo/redo stack', e, e.origin)
      if (e.type === 'undo') {
        this._undoSelectionStack.push(this.doc.selection.value ? this.doc.selection.value.toJSON() : null)
      }
    })
  }

  get schemas() {
    return this.doc.schemas
  }

  get vm() {
    return this.doc.vm
  }

  transact(fn: () => void, origin: any = null) {
    return this.yDoc.transact(fn, origin)
  }

  private _syncYEvent = (event: Y.YEvent<any>[], tr: Y.Transaction) => {
    // local change with skip
    if (tr.origin === ORIGIN_NO_RECORD) return

    // undo/redo
    if (tr.origin instanceof Y.UndoManager) {
    }

    const _bms: Record<string, YBlock> = {}

    const propsChangeEvents: IPropsChangeEvent[] = []
    // sync to model
    event.forEach(ev => {
      const {path, changes, target} = ev

      // console.log('sync YEvent', path, changes, tr.origin)

      // at top level, it`s mean that block is created or deleted
      // No need handle ORIGIN_SKIP_SYNC
      if (!path.length) {
        tr.origin !== ORIGIN_SKIP_SYNC && changes.keys.forEach((change, key) => {
          switch (change.action) {
            case 'add':
            case "update":
              _bms[key] = this.yBlockMap.get(key)!
              break;
            case 'delete':
              break;
          }
        })

        return
      }

      const blockId = path[0] as string
      const keyProp = path[1]

      if (keyProp === "children") {
        if (tr.origin !== ORIGIN_SKIP_SYNC) {
          if (target instanceof Y.Array) {
            this._syncYBlockChildrenUpdate(_bms, ev)
          } else {
            const bm = this.vm.get(blockId)
            if (!bm) throw new BlockCraftError(ErrorCode.SyncYEventError, `Block ${blockId} not found`)
            this.doc.inlineManager.applyDeltaToView(changes.delta as DeltaOperation[], (bm.instance as EditableBlockComponent).containerElement)
          }
        }
        return
      }

      const bm = this.vm.get(blockId)
      if (!bm) throw new BlockCraftError(ErrorCode.SyncYEventError, `Block ${blockId} not found`)
      const propKey = path[1] as 'props' | 'meta'

      if (tr.origin !== ORIGIN_SKIP_SYNC) {
        changes.keys.forEach((change, key) => {
          switch (change.action) {
            case 'add':
            case "update":
              // @ts-expect-error
              bm.instance._native[propKey][key] = target.get(key)
              break;
            case 'delete':
              // @ts-expect-error
              delete bm.instance._native[propKey][key]
              break;
          }
        })
        // 触发视图检查
        Promise.resolve().then(() => {
          bm.instance.changeDetectorRef.markForCheck()
          bm.instance.onPropsChange.emit(changes.keys as any)
        })
      }

      propKey === 'props' && propsChangeEvents.push({
        block: bm.instance,
        changes: changes.keys
      })
    })

    propsChangeEvents.length && this.onPropsUpdate$.next(propsChangeEvents)
  }

  private _syncYBlockChildrenUpdate = (collect: Record<string, YBlock>, event: Y.YEvent<Y.Array<string>>) => {
    const {path, changes, target} = event
    let r = 0
    const bm = this.vm.get(path[0] as string)
    if (!bm) throw new BlockCraftError(ErrorCode.SyncYEventError, `Block ${path[0]} not found`)

    const map: IChildrenChangeEvent = {
      block: bm.instance
    }
    changes.delta.forEach(async (d) => {
      const {retain, insert, delete: del} = d
      if (retain) {
        r += retain
      } else if (insert) {
        const childComps = await this.vm.createComponentByYBlocks(collect)
        const _insertComps = (insert as string[]).map(id => childComps[id])
        this.vm.insert(bm.instance.id, r, _insertComps)
        r += insert.length
        map.inserted ||= []
        map.inserted.push(...insert)
      } else {
        this.vm.remove(bm, r, del)
        map.deleted = {
          index: r,
          length: <number>del
        }
      }
    })

    this.onChildrenUpdate$.next(map)
  }

  async insertNewParagraph(parentId: string, index: number, content: string | InlineModel = '') {
    const op = typeof content === 'string' ? [{insert: content}] : content
    const p = this.doc.schemas.createSnapshot('paragraph', [op])
    await this.insertBlocks([p], index, parentId)
    return this.doc.getBlockById(p.id)
  }

  async insertBlocks(snapshots: IBlockSnapshot[], index = 0, parentId = this.doc.rootId) {
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
    }, ORIGIN_SKIP_SYNC)
  }

  async insertBlocksAfter(block: string | BlockCraft.BlockComponent, snapshots: IBlockSnapshot[]) {
    block = typeof block === 'string' ? this.doc.getBlockById(block) : block
    const index = block.getIndexOfParent() + 1
    await this.insertBlocks(snapshots, index, block.parentId!)
  }

  async deleteBlocks(parent: string, index: number, count = 1) {
    const parentComp = this.vm.get(parent)!
    this.transact(() => {
      const ids = this.vm.remove(parentComp, index, count);
      (parentComp.instance.yBlock.get('children') as Y.Array<string>).delete(index, count)
      ids.forEach(id => this.yBlockMap.delete(id))
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
    this.deleteBlocks(block.parentId!, index, 1)
    if (!snapshots?.length) return
    await this.insertBlocks(snapshots, index, block.parentId!)
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
    Promise.resolve().then(() => {
      const last = this._undoSelectionStack.pop()
      if (!last) return
      this._redoSelectionStack.push(last)
      this.doc.selection.replay(last)
    })
  }

  redo() {
    if (!this.isCanRedo) return
    this.yUndoManager.redo()
    Promise.resolve().then(() => {
      const last = this._redoSelectionStack.pop()
      if (!last) return
      this._undoSelectionStack.push(last)
      this.doc.selection.replay(last)
    })
  }

  clearHistory() {
    this.yUndoManager.clear()
    this._undoSelectionStack = []
    this._redoSelectionStack = []
  }

}
