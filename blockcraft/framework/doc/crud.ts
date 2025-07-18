import {
  BlockNodeType,
  DeltaOperation, EditableBlockComponent,
  IBlockSnapshot,
  InlineModel,
  native2YBlock,
  NativeBlockModel,
  YBlock, yBlock2Native
} from "../block-std";
import * as Y from "yjs";
import {BlockCraftError, ErrorCode, nextTick} from "../../global";
import {IBlockSelectionJSON} from "../modules";
import {BehaviorSubject, Subject, take} from "rxjs";
import {NgZone} from "@angular/core";

// This origin will skip Y.Event sync (to model)
export const ORIGIN_SKIP_SYNC = Symbol('skip_sync')
// This origin will not be recorded in undo/redo stack
export const ORIGIN_NO_RECORD = Symbol('no_record')

export interface ITextChangeEvent {
  isUndoRedo: boolean,
  origin: any
  transactions: {
    block: EditableBlockComponent
    delta: DeltaOperation[]
  }[]
}

export interface IChildrenChangeEvent {
  isUndoRedo: boolean,
  origin: any
  transactions: {
    inserted?: BlockCraft.BlockComponent[]
    deleted?: {
      index: number,
      length: number
    }[],
    block: BlockCraft.BlockComponent,
  }[]
}

export interface IPropsChangeEvent {
  isUndoRedo: boolean
  origin: any
  transactions: {
    block: BlockCraft.BlockComponent
    changes: Map<string, {
      oldValue: any
      action: "add" | "update" | "delete"
    }>
  }[]
}

export class DocCRUD {

  private _yUndoManager!: Y.UndoManager
  private _trackedOrigins = new Set<any>([ORIGIN_SKIP_SYNC, null])

  private _undoSelectionStack: Array<IBlockSelectionJSON | null> = []
  private _redoSelectionStack: Array<IBlockSelectionJSON | null> = []
  private _undoRedoing$ = new BehaviorSubject(false)

  readonly onChildrenUpdate$ = new Subject<IChildrenChangeEvent>()
  readonly onPropsUpdate$ = new Subject<IPropsChangeEvent>()
  readonly onTextUpdate$ = new Subject<ITextChangeEvent>()

  get yDoc() {
    return this.doc.yDoc
  }

  get yBlockMap() {
    return this.doc.yBlockMap
  }

  get yUndoManager() {
    return this._yUndoManager
  }

  constructor(
    private readonly doc: BlockCraft.Doc
  ) {
    const zone = this.doc.injector.get(NgZone)
    this.doc.afterInit(() => {

      this._yUndoManager = new Y.UndoManager(this.yBlockMap, {
        captureTimeout: 200,
        trackedOrigins: this._trackedOrigins
      })

      this.yBlockMap.observeDeep((evt, tr) => {
        zone.run(async () => {
          await this._syncYEvent(evt, tr)
        })
          .then(() => {
            if (!tr.local) {
              nextTick().then(() => {
                this.doc.selection.recalculate()
              })
            }

          })
      })

      this.yUndoManager.on('stack-item-added', (evt) => {
        if (evt.type === 'undo') {
          // console.log('%cundo stack', 'background: #444;', this.yUndoManager.undoStack, this.doc.selection)
          this._undoSelectionStack.push(this.doc.selection.value ? this.doc.selection.value.toJSON() : null)
          if (this._undoSelectionStack.length > 200) {
            this.yUndoManager.undoStack.shift()
            this.yUndoManager.redoStack.shift()
            this._undoSelectionStack.shift()
          }
        }
      })
    })
  }

  get vm() {
    return this.doc.vm
  }

  getYBlock(id: string) {
    return this.yBlockMap.get(id)
  }

  addTrackedOrigin(origin: any) {
    this._trackedOrigins.add(origin)
  }

  removeTrackedOrigin(origin: any) {
    this._trackedOrigins.delete(origin)
  }

  getAllBlocks(filter?: (block: BlockCraft.BlockComponent) => boolean) {
    const blocks: BlockCraft.BlockComponent[] = []
    const ids = this.yBlockMap.keys()
    for (const id of ids) {
      // TODO ！！！！！！！！！！！！！！ 临时解决上个版本的巨坑
      try {
        const block = this.doc.getBlockById(id, () => {
          this.doc.yBlockMap.delete(id)
        })
        if (filter) {
          filter(block) && blocks.push(block)
        } else {
          blocks.push(block)
        }
      } catch (e) {
      }
    }
    return blocks
  }

  transact(fn: () => void, origin: any = null) {
    return this.yDoc.transact(fn, origin)
  }

  private _syncYEvent = async (events: Y.YEvent<any>[], tr: Y.Transaction) => {
    // local change with skip
    const isUndoRedo = tr.origin instanceof Y.UndoManager

    const added: Record<string, YBlock> = {}
    const deleted: string[] = []

    const propsChanges: IPropsChangeEvent['transactions'] = []
    const textChanges: ITextChangeEvent['transactions'] = []

    const delay_childrenEvent_handlers: [BlockCraft.BlockComponentRef, Y.YEvent<Y.Array<string>>['changes']['delta']][] = []

    // sync to model
    events.forEach(ev => {
      const {path, changes, target} = ev

      // at top level, it`s mean that block is created or deleted
      // No need handle ORIGIN_SKIP_SYNC
      if (!path.length) {
        tr.origin !== ORIGIN_SKIP_SYNC && changes.keys.forEach((change, key) => {
          if (change.action === 'delete') {
            deleted.push(key)
          }

          // 重新设置yBlock，因为之前的被替换了
          const v = this.vm.get(key)
          const yBlock = this.getYBlock(key)
          if (v && yBlock) {
            v.setInput('yBlock', yBlock)
            v.setInput('model', yBlock2Native(yBlock))
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

        if (!this.doc.isEditable(bm.instance))
          throw new BlockCraftError(ErrorCode.SyncYEventError, `Block ${blockId} is not editable`)
        // Y.Text
        if (tr.origin !== ORIGIN_SKIP_SYNC) {
          try {
            bm.instance.inlineManager.applyDeltaToView(changes.delta as DeltaOperation[], bm.instance.containerElement)
          } catch (e) {
            this.doc.logger.warn('applyDeltaToView error', e)
            bm.instance.rerender()
          }
        }
        textChanges.push({
          block: bm.instance,
          delta: changes.delta as DeltaOperation[]
        })
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
        origin: tr.origin,
        transactions: propsChanges
      })

      propsChanges.forEach(v => {
        v.block.onPropsChange.emit(v.changes as any)
      })
    }

    if (textChanges.length) {
      this.onTextUpdate$.next({
        isUndoRedo,
        origin: tr.origin,
        transactions: textChanges
      })
    }

    if (delay_childrenEvent_handlers.length) {
      await this._syncYBlockChildrenUpdate(added, deleted, delay_childrenEvent_handlers, isUndoRedo, tr.origin)
    }

    this._undoRedoing$.value && this._undoRedoing$.next(false)
  }

  private _syncYBlockChildrenUpdate = async (added: Record<string, YBlock>,
                                             deleted: string[],
                                             events: [BlockCraft.BlockComponentRef, Y.YEvent<Y.Array<string>>['changes']['delta']][],
                                             isUndoRedo = false, origin: any) => {
    const emitEvents: IChildrenChangeEvent = {isUndoRedo, transactions: [], origin}

    const childComps = await this.vm.createComponentByYBlocks(added)
    const insertDelay: Map<BlockCraft.BlockComponentRef, [number, BlockCraft.BlockComponentRef[]][]> = new Map()

    // TODO 对于已经做缓存的元素，在增加和删除的时候会有重复的情况，比如移动。这是VM的问题。可以尝试解决move行为
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
          this.vm.insert(bm, r, _insertComps)
          r += _insertComps.length
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

    this.vm.detach(deleted)
    this.onChildrenUpdate$.next(emitEvents)
  }

  async insertNewParagraph(parentId: string, index: number, content: string | InlineModel = '') {
    const op = typeof content === 'string' ? [{insert: content}] : content
    const p = this.doc.schemas.createSnapshot('paragraph', [op])
    await this.insertBlocks(parentId, index, [p])
    return this.doc.getBlockById(p.id)
  }

  private _insertBySnapshots = async (parentComp: BlockCraft.BlockComponentRef, index: number, snapshots: IBlockSnapshot[]) => {
    const snapshot2YBlock = (snapshot: IBlockSnapshot) => {
      const _children = snapshot.nodeType === BlockNodeType.editable ? snapshot.children : snapshot.children.map(childSnapshot => childSnapshot.id)
      const yBlock = native2YBlock({...snapshot, children: _children} as NativeBlockModel)
      this.yBlockMap.set(snapshot.id, yBlock)
      if (snapshot.nodeType !== BlockNodeType.editable && snapshot.children.length) {
        snapshot.children.forEach(childSnapshot => snapshot2YBlock(childSnapshot))
      }
    }
    snapshots.forEach(snapshot => snapshot2YBlock(snapshot))

    ;(parentComp.instance.yBlock.get('children') as Y.Array<string>).insert(index, snapshots.map(v => v.id))
  }

  async insertBlocks(parentId: string, index: number, snapshots: IBlockSnapshot[]) {
    if (index < 0) {
      this.doc.logger.warn(`insertBlocks: index ${index} out of range`)
      return
    }
    const parentComp = this.vm.get(parentId)
    if (!parentComp) {
      this.doc.logger.warn(`parentComp ${parentId} not found`)
      return
    }

    // 过滤不允许的blocks
    const parentSchema = this.doc.schemas.get(parentComp.instance.flavour)!
    snapshots = snapshots.filter(s => this.doc.schemas.isValidChildren(s.flavour, parentSchema))
    if (!snapshots.length) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `insertBlocks: no valid children`)
    }

    this.transact(() => {
      this._insertBySnapshots(parentComp, index, snapshots)
    })

    return new Promise((resolve => {
      const sub = this.onChildrenUpdate$.subscribe(v => {
        const inserted = v.transactions.find(v => v.block.id === parentComp.instance.id)?.inserted
        if (inserted && inserted.find(v => v.id === snapshots[snapshots.length - 1].id)) {
          sub.unsubscribe()
          resolve(inserted)
        }
      })
    }))
  }

  insertBlocksBefore(block: string | BlockCraft.BlockComponent, snapshots: IBlockSnapshot[]) {
    block = typeof block === 'string' ? this.doc.getBlockById(block) : block
    const index = block.getIndexOfParent()
    return this.insertBlocks(block.parentId!, index, snapshots)
  }

  insertBlocksAfter(block: string | BlockCraft.BlockComponent, snapshots: IBlockSnapshot[]) {
    block = typeof block === 'string' ? this.doc.getBlockById(block) : block
    const index = block.getIndexOfParent() + 1
    return this.insertBlocks(block.parentId!, index, snapshots)
  }

  async deleteBlocks(parent: string, index: number, count = 1) {
    if (index < 0) {
      this.doc.logger.warn(`insertBlocks: index ${index} out of range`)
      return
    }

    if (count === 0) return
    const parentComp = this.vm.get(parent)!
    if (index >= parentComp.instance.childrenLength) {
      this.doc.logger.warn(`deleteBlocks: index ${index} out of range`)
      return
    }
    if (index === 0 && count >= parentComp.instance.childrenLength) {
      // 确保有可输入元素
      // this.deleteBlockById(parentComp.instance.id)
      this.doc.logger.warn(`deleteBlocks: delete all children`)
      return
    }
    if (index + count > parentComp.instance.childrenLength) {
      count = parentComp.instance.childrenLength - index
    }
    this.transact(() => {
      const sliceIds = parentComp.instance.childrenIds.slice(index, index + count)
      ;(parentComp.instance.yBlock.get('children') as Y.Array<string>).delete(index, count)
      sliceIds.forEach(id => this.yBlockMap.delete(id))
    })
    return new Promise((resolve => {
      const sub = this.onChildrenUpdate$.subscribe(v => {
        const deleted = v.transactions.find(v => v.block.id === parentComp.instance.id)?.deleted
        if (deleted) {
          sub.unsubscribe()
          resolve(deleted)
        }
      })
    }))
  }

  deleteBlockById(blockId: string) {
    const block = this.doc.getBlockById(blockId)
    const index = block.getIndexOfParent()
    return this.deleteBlocks(block.parentId!, index, 1)
  }

  async replaceWithSnapshots(blockId: string, snapshots: IBlockSnapshot[]) {
    const block = this.doc.getBlockById(blockId)
    const index = block.getIndexOfParent()
    const parentId = block.parentId!
    const parentComp = this.vm.get(parentId)
    if (!parentComp) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `parentComp ${parentId} not found`)
    }
    this.transact(() => {
      const yChildren = parentComp.instance.yBlock.get('children') as Y.Array<string>
      yChildren.delete(index, 1)
      this.yBlockMap.delete(blockId)
      if (snapshots?.length) {
        this._insertBySnapshots(parentComp, index, snapshots)
      }
    })
    // TODO 条件判断优化
    return new Promise((resolve => {
      const sub = this.onChildrenUpdate$.subscribe(v => {
        const inserted = v.transactions.find(v => v.block.id === parentComp.instance.id)?.inserted
        if (inserted && inserted.find(v => v.id === snapshots[snapshots.length - 1].id)) {
          sub.unsubscribe()
          resolve(inserted)
        }
      })
    }))
  }

  moveBlocks(parentId: string, index: number, count: number, targetId: string, targetIndex: number) {
    const parentComp = this.vm.get(parentId)
    const targetComp = this.vm.get(targetId)
    if (!parentComp || !targetComp) return

    this.transact(() => {
        const sliceIds = parentComp.instance.childrenIds.slice(index, index + count)
        // const sliceComps = sliceIds.map(id => this.vm.get(id)!)
        // this.vm.remove(parentComp, index, count)
        // this.vm.insert(targetComp, targetIndex, sliceComps)
        parentComp.instance.yBlock.get('children').delete(index, count)
        ;(targetComp.instance.yBlock.get('children') as Y.Array<string>).insert(targetIndex, sliceIds)
      },
      // ORIGIN_SKIP_SYNC
    )
  }

  isCanUndo() {
    return this.yUndoManager.canUndo()
  }

  isCanRedo() {
    return this.yUndoManager.canRedo()
  }

  undo() {
    if (!this.isCanUndo() || this._undoRedoing$.value) return
    this._undoRedoing$.next(true)
    this.yUndoManager.undo()

    const last = this._undoSelectionStack.pop()
    if (last === undefined) return
    this._redoSelectionStack.push(last)

    this._replaySelectionAfterUndoRedo(last)
  }

  redo() {
    if (!this.isCanRedo() || this._undoRedoing$.value) return
    this._undoRedoing$.next(true)
    this.yUndoManager.redo()

    const last = this._redoSelectionStack.pop()
    if (last === undefined) return
    this._undoSelectionStack.push(last)

    this._replaySelectionAfterUndoRedo(last)
  }

  private _replaySelectionAfterUndoRedo(selection: IBlockSelectionJSON | null) {
    this._undoRedoing$.pipe(take(1)).subscribe(() => {
      nextTick().then(() => {
        try {
          this.doc.selection.replay(selection)
        } catch (e) {
          this.doc.selection.recalculate()
          this.doc.logger.warn('UNDO时选区出现问题')
        }
      })
    })
  }

  clearHistory() {
    this.yUndoManager.clear()
    this._undoSelectionStack = []
    this._redoSelectionStack = []
  }

}
