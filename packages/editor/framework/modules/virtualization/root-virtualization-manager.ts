import {Subject, Subscription} from 'rxjs'
import type {SelectionProjectionMountAdapter} from '../selection/projection-mount-adapter'
import type {ISelectionJSON, ISelectionPointJSON} from '../selection/types'
import {HeightMap} from './height-map'
import {HeightMeasurement, HeightObserver} from './height-observer'
import {PinRegistry} from './pin-registry'
import {mergeToSegments} from './segment-merger'
import {captureScrollAnchor, restoreScrollAnchor, ScrollAnchorSnapshot} from './scroll-anchor'
import {SpacerLayer} from './spacer-layer'
import {
  BlockViewRetentionContext,
  resolveVirtualizationConfig,
  RenderedSegment,
  VirtualizationConfig,
} from './types'
import {calculateViewportRange} from './viewport-range'

const DEFAULT_ESTIMATED_HEIGHT = 48
const BLOCK_NAVIGATION_PIN = 'block-navigation'
const BLOCK_VIEW_LEASE_PIN = 'block-view-leases'
const BLOCK_NAVIGATION_EPSILON = 1
const BLOCK_NAVIGATION_STABLE_FRAMES = 2
const BLOCK_NAVIGATION_MAX_FRAMES = 8
const MAX_RECONCILE_FAILURES = 3
const FULL_MOUNT_FALLBACK_MESSAGE = '虚拟渲染异常，已切换为完整渲染'

type SelectionPinSnapshot = Pick<ISelectionJSON, 'anchor' | 'head'>

interface RootSelectionEndpoint {
  readonly order: number
  readonly startIndex: number
  readonly endIndex: number
  readonly fallbackIndex: number | null
}

interface BlockNavigationTask {
  readonly blockId: string
  readonly resolve: (success: boolean) => void
  started: boolean
  frame: number | null
  frames: number
  stableFrames: number
}

export interface VirtualizationViewChange {
  mountedRootIds: readonly string[]
}

export class RootVirtualizationManager implements SelectionProjectionMountAdapter {
  private readonly config
  private readonly heights = new HeightMap()
  private readonly pins = new PinRegistry()
  private readonly heightObserver = new HeightObserver((values) => this.applyMeasurements(values))
  private readonly subscriptions = new Subscription()
  private blockIds: string[] = []
  private indexById = new Map<string, number>()
  private spacerLayer: SpacerLayer | null = null
  private scrollContainer: HTMLElement | null = null
  private ownerWindow: Window | null = null
  private viewportResizeObserver: ResizeObserver | null = null
  private frame: number | null = null
  private disposed = false
  private selectionSnapshot: SelectionPinSnapshot | null = null
  private projectionBlockIds: string[] = []
  private retainedRootIds = new Map<string, true>()
  private pendingStructureAnchor: ScrollAnchorSnapshot | null = null
  private fullDocumentViewLeaseCount = 0
  private blockViewLeaseSequence = 0
  private blockViewLeases = new Map<number, readonly string[]>()
  private unregisterSelectionAdapter: (() => void) | null = null
  private unregisterPins: (() => void) | null = null
  private lastPublishedMountedIds: string[] = []
  private blockNavigationTask: BlockNavigationTask | null = null
  private synchronizedStructureRevision = 0
  private sparseRootReconcilePending = false
  private reconcileFailureCount = 0
  private fullMountFallback = false
  private fallbackMountFailureLogged = false

  readonly viewChange$ = new Subject<VirtualizationViewChange>()

  private readonly onScroll = () => {
    if (!this.fullMountFallback) this.schedule()
  }
  private readonly onResize = () => {
    if (!this.fullMountFallback) this.schedule()
  }

  constructor(
    private readonly doc: BlockCraft.Doc,
    config?: VirtualizationConfig,
  ) {
    this.config = resolveVirtualizationConfig(config)
  }

  get enabled(): boolean {
    return this.config.enabled
  }

  init(scrollContainer: HTMLElement): void {
    if (!this.enabled || this.disposed || this.scrollContainer) return
    this.scrollContainer = scrollContainer
    this.ownerWindow = scrollContainer.ownerDocument.defaultView ?? window
    const ResizeObserverCtor = (this.ownerWindow as Window & typeof globalThis).ResizeObserver
    if (ResizeObserverCtor) {
      const observer = new ResizeObserverCtor(() => this.schedule())
      this.viewportResizeObserver = observer
      observer.observe(scrollContainer)
    }
    this.spacerLayer = new SpacerLayer(this.doc.root.childrenRenderRef!.containerElement)
    this.rebuildModel()
    this.markStructureRevisionSynchronized()
    this.unregisterSelectionAdapter = this.doc.selection.registerProjectionMountAdapter(this)
    this.unregisterPins = this.pins.subscribe(() => this.schedule())
    this.syncBlockViewLeases()
    this.syncFullDocumentViewLease()
    this.subscriptions.add(this.doc.model.structureChange$.subscribe(() => this.handleStructureChange()))
    this.subscriptions.add(
      this.doc.selection.changeObserve().subscribe((selection) => {
        this.projectionBlockIds = []
        this.pins.unpin('projection')
        this.selectionSnapshot = selection?.toJSON() ?? null
        this.syncSelectionPins()
      }),
    )
    this.doc.ngZone.runOutsideAngular(() => {
      scrollContainer.addEventListener('scroll', this.onScroll, {passive: true})
      this.ownerWindow?.addEventListener('resize', this.onResize, {passive: true})
    })
    const pendingNavigation = this.blockNavigationTask
    if (pendingNavigation) this.startBlockNavigation(pendingNavigation)
    this.schedule()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.frame !== null) this.cancelFrame(this.frame)
    this.frame = null
    this.cancelBlockNavigation()
    this.scrollContainer?.removeEventListener('scroll', this.onScroll)
    this.ownerWindow?.removeEventListener('resize', this.onResize)
    this.unregisterSelectionAdapter?.()
    this.unregisterPins?.()
    this.subscriptions.unsubscribe()
    this.viewportResizeObserver?.disconnect()
    this.viewportResizeObserver = null
    this.heightObserver.disconnect()
    this.pins.clear()
    this.selectionSnapshot = null
    this.projectionBlockIds = []
    this.retainedRootIds.clear()
    this.pendingStructureAnchor = null
    this.fullDocumentViewLeaseCount = 0
    this.blockViewLeases.clear()
    this.spacerLayer?.clear()
    this.scrollContainer = null
    this.ownerWindow = null
    this.lastPublishedMountedIds = []
    this.sparseRootReconcilePending = false
    this.viewChange$.complete()
  }

  ensureMounted(blockIds: readonly string[], signal: AbortSignal): void {
    if (signal.aborted || this.disposed) return
    this.projectionBlockIds = [...blockIds]
    const indices = this.resolveRootIndices(blockIds)
    this.pins.pin('projection', indices)
    this.mountRootIndices(indices, signal)
  }

  /**
   * Synchronously materialize view capabilities for the current interaction.
   * The target is not pinned; a resulting selection or the viewport must take
   * ownership before the next reconciliation frame.
   */
  ensureViewMounted(blockIds: readonly string[]): void {
    if (!this.enabled || this.disposed) return
    this.mountRootIndices(this.resolveRootIndices(blockIds))
  }

  /**
   * Center a stable block ID in the virtual scroll viewport. The target's root
   * render unit is mounted transiently, then its real host geometry corrects
   * the estimated HeightMap jump.
   */
  scrollToBlock(blockId: string): Promise<boolean> {
    this.cancelBlockNavigation()
    if (!this.enabled || this.disposed) {
      return Promise.resolve(false)
    }

    let settle!: (success: boolean) => void
    const result = new Promise<boolean>(resolve => {
      settle = resolve
    })
    const task: BlockNavigationTask = {
      blockId,
      resolve: settle,
      started: false,
      frame: null,
      frames: 0,
      stableFrames: 0,
    }
    this.blockNavigationTask = task
    if (this.scrollContainer) this.startBlockNavigation(task)
    return result
  }

  private startBlockNavigation(task: BlockNavigationTask): void {
    if (
      this.blockNavigationTask !== task ||
      task.started ||
      !this.scrollContainer
    ) {
      return
    }
    task.started = true

    try {
      if (!this.blockIds.length) this.rebuildModel()
    } catch (error) {
      this.failBlockNavigation(task, error)
      return
    }
    let rootIndex: number | undefined
    try {
      rootIndex = this.resolveRootIndex(task.blockId)
    } catch {
      this.finishBlockNavigation(task, false)
      return
    }
    if (rootIndex === undefined) {
      this.finishBlockNavigation(task, false)
      return
    }

    try {
      // Explicit navigation owns viewport placement over a pending structural
      // anchor captured before the target was requested.
      this.pendingStructureAnchor = null
      this.pins.pin(BLOCK_NAVIGATION_PIN, [rootIndex])
      this.centerEstimatedRootIndex(rootIndex)
      this.mountRootIndices([rootIndex])

      const correction = this.readBlockCenterCorrection(task.blockId)
      if (correction !== null) {
        this.scrollContainer.scrollTop += correction
      }
      this.schedule()
      this.scheduleBlockCenterCorrection(task)
    } catch (error) {
      this.failBlockNavigation(task, error)
    }
  }

  /**
   * Keep the root render units containing these stable block IDs mounted until
   * the returned idempotent release function is called.
   */
  acquireBlockViewLease(blockIds: readonly string[]): () => void {
    if (!this.enabled || this.disposed) return () => undefined
    const stableIds = [...new Set(blockIds)]
    if (!stableIds.length) return () => undefined
    if (!this.blockIds.length) this.rebuildModel()

    const leaseId = ++this.blockViewLeaseSequence
    this.blockViewLeases.set(leaseId, stableIds)
    try {
      this.syncBlockViewLeases()
    } catch (error) {
      this.blockViewLeases.delete(leaseId)
      try {
        this.syncBlockViewLeases()
        this.retainUnpinnedViewsBeforeInit()
      } catch (rollbackError) {
        this.doc.logger.warn('blockViewLeaseRollbackError: ', rollbackError)
      }
      throw error
    }

    let active = true
    return () => {
      if (!active) return
      active = false
      if (this.disposed) return
      this.blockViewLeases.delete(leaseId)
      this.syncBlockViewLeases()
      this.retainUnpinnedViewsBeforeInit()
    }
  }

  /**
   * Bind Schema/host-configured retention after a block view initializes.
   * Keep-alive activation waits for the current sparse-root mount transaction
   * to finish, preventing recursive mounting from Angular view hooks.
   */
  bindBlockViewRetention(context: BlockViewRetentionContext): () => void {
    if (!this.enabled || this.disposed) return () => undefined
    if (this.resolveBlockViewRetention(context) !== 'keep-alive') {
      return () => undefined
    }

    let active = true
    let releaseLease: (() => void) | null = null
    queueMicrotask(() => {
      if (!active || this.disposed) return
      try {
        if (!this.doc.model.exists(context.blockId) || !this.doc.vm.isMounted(context.blockId)) return
      } catch {
        return
      }
      try {
        releaseLease = this.acquireBlockViewLease([context.blockId])
      } catch (error) {
        this.doc.logger.warn('blockViewRetentionLeaseError: ', error)
      }
    })

    return () => {
      if (!active) return
      active = false
      try {
        releaseLease?.()
      } catch (error) {
        this.doc.logger.warn('blockViewRetentionLeaseReleaseError: ', error)
      }
      releaseLease = null
    }
  }

  /**
   * Keep every root render unit mounted for a view capability that requires
   * exact full-document geometry. The returned release function is idempotent.
   */
  acquireFullDocumentViewLease(): () => void {
    if (!this.enabled || this.disposed) return () => undefined
    const previousLeaseCount = this.fullDocumentViewLeaseCount
    this.fullDocumentViewLeaseCount++
    try {
      if (!this.blockIds.length) this.rebuildModel()
      this.syncFullDocumentViewLease()
    } catch (error) {
      this.fullDocumentViewLeaseCount = previousLeaseCount
      if (!previousLeaseCount) {
        // The zero-lease branch only removes the full-document pin and
        // schedules sparse reconciliation; it performs no new mounts.
        try {
          this.syncFullDocumentViewLease()
        } catch (rollbackError) {
          this.doc.logger.warn('fullDocumentViewLeaseRollbackError: ', rollbackError)
        }
      } else {
        this.schedule()
      }
      throw error
    }

    let active = true
    return () => {
      if (!active) return
      active = false
      this.fullDocumentViewLeaseCount = Math.max(0, this.fullDocumentViewLeaseCount - 1)
      this.syncFullDocumentViewLease()
    }
  }

  /** @internal Finish a sparse-root move deferred to protect native IME state. */
  settleCompositionView(): void {
    try {
      if (!this.doc.vm._flushDeferredSparseRootOrder()) return
      this.schedule()
    } catch (error) {
      this.sparseRootReconcilePending = true
      this.handleReconcileFailure(error)
    }
  }

  private schedule(): void {
    if (this.disposed || this.frame !== null || !this.scrollContainer) return
    this.frame = this.requestFrame(() => {
      this.frame = null
      this.reconcile()
    })
  }

  private requestFrame(callback: FrameRequestCallback): number {
    return this.ownerWindow?.requestAnimationFrame(callback) ?? requestAnimationFrame(callback)
  }

  private cancelFrame(frame: number): void {
    if (this.ownerWindow) this.ownerWindow.cancelAnimationFrame(frame)
    else cancelAnimationFrame(frame)
  }

  private reconcile(): void {
    try {
      this.repairModelStateIfNeeded()
      this.reconcileFrame()
      this.reconcileFailureCount = 0
      this.fallbackMountFailureLogged = false
    } catch (error) {
      this.handleReconcileFailure(error)
    }
  }

  private reconcileFrame(): void {
    if (this.doc.vm.hasDeferredSparseRootOrder) {
      // Safari may cancel native composition without dispatching compositionend.
      // Once the event layer releases DOM ownership, a stale input session must
      // not keep sparse order and viewport spacers frozen.
      if (this.doc.event.status.isComposing) return
      if (this.doc.vm._flushDeferredSparseRootOrder()) {
        this.sparseRootReconcilePending = true
      }
    }
    if (!this.scrollContainer) return
    const settledSparseRoot = this.sparseRootReconcilePending
    if (settledSparseRoot) {
      this.doc.vm._reconcileSparseRootChildren(this.blockIds)
      this.sparseRootReconcilePending = false
    }
    if (!this.blockIds.length) {
      this.pendingStructureAnchor = null
      this.spacerLayer?.clear()
      this.publishViewChange()
      return
    }
    if (this.fullMountFallback) {
      // Full fallback is a canonical sparse-root repair followed by complete
      // mounting, not a wider virtual window. Clear stale geometry before any
      // mount can fail so an old spacer cannot leave the editor mostly blank.
      if (!settledSparseRoot) this.doc.vm._reconcileSparseRootChildren(this.blockIds)
      this.spacerLayer?.clear()
      this.heightObserver.disconnect()
    }
    const rootContainer = this.doc.root.childrenRenderRef!.containerElement
    const rootRect = rootContainer.getBoundingClientRect()
    const viewportRect = this.scrollContainer.getBoundingClientRect()
    const currentScrollTop = Math.max(0, viewportRect.top - rootRect.top)
    const structureRestore = this.pendingStructureAnchor
      ? restoreScrollAnchor(
          this.pendingStructureAnchor,
          (id) => this.indexById.get(id) ?? -1,
          this.heights,
          currentScrollTop,
          this.scrollContainer.clientHeight || viewportRect.height,
        )
      : null
    const scrollTop = structureRestore?.scrollTop ?? currentScrollTop
    const viewport = calculateViewportRange(
      this.heights,
      scrollTop,
      this.scrollContainer.clientHeight || viewportRect.height,
      this.config.overscan,
    )
    const segments: RenderedSegment[] = this.fullMountFallback
      ? [[0, this.blockIds.length - 1]]
      : mergeToSegments(
          viewport,
          this.pins.snapshot(),
          this.config.segmentMergeGap,
          this.blockIds.length,
        )
    const target = this.expandSegments(segments)
    const mounted = new Set(this.doc.vm.getMountedRootChildIds())

    mounted.forEach((id) => {
      if (!target.has(id)) this.retainRootView(id)
    })
    target.forEach((id) => {
      if (!mounted.has(id)) this.mountRootView(id)
    })
    this.syncRetainedRootViews()
    if (!this.fullMountFallback) {
      this.syncHeightObserver()
      this.spacerLayer?.sync(this.blockIds, segments, this.heights, (id) => this.doc.vm.get(id)?.instance.hostElement)
    }
    this.restorePendingStructureAnchor(structureRestore)
    this.publishViewChange()
  }

  private rebuildModel(nextBlockIds?: readonly string[]): void {
    const previous = new Map<string, number>()
    this.blockIds.forEach((id, index) => {
      if (index < this.heights.length) previous.set(id, this.heights.get(index))
    })
    this.blockIds = [...(nextBlockIds ?? this.doc.model.getChildrenIds(this.doc.rootId))]
    this.indexById = new Map(this.blockIds.map((id, index) => [id, index]))
    this.heights.bulkInit(
      this.blockIds.map((id) => {
        const retained = previous.get(id)
        if (retained != null) return retained
        const flavour = this.doc.model.getFlavour(id)
        return flavour ? (this.config.estimatedHeights[flavour] ?? DEFAULT_ESTIMATED_HEIGHT) : DEFAULT_ESTIMATED_HEIGHT
      }),
    )
  }

  private resolveRootIndices(blockIds: readonly string[]): number[] {
    const indices = new Set<number>()
    for (const blockId of blockIds) {
      try {
        const index = this.resolveRootIndex(blockId)
        if (index !== undefined) indices.add(index)
      } catch {
        // Structure observation can lead selection/projection cleanup by one
        // turn. A stable ID deleted in that interval owns no render unit.
      }
    }
    return [...indices].sort((left, right) => left - right)
  }

  private resolveRootIndex(blockId: string): number | undefined {
    const path = this.doc.model.getPath(blockId)
    const rootChildId = path?.[0] === this.doc.rootId ? path[1] : undefined
    return rootChildId === undefined ? undefined : this.indexById.get(rootChildId)
  }

  private mountRootIndices(indices: readonly number[], signal?: AbortSignal): void {
    let mountedAny = false
    for (const index of indices) {
      if (signal?.aborted) break
      const id = this.blockIds[index]
      if (id !== undefined && !this.doc.vm.isMounted(id)) {
        this.mountRootView(id)
        mountedAny = true
      }
    }
    if (!mountedAny) return
    if (this.fullMountFallback) {
      this.spacerLayer?.clear()
      this.heightObserver.disconnect()
    } else {
      this.syncHeightObserver()
      this.syncSpacersFromMounted()
    }
    this.publishViewChange()
  }

  private publishViewChange(): void {
    const mountedRootIds = this.doc.vm.getMountedRootChildIds()
    if (arraysEqual(this.lastPublishedMountedIds, mountedRootIds)) return
    this.lastPublishedMountedIds = mountedRootIds
    this.viewChange$.next({mountedRootIds: [...mountedRootIds]})
  }

  private resolveSelectionIndices(selection: SelectionPinSnapshot): number[] {
    const endpoints = [
      this.resolveSelectionEndpoint(selection.anchor),
      this.resolveSelectionEndpoint(selection.head),
    ].filter((endpoint): endpoint is RootSelectionEndpoint => endpoint !== null)
    if (!endpoints.length) return []
    if (endpoints.length === 1) {
      return endpoints[0].fallbackIndex === null ? [] : [endpoints[0].fallbackIndex]
    }

    const [anchor, head] = endpoints
    if (anchor.order === head.order) {
      return uniqueValidIndices([anchor.fallbackIndex, head.fallbackIndex], this.blockIds.length)
    }

    const [start, end] = anchor.order < head.order ? [anchor, head] : [head, anchor]
    if (start.startIndex > end.endIndex) return []
    return uniqueValidIndices(
      [start.startIndex, end.endIndex],
      this.blockIds.length,
    )
  }

  private resolveSelectionEndpoint(point: ISelectionPointJSON): RootSelectionEndpoint | null {
    if (point.type === 'boundary' && point.blockId === this.doc.rootId) {
      const index = clampBoundaryIndex(point.index, this.blockIds.length)
      return {
        order: index * 2,
        startIndex: index,
        endIndex: index - 1,
        fallbackIndex: nearestRootIndex(index, this.blockIds.length),
      }
    }

    const [index] = this.resolveRootIndices([point.blockId])
    if (index === undefined) return null
    return {
      order: index * 2 + 1,
      startIndex: index,
      endIndex: index,
      fallbackIndex: index,
    }
  }

  private syncSelectionPins(): void {
    if (!this.selectionSnapshot) {
      this.pins.unpin('selection')
      return
    }
    this.pins.pin('selection', this.resolveSelectionIndices(this.selectionSnapshot))
  }

  private handleStructureChange(): void {
    try {
      this.synchronizeRootModel(false)
      this.schedule()
    } catch (error) {
      this.handleReconcileFailure(error)
    }
  }

  private synchronizeRootModel(force: boolean): boolean {
    const nextBlockIds = [...this.doc.model.getChildrenIds(this.doc.rootId)]
    // Keep the canonical sparse-root repair pending across any later failure
    // in this synchronization pass. A retry may otherwise repair only the
    // model index while leaving the Angular root order stale.
    this.sparseRootReconcilePending = true
    if (!force && arraysEqual(this.blockIds, nextBlockIds)) {
      // Nested blocks can move between existing root render units without
      // changing the direct-root list. Every stable-ID owner must follow them.
      this.syncStableViewPins()
      this.markStructureRevisionSynchronized()
      return false
    }

    const previousBlockIds = this.blockIds
    if (!this.pendingStructureAnchor) {
      this.pendingStructureAnchor = this.captureCurrentStructureAnchor()
    }
    const previousAnchorIndex = this.pendingStructureAnchor
      ? previousBlockIds.indexOf(this.pendingStructureAnchor.blockId)
      : -1

    this.rebuildModel(nextBlockIds)
    this.pruneRetainedRootViews()
    if (this.pendingStructureAnchor && !this.indexById.has(this.pendingStructureAnchor.blockId)) {
      const fallbackId = findNearestSurvivingId(previousBlockIds, previousAnchorIndex, this.indexById)
      this.pendingStructureAnchor = fallbackId ? {...this.pendingStructureAnchor, blockId: fallbackId} : null
    }

    this.syncStableViewPins()
    this.syncFullDocumentViewLease()
    this.markStructureRevisionSynchronized()
    return true
  }

  private syncStableViewPins(): void {
    this.syncSelectionPins()
    this.pins.pin('projection', this.resolveRootIndices(this.projectionBlockIds))
    this.syncBlockNavigationPin()
    this.syncBlockViewLeases()
  }

  private repairModelStateIfNeeded(): void {
    if (!this.hasModelStateMismatch()) return
    this.synchronizeRootModel(true)
    if (this.hasModelStateMismatch()) {
      throw new Error('virtualization model state remained inconsistent after rebuild')
    }
  }

  private hasModelStateMismatch(): boolean {
    return this.heights.length !== this.blockIds.length ||
      this.indexById.size !== this.blockIds.length ||
      this.synchronizedStructureRevision !== this.readStructureRevision()
  }

  private readStructureRevision(): number {
    const revision = this.doc.model.structureRevision
    return Number.isInteger(revision) && revision >= 0
      ? revision
      : this.synchronizedStructureRevision
  }

  private markStructureRevisionSynchronized(): void {
    this.synchronizedStructureRevision = this.readStructureRevision()
  }

  private handleReconcileFailure(error: unknown): void {
    if (this.disposed) return
    this.reconcileFailureCount++

    if (this.fullMountFallback) {
      if (!this.fallbackMountFailureLogged) {
        this.fallbackMountFailureLogged = true
        this.doc.logger.warn('virtualizationFullMountError: ', error)
      }
      if (this.reconcileFailureCount < MAX_RECONCILE_FAILURES) this.schedule()
      return
    }

    if (this.reconcileFailureCount === 1) {
      this.doc.logger.warn('virtualizationReconcileError: ', error)
    }

    if (this.reconcileFailureCount < MAX_RECONCILE_FAILURES) {
      this.schedule()
      return
    }

    this.fullMountFallback = true
    this.reconcileFailureCount = 0
    this.fallbackMountFailureLogged = false
    this.pendingStructureAnchor = null
    this.spacerLayer?.clear()
    this.heightObserver.disconnect()
    this.doc.logger.warn('virtualizationFallbackToFullMount: ', error)
    this.doc.messageService?.warn?.(FULL_MOUNT_FALLBACK_MESSAGE)
    this.schedule()
  }

  private syncBlockViewLeases(): void {
    const indices = new Set<number>()
    for (const blockIds of this.blockViewLeases.values()) {
      for (const blockId of blockIds) {
        try {
          const index = this.resolveRootIndex(blockId)
          if (index !== undefined) indices.add(index)
        } catch {
          // A structure event can precede the component destroy hook that
          // releases a deleted block's lease. Missing stable IDs are inert.
        }
      }
    }
    const ordered = [...indices].sort((left, right) => left - right)
    if (!ordered.length) {
      this.pins.unpin(BLOCK_VIEW_LEASE_PIN)
      return
    }
    this.pins.pin(BLOCK_VIEW_LEASE_PIN, ordered)
    this.mountRootIndices(ordered)
  }

  private syncBlockNavigationPin(): void {
    const task = this.blockNavigationTask
    if (!task) return
    let index: number | undefined
    try {
      index = this.resolveRootIndex(task.blockId)
    } catch {
      this.finishBlockNavigation(task, false)
      return
    }
    if (index === undefined) {
      this.finishBlockNavigation(task, false)
      return
    }
    this.pins.pin(BLOCK_NAVIGATION_PIN, [index])
  }

  private resolveBlockViewRetention(
    context: BlockViewRetentionContext,
  ): 'virtual' | 'keep-alive' {
    const resolver = this.config.resolveViewRetention
    if (!resolver) return context.schemaRetention

    let resolved: ReturnType<typeof resolver>
    try {
      resolved = resolver(context)
    } catch (error) {
      this.doc.logger.warn('viewRetentionResolverError: ', error)
      return context.schemaRetention
    }
    if (resolved === undefined) return context.schemaRetention
    if (resolved === 'virtual' || resolved === 'keep-alive') return resolved
    this.doc.logger.warn('viewRetentionResolverError: invalid policy', resolved)
    return context.schemaRetention
  }

  private retainUnpinnedViewsBeforeInit(): void {
    if (this.scrollContainer) return
    const pinnedIds = new Set(
      [...this.pins.snapshot()]
        .map(index => this.blockIds[index])
        .filter((id): id is string => id !== undefined),
    )
    this.doc.vm.getMountedRootChildIds().forEach(id => {
      if (!pinnedIds.has(id)) this.retainRootView(id)
    })
    this.publishViewChange()
  }

  private syncFullDocumentViewLease(): void {
    if (this.disposed) return
    if (!this.fullDocumentViewLeaseCount || !this.blockIds.length) {
      this.pins.unpin('full-document-view')
      if (!this.scrollContainer) {
        this.doc.vm.getMountedRootChildIds().forEach(id => this.retainRootView(id))
        this.publishViewChange()
        return
      }
      this.schedule()
      return
    }

    const indices = this.blockIds.map((_, index) => index)
    this.pins.pin('full-document-view', indices)
    this.mountRootIndices(indices)
  }

  private mountRootView(id: string): void {
    this.retainedRootIds.delete(id)
    this.doc.vm.mountRootChild(id)
  }

  private retainRootView(id: string): void {
    const component = this.doc.vm.retainRootChild(id)
    if (!component) return

    this.retainedRootIds.delete(id)
    this.retainedRootIds.set(id, true)
    this.trimRetainedRootViews()
  }

  private syncRetainedRootViews(): void {
    const retained = new Set(this.doc.vm.getRetainedRootChildIds())
    for (const id of [...this.retainedRootIds.keys()]) {
      if (!retained.has(id)) this.retainedRootIds.delete(id)
    }
    for (const id of retained) {
      if (!this.retainedRootIds.has(id)) this.retainedRootIds.set(id, true)
    }
    this.trimRetainedRootViews()
  }

  private trimRetainedRootViews(): void {
    while (this.retainedRootIds.size > this.config.retainedViewLimit) {
      const oldestId = this.retainedRootIds.keys().next().value as string | undefined
      if (oldestId === undefined) break
      this.retainedRootIds.delete(oldestId)
      this.doc.vm.destroyRetainedRootChild(oldestId)
    }
  }

  private pruneRetainedRootViews(): void {
    for (const id of [...this.retainedRootIds.keys()]) {
      if (this.indexById.has(id)) continue
      this.retainedRootIds.delete(id)
      this.doc.vm.destroyRetainedRootChild(id)
    }
  }

  private captureCurrentStructureAnchor(): ScrollAnchorSnapshot | null {
    if (!this.scrollContainer) return null
    const snapshot = captureScrollAnchor(this.blockIds, this.heights, this.getViewportTop())
    if (!snapshot) return null

    const host = this.doc.vm.get(snapshot.blockId)?.instance.hostElement
    if (!host) return snapshot
    const relativeOffset = host.getBoundingClientRect().top - this.scrollContainer.getBoundingClientRect().top
    return Number.isFinite(relativeOffset) ? {...snapshot, relativeOffset} : snapshot
  }

  private restorePendingStructureAnchor(estimated: ReturnType<typeof restoreScrollAnchor>): void {
    const snapshot = this.pendingStructureAnchor
    this.pendingStructureAnchor = null
    if (!snapshot || !this.scrollContainer || !estimated) return

    const host = this.doc.vm.get(snapshot.blockId)?.instance.hostElement
    const measuredCorrection = host
      ? host.getBoundingClientRect().top - this.scrollContainer.getBoundingClientRect().top - snapshot.relativeOffset
      : Number.NaN
    const correction = Number.isFinite(measuredCorrection) ? measuredCorrection : estimated.correctionPx
    if (Math.abs(correction) < 0.5) return

    this.scrollContainer.scrollTop += correction
    this.schedule()
  }

  private expandSegments(segments: readonly RenderedSegment[]): Set<string> {
    const ids = new Set<string>()
    segments.forEach(([start, end]) => {
      for (let index = start; index <= end; index++) ids.add(this.blockIds[index])
    })
    return ids
  }

  private syncSpacersFromMounted(): void {
    const indices = this.doc.vm
      .getMountedRootChildIds()
      .map((id) => this.indexById.get(id))
      .filter((index): index is number => index !== undefined)
      .sort((left, right) => left - right)
    const segments: RenderedSegment[] = []
    for (const index of indices) {
      const last = segments[segments.length - 1]
      if (last && index === last[1] + 1) segments[segments.length - 1] = [last[0], index]
      else segments.push([index, index])
    }
    this.spacerLayer?.sync(this.blockIds, segments, this.heights, (id) => this.doc.vm.get(id)?.instance.hostElement)
  }

  private syncHeightObserver(): void {
    this.heightObserver.sync(this.doc.vm.getMountedRootChildIds(), (id) => this.doc.vm.get(id)?.instance.hostElement)
  }

  private applyMeasurements(measurements: HeightMeasurement[]): void {
    if (!this.scrollContainer || !measurements.length) return
    const viewportTop = this.getViewportTop()
    const anchor = captureScrollAnchor(this.blockIds, this.heights, viewportTop)
    let changed = false
    measurements.forEach(([id, height]) => {
      const index = this.indexById.get(id)
      if (index === undefined || this.heights.get(index) === height) return
      this.heights.update(index, height)
      changed = true
    })
    if (!changed) return

    if (anchor && !this.blockNavigationTask) {
      const restored = restoreScrollAnchor(
        anchor,
        (id) => this.indexById.get(id) ?? -1,
        this.heights,
        viewportTop,
        this.scrollContainer.clientHeight,
      )
      if (restored && Math.abs(restored.correctionPx) >= 0.5) {
        this.scrollContainer.scrollTop += restored.correctionPx
      }
    }
    this.schedule()
  }

  private getViewportTop(): number {
    if (!this.scrollContainer) return 0
    const rootContainer = this.doc.root.childrenRenderRef!.containerElement
    return Math.max(0, this.scrollContainer.getBoundingClientRect().top - rootContainer.getBoundingClientRect().top)
  }

  private centerEstimatedRootIndex(index: number): void {
    const container = this.scrollContainer
    if (!container) return
    const viewportRect = container.getBoundingClientRect()
    const viewportHeight = container.clientHeight || viewportRect.height
    if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return

    const targetCenter = this.heights.getOffset(index) + this.heights.get(index) / 2
    const maxViewportTop = Math.max(0, this.heights.totalHeight - viewportHeight)
    const desiredViewportTop = Math.max(
      0,
      Math.min(targetCenter - viewportHeight / 2, maxViewportTop),
    )
    const correction = desiredViewportTop - this.getViewportTop()
    if (Number.isFinite(correction) && Math.abs(correction) >= BLOCK_NAVIGATION_EPSILON) {
      container.scrollTop += correction
    }
  }

  private readBlockCenterCorrection(blockId: string): number | null {
    const container = this.scrollContainer
    if (!container) return null
    try {
      if (this.resolveRootIndex(blockId) === undefined) return null
    } catch {
      return null
    }

    const target = this.doc.vm.get(blockId)?.instance.hostElement
    const rootContainer = this.doc.root.childrenRenderRef?.containerElement
    if (!target || !rootContainer?.contains(target)) return null

    const targetRect = target.getBoundingClientRect()
    const viewportRect = container.getBoundingClientRect()
    const viewportHeight = container.clientHeight || viewportRect.height
    const targetCenter = targetRect.top + targetRect.height / 2
    const viewportCenter = viewportRect.top + viewportHeight / 2
    const correction = targetCenter - viewportCenter
    return Number.isFinite(correction) ? correction : null
  }

  private scheduleBlockCenterCorrection(task: BlockNavigationTask): void {
    if (task.frame !== null) return
    try {
      task.frame = this.requestFrame(() => {
        if (this.blockNavigationTask !== task) return
        task.frame = null
        try {
          const correction = this.readBlockCenterCorrection(task.blockId)
          if (correction === null) {
            this.finishBlockNavigation(task, false)
            return
          }
          task.frames++
          if (Math.abs(correction) >= BLOCK_NAVIGATION_EPSILON && this.scrollContainer) {
            this.scrollContainer.scrollTop += correction
            this.schedule()
            task.stableFrames = 0
          } else {
            task.stableFrames++
          }
          if (
            task.stableFrames >= BLOCK_NAVIGATION_STABLE_FRAMES ||
            task.frames >= BLOCK_NAVIGATION_MAX_FRAMES
          ) {
            this.finishBlockNavigation(task, true)
            return
          }
          this.scheduleBlockCenterCorrection(task)
        } catch (error) {
          this.failBlockNavigation(task, error)
        }
      })
    } catch (error) {
      this.failBlockNavigation(task, error)
    }
  }

  private cancelBlockNavigation(): void {
    const task = this.blockNavigationTask
    if (!task) return
    this.finishBlockNavigation(task, false)
  }

  private failBlockNavigation(task: BlockNavigationTask, error: unknown): void {
    if (this.blockNavigationTask !== task) return
    this.doc.logger.warn('blockNavigationError: ', error)
    this.finishBlockNavigation(task, false)
  }

  private finishBlockNavigation(task: BlockNavigationTask, success: boolean): void {
    if (this.blockNavigationTask !== task) return
    this.blockNavigationTask = null
    if (task.frame !== null) {
      try {
        this.cancelFrame(task.frame)
      } catch (error) {
        this.doc.logger.warn('blockNavigationFrameCancelError: ', error)
      }
    }
    task.frame = null
    try {
      this.pins.unpin(BLOCK_NAVIGATION_PIN)
    } catch (error) {
      this.doc.logger.warn('blockNavigationPinReleaseError: ', error)
    }
    task.resolve(success)
    try {
      this.schedule()
    } catch (error) {
      this.doc.logger.warn('blockNavigationReconcileScheduleError: ', error)
    }
  }
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function clampBoundaryIndex(index: number | undefined, length: number): number {
  if (!Number.isFinite(index)) return 0
  return Math.max(0, Math.min(Math.floor(index!), length))
}

function nearestRootIndex(boundaryIndex: number, length: number): number | null {
  if (!length) return null
  return boundaryIndex < length ? boundaryIndex : length - 1
}

function uniqueValidIndices(indices: readonly (number | null)[], length: number): number[] {
  return [...new Set(indices.filter((index): index is number => index !== null && index >= 0 && index < length))]
    .sort((left, right) => left - right)
}

function findNearestSurvivingId(
  previousIds: readonly string[],
  anchorIndex: number,
  nextIndices: ReadonlyMap<string, number>,
): string | null {
  if (anchorIndex < 0) return null
  for (let distance = 1; distance < previousIds.length; distance++) {
    const after = previousIds[anchorIndex + distance]
    if (after !== undefined && nextIndices.has(after)) return after
    const before = previousIds[anchorIndex - distance]
    if (before !== undefined && nextIndices.has(before)) return before
  }
  return null
}
