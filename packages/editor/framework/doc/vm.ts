import {ApplicationRef, ComponentRef, createComponent, ViewContainerRef} from "@angular/core";
import {take} from "rxjs";
import {BlockCraftError, ErrorCode, performanceTest} from "../../global";
import {
  BaseBlockComponent,
  BlockNodeType,
  IBlockSnapshot,
  native2YBlock,
  NativeBlockModel,
  YBlock,
  yBlock2Native
} from "../block-std";
import * as Y from "yjs";

export class DocVM {

  appRef = this.doc.injector.get(ApplicationRef)
  private envInjector = this.appRef.injector
  private store: Map<string, BlockCraft.BlockComponentRef> = new Map()
  private retainedRootIds = new Set<string>()
  private deferredSparseRootOrder: readonly string[] | null = null
  private deferredSparseRootIds = new Set<string>()
  private _sparseRoot = false

  constructor(
    private readonly doc: BlockCraft.Doc
  ) {
  }

  get root() {
    return this.doc.root
  }

  get schemas() {
    return this.doc.schemas
  }

  get usesSparseRoot(): boolean {
    return this._sparseRoot
  }

  enableSparseRootMode(rootId: string): void {
    if (this._sparseRoot) return
    const rootRef = this.get(rootId)
    if (!rootRef || rootRef.instance.nodeType !== BlockNodeType.root) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, 'Cannot enable sparse mode without root component')
    }
    rootRef?.instance.childrenRenderRef?.adoptSparseOrder(rootRef.instance.childrenIds)
    this._sparseRoot = true
  }

  has(id: string) {
    return this.store.has(id)
  }

  set(id: string, component: BlockCraft.BlockComponentRef) {
    this.store.set(id, component)
  }

  get<T extends BlockCraft.BlockFlavour>(id: string) {
    return this.store.get(id) as BlockCraft.BlockComponentRef<T> | undefined
  }

  private _createComponentByYBlock(
    yBlock: YBlock,
    parent: BlockCraft.BlockComponentRef | null,
    yBlocks: Record<string, YBlock>,
    onMissingChild?: (parentId: string, childId: string) => void,
    recursive = true,
    createdIds: Set<string> = new Set(),
  ): BlockCraft.BlockComponentRef {
    const id = yBlock.get('id')
    const cached = this.get(id)
    if (cached) return cached

    const schema = this.schemas.get(yBlock.get('flavour'))!
    const cpr = createComponent(schema.component, {
      elementInjector: this.doc.injector,
      environmentInjector: this.envInjector,
    })

    const nativeModel = yBlock2Native(yBlock)
    const useModelProjection = !!this.doc.isInitialized && this.doc.model.exists(id)
    if (
      useModelProjection &&
      yBlock.get('nodeType') !== BlockNodeType.editable &&
      yBlock.get('nodeType') !== BlockNodeType.void
    ) {
      nativeModel.children = [...this.doc.model.getChildrenIds(id)]
    }
    cpr.setInput('model', nativeModel)
    cpr.setInput('yBlock', yBlock)
    cpr.setInput('doc', this.doc)
    cpr.instance.parentId = parent?.instance.id || null
    if (cpr.instance.nodeType !== BlockNodeType.editable && cpr.instance.nodeType !== BlockNodeType.void) {
      cpr.instance.childrenRenderRef = new BlockChildrenRenderRef(cpr.instance, this)
    }

    this.set(id, cpr)
    createdIds.add(id)
    this.appRef.attachView(cpr.hostView)

    const yChildren = yBlock.get('children')
    if (recursive && yBlock.get('nodeType') !== BlockNodeType.editable && yChildren.length) {
      const childIds = useModelProjection
        ? this.doc.model.getChildrenIds(id)
        : yChildren.toArray()
      const childrenComps = childIds.map(childId => {
        const childYBlock = yBlocks[childId] || this.doc.crud.getYBlock(childId)
        if (!childYBlock) {
          this.doc.logger?.warn?.('skip missing child block on load: ' + childId)
          onMissingChild?.(cpr.instance.id, childId)
          return null
        }
        return this._createComponentByYBlock(
          childYBlock,
          cpr,
          yBlocks,
          onMissingChild,
          true,
          createdIds,
        )
      }).filter((child): child is BlockCraft.BlockComponentRef => child !== null)
      this.insert(cpr, 0, childrenComps)
    }

    cpr.changeDetectorRef.detectChanges()
    return cpr
  }

  /**
   * @param onMissingChild 可选：构建时遇到悬空 child 引用（childId 无对应 yBlock）
   *   逐个上报。仅初始加载路径（initByYBlock）传入，用于"遇到才兜底"地剪除这些
   *   引用；运行时远端路径不传，纯跳过（容错增量同步缺口、不写不广播）。
   */
  createComponentByYBlocks(
    yBlocks: Record<string, YBlock>,
    onMissingChild?: (parentId: string, childId: string) => void
  ) {
    return this._withCreationRollback(createdIds => {
      const res: Record<string, BlockCraft.BlockComponentRef> = {}
      for (const id in yBlocks) {
        res[id] = this._createComponentByYBlock(
          yBlocks[id]!,
          null,
          yBlocks,
          onMissingChild,
          true,
          createdIds,
        )
      }
      return res
    })
  }

  /** Create the permanent root component without eagerly creating its children. */
  createRootOnlyByYBlock(
    yRoot: YBlock,
    onMissingChild?: (parentId: string, childId: string) => void,
  ): BlockCraft.BlockComponentRef {
    return this._withCreationRollback(createdIds => {
      const root = this._createComponentByYBlock(
        yRoot,
        null,
        {[yRoot.get('id')]: yRoot},
        onMissingChild,
        false,
        createdIds,
      )
      this.enableSparseRootMode(yRoot.get('id'))
      return root
    })
  }

  private _withCreationRollback<T>(
    create: (createdIds: Set<string>) => T,
  ): T {
    const createdIds = new Set<string>()
    try {
      return create(createdIds)
    } catch (error) {
      this._rollbackCreatedComponents(createdIds)
      throw error
    }
  }

  private _rollbackCreatedComponents(createdIds: ReadonlySet<string>): void {
    ;[...createdIds].reverse().forEach(id => {
      const component = this.store.get(id)
      if (!component) return
      this.retainedRootIds.delete(id)
      component.location.nativeElement.remove()
      try {
        this.appRef.detachView(component.hostView)
      } catch {
        // The failed lifecycle pass may already have detached the host view.
      }
      try {
        component.destroy()
      } catch {
        // Rollback must still evict the poisoned ref even if teardown is partial.
      }
      this.store.delete(id)
    })
  }

  private _visitComponentSubtree(
    root: BlockCraft.BlockComponentRef,
    visit: (component: BlockCraft.BlockComponentRef) => void,
  ): void {
    visit(root)
    if (root.instance.nodeType === BlockNodeType.editable) return
    // A remote transaction can remove both the parent reference and its YBlock.
    // Deleted shared types are no longer readable, so finish lifecycle cleanup
    // from the component's last synchronized child snapshot.
    const liveChildren = this.doc.crud.getYBlock(root.instance.id)?.get('children')
    const cachedChildren = Reflect.get(root.instance, '_childrenIds')
    const childIds = liveChildren instanceof Y.Array
      ? liveChildren.toArray()
      : (Array.isArray(cachedChildren) ? cachedChildren : [])
    for (const childId of childIds) {
      const child = this.get(childId)
      if (child) this._visitComponentSubtree(child, visit)
    }
  }

  /** Ensure one complete root-child subtree exists, but keep it retained. */
  ensureRootChildComponent(id: string): BlockCraft.BlockComponentRef {
    const rootRef = this.get(this.root.id)
    if (!rootRef) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, 'Cannot find root component')
    }
    if (!rootRef.instance.childrenIds.includes(id)) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `${id} is not a root child`)
    }

    const cached = this.get(id)
    if (cached) {
      cached.instance.parentId = rootRef.instance.id
      if (!cached.instance.isAttached) this.retainedRootIds.add(id)
      return cached
    }
    const yBlock = this.doc.crud.getYBlock(id)
    if (!yBlock) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, 'Cannot find block with id: ' + id)
    }

    return this._withCreationRollback(createdIds => {
      const component = this._createComponentByYBlock(
        yBlock,
        rootRef,
        {[id]: yBlock},
        undefined,
        true,
        createdIds,
      )
      this._visitComponentSubtree(component, child => child.instance.detach())
      this.retainedRootIds.add(id)
      return component
    })
  }

  /** Mount a retained root child at its model index. */
  mountRootChild(id: string): BlockCraft.BlockComponentRef {
    const rootRef = this.get(this.root.id)
    if (!rootRef?.instance.childrenRenderRef) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, 'Root block has no children renderer')
    }
    const modelIndex = rootRef.instance.childrenIds.indexOf(id)
    if (modelIndex < 0) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `${id} is not a root child`)
    }

    const component = this.ensureRootChildComponent(id)
    this.retainedRootIds.delete(id)
    this._visitComponentSubtree(component, child => child.instance.reattach())
    rootRef.instance.childrenRenderRef.mountSparse(modelIndex, component)
    return component
  }

  /** Remove a root-child host from the DOM while retaining its component subtree. */
  retainRootChild(id: string): BlockCraft.BlockComponentRef | undefined {
    const rootRef = this.get(this.root.id)
    if (!rootRef) return undefined

    const mounted = rootRef.instance.childrenRenderRef?.unmountSparse(id)
    if (!mounted && !rootRef.instance.childrenIds.includes(id)) return this.get(id)

    const component = mounted ?? this.get(id)
    if (!component) return undefined

    // A cross-parent move can insert the block into sparse root before the
    // source container's view delta has finished. Settle ownership here after
    // all deltas: the component must not remain visible in its old container
    // while waiting for the virtualizer to decide whether root should mount it.
    component.instance.hostElement.remove()
    component.instance.parentId = rootRef.instance.id
    this._visitComponentSubtree(component, child => child.instance.detach())
    this.retainedRootIds.add(id)
    return component
  }

  getRetainedRootChildIds(): string[] {
    return [...this.retainedRootIds]
  }

  /** Destroy one unmounted root subtree so a future mount rebuilds it from Yjs. */
  destroyRetainedRootChild(id: string): boolean {
    const component = this.get(id)
    if (!component || component.instance.isAttached) return false
    if (component.instance.parentId !== this.root.id) return false
    this.destroy(id)
    return true
  }

  /** Retain view resources for an already-created subtree without moving its host. */
  retainComponentSubtree(component: BlockCraft.BlockComponentRef): void {
    this._visitComponentSubtree(component, child => child.instance.detach())
  }

  /** Reconcile mounted root-child indices after a Y.Array delta. */
  applySparseRootChildrenDelta(
    delta: Y.YEvent<Y.Array<string>>['changes']['delta'],
    options?: {
      desiredIds: readonly string[]
      preserveIds: ReadonlySet<string>
    },
  ): void {
    if (!this._sparseRoot) return
    const renderRef = this.get(this.root.id)?.instance.childrenRenderRef
    if (!renderRef) return
    const {removed, preserved} = renderRef.reconcileSparseDelta(
      delta,
      options?.preserveIds,
    )
    removed.forEach(component => {
      const id = component.instance.id
      // Top-level YBlock deletion is processed before delayed children deltas.
      // A removed sparse ref can therefore already be destroyed, or even have
      // been replaced by a fresh ref with the same stable ID. Never retain that
      // stale ref back into the sparse cache.
      if (this.get(id) !== component) {
        this.retainedRootIds.delete(id)
        component.instance.hostElement.remove()
        return
      }
      this._visitComponentSubtree(component, child => child.instance.detach())
      this.retainedRootIds.add(id)
    })
    if (preserved && options) {
      this._deferSparseRootOrder(renderRef, options.desiredIds, options.preserveIds)
    }
  }

  /** @internal Whether a composing sparse-root move is holding DOM order stable. */
  get hasDeferredSparseRootOrder(): boolean {
    return this.deferredSparseRootOrder !== null
  }

  /** @internal Whether ownership settlement must keep this composing host mounted. */
  isDeferredSparseRootChild(id: string): boolean {
    return this.deferredSparseRootIds.has(id)
  }

  /** @internal Settle a composing sparse-root move before the final caret projection. */
  _flushDeferredSparseRootOrder(): boolean {
    const desiredIds = this.deferredSparseRootOrder
    if (!desiredIds) return false
    this.deferredSparseRootOrder = null
    this.deferredSparseRootIds.clear()
    this.get(this.root.id)?.instance.childrenRenderRef?._reconcileSparseOrder(desiredIds)
    return true
  }

  /** @internal Recover sparse-root indices without mounting offscreen gaps. */
  _reconcileSparseRootChildren(modelIds: readonly string[]): void {
    if (!this._sparseRoot) return
    const rootRef = this.get(this.root.id)
    const renderRef = rootRef?.instance.childrenRenderRef
    if (!rootRef || !renderRef) return

    const desired = new Set(modelIds)
    renderRef.ids.filter(id => !desired.has(id)).forEach(id => {
      const component = renderRef.unmountSparse(id)
      if (!component) return
      if (this.get(id) !== component) {
        component.instance.hostElement.remove()
        return
      }
      if (this.doc.model.exists(id)) {
        this._visitComponentSubtree(component, child => child.instance.detach())
        this.retainedRootIds.add(id)
      } else {
        this.destroy(id)
      }
    })
    // @ts-expect-error internal model projection maintained by DocCRUD
    rootRef.instance._childrenIds = [...modelIds]
    const activeRootId = this._activeCompositionRootUnitId()
    const currentIds = renderRef.ids
    const indexById = new Map(modelIds.map((id, index) => [id, index]))
    const desiredMountedIds = [...currentIds].sort((left, right) =>
      (indexById.get(left) ?? Number.MAX_SAFE_INTEGER) -
      (indexById.get(right) ?? Number.MAX_SAFE_INTEGER),
    )
    const orderChanged = currentIds.some((id, index) => desiredMountedIds[index] !== id)
    if (
      activeRootId &&
      currentIds.includes(activeRootId) &&
      modelIds.includes(activeRootId) &&
      orderChanged
    ) {
      this._deferSparseRootOrder(renderRef, modelIds, new Set([activeRootId]))
    } else {
      renderRef._reconcileSparseOrder(modelIds)
    }
  }

  private _activeCompositionRootUnitId(): string | null {
    if (!this.doc.event?.status?.isComposing) return null
    const session = this.doc.inputManger?.compositionSession
    const activeBlockId = session?.isActive ? session.activeBlockId : null
    if (!activeBlockId) return null
    try {
      const path = this.doc.model.getPath(activeBlockId)
      return path?.[0] === this.doc.rootId ? path[1] ?? null : null
    } catch {
      return null
    }
  }

  private _deferSparseRootOrder(
    renderRef: BlockChildrenRenderRef,
    desiredIds: readonly string[],
    preserveIds: ReadonlySet<string>,
  ): void {
    renderRef.adoptSparseOrder(desiredIds)
    this.deferredSparseRootOrder = [...desiredIds]
    preserveIds.forEach(id => this.deferredSparseRootIds.add(id))
  }

  isMounted(id: string): boolean {
    return this.get(id)?.instance.isAttached ?? false
  }

  getMountedRootChildIds(): string[] {
    return this.get(this.root.id)?.instance.childrenRenderRef?.ids ?? []
  }

  createComponentBySnapshot<T extends IBlockSnapshot>(snapshot: T, cb?: (cpr: BlockCraft.BlockComponentRef) => void) {

    const createComp = (snapshot: IBlockSnapshot, parentId: string | null = null) => {
      const {id, nodeType, flavour, props, meta, children} = snapshot

      const schema = this.schemas.get(flavour)!
      const cpr = createComponent(schema.component, {
        elementInjector: this.doc.injector,
        environmentInjector: this.envInjector
      })

      const model = {
        id, nodeType, flavour, props, meta,
        children: (nodeType === BlockNodeType.block || nodeType === BlockNodeType.root) ? children.map(childSnapshot => childSnapshot.id) : children,
      } as NativeBlockModel

      cpr.instance.parentId = parentId
      cpr.setInput('doc', this.doc)
      cpr.setInput('model', model)
      cpr.setInput('yBlock', native2YBlock(model))
      cb && cb(cpr)
      if (cpr.instance.nodeType !== BlockNodeType.editable && cpr.instance.nodeType !== BlockNodeType.void) {
        cpr.instance.childrenRenderRef = new BlockChildrenRenderRef(cpr.instance, this)
      }

      this.set(id, cpr)
      this.appRef.attachView(cpr.hostView)
      cpr.changeDetectorRef.detectChanges()

      if (children.length && cpr.instance.childrenRenderRef) {
        const childrenComps = (children as IBlockSnapshot[]).map(
          c => createComp(c)
        )
        cpr.instance.childrenRenderRef?.insert(0, childrenComps)
      }

      return cpr
    }

    return createComp(snapshot)
  }

  private _adoptComponents(
    parent: BlockCraft.BlockComponentRef,
    components: readonly BlockCraft.BlockComponentRef[],
  ): void {
    const shouldAttach = parent.instance.isAttached
    components.forEach(component => {
      // A direct root child can be retained by virtualization before the target
      // parent's children event adopts the same cached component. Once it moves
      // below another parent, that old root-cache ownership must end.
      this.retainedRootIds.delete(component.instance.id)
      component.instance.parentId = parent.instance.id
      if (component.instance.isAttached === shouldAttach) return
      this._visitComponentSubtree(component, child => {
        if (shouldAttach) child.instance.reattach()
        else child.instance.detach()
      })
    })
  }

  insert(parent: string | BlockCraft.BlockComponentRef, index: number, comps: BlockCraft.BlockComponentRef[]) {
    const parentComp = parent instanceof ComponentRef ? parent : this.store.get(parent)
    if (!parentComp) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, 'Cannot find parent component with id: ' + parent)
    }

    const instance = parentComp.instance
    if (!instance.childrenRenderRef) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `${parentComp.instance.id} block has no children`)
    }

    this._adoptComponents(parentComp, comps)
    instance.childrenRenderRef!.insert(index, comps)
  }

  remove(parent: string | BlockCraft.BlockComponentRef, index: number, length = 1) {
    const parentComp = parent instanceof ComponentRef ? parent : this.store.get(parent)
    if (!parentComp) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, 'Cannot find parent component with id: ' + parent)
    }

    const instance = parentComp.instance
    if (!instance.childrenRenderRef) {
      throw new BlockCraftError(ErrorCode.ModelCRUDError, `${parent} block has no children`)
    }

    instance.childrenRenderRef.remove(index, length)
  }

  destroy(id: string) {
    const cpr = this.store.get(id)
    if (cpr) {
      this.retainedRootIds.delete(id)
      cpr.instance.childrenRenderRef?.clearAll()
      cpr.instance.hostElement.remove()
      cpr.destroy()
      this.store.delete(id)
    }
  }

  deleteByIds(ids: string[]) {
    const deletedIds = new Set(ids)
    const visited = new Set<string>()
    ids.forEach(id => this._destroyDeletedComponent(id, deletedIds, visited))
  }

  /**
   * Destroy a data-deleted component tree without consuming descendants that
   * the canonical model already moved elsewhere in the same Yjs transaction.
   */
  private _destroyDeletedComponent(
    id: string,
    deletedIds: ReadonlySet<string>,
    visited: Set<string>,
  ): void {
    if (visited.has(id)) return
    visited.add(id)
    const component = this.store.get(id)
    if (!component) return

    const renderRef = component.instance.childrenRenderRef
    const children = renderRef?.splice(0, renderRef.length) ?? []
    children.forEach(child => {
      const childId = child.instance.id
      if (deletedIds.has(childId) || !this.doc.model.exists(childId)) {
        this._destroyDeletedComponent(childId, deletedIds, visited)
        return
      }
      this._releaseMovedChildFromDeletedParent(child)
    })

    this.retainedRootIds.delete(id)
    component.instance.hostElement.remove()
    component.destroy()
    this.store.delete(id)
  }

  private _releaseMovedChildFromDeletedParent(
    component: BlockCraft.BlockComponentRef,
  ): void {
    const id = component.instance.id
    const parentId = this.doc.model.getParentId(id)
    component.instance.hostElement.remove()
    component.instance.parentId = parentId

    if (parentId === this.root.id) {
      this._visitComponentSubtree(component, child => child.instance.detach())
      this.retainedRootIds.add(id)
      return
    }

    this.retainedRootIds.delete(id)
    const parent = parentId ? this.get(parentId) : undefined
    if (!parent?.instance.isAttached) {
      this._visitComponentSubtree(component, child => child.instance.detach())
    }
  }

  clear() {
    this.store.forEach((cpr, id) => {
      cpr?.destroy()
    })
    this.store.clear()
    this.retainedRootIds.clear()
    this.deferredSparseRootOrder = null
    this.deferredSparseRootIds.clear()
  }

}

export class BlockChildrenRenderRef {
  private _containerElement?: HTMLElement
  get containerElement() {
    return this._containerElement ??= (this.block.hostElement.querySelector('.children-render-container') || this.block.hostElement)
  }

  private _compRefs: BlockCraft.BlockComponentRef[] = []
  private readonly _sparseModelIndices = new Map<string, number>()

  constructor(private readonly block: BlockCraft.BlockComponent, private vm: DocVM) {
  }

  insert(index: number, comps: BlockCraft.BlockComponentRef[]) {
    const _chs = comps.map(comp => {
      comp.instance.parentId = this.block.id;
      return comp.location.nativeElement
    })
    if (!this._compRefs.length || index === 0) {
      this.containerElement.prepend(..._chs)
    } else {
      const startComps = this._compRefs[index - 1]
      startComps.instance.hostElement.after(..._chs)
    }
    this._compRefs.splice(index, 0, ...comps)
  }

  /** Insert one sparse child using its model index, independent of unmounted siblings. */
  mountSparse(modelIndex: number, comp: BlockCraft.BlockComponentRef): void {
    if (this._compRefs.some(current => current.instance.id === comp.instance.id)) return

    let low = 0
    let high = this._compRefs.length
    while (low < high) {
      const middle = (low + high) >>> 1
      const currentIndex = this._sparseModelIndices.get(this._compRefs[middle].instance.id)
      if (currentIndex != null && currentIndex < modelIndex) low = middle + 1
      else high = middle
    }

    comp.instance.parentId = this.block.id
    const next = this._compRefs[low]
    if (next) next.instance.hostElement.before(comp.location.nativeElement)
    else this.containerElement.append(comp.location.nativeElement)
    this._compRefs.splice(low, 0, comp)
    this._sparseModelIndices.set(comp.instance.id, modelIndex)
  }

  adoptSparseOrder(modelIds: readonly string[]): void {
    this._sparseModelIndices.clear()
    const indexById = new Map(modelIds.map((id, index) => [id, index]))
    this._compRefs.forEach(component => {
      const index = indexById.get(component.instance.id)
      if (index !== undefined) this._sparseModelIndices.set(component.instance.id, index)
    })
  }

  /** @internal Re-index and reorder only currently mounted sparse children. */
  _reconcileSparseOrder(modelIds: readonly string[]): void {
    const domIndexByHost = new Map<Element, number>()
    Array.from(this.containerElement.children).forEach((host, index) => {
      domIndexByHost.set(host, index)
    })
    const currentIndexById = new Map(
      this._compRefs.map((component, index) => [
        component.instance.id,
        domIndexByHost.get(component.instance.hostElement) ?? domIndexByHost.size + index,
      ]),
    )
    this.adoptSparseOrder(modelIds)
    const indexById = new Map(modelIds.map((id, index) => [id, index]))
    const desired = [...this._compRefs].sort((a, b) =>
      (indexById.get(a.instance.id) ?? Number.MAX_SAFE_INTEGER) -
      (indexById.get(b.instance.id) ?? Number.MAX_SAFE_INTEGER),
    )
    // Keep the largest already-correct host subsequence in place. Re-appending
    // an untouched contenteditable host can invalidate a native DOM Range.
    const stablePositions = longestIncreasingSubsequencePositions(
      desired.map(component => currentIndexById.get(component.instance.id) ?? -1),
    )
    desired.forEach((component, index) => {
      if (component.instance.hostElement.parentElement !== this.containerElement) {
        stablePositions.delete(index)
      }
    })
    if (stablePositions.size !== desired.length) {
      for (let index = desired.length - 1; index >= 0; index--) {
        if (stablePositions.has(index)) continue
        const host = desired[index].instance.hostElement
        const nextHost = desired[index + 1]?.instance.hostElement
        if (nextHost) this.containerElement.insertBefore(host, nextHost)
        else this.containerElement.append(host)
      }
    }
    // Commit the in-memory order only after every DOM move succeeds. A later
    // retry can then derive the remaining work from the partially moved DOM.
    this._compRefs = desired
    this._pruneUnownedSparseHosts()
  }

  private _pruneUnownedSparseHosts(): void {
    const ownedHosts = new Set(
      this._compRefs.map(component => component.instance.hostElement),
    )
    Array.from(this.containerElement.children).forEach(node => {
      const element = node as HTMLElement
      if (element.hasAttribute('data-block-id') && !ownedHosts.has(element)) {
        element.remove()
      }
    })
  }

  /** Remove a sparse child host without destroying its component. */
  unmountSparse(id: string): BlockCraft.BlockComponentRef | undefined {
    const index = this._compRefs.findIndex(comp => comp.instance.id === id)
    if (index < 0) return undefined
    const [component] = this._compRefs.splice(index, 1)
    this._sparseModelIndices.delete(id)
    component.instance.hostElement.remove()
    return component
  }

  /** Update sparse model indices and retain mounted children deleted from the sequence. */
  reconcileSparseDelta(
    delta: Y.YEvent<Y.Array<string>>['changes']['delta'],
    preserveIds: ReadonlySet<string> = new Set(),
  ): {
    removed: BlockCraft.BlockComponentRef[]
    preserved: boolean
  } {
    const removed: BlockCraft.BlockComponentRef[] = []
    let preserved = false
    let cursor = 0

    for (const operation of delta) {
      if (operation.retain) {
        cursor += operation.retain
        continue
      }
      if (operation.insert) {
        const length = operation.insert.length
        this._sparseModelIndices.forEach((index, id) => {
          if (index >= cursor) this._sparseModelIndices.set(id, index + length)
        })
        cursor += length
        continue
      }
      if (operation.delete) {
        const end = cursor + operation.delete
        const removedIds: string[] = []
        this._sparseModelIndices.forEach((index, id) => {
          if (index >= cursor && index < end) removedIds.push(id)
        })
        removedIds.forEach(id => {
          if (preserveIds.has(id)) {
            preserved = true
            return
          }
          const component = this.unmountSparse(id)
          if (component) removed.push(component)
        })
        this._sparseModelIndices.forEach((index, id) => {
          if (index >= end) this._sparseModelIndices.set(id, index - operation.delete!)
        })
      }
    }

    return {removed, preserved}
  }

  remove(index: number, length = 1) {
    const comps = this._compRefs.splice(index, length)
    comps.forEach(comp => {
      this.vm.destroy(comp.instance.id)
    })
  }

  clearAll() {
    this._compRefs.forEach(comp => {
      this.vm.destroy(comp.instance.id)
    })
    this._compRefs = []
    this._sparseModelIndices.clear()
  }

  get(index: number) {
    return this._compRefs[index]
  }

  slice(start: number, end: number) {
    return this._compRefs.slice(start, start + end)
  }

  splice(index: number, length: number) {
    return this._compRefs.splice(index, length)
  }

  get length() {
    return this._compRefs.length
  }

  get ids(): string[] {
    return this._compRefs.map(component => component.instance.id)
  }

}

declare global {
  namespace BlockCraft {
    type ViewManager = DocVM

    interface IBlockComponents {
    }

    type BlockFlavour = keyof IBlockComponents
    type BlockComponent<T extends BlockFlavour = BlockFlavour> = IBlockComponents[T] | BaseBlockComponent
    type BlockComponentRef<T extends BlockFlavour = BlockFlavour> = ComponentRef<BlockComponent<T>>
  }
}

function longestIncreasingSubsequencePositions(values: readonly number[]): Set<number> {
  if (!values.length) return new Set()

  const predecessors = new Array<number>(values.length).fill(-1)
  const tails: number[] = []
  for (let index = 0; index < values.length; index++) {
    let low = 0
    let high = tails.length
    while (low < high) {
      const middle = (low + high) >>> 1
      if (values[tails[middle]] < values[index]) low = middle + 1
      else high = middle
    }
    if (low > 0) predecessors[index] = tails[low - 1]
    tails[low] = index
  }

  const positions = new Set<number>()
  let cursor = tails[tails.length - 1]
  while (cursor !== undefined && cursor >= 0) {
    positions.add(cursor)
    cursor = predecessors[cursor]
  }
  return positions
}
