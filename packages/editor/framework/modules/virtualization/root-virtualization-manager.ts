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
  estimateModelBlockHeightDetails,
  type ModelHeightEstimate,
  type ModelHeightEstimateApplicationState,
  modelHeightEstimateAffectedByContentChange,
  shouldApplyModelHeightEstimate,
} from './model-height-estimator'
import {AbsolutePlacementVisibilityIndex} from './absolute-placement-visibility-index'
import type {IBlockModelStructureChange} from '../../doc/model-graph'
import {BlockNodeType} from '../../block-std/types'
import {IdlePrefetchScheduler} from './idle-prefetch-scheduler'

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
const HEIGHT_MEASUREMENT_EPSILON = 0.5
const IDLE_PREFETCH_NEAR_PIN = 'idle-prefetch-near'
const IDLE_PREFETCH_MAX_ROOTS_PER_EPISODE = 32
const IDLE_PREFETCH_MAX_MOUNT_TIME_PER_EPISODE = 100
const IDLE_PREFETCH_LONG_MOUNT_MS = 8
const IDLE_PREFETCH_MAX_CONSECUTIVE_FAILURES = 3
const IDLE_PREFETCH_MAX_MEASUREMENT_FRAMES = 4
const IDLE_PREFETCH_DIAGNOSTIC_SAMPLE_LIMIT = 128
const IDLE_PREFETCH_TRACE_LIMIT = 256
const VIRTUAL_DOCUMENT_VIEWPORT_EPSILON = 0.001
const VIRTUAL_DOCUMENT_HASH_OFFSET = 2166136261
const VIRTUAL_DOCUMENT_HASH_PRIME = 16777619

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

interface ReconciledWindowSnapshot {
  readonly projection: VerticalLayoutProjection
  readonly projectionRevision: number
  readonly segments: readonly RenderedSegment[]
  readonly visibleAbsoluteLayoutIds: readonly string[]
  readonly mountedRootIds: readonly string[]
  readonly retainedRootIds: readonly string[]
}

interface ContinuousEstimateSemantics {
  readonly flavour: unknown
  readonly nodeType: unknown
  readonly heading: unknown
}

interface ContinuousModelEstimateApplication {
  readonly id: string
  readonly index: number
  readonly estimate: ModelHeightEstimate
  readonly semantics: ContinuousEstimateSemantics
  readonly provenance: ModelHeightEstimateApplicationState
  readonly geometryChanged: boolean
}

interface IdlePrefetchSweepTask {
  readonly blockId: string
  readonly flavour: string
  readonly ticket: number
  releaseLease: () => void
  leaseAcquired: boolean
  frame: number | null
  waitedFrames: number
}

interface IdlePrefetchSweepCursor {
  readonly ticket: number
  readonly projection: VerticalLayoutProjection
  readonly viewportStart: number
  readonly viewportEnd: number
  forwardIndex: number
  backwardIndex: number
}

type IdlePrefetchTraceLane = 'near' | 'sweep'
type IdlePrefetchTraceKind =
  | 'episode-start'
  | 'slice-start'
  | 'near-window-calculated'
  | 'candidate-selected'
  | 'prefetch-mount-start'
  | 'component-created'
  | 'component-reused'
  | 'mount-complete'
  | 'measurement-accepted'
  | 'measurement-stale'
  | 'lease-released'
  | 'component-destroyed'
  | 'release-deferred'
  | 'viewport-handoff'
  | 'cancelled'
  | 'invalidated'
  | 'failure'
  | 'disabled'
type IdlePrefetchTracePhase =
  | 'episode'
  | 'slice'
  | 'calculation'
  | 'candidate'
  | 'mount'
  | 'measurement'
  | 'lease'
  | 'component'
  | 'handoff'
  | 'lifecycle'
  | 'failure'

interface IdlePrefetchTraceEvent {
  readonly sequence: number
  readonly timestamp: number
  readonly phase: IdlePrefetchTracePhase
  readonly kind: IdlePrefetchTraceKind
  readonly lane?: IdlePrefetchTraceLane
  readonly rootId?: string
  readonly flavour?: string
  readonly durationMs?: number
  readonly projectedHeight?: number
  readonly viewportHeight?: number
  readonly estimatedHeight?: number
  readonly measuredHeight?: number
  readonly reason?: string
  readonly epoch?: number
  readonly count?: number
  readonly budgetMs?: number
  readonly didTimeout?: boolean
  readonly direction?: -1 | 1
}

interface IdlePrefetchMeasurementTraceDetails {
  readonly estimatedHeight?: number
  readonly measuredHeight?: number
}

type IdlePrefetchTraceInput = Omit<
  IdlePrefetchTraceEvent,
  'sequence' | 'timestamp'
>

type VirtualDocumentHeightState = 'estimated' | 'measured' | 'stale'
type VirtualDocumentViewState =
  | 'unmounted'
  | 'retained'
  | 'mounted'
  | 'near'
  | 'sweep'
  | 'viewport'

const VIRTUAL_DOCUMENT_HEIGHT_STATE_CODE: Readonly<
  Record<VirtualDocumentHeightState, number>
> = {estimated: 1, measured: 2, stale: 3}
const VIRTUAL_DOCUMENT_VIEW_STATE_CODE: Readonly<
  Record<VirtualDocumentViewState, number>
> = {
  unmounted: 1,
  retained: 2,
  mounted: 3,
  near: 4,
  sweep: 5,
  viewport: 6,
}

interface VirtualDocumentRootSnapshot {
  readonly id: string
  readonly index: number
  readonly flavour: string
  readonly offset: number
  readonly height: number
  readonly heightState: VirtualDocumentHeightState
  readonly viewState: VirtualDocumentViewState
}

interface VirtualDocumentSnapshot {
  readonly revision: number
  readonly projectionKind: 'continuous' | 'custom'
  readonly projectionRevision: number
  readonly totalHeight: number
  readonly viewportTop: number
  readonly viewportHeight: number
  readonly roots: readonly VirtualDocumentRootSnapshot[]
}

/** @internal Bounded telemetry snapshot for Playground and focused tests. */
export interface IdlePrefetchDiagnostics {
  readonly enabled: boolean
  readonly disabled: boolean
  readonly candidates: number
  readonly nearMounts: number
  readonly sweepMounts: number
  readonly hits: number
  readonly cancellations: number
  readonly failures: number
  readonly deniedFlavours: readonly string[]
  readonly mountDurations: readonly number[]
  readonly estimateErrors: readonly number[]
  readonly anchorCorrections: readonly number[]
  readonly failureReasons: Readonly<Record<string, number>>
}

type IdlePrefetchDiagnosticsRuntime = IdlePrefetchDiagnostics & {
  readonly trace: readonly IdlePrefetchTraceEvent[]
  readonly virtualDocument: VirtualDocumentSnapshot
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
type IdlePrefetchHandoffListener = (rootIds: readonly string[]) => void

const layoutProjectionRegistrars = new WeakMap<object, LayoutProjectionRegistrar>()
const idlePrefetchHandoffListeners = new WeakMap<
  object,
  Set<IdlePrefetchHandoffListener>
>()
const idlePrefetchMeasurementReporters = new WeakMap<
  object,
  (rootIds: readonly string[]) => boolean
>()
const idlePrefetchInvalidators = new WeakMap<
  object,
  (reason: string) => void
>()
const idlePrefetchPendingMeasurementQueries = new WeakMap<
  object,
  (rootIds: readonly string[]) => boolean
>()
const idlePrefetchPendingMeasurementReaders = new WeakMap<
  object,
  (rootIds: readonly string[]) => readonly string[]
>()

export class RootVirtualizationManager implements SelectionProjectionMountAdapter {
  private readonly config
  private readonly heights = new HeightMap()
  private readonly continuousLayoutProjection = new ContinuousLayoutProjection(this.heights)
  private layoutProjection: VerticalLayoutProjection = this.continuousLayoutProjection
  private continuousHeightProvenance =
    new Map<string, ModelHeightEstimateApplicationState>()
  private continuousEstimateSemantics =
    new Map<string, ContinuousEstimateSemantics>()
  private readonly dirtyContinuousEstimateRootIds = new Set<string>()
  private readonly stronglyInvalidContinuousEstimateRootIds = new Set<string>()
  private dirtyAllContinuousEstimates = false
  private continuousEstimateJournalSuspended = false
  private continuousProjectionChangePending = false
  private customProjectionHandoffInProgress = false
  private absolutePlacementRootIds = new Set<string>()
  private readonly pins = new PinRegistry()
  private readonly heightObserver = new HeightObserver(
    (values) => this.applyObservedMeasurements(values),
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
  // Scroll-only frames may reuse the last DOM window. Every other scheduling
  // source increments this revision, including pins, structure, measurements,
  // projection changes, resize, navigation and fallback retries.
  private reconcileInvalidationRevision = 0
  private reconciledInvalidationRevision = -1
  private lastReconciledWindow: ReconciledWindowSnapshot | null = null
  private virtualDocumentViewportTop = 0
  private virtualDocumentViewportHeight = 0
  private virtualDocumentViewportProjection: VerticalLayoutProjection | null = null
  private virtualDocumentViewportProjectionRevision = -1
  private virtualDocumentRevision = 0
  private virtualDocumentSignatureHash: number | null = null
  private idlePrefetchScheduler: IdlePrefetchScheduler | null = null
  private idlePrefetchTicket = 0
  private idlePrefetchDisabled = false
  private idlePrefetchEpisodeActive = false
  private idlePrefetchEpisodeRoots = 0
  private idlePrefetchEpisodeMountTime = 0
  private idlePrefetchDirection: -1 | 1 = 1
  private idlePrefetchLastScrollTop = 0
  private idlePrefetchPointerActive = false
  private idlePrefetchConsecutiveFailures = 0
  private idlePrefetchActiveSweep: IdlePrefetchSweepTask | null = null
  private idlePrefetchSweepCursor: IdlePrefetchSweepCursor | null = null
  private idlePrefetchMeasurementEpoch = 0
  private idlePrefetchRevalidationFrame: number | null = null
  private readonly idlePrefetchNearRootIds = new Set<string>()
  private readonly idlePrefetchAttemptedRootIds = new Set<string>()
  private readonly idlePrefetchPendingMeasurementRootIds = new Set<string>()
  private readonly idlePrefetchMeasuredEpochByRoot = new Map<string, number>()
  private readonly idlePrefetchDeniedFlavours = new Set<string>()
  private readonly idlePrefetchEvictRootIds = new Set<string>()
  private readonly idlePrefetchInvalidatedRootIds = new Set<string>()
  private readonly idlePrefetchRevalidationRootIds = new Set<string>()
  private readonly idlePrefetchMountDurations: number[] = []
  private readonly idlePrefetchEstimateErrors: number[] = []
  private readonly idlePrefetchAnchorCorrections: number[] = []
  private readonly idlePrefetchFailureReasons = new Map<string, number>()
  private idlePrefetchCandidateCount = 0
  private idlePrefetchNearMountCount = 0
  private idlePrefetchSweepMountCount = 0
  private idlePrefetchHitCount = 0
  private idlePrefetchCancellationCount = 0
  private idlePrefetchFailureCount = 0
  private idlePrefetchTraceSequence = 0
  private idlePrefetchTraceStart = 0
  private idlePrefetchTraceSize = 0
  private readonly idlePrefetchTraceRing =
    new Array<IdlePrefetchTraceEvent | undefined>(IDLE_PREFETCH_TRACE_LIMIT)

  readonly viewChange$ = new Subject<VirtualizationViewChange>()

  private readonly onScroll = () => {
    const scrollTop = this.scrollContainer?.scrollTop ?? 0
    if (Math.abs(scrollTop - this.idlePrefetchLastScrollTop) > 0.5) {
      this.idlePrefetchDirection = scrollTop >= this.idlePrefetchLastScrollTop ? 1 : -1
      this.idlePrefetchLastScrollTop = scrollTop
    }
    this.pauseIdlePrefetch('scroll', true)
    if (
      this.pendingStructureAnchor &&
      !this.blockNavigationTask &&
      !this.customProjectionHandoffInProgress
    ) {
      // A projection/structure update may capture an anchor one frame before
      // reconciliation. If the viewport moves in that interval, the newer
      // viewport position owns restoration; replaying the stale anchor would
      // snap a user scroll back to its previous location.
      this.pendingStructureAnchor = this.captureCurrentStructureAnchor()
    }
    if (!this.fullMountFallback) this.schedule(false)
  }
  private readonly onResize = () => {
    this.invalidateIdlePrefetch('resize', true)
    if (!this.fullMountFallback) this.schedule()
  }
  private readonly onIdlePrefetchInteractionStart = (event: Event) => {
    if (event.type === 'pointerdown' || event.type === 'dragstart') {
      this.idlePrefetchPointerActive = true
    }
    this.pauseIdlePrefetch(
      event.type,
      true,
      event.type === 'beforeinput' ||
        event.type === 'compositionstart' ||
        event.type === 'dragstart',
    )
    if (
      this.idlePrefetchInvalidatedRootIds.size &&
      event.type !== 'pointerdown' &&
      event.type !== 'compositionstart' &&
      event.type !== 'dragstart' &&
      !this.fullMountFallback
    ) {
      this.schedule()
    }
    if (
      event.type !== 'pointerdown' &&
      event.type !== 'dragstart' &&
      event.type !== 'compositionstart'
    ) {
      this.armIdlePrefetch()
    }
  }
  private readonly onIdlePrefetchInteractionEnd = (event: Event) => {
    if (event.type === 'pointerup' || event.type === 'pointercancel' || event.type === 'dragend') {
      this.idlePrefetchPointerActive = false
    }
    this.pauseIdlePrefetch(
      event.type,
      false,
      event.type === 'compositionend' || event.type === 'dragend',
    )
    if (this.idlePrefetchInvalidatedRootIds.size && !this.fullMountFallback) {
      this.schedule()
    }
    this.armIdlePrefetch()
  }
  private readonly onIdlePrefetchVisibilityChange = () => {
    if (this.scrollContainer?.ownerDocument.hidden) {
      this.idlePrefetchPointerActive = false
      this.pauseIdlePrefetch('hidden', true)
      return
    }
    if (this.idlePrefetchInvalidatedRootIds.size && !this.fullMountFallback) {
      this.schedule()
    }
    this.armIdlePrefetch()
  }
  private readonly onIdlePrefetchWindowBlur = () => {
    this.idlePrefetchPointerActive = false
    this.pauseIdlePrefetch('blur', true)
  }
  private readonly onIdlePrefetchWindowFocus = () => {
    if (this.idlePrefetchInvalidatedRootIds.size && !this.fullMountFallback) {
      this.schedule()
    }
    this.armIdlePrefetch()
  }
  private readonly onIdlePrefetchFontLoading = () => {
    this.invalidateIdlePrefetch('font-loading', true)
  }
  private readonly onIdlePrefetchFontChange = () => {
    this.invalidateIdlePrefetch('font', true)
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
    idlePrefetchHandoffListeners.set(this, new Set())
    idlePrefetchMeasurementReporters.set(
      this,
      rootIds => this.reportIdlePrefetchMeasurements(rootIds),
    )
    idlePrefetchInvalidators.set(
      this,
      reason => this.invalidateIdlePrefetch(reason, true),
    )
    idlePrefetchPendingMeasurementQueries.set(
      this,
      rootIds => rootIds.some(id =>
        this.idlePrefetchPendingMeasurementRootIds.has(id),
      ),
    )
    idlePrefetchPendingMeasurementReaders.set(
      this,
      rootIds => rootIds.filter(id =>
        this.idlePrefetchPendingMeasurementRootIds.has(id),
      ),
    )
  }

  get enabled(): boolean {
    return this.config.enabled
  }

  /** @internal Bounded read-only diagnostics for performance tooling and tests. */
  captureIdlePrefetchDiagnostics(): IdlePrefetchDiagnostics {
    const diagnostics: IdlePrefetchDiagnosticsRuntime = {
      enabled: this.enabled && this.config.idlePrefetch,
      disabled: this.idlePrefetchDisabled,
      candidates: this.idlePrefetchCandidateCount,
      nearMounts: this.idlePrefetchNearMountCount,
      sweepMounts: this.idlePrefetchSweepMountCount,
      hits: this.idlePrefetchHitCount,
      cancellations: this.idlePrefetchCancellationCount,
      failures: this.idlePrefetchFailureCount,
      deniedFlavours: [...this.idlePrefetchDeniedFlavours],
      mountDurations: [...this.idlePrefetchMountDurations],
      estimateErrors: [...this.idlePrefetchEstimateErrors],
      anchorCorrections: [...this.idlePrefetchAnchorCorrections],
      failureReasons: Object.fromEntries(this.idlePrefetchFailureReasons),
      trace: this.captureIdlePrefetchTrace(),
      virtualDocument: this.captureVirtualDocument(),
    }
    return diagnostics
  }

  init(scrollContainer: HTMLElement): void {
    if (!this.enabled || this.disposed || this.scrollContainer) return
    this.scrollContainer = scrollContainer
    this.ownerWindow = scrollContainer.ownerDocument.defaultView ?? window
    this.idlePrefetchLastScrollTop = scrollContainer.scrollTop
    if (this.config.idlePrefetch) {
      this.idlePrefetchScheduler = new IdlePrefetchScheduler(this.ownerWindow)
    }
    const ResizeObserverCtor = (this.ownerWindow as Window & typeof globalThis).ResizeObserver
    if (ResizeObserverCtor) {
      const observer = new ResizeObserverCtor(this.onResize)
      this.viewportResizeObserver = observer
      observer.observe(scrollContainer)
    }
    this.spacerLayer = new ProjectionSpacerLayer(this.doc.root.childrenRenderRef!.containerElement)
    this.rebuildModel(undefined, this.continuousEstimateJournalSuspended)
    if (this.customLayoutProjection) {
      this.customProjectionValidationPending = true
    }
    this.markStructureRevisionSynchronized()
    this.unregisterSelectionAdapter = this.doc.selection.registerProjectionMountAdapter(this)
    this.unregisterPins = this.pins.subscribe(() => this.schedule())
    this.syncBlockViewLeases()
    this.syncFullDocumentViewLease()
    this.subscriptions.add(this.doc.model.structureChange$.subscribe(change => this.handleStructureChange(change)))
    if (this.doc.viewScale?.scale$) {
      this.subscriptions.add(this.doc.viewScale.scale$.subscribe(() => {
        this.invalidateIdlePrefetch('view-scale', true)
        this.schedule()
      }))
    }
    const objectSizing = this.doc.objectSizing
    if (objectSizing?.widthChange$) {
      this.subscriptions.add(
        objectSizing.widthChange$.subscribe(() => {
          this.invalidateIdlePrefetch('width', true)
          this.refreshModelEstimates()
        }),
      )
    }
    const layoutMetricsChange$ = this.doc.layoutMetrics?.change$
    if (layoutMetricsChange$) {
      this.subscriptions.add(
        layoutMetricsChange$.subscribe(() => {
          this.invalidateIdlePrefetch('layout-metrics', true)
          this.refreshModelEstimates()
        }),
      )
    }
    const contentChange$ = this.doc.model.contentChange$
    if (contentChange$) {
      this.subscriptions.add(
        contentChange$.subscribe(change => {
          this.invalidateIdlePrefetch('content', true)
          const stronglyInvalidRootIds = change.kinds?.includes('props')
            ? change.blockIds.filter(blockId => {
                const path = this.doc.model.getPath(blockId)
                if (!(path?.length === 2 &&
                  path[0] === this.doc.rootId &&
                  path[1] === blockId)) {
                  return false
                }
                return this.refreshContinuousEstimateSemantics(blockId)
              })
            : []
          this.refreshModelEstimates(
            change.blockIds,
            change.kinds?.includes('props') ?? true,
            blockId => modelHeightEstimateAffectedByContentChange(
              this.doc,
              blockId,
              change,
            ),
            stronglyInvalidRootIds,
          )
        }),
      )
    }
    if (this.doc.themeChange$) {
      this.subscriptions.add(this.doc.themeChange$.subscribe(() => {
        this.invalidateIdlePrefetch('theme', true)
        if (!this.fullMountFallback) this.schedule()
      }))
    }
    this.subscriptions.add(
      this.doc.selection.changeObserve().subscribe((selection) => {
        this.pauseIdlePrefetch('selection', true)
        this.projectionBlockIds = []
        this.pins.unpin('projection')
        this.selectionSnapshot = selection?.toJSON() ?? null
        this.syncSelectionPins()
        // A programmatic caret move within the same root leaves the flattened
        // pin set unchanged. It must still resume any mounted-root geometry
        // revalidation that pauseIdlePrefetch just cancelled.
        if (this.idlePrefetchInvalidatedRootIds.size && !this.fullMountFallback) {
          this.schedule()
        }
        this.armIdlePrefetch()
      }),
    )
    this.doc.ngZone.runOutsideAngular(() => {
      scrollContainer.addEventListener('scroll', this.onScroll, {passive: true})
      this.ownerWindow?.addEventListener('resize', this.onResize, {passive: true})
      if (this.config.idlePrefetch) {
        const rootElement = this.doc.root.hostElement
        rootElement.addEventListener('beforeinput', this.onIdlePrefetchInteractionStart)
        rootElement.addEventListener('keydown', this.onIdlePrefetchInteractionStart)
        rootElement.addEventListener('compositionstart', this.onIdlePrefetchInteractionStart)
        rootElement.addEventListener('compositionend', this.onIdlePrefetchInteractionEnd)
        rootElement.addEventListener('dragstart', this.onIdlePrefetchInteractionStart)
        rootElement.addEventListener('dragend', this.onIdlePrefetchInteractionEnd)
        scrollContainer.addEventListener('pointerdown', this.onIdlePrefetchInteractionStart, {passive: true})
        this.ownerWindow?.addEventListener('pointerup', this.onIdlePrefetchInteractionEnd, {passive: true})
        this.ownerWindow?.addEventListener('pointercancel', this.onIdlePrefetchInteractionEnd, {passive: true})
        this.ownerWindow?.addEventListener('blur', this.onIdlePrefetchWindowBlur)
        this.ownerWindow?.addEventListener('focus', this.onIdlePrefetchWindowFocus)
        scrollContainer.ownerDocument.addEventListener(
          'visibilitychange',
          this.onIdlePrefetchVisibilityChange,
        )
        scrollContainer.ownerDocument.fonts?.addEventListener(
          'loading',
          this.onIdlePrefetchFontLoading,
        )
        scrollContainer.ownerDocument.fonts?.addEventListener(
          'loadingdone',
          this.onIdlePrefetchFontChange,
        )
        scrollContainer.ownerDocument.fonts?.addEventListener(
          'loadingerror',
          this.onIdlePrefetchFontChange,
        )
      }
    })
    const pendingNavigation = this.blockNavigationTask
    if (pendingNavigation) this.startBlockNavigation(pendingNavigation)
    this.schedule()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    layoutProjectionRegistrars.delete(this)
    idlePrefetchHandoffListeners.delete(this)
    idlePrefetchMeasurementReporters.delete(this)
    idlePrefetchInvalidators.delete(this)
    idlePrefetchPendingMeasurementQueries.delete(this)
    idlePrefetchPendingMeasurementReaders.delete(this)
    if (this.frame !== null) this.cancelFrame(this.frame)
    this.frame = null
    this.cancelBlockNavigation()
    this.disposeIdlePrefetch()
    this.scrollContainer?.removeEventListener('scroll', this.onScroll)
    this.ownerWindow?.removeEventListener('resize', this.onResize)
    if (this.scrollContainer && this.config.idlePrefetch) {
      const rootElement = this.doc.root.hostElement
      rootElement.removeEventListener('beforeinput', this.onIdlePrefetchInteractionStart)
      rootElement.removeEventListener('keydown', this.onIdlePrefetchInteractionStart)
      rootElement.removeEventListener('compositionstart', this.onIdlePrefetchInteractionStart)
      rootElement.removeEventListener('compositionend', this.onIdlePrefetchInteractionEnd)
      rootElement.removeEventListener('dragstart', this.onIdlePrefetchInteractionStart)
      rootElement.removeEventListener('dragend', this.onIdlePrefetchInteractionEnd)
      this.scrollContainer.removeEventListener('pointerdown', this.onIdlePrefetchInteractionStart)
      this.ownerWindow?.removeEventListener('pointerup', this.onIdlePrefetchInteractionEnd)
      this.ownerWindow?.removeEventListener('pointercancel', this.onIdlePrefetchInteractionEnd)
      this.ownerWindow?.removeEventListener('blur', this.onIdlePrefetchWindowBlur)
      this.ownerWindow?.removeEventListener('focus', this.onIdlePrefetchWindowFocus)
      this.scrollContainer.ownerDocument.removeEventListener(
        'visibilitychange',
        this.onIdlePrefetchVisibilityChange,
      )
      this.scrollContainer.ownerDocument.fonts?.removeEventListener(
        'loading',
        this.onIdlePrefetchFontLoading,
      )
      this.scrollContainer.ownerDocument.fonts?.removeEventListener(
        'loadingdone',
        this.onIdlePrefetchFontChange,
      )
      this.scrollContainer.ownerDocument.fonts?.removeEventListener(
        'loadingerror',
        this.onIdlePrefetchFontChange,
      )
    }
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
    this.continuousHeightProvenance.clear()
    this.continuousEstimateSemantics.clear()
    this.clearContinuousEstimateJournal()
    this.continuousEstimateJournalSuspended = false
    this.customProjectionHandoffInProgress = false
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
    this.lastReconciledWindow = null
    this.reconciledInvalidationRevision = -1
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
    this.pauseIdlePrefetch('navigation', true)
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
    this.pauseIdlePrefetch('full-document-lease', true)
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
      this.armIdlePrefetch()
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
    this.invalidateIdlePrefetch('projection-activate', true)
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
    if (!this.blockIds.length) this.rebuildModel()
    this.validateProjection(projection)
    const anchor = this.pendingStructureAnchor ?? this.captureCurrentStructureAnchor()
    this.pendingStructureAnchor = anchor
    this.cancelScheduledReconcile()
    this.heightObserver.disconnect()
    // Suspend before owner hooks: pagination can synchronously mutate Yjs while
    // installing or rolling back its reversible DOM projection.
    this.continuousEstimateJournalSuspended = true
    this.customProjectionHandoffInProgress = true
    if (!this.scrollContainer) this.journalContinuousEstimateRefresh()
    try {
      hooks.beforeActivate?.()
      const nextBlockIds = [...this.doc.model.getChildrenIds(this.doc.rootId)]
      if (!arraysEqual(this.blockIds, nextBlockIds)) {
        if (this.scrollContainer) this.synchronizeRootModel(false)
        else this.rebuildModel(nextBlockIds)
      }
      this.validateProjection(projection)
      this.customProjectionHandoffInProgress = false
    } catch (error) {
      try {
        hooks.beforeDeactivate?.()
      } catch (cleanupError) {
        this.doc.logger.warn('layoutProjectionCleanupError: ', cleanupError)
      }
      try {
        this.flushContinuousEstimateJournal()
      } catch (replayError) {
        this.doc.logger.warn('continuousEstimateReplayError: ', replayError)
      } finally {
        this.continuousEstimateJournalSuspended = false
        this.customProjectionHandoffInProgress = false
        if (this.scrollContainer && !this.fullMountFallback) {
          this.syncHeightObserver()
        }
        this.schedule()
      }
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

  private schedule(invalidateReconciliation = true): void {
    if (invalidateReconciliation) this.reconcileInvalidationRevision++
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

  private armIdlePrefetch(): void {
    if (
      this.idlePrefetchEpisodeActive ||
      !this.canRunIdlePrefetch()
    ) {
      return
    }
    this.idlePrefetchEpisodeActive = true
    this.idlePrefetchEpisodeRoots = 0
    this.idlePrefetchEpisodeMountTime = 0
    this.recordIdlePrefetchTrace({
      phase: 'episode',
      kind: 'episode-start',
      epoch: this.idlePrefetchMeasurementEpoch,
      direction: this.idlePrefetchDirection,
    })
    this.scheduleIdlePrefetchSlice(false)
  }

  private continueIdlePrefetch(): void {
    if (!this.idlePrefetchEpisodeActive || !this.canRunIdlePrefetch()) {
      this.idlePrefetchEpisodeActive = false
      return
    }
    if (
      this.idlePrefetchEpisodeRoots >= IDLE_PREFETCH_MAX_ROOTS_PER_EPISODE ||
      this.idlePrefetchEpisodeMountTime >= IDLE_PREFETCH_MAX_MOUNT_TIME_PER_EPISODE
    ) {
      // Start a new quiet episode instead of monopolizing one browser idle
      // period. The attempted-ID journal lets the later episode resume rather
      // than rescan/recreate completed roots.
      this.idlePrefetchEpisodeRoots = 0
      this.idlePrefetchEpisodeMountTime = 0
      this.recordIdlePrefetchTrace({
        phase: 'episode',
        kind: 'episode-start',
        reason: 'episode-budget',
        epoch: this.idlePrefetchMeasurementEpoch,
        direction: this.idlePrefetchDirection,
      })
      this.scheduleIdlePrefetchSlice(false)
      return
    }
    this.scheduleIdlePrefetchSlice(true)
  }

  private scheduleIdlePrefetchSlice(continuation: boolean): void {
    const scheduler = this.idlePrefetchScheduler
    if (!scheduler) return
    this.doc.ngZone.runOutsideAngular(() => {
      const callback: IdleRequestCallback = deadline => {
        this.runIdlePrefetchSlice(deadline)
      }
      if (continuation) scheduler.scheduleContinuation(callback)
      else scheduler.schedule(callback)
    })
  }

  private runIdlePrefetchSlice(deadline: IdleDeadline): void {
    if (!this.canRunIdlePrefetch()) {
      this.idlePrefetchEpisodeActive = false
      return
    }
    const budgetMs = deadline.timeRemaining()
    this.recordIdlePrefetchTrace({
      phase: 'slice',
      kind: 'slice-start',
      budgetMs,
      didTimeout: deadline.didTimeout,
      epoch: this.idlePrefetchMeasurementEpoch,
      direction: this.idlePrefetchDirection,
    })
    if (budgetMs <= 0) {
      this.continueIdlePrefetch()
      return
    }

    try {
      if (this.mountNextIdlePrefetchNearRoot()) {
        this.continueIdlePrefetch()
        return
      }
      const sweep = this.startNextIdlePrefetchSweep(deadline)
      if (sweep === 'started') return
      if (sweep === 'yielded') {
        this.continueIdlePrefetch()
        return
      }
      // This measurement epoch is exhausted. Leave the episode active so
      // ordinary reconciliation does not restart an empty scan every frame;
      // the next interaction/context invalidation opens a fresh episode.
    } catch (error) {
      this.handleIdlePrefetchFailure('slice', error)
      if (!this.idlePrefetchDisabled) this.continueIdlePrefetch()
    }
  }

  /**
   * Returns true when one near root was started. A false result means the
   * directional one-viewport window is already warm (or blocked by an unsafe
   * root), so the caller may advance to the geometry sweep lane.
   */
  private mountNextIdlePrefetchNearRoot(): boolean {
    const desiredIndices = this.resolveIdlePrefetchNearIndices()
    const viewportHeight = this.scrollContainer
      ? this._visualToLayout(
          this.scrollContainer.clientHeight ||
            this.scrollContainer.getBoundingClientRect().height,
        )
      : 0
    const projectedHeight = desiredIndices.reduce(
      (height, index) => height + this.layoutProjection.extentAt(index),
      0,
    )
    this.recordIdlePrefetchTrace({
      phase: 'calculation',
      kind: 'near-window-calculated',
      lane: 'near',
      count: desiredIndices.length,
      projectedHeight,
      viewportHeight,
      epoch: this.idlePrefetchMeasurementEpoch,
      direction: this.idlePrefetchDirection,
    })
    const desiredIds = new Set(desiredIndices.map(index => this.blockIds[index]))
    const retainedNearIds = [...this.idlePrefetchNearRootIds].filter(id =>
      desiredIds.has(id) && this.indexById.has(id),
    )
    const retainedNearIdSet = new Set(retainedNearIds)
    const nextIndex = desiredIndices.find(index => {
      const id = this.blockIds[index]
      return id !== undefined &&
        !retainedNearIdSet.has(id) &&
        !this.doc.vm.isMounted(id)
    })

    if (nextIndex === undefined) {
      this.replaceIdlePrefetchNearPin(retainedNearIds)
      return false
    }

    const blockId = this.blockIds[nextIndex]
    if (!blockId) return false
    const nextNearIds = [...retainedNearIds, blockId]
    this.replaceIdlePrefetchNearPin(nextNearIds)
    this.idlePrefetchCandidateCount++
    this.idlePrefetchPendingMeasurementRootIds.add(blockId)
    const mounted = this.mountIdlePrefetchRoot(nextIndex, 'near')
    if (!mounted) {
      this.idlePrefetchPendingMeasurementRootIds.delete(blockId)
      if (!this.idlePrefetchDisabled) {
        this.replaceIdlePrefetchNearPin(retainedNearIds)
      }
      return true
    }
    return true
  }

  private resolveIdlePrefetchNearIndices(): number[] {
    if (!this.scrollContainer || !this.blockIds.length) return []
    const viewportHeight = this._visualToLayout(
      this.scrollContainer.clientHeight ||
        this.scrollContainer.getBoundingClientRect().height,
    )
    if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return []
    const viewport = calculateProjectedViewportRange(
      this.layoutProjection,
      this.getViewportTop(),
      viewportHeight,
      this.config.overscanViewports,
    )
    const indices: number[] = []
    let projectedHeight = 0
    let index = this.idlePrefetchDirection > 0
      ? viewport[1] + 1
      : viewport[0] - 1
    while (index >= 0 && index < this.blockIds.length) {
      const extent = this.layoutProjection.extentAt(index)
      if (!Number.isFinite(extent) || extent < 0) break
      if (projectedHeight + extent > viewportHeight) break
      // Do not skip an unsafe root: doing so would turn the near window into a
      // sparse jump whose segment merge could materialize an unapproved view.
      if (!this.isIdlePrefetchCandidate(index)) break
      indices.push(index)
      projectedHeight += extent
      index += this.idlePrefetchDirection
    }
    return indices
  }

  private replaceIdlePrefetchNearPin(rootIds: readonly string[]): void {
    const nextRootIds = new Set(rootIds)
    this.idlePrefetchNearRootIds.forEach(id => {
      if (!nextRootIds.has(id)) {
        this.idlePrefetchPendingMeasurementRootIds.delete(id)
      }
    })
    this.idlePrefetchNearRootIds.clear()
    rootIds.forEach(id => this.idlePrefetchNearRootIds.add(id))
    const indices = rootIds
      .map(id => this.indexById.get(id))
      .filter((index): index is number => index !== undefined)
      .sort((left, right) => left - right)
    if (indices.length) this.pins.pin(IDLE_PREFETCH_NEAR_PIN, indices)
    else this.pins.unpin(IDLE_PREFETCH_NEAR_PIN)
  }

  private startNextIdlePrefetchSweep(
    deadline: IdleDeadline = {
      didTimeout: false,
      timeRemaining: () => Number.POSITIVE_INFINITY,
    },
  ): 'started' | 'yielded' | 'exhausted' {
    const index = this.resolveNextIdlePrefetchSweepIndex(deadline)
    if (index === null) return 'yielded'
    if (index === undefined) return 'exhausted'
    const blockId = this.blockIds[index]
    const flavour = this.doc.model.getFlavour(blockId)
    if (!blockId || typeof flavour !== 'string') return 'exhausted'

    this.idlePrefetchCandidateCount++
    this.idlePrefetchAttemptedRootIds.add(blockId)
    const task: IdlePrefetchSweepTask = {
      blockId,
      flavour,
      ticket: this.idlePrefetchTicket,
      releaseLease: () => undefined,
      leaseAcquired: false,
      frame: null,
      waitedFrames: 0,
    }
    this.recordIdlePrefetchTrace({
      phase: 'candidate',
      kind: 'candidate-selected',
      lane: 'sweep',
      rootId: blockId,
      flavour,
      estimatedHeight: this.readIdlePrefetchProjectedHeight(index),
      epoch: this.idlePrefetchMeasurementEpoch,
    })
    this.idlePrefetchActiveSweep = task
    this.idlePrefetchPendingMeasurementRootIds.add(blockId)
    this.idlePrefetchInvalidatedRootIds.delete(blockId)
    if (!this.acquireIdlePrefetchSweepLease(index, task)) {
      this.finishIdlePrefetchSweep(task, false)
      return 'started'
    }
    this.waitForIdlePrefetchSweepMeasurement(task)
    return 'started'
  }

  private resolveNextIdlePrefetchSweepIndex(
    deadline: IdleDeadline,
  ): number | null | undefined {
    if (!this.scrollContainer || !this.blockIds.length) return undefined
    const viewportHeight = this._visualToLayout(
      this.scrollContainer.clientHeight ||
        this.scrollContainer.getBoundingClientRect().height,
    )
    const viewport = calculateProjectedViewportRange(
      this.layoutProjection,
      this.getViewportTop(),
      viewportHeight,
      this.config.overscanViewports,
    )
    let cursor = this.idlePrefetchSweepCursor
    if (
      !cursor ||
      cursor.ticket !== this.idlePrefetchTicket ||
      cursor.projection !== this.layoutProjection ||
      cursor.viewportStart !== viewport[0] ||
      cursor.viewportEnd !== viewport[1]
    ) {
      cursor = {
        ticket: this.idlePrefetchTicket,
        projection: this.layoutProjection,
        viewportStart: viewport[0],
        viewportEnd: viewport[1],
        forwardIndex: viewport[1] + 1,
        backwardIndex: viewport[0] - 1,
      }
      this.idlePrefetchSweepCursor = cursor
    }

    while (
      cursor.forwardIndex < this.blockIds.length ||
      cursor.backwardIndex >= 0
    ) {
      if (deadline.timeRemaining() <= 0) return null
      const viewportTop = this.layoutProjection.offsetAt(viewport[0])
      const viewportBottom = this.layoutProjection.offsetAt(viewport[1]) +
        this.layoutProjection.extentAt(viewport[1])
      const forwardDistance = cursor.forwardIndex < this.blockIds.length
        ? Math.max(
            0,
            this.layoutProjection.offsetAt(cursor.forwardIndex) - viewportBottom,
          )
        : Number.POSITIVE_INFINITY
      const backwardDistance = cursor.backwardIndex >= 0
        ? Math.max(
            0,
            viewportTop - (
              this.layoutProjection.offsetAt(cursor.backwardIndex) +
              this.layoutProjection.extentAt(cursor.backwardIndex)
            ),
          )
        : Number.POSITIVE_INFINITY
      const scanForward = forwardDistance < backwardDistance || (
        Math.abs(forwardDistance - backwardDistance) <= HEIGHT_MEASUREMENT_EPSILON &&
        this.idlePrefetchDirection > 0
      )
      const index = scanForward
        ? cursor.forwardIndex++
        : cursor.backwardIndex--
      const blockId = this.blockIds[index]
      if (
        this.idlePrefetchNearRootIds.has(blockId) ||
        this.idlePrefetchAttemptedRootIds.has(blockId) ||
        !this.isIdlePrefetchCandidate(index)
      ) {
        continue
      }
      if (this.doc.vm.isMounted(blockId)) {
        this.idlePrefetchAttemptedRootIds.add(blockId)
        continue
      }
      if (
        this.idlePrefetchMeasuredEpochByRoot.get(blockId) ===
          this.idlePrefetchMeasurementEpoch
      ) {
        this.idlePrefetchAttemptedRootIds.add(blockId)
        continue
      }
      return index
    }
    return undefined
  }

  private isIdlePrefetchCandidate(index: number): boolean {
    const blockId = this.blockIds[index]
    if (!blockId || this.doc.model.getNodeType(blockId) !== BlockNodeType.editable) {
      return false
    }
    if (this.doc.model.getChildrenIds(blockId).length) return false
    const flavour = this.doc.model.getFlavour(blockId)
    if (typeof flavour !== 'string' || this.idlePrefetchDeniedFlavours.has(flavour)) {
      return false
    }
    const schema = this.doc.schemas?.get(flavour, false)
    const virtualization = schema?.metadata.virtualization
    if (virtualization?.speculativeMount !== 'safe') return false
    const deltas = this.doc.model.getTextDeltas(blockId)
    if (!deltas || deltas.some(delta => typeof delta.insert !== 'string')) return false
    return this.resolveBlockViewRetention({
      blockId,
      flavour,
      nodeType: BlockNodeType.editable,
      schemaRetention: virtualization.viewRetention ?? 'virtual',
    }) !== 'keep-alive'
  }

  private mountIdlePrefetchRoot(
    index: number,
    lane: 'near',
  ): boolean {
    const blockId = this.blockIds[index]
    if (!blockId) return false
    const flavour = this.doc.model.getFlavour(blockId)
    if (typeof flavour !== 'string') return false
    const estimatedHeight = this.readIdlePrefetchProjectedHeight(index)
    this.recordIdlePrefetchTrace({
      phase: 'candidate',
      kind: 'candidate-selected',
      lane,
      rootId: blockId,
      flavour,
      estimatedHeight,
      epoch: this.idlePrefetchMeasurementEpoch,
    })
    if (this.doc.vm.isMounted(blockId)) return false
    const hadComponent = !!this.doc.vm.get(blockId)
    this.idlePrefetchInvalidatedRootIds.delete(blockId)
    const startedAt = this.performanceNow()
    this.recordIdlePrefetchTrace({
      phase: 'mount',
      kind: 'prefetch-mount-start',
      lane,
      rootId: blockId,
      flavour,
      estimatedHeight,
      epoch: this.idlePrefetchMeasurementEpoch,
    })
    try {
      this.mountRootIndices([index])
    } catch (error) {
      const duration = Math.max(0, this.performanceNow() - startedAt)
      this.recordIdlePrefetchMountDuration(duration)
      this.handleIdlePrefetchFailure(
        'mount',
        error,
        flavour,
        blockId,
        duration,
      )
      return false
    }
    const duration = Math.max(0, this.performanceNow() - startedAt)
    this.recordIdlePrefetchMountDuration(duration)
    this.idlePrefetchEpisodeRoots++
    this.idlePrefetchEpisodeMountTime += duration
    if (lane === 'near') this.idlePrefetchNearMountCount++
    if (duration > IDLE_PREFETCH_LONG_MOUNT_MS) {
      this.idlePrefetchDeniedFlavours.add(flavour)
      this.recordIdlePrefetchFailureReason('long-mount')
    }
    const mounted = this.doc.vm.isMounted(blockId)
    if (!mounted) {
      this.recordIdlePrefetchTrace({
        phase: 'failure',
        kind: 'failure',
        lane,
        rootId: blockId,
        flavour,
        durationMs: duration,
        reason: 'component-not-mounted',
        epoch: this.idlePrefetchMeasurementEpoch,
      })
      return false
    }
    this.recordIdlePrefetchTrace({
      phase: 'component',
      kind: hadComponent ? 'component-reused' : 'component-created',
      lane,
      rootId: blockId,
      flavour,
      epoch: this.idlePrefetchMeasurementEpoch,
    })
    this.recordIdlePrefetchTrace({
      phase: 'mount',
      kind: 'mount-complete',
      lane,
      rootId: blockId,
      flavour,
      durationMs: duration,
      estimatedHeight,
      epoch: this.idlePrefetchMeasurementEpoch,
    })
    if (duration > IDLE_PREFETCH_LONG_MOUNT_MS) {
      this.recordIdlePrefetchTrace({
        phase: 'failure',
        kind: 'failure',
        lane,
        rootId: blockId,
        flavour,
        durationMs: duration,
        reason: 'long-mount',
        epoch: this.idlePrefetchMeasurementEpoch,
      })
    }
    return true
  }

  private acquireIdlePrefetchSweepLease(
    index: number,
    task: IdlePrefetchSweepTask,
  ): boolean {
    const blockId = this.blockIds[index]
    if (!blockId || this.doc.vm.isMounted(blockId)) return false
    const estimatedHeight = this.readIdlePrefetchProjectedHeight(index)
    const hadComponent = !!this.doc.vm.get(blockId)
    const startedAt = this.performanceNow()
    this.recordIdlePrefetchTrace({
      phase: 'mount',
      kind: 'prefetch-mount-start',
      lane: 'sweep',
      rootId: blockId,
      flavour: task.flavour,
      estimatedHeight,
      epoch: this.idlePrefetchMeasurementEpoch,
    })
    try {
      task.releaseLease = this.acquireBlockViewLease([blockId])
      task.leaseAcquired = true
    } catch (error) {
      const duration = Math.max(0, this.performanceNow() - startedAt)
      this.recordIdlePrefetchMountDuration(duration)
      this.handleIdlePrefetchFailure(
        'mount',
        error,
        task.flavour,
        blockId,
        duration,
      )
      return false
    }
    const duration = Math.max(0, this.performanceNow() - startedAt)
    this.recordIdlePrefetchMountDuration(duration)
    this.idlePrefetchEpisodeRoots++
    this.idlePrefetchEpisodeMountTime += duration
    this.idlePrefetchSweepMountCount++
    if (duration > IDLE_PREFETCH_LONG_MOUNT_MS) {
      this.idlePrefetchDeniedFlavours.add(task.flavour)
      this.recordIdlePrefetchFailureReason('long-mount')
    }
    const mounted = this.doc.vm.isMounted(blockId)
    if (!mounted) {
      this.recordIdlePrefetchTrace({
        phase: 'failure',
        kind: 'failure',
        lane: 'sweep',
        rootId: blockId,
        flavour: task.flavour,
        durationMs: duration,
        reason: 'component-not-mounted',
        epoch: this.idlePrefetchMeasurementEpoch,
      })
      return false
    }
    this.recordIdlePrefetchTrace({
      phase: 'component',
      kind: hadComponent ? 'component-reused' : 'component-created',
      lane: 'sweep',
      rootId: blockId,
      flavour: task.flavour,
      epoch: this.idlePrefetchMeasurementEpoch,
    })
    this.recordIdlePrefetchTrace({
      phase: 'mount',
      kind: 'mount-complete',
      lane: 'sweep',
      rootId: blockId,
      flavour: task.flavour,
      durationMs: duration,
      estimatedHeight,
      epoch: this.idlePrefetchMeasurementEpoch,
    })
    if (duration > IDLE_PREFETCH_LONG_MOUNT_MS) {
      this.recordIdlePrefetchTrace({
        phase: 'failure',
        kind: 'failure',
        lane: 'sweep',
        rootId: blockId,
        flavour: task.flavour,
        durationMs: duration,
        reason: 'long-mount',
        epoch: this.idlePrefetchMeasurementEpoch,
      })
    }
    return true
  }

  private waitForIdlePrefetchSweepMeasurement(task: IdlePrefetchSweepTask): void {
    if (this.idlePrefetchActiveSweep !== task || task.frame !== null) return
    task.frame = this.requestFrame(() => {
      task.frame = null
      if (
        this.idlePrefetchActiveSweep !== task ||
        task.ticket !== this.idlePrefetchTicket
      ) {
        return
      }
      if (this.layoutProjection === this.continuousLayoutProjection) {
        const host = this.doc.vm.get(task.blockId)?.instance.hostElement
        if (host && this.heightObserver.measureNow(task.blockId, host)) {
          // measureNow reports synchronously through applyObservedMeasurements,
          // which acknowledges and releases the active sweep task.
          return
        }
      }
      task.waitedFrames++
      if (task.waitedFrames >= IDLE_PREFETCH_MAX_MEASUREMENT_FRAMES) {
        this.finishIdlePrefetchSweep(task, false, 'measurement-timeout')
        return
      }
      this.waitForIdlePrefetchSweepMeasurement(task)
    })
  }

  private reportIdlePrefetchMeasurements(
    rootIds: readonly string[],
    detailsByRoot?: ReadonlyMap<string, IdlePrefetchMeasurementTraceDetails>,
  ): boolean {
    if (!this.config.idlePrefetch) return false
    const task = this.idlePrefetchActiveSweep
    const staleSweepRootId = task && task.ticket !== this.idlePrefetchTicket
      ? task.blockId
      : null
    let idlePrefetchMeasurement = false
    for (const rootId of rootIds) {
      const pending = this.idlePrefetchPendingMeasurementRootIds.has(rootId)
      if (rootId === staleSweepRootId) {
        this.recordIdlePrefetchTrace({
          phase: 'measurement',
          kind: 'measurement-stale',
          lane: 'sweep',
          rootId,
          flavour: task?.flavour,
          reason: 'expired-ticket',
          epoch: this.idlePrefetchMeasurementEpoch,
        })
        continue
      }
      const index = this.indexById.get(rootId)
      if (index === undefined) {
        if (pending) {
          const lane: IdlePrefetchTraceLane | undefined = task?.blockId === rootId
            ? 'sweep'
            : this.idlePrefetchNearRootIds.has(rootId)
              ? 'near'
              : undefined
          this.recordIdlePrefetchTrace({
            phase: 'measurement',
            kind: 'measurement-stale',
            lane,
            rootId,
            reason: 'missing-root',
            epoch: this.idlePrefetchMeasurementEpoch,
          })
        }
        continue
      }
      this.idlePrefetchInvalidatedRootIds.delete(rootId)
      this.idlePrefetchRevalidationRootIds.delete(rootId)
      this.idlePrefetchMeasuredEpochByRoot.set(
        rootId,
        this.idlePrefetchMeasurementEpoch,
      )
      if (this.idlePrefetchPendingMeasurementRootIds.delete(rootId)) {
        idlePrefetchMeasurement = true
        const details = detailsByRoot?.get(rootId)
        const flavour = this.doc.model.getFlavour(rootId)
        const lane: IdlePrefetchTraceLane | undefined = task?.blockId === rootId
          ? 'sweep'
          : this.idlePrefetchNearRootIds.has(rootId)
            ? 'near'
            : undefined
        this.recordIdlePrefetchTrace({
          phase: 'measurement',
          kind: 'measurement-accepted',
          lane,
          rootId,
          flavour: typeof flavour === 'string' ? flavour : undefined,
          estimatedHeight: details?.estimatedHeight,
          measuredHeight: details?.measuredHeight ??
            this.readIdlePrefetchProjectedHeight(index),
          epoch: this.idlePrefetchMeasurementEpoch,
        })
      }
    }
    if (
      !task ||
      task.ticket !== this.idlePrefetchTicket ||
      !rootIds.includes(task.blockId)
    ) {
      if (idlePrefetchMeasurement) this.idlePrefetchConsecutiveFailures = 0
      return idlePrefetchMeasurement
    }
    this.finishIdlePrefetchSweep(task, true)
    return true
  }

  private finishIdlePrefetchSweep(
    task: IdlePrefetchSweepTask,
    measured: boolean,
    failureReason?: string,
  ): void {
    if (this.idlePrefetchActiveSweep !== task) return
    this.idlePrefetchActiveSweep = null
    this.idlePrefetchPendingMeasurementRootIds.delete(task.blockId)
    if (task.frame !== null) this.cancelFrame(task.frame)
    task.frame = null
    this.idlePrefetchEvictRootIds.add(task.blockId)
    this.releaseIdlePrefetchSweepLease(task)
    this.evictIdlePrefetchSweepViewIfUnowned(task.blockId)
    if (measured) {
      this.idlePrefetchConsecutiveFailures = 0
    } else if (failureReason) {
      this.handleIdlePrefetchFailure(
        failureReason,
        undefined,
        task.flavour,
        task.blockId,
      )
    }
    if (!this.idlePrefetchDisabled) this.continueIdlePrefetch()
  }

  private handleIdlePrefetchFailure(
    reason: string,
    error?: unknown,
    flavour?: string,
    rootId?: string,
    durationMs?: number,
  ): void {
    this.idlePrefetchFailureCount++
    this.idlePrefetchConsecutiveFailures++
    this.recordIdlePrefetchFailureReason(reason)
    if (flavour) this.idlePrefetchDeniedFlavours.add(flavour)
    this.recordIdlePrefetchTrace({
      phase: 'failure',
      kind: 'failure',
      lane: rootId && this.idlePrefetchActiveSweep?.blockId === rootId
        ? 'sweep'
        : rootId && this.idlePrefetchNearRootIds.has(rootId)
          ? 'near'
          : undefined,
      rootId,
      flavour,
      durationMs,
      reason,
      epoch: this.idlePrefetchMeasurementEpoch,
      count: this.idlePrefetchConsecutiveFailures,
    })
    if (error !== undefined) {
      this.doc.logger.warn('virtualizationIdlePrefetchError: ', {reason, error})
    }
    if (
      this.idlePrefetchConsecutiveFailures <
      IDLE_PREFETCH_MAX_CONSECUTIVE_FAILURES
    ) {
      return
    }
    this.idlePrefetchDisabled = true
    this.recordIdlePrefetchTrace({
      phase: 'lifecycle',
      kind: 'disabled',
      reason: 'circuit-breaker',
      epoch: this.idlePrefetchMeasurementEpoch,
      count: this.idlePrefetchConsecutiveFailures,
    })
    this.pauseIdlePrefetch('circuit-breaker', true)
    this.doc.logger.warn('virtualizationIdlePrefetchDisabled: ', {
      failures: this.idlePrefetchConsecutiveFailures,
    })
  }

  private pauseIdlePrefetch(
    reason: string,
    releaseNear = false,
    invalidateMeasurements = false,
  ): void {
    if (!this.config.idlePrefetch) return
    this.cancelIdlePrefetchRevalidation()
    const hadWork = this.idlePrefetchEpisodeActive ||
      this.idlePrefetchActiveSweep !== null
    this.idlePrefetchTicket++
    this.idlePrefetchSweepCursor = null
    this.idlePrefetchEpisodeActive = false
    this.idlePrefetchScheduler?.cancel()
    const task = this.idlePrefetchActiveSweep
    if (task) {
      this.idlePrefetchActiveSweep = null
      this.idlePrefetchPendingMeasurementRootIds.delete(task.blockId)
      if (task.frame !== null) this.cancelFrame(task.frame)
      this.idlePrefetchEvictRootIds.add(task.blockId)
      if (invalidateMeasurements) {
        this.idlePrefetchInvalidatedRootIds.add(task.blockId)
      }
      this.releaseIdlePrefetchSweepLease(task)
      this.evictIdlePrefetchSweepViewIfUnowned(task.blockId)
    }
    if (releaseNear) {
      if (invalidateMeasurements) {
        this.idlePrefetchNearRootIds.forEach(id => {
          this.idlePrefetchInvalidatedRootIds.add(id)
        })
      }
      this.replaceIdlePrefetchNearPin([])
    }
    if (hadWork) {
      this.idlePrefetchCancellationCount++
      this.recordIdlePrefetchFailureReason(`cancel:${reason}`)
      this.recordIdlePrefetchTrace({
        phase: 'lifecycle',
        kind: 'cancelled',
        lane: task ? 'sweep' : undefined,
        rootId: task?.blockId,
        flavour: task?.flavour,
        reason,
        epoch: this.idlePrefetchMeasurementEpoch,
        count: this.idlePrefetchEpisodeRoots,
      })
    }
  }

  private invalidateIdlePrefetch(reason: string, resetMeasurements: boolean): void {
    this.pauseIdlePrefetch(reason, true, resetMeasurements)
    if (resetMeasurements) {
      this.idlePrefetchMeasurementEpoch++
      this.idlePrefetchAttemptedRootIds.clear()
    }
    this.recordIdlePrefetchTrace({
      phase: 'lifecycle',
      kind: 'invalidated',
      reason,
      epoch: this.idlePrefetchMeasurementEpoch,
    })
    if (!this.fullMountFallback) this.schedule()
  }

  private scheduleIdlePrefetchRevalidation(rootIds: readonly string[]): void {
    if (this.layoutProjection !== this.continuousLayoutProjection) return
    rootIds.forEach(id => this.idlePrefetchRevalidationRootIds.add(id))
    if (
      !this.idlePrefetchRevalidationRootIds.size ||
      this.idlePrefetchRevalidationFrame !== null
    ) {
      return
    }
    this.idlePrefetchRevalidationFrame = this.requestFrame(() => {
      this.idlePrefetchRevalidationFrame = null
      if (
        this.disposed ||
        this.layoutProjection !== this.continuousLayoutProjection ||
        this.scrollContainer?.ownerDocument.hidden ||
        this.idlePrefetchPointerActive ||
        !!this.blockNavigationTask ||
        this.doc.event?.status?.isComposing ||
        !(this.doc.inputManger?.compositionSession?.isIdle ?? true)
      ) {
        return
      }
      const rootId = this.idlePrefetchRevalidationRootIds.values().next()
        .value as string | undefined
      if (rootId === undefined) return
      this.idlePrefetchRevalidationRootIds.delete(rootId)
      if (
        this.idlePrefetchInvalidatedRootIds.has(rootId) &&
        this.doc.vm.isMounted(rootId)
      ) {
        const host = this.doc.vm.get(rootId)?.instance.hostElement
        if (host) {
          // Drop the stale-ticket guard immediately before taking a new live DOM
          // reading on this later frame; queued pre-invalidation RO entries were
          // filtered while the guard was set.
          this.idlePrefetchInvalidatedRootIds.delete(rootId)
          if (!this.heightObserver.measureNow(rootId, host)) {
            this.idlePrefetchInvalidatedRootIds.add(rootId)
          }
        }
      }
      this.scheduleIdlePrefetchRevalidation([])
    })
  }

  private cancelIdlePrefetchRevalidation(): void {
    if (this.idlePrefetchRevalidationFrame !== null) {
      this.cancelFrame(this.idlePrefetchRevalidationFrame)
      this.idlePrefetchRevalidationFrame = null
    }
    this.idlePrefetchRevalidationRootIds.clear()
  }

  private releaseIdlePrefetchSweepLease(task: IdlePrefetchSweepTask): void {
    if (!task.leaseAcquired) return
    const release = task.releaseLease
    task.releaseLease = () => undefined
    task.leaseAcquired = false
    try {
      release()
      this.recordIdlePrefetchTrace({
        phase: 'lease',
        kind: 'lease-released',
        lane: 'sweep',
        rootId: task.blockId,
        flavour: task.flavour,
        epoch: this.idlePrefetchMeasurementEpoch,
      })
    } catch (error) {
      this.handleIdlePrefetchFailure(
        'lease-release',
        error,
        task.flavour,
        task.blockId,
      )
    }
  }

  private evictIdlePrefetchSweepViewIfUnowned(blockId: string): void {
    const flavour = this.doc.model.getFlavour(blockId)
    const defer = (reason: string) => this.recordIdlePrefetchTrace({
      phase: 'lease',
      kind: 'release-deferred',
      lane: 'sweep',
      rootId: blockId,
      flavour: typeof flavour === 'string' ? flavour : undefined,
      reason,
      epoch: this.idlePrefetchMeasurementEpoch,
    })
    if (!this.scrollContainer) {
      defer('missing-scroll-container')
      return
    }
    if (this.fullMountFallback) {
      defer('full-mount-fallback')
      return
    }
    if (this.fullDocumentViewLeaseCount > 0) {
      defer('full-document-lease')
      return
    }
    if (!this.doc.vm.isMounted(blockId)) {
      if (this.doc.vm.get(blockId)) defer('already-retained')
      return
    }
    if (!this.isLayoutProjectionGeometryReady()) {
      defer('geometry-not-ready')
      return
    }
    const index = this.indexById.get(blockId)
    if (index === undefined) {
      defer('missing-root')
      return
    }
    if (this.pins.snapshot().has(index)) {
      defer('owned-pin')
      return
    }
    const viewportHeight = this._visualToLayout(
      this.scrollContainer.clientHeight ||
        this.scrollContainer.getBoundingClientRect().height,
    )
    const viewport = calculateProjectedViewportRange(
      this.layoutProjection,
      this.getViewportTop(),
      viewportHeight,
      this.config.overscanViewports,
    )
    if (index >= viewport[0] && index <= viewport[1]) {
      defer('viewport')
      return
    }

    this.retainRootView(blockId)
    if (this.layoutProjection === this.continuousLayoutProjection) {
      this.syncHeightObserver()
    }
    this.syncSpacersFromMounted()
    this.publishViewChange()
  }

  private disposeIdlePrefetch(): void {
    this.cancelIdlePrefetchRevalidation()
    this.pauseIdlePrefetch('dispose', true)
    this.idlePrefetchScheduler?.dispose()
    this.idlePrefetchScheduler = null
    this.idlePrefetchEvictRootIds.clear()
    this.idlePrefetchInvalidatedRootIds.clear()
    this.idlePrefetchRevalidationRootIds.clear()
    this.idlePrefetchPendingMeasurementRootIds.clear()
    this.idlePrefetchMeasuredEpochByRoot.clear()
    this.idlePrefetchSweepCursor = null
  }

  private canRunIdlePrefetch(): boolean {
    const document = this.scrollContainer?.ownerDocument
    return !!this.idlePrefetchScheduler &&
      this.enabled &&
      this.config.idlePrefetch &&
      !this.disposed &&
      !this.idlePrefetchDisabled &&
      !this.fullMountFallback &&
      this.fullDocumentViewLeaseCount === 0 &&
      !!this.scrollContainer &&
      !!this.blockIds.length &&
      !document?.hidden &&
      document?.fonts?.status !== 'loading' &&
      !this.idlePrefetchPointerActive &&
      !this.blockNavigationTask &&
      !this.customProjectionHandoffInProgress &&
      !this.customProjectionValidationPending &&
      !this.doc.vm.hasDeferredSparseRootOrder &&
      !this.doc.event?.status?.isComposing &&
      (this.doc.inputManger?.compositionSession?.isIdle ?? true)
  }

  private handoffIdlePrefetchToViewport(viewport: RenderedSegment): void {
    if (!this.idlePrefetchNearRootIds.size) return
    const remaining: string[] = []
    const handedOff: string[] = []
    for (const blockId of this.idlePrefetchNearRootIds) {
      const index = this.indexById.get(blockId)
      if (index !== undefined && index >= viewport[0] && index <= viewport[1]) {
        this.idlePrefetchHitCount++
        this.idlePrefetchPendingMeasurementRootIds.delete(blockId)
        const flavour = this.doc.model.getFlavour(blockId)
        this.recordIdlePrefetchTrace({
          phase: 'handoff',
          kind: 'viewport-handoff',
          lane: 'near',
          rootId: blockId,
          flavour: typeof flavour === 'string' ? flavour : undefined,
          measuredHeight: this.readIdlePrefetchProjectedHeight(index),
          epoch: this.idlePrefetchMeasurementEpoch,
        })
        handedOff.push(blockId)
        continue
      }
      if (index !== undefined) remaining.push(blockId)
    }
    if (remaining.length !== this.idlePrefetchNearRootIds.size) {
      this.replaceIdlePrefetchNearPin(remaining)
      if (handedOff.length) {
        idlePrefetchHandoffListeners.get(this)?.forEach(listener => {
          try {
            listener(handedOff)
          } catch (error) {
            this.doc.logger.warn('virtualizationIdlePrefetchHandoffError: ', error)
          }
        })
      }
    }
  }

  private hasIdlePrefetchPins(): boolean {
    return this.idlePrefetchNearRootIds.size > 0 ||
      this.idlePrefetchActiveSweep !== null
  }

  private recordIdlePrefetchMountDuration(duration: number): void {
    pushBoundedSample(this.idlePrefetchMountDurations, duration)
  }

  private recordIdlePrefetchFailureReason(reason: string): void {
    this.idlePrefetchFailureReasons.set(
      reason,
      (this.idlePrefetchFailureReasons.get(reason) ?? 0) + 1,
    )
  }

  private recordIdlePrefetchTrace(event: IdlePrefetchTraceInput): void {
    if (!this.config.idlePrefetch) return
    const entry: IdlePrefetchTraceEvent = {
      sequence: ++this.idlePrefetchTraceSequence,
      timestamp: this.performanceNow(),
      ...event,
    }
    const index = (
      this.idlePrefetchTraceStart + this.idlePrefetchTraceSize
    ) % IDLE_PREFETCH_TRACE_LIMIT
    this.idlePrefetchTraceRing[index] = entry
    if (this.idlePrefetchTraceSize < IDLE_PREFETCH_TRACE_LIMIT) {
      this.idlePrefetchTraceSize++
      return
    }
    this.idlePrefetchTraceStart = (
      this.idlePrefetchTraceStart + 1
    ) % IDLE_PREFETCH_TRACE_LIMIT
  }

  private captureIdlePrefetchTrace(): IdlePrefetchTraceEvent[] {
    const trace: IdlePrefetchTraceEvent[] = []
    for (let offset = 0; offset < this.idlePrefetchTraceSize; offset++) {
      const index = (
        this.idlePrefetchTraceStart + offset
      ) % IDLE_PREFETCH_TRACE_LIMIT
      const event = this.idlePrefetchTraceRing[index]
      if (event) trace.push({...event})
    }
    return trace
  }

  private captureVirtualDocument(): VirtualDocumentSnapshot {
    const projection = this.layoutProjection
    const projectionRevision = projection.revision
    const projectionKind: VirtualDocumentSnapshot['projectionKind'] =
      projection === this.continuousLayoutProjection
        ? 'continuous'
        : 'custom'
    const viewportRange =
      this.virtualDocumentViewportProjection === projection &&
      this.virtualDocumentViewportProjectionRevision === projectionRevision
        ? this.captureVirtualDocumentViewportRange(projection)
        : null
    const mountedRootIds = new Set(this.doc.vm.getMountedRootChildIds())
    const retainedRootIds = new Set(this.doc.vm.getRetainedRootChildIds())
    const projectionBlockIds = projection.blockIds
    const roots: VirtualDocumentRootSnapshot[] = []
    let signatureHash = VIRTUAL_DOCUMENT_HASH_OFFSET
    signatureHash = mixVirtualDocumentInteger(
      signatureHash,
      projectionKind === 'continuous' ? 1 : 2,
    )
    signatureHash = mixVirtualDocumentInteger(signatureHash, projectionRevision)
    signatureHash = mixVirtualDocumentGeometry(signatureHash, projection.totalHeight)
    signatureHash = mixVirtualDocumentGeometry(
      signatureHash,
      this.virtualDocumentViewportTop,
    )
    signatureHash = mixVirtualDocumentGeometry(
      signatureHash,
      this.virtualDocumentViewportHeight,
    )
    const length = Math.min(this.blockIds.length, projection.length)
    for (let index = 0; index < length; index++) {
      const id = this.blockIds[index]
      if (projectionBlockIds && projectionBlockIds[index] !== id) continue
      let offset: number
      let height: number
      try {
        offset = projection.offsetAt(index)
        height = projection.extentAt(index)
      } catch {
        continue
      }
      if (!Number.isFinite(offset) || !Number.isFinite(height)) continue
      const flavour = this.doc.model.getFlavour(id)
      const heightState = this.resolveVirtualDocumentHeightState(
        id,
        projectionKind,
      )
      const viewState = this.resolveVirtualDocumentViewState(
        id,
        index,
        viewportRange,
        mountedRootIds,
        retainedRootIds,
      )
      const root = {
        id,
        index,
        flavour: typeof flavour === 'string' ? flavour : '',
        offset,
        height,
        heightState,
        viewState,
      } satisfies VirtualDocumentRootSnapshot
      roots.push(root)
      signatureHash = mixVirtualDocumentString(signatureHash, root.id)
      signatureHash = mixVirtualDocumentInteger(signatureHash, root.index)
      signatureHash = mixVirtualDocumentString(signatureHash, root.flavour)
      signatureHash = mixVirtualDocumentGeometry(signatureHash, root.offset)
      signatureHash = mixVirtualDocumentGeometry(signatureHash, root.height)
      signatureHash = mixVirtualDocumentInteger(
        signatureHash,
        VIRTUAL_DOCUMENT_HEIGHT_STATE_CODE[root.heightState],
      )
      signatureHash = mixVirtualDocumentInteger(
        signatureHash,
        VIRTUAL_DOCUMENT_VIEW_STATE_CODE[root.viewState],
      )
    }
    signatureHash = mixVirtualDocumentInteger(signatureHash, roots.length)
    const snapshot: Omit<VirtualDocumentSnapshot, 'revision'> = {
      projectionKind,
      projectionRevision,
      totalHeight: projection.totalHeight,
      viewportTop: this.virtualDocumentViewportTop,
      viewportHeight: this.virtualDocumentViewportHeight,
      roots,
    }
    if (signatureHash !== this.virtualDocumentSignatureHash) {
      this.virtualDocumentSignatureHash = signatureHash
      this.virtualDocumentRevision++
    }
    return {
      revision: this.virtualDocumentRevision,
      ...snapshot,
    }
  }

  private resolveVirtualDocumentHeightState(
    rootId: string,
    projectionKind: VirtualDocumentSnapshot['projectionKind'],
  ): VirtualDocumentHeightState {
    if (this.idlePrefetchInvalidatedRootIds.has(rootId)) return 'stale'
    const measuredEpoch = this.idlePrefetchMeasuredEpochByRoot.get(rootId)
    if (measuredEpoch !== undefined) {
      return measuredEpoch === this.idlePrefetchMeasurementEpoch
        ? 'measured'
        : 'stale'
    }
    if (projectionKind === 'custom') return 'estimated'
    const provenance = this.continuousHeightProvenance.get(rootId)
    if (provenance?.measurementFresh) return 'measured'
    return provenance?.hasMeasuredHeight ? 'stale' : 'estimated'
  }

  private resolveVirtualDocumentViewState(
    rootId: string,
    index: number,
    viewportRange: RenderedSegment | null,
    mountedRootIds: ReadonlySet<string>,
    retainedRootIds: ReadonlySet<string>,
  ): VirtualDocumentViewState {
    if (
      viewportRange &&
      index >= viewportRange[0] &&
      index <= viewportRange[1]
    ) {
      return 'viewport'
    }
    if (
      this.idlePrefetchActiveSweep?.blockId === rootId ||
      this.idlePrefetchEvictRootIds.has(rootId)
    ) {
      return 'sweep'
    }
    if (this.idlePrefetchNearRootIds.has(rootId)) return 'near'
    if (mountedRootIds.has(rootId)) return 'mounted'
    if (retainedRootIds.has(rootId)) return 'retained'
    return 'unmounted'
  }

  private cacheVirtualDocumentViewport(
    viewportTop: number,
    viewportHeight: number,
  ): void {
    const projection = this.layoutProjection
    this.virtualDocumentViewportTop = viewportTop
    this.virtualDocumentViewportHeight = viewportHeight
    this.virtualDocumentViewportProjection = projection
    this.virtualDocumentViewportProjectionRevision =
      projection.revision
  }

  private captureVirtualDocumentViewportRange(
    projection: VerticalLayoutProjection,
  ): RenderedSegment | null {
    const top = Math.max(0, this.virtualDocumentViewportTop)
    const height = Math.max(0, this.virtualDocumentViewportHeight)
    const bottom = Math.min(projection.totalHeight, top + height)
    if (
      projection.length === 0 ||
      !Number.isFinite(top) ||
      !Number.isFinite(height) ||
      bottom <= top
    ) {
      return null
    }
    return [
      projection.indexAtOffset(top),
      projection.indexAtOffset(Math.max(
        top,
        bottom - VIRTUAL_DOCUMENT_VIEWPORT_EPSILON,
      )),
    ]
  }

  private readIdlePrefetchProjectedHeight(index: number): number | undefined {
    try {
      const height = this.layoutProjection.extentAt(index)
      return Number.isFinite(height) ? height : undefined
    } catch {
      return undefined
    }
  }

  private performanceNow(): number {
    return this.ownerWindow?.performance.now() ?? performance.now()
  }

  private reconcile(): void {
    try {
      this.repairModelStateIfNeeded()
      if (
        !this.fullMountFallback &&
        !this.continuousEstimateJournalSuspended &&
        this.layoutProjection === this.continuousLayoutProjection
      ) {
        this.flushContinuousEstimateJournal()
      }
      this.reconcileFrame()
      this.reconcileFailureCount = 0
      this.fallbackMountFailureLogged = false
    } catch (error) {
      this.handleReconcileFailure(error)
    }
  }

  private reconcileFrame(): void {
    const invalidationRevision = this.reconcileInvalidationRevision
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
    this.cacheVirtualDocumentViewport(scrollTop, viewportHeight)
    this.handoffIdlePrefetchToViewport(viewport)
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
          (start, end) => !this.hasIdlePrefetchPins() &&
            this.layoutProjection.rangeHeight(start, end) <=
              viewportHeight * SEGMENT_MERGE_MAX_VIEWPORT_RATIO,
        )
    const target = this.expandSegments(segments)
    const mountedRootIds = this.doc.vm.getMountedRootChildIds()
    // Range lookup remains on every scroll frame. Once it resolves to the same
    // projection window and no non-scroll owner invalidated reconciliation,
    // avoid repeating component, observer and spacer DOM synchronization.
    if (this.canSkipStableDomReconciliation(
      invalidationRevision,
      segments,
      visibleAbsoluteLayouts,
      mountedRootIds,
      settledSparseRoot,
    )) {
      this.armIdlePrefetch()
      return
    }
    const mounted = new Set(mountedRootIds)

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
    this.scheduleIdlePrefetchRevalidation(
      [...this.idlePrefetchInvalidatedRootIds].filter(id =>
        target.has(id) && mounted.has(id),
      ),
    )
    this.restorePendingStructureAnchor(structureRestore)
    this.publishViewChange()
    this.rememberReconciledWindow(
      invalidationRevision,
      segments,
      visibleAbsoluteLayouts,
    )
    this.armIdlePrefetch()
  }

  private canSkipStableDomReconciliation(
    invalidationRevision: number,
    segments: readonly RenderedSegment[],
    visibleAbsoluteLayoutIds: readonly string[],
    mountedRootIds: readonly string[],
    settledSparseRoot: boolean,
  ): boolean {
    const previous = this.lastReconciledWindow
    return !this.fullMountFallback &&
      !settledSparseRoot &&
      !this.pendingStructureAnchor &&
      !this.customProjectionValidationPending &&
      !this.blockNavigationTask &&
      this.reconcileFailureCount === 0 &&
      this.idlePrefetchInvalidatedRootIds.size === 0 &&
      this.reconciledInvalidationRevision === invalidationRevision &&
      previous !== null &&
      previous.projection === this.layoutProjection &&
      previous.projectionRevision === this.layoutProjection.revision &&
      segmentsEqual(previous.segments, segments) &&
      arraysEqual(previous.visibleAbsoluteLayoutIds, visibleAbsoluteLayoutIds) &&
      arraysEqual(previous.mountedRootIds, mountedRootIds) &&
      arraysEqual(previous.retainedRootIds, this.doc.vm.getRetainedRootChildIds())
  }

  private rememberReconciledWindow(
    invalidationRevision: number,
    segments: readonly RenderedSegment[],
    visibleAbsoluteLayoutIds: readonly string[],
  ): void {
    this.reconciledInvalidationRevision = invalidationRevision
    this.lastReconciledWindow = {
      projection: this.layoutProjection,
      projectionRevision: this.layoutProjection.revision,
      segments: segments.map(([start, end]): RenderedSegment => [start, end]),
      visibleAbsoluteLayoutIds: [...visibleAbsoluteLayoutIds],
      mountedRootIds: this.doc.vm.getMountedRootChildIds(),
      retainedRootIds: this.doc.vm.getRetainedRootChildIds(),
    }
  }

  private rebuildModel(
    nextBlockIds?: readonly string[],
    journalRetainedEstimates = false,
  ): void {
    const previous = new Map<string, number>()
    this.blockIds.forEach((id, index) => {
      if (index < this.heights.length) previous.set(id, this.heights.get(index))
    })
    this.blockIds = [...(nextBlockIds ?? this.doc.model.getChildrenIds(this.doc.rootId))]
    this.indexById = new Map(this.blockIds.map((id, index) => [id, index]))
    for (const id of [...this.idlePrefetchMeasuredEpochByRoot.keys()]) {
      if (!this.indexById.has(id)) this.idlePrefetchMeasuredEpochByRoot.delete(id)
    }
    for (const id of [...this.idlePrefetchPendingMeasurementRootIds]) {
      if (!this.indexById.has(id)) this.idlePrefetchPendingMeasurementRootIds.delete(id)
    }
    const nextProvenance = new Map<string, ModelHeightEstimateApplicationState>()
    const nextSemantics = new Map<string, ContinuousEstimateSemantics>()
    this.heights.bulkInit(
      this.blockIds.map((id) => {
        nextSemantics.set(
          id,
          this.continuousEstimateSemantics.get(id) ??
            this.readContinuousEstimateSemantics(id),
        )
        const retained = previous.get(id)
        const retainedProvenance = this.continuousHeightProvenance.get(id)
        if (retained != null && retainedProvenance) {
          nextProvenance.set(id, retainedProvenance)
          return retained
        }
        const estimate = this.resolveModelHeightEstimate(id)
        nextProvenance.set(id, {
          previousModelDriven: estimate.modelDriven,
          hasMeasuredHeight: false,
          measurementFresh: false,
        })
        return retained ?? estimate.height
      }),
    )
    this.continuousHeightProvenance = nextProvenance
    this.continuousEstimateSemantics = nextSemantics
    this.absolutePlacementRootIds = new Set(this.blockIds.filter(
      id => nextSemantics.get(id)?.flavour === 'placement-layout',
    ))
    for (const id of [...this.dirtyContinuousEstimateRootIds]) {
      if (!this.indexById.has(id)) this.dirtyContinuousEstimateRootIds.delete(id)
    }
    for (const id of [...this.stronglyInvalidContinuousEstimateRootIds]) {
      if (!this.indexById.has(id)) {
        this.stronglyInvalidContinuousEstimateRootIds.delete(id)
      }
    }
    // Registration may happen before init installs model subscriptions. A
    // second rebuild while the custom handoff is already suspended therefore
    // treats retained roots as dirty instead of trusting pre-hook provenance.
    if (journalRetainedEstimates && this.blockIds.length) {
      this.journalContinuousEstimateRefresh()
    }
    this.absolutePlacementVisibility.rebuild(this.blockIds)
    if (this.continuousEstimateJournalSuspended) {
      this.continuousProjectionChangePending = true
    } else {
      this.continuousLayoutProjection.notifyChange()
    }
  }

  private resolveModelHeightEstimate(blockId: string): ModelHeightEstimate {
    return estimateModelBlockHeightDetails(this.doc, blockId, {
      estimatedHeights: this.config.estimatedHeights,
      defaultHeight: DEFAULT_ESTIMATED_HEIGHT,
      layoutMode: 'flow',
    })
  }

  private readContinuousEstimateSemantics(
    blockId: string,
  ): ContinuousEstimateSemantics {
    const props = this.doc.model.getProps?.(blockId)
    const flavour = this.doc.model.getFlavour(blockId)
    const nodeType = this.doc.model.getNodeType?.(blockId)
    const plainTextOnly = typeof flavour === 'string' &&
      this.doc.schemas?.get(flavour, false)?.metadata.plainTextOnly === true
    return {
      flavour,
      nodeType,
      heading: nodeType === BlockNodeType.editable && !plainTextOnly
        ? props?.['heading'] ?? null
        : null,
    }
  }

  private refreshContinuousEstimateSemantics(blockId: string): boolean {
    const previous = this.continuousEstimateSemantics.get(blockId)
    const next = this.readContinuousEstimateSemantics(blockId)
    this.continuousEstimateSemantics.set(blockId, next)
    const wasPlacement = previous?.flavour === 'placement-layout'
    const isPlacement = next.flavour === 'placement-layout'
    if (previous !== undefined && wasPlacement !== isPlacement) {
      if (isPlacement) this.absolutePlacementRootIds.add(blockId)
      else this.absolutePlacementRootIds.delete(blockId)
      this.absolutePlacementVisibility.rebuild([
        ...this.absolutePlacementRootIds,
      ])
      this.schedule()
    }
    return previous !== undefined && (
      previous.flavour !== next.flavour ||
      previous.nodeType !== next.nodeType ||
      previous.heading !== next.heading
    )
  }

  private refreshModelEstimates(
    changedBlockIds?: readonly string[],
    refreshAbsoluteVisibility = changedBlockIds === undefined,
    shouldRefreshHeight: (blockId: string) => boolean = () => true,
    stronglyInvalidRootIds: readonly string[] = [],
  ): void {
    if (!this.scrollContainer || !this.blockIds.length) return
    if (
      changedBlockIds === undefined &&
      this.continuousEstimateJournalSuspended
    ) {
      this.journalContinuousEstimateRefresh()
      if (refreshAbsoluteVisibility && this.absolutePlacementRootIds.size) {
        this.absolutePlacementVisibility.rebuild([
          ...this.absolutePlacementRootIds,
        ])
        this.schedule()
      }
      return
    }
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
      this.absolutePlacementVisibility.rebuild([
        ...this.absolutePlacementRootIds,
      ])
    }
    const heightRootIds = [...rootIds].filter(shouldRefreshHeight)
    const heightRootIdSet = new Set(heightRootIds)
    const strongRootIds = stronglyInvalidRootIds.filter(
      id => heightRootIdSet.has(id),
    )
    if (this.continuousEstimateJournalSuspended) {
      this.journalContinuousEstimateRefresh(
        changedBlockIds === undefined ? undefined : heightRootIds,
        strongRootIds,
      )
    } else {
      this.applyCurrentModelEstimates(heightRootIds, strongRootIds)
    }
    if (absoluteVisibilityChanged) this.schedule()
  }

  private journalContinuousEstimateRefresh(
    rootIds?: readonly string[],
    stronglyInvalidRootIds: readonly string[] = [],
  ): void {
    stronglyInvalidRootIds.forEach(id => {
      if (this.indexById.has(id)) {
        this.stronglyInvalidContinuousEstimateRootIds.add(id)
      }
    })
    if (rootIds === undefined) {
      this.dirtyAllContinuousEstimates = true
      this.dirtyContinuousEstimateRootIds.clear()
      return
    }
    if (this.dirtyAllContinuousEstimates) return
    rootIds.forEach(id => {
      if (this.indexById.has(id)) this.dirtyContinuousEstimateRootIds.add(id)
    })
  }

  private clearContinuousEstimateJournal(): void {
    this.dirtyAllContinuousEstimates = false
    this.dirtyContinuousEstimateRootIds.clear()
    this.stronglyInvalidContinuousEstimateRootIds.clear()
    this.continuousProjectionChangePending = false
  }

  private flushContinuousEstimateJournal(): boolean {
    if (
      !this.dirtyAllContinuousEstimates &&
      !this.dirtyContinuousEstimateRootIds.size &&
      !this.continuousProjectionChangePending
    ) {
      return false
    }

    const projectionChangePending = this.continuousProjectionChangePending
    const replayAll = this.dirtyAllContinuousEstimates
    const rootIds = replayAll
      ? [...this.blockIds]
      : [...this.dirtyContinuousEstimateRootIds]
    const stronglyInvalidRootIds = [
      ...this.stronglyInvalidContinuousEstimateRootIds,
    ]
    this.clearContinuousEstimateJournal()
    try {
      const changed = this.applyModelEstimateBatch(
        rootIds,
        stronglyInvalidRootIds,
      )
      if (changed || projectionChangePending) {
        this.continuousLayoutProjection.notifyChange()
      }
      return changed || projectionChangePending
    } catch (error) {
      this.continuousProjectionChangePending ||= projectionChangePending
      if (replayAll) {
        this.journalContinuousEstimateRefresh(
          undefined,
          stronglyInvalidRootIds,
        )
      } else {
        this.journalContinuousEstimateRefresh(rootIds, stronglyInvalidRootIds)
      }
      throw error
    }
  }

  private applyCurrentModelEstimates(
    rootIds: readonly string[],
    stronglyInvalidRootIds: readonly string[] = [],
  ): void {
    if (
      this.disposed ||
      !this.scrollContainer ||
      !rootIds.length ||
      this.layoutProjection !== this.continuousLayoutProjection
    ) {
      return
    }
    const applications = this.prepareModelEstimateBatch(
      rootIds,
      stronglyInvalidRootIds,
    )
    if (!applications.some(application => application.geometryChanged)) {
      this.commitModelEstimateBatch(applications)
      return
    }
    const viewportTop = this.getViewportTop()
    const anchor = captureProjectedScrollAnchor(
      this.blockIds,
      this.continuousLayoutProjection,
      viewportTop,
    )
    const changed = this.commitModelEstimateBatch(applications)
    if (!changed) return
    this.continuousLayoutProjection.notifyChange()
    this.restoreContinuousMeasurementAnchor(anchor, viewportTop)
    this.schedule()
  }

  private applyModelEstimateBatch(
    rootIds: readonly string[],
    stronglyInvalidRootIds: readonly string[] = [],
  ): boolean {
    return this.commitModelEstimateBatch(
      this.prepareModelEstimateBatch(rootIds, stronglyInvalidRootIds),
    )
  }

  private prepareModelEstimateBatch(
    rootIds: readonly string[],
    stronglyInvalidRootIds: readonly string[] = [],
  ): readonly ContinuousModelEstimateApplication[] {
    const stronglyInvalid = new Set(stronglyInvalidRootIds)
    const applications: ContinuousModelEstimateApplication[] = []
    rootIds.forEach(id => {
      const index = this.indexById.get(id)
      if (index === undefined) return
      const estimate = this.resolveModelHeightEstimate(id)
      const previous = this.continuousHeightProvenance.get(id) ?? {
        previousModelDriven: false,
        hasMeasuredHeight: false,
        measurementFresh: false,
      }
      const applicationState: ModelHeightEstimateApplicationState = {
        ...previous,
        hasMeasuredHeight: stronglyInvalid.has(id)
          ? false
          : previous.hasMeasuredHeight,
        measurementFresh: false,
      }
      const apply = shouldApplyModelHeightEstimate(estimate, applicationState)
      const geometryChanged = apply && Math.abs(
        this.heights.get(index) - estimate.height,
      ) > HEIGHT_MEASUREMENT_EPSILON
      applications.push({
        id,
        index,
        estimate,
        semantics: this.readContinuousEstimateSemantics(id),
        provenance: {
          previousModelDriven: estimate.modelDriven,
          hasMeasuredHeight: apply
            ? false
            : applicationState.hasMeasuredHeight,
          measurementFresh: false,
        },
        geometryChanged,
      })
    })
    return applications
  }

  private commitModelEstimateBatch(
    applications: readonly ContinuousModelEstimateApplication[],
  ): boolean {
    let changed = false
    applications.forEach(application => {
      this.continuousHeightProvenance.set(
        application.id,
        application.provenance,
      )
      this.continuousEstimateSemantics.set(
        application.id,
        application.semantics,
      )
      if (!application.geometryChanged) return
      this.heights.update(application.index, application.estimate.height)
      changed = true
    })
    return changed
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
    change?: Pick<
      IBlockModelStructureChange,
      'affectedRootIds' | 'affectedParentIds'
    >,
  ): void {
    try {
      this.invalidateIdlePrefetch('structure', true)
      this.synchronizeRootModel(false)
      if (change?.affectedRootIds?.length) {
        const estimateRootIds = this.structureEstimateRootIds(
          change,
          change.affectedRootIds,
        )
        // Nested structure invalidates the owning render unit's old DOM
        // measurement. A pure root-level insert/delete/reorder changes only
        // order and must not downgrade surviving measured paragraphs.
        this.refreshModelEstimates(
          estimateRootIds,
          true,
          () => true,
          estimateRootIds,
        )
      }
      this.schedule()
    } catch (error) {
      this.handleReconcileFailure(error)
    }
  }

  private structureEstimateRootIds(
    change: Pick<IBlockModelStructureChange, 'affectedParentIds'>,
    affectedRootIds: readonly string[],
  ): readonly string[] {
    const parentIds = change.affectedParentIds ?? []
    if (!parentIds.length) return affectedRootIds

    const rootIds = new Set<string>()
    for (const parentId of parentIds) {
      if (parentId === this.doc.rootId) continue
      const path = this.doc.model.getPath(parentId)
      const rootId = path?.[0] === this.doc.rootId ? path[1] : undefined
      if (!rootId) return affectedRootIds
      rootIds.add(rootId)
    }
    return [...rootIds]
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
    this.pauseIdlePrefetch('full-mount-fallback', true)
    this.reconcileFailureCount = 0
    this.fallbackMountFailureLogged = false
    this.clearContinuousEstimateJournal()
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
    this.idlePrefetchInvalidatedRootIds.delete(id)
    this.idlePrefetchRevalidationRootIds.delete(id)
    this.doc.vm.mountRootChild(id)
  }

  private retainRootView(id: string): void {
    const component = this.doc.vm.retainRootChild(id)
    if (!component) {
      if (this.idlePrefetchEvictRootIds.has(id)) {
        this.recordIdlePrefetchTrace({
          phase: 'lease',
          kind: 'release-deferred',
          lane: 'sweep',
          rootId: id,
          reason: 'retain-failed',
          epoch: this.idlePrefetchMeasurementEpoch,
        })
      }
      return
    }

    if (this.idlePrefetchEvictRootIds.delete(id)) {
      this.retainedRootIds.delete(id)
      if (this.doc.vm.destroyRetainedRootChild(id)) {
        const flavour = this.doc.model.getFlavour(id)
        this.recordIdlePrefetchTrace({
          phase: 'component',
          kind: 'component-destroyed',
          lane: 'sweep',
          rootId: id,
          flavour: typeof flavour === 'string' ? flavour : undefined,
          epoch: this.idlePrefetchMeasurementEpoch,
        })
        return
      }
      const flavour = this.doc.model.getFlavour(id)
      this.recordIdlePrefetchTrace({
        phase: 'lease',
        kind: 'release-deferred',
        lane: 'sweep',
        rootId: id,
        flavour: typeof flavour === 'string' ? flavour : undefined,
        reason: 'destroy-rejected',
        epoch: this.idlePrefetchMeasurementEpoch,
      })
    }

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
    for (const id of [...this.idlePrefetchInvalidatedRootIds]) {
      if (!this.indexById.has(id)) this.idlePrefetchInvalidatedRootIds.delete(id)
    }
    for (const id of [...this.idlePrefetchRevalidationRootIds]) {
      if (!this.indexById.has(id)) this.idlePrefetchRevalidationRootIds.delete(id)
    }
    for (const id of [...this.idlePrefetchEvictRootIds]) {
      if (!this.indexById.has(id)) this.idlePrefetchEvictRootIds.delete(id)
    }
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

    if (this.config.idlePrefetch) {
      pushBoundedSample(
        this.idlePrefetchAnchorCorrections,
        Math.abs(this._visualToLayout(correction)),
      )
    }
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

  private applyObservedMeasurements(measurements: HeightMeasurement[]): void {
    if (
      this.disposed ||
      !this.scrollContainer ||
      !measurements.length ||
      this.continuousEstimateJournalSuspended ||
      this.layoutProjection !== this.continuousLayoutProjection
    ) {
      return
    }
    const acceptedMeasurements = measurements.filter(
      ([id]) => !this.idlePrefetchInvalidatedRootIds.has(id),
    )
    if (!acceptedMeasurements.length) return
    const viewportTop = this.getViewportTop()
    const anchor = captureProjectedScrollAnchor(
      this.blockIds,
      this.layoutProjection,
      viewportTop,
    )
    const shouldCaptureIdlePrefetchTrace =
      this.config.idlePrefetch &&
      this.idlePrefetchPendingMeasurementRootIds.size > 0
    let idlePrefetchTraceDetails:
      Map<string, IdlePrefetchMeasurementTraceDetails> | undefined
    let changed = false
    acceptedMeasurements.forEach(([id, height]) => {
      const index = this.indexById.get(id)
      if (index === undefined) return
      if (
        shouldCaptureIdlePrefetchTrace &&
        this.idlePrefetchPendingMeasurementRootIds.has(id)
      ) {
        idlePrefetchTraceDetails ??=
          new Map<string, IdlePrefetchMeasurementTraceDetails>()
        idlePrefetchTraceDetails.set(id, {
          estimatedHeight: this.heights.get(index),
          measuredHeight: height,
        })
      }
      const previous = this.continuousHeightProvenance.get(id) ?? {
        previousModelDriven: false,
        hasMeasuredHeight: false,
        measurementFresh: false,
      }
      if (
        !previous.measurementFresh &&
        (this.idlePrefetchNearRootIds.has(id) ||
          this.idlePrefetchActiveSweep?.blockId === id)
      ) {
        pushBoundedSample(
          this.idlePrefetchEstimateErrors,
          Math.abs(this.heights.get(index) - height),
        )
      }
      // Provenance changes even when the observer reports the same geometry;
      // the next model fallback must know that a fresh DOM measurement exists.
      this.continuousHeightProvenance.set(id, {
        ...previous,
        hasMeasuredHeight: true,
        measurementFresh: true,
      })
      if (Math.abs(this.heights.get(index) - height) <= HEIGHT_MEASUREMENT_EPSILON) return
      this.heights.update(index, height)
      changed = true
    })
    this.reportIdlePrefetchMeasurements(
      acceptedMeasurements.map(([id]) => id),
      idlePrefetchTraceDetails,
    )
    if (!changed) return
    this.continuousLayoutProjection.notifyChange()
    this.restoreContinuousMeasurementAnchor(anchor, viewportTop)
    this.schedule()
  }

  private restoreContinuousMeasurementAnchor(
    anchor: ScrollAnchorSnapshot | null,
    viewportTop: number,
  ): void {
    // Projection/structure handoff owns one old-coordinate anchor until the
    // first continuous frame. ResizeObserver may run before that frame; let it
    // update geometry, but do not apply a competing continuous correction.
    if (
      !anchor ||
      !this.scrollContainer ||
      this.blockNavigationTask ||
      this.pendingStructureAnchor
    ) {
      return
    }
    const restored = restoreProjectedScrollAnchor(
      anchor,
      (id) => this.indexById.get(id) ?? -1,
      this.continuousLayoutProjection,
      viewportTop,
      this._visualToLayout(this.scrollContainer.clientHeight),
    )
    if (!restored || Math.abs(restored.correctionPx) < 0.5) return
    if (this.config.idlePrefetch) {
      pushBoundedSample(
        this.idlePrefetchAnchorCorrections,
        Math.abs(restored.correctionPx),
      )
    }
    this.scrollContainer.scrollTop += this._layoutToVisual(restored.correctionPx)
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
    this.invalidateIdlePrefetch('projection-deactivate', true)
    let anchor = this.pendingStructureAnchor
    if (!anchor) {
      try {
        anchor = this.captureCurrentStructureAnchor()
      } catch (error) {
        this.doc.logger.warn('layoutProjectionAnchorCaptureError: ', error)
      }
    }
    this.pendingStructureAnchor = anchor
    this.cancelScheduledReconcile()
    this.customLayoutProjectionSubscription?.unsubscribe()
    this.customLayoutProjectionSubscription = null
    const hooks = this.customLayoutProjectionHooks
    let cleanupError: unknown
    let cleanupFailed = false
    this.customProjectionHandoffInProgress = true
    try {
      hooks?.beforeDeactivate?.()
    } catch (error) {
      cleanupFailed = true
      cleanupError = error
    } finally {
      try {
        this.flushContinuousEstimateJournal()
      } catch (replayError) {
        // Keep the journal intact for the first continuous reconciliation.
        this.doc.logger.warn('continuousEstimateReplayError: ', replayError)
      } finally {
        this.customLayoutProjection = null
        this.customLayoutProjectionHooks = null
        this.customProjectionValidationPending = false
        this.customProjectionFailureCount = 0
        this.layoutProjection = this.continuousLayoutProjection
        this.continuousEstimateJournalSuspended = false
        this.customProjectionHandoffInProgress = false
        if (this.scrollContainer && !this.fullMountFallback) {
          this.syncHeightObserver()
        }
        this.schedule()
      }
    }
    if (cleanupFailed) throw cleanupError
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

/**
 * @internal Package-private acknowledgement from sparse Pagination after its
 * geometry index accepted live measurements for the currently mounted roots.
 */
export function reportRootIdlePrefetchMeasurements(
  manager: RootVirtualizationManager | null | undefined,
  rootIds: readonly string[],
): boolean {
  if (!manager) return false
  const reporter = idlePrefetchMeasurementReporters.get(manager)
  if (reporter) return reporter(rootIds)

  // Narrow compatibility seam for controller tests and older internal mocks.
  const compatible = manager as unknown as {
    reportIdlePrefetchMeasurements?: (ids: readonly string[]) => boolean
  }
  return compatible.reportIdlePrefetchMeasurements?.(rootIds) === true
}

/** @internal True while one of these mounted roots awaits idle measurement ACK. */
export function hasPendingRootIdlePrefetchMeasurements(
  manager: RootVirtualizationManager | null | undefined,
  rootIds: readonly string[],
): boolean {
  if (!manager) return false
  const query = idlePrefetchPendingMeasurementQueries.get(manager)
  if (query) return query(rootIds)

  const compatible = manager as unknown as {
    hasPendingIdlePrefetchMeasurements?: (ids: readonly string[]) => boolean
  }
  return compatible.hasPendingIdlePrefetchMeasurements?.(rootIds) === true
}

/** @internal Snapshot the mounted roots that currently await idle measurement ACK. */
export function pendingRootIdlePrefetchMeasurementIds(
  manager: RootVirtualizationManager | null | undefined,
  rootIds: readonly string[],
): readonly string[] {
  if (!manager) return []
  const read = idlePrefetchPendingMeasurementReaders.get(manager)
  if (read) return read(rootIds)

  const compatible = manager as unknown as {
    pendingIdlePrefetchMeasurementIds?: (
      ids: readonly string[],
    ) => readonly string[]
  }
  return compatible.pendingIdlePrefetchMeasurementIds?.(rootIds) ?? []
}

/**
 * @internal Subscribe to near-prefetch ownership handoff without widening the
 * public VirtualizationViewChange event contract.
 */
export function subscribeRootIdlePrefetchHandoffs(
  manager: RootVirtualizationManager | null | undefined,
  listener: IdlePrefetchHandoffListener,
): () => void {
  if (!manager) return () => undefined
  const listeners = idlePrefetchHandoffListeners.get(manager)
  if (listeners) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  const compatible = manager as unknown as {
    subscribeIdlePrefetchHandoffs?: (
      callback: IdlePrefetchHandoffListener,
    ) => () => void
  }
  return compatible.subscribeIdlePrefetchHandoffs?.(listener) ?? (() => undefined)
}

/** @internal Invalidate idle geometry tickets from a custom projection owner. */
export function invalidateRootIdlePrefetch(
  manager: RootVirtualizationManager | null | undefined,
  reason: string,
): void {
  if (!manager) return
  const invalidate = idlePrefetchInvalidators.get(manager)
  if (invalidate) {
    invalidate(reason)
    return
  }
  const compatible = manager as unknown as {
    invalidateIdlePrefetchMeasurements?: (value: string) => void
  }
  compatible.invalidateIdlePrefetchMeasurements?.(reason)
}

function pushBoundedSample(values: number[], value: number): void {
  if (!Number.isFinite(value)) return
  values.push(value)
  if (values.length > IDLE_PREFETCH_DIAGNOSTIC_SAMPLE_LIMIT) values.shift()
}

function mixVirtualDocumentInteger(hash: number, value: number): number {
  const integer = Number.isFinite(value) ? Math.trunc(value) : 0
  let next = hash
  for (let shift = 0; shift < 32; shift += 8) {
    next = Math.imul(
      next ^ ((integer >>> shift) & 0xff),
      VIRTUAL_DOCUMENT_HASH_PRIME,
    ) >>> 0
  }
  return next
}

function mixVirtualDocumentGeometry(hash: number, value: number): number {
  return mixVirtualDocumentInteger(hash, Math.round(value * 10))
}

function mixVirtualDocumentString(hash: number, value: string): number {
  let next = mixVirtualDocumentInteger(hash, value.length)
  for (let index = 0; index < value.length; index++) {
    next = mixVirtualDocumentInteger(next, value.charCodeAt(index))
  }
  return next
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function segmentsEqual(
  left: readonly RenderedSegment[],
  right: readonly RenderedSegment[],
): boolean {
  return left.length === right.length && left.every((segment, index) =>
    segment[0] === right[index]?.[0] && segment[1] === right[index]?.[1])
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
