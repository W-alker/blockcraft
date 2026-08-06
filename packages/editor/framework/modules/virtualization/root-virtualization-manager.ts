import {Subject, Subscription} from 'rxjs'
import type {SelectionProjectionMountAdapter} from '../selection/projection-mount-adapter'
import type {ISelectionJSON, ISelectionPointJSON} from '../selection/types'
import {HeightMap} from './height-map'
import {HeightMeasurement, HeightObserver} from './height-observer'
import {
  ContinuousLayoutProjection,
  VerticalLayoutProjection,
} from './layout-projection'
import {PinRegistry} from './pin-registry'
import {mergeToSegments} from './segment-merger'
import {
  captureProjectedScrollAnchor,
  restoreProjectedScrollAnchor,
  ScrollAnchorSnapshot,
} from './scroll-anchor'
import {ProjectionSpacerLayer} from './spacer-layer'
import {
  BlockViewRetentionContext,
  resolveVirtualizationConfig,
  RenderedSegment,
  VirtualizationConfig,
} from './types'
import {calculateProjectedViewportRange} from './viewport-range'
import {
  estimateModelBlockHeight,
  estimateModelBlockHeightDetails,
  modelHeightEstimateAffectedByContentChange,
} from './model-height-estimator'
import {AbsolutePlacementVisibilityIndex} from './absolute-placement-visibility-index'
import type {IBlockModelStructureChange} from '../../doc/model-graph'

const DEFAULT_ESTIMATED_HEIGHT = 48
const BLOCK_NAVIGATION_PIN = 'block-navigation'
const BLOCK_VIEW_LEASE_PIN = 'block-view-leases'
const BLOCK_NAVIGATION_EPSILON = 1
const BLOCK_NAVIGATION_STABLE_FRAMES = 2
const BLOCK_NAVIGATION_MAX_FRAMES = 8
const MAX_RECONCILE_FAILURES = 3
const MAX_CUSTOM_PROJECTION_FAILURES = 3
const FULL_MOUNT_FALLBACK_MESSAGE = '虚拟渲染异常，已切换为完整渲染'
const ABSOLUTE_PLACEMENT_OVERSCAN_VIEWPORTS = 1
const SEGMENT_MERGE_MAX_VIEWPORT_RATIO = 0.25

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
  projectionWaitFrames: number
  stableFrames: number
}

export interface VirtualizationViewChange {
  mountedRootIds: readonly string[]
}

/** @internal Lifecycle hooks for one exclusive custom layout projection. */
export interface LayoutProjectionRegistrationHooks {
  /**
   * Runs after the continuous-coordinate anchor is captured and before the
   * custom projection becomes active.
   */
  readonly beforeActivate?: () => void
  /**
   * Runs after the old-coordinate anchor is captured and before continuous
   * layout becomes active again. Pagination uses this to remove reversible
   * DOM geometry while the transition is paused.
   */
  readonly beforeDeactivate?: () => void
  /**
   * Returns true while the owner intentionally keeps the previous projection
   * stable across an asynchronous model/layout transition.
   */
  readonly isValidationDeferred?: () => boolean
  /** Called after a broken custom projection has fallen back to continuous layout. */
  readonly onInvalid?: (error: unknown) => void
}

type LayoutProjectionRegistrar = (
  projection: VerticalLayoutProjection,
  hooks?: LayoutProjectionRegistrationHooks,
) => () => void

const layoutProjectionRegistrars = new WeakMap<object, LayoutProjectionRegistrar>()

export class RootVirtualizationManager implements SelectionProjectionMountAdapter {
  private readonly config
  private readonly heights = new HeightMap()
  private readonly continuousLayoutProjection = new ContinuousLayoutProjection(this.heights)
  private layoutProjection: VerticalLayoutProjection = this.continuousLayoutProjection
  private readonly pins = new PinRegistry()
  private readonly heightObserver = new HeightObserver(
    (values) => this.applyMeasurements(values),
    undefined,
    () => this.doc.viewScale?.geometryScale ?? 1,
  )
  private readonly absolutePlacementVisibility: AbsolutePlacementVisibilityIndex
  private readonly subscriptions = new Subscription()
  private blockIds: string[] = []
  private indexById = new Map<string, number>()
  private spacerLayer: ProjectionSpacerLayer | null = null
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
  private customLayoutProjection: VerticalLayoutProjection | null = null
  private customLayoutProjectionSubscription: Subscription | null = null
  private customLayoutProjectionHooks: LayoutProjectionRegistrationHooks | null = null
  private customProjectionValidationPending = false
  private customProjectionFailureCount = 0

  readonly viewChange$ = new Subject<VirtualizationViewChange>()

  private readonly onScroll = () => {
    if (this.pendingStructureAnchor && !this.blockNavigationTask) {
      // A projection/structure update may capture an anchor one frame before
      // reconciliation. If the viewport moves in that interval, the newer
      // viewport position owns restoration; replaying the stale anchor would
      // snap a user scroll back to its previous location.
      this.pendingStructureAnchor = this.captureCurrentStructureAnchor()
    }
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
    this.absolutePlacementVisibility =
      new AbsolutePlacementVisibilityIndex(this.doc, this.config.estimatedHeights)
    layoutProjectionRegistrars.set(
      this,
      (projection, hooks) => this.registerLayoutProjection(projection, hooks),
    )
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
    this.spacerLayer = new ProjectionSpacerLayer(this.doc.root.childrenRenderRef!.containerElement)
    this.rebuildModel()
    this.markStructureRevisionSynchronized()
    this.unregisterSelectionAdapter = this.doc.selection.registerProjectionMountAdapter(this)
    this.unregisterPins = this.pins.subscribe(() => this.schedule())
    this.syncBlockViewLeases()
    this.syncFullDocumentViewLease()
    this.subscriptions.add(this.doc.model.structureChange$.subscribe(change => this.handleStructureChange(change)))
    if (this.doc.viewScale?.scale$) {
      this.subscriptions.add(this.doc.viewScale.scale$.subscribe(() => this.schedule()))
    }
    const objectSizing = this.doc.objectSizing
    if (objectSizing?.widthChange$) {
      this.subscriptions.add(
        objectSizing.widthChange$.subscribe(() => {
          this.refreshModelEstimates()
        }),
      )
    }
    const layoutMetricsChange$ = this.doc.layoutMetrics?.change$
    if (layoutMetricsChange$) {
      this.subscriptions.add(
        layoutMetricsChange$.subscribe(() => {
          this.refreshModelEstimates()
        }),
      )
    }
    const contentChange$ = this.doc.model.contentChange$
    if (contentChange$) {
      this.subscriptions.add(
        contentChange$.subscribe(change => {
          this.refreshModelEstimates(
            change.blockIds,
            change.kinds?.includes('props') ?? true,
            blockId => modelHeightEstimateAffectedByContentChange(
              this.doc,
              blockId,
              change,
            ),
          )
        }),
      )
    }
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
    layoutProjectionRegistrars.delete(this)
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
    try {
      this.customLayoutProjectionHooks?.beforeDeactivate?.()
    } catch (error) {
      this.doc.logger.warn('layoutProjectionCleanupError: ', error)
    }
    this.customLayoutProjectionSubscription?.unsubscribe()
    this.customLayoutProjectionSubscription = null
    this.customLayoutProjection = null
    this.customLayoutProjectionHooks = null
    this.customProjectionValidationPending = false
    this.customProjectionFailureCount = 0
    this.continuousLayoutProjection.dispose()
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
   * the estimated projected-layout jump.
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
      projectionWaitFrames: 0,
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
    if (!this.isLayoutProjectionGeometryReady()) {
      this.scheduleBlockNavigationProjectionWait(task)
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

  /**
   * Install one exclusive custom vertical layout projection.
   *
   * @internal Pagination is currently the only package-internal owner. The
   * projection must expose stable blockIds matching the canonical root order.
   */
  private registerLayoutProjection(
    projection: VerticalLayoutProjection,
    hooks: LayoutProjectionRegistrationHooks = {},
  ): () => void {
    if (!this.enabled || this.disposed) return () => undefined
    if (projection === this.continuousLayoutProjection) {
      throw new Error('Continuous layout projection is managed internally')
    }
    if (this.customLayoutProjection) {
      throw new Error('A custom layout projection is already registered')
    }

    // Pagination can be enabled from a host's initial-view input in the short
    // interval after the model/root exist but before virtualization.init()
    // installs the scroll container. Its projection is already canonical at
    // that point, while this manager's lazy model index is still empty.
    // Synchronize model-only state before strict validation; this does not
    // mount views or weaken genuinely stale projection detection.
    if (!this.blockIds.length && projection.length) this.rebuildModel()
    this.validateProjection(projection)
    const anchor = this.pendingStructureAnchor ?? this.captureCurrentStructureAnchor()
    this.cancelScheduledReconcile()
    this.heightObserver.disconnect()
    try {
      hooks.beforeActivate?.()
    } catch (error) {
      try {
        hooks.beforeDeactivate?.()
      } catch (cleanupError) {
        this.doc.logger.warn('layoutProjectionCleanupError: ', cleanupError)
      }
      this.pendingStructureAnchor = anchor
      this.syncHeightObserver()
      this.schedule()
      throw error
    }
    this.customLayoutProjection = projection
    this.customLayoutProjectionHooks = hooks
    this.layoutProjection = projection
    this.customProjectionValidationPending = false
    this.customProjectionFailureCount = 0
    const projectionSubscription = new Subscription()
    if (projection.willChange$) {
      projectionSubscription.add(projection.willChange$.subscribe(() => {
        if (this.customLayoutProjection !== projection || this.disposed) return
        this.pendingStructureAnchor ??= this.captureCurrentStructureAnchor()
        this.cancelScheduledReconcile()
      }))
    }
    projectionSubscription.add(projection.change$.subscribe(() => {
      if (this.customLayoutProjection !== projection || this.disposed) return
      this.customProjectionValidationPending = true
      this.schedule()
    }))
    this.customLayoutProjectionSubscription = projectionSubscription
    this.pendingStructureAnchor = anchor
    this.schedule()

    let active = true
    return () => {
      if (!active) return
      active = false
      if (this.customLayoutProjection !== projection || this.disposed) return
      this.deactivateCustomLayoutProjection()
    }
  }

  /** @internal Resume sparse-root reconciliation after native IME releases the DOM. */
  settleCompositionView(): void {
    try {
      this.doc.vm._flushDeferredSparseRootOrder()
      // A structure-changing composition (gap/boundary/table materialization)
      // can leave a custom layout projection intentionally behind the model
      // until pagination recomputes after compositionend. Always schedule once
      // so a pending validation is resumed even when no DOM reorder was queued.
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
    if (this.customProjectionValidationPending) {
      // Pagination deliberately freezes its last stable projection for the
      // complete model-owned IME session. Gap/boundary/table composition may
      // synchronously change root order before that projection is allowed to
      // update, so the mismatch is expected and must not consume the bounded
      // corruption-fallback budget. Do not poll each frame; compositionend and
      // the eventual projection change both schedule reconciliation.
      if (this.isCustomProjectionValidationDeferred()) return
      try {
        this.validateProjection(this.layoutProjection)
        this.customProjectionValidationPending = false
        this.customProjectionFailureCount = 0
      } catch (error) {
        this.customProjectionFailureCount++
        if (this.customProjectionFailureCount < MAX_CUSTOM_PROJECTION_FAILURES) {
          this.schedule()
        } else {
          this.invalidateCustomLayoutProjection(error)
        }
        return
      }
    }
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
    const currentScrollTop = this._visualToLayout(
      Math.max(0, viewportRect.top - rootRect.top),
    )
    const layoutViewportHeight = this._visualToLayout(
      this.scrollContainer.clientHeight || viewportRect.height,
    )
    const structureRestore = this.pendingStructureAnchor
      ? restoreProjectedScrollAnchor(
          this.pendingStructureAnchor,
          (id) => this.indexById.get(id) ?? -1,
          this.layoutProjection,
          currentScrollTop,
          layoutViewportHeight,
        )
      : null
    const scrollTop = structureRestore?.scrollTop ?? currentScrollTop
    const viewportHeight = layoutViewportHeight
    const viewport = calculateProjectedViewportRange(
      this.layoutProjection,
      scrollTop,
      viewportHeight,
      this.config.overscanViewports,
    )
    const configuredPlacementOriginY = Number.parseFloat(
      rootContainer.style.getPropertyValue(
        '--bc-placement-content-origin-y',
      ),
    )
    const absoluteViewportTop = scrollTop - (
      Number.isFinite(configuredPlacementOriginY)
        ? configuredPlacementOriginY
        : 0
    )
    const visibleAbsoluteLayouts = this.absolutePlacementVisibility
      .visibleLayoutIds(
        absoluteViewportTop,
        viewportHeight,
        viewportHeight * ABSOLUTE_PLACEMENT_OVERSCAN_VIEWPORTS,
      )
    const mountIndices = new Set(this.pins.snapshot())
    visibleAbsoluteLayouts.forEach(id => {
      const index = this.indexById.get(id)
      if (index !== undefined) mountIndices.add(index)
    })
    const segments: RenderedSegment[] = this.fullMountFallback
      ? [[0, this.blockIds.length - 1]]
      : mergeToSegments(
          viewport,
          mountIndices,
          this.config.segmentMergeGap,
          this.blockIds.length,
          (start, end) => this.layoutProjection.rangeHeight(start, end) <=
            viewportHeight * SEGMENT_MERGE_MAX_VIEWPORT_RATIO,
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
      if (this.layoutProjection === this.continuousLayoutProjection) {
        this.syncHeightObserver()
      } else {
        this.heightObserver.disconnect()
      }
      this.spacerLayer?.sync(
        this.blockIds,
        segments,
        this.layoutProjection,
        (id) => this.doc.vm.get(id)?.instance.hostElement,
      )
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
        return this.resolveEstimatedHeight(id)
      }),
    )
    this.absolutePlacementVisibility.rebuild(this.blockIds)
    this.continuousLayoutProjection.notifyChange()
  }

  private resolveEstimatedHeight(blockId: string): number {
    return estimateModelBlockHeight(this.doc, blockId, {
      estimatedHeights: this.config.estimatedHeights,
      defaultHeight: DEFAULT_ESTIMATED_HEIGHT,
      layoutMode: 'flow',
    })
  }

  private refreshModelEstimates(
    changedBlockIds?: readonly string[],
    refreshAbsoluteVisibility = changedBlockIds === undefined,
    shouldRefreshHeight: (blockId: string) => boolean = () => true,
  ): void {
    if (!this.scrollContainer || !this.blockIds.length) return
    const rootIds = changedBlockIds
      ? new Set(changedBlockIds.flatMap(blockId => {
          const path = this.doc.model.getPath(blockId)
          const rootId = path?.[0] === this.doc.rootId ? path[1] : undefined
          return rootId ? [rootId] : []
        }))
      : new Set(this.blockIds)
    const absoluteVisibilityChanged =
      refreshAbsoluteVisibility &&
      [...rootIds].some(
        blockId =>
          this.doc.model.getFlavour(blockId) === 'placement-layout',
      )
    if (absoluteVisibilityChanged) {
      this.absolutePlacementVisibility.rebuild(this.blockIds)
    }
    const measurements: HeightMeasurement[] = []
    rootIds.forEach(blockId => {
      if (!shouldRefreshHeight(blockId)) return
      const estimate = estimateModelBlockHeightDetails(this.doc, blockId, {
        estimatedHeights: this.config.estimatedHeights,
        defaultHeight: DEFAULT_ESTIMATED_HEIGHT,
        layoutMode: 'flow',
      })
      if (estimate.modelDriven) {
        measurements.push([blockId, estimate.height])
      }
    })
    this.applyMeasurements(measurements)
    if (absoluteVisibilityChanged) this.schedule()
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
      if (this.layoutProjection === this.continuousLayoutProjection) {
        this.syncHeightObserver()
      } else {
        this.heightObserver.disconnect()
      }
      // A structure transaction updates blockIds before a custom projection
      // owner can commit matching geometry. Selection may still synchronously
      // mount the inserted block, but stale range reads must wait for change$.
      if (this.isLayoutProjectionGeometryReady()) {
        this.syncSpacersFromMounted()
      }
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

  private handleStructureChange(
    change?: Pick<IBlockModelStructureChange, 'affectedRootIds'>,
  ): void {
    try {
      this.synchronizeRootModel(false)
      if (change?.affectedRootIds?.length) {
        this.refreshModelEstimates(change.affectedRootIds)
      }
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
      this.absolutePlacementVisibility.rebuild(nextBlockIds)
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
    if (this.customLayoutProjection) {
      this.customProjectionValidationPending = true
    }
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
    const snapshot = captureProjectedScrollAnchor(
      this.blockIds,
      this.layoutProjection,
      this.getViewportTop(),
    )
    if (!snapshot) return null

    const host = this.doc.vm.get(snapshot.blockId)?.instance.hostElement
    if (!host) return snapshot
    const relativeOffset = host.getBoundingClientRect().top - this.scrollContainer.getBoundingClientRect().top
    return Number.isFinite(relativeOffset) ? {...snapshot, relativeOffset} : snapshot
  }

  private restorePendingStructureAnchor(
    estimated: ReturnType<typeof restoreProjectedScrollAnchor>,
  ): void {
    const snapshot = this.pendingStructureAnchor
    this.pendingStructureAnchor = null
    if (!snapshot || !this.scrollContainer || !estimated) return

    const host = this.doc.vm.get(snapshot.blockId)?.instance.hostElement
    const measuredCorrection = host
      ? host.getBoundingClientRect().top - this.scrollContainer.getBoundingClientRect().top - snapshot.relativeOffset
      : Number.NaN
    const correction = Number.isFinite(measuredCorrection)
      ? measuredCorrection
      : this._layoutToVisual(estimated.correctionPx)
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
    this.spacerLayer?.sync(
      this.blockIds,
      segments,
      this.layoutProjection,
      (id) => this.doc.vm.get(id)?.instance.hostElement,
    )
  }

  private isLayoutProjectionGeometryReady(): boolean {
    return this.layoutProjection === this.continuousLayoutProjection ||
      !this.customProjectionValidationPending
  }

  private syncHeightObserver(): void {
    this.heightObserver.sync(this.doc.vm.getMountedRootChildIds(), (id) => this.doc.vm.get(id)?.instance.hostElement)
  }

  private applyMeasurements(measurements: HeightMeasurement[]): void {
    if (
      !this.scrollContainer ||
      !measurements.length ||
      this.layoutProjection !== this.continuousLayoutProjection
    ) {
      return
    }
    const viewportTop = this.getViewportTop()
    const anchor = captureProjectedScrollAnchor(
      this.blockIds,
      this.layoutProjection,
      viewportTop,
    )
    let changed = false
    measurements.forEach(([id, height]) => {
      const index = this.indexById.get(id)
      if (index === undefined || this.heights.get(index) === height) return
      this.heights.update(index, height)
      changed = true
    })
    if (!changed) return
    this.continuousLayoutProjection.notifyChange()

    if (anchor && !this.blockNavigationTask) {
      const restored = restoreProjectedScrollAnchor(
        anchor,
        (id) => this.indexById.get(id) ?? -1,
        this.layoutProjection,
        viewportTop,
        this._visualToLayout(this.scrollContainer.clientHeight),
      )
      if (restored && Math.abs(restored.correctionPx) >= 0.5) {
        this.scrollContainer.scrollTop += this._layoutToVisual(
          restored.correctionPx,
        )
      }
    }
    this.schedule()
  }

  private getViewportTop(): number {
    if (!this.scrollContainer) return 0
    const rootContainer = this.doc.root.childrenRenderRef!.containerElement
    return this._visualToLayout(
      Math.max(
        0,
        this.scrollContainer.getBoundingClientRect().top - rootContainer.getBoundingClientRect().top,
      ),
    )
  }

  private _visualToLayout(value: number): number {
    return this.doc.viewScale?.visualToLayout(value) ?? value
  }

  private _layoutToVisual(value: number): number {
    return this.doc.viewScale?.layoutToVisual(value) ?? value
  }

  private validateProjection(projection: VerticalLayoutProjection): void {
    if (projection.length !== this.blockIds.length) {
      throw new Error(
        `Layout projection length mismatch: expected ${this.blockIds.length}, received ${projection.length}`,
      )
    }
    const projectedIds = projection.blockIds
    if (!projectedIds || !arraysEqual(projectedIds, this.blockIds)) {
      throw new Error('Layout projection block order does not match the document root')
    }
  }

  private isCustomProjectionValidationDeferred(): boolean {
    if (
      this.doc.event?.status?.isComposing ||
      !(this.doc.inputManger?.compositionSession?.isIdle ?? true)
    ) {
      return true
    }
    return this.customLayoutProjectionHooks?.isValidationDeferred?.() === true
  }

  private cancelScheduledReconcile(): void {
    if (this.frame === null) return
    this.cancelFrame(this.frame)
    this.frame = null
  }

  private deactivateCustomLayoutProjection(): void {
    const projection = this.customLayoutProjection
    if (!projection) return
    const anchor = this.pendingStructureAnchor ?? this.captureCurrentStructureAnchor()
    this.cancelScheduledReconcile()
    this.customLayoutProjectionSubscription?.unsubscribe()
    this.customLayoutProjectionSubscription = null
    const hooks = this.customLayoutProjectionHooks
    this.customLayoutProjection = null
    this.customLayoutProjectionHooks = null
    this.customProjectionValidationPending = false
    this.customProjectionFailureCount = 0
    try {
      hooks?.beforeDeactivate?.()
    } finally {
      this.layoutProjection = this.continuousLayoutProjection
      this.pendingStructureAnchor = anchor
      this.syncHeightObserver()
      this.schedule()
    }
  }

  private invalidateCustomLayoutProjection(error: unknown): void {
    const hooks = this.customLayoutProjectionHooks
    try {
      this.deactivateCustomLayoutProjection()
    } catch (cleanupError) {
      this.doc.logger.warn('layoutProjectionCleanupError: ', cleanupError)
    }
    this.doc.logger.warn('layoutProjectionInvalid: ', error)
    try {
      hooks?.onInvalid?.(error)
    } catch (callbackError) {
      this.doc.logger.warn('layoutProjectionInvalidCallbackError: ', callbackError)
    }
  }

  private centerEstimatedRootIndex(index: number): void {
    const container = this.scrollContainer
    if (!container) return
    const viewportRect = container.getBoundingClientRect()
    const viewportHeight = this._visualToLayout(
      container.clientHeight || viewportRect.height,
    )
    if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return

    const targetPosition = this.layoutProjection.contentOffsetAt(index)
    const maxViewportTop = Math.max(
      0,
      this.layoutProjection.totalHeight - viewportHeight,
    )
    const desiredViewportTop = Math.max(
      0,
      Math.min(targetPosition - viewportHeight / 2, maxViewportTop),
    )
    const correction = desiredViewportTop - this.getViewportTop()
    if (Number.isFinite(correction) && Math.abs(correction) >= BLOCK_NAVIGATION_EPSILON) {
      container.scrollTop += this._layoutToVisual(correction)
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

  private scheduleBlockNavigationProjectionWait(task: BlockNavigationTask): void {
    if (task.frame !== null) return
    try {
      task.frame = this.requestFrame(() => {
        if (this.blockNavigationTask !== task) return
        task.frame = null
        task.projectionWaitFrames++
        if (task.projectionWaitFrames >= BLOCK_NAVIGATION_MAX_FRAMES) {
          this.finishBlockNavigation(task, false)
          return
        }
        this.startBlockNavigation(task)
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

/**
 * @internal Package-private bridge used by Pagination without extending the
 * public RootVirtualizationManager contract.
 */
export function registerRootLayoutProjection(
  manager: RootVirtualizationManager,
  projection: VerticalLayoutProjection,
  hooks: LayoutProjectionRegistrationHooks = {},
): () => void {
  const registrar = layoutProjectionRegistrars.get(manager)
  if (registrar) return registrar(projection, hooks)

  // Narrow compatibility seam for controller tests and older internal mocks.
  const compatible = manager as unknown as {
    registerLayoutProjection?: LayoutProjectionRegistrar
  }
  if (typeof compatible.registerLayoutProjection === 'function') {
    return compatible.registerLayoutProjection(projection, hooks)
  }
  throw new Error('Root layout projection registration is unavailable')
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
