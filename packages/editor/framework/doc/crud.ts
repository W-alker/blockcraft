import {
  BlockNodeType,
  DeltaInsert,
  DeltaOperation, EditableBlockComponent,
  IBlockProps,
  IBlockSnapshot,
  InlineModel,
  YBlock, yBlock2Native
} from "../block-std";
import * as Y from "yjs";
import {BlockCraftError, ErrorCode} from "../../global";
import {Subject} from "rxjs";
import {isYArray, isYText} from "../utils/yAbstractType";
import {DocUndoManger} from "./undoManger";
import {ChildrenRepairer} from "./children-repair";
import {IRemoteDocSyncLifecycleEvent} from "./sync-lifecycle";

// ORIGIN_* 已抽到零依赖叶子文件 ./origins（避免 base-block/reactive 经 doc barrel 成环）。
// 这里 import 供 crud 内部使用，并 re-export 以保持 `export * from './crud'` 的公共导出面不变。
import {
  ORIGIN_BLOCK_READONLY_CONTROL,
  ORIGIN_SKIP_SYNC,
  ORIGIN_NO_RECORD,
  ORIGIN_READONLY_VIEW_PROJECTION,
  ORIGIN_SYSTEM_REPAIR,
} from "./origins";
import {BlockReadonlyOperation} from "./block-readonly.types";
import {writeSnapshotsToYBlockMap} from './snapshot-yblock'
export {
  ORIGIN_BLOCK_READONLY_CONTROL,
  ORIGIN_SKIP_SYNC,
  ORIGIN_NO_RECORD,
  ORIGIN_SYSTEM_REPAIR,
};

export interface ITextChangeEvent {
  isUndoRedo: boolean,
  origin: any,
  local: boolean
  transactions: {
    block: EditableBlockComponent
    delta: DeltaOperation[]
  }[]
}

export interface IChildrenChangeEvent {
  isUndoRedo: boolean,
  origin: any
  local: boolean
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
  origin: any,
  local: boolean
  transactions: {
    block: BlockCraft.BlockComponent
    changes: Map<string, {
      oldValue: any
      action: "add" | "update" | "delete"
    }>
  }[]
}

export interface IMetaChangeEvent {
  isUndoRedo: boolean
  origin: unknown
  local: boolean
  transactions: {
    blockId: string
    changes: Map<string, {
      oldValue: unknown
      action: "add" | "update" | "delete"
    }>
  }[]
}

type BlockDeleteRange = {
  index: number,
  length: number
}

type DeferredChildrenUpdate = {
  parent: BlockCraft.BlockComponentRef
  deltas: Y.YEvent<Y.Array<string>>['changes']['delta']
  previousIds: readonly string[]
  desiredIds: readonly string[]
}

export class DocCRUD {

  undoManager!: DocUndoManger
  readonly onChildrenUpdate$ = new Subject<IChildrenChangeEvent>()
  readonly onPropsUpdate$ = new Subject<IPropsChangeEvent>()
  readonly onTextUpdate$ = new Subject<ITextChangeEvent>()
  readonly onMetaUpdate$ = new Subject<IMetaChangeEvent>()
  private readonly _remoteSyncLifecycle$ = new Subject<IRemoteDocSyncLifecycleEvent>()
  /** @internal Selection-domain hook around remote model-to-view synchronization. */
  readonly remoteSyncLifecycle$ = this._remoteSyncLifecycle$.asObservable()

  // 保存 observer 引用，doc 销毁时需要 unobserveDeep；否则若宿主复用 yDoc，observer 会堆积
  private _yObserverHandler: ((events: Y.YEvent<any>[], tr: Y.Transaction) => void) | null = null

  // 远端 CRDT 合并可能让同一 block ID 重复出现（同父两次 / 跨父两处），仅远端事务触发检测
  private _childrenRepairer!: ChildrenRepairer

  get yDoc() {
    return this.doc.yDoc
  }

  get yBlockMap() {
    return this.doc.yBlockMap
  }

  constructor(
    private readonly doc: BlockCraft.Doc
  ) {
    // 早于 afterInit 构造：ChildrenRepairer 构造函数只允许保存 doc 引用，
    // 不得访问 doc.vm / doc.schemas 等 afterInit 之后才就绪的属性
    this._childrenRepairer = new ChildrenRepairer(
      doc,
      (owners, affectedParentIds) => {
        this._settleRepairedChildrenViews(owners, affectedParentIds)
      },
    )
    this.doc.afterInit(() => {

      const revisionMap = this.doc.revisions?.yRevisionMap
      this.undoManager = new DocUndoManger(
        this.doc,
        revisionMap ? [this.yBlockMap, revisionMap] : this.yBlockMap,
      )

      // 注：children 完整性修复已前移到 initByYBlock 构建组件树【之前】执行
      // （见 repairChildRefsOnLoad）。afterInit 在构建之后，此处再修会让删除的
      // 模型下标 splice 到已错位的 _compRefs，故不在这里做。

      this._yObserverHandler = (evt, tr) => {
        this.doc.ngZone.run(() => {
          const affectedBlockIds = tr.local ? null : this._collectAffectedBlockIds(evt)
          if (affectedBlockIds) {
            this._remoteSyncLifecycle$.next({
              phase: 'before-view-sync',
              transaction: tr,
              origin: tr.origin,
              isUndoRedo: tr.origin instanceof Y.UndoManager,
              affectedBlockIds,
            })
          }
          this._syncYEvent(evt, tr)
          if (affectedBlockIds) {
            this._remoteSyncLifecycle$.next({
              phase: 'after-view-sync',
              transaction: tr,
              origin: tr.origin,
              isUndoRedo: tr.origin instanceof Y.UndoManager,
              affectedBlockIds,
            })
          }
        })
      }
      this.yBlockMap.observeDeep(this._yObserverHandler)
    })

    this.doc.onDestroy(() => {
      if (this._yObserverHandler) {
        this.yBlockMap.unobserveDeep(this._yObserverHandler)
        this._yObserverHandler = null
      }
      this._remoteSyncLifecycle$.complete()
    })
  }

  get vm() {
    return this.doc.vm
  }

  getYBlock(id: string) {
    return this.yBlockMap.get(id)
  }

  /**
   * 「遇到才兜底」剪除初始加载时实际遇到的悬空 child 引用（refs 由
   * createComponentByYBlocks 在构建中收集）。必须在构建之后、observer 挂载之前
   * 调用（见 initByYBlock）：修正因跳过悬空 child 造成的 _compRefs 长度错位，
   * 且不触发按模型下标 splice 的视图同步。干净文档不会有 refs，零开销。
   */
  pruneChildRefs(refs: ReadonlyArray<{ parentId: string, childId: string }>) {
    this._childrenRepairer.pruneRefs(refs)
  }

  transact(fn: () => void, origin: any = null) {
    const runInternalMutation = this.doc.readonlyManager?.runSystemRepair
    if (
      (origin === ORIGIN_SYSTEM_REPAIR || origin === ORIGIN_READONLY_VIEW_PROJECTION) &&
      typeof runInternalMutation === 'function'
    ) {
      return runInternalMutation.call(
        this.doc.readonlyManager,
        () => this.yDoc.transact(fn, origin),
      )
    }
    return this.yDoc.transact(fn, origin)
  }

  updateBlockProps(blockId: string, props: Partial<IBlockProps>): void {
    const yBlock = this.doc.model.getYBlock(blockId)
    if (!yBlock) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `Block not found: ${blockId}`)
    }
    const yProps = yBlock.get('props')
    if (!(yProps instanceof Y.Map)) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `Invalid block props: ${blockId}`)
    }
    const changedKeys = Object.keys(props).filter(key => {
      const next = props[key]
      return next === null ? yProps.has(key) : yProps.get(key) !== next
    })
    if (!changedKeys.length) return

    this.doc.readonlyManager.assertPropsWritable(blockId, BlockReadonlyOperation.Props)
    this.transact(() => {
      changedKeys.forEach(key => {
        const next = props[key]
        if (next === null) {
          yProps.delete(key)
        } else {
          yProps.set(key, next)
        }
      })
    })
  }

  replaceText(
    blockId: string,
    index: number,
    length: number,
    text?: string | null,
    attributes?: DeltaInsert['attributes'],
  ): void {
    if (length <= 0 && !text) return
    const yText = this._getEditableYText(blockId)
    this.doc.readonlyManager.assertTextWritable(blockId, BlockReadonlyOperation.Replace)
    if (this.doc.revisions?.isTracking) {
      this.doc.revisions.replaceText(blockId, index, length, text, attributes)
      return
    }
    const delta: DeltaOperation[] = []
    if (index > 0) delta.push({retain: index})
    if (length > 0) delta.push({delete: length})
    if (text) delta.push({insert: text, attributes})
    this.transact(() => yText.applyDelta(delta))
  }

  applyTextDelta(blockId: string, delta: DeltaOperation[]): void {
    if (!delta.length) return
    const yText = this._getEditableYText(blockId)
    this.doc.readonlyManager.assertTextWritable(blockId, BlockReadonlyOperation.Text)
    if (this.doc.revisions?.isTracking) {
      this.doc.revisions.applyDelta(blockId, delta)
      return
    }
    this.transact(() => yText.applyDelta(delta))
  }

  formatText(
    blockId: string,
    index: number,
    length: number,
    attributes: DeltaInsert['attributes'],
  ): void {
    if (!length || !Object.keys(attributes ?? {}).length) return
    const yText = this._getEditableYText(blockId)
    this.doc.readonlyManager.assertTextWritable(blockId, BlockReadonlyOperation.Format)
    this.transact(() => yText.format(index, length, attributes as Record<string, unknown>))
  }

  private _getEditableYText(blockId: string): Y.Text {
    const yBlock = this.doc.model.getYBlock(blockId)
    if (!yBlock || yBlock.get('nodeType') !== BlockNodeType.editable) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `Editable block not found: ${blockId}`)
    }
    const children = yBlock.get('children')
    if (!(children instanceof Y.Text)) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `Invalid editable block text: ${blockId}`)
    }
    return children
  }

  /**
   * 采集一次远端事务里被改动的 block id 集合。
   * - 顶层 map 增删：变更的 key 即 block id（yBlockMap 以 id 扁平存储 block）
   * - 嵌套改动（props / meta / children / text）：path[0] 即所属 block id
   */
  private _collectAffectedBlockIds(events: Y.YEvent<any>[]): Set<string> {
    const ids = new Set<string>()
    for (const ev of events) {
      if (!ev.path.length) {
        ev.changes.keys.forEach((_change, key) => ids.add(key))
      } else {
        ids.add(ev.path[0] as string)
      }
    }
    return ids
  }

  private _syncYEvent = (events: Y.YEvent<any>[], tr: Y.Transaction) => {
    // local change with skip
    const isUndoRedo = tr.origin instanceof Y.UndoManager

    const added: Record<string, YBlock> = {}
    const deleted = new Set<string>()

    const propsChanges: IPropsChangeEvent['transactions'] = []
    const textChanges: ITextChangeEvent['transactions'] = []
    const metaChanges: IMetaChangeEvent['transactions'] = []

    const delay_childrenEvent_handlers: DeferredChildrenUpdate[] = []
    const insertedParentById = new Map<string, string | null>()
    const changedChildrenParentIds = new Set<string>()
    const repairCandidateInsertedIds = new Set<string>()

    // sync to model
    const processEvent = (ev: Y.YEvent<any>) => {
      const {path, changes, target} = ev
      // at top level, it`s mean that block is created or deleted
      // No need handle ORIGIN_SKIP_SYNC
      if (!path.length) {
        changes.keys.forEach((change, key) => {
          changedChildrenParentIds.add(key)
          if (tr.local || change.action === 'delete') return
          const children = this.getYBlock(key)?.get('children')
          if (!children || !isYArray(children)) return
          children.toArray().forEach(id => repairCandidateInsertedIds.add(id))
        })
        tr.origin !== ORIGIN_SKIP_SYNC && changes.keys.forEach((change, key) => {
          if (change.action === 'delete') {
            deleted.add(key)
            return
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
      if (keyProp === 'children' && isYArray(target)) {
        changedChildrenParentIds.add(blockId)
        changes.delta.forEach(change => {
          if (!change.insert) return
          ;(change.insert as string[]).forEach(id => {
            if (!tr.local) repairCandidateInsertedIds.add(id)
            if (tr.origin === ORIGIN_SKIP_SYNC) return
            if (!insertedParentById.has(id)) {
              insertedParentById.set(id, blockId)
            } else if (insertedParentById.get(id) !== blockId) {
              // Concurrent duplicate parents are resolved by ChildrenRepairer.
              // Do not choose an arbitrary view owner before that repair lands.
              insertedParentById.set(id, null)
            }
          })
        })
      }
      if (keyProp === 'meta') {
        metaChanges.push({
          blockId,
          changes: changes.keys,
        })
      }
      if (keyProp === 'props' && changes.keys.has('psb')) {
        // Paragraph-before is projected as the previous sibling's effective
        // margin-bottom. Its own border-box does not resize, so explicitly
        // refresh the mounted spacing owner when this value changes.
        const previousId = this.doc.model.getPreviousSiblingId(blockId)
        const previous = previousId ? this.vm.get(previousId) : null
        if (previous && !previous.hostView.destroyed) {
          Promise.resolve().then(() => {
            if (!previous.hostView.destroyed) {
              previous.instance.changeDetectorRef.markForCheck()
            }
          })
        }
      }
      const bm = this.vm.get(blockId)
      if (!bm) {
        // Virtualized blocks may be structurally live without a component.
        // Yjs and BlockModelGraph already own the mutation; the view will be
        // rebuilt from the current model when the block is mounted.
        return
      }

      if (keyProp === "children") {
        if (isYArray(target)) {
          const previousIds = [...bm.instance.childrenIds]
          const desiredIds = (!tr.local || isUndoRedo || tr.origin === ORIGIN_SYSTEM_REPAIR)
            ? this.doc.model.getChildrenIds(blockId)
            : target.toArray()
          this._markParagraphSpacingStructureOwners(
            previousIds,
            desiredIds,
            changes.delta,
          )
          if (tr.origin !== ORIGIN_SKIP_SYNC) {
            changes.delta.forEach(change => {
              if (change.insert) {
                (change.insert as string[]).forEach(id => {
                  added[id] = this.getYBlock(id)!
                })
              }
            })

            delay_childrenEvent_handlers.push({
              parent: bm,
              deltas: changes.delta,
              previousIds,
              desiredIds,
            })
          }

          // @ts-expect-error
          bm.instance._childrenIds = [...desiredIds]
        } else if (isYText(target)) {

          if (!this.doc.isEditable(bm.instance))
            throw new BlockCraftError(ErrorCode.SyncYEventError, `Block ${blockId} is not editable`)
          // Y.Text
          if (tr.origin !== ORIGIN_SKIP_SYNC) {
            // Defer remote patches for blocks currently in IME composition
            if (!tr.local && this.doc.inputManger.compositionSession.shouldDeferPatch(blockId)) {
              this.doc.inputManger.compositionSession.deferPatch(blockId, changes.delta as DeltaOperation[])
            } else {
              try {
                // @ts-expect-error accessing protected method
                bm.instance._applyDeltaToView(changes.delta as DeltaOperation[])
              } catch (e) {
                this.doc.logger.warn('applyDeltaToView error;blockId:' + blockId, e)
                bm.instance.rerender()
              }
            }
          }
          bm.instance.onTextChange.next({op: changes.delta as DeltaOperation[], tr})
          textChanges.push({
            block: bm.instance,
            delta: changes.delta as DeltaOperation[]
          })

        }
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
          // 微任务可能晚于 vm.destroy 触发；bm.hostView.destroyed 为 true 时直接跳过，避免访问已销毁视图
          if (bm.hostView.destroyed) return
          bm.instance.changeDetectorRef.markForCheck()
          bm.instance.onPropsChange.emit(changes.keys as any)
        })
      }

      propKey === 'props' && propsChanges.push({
        block: bm.instance,
        changes: changes.keys
      })
    }

    // 逐事件隔离：单个坏事件（如目标块组件缺失）只跳过自身，
    // 不中断同一事务批次里的后续事件——否则一个异常会让批内其余
    // 远端变更全部丢失且无自愈机会
    events.forEach(ev => {
      try {
        processEvent(ev)
      } catch (e) {
        this.doc.logger.warn('syncYEvent: skip broken event, path=' + JSON.stringify(ev.path), e)
      }
    })

    if (propsChanges.length) {
      this.onPropsUpdate$.next({
        isUndoRedo,
        origin: tr.origin,
        transactions: propsChanges,
        local: tr.local
      })

      propsChanges.forEach(v => {
        v.block.onPropsChange.emit(v.changes as any)
      })
    }

    if (textChanges.length) {
      this.onTextUpdate$.next({
        isUndoRedo,
        origin: tr.origin,
        transactions: textChanges,
        local: tr.local
      })
    }

    if (metaChanges.length) {
      this.onMetaUpdate$.next({
        isUndoRedo,
        origin: tr.origin,
        transactions: metaChanges,
        local: tr.local,
      })
    }

    const ambiguousInsertedIds = this._childrenRepairer.noteStructureChanges(
      changedChildrenParentIds,
      repairCandidateInsertedIds,
      deleted,
      !tr.local || isUndoRedo,
    )
    ambiguousInsertedIds.forEach(id => {
      if (insertedParentById.has(id)) insertedParentById.set(id, null)
    })

    // A top-level YBlock deletion can arrive without a matching mounted-parent
    // children event (for example a merged delete versus move). Component and
    // IME cleanup must therefore not depend on the delayed children path.
    if (deleted.size) {
      this.vm.deleteByIds([...deleted])
      this.doc.inputManger?.compositionSession?.handleBlocksDeleted(deleted)
    }

    if (delay_childrenEvent_handlers.length) {
      this._syncYBlockChildrenUpdate(
        added,
        deleted,
        delay_childrenEvent_handlers,
        insertedParentById,
        tr,
      )
    } else if (insertedParentById.size) {
      this._settleInsertedComponentOwnership(insertedParentById)
    }

    this.undoManager.undoRedoing$.value && this.undoManager.undoRedoing$.next(false)
  }

  private _settleRepairedChildrenViews(
    owners: ReadonlyMap<string, string>,
    affectedParentIds: ReadonlySet<string>,
  ): void {
    this._reconcileParentViewsFromModel(affectedParentIds)
    this._settleInsertedComponentOwnership(owners)
  }

  /**
   * A sibling insertion/removal can change the preceding block's projected
   * `--bc-next-block-sb` without resizing that block. Refresh only the delta
   * boundaries rather than scanning every child in a large virtualized root.
   */
  private _markParagraphSpacingStructureOwners(
    previousIds: readonly string[],
    desiredIds: readonly string[],
    delta: ReadonlyArray<{retain?: number; delete?: number; insert?: unknown}>,
  ): void {
    const ids = new Set<string>()
    const add = (id: string | undefined) => id && ids.add(id)
    add(previousIds[0])
    add(desiredIds[0])

    let previousIndex = 0
    let desiredIndex = 0
    delta.forEach(change => {
      if (change.retain) {
        previousIndex += change.retain
        desiredIndex += change.retain
      }
      if (change.delete) {
        add(previousIds[previousIndex - 1])
        add(previousIds[previousIndex + change.delete])
        add(desiredIds[desiredIndex - 1])
        add(desiredIds[desiredIndex])
        previousIndex += change.delete
      }
      if (change.insert) {
        const insertedLength = Array.isArray(change.insert)
          ? change.insert.length
          : 1
        add(previousIds[previousIndex - 1])
        add(previousIds[previousIndex])
        add(desiredIds[desiredIndex - 1])
        add(desiredIds[desiredIndex])
        add(desiredIds[desiredIndex + insertedLength - 1])
        add(desiredIds[desiredIndex + insertedLength])
        desiredIndex += insertedLength
      }
    })

    Promise.resolve().then(() => {
      ids.forEach(id => {
        const ref = this.vm.get(id)
        if (ref && !ref.hostView.destroyed) {
          ref.instance.changeDetectorRef.markForCheck()
        }
      })
    })
  }

  /**
   * Rebuild only mounted parents touched by a corruption repair from the
   * canonical model projection. This is a cold recovery path; ordinary
   * structural events continue to use their incremental Y.Array delta.
   */
  private _reconcileParentViewsFromModel(parentIds: Iterable<string>): void {
    const parents: Array<{
      ref: BlockCraft.BlockComponentRef
      desiredIds: readonly string[]
    }> = []

    for (const parentId of new Set(parentIds)) {
      const parent = this.vm.get(parentId)
      const renderRef = parent?.instance.childrenRenderRef
      if (!parent || !renderRef) continue
      const desiredIds = this.doc.model.getChildrenIds(parentId)

      // Sparse root stores only mounted children, so its projection is updated
      // by the VM without densifying the document.
      if (this.vm.usesSparseRoot && parentId === this.doc.rootId) {
        this.vm._reconcileSparseRootChildren(desiredIds)
        continue
      }

      const current = renderRef.splice(0, renderRef.length)
      current.forEach(component => component.instance.hostElement.remove())
      // @ts-expect-error internal model projection maintained by DocCRUD
      parent.instance._childrenIds = [...desiredIds]
      parents.push({ref: parent, desiredIds})
    }

    // Remove every affected parent first. A single ComponentRef can be present
    // in two stale render lists during a cross-parent conflict; inserting the
    // winner before removing the loser would let the loser remove the moved DOM.
    for (const {ref: parent, desiredIds} of parents) {
      const components = desiredIds.map(id => {
        const existing = this.vm.get(id)
        if (existing) return existing
        const yBlock = this.doc.model.getYBlock(id)
        if (!yBlock) return null
        return this.vm.createComponentByYBlocks({[id]: yBlock})[id] ?? null
      }).filter((component): component is BlockCraft.BlockComponentRef => !!component)
      if (components.length) this.vm.insert(parent, 0, components)
    }
  }

  private _settleInsertedComponentOwnership(
    insertedParentById: ReadonlyMap<string, string | null>,
  ): void {
    if (!this.vm.usesSparseRoot) return

    const deferredEvictions: {id: string, parentId: string}[] = []
    insertedParentById.forEach((parentId, id) => {
      if (!parentId || !this.vm.get(id)) return
      if (parentId === this.doc.rootId) {
        if (this.vm.isDeferredSparseRootChild?.(id)) return
        this.vm.retainRootChild(id)
        return
      }
      if (this.vm.get(parentId)) return

      const component = this.vm.get(id)!
      component.instance.hostElement.remove()
      component.instance.parentId = parentId
      this.vm.retainComponentSubtree(component)
      deferredEvictions.push({id, parentId})
    })

    if (!deferredEvictions.length) return
    Promise.resolve().then(() => {
      deferredEvictions.forEach(({id, parentId}) => {
        const component = this.vm.get(id)
        if (!component || component.instance.parentId !== parentId) return
        // A model observer may synchronously mount a leased/keep-alive target
        // after CRUD view sync. Preserve the adopted component in that case;
        // otherwise release the one-transaction orphan so the LRU stays bounded.
        if (this.vm.get(parentId)) return
        this.vm.destroy(id)
      })
    })
  }

  private _syncYBlockChildrenUpdate = (added: Record<string, YBlock>,
                                       deleted: Set<string>,
                                       events: DeferredChildrenUpdate[],
                                       insertedParentById: ReadonlyMap<string, string | null>,
                                       tr: Y.Transaction) => {
    const emitEvents: IChildrenChangeEvent = {
      isUndoRedo: tr.origin instanceof Y.UndoManager,
      local: tr.local,
      origin: tr.origin,
      transactions: [],
    }
    events.forEach(({parent: bm, deltas, previousIds, desiredIds}) => {
      const parentId = bm.instance.id
      // The top-level delete pass runs before these delayed child deltas. Undo
      // can delete a temporary container while moving its children back to a
      // surviving parent in the same transaction, leaving this event with a
      // destroyed ComponentRef. The canonical destination event owns the view.
      if (
        deleted.has(parentId) ||
        !this.doc.model.exists(parentId) ||
        this.vm.get(parentId) !== bm
      ) return

      const _delay_inserts: [number, BlockCraft.BlockComponentRef[]][] = []
      const deletedMap: { index: number, length: number }[] = []
      const isSparseRootEvent = this.vm.usesSparseRoot && bm.instance.id === this.doc.rootId
      const projectedIds = this._projectChildrenIds(previousIds, deltas)
      const denseViewMatchesPrevious = isSparseRootEvent ||
        this._sameIds(bm.instance.childrenRenderRef?.ids ?? [], previousIds)

      // Raw Yjs can temporarily contain a duplicate/missing edge that the model
      // graph deliberately rejected. Applying that raw delta to the component
      // list would create an unreachable component or splice the wrong sibling.
      if (!denseViewMatchesPrevious || !this._sameIds(projectedIds, desiredIds)) {
        if (isSparseRootEvent) {
          this.vm._reconcileSparseRootChildren(desiredIds)
        } else {
          this._reconcileParentViewsFromModel([bm.instance.id])
        }
        bm.instance.onChildrenChange?.(deltas)
        emitEvents.transactions.push({block: bm.instance})
        return
      }

      if (isSparseRootEvent) {
        this.vm.applySparseRootChildrenDelta(deltas, {
          desiredIds,
          preserveIds: this._composingSparseRootMoveIds(previousIds, desiredIds),
        })
      }

      let r = 0
      deltas.forEach(d => {
        if (d.retain) {
          r += d.retain
        } else if (d.insert) {
          if (isSparseRootEvent) {
            r += d.insert.length
            return
          }
          // 所有的插入操作需要延迟执行
          const insertedBlocks = Object.fromEntries(
            (d.insert as string[])
              .map(id => [id, added[id] || this.doc.model.getYBlock(id)] as const)
              .filter((entry): entry is readonly [string, YBlock] =>
                !!entry[1] && this.doc.model.getParentId(entry[0]) === bm.instance.id,
              ),
          )
          const childComps = this.vm.createComponentByYBlocks(insertedBlocks)
          const _insertComps = (d.insert as string[])
            .map(id => childComps[id] || this.vm.get(id))
            .filter((component): component is BlockCraft.BlockComponentRef => !!component)
          _delay_inserts.push([r, _insertComps])
          this.vm.insert(bm, r, _insertComps)
          if (!this.vm.isMounted(bm.instance.id)) {
            _insertComps.forEach(component => this.vm.retainComponentSubtree(component))
          }
          r += _insertComps.length
        } else if (d.delete) {
          if (isSparseRootEvent) {
            deletedMap.push({index: r, length: d.delete})
            return
          }
          // 有可能是被移动的元素，此时是不需要销毁再重建的
          const cps = bm.instance.childrenRenderRef!.splice(r, d.delete)
          cps.forEach(c => {
            if (deleted.has(c.instance.id)) {
              this.vm.destroy(c.instance.id)
            }
          })
          deletedMap.push({index: r, length: <number>d.delete})
        }
      })

      bm.instance.onChildrenChange?.(deltas)
      emitEvents.transactions.push({
        block: bm.instance,
        deleted: deletedMap.length ? deletedMap : undefined,
        inserted: _delay_inserts.map(v => v[1].map(v => v.instance)).flat()
      })
    })

    // A move into sparse root has no eager root insertion view step. Wait until
    // every parent delta is applied, then synchronously release any cached
    // component from its old container before observers restore selection or
    // schedule virtualization. A later mount reuses the retained component.
    this._settleInsertedComponentOwnership(insertedParentById)

    this.onChildrenUpdate$.next(emitEvents)

  }

  private _composingSparseRootMoveIds(
    previousIds: readonly string[],
    desiredIds: readonly string[],
  ): ReadonlySet<string> {
    if (!this.doc.event?.status?.isComposing) return new Set()
    const session = this.doc.inputManger?.compositionSession
    const activeBlockId = session?.isActive ? session.activeBlockId : null
    if (!activeBlockId) return new Set()

    let path: readonly string[] | null = null
    try {
      path = this.doc.model.getPath(activeBlockId)
    } catch {
      return new Set()
    }
    const rootUnitId = path?.[0] === this.doc.rootId ? path[1] : null
    if (!rootUnitId) return new Set()
    const previousIndex = previousIds.indexOf(rootUnitId)
    const desiredIndex = desiredIds.indexOf(rootUnitId)
    return previousIndex >= 0 && desiredIndex >= 0 && previousIndex !== desiredIndex
      ? new Set([rootUnitId])
      : new Set()
  }

  private _projectChildrenIds(
    previousIds: readonly string[],
    deltas: Y.YEvent<Y.Array<string>>['changes']['delta'],
  ): string[] {
    const projected = [...previousIds]
    let index = 0
    deltas.forEach(delta => {
      if (delta.retain) {
        index += delta.retain
      } else if (delta.insert) {
        const ids = delta.insert as string[]
        projected.splice(index, 0, ...ids)
        index += ids.length
      } else if (delta.delete) {
        projected.splice(index, delta.delete)
      }
    })
    return projected
  }

  private _sameIds(a: readonly string[], b: readonly string[]): boolean {
    return a.length === b.length && a.every((id, index) => id === b[index])
  }

  getFlatIds = (blockIds: string[]) => {
    const flatIds: string[] = blockIds.slice()
    const flat = (ids: string[]) => {
      ids.forEach(id => {
        const target = this.yBlockMap.get(id)?.get('children')
        if (target && isYArray(target)) {
          const _bIds = target.toArray()
          flatIds.push(..._bIds)
          flat(_bIds)
        }
      })
    }
    flat(blockIds)
    return flatIds
  }

  insertNewParagraph(parentId: string, index: number, content: string | InlineModel = ''): BlockCraft.BlockComponent {
    const op = typeof content === 'string' ? [{insert: content}] : content
    const p = this.doc.schemas.createSnapshot('paragraph', [op])
    this.insertBlocks(parentId, index, [p])
    return this.doc.getBlockById(p.id)
  }

  private _resolveInsertedBlocks = (snapshots: IBlockSnapshot[]): BlockCraft.BlockComponent[] => {
    return snapshots
      .map(snapshot => this.vm.get(snapshot.id)?.instance)
      .filter((block): block is BlockCraft.BlockComponent => !!block)
  }

  private _insertBySnapshots = (parentYBlock: YBlock, index: number, snapshots: IBlockSnapshot[]) => {
    const children = parentYBlock.get('children')
    if (!isYArray(children)) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `Block ${parentYBlock.get('id')} cannot contain block children`)
    }
    writeSnapshotsToYBlockMap(this.yBlockMap, snapshots)
    children.insert(index, snapshots.map(v => v.id))
  }

  private _readYBlockMeta(yBlock: YBlock): Record<string, unknown> {
    const meta = yBlock.get('meta')
    return meta instanceof Y.Map
      ? meta.toJSON() as Record<string, unknown>
      : {}
  }

  /**
   * Validate opt-in instance constraints inside a detached snapshot tree.
   * Existing Schema-only trees retain their historical compatibility; only
   * containers that explicitly opt into instance constraints are inspected.
   */
  private _isSnapshotInstanceTreeValid(snapshot: IBlockSnapshot): boolean {
    if (
      snapshot.nodeType !== BlockNodeType.block &&
      snapshot.nodeType !== BlockNodeType.root
    ) {
      return true
    }

    const schema = this.doc.schemas.get(snapshot.flavour)
    if (!schema) return false
    if (schema.metadata.instanceMeta?.childConstraints) {
      for (const child of snapshot.children) {
        if (!this.doc.schemas.isValidChildrenForInstance(
          child.flavour,
          schema,
          snapshot.meta,
        )) {
          return false
        }
      }
    }

    return snapshot.children.every(child =>
      this._isSnapshotInstanceTreeValid(child),
    )
  }

  private _isSnapshotAllowedInParent(
    parentYBlock: YBlock,
    snapshot: IBlockSnapshot,
  ): boolean {
    const parentSchema = this.doc.schemas.get(parentYBlock.get('flavour'))!
    return this.doc.schemas.isValidChildrenForInstance(
      snapshot.flavour,
      parentSchema,
      this._readYBlockMeta(parentYBlock),
    ) && this._isSnapshotInstanceTreeValid(snapshot)
  }

  /** Insert snapshots through the model layer and return IDs without resolving component views. */
  insertBlockSnapshots(parentId: string, index: number, snapshots: IBlockSnapshot[]): string[] {
    if (!snapshots.length) return []
    if (index < 0) {
      this.doc.logger.warn(`insertBlocks: index ${index} out of range`)
      return []
    }
    // The target may have been created earlier in the caller's outer Yjs
    // transaction and not be reachable from BlockModelGraph yet.
    const parentYBlock = this.getYBlock(parentId)
    if (!parentYBlock) {
      this.doc.logger.warn(`parent block ${parentId} not found`)
      return []
    }
    if (!isYArray(parentYBlock.get('children'))) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `Block ${parentId} cannot contain block children`)
    }
    this.doc.readonlyManager.assertInsertable(parentId, BlockReadonlyOperation.Insert)

    const parentSchema = this.doc.schemas.get(parentYBlock.get('flavour'))!
    const validSnapshots = snapshots.filter(snapshot =>
      this._isSnapshotAllowedInParent(parentYBlock, snapshot),
    )
    if (!validSnapshots.length) {
      if (snapshots.length === 1) {
        const snapshot = snapshots[0]
        const schema = this.doc.schemas.get(snapshot.flavour)
        if (schema) {
          this.doc.messageService.warn(`不允许将 ${schema.metadata.label} 插入到 ${parentSchema.metadata.label} 中`)
        }
      }
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `insertBlocks: no valid children`)
    }
    if (snapshots.length > validSnapshots.length) {
      this.doc.messageService.warn(`已过滤该位置不允许的内容块`)
    }

    this.transact(() => {
      this._insertBySnapshots(parentYBlock, index, validSnapshots)
      this.doc.revisions?.recordBlockInsertion(
        validSnapshots.map(snapshot => snapshot.id),
        parentId,
      )
    })
    return validSnapshots.map(snapshot => snapshot.id)
  }

  insertBlocks(parentId: string, index: number, snapshots: IBlockSnapshot[]): BlockCraft.BlockComponent[] {
    if (!snapshots.length) return []
    if (index < 0) {
      this.doc.logger.warn(`insertBlocks: index ${index} out of range`)
      return []
    }
    const parentComp = this.vm.get(parentId)
    if (!parentComp) {
      this.doc.logger.warn(`parentComp ${parentId} not found`)
      return []
    }
    const insertedIds = this.insertBlockSnapshots(parentId, index, snapshots)

    if (this.vm.usesSparseRoot && parentId === this.doc.rootId) {
      if (insertedIds.some(id => !this.doc.model.exists(id))) {
        this.doc.model.synchronizeParentBeforeView(parentId)
      }
      insertedIds.forEach(id => this.vm.ensureRootChildComponent(id))
    }

    return insertedIds
      .map(id => this.vm.get(id)?.instance)
      .filter((block): block is BlockCraft.BlockComponent => !!block)
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

  private _delete = (parentYBlock: YBlock, index: number, count = 1) => {
    const children = parentYBlock.get('children')
    if (!isYArray(children)) {
      throw new BlockCraftError(
        ErrorCode.ModelCRUDError,
        `Block ${parentYBlock.get('id')} cannot contain block children`,
      )
    }
    const sliceIds = children.toArray().slice(index, index + count)
    const flatIds = this.getFlatIds(sliceIds)
    flatIds.forEach(id => {
      this.yBlockMap.delete(id)
    })
    children.delete(index, count)
  }

  deleteBlocks(parent: string, index: number, count = 1, force = false): BlockDeleteRange[] {
    if (index < 0) {
      this.doc.logger.warn(`deleteBlocks: index ${index} out of range`)
      return []
    }

    if (count === 0) return []
    const parentYBlock = this.getYBlock(parent)
    if (!parentYBlock) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `Parent block not found: ${parent}`)
    }
    const children = parentYBlock.get('children')
    if (!isYArray(children)) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `Block ${parent} cannot contain block children`)
    }
    if (index >= children.length) {
      this.doc.logger.warn(`deleteBlocks: index ${index} out of range`)
      return []
    }

    if (index + count > children.length) {
      count = children.length - index
    }
    // Guard the exact range `_delete()` will consume. During a compound local
    // transaction the ModelGraph observer can still expose the previous sibling
    // list, while the mounted parent/Y.Array has already advanced to the next
    // step. Reading the stale model index here can re-check an id deleted by the
    // preceding step and raise `Block not found` halfway through the operation.
    const removableIds = children.toArray().slice(index, index + count)
    this.doc.mutationPolicy?.assert({
      operation: 'delete',
      blockIds: removableIds,
      parentId: parent,
    })
    this.doc.readonlyManager.assertRemovable(removableIds, BlockReadonlyOperation.Delete)

    if (this.doc.revisions?.isTracking) {
      this.undoManager?.captureSelectionBeforeChange?.()
      this.transact(() => {
        this.doc.revisions.recordBlockDeletion(removableIds, parent)
      })
      return [{index, length: removableIds.length}]
    }

    if (index === 0 && count >= children.length && !force) {
      const parentSchema = this.doc.schemas.get(parentYBlock.get('flavour'))!
      if (parentSchema.metadata.allowEmptyChildren) {
        const deletedLength = children.length
        this.transact(() => {
          this._delete(parentYBlock, index, deletedLength)
        })
        return [{index, length: deletedLength}]
      }
      // 如果父元素并非是可渲染任意块的元素
      if (!parentSchema.metadata.renderUnit) {
        return this.deleteBlockById(parent)
      }

      const deletedLength = children.length
      const p = this.doc.schemas.createSnapshot('paragraph', [])
      this.transact(() => {
        this._delete(parentYBlock, index, deletedLength)
        this._insertBySnapshots(parentYBlock, 0, [p])
      })
      return [{index, length: deletedLength}]
    }

    this.transact(() => {
      this._delete(parentYBlock, index, count)
    })
    return [{index, length: count}]
  }

  deleteBlockById(blockId: string): BlockDeleteRange[] {
    if (!this.doc.model.exists(blockId)) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `Block not found: ${blockId}`)
    }
    const parentId = this.doc.model.getParentId(blockId)
    const index = this.doc.model.indexInParent(blockId)
    if (!parentId || index < 0) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `Cannot delete root or orphan block: ${blockId}`)
    }
    return this.deleteBlocks(parentId, index, 1)
  }

  /** Replace one reachable block through the model layer without resolving component views. */
  replaceBlockSnapshots(blockId: string, snapshots: IBlockSnapshot[]): string[] {
    if (!this.doc.model.exists(blockId)) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `Block not found: ${blockId}`)
    }
    const parentId = this.resolveLiveParentId(blockId)
    if (!parentId) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `Cannot replace root or orphan block: ${blockId}`)
    }
    const parentYBlock = this.getYBlock(parentId)
    if (!parentYBlock) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `Parent block not found: ${parentId}`)
    }
    const yChildren = parentYBlock.get('children')
    if (!yChildren || !isYArray(yChildren)) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `Block ${parentId} cannot contain block children`)
    }
    // Use the live Y.Array rather than the cached model index. A caller may
    // replace several siblings inside one outer transaction before the graph's
    // deep observer publishes the new structure.
    const index = yChildren.toArray().indexOf(blockId)
    if (index < 0) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `Block ${blockId} is not a child of ${parentId}`)
    }

    this.doc.mutationPolicy?.assert({
      operation: 'replace',
      blockIds: [blockId],
      parentId,
    })
    this.doc.readonlyManager.assertRemovable([blockId], BlockReadonlyOperation.Replace)
    if (snapshots?.length) {
      this.doc.readonlyManager.assertInsertable(parentId, BlockReadonlyOperation.Replace)
      if (!snapshots.every(snapshot =>
        this._isSnapshotAllowedInParent(parentYBlock, snapshot),
      )) {
        throw new BlockCraftError(
          ErrorCode.ModelCRUDError,
          `replaceBlocks: invalid child for parent ${parentId}`,
        )
      }
    }
    this.transact(() => {
      if (this.doc.revisions?.isTracking) {
        this.doc.revisions.runInGroup(() => {
          if (snapshots?.length) {
            this._insertBySnapshots(parentYBlock, index + 1, snapshots)
            this.doc.revisions.recordBlockInsertion(
              snapshots.map(snapshot => snapshot.id),
              parentId,
            )
          }
          this.doc.revisions.recordBlockDeletion([blockId], parentId)
        })
        return
      }
      this._delete(parentYBlock, index, 1)
      if (snapshots?.length) this._insertBySnapshots(parentYBlock, index, snapshots)
    })
    return snapshots.map(snapshot => snapshot.id)
  }

  replaceWithSnapshots(blockId: string, snapshots: IBlockSnapshot[]): BlockCraft.BlockComponent[] {
    // A caller may have moved the block earlier in the same outer transaction.
    // Use the live tree so sparse-root mounting targets the destination parent
    // instead of the ModelGraph parent that is stale until transaction commit.
    const parentId = this.resolveLiveParentId(blockId)
    const insertedIds = this.replaceBlockSnapshots(blockId, snapshots)
    if (parentId) {
      this.doc.virtualization?.ensureViewMounted([parentId])
    }

    if (this.vm.usesSparseRoot && parentId === this.doc.rootId) {
      if (insertedIds.some(id => !this.doc.model.exists(id))) {
        this.doc.model.synchronizeParentBeforeView(parentId)
      }
      insertedIds.forEach(id => this.vm.ensureRootChildComponent(id))
    }

    return insertedIds
      .map(id => this.vm.get(id)?.instance)
      .filter((block): block is BlockCraft.BlockComponent => !!block)
  }

  private resolveLiveParentId(blockId: string): string | null {
    const indexedParentId = this.doc.model.getParentId(blockId)
    if (indexedParentId) {
      const indexedChildren = this.getYBlock(indexedParentId)?.get('children')
      if (
        indexedChildren instanceof Y.Array &&
        indexedChildren.toArray().includes(blockId)
      ) {
        return indexedParentId
      }
    }

    // Exceptional cold path for a move followed by another structural change
    // in one outer transaction. ModelGraph publishes its new parent index only
    // after the transaction commits, while the Y.Arrays already contain the
    // authoritative structure.
    for (const [candidateId, candidate] of this.yBlockMap.entries()) {
      const candidateChildren = candidate.get('children')
      if (
        candidateChildren instanceof Y.Array &&
        candidateChildren.toArray().includes(blockId)
      ) {
        return candidateId
      }
    }
    return null
  }

  moveBlocks(parentId: string, index: number, count: number, targetId: string, targetIndex: number) {
    if (count <= 0) return
    // Read the live Y.Map directly. A caller may create a target container and
    // move children into it in the same outer transaction, before ModelGraph's
    // observer has published the newly reachable node.
    const parentYBlock = this.getYBlock(parentId)
    const targetYBlock = this.getYBlock(targetId)
    if (!parentYBlock || !targetYBlock) return
    const sourceChildren = parentYBlock.get('children')
    const targetChildren = targetYBlock.get('children')
    if (!isYArray(sourceChildren) || !isYArray(targetChildren)) return

    const movingIds = sourceChildren.toArray().slice(index, index + count)
    if (!movingIds.length) return
    this.doc.mutationPolicy?.assert({
      operation: 'move',
      blockIds: movingIds,
      parentId,
      targetId,
    })
    const invalidMovingId = movingIds.find(id => {
      const movingYBlock = this.getYBlock(id)
      if (!movingYBlock) return true
      const flavour = movingYBlock.get('flavour') as BlockCraft.BlockFlavour
      return !this.doc.schemas.isValidChildrenForInstance(
        flavour,
        targetYBlock.get('flavour'),
        this._readYBlockMeta(targetYBlock),
      )
    })
    if (invalidMovingId) {
      throw new BlockCraftError(
        ErrorCode.ModelCRUDError,
        `moveBlocks: block ${invalidMovingId} is not allowed in parent ${targetId}`,
      )
    }
    if (this.doc.model.exists(targetId)) {
      this.doc.readonlyManager.assertMovable(
        movingIds,
        targetId,
        BlockReadonlyOperation.Move,
      )
    } else {
      // A target created in this transaction has no persisted lock ancestry
      // yet. Its parent insertion was already guarded by insertBlockSnapshots.
      this.doc.readonlyManager.assertRemovable(
        movingIds,
        BlockReadonlyOperation.Move,
      )
    }

    this.transact(() => {
      const sliceIds = sourceChildren.toArray().slice(index, index + count)
      sourceChildren.delete(index, count)
      targetChildren.insert(targetIndex, sliceIds)
    })
  }

}
