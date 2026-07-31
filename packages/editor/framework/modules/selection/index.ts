import {
  BlockNodeType,
  DocEventRegister,
  EditableBlockComponent,
} from "../../block-std";
import {BehaviorSubject, fromEvent, skip, take, takeUntil} from "rxjs";
import {closetBlockId, getBlockGapAnchor, getBlockGapCaretSpan, isNativeInputTarget} from "../../utils";
import {deltaToString} from "../../../global";
import {SelectionSelectedManager} from "./selected-manager";
import {SelectionKeyboard} from "./selection-keyboard";
import {FakeRange, IFakeRangeConfig} from "./createFakeRange";
import {BlockSelection} from "./blockSelection";
import {
  IBlockInlineRangeJSON,
  IBlockSelectionJSON,
  INormalizedRange,
  ISelectionJSON,
  ISelectionPoint,
  ISelectionPointJSON,
} from "./types";
import {
  normalizeRange as _normalizeRange,
  INormalizedEndpoints,
  endpointsToLegacy,
  lazyPoint as _lazyPoint,
  lazyGapPoint,
  lazyBoundaryPoint,
  lazyTableCellPoint,
} from "./normalize";
import {hasLiveSelectionEndpoints, isSelectionAlive} from "./liveness";
import {
  resolveCommonSelectionScope,
  resolveSelectionContainerId,
  resolveSelectionScope,
  SelectionScope,
} from "./scope";
import {
  SelectionPositionOrder,
  SelectionPositionResolver,
} from "./position-resolver";
import {SelectionModelResolver} from "./model-resolver";
import {resolveSelectionCommonParent} from "./common-parent";
import {RemoteSelectionReconciler} from './remote-selection-reconciler';
import {
  RelativeSelectionBookmark,
  sameSelectionJSON,
} from './relative-bookmark';
import {SelectionHistoryRestorer} from './history-restorer';
import {
  DOMSelectionSurfaceAdapter,
  SelectionSurfaceAdapter,
} from './surface-adapter';
import type {SelectionProjectionMountAdapter} from './projection-mount-adapter';

const DOM_PROJECTION_RETRY_LIMIT = 8

interface ProjectionMountRequest {
  adapter: SelectionProjectionMountAdapter
  controller: AbortController
  expected: ISelectionJSON
  projectionVersion: number
  scrollIntoView?: boolean
}

@DocEventRegister
export class SelectionManager {

  public readonly selectionChange$ = new BehaviorSubject<BlockSelection | null>(null)

  private selectedManager = new SelectionSelectedManager(this.doc)
  private readonly _keyboard: SelectionKeyboard
  private _suppressRecalculate = false
  private _suppressProgrammaticSelectionChangeUntil = 0
  private _compositionSelectionRecheckQueued = false
  private _compositionSelectionRecheckTimer: ReturnType<typeof setTimeout> | null = null
  private _compositionSelectionRecheckVersion = 0
  private _primaryPointerDown = false
  private _projectionVersion = 0
  private _projectionFrame: number | null = null
  private _projectionMountAdapter: SelectionProjectionMountAdapter | null = null
  private _projectionMountRegistrationVersion = 0
  private _projectionMountRequest: ProjectionMountRequest | null = null
  private readonly _positionResolver: SelectionPositionResolver
  private readonly _modelResolver: SelectionModelResolver | null
  private readonly _remoteSelectionReconciler: RemoteSelectionReconciler | null
  private readonly _historyRestorer: SelectionHistoryRestorer
  private readonly _surface: SelectionSurfaceAdapter

  constructor(
    public readonly doc: BlockCraft.Doc,
    surface?: SelectionSurfaceAdapter,
  ) {
    this._surface = surface ?? new DOMSelectionSurfaceAdapter(doc)
    this._modelResolver = this.doc.model
      ? new SelectionModelResolver(this.doc.model)
      : null
    this._keyboard = new SelectionKeyboard(this.doc, this._surface)
    this._remoteSelectionReconciler = this.doc.crud?.remoteSyncLifecycle$
      ? new RemoteSelectionReconciler(
        this.doc,
        this.doc.crud.remoteSyncLifecycle$,
        this.changeObserve(),
        this._surface,
      )
      : null
    this._historyRestorer = new SelectionHistoryRestorer(this.doc, {
      replay: selection => this._replay(selection),
      readModelSelection: () => this.value?.toJSON() ?? null,
      readDomSelection: () => this.recalculate(false).value?.toJSON() ?? null,
      isProjectionPending: selection => this._isDomProjectionPending(selection),
      isSelectionVisible: selection => this._isSelectionVisibleInViewport(selection),
      ensureViewMounted: blockIds => this._ensureViewMounted(blockIds),
      scrollToBlock: blockId => {
        if (!this.doc.virtualization?.enabled) return false
        void this.doc.virtualization.scrollToBlock(blockId)
        return true
      },
      scrollSelectionIntoView: () => this.scrollSelectionIntoView(),
    }, this._surface)
    this._positionResolver = new SelectionPositionResolver({
      getParentId: blockId => {
        if (this._modelResolver?.exists(blockId)) {
          return this.doc.model.getParentId(blockId)
        }
        const block = this._readBlock(blockId)
        return block ? block.parentId ?? null : undefined
      },
      getChildrenIds: blockId => {
        if (this._modelResolver?.exists(blockId)) {
          return this._modelResolver.getChildrenIds(blockId)
        }
        const block = this._readBlock(blockId)
        if (!block) return null
        if (block.nodeType === BlockNodeType.editable) return []
        try {
          return block.childrenIds ?? null
        } catch {
          return null
        }
      },
    })
    this.doc.afterInit(this._bindEvents)
    this.doc.onDestroy$.pipe(take(1)).subscribe(() => {
      this._cancelCompositionSelectionRecheck()
      this._cancelProjectionFrame()
      this._cancelProjectionMountRequest()
      this._projectionMountRegistrationVersion += 1
      this._projectionMountAdapter = null
      this._primaryPointerDown = false
      this._remoteSelectionReconciler?.destroy()
      this._historyRestorer.destroy()
    })
  }

  /**
   * Register the renderer responsible for mounting the bounded DOM neighborhood
   * required by native selection projection. Registering a replacement aborts
   * any request owned by the previous adapter.
   */
  registerProjectionMountAdapter(adapter: SelectionProjectionMountAdapter): () => void {
    const interruptedRequest = this._projectionMountRequest
    this._cancelProjectionMountRequest()
    const registrationVersion = ++this._projectionMountRegistrationVersion
    this._projectionMountAdapter = adapter
    if (interruptedRequest) {
      this._recoverDomProjection(
        interruptedRequest.expected,
        interruptedRequest.projectionVersion,
        interruptedRequest.scrollIntoView,
      )
    }
    let disposed = false
    return () => {
      if (disposed) return
      disposed = true
      if (registrationVersion !== this._projectionMountRegistrationVersion) return
      this._projectionMountRegistrationVersion += 1
      const pendingRequest = this._projectionMountRequest
      this._cancelProjectionMountRequest()
      this._projectionMountAdapter = null
      if (pendingRequest) {
        this._retryDomRangeWhenReady(
          pendingRequest.expected,
          pendingRequest.projectionVersion,
          pendingRequest.scrollIntoView,
        )
      }
    }
  }

  restoreBookmark(bookmark: RelativeSelectionBookmark | null): void {
    this._historyRestorer.restore(bookmark)
  }

  private _readBlock(blockId: string): BlockCraft.BlockComponent | null {
    try {
      return this.doc.getBlockById(blockId) ?? null
    } catch {
      return null
    }
  }

  get value() {
    const selection = this.selectionChange$.value
    if (!selection) return null
    if (hasLiveSelectionEndpoints(selection, this.doc)) return selection
    this._applyState(null)
    return null
  }

  blur() {
    this._applyState(null)
    this._surface.clearNativeSelection()
  }

  changeObserve() {
    return this.selectionChange$.pipe(takeUntil(this.doc.onDestroy$))
  }

  nextChangeObserve() {
    return this.selectionChange$.pipe(skip(1), take(1), takeUntil(this.doc.onDestroy$))
  }

  afterNextChange(fn: (selection: BlockSelection | null) => void) {
    this.nextChangeObserve().subscribe(fn)
  }

  private _bindEvents = (root: BlockCraft.IBlockComponents['root']) => {
    const virtualizationViewChange$ = this.doc.virtualization?.viewChange$
    virtualizationViewChange$?.pipe(takeUntil(this.doc.onDestroy$))
      .subscribe(({mountedRootIds}) => {
        const selection = this.selectionChange$.value
        this.selectedManager.setSelected(
          selection,
          mountedRootIds,
        )
        this._reprojectAfterVirtualViewChange(selection)
      })
    this.doc.event.customListen(this._surface.ownerDocument, 'selectionchange').subscribe(e => {
      // Explicit gates protect an active drag/transform and must stay hard.
      // The short programmatic projection window is different: when an IME
      // session recovers during that window, remember this native change and
      // replay it once the window expires instead of dropping it forever.
      if (this._suppressRecalculate) return
      if (this.doc.event.status.isComposing) {
        this._queueCompositionSelectionRecheck()
        return
      }
      const current = this.selectionChange$.value
      if (current && this._isDomProjectionPending(current.toJSON())) return
      if (this._suppressProgrammaticSelectionChangeUntil > performance.now()) return
      this.recalculate()
    })
    this.doc.event.customListen<FocusEvent>(root.hostElement, 'focusin').subscribe(event => {
      if (!isNativeInputTarget(event.target)) return
      if (this.value) {
        this.blur()
      }
    })
    // Triple-click: select the entire editable block's content. Native
    // triple-click can extend across editing-host boundaries introduced by
    // gap spans (data-block-zero-space, contenteditable=true) — landing the
    // range end on the next block's gap span (cross-block selection that
    // includes the void block) or on root.hostElement (which the
    // recalculate() fallback collapses via selection.modify('move')).
    // Intercept and program the selection ourselves.
    fromEvent<MouseEvent>(root.hostElement, 'mousedown', {capture: true})
      .pipe(takeUntil(this.doc.onDestroy$))
      .subscribe(event => {
        // A new primary-pointer intent must not inherit the short suppression
        // window from the previous programmatic DOM projection. Any selection
        // API invoked later in this mousedown will establish its own window.
        if (event.button === 0) {
          this._beginPrimaryPointerIntent()
        }
        if (event.detail !== 3) return
        if (isNativeInputTarget(event.target)) return
        const blockId = closetBlockId(event.target as Node)
        if (!blockId) return
        const block = this.doc.getBlockById(blockId)
        if (!block || !this.doc.isEditable(block)) return
        event.preventDefault()
        this.selectAllChildren(block)
      })

    const ownerWindow = this._surface.ownerDocument.defaultView ?? this._surface.ownerDocument
    fromEvent<PointerEvent>(root.hostElement, 'pointerdown', {capture: true})
      .pipe(takeUntil(this.doc.onDestroy$))
      .subscribe(event => {
        if (event.isPrimary && event.button === 0) this._beginPrimaryPointerIntent()
      })
    const releasePrimaryPointer = () => {
      this._primaryPointerDown = false
    }
    fromEvent<PointerEvent>(ownerWindow, 'pointerup', {capture: true})
      .pipe(takeUntil(this.doc.onDestroy$))
      .subscribe(releasePrimaryPointer)
    fromEvent<PointerEvent>(ownerWindow, 'pointercancel', {capture: true})
      .pipe(takeUntil(this.doc.onDestroy$))
      .subscribe(releasePrimaryPointer)
    fromEvent<MouseEvent>(ownerWindow, 'mouseup', {capture: true})
      .pipe(takeUntil(this.doc.onDestroy$))
      .subscribe(releasePrimaryPointer)
    fromEvent<TouchEvent>(ownerWindow, 'touchend', {capture: true})
      .pipe(takeUntil(this.doc.onDestroy$))
      .subscribe(releasePrimaryPointer)
    fromEvent<TouchEvent>(ownerWindow, 'touchcancel', {capture: true})
      .pipe(takeUntil(this.doc.onDestroy$))
      .subscribe(releasePrimaryPointer)
  }

  /**
   * 临时屏蔽原生 `selectionchange` 触发的 recalculate。
   *
   * 用于 transformBlocks / 批量 DOM 替换等场景：WKWebView 在大批 DOM
   * 替换 + contenteditable=false 子元素附近会同步发出大量 selectionchange，
   * 每次都触发 recalculate + selection.modify('move') 强制 layout，
   * 主线程被锁（Blink 不会出现）。
   *
   * 注意：只 gate 原生事件入口；代码主动调 `recalculate()` 不受影响，
   * 因此调用方应在批量操作结束后手动 `recalculate()` 一次收敛。
   */
  setSuppressRecalculate(v: boolean) {
    this._suppressRecalculate = v
    if (v) this._cancelCompositionSelectionRecheck()
  }

  private _suppressProgrammaticSelectionChange() {
    this._cancelCompositionSelectionRecheck()
    this._suppressProgrammaticSelectionChangeUntil = Math.max(
      this._suppressProgrammaticSelectionChangeUntil,
      performance.now() + 80,
    )
  }

  private _queueCompositionSelectionRecheck() {
    if (this._compositionSelectionRecheckQueued || this._compositionSelectionRecheckTimer !== null) return
    this._compositionSelectionRecheckQueued = true
    const version = ++this._compositionSelectionRecheckVersion
    queueMicrotask(() => {
      if (version !== this._compositionSelectionRecheckVersion) return
      this._compositionSelectionRecheckQueued = false
      this._runCompositionSelectionRecheck(version, 2)
    })
  }

  private _runCompositionSelectionRecheck(version: number, composingRetryBudget = 0) {
    if (version !== this._compositionSelectionRecheckVersion) return
    if (this._suppressRecalculate) return
    if (this.doc.event.status.isComposing) {
      // CompositionControl clears a stale cross-block session after the native
      // event finishes. Two bounded task hops cover either listener order; a
      // genuinely active composition is then left untouched without polling.
      if (composingRetryBudget <= 0) return
      this._compositionSelectionRecheckTimer = setTimeout(() => {
        if (version !== this._compositionSelectionRecheckVersion) return
        this._compositionSelectionRecheckTimer = null
        this._runCompositionSelectionRecheck(version, composingRetryBudget - 1)
      }, 0)
      return
    }

    const remaining = this._suppressProgrammaticSelectionChangeUntil - performance.now()
    if (remaining > 0) {
      this._compositionSelectionRecheckTimer = setTimeout(() => {
        if (version !== this._compositionSelectionRecheckVersion) return
        this._compositionSelectionRecheckTimer = null
        this._runCompositionSelectionRecheck(version)
      }, Math.ceil(remaining) + 1)
      return
    }
    this.recalculate()
  }

  private _cancelCompositionSelectionRecheck() {
    this._compositionSelectionRecheckVersion++
    this._compositionSelectionRecheckQueued = false
    if (this._compositionSelectionRecheckTimer !== null) {
      clearTimeout(this._compositionSelectionRecheckTimer)
      this._compositionSelectionRecheckTimer = null
    }
  }

  private _beginPrimaryPointerIntent(): void {
    this._primaryPointerDown = true
    this._suppressProgrammaticSelectionChangeUntil = 0
    this._cancelCompositionSelectionRecheck()
    this._cancelProjectionFrame()
    this._cancelProjectionMountRequest()
  }

  // ── Read from DOM (user interaction path) ──

  private _shouldKeepModelOnlySelection(): boolean {
    const current = this.value
    if (!current?.getTableCellSelection()) return false
    return this._surface.hasEditorFocus()
  }

  recalculate(execNext = true, options?: { isComposing?: boolean }, _depth = 0): {
    value: BlockSelection | null
    next?: () => void
  } {
    const activeElement = this._surface.getActiveElement()
    if (activeElement && this.doc.root.hostElement.contains(activeElement) && isNativeInputTarget(activeElement)) {
      const next = () => this._applyState(null)
      execNext && next()
      return {value: null, next: execNext ? undefined : next}
    }

    const selection = this._surface.getNativeSelection()
    if (!selection || !selection.rangeCount) {
      if (this._shouldKeepModelOnlySelection()) {
        return {value: this.value}
      }
      const next = () => this._applyState(null)
      execNext && next()
      return {value: null, next: execNext ? undefined : next}
    }

    const range = selection?.getRangeAt(0)
    const rootHost = this.doc.root.hostElement
    // A Range's common ancestor is inside root iff both endpoints are inside
    // root, so one ancestor walk is enough for the ownership guard.
    const rangeInsideRoot = !!range && rootHost.contains(range.commonAncestorContainer)
    if (!rangeInsideRoot) {
      const keepModelOnlySelection = this._shouldKeepModelOnlySelection()
      const editorOwnsFocus = activeElement === rootHost ||
        (!!activeElement && rootHost.contains(activeElement))
      // Safari may keep extending a native drag beyond the contenteditable root
      // after a model-owned table rectangle has taken over. Do not let that
      // external endpoint enter normalization or leave a second visual selection.
      if (editorOwnsFocus && selection.rangeCount) {
        selection.removeAllRanges()
      }
      if (keepModelOnlySelection) {
        return {value: this.value}
      }
      const next = () => this._applyState(null)
      execNext && next()
      return {value: null, next: execNext ? undefined : next}
    }

    if (range.startContainer === this.doc.root.hostElement || range.endContainer === this.doc.root.hostElement) {
      // selection.modify 在边界处可能无法推进 range，原代码同步自递归会栈溢出；
      // 限制重试深度，超出后视为无效选区。
      if (_depth >= 3) {
        const next = () => this._applyState(null)
        execNext && next()
        return {value: null, next: execNext ? undefined : next}
      }
      selection.modify('move', range.endOffset >= this.doc.root.childrenLength ? 'backward' : 'forward', 'character')
      return this.recalculate(execNext, options, _depth + 1)
    }

    try {
      // normalizeRange returns {start, end} in document order.
      // Determine real anchor/head from native Selection direction.
      const rawEndpoints = this._normalizeRange(range, options)
      const repairedEndpoints = this._repairCrossScopeEndpoints(rawEndpoints)
      const endpoints = repairedEndpoints ?? rawEndpoints
      const isBackward = isSelectionBackward(selection)
      const rawAnchor = isBackward ? endpoints.end : endpoints.start
      const rawHead = isBackward ? endpoints.start : endpoints.end
      const disallowedGapBlockId =
        this._disallowedCollapsedGapBlockId(rawAnchor, rawHead)
      const selectedPoint = disallowedGapBlockId
        ? this._pointFromJSON({
            blockId: disallowedGapBlockId,
            type: 'selected',
          })
        : null
      const anchor = selectedPoint ?? rawAnchor
      const head = selectedPoint ?? rawHead

      // Cross-parent guard: reject ranges that leave their semantic editing
      // scope, while allowing transparent child containers inside the same
      // scope to span their physical parents.
      let commonParent = disallowedGapBlockId ?? anchor.blockId
      if (anchor.blockId !== head.blockId) {
        const anchorParent = resolveSelectionContainerId(anchor)
        const headParent = resolveSelectionContainerId(head)
        let commonScope: SelectionScope | null | undefined
        if (anchorParent !== headParent) {
          commonScope = resolveCommonSelectionScope(
            anchor,
            head,
            id => this.doc.getBlockById(id) as any,
          )
          if (!commonScope) {
            range.collapse()
            return {value: null, next: () => {}}
          }
        }
        commonParent = this._commonParentForPoints(anchor, head, range, commonScope)
      }

      const r = this._createBlockSelection(anchor, head, commonParent)
      if (!r) throw new Error('Selection endpoints are disconnected')
      const next = () => {
        this._applyState(r)
        if (repairedEndpoints) {
          this._stabilizeCrossScopeDomSelection(r, selection)
        }
      }
      execNext && next()
      return {value: r, next: execNext ? undefined : next}
    } catch (e) {
      this.doc.logger.warn('normalizeRangeError: ', e)
      // normalize 失败（典型：选区端点块已被远端删除）必须清空模型选区，
      // 与上方各无效分支保持一致。残留悬空 blockId 会让后续所有
      // sel.anchor.block 取值器抛错（selected-manager 遍历等）。
      const next = () => this._applyState(null)
      execNext && next()
      return {value: null, next: execNext ? undefined : next}
    }
  }

  /**
   * Public API returns legacy INormalizedRange for backward compat.
   * Internally use _normalizeRange() for new anchor/head format.
   *
   * @deprecated Use the exported pure `normalizeRange()` function and
   * `INormalizedEndpoints`. This compatibility facade will be removed in a
   * future breaking release.
   */
  normalizeRange(range: StaticRange, options?: { isComposing?: boolean }): INormalizedRange {
    return endpointsToLegacy(this._normalizeRange(range, options))
  }

  private _normalizeRange(range: StaticRange, options?: { isComposing?: boolean }): INormalizedEndpoints {
    return _normalizeRange(range, id => this.doc.getBlockById(id) as any, options)
  }

  private _repairCrossScopeEndpoints(endpoints: INormalizedEndpoints): INormalizedEndpoints | null {
    const getBlock = (id: string) => this.doc.getBlockById(id) as any
    const startScope = resolveSelectionScope(endpoints.start, getBlock)
    const endScope = resolveSelectionScope(endpoints.end, getBlock)
    if (!startScope || !endScope || startScope.blockId === endScope.blockId) return null

    const start = startScope.kind === 'document'
      ? endpoints.start
      : this._boundaryPointForScope(startScope, 'before') ?? endpoints.start
    const end = endScope.kind === 'document'
      ? endpoints.end
      : this._boundaryPointForScope(endScope, 'after') ?? endpoints.end

    if (start === endpoints.start && end === endpoints.end) return null
    return {start, end}
  }

  private _boundaryPointForScope(
    scope: SelectionScope,
    side: 'before' | 'after',
  ): ISelectionPoint | null {
    const block = this.doc.getBlockById(scope.blockId)
    const parent = block.parentBlock
    if (!parent) return null
    const childrenIds = parent.childrenIds ?? []
    let index = childrenIds.indexOf(block.id)
    if (index < 0 && typeof block.getIndexOfParent === 'function') {
      index = block.getIndexOfParent()
    }
    if (index < 0) return null
    return lazyBoundaryPoint(
      parent.id,
      side === 'before' ? index : index + 1,
      id => this.doc.getBlockById(id) as any,
    )
  }

  private _commonParentForPoints(
    anchor: ISelectionPoint,
    head: ISelectionPoint,
    range: Range,
    commonScope?: SelectionScope | null,
  ): string {
    const modelCommonParent = this._commonParentFromModel(anchor, head, commonScope)
    if (modelCommonParent) return modelCommonParent
    return closetBlockId(range.commonAncestorContainer)!
  }

  private _commonParentFromModel(
    anchor: ISelectionPoint,
    head: ISelectionPoint,
    resolvedScope?: SelectionScope | null,
  ): string | null {
    try {
      return resolveSelectionCommonParent(
        anchor,
        head,
        id => this.doc.getBlockById(id) as any,
        resolvedScope,
      )
    } catch {
      return null
    }
  }

  // ── Model state management ──

  private _publishState(selection: BlockSelection | null) {
    this._cancelProjectionFrame()
    this._cancelProjectionMountRequest()
    this._projectionVersion += 1
    this.selectionChange$.next(selection)
    this.selectedManager.setSelected(
      selection,
      this.doc.virtualization?.enabled && typeof this.doc.vm?.getMountedRootChildIds === 'function'
        ? this.doc.vm.getMountedRootChildIds()
        : undefined,
    )
  }

  private _cancelProjectionFrame(): void {
    if (this._projectionFrame === null) return
    this._surface.cancelFrame(this._projectionFrame)
    this._projectionFrame = null
  }

  private _cancelProjectionMountRequest(): void {
    const request = this._projectionMountRequest
    if (!request) return
    this._projectionMountRequest = null
    request.controller.abort()
  }

  private _isDomProjectionPending(expected: ISelectionJSON): boolean {
    const current = this.value
    if (!current || !sameSelectionJSON(current.toJSON(), expected)) return false
    const mountRequest = this._projectionMountRequest
    if (mountRequest && sameSelectionJSON(mountRequest.expected, expected)) return true
    return this._projectionFrame !== null
  }

  private _scheduleProjectionFrame(callback: FrameRequestCallback): void {
    this._cancelProjectionFrame()
    const frame = this._surface.requestFrame(timestamp => {
      if (this._projectionFrame !== frame) return
      this._projectionFrame = null
      callback(timestamp)
    })
    this._projectionFrame = frame
  }

  private _applyState(selection: BlockSelection | null) {
    this._publishState(isSelectionAlive(selection, this.doc) ? selection : null)
  }

  private _createBlockSelection(
    anchor: ISelectionPoint,
    head: ISelectionPoint,
    commonParent: string,
  ): BlockSelection | null {
    const position = anchor.blockId === head.blockId
      ? {order: 0 as const, commonAncestor: anchor.blockId}
      : this._positionResolver.resolve(anchor.blockId, head.blockId)
    if (!position) return null

    return new BlockSelection(
      anchor, head, commonParent,
      id => this.doc.getBlockById(id) as any,
      (a, b) => {
        if (a === anchor.blockId && b === head.blockId) {
          return this._modelOrderToDomPosition(position.order)
        }
        if (a === head.blockId && b === anchor.blockId) {
          const reverseOrder = position.order === 0 ? 0 : -position.order as SelectionPositionOrder
          return this._modelOrderToDomPosition(reverseOrder)
        }
        return this._compareModelPosition(a, b)
      },
      this._modelResolver ?? undefined,
    )
  }

  private _compareModelPosition(a: string, b: string): number {
    const resolution = this._positionResolver.resolve(a, b)
    if (!resolution) return Node.DOCUMENT_POSITION_DISCONNECTED
    return this._modelOrderToDomPosition(resolution.order)
  }

  private _modelOrderToDomPosition(order: SelectionPositionOrder): number {
    if (order < 0) return Node.DOCUMENT_POSITION_FOLLOWING
    if (order > 0) return Node.DOCUMENT_POSITION_PRECEDING
    return 0
  }

  private _getGapCaretDomPoint(
    hostElement: HTMLElement,
    side: 'before' | 'after',
  ): {node: Node; offset: number} | null {
    const span = getBlockGapCaretSpan(hostElement, side)
    if (!span) return null
    const text = span.firstChild
    if (text?.nodeType === Node.TEXT_NODE) return {node: text, offset: 0}
    return {node: span, offset: 0}
  }

  private _applyDomRange(
    range: Range,
    direction: 'forward' | 'backward' = 'forward',
  ) {
    const selection = this._surface.getNativeSelection()
    if (!selection) throw new Error('Native selection is unavailable')
    this._suppressProgrammaticSelectionChange()

    if (direction === 'backward') {
      if (typeof selection.setBaseAndExtent === 'function') {
        selection.setBaseAndExtent(
          range.endContainer,
          range.endOffset,
          range.startContainer,
          range.startOffset,
        )
        return
      }
      if (typeof selection.extend === 'function') {
        selection.removeAllRanges()
        selection.collapse(range.endContainer, range.endOffset)
        selection.extend(range.startContainer, range.startOffset)
        return
      }
    }

    selection.removeAllRanges()
    selection.addRange(range)
  }

  private _stabilizeCrossScopeDomSelection(
    selectionState: BlockSelection,
    nativeSelection: globalThis.Selection,
  ): void {
    try {
      const range = this._buildDomRange(
        pointToLegacy(selectionState.start),
        pointToLegacy(selectionState.end),
      )
      const backward = selectionState.direction === 'backward'
      const anchorNode = backward ? range.endContainer : range.startContainer
      const anchorOffset = backward ? range.endOffset : range.startOffset
      const focusNode = backward ? range.startContainer : range.endContainer
      const focusOffset = backward ? range.startOffset : range.endOffset

      // Native drag must keep producing selectionchange events. The projected
      // boundary range round-trips unchanged, so no suppression window is used.
      if (typeof nativeSelection.setBaseAndExtent === 'function') {
        nativeSelection.setBaseAndExtent(
          anchorNode,
          anchorOffset,
          focusNode,
          focusOffset,
        )
        return
      }

      nativeSelection.removeAllRanges()
      if (backward && typeof nativeSelection.extend === 'function') {
        nativeSelection.collapse(anchorNode, anchorOffset)
        nativeSelection.extend(focusNode, focusOffset)
      } else {
        nativeSelection.addRange(range)
      }
    } catch (error) {
      this.doc.logger.warn('crossScopeSelectionProjectionError: ', error)
    }
  }

  private _applyDomRangeForSelection(
    selectionState: BlockSelection,
    scrollIntoView?: boolean,
    projectionVersion = this._projectionVersion,
    requestMount = true,
  ): Range | null {
    if (this._shouldDeferGapDomRange(selectionState)) {
      this._suppressProgrammaticSelectionChange()
      this._surface.clearNativeSelection()
      const expected = selectionState.toJSON()
      if (requestMount) {
        this._recoverDomProjection(expected, projectionVersion, scrollIntoView)
      } else {
        this._retryDomRangeWhenReady(expected, projectionVersion, scrollIntoView)
      }
      return null
    }

    const range = this._buildDomRange(
      pointToLegacy(selectionState.start),
      pointToLegacy(selectionState.end),
    )
    this._applyDomRange(range, selectionState.direction)
    if (scrollIntoView) {
      this.scrollSelectionIntoView()
    }
    return range
  }

  /**
   * Reassert a cross-root native range after the virtual window rewrites its
   * intermediate DOM. The model range stays canonical; this repair runs only
   * on deduplicated mounted-window epochs, never on every scroll event.
   */
  private _reprojectAfterVirtualViewChange(selection: BlockSelection | null): void {
    if (!selection || selection.collapsed || !this.doc.virtualization?.enabled) return
    if (
      this._suppressRecalculate ||
      this.doc.event.status.isComposing ||
      this._primaryPointerDown
    ) {
      return
    }
    if (!this._selectionCrossesRootRenderUnits(selection)) return
    if (!this._surface.hasEditorFocus() && !this._surface.ownsNativeSelection()) return

    const expected = selection.toJSON()
    const projectionVersion = this._projectionVersion
    try {
      this._applyDomRangeForSelection(selection, false, projectionVersion, false)
    } catch {
      this._surface.clearNativeSelection()
      this._recoverDomProjection(expected, projectionVersion)
    }
  }

  private _selectionCrossesRootRenderUnits(selection: BlockSelection): boolean {
    const startUnit = this._rootRenderUnitForPoint(selection.start, 'start')
    const endUnit = this._rootRenderUnitForPoint(selection.end, 'end')
    return !!startUnit && !!endUnit && startUnit !== endUnit
  }

  private _rootRenderUnitForPoint(
    point: ISelectionPoint,
    edge: 'start' | 'end',
  ): string | null {
    const model = this.doc.model
    const rootId = this.doc.root.id
    if (!model) return null

    if (point.type === 'boundary' && point.blockId === rootId) {
      const children = model.getChildrenIds(rootId)
      const index = Math.max(0, Math.min(point.index, children.length))
      return edge === 'start'
        ? children[index] ?? children[index - 1] ?? null
        : children[index - 1] ?? children[index] ?? null
    }

    const path = model.getPath(point.blockId)
    return path?.[0] === rootId ? path[1] ?? null : null
  }

  private _commitSelection(
    selectionState: BlockSelection | null,
    options: {scrollIntoView?: boolean; modelOnly?: boolean} = {},
  ): Range | null {
    if (
      !isSelectionAlive(selectionState, this.doc)
    ) {
      this.blur()
      return null
    }

    this._ensureSelectionViewMounted(selectionState)
    this._publishState(selectionState)
    const projectionVersion = this._projectionVersion
    this._surface.focusRoot()
    this._suppressProgrammaticSelectionChange()

    if (options.modelOnly) {
      this._surface.clearNativeSelection()
      if (options.scrollIntoView) this.scrollSelectionIntoView()
      return null
    }

    try {
      return this._applyDomRangeForSelection(
        selectionState,
        options.scrollIntoView,
        projectionVersion,
      )
    } catch {
      this._suppressProgrammaticSelectionChange()
      this._surface.clearNativeSelection()
      this._recoverDomProjection(
        selectionState.toJSON(),
        projectionVersion,
        options.scrollIntoView,
      )
      return null
    }
  }

  private _shouldDeferGapDomRange(selection: BlockSelection): boolean {
    const gap = this._collapsedGapPoint(selection)
    if (!gap) return false
    try {
      return !this._getGapCaretDomPoint(gap.block.hostElement, gap.side)
    } catch {
      return false
    }
  }

  private _collapsedGapPoint(selection: BlockSelection): Extract<ISelectionPoint, {type: 'gap'}> | null {
    if (!selection.collapsed) return null
    if (selection.start.type !== 'gap' || selection.end.type !== 'gap') return null
    if (selection.start.blockId !== selection.end.blockId || selection.start.side !== selection.end.side) return null
    return selection.start
  }

  private _recoverDomProjection(
    expected: ISelectionJSON,
    projectionVersion: number,
    scrollIntoView?: boolean,
  ): void {
    const adapter = this._projectionMountAdapter
    const current = this.value
    if (!adapter || !current || !sameSelectionJSON(current.toJSON(), expected)) {
      this._retryDomRangeWhenReady(expected, projectionVersion, scrollIntoView)
      return
    }

    const blockIds = this._projectionMountTargetIds(current)
    if (!blockIds.length) {
      this._retryDomRangeWhenReady(expected, projectionVersion, scrollIntoView)
      return
    }

    this._cancelProjectionMountRequest()
    const request = {
      adapter,
      controller: new AbortController(),
      expected,
      projectionVersion,
      scrollIntoView,
    }
    this._projectionMountRequest = request

    let result: void | Promise<void>
    try {
      result = adapter.ensureMounted(blockIds, request.controller.signal)
    } catch {
      this._finishProjectionMountRequest(request)
      return
    }
    void Promise.resolve(result).then(
      () => this._finishProjectionMountRequest(request),
      () => this._finishProjectionMountRequest(request),
    )
  }

  private _finishProjectionMountRequest(request: ProjectionMountRequest): void {
    if (
      request.controller.signal.aborted ||
      this._projectionMountRequest !== request ||
      this._projectionMountAdapter !== request.adapter ||
      request.projectionVersion !== this._projectionVersion
    ) {
      return
    }
    const current = this.value
    if (!current || !sameSelectionJSON(current.toJSON(), request.expected)) {
      this._projectionMountRequest = null
      return
    }

    this._projectionMountRequest = null
    this._retryDomRangeWhenReady(
      request.expected,
      request.projectionVersion,
      request.scrollIntoView,
    )
  }

  private _projectionMountTargetIds(selection: BlockSelection): string[] {
    const blockIds = new Set<string>()
    const addPoint = (point: ISelectionPoint) => {
      blockIds.add(point.blockId)
      if (point.type !== 'boundary' || !this._modelResolver) return

      let children: readonly string[]
      try {
        children = this._modelResolver.getChildrenIds(point.blockId)
      } catch {
        return
      }
      const index = Math.max(0, Math.min(point.index, children.length))
      const nextId = children[index]
      const previousId = index > 0 ? children[index - 1] : undefined
      if (nextId) blockIds.add(nextId)
      if (previousId) blockIds.add(previousId)
    }

    addPoint(selection.start)
    addPoint(selection.end)
    return [...blockIds]
  }

  private _retryDomRangeWhenReady(
    expected: ISelectionJSON,
    projectionVersion: number,
    scrollIntoView?: boolean,
    attempts = DOM_PROJECTION_RETRY_LIMIT,
  ): void {
    this._scheduleProjectionFrame(() => {
      if (projectionVersion !== this._projectionVersion) return
      const current = this.value
      if (!current || !sameSelectionJSON(current.toJSON(), expected)) return
      if (!isSelectionAlive(current, this.doc)) {
        this._applyState(null)
        return
      }

      const rootHost = this.doc.root.hostElement
      const active = this._surface.getActiveElement()
      const focusDroppedWithDom = this._surface.isFocusDropped()
      if (
        !focusDroppedWithDom &&
        active !== rootHost &&
        !rootHost.contains(active)
      ) {
        return
      }
      if (focusDroppedWithDom) {
        this._surface.focusRoot()
      }
      this._suppressProgrammaticSelectionChange()
      if (this._shouldDeferGapDomRange(current)) {
        if (attempts > 0) {
          this._retryDomRangeWhenReady(
            expected,
            projectionVersion,
            scrollIntoView,
            attempts - 1,
          )
        }
        return
      }
      try {
        this._applyDomRangeForSelection(current, scrollIntoView, projectionVersion, false)
      } catch (error) {
        this._surface.clearNativeSelection()
        if (attempts > 0) {
          this._retryDomRangeWhenReady(
            expected,
            projectionVersion,
            scrollIntoView,
            attempts - 1,
          )
        } else {
          this.doc.logger.warn('selectionProjectionRetryError: ', error)
        }
      }
    })
  }

  private _wholeBlockPoint(blockId: string): ISelectionPoint {
    return this._pointFromJSON(wholeBlockSelectionPointJSON(blockId))
  }

  private _setWholeBlockRangeEndpoint(
    range: Range,
    side: 'start' | 'end',
    target: BlockCraft.BlockComponent,
  ) {
    const anchor = getBlockGapAnchor(
      target.hostElement,
      side === 'start' ? 'leading' : 'trailing',
    )
    if (anchor) {
      side === 'start'
        ? range.setStart(anchor.node, anchor.offset)
        : range.setEnd(anchor.node, anchor.offset)
      return
    }
    side === 'start'
      ? range.setStart(target.hostElement, 0)
      : range.setEnd(target.hostElement, target.hostElement.childElementCount)
  }

  // ── DOM Range construction ──

  /**
   * Build a DOM Range from model selection points.
   * Works with both new ISelectionPointJSON and legacy IBlockInlineRangeJSON.
   */
  private _buildDomRange(startPoint: any, endPoint?: any | null): Range {
    const range = this._surface.createRange()
    const fromBlock = this.doc.getBlockById(startPoint.blockId)

    if (startPoint.type === 'table-cell') {
      range.setStart(fromBlock.hostElement, 0)
      if (!endPoint || (endPoint.blockId === startPoint.blockId && endPoint.type === 'table-cell')) {
        range.setEnd(fromBlock.hostElement, fromBlock.hostElement.childElementCount)
        return range
      }
    }

    if (startPoint.type === 'boundary') {
      const collapsedBoundary = !endPoint || (
        endPoint.blockId === startPoint.blockId &&
        endPoint.type === 'boundary' &&
        endPoint.index === startPoint.index
      )
      const point = this._getBoundaryDomPoint(
        startPoint,
        'start',
        !collapsedBoundary,
      )
      range.setStart(point.node, point.offset)
      if (collapsedBoundary) {
        range.collapse(true)
        return range
      }
    }

    // Handle gap start
    if (startPoint.type === 'gap') {
      // Collapsed gap caret: place it inside the filler text node so Safari can
      // paint a real native caret. The span itself still owns the visual line box.
      const point = this._getGapCaretDomPoint(fromBlock.hostElement, startPoint.side === 'before' ? 'before' : 'after')
      if (point) {
        range.setStart(point.node, point.offset)
      } else {
        range.setStart(fromBlock.hostElement, startPoint.side === 'before' ? 0 : fromBlock.hostElement.childElementCount)
      }

      // For collapsed gap range, collapse and return. Only collapse when the end
      // is the SAME side — a same-block before→after gap range must build a real
      // range via the trailing/leading anchors (handled by the gap-end block below).
      if (!endPoint || (endPoint.blockId === startPoint.blockId && endPoint.type === 'gap' && endPoint.side === startPoint.side)) {
        range.collapse(true)
        return range
      }

      // Gap start with non-gap end: fall through to handle end
    }

    if (startPoint.type === 'text') {
      const fb = fromBlock as EditableBlockComponent
      const startOffset = startPoint.offset ?? startPoint.index ?? 0
      const startNodePos = fb.runtime.mapper.modelPointToDomPoint(fb.containerElement, startOffset)
      range.setStart(startNodePos.node, startNodePos.offset)

      // Collapsed or single-block range
      if (!endPoint || (endPoint.blockId === startPoint.blockId && endPoint.type === 'text')) {
        const endOffset = endPoint
          ? (endPoint.offset ?? (endPoint.index != null ? endPoint.index + (endPoint.length ?? 0) : startOffset))
          : (startPoint.length ? startOffset + startPoint.length : startOffset)
        if (endOffset === startOffset) {
          range.collapse(true)
          return range
        }
        const endNodePos = fb.runtime.mapper.modelPointToDomPoint(fb.containerElement, endOffset)
        range.setEnd(endNodePos.node, endNodePos.offset)
        return range
      }
    }

    if (isWholeBlockSelectionPoint(startPoint)) {
      // Anchor on the leading gap span's text node so the native Range starts
      // inside an editable text node — this lets Safari fire `beforeinput` for
      // backspace/delete on void/block selections.
      this._setWholeBlockRangeEndpoint(range, 'start', fromBlock)
    }

    if (!endPoint) {
      range.collapse(true)
      return range
    }

    const toBlock = this.doc.getBlockById(endPoint.blockId)

    if (endPoint.type === 'table-cell') {
      range.setEnd(toBlock.hostElement, toBlock.hostElement.childElementCount)
      return range
    }

    if (endPoint.type === 'boundary') {
      const point = this._getBoundaryDomPoint(endPoint, 'end', true)
      range.setEnd(point.node, point.offset)
      return range
    }

    // Handle gap end
    if (endPoint.type === 'gap') {
      const point = this._getGapCaretDomPoint(toBlock.hostElement, endPoint.side === 'before' ? 'before' : 'after')
      if (point) {
        range.setEnd(point.node, point.offset)
      } else {
        range.setEnd(toBlock.hostElement, endPoint.side === 'before' ? 0 : toBlock.hostElement.childElementCount)
      }
      return range
    }

    if (endPoint.type === 'text') {
      const tb = toBlock as EditableBlockComponent
      const endOffset = endPoint.offset ?? ((endPoint.index ?? 0) + (endPoint.length ?? 0))
      const endNodePos = tb.runtime.mapper.modelPointToDomPoint(tb.containerElement, endOffset)
      range.setEnd(endNodePos.node, endNodePos.offset)
      return range
    }

    this._setWholeBlockRangeEndpoint(range, 'end', toBlock)
    return range
  }

  private _getBoundaryDomPoint(
    point: { blockId: string; index: number },
    side: 'start' | 'end',
    useStableChildEdge = false,
  ): {node: Node; offset: number} {
    const block = this.doc.getBlockById(point.blockId)
    const container =
      block.childrenRenderRef?.containerElement ??
      block.hostElement.querySelector<HTMLElement>('.children-render-container') ??
      block.hostElement
    const childIds = block.childrenIds ?? []
    const index = Math.max(0, Math.min(point.index ?? 0, childIds.length))
    // Root child offsets are live and rebase when virtual siblings mount. Keep
    // non-collapsed endpoints inside the pinned adjacent block instead.
    const stableChildEdge = useStableChildEdge &&
      !!this.doc.virtualization?.enabled &&
      point.blockId === this.doc.root.id
    const childNodes = Array.from(container.childNodes)
    const candidates = side === 'start'
      ? [
          {childId: childIds[index], edge: 'start' as const},
          {childId: index > 0 ? childIds[index - 1] : undefined, edge: 'end' as const},
        ]
      : [
          {childId: index > 0 ? childIds[index - 1] : undefined, edge: 'end' as const},
          {childId: childIds[index], edge: 'start' as const},
        ]

    for (const candidate of candidates) {
      if (!candidate.childId) continue
      const child = this._readBlock(candidate.childId)
      if (!child) continue
      const gapPoint = getBlockGapAnchor(
        child.hostElement,
        candidate.edge === 'start' ? 'leading' : 'trailing',
      )
      if (gapPoint) return gapPoint
      if (stableChildEdge) {
        return this._getStableBlockEdgeDomPoint(child, candidate.edge)
      }

      const domIndex = childNodes.indexOf(child.hostElement)
      if (domIndex >= 0) {
        return {
          node: container,
          offset: candidate.edge === 'start' ? domIndex : domIndex + 1,
        }
      }
    }

    if (useStableChildEdge && candidates.some(candidate => !!candidate.childId)) {
      throw new Error('Boundary endpoint view is not mounted')
    }
    return {node: container, offset: Math.min(index, childNodes.length)}
  }

  private _getStableBlockEdgeDomPoint(
    block: BlockCraft.BlockComponent,
    edge: 'start' | 'end',
  ): {node: Node; offset: number} {
    if (block.nodeType === BlockNodeType.editable) {
      const editable = block as EditableBlockComponent
      try {
        const offset = edge === 'start' ? 0 : editable.textLength
        return editable.runtime.mapper.modelPointToDomPoint(
          editable.containerElement,
          offset,
        )
      } catch {
        // A newly mounted inline runtime can settle after its host. The host
        // edge remains descendant-stable until the next bounded reprojection.
      }
    }

    return {
      node: block.hostElement,
      offset: edge === 'start' ? 0 : block.hostElement.childNodes.length,
    }
  }

  private _selectionFromWritePoints(
    from: SelectionWritePoint,
    to?: SelectionWritePoint | null,
  ): BlockSelection | null {
    try {
      const anchor = this._pointFromJSON(this._writePointJSON(from, 'start'))
      const hasExplicitHead = to !== null && to !== undefined
      const head = this._pointFromJSON(this._writePointJSON(
        to ?? from,
        hasExplicitHead || this._isLegacyTextPoint(from) ? 'end' : 'start',
      ))
      const commonParent = this._commonParentFromModel(anchor, head)
      if (!commonParent) return null

      const selection = this._createBlockSelection(anchor, head, commonParent)
      if (!selection) return null
      const legacyWrite = this._isLegacyWritePoint(from) || (!!to && this._isLegacyWritePoint(to))
      return legacyWrite && selection.direction === 'backward'
        ? this._createBlockSelection(selection.start, selection.end, commonParent)
        : selection
    } catch {
      return null
    }
  }

  private _writePointJSON(
    point: SelectionWritePoint,
    edge: 'start' | 'end',
  ): ISelectionPointJSON {
    const value = point as any
    if (value.type === 'text') {
      const startOffset = typeof value.offset === 'number'
        ? value.offset
        : (value.index ?? 0)
      const offset = typeof value.offset === 'number' || edge === 'start'
        ? startOffset
        : startOffset + (value.length ?? 0)
      return {blockId: value.blockId, type: 'text', offset}
    }
    if (value.type === 'gap') {
      if (value.side !== 'before' && value.side !== 'after') throw new Error('Invalid gap selection point')
      return {blockId: value.blockId, type: 'gap', side: value.side}
    }
    if (value.type === 'boundary') {
      return {blockId: value.blockId, type: 'boundary', index: value.index ?? 0}
    }
    if (value.type === 'table-cell') {
      if (!value.tableId) throw new Error('Invalid table-cell selection point')
      return {blockId: value.blockId, type: 'table-cell', tableId: value.tableId}
    }
    if (value.type === 'selected') {
      return {blockId: value.blockId, type: 'selected'}
    }
    throw new Error('Invalid selection point')
  }

  private _isLegacyTextPoint(point: SelectionWritePoint): boolean {
    return point.type === 'text' && typeof (point as any).offset !== 'number'
  }

  private _isLegacyWritePoint(point: SelectionWritePoint): boolean {
    if (this._isLegacyTextPoint(point)) return true
    return !('block' in point)
  }

  private _ensureViewMounted(blockIds: readonly string[]): void {
    this.doc.virtualization?.ensureViewMounted(blockIds)
  }

  private _ensureSelectionViewMounted(selection: BlockSelection): void {
    const blockIds = this._projectionMountTargetIds(selection)
    if (blockIds.every(blockId => this._hasBlockView(blockId))) return
    this._ensureViewMounted(blockIds)
  }

  private _hasBlockView(blockId: string): boolean {
    try {
      if (!this.doc.getBlockById(blockId)) return false
      const isMounted = this.doc.vm?.isMounted
      return typeof isMounted !== 'function' || isMounted.call(this.doc.vm, blockId)
    } catch {
      return false
    }
  }

  private _resolveBlockView(block: string | BlockCraft.BlockComponent): BlockCraft.BlockComponent {
    if (typeof block !== 'string') return block
    this._ensureViewMounted([block])
    return this.doc.getBlockById(block)
  }

  // ── Public API: programmatic selection ──

  selectBlock(block: BlockCraft.BlockComponent | string) {
    block = this._resolveBlockView(block)
    let anchorBlock: BlockCraft.BlockComponent | null = null
    let headBlock: BlockCraft.BlockComponent | null = null

    if (block.nodeType === 'root') {
      const childIds = this._modelResolver?.getChildrenIds(block.id) ?? block.childrenIds
      const firstId = childIds?.[0]
      const lastId = childIds?.[childIds.length - 1]
      if (firstId && lastId) {
        this._ensureViewMounted(firstId === lastId ? [firstId] : [firstId, lastId])
        anchorBlock = this.doc.getBlockById(firstId)
        headBlock = this.doc.getBlockById(lastId)
      } else {
        anchorBlock = block.firstChildren ?? null
        headBlock = block.lastChildren ?? null
      }
    } else {
      anchorBlock = block
      headBlock = block
    }
    if (!anchorBlock || !headBlock) return

    const anchor = this._wholeBlockPoint(anchorBlock.id)
    const head = this._wholeBlockPoint(headBlock.id)
    this._commitSelection(this._createBlockSelection(anchor, head, block.id))
  }

  /** @deprecated Use setSelection with ISelectionPointJSON */
  setSelection(from: IBlockInlineRangeJSON, to?: IBlockInlineRangeJSON | null): Range
  setSelection(from: ISelectionPoint, to?: ISelectionPoint | null): Range
  setSelection(from: any, to?: any): Range {
    const selectionState = this._selectionFromWritePoints(from, to)
    if (!selectionState) {
      this.blur()
      throw new Error('Invalid programmatic selection')
    }
    const range = this._commitSelection(selectionState, {
      modelOnly: !!selectionState.getTableCellSelection(),
    })
    return range ?? this._buildDomRange(
      pointToLegacy(selectionState.start),
      pointToLegacy(selectionState.end),
    )
  }

  setCursorAt(block: EditableBlockComponent, index: number) {
    const point = this._pointFromJSON({blockId: block.id, type: 'text', offset: index})
    this._commitSelection(this._createBlockSelection(point, point, block.id))
  }

  extendTo(block: EditableBlockComponent, index: number) {
    const current = this.value
    if (!current) {
      this.setCursorAt(block, index)
      return
    }

    const head = this._pointFromJSON({blockId: block.id, type: 'text', offset: index})
    const commonParent = this._commonParentFromModel(current.anchor, head)
    if (!commonParent) {
      this.blur()
      return
    }
    this._commitSelection(this._createBlockSelection(current.anchor, head, commonParent))
  }

  selectOrSetCursorAtBlock(block: string | BlockCraft.BlockComponent, atStart: boolean, scrollIntoView = true) {
    block = this._resolveBlockView(block)
    if (this.doc.isEditable(block)) {
      this.setCursorAt(block, atStart ? 0 : block.textLength)
    } else {
      this.selectBlock(block)
    }
    scrollIntoView && this.scrollSelectionIntoView()
  }

  setCursorAtBlock(block: string | BlockCraft.BlockComponent, atStart: boolean, scrollIntoView = true) {
    block = this._resolveBlockView(block)
    if (this.doc.isEditable(block)) {
      this.setCursorAt(block, atStart ? 0 : block.textLength)
    } else if (block.nodeType === BlockNodeType.void) {
      this.selectBlock(block)
    } else {
      const children = searchEditableDescendant(block, atStart)
      if (!children) this.selectBlock(block)
      else this.selectOrSetCursorAtBlock(children, atStart, false)
    }
    scrollIntoView && this.scrollSelectionIntoView()
  }

  selectAllChildren(block: string | BlockCraft.BlockComponent) {
    block = this._resolveBlockView(block)
    if (this.doc.isEditable(block)) {
      this.replay({
        anchor: {blockId: block.id, type: 'text', offset: 0},
        head: {blockId: block.id, type: 'text', offset: block.textLength},
        commonParent: block.id,
      })
    } else if (block.childrenLength > 0) {
      this.replay({
        anchor: {blockId: block.id, type: 'boundary', index: 0},
        head: {blockId: block.id, type: 'boundary', index: block.childrenLength},
        commonParent: block.id,
      })
    } else {
      this.selectBlock(block)
    }
  }

  /**
   * Place a collapsed gap caret beside a void/container block.
   * `side: 'before'` anchors inside the leading gap span, `'after'` the trailing one.
   */
  public setGapCursor(block: string | BlockCraft.BlockComponent, side: 'before' | 'after', scrollIntoView?: boolean): void {
    const resolvedBlock = this._resolveBlockView(block)
    if (this.doc.placement?.allowsGapCursor?.(resolvedBlock) === false) {
      this.selectBlock(resolvedBlock)
      return
    }
    const gapPoint = lazyGapPoint(
      resolvedBlock.id,
      side,
      id => this.doc.getBlockById(id) as any,
    )
    this._commitSelection(
      this._createBlockSelection(gapPoint, gapPoint, resolvedBlock.id),
      {scrollIntoView},
    )
  }

  public setTableCellSelection(
    table: string | BlockCraft.IBlockComponents['table'],
    anchorCell: string | BlockCraft.IBlockComponents['table-cell'],
    headCell?: string | BlockCraft.IBlockComponents['table-cell'],
    scrollIntoView?: boolean,
  ): void {
    this._ensureViewMounted([
      typeof table === 'string' ? table : table.id,
      typeof anchorCell === 'string' ? anchorCell : anchorCell.id,
      typeof headCell === 'string' ? headCell : headCell?.id,
    ].filter((id): id is string => !!id))
    const resolvedTable = typeof table === 'string'
      ? this.doc.getBlockById(table) as BlockCraft.IBlockComponents['table']
      : table
    const resolvedAnchor = typeof anchorCell === 'string'
      ? this.doc.getBlockById(anchorCell) as BlockCraft.IBlockComponents['table-cell']
      : anchorCell
    const resolvedHead = typeof headCell === 'string'
      ? this.doc.getBlockById(headCell) as BlockCraft.IBlockComponents['table-cell']
      : (headCell ?? resolvedAnchor)
    const getBlock = (id: string) => this.doc.getBlockById(id) as any
    const anchor = lazyTableCellPoint(resolvedAnchor.id, resolvedTable.id, getBlock)
    const head = lazyTableCellPoint(resolvedHead.id, resolvedTable.id, getBlock)
    this._commitSelection(
      this._createBlockSelection(anchor, head, resolvedTable.id),
      {scrollIntoView, modelOnly: true},
    )
  }

  /** @deprecated Use replay with ISelectionJSON */
  replay(json: IBlockSelectionJSON | ISelectionJSON | null) {
    this._replay(json)
  }

  private _replay(
    json: IBlockSelectionJSON | ISelectionJSON | null,
  ): void {
    if (!json) {
      this.blur()
      return
    }
    if ('anchor' in json) {
      // New format
      const selectionState = this.createSelection(json)
      if (!selectionState) {
        this.blur()
        return
      }
      if (selectionState.getTableCellSelection()) {
        this._commitSelection(selectionState, {modelOnly: true})
        return
      }
      try {
        this._commitSelection(selectionState)
      } catch {
        this.blur()
      }
    } else {
      if (json.from.type === 'table-cell') {
        const head = json.to?.type === 'table-cell' ? json.to : json.from
        const selection = this.createSelection({
          anchor: {blockId: json.from.blockId, type: 'table-cell', tableId: json.from.tableId},
          head: {blockId: head.blockId, type: 'table-cell', tableId: head.tableId},
          commonParent: json.commonParent,
        })
        if (selection) this._commitSelection(selection, {modelOnly: true})
        return
      }
      // Legacy format
      try {
        this.setSelection(json.from, json.to)
      } catch {
        this.blur()
      }
    }
  }

  /**
   * Build a BlockSelection from JSON points WITHOUT touching the DOM or the live
   * selection. Use when code needs a selection object to operate on (e.g. a
   * programmatic paste/replace) but must NOT move the user's cursor. Returns null
   * if either endpoint block no longer exists.
   */
  createSelection(json: ISelectionJSON): BlockSelection | null {
    if (!this._selectionModelBlockExists(json.anchor.blockId)) return null
    if (!this._selectionModelBlockExists(json.head.blockId)) return null
    if (json.commonParent && !this._selectionModelBlockExists(json.commonParent)) return null
    if (json.anchor.type === 'table-cell' || json.head.type === 'table-cell') {
      if (json.anchor.type !== 'table-cell' || json.head.type !== 'table-cell') return null
      if (!json.anchor.tableId || json.anchor.tableId !== json.head.tableId) return null
      if (!this._selectionModelBlockExists(json.anchor.tableId)) return null
    }
    const disallowedCollapsedGap =
      this._disallowedCollapsedGapBlockId(json.anchor, json.head) !== null
    const anchorJSON: ISelectionPointJSON = disallowedCollapsedGap
      ? {blockId: json.anchor.blockId, type: 'selected'}
      : json.anchor
    const headJSON: ISelectionPointJSON = disallowedCollapsedGap
      ? {blockId: json.head.blockId, type: 'selected'}
      : json.head
    const makePoint = (p: ISelectionPointJSON) => this._pointFromJSON(p)
    const selection = this._createBlockSelection(
      makePoint(anchorJSON),
      makePoint(headJSON),
      disallowedCollapsedGap ? json.anchor.blockId : json.commonParent,
    )
    return isSelectionAlive(selection, this.doc) ? selection : null
  }

  private _selectionModelBlockExists(blockId: string): boolean {
    if (this._modelResolver) return this._modelResolver.exists(blockId)
    try {
      return !!this.doc.getBlockById(blockId)
    } catch {
      return false
    }
  }

  private _disallowedCollapsedGapBlockId(
    anchor: Pick<ISelectionPointJSON, 'blockId' | 'type'>,
    head: Pick<ISelectionPointJSON, 'blockId' | 'type'>,
  ): string | null {
    if (
      anchor.type !== 'gap' ||
      head.type !== 'gap' ||
      anchor.blockId !== head.blockId
    ) {
      return null
    }
    return this.doc.placement?.allowsGapCursor?.(anchor.blockId) === false
      ? anchor.blockId
      : null
  }

  createFakeRange(source: Pick<IBlockSelectionJSON, 'from' | 'to'> | BlockSelection | ISelectionJSON, config: IFakeRangeConfig = {}) {
    if (source instanceof BlockSelection) {
      return new FakeRange(this.doc, source, config)
    }
    if ('anchor' in source) {
      // ISelectionJSON → build a BlockSelection
      const sel = this.createSelection(source)
      return new FakeRange(this.doc, sel, config)
    }
    return new FakeRange(this.doc, source, config)
  }

  // ── Geometry queries ──

  private _rangeFromModel(): Range | null {
    const sel = this.value
    if (!sel) return null
    if (sel.getTableCellSelection()) return null
    try {
      return this._buildDomRange(pointToLegacy(sel.start), pointToLegacy(sel.end))
    } catch {
      return null
    }
  }

  getSelectionRect(): DOMRect | null {
    // Gap caret: the collapsed Range sits inside the filler text node, while the
    // filler span owns the positioned line box used for scroll/overlay geometry.
    const start = this.value?.start
    if (start && start.type === 'gap') {
      try {
        const span = getBlockGapCaretSpan(start.block.hostElement, start.side)
        if (span) return this._surface.getElementRect(span)
      } catch {
        // fall through to the range-based path
      }
    }
    const range = this._rangeFromModel()
    if (!range) return null
    return this._surface.getRangeRect(range)
  }

  getSelectionRects(): DOMRectList | null {
    const range = this._rangeFromModel()
    if (!range) return null
    return this._surface.getRangeRects(range)
  }

  getSelectedText(): string {
    const sel = this.value
    if (!sel) return ''
    const tableCellSelection = sel.getTableCellSelection()
    if (tableCellSelection) {
      try {
        const table = this.doc.getBlockById(tableCellSelection.tableId) as BlockCraft.IBlockComponents['table']
        const anchorCell = this.doc.getBlockById(tableCellSelection.anchorCellId) as BlockCraft.IBlockComponents['table-cell']
        const headCell = this.doc.getBlockById(tableCellSelection.headCellId) as BlockCraft.IBlockComponents['table-cell']
        const anchor = {
          rowIdx: table.childrenIds.indexOf(anchorCell.parentId!),
          colIdx: anchorCell.getIndexOfParent(),
        }
        const head = {
          rowIdx: table.childrenIds.indexOf(headCell.parentId!),
          colIdx: headCell.getIndexOfParent(),
        }
        if (anchor.rowIdx < 0 || anchor.colIdx < 0 || head.rowIdx < 0 || head.colIdx < 0) return ''
        const coordinates = table.confirmSelection(
          [Math.min(anchor.rowIdx, head.rowIdx), Math.min(anchor.colIdx, head.colIdx)],
          [Math.max(anchor.rowIdx, head.rowIdx), Math.max(anchor.colIdx, head.colIdx)],
        )
        return table.getCellsMatrixByCoordinates(coordinates.start, coordinates.end)
          .map(row => row.map(cell => cell.textContent()).join('\t'))
          .join('\n')
      } catch {
        return ''
      }
    }
    const boundaryChildIds = sel.getBoundarySelectedChildIds()
    if (boundaryChildIds) {
      return boundaryChildIds.map(id => this._selectionBlockText(id)).join('\n')
    }
    const s = sel.start, e = sel.end
    const startId = sel.firstBlockId
    const endId = sel.lastBlockId

    if (sel.isInSameBlock) {
      if (s.type === 'gap') return ''
      const text = this._selectionBlockText(startId)
      if (s.type !== 'text') return text
      const eOff = e.type === 'text' ? e.offset : text.length
      return text.slice(s.offset, eOff)
    }

    let text = s.type === 'text'
      ? this._selectionBlockText(startId).slice(s.offset)
      : this._selectionBlockText(startId)
    const modelBacked = typeof (this.doc as any).model?.exists === 'function'
    const betweenBlocks = modelBacked
      ? this.doc.queryBlocksBetween(startId, endId)
      : this.doc.queryBlocksBetween(sel.firstBlock, sel.lastBlock)
    for (const bid of betweenBlocks) {
      text += '\n' + this._selectionBlockText(bid)
    }
    if (e.type === 'text') {
      text += '\n' + this._selectionBlockText(endId).slice(0, e.offset)
    } else {
      text += '\n' + this._selectionBlockText(endId)
    }
    return text
  }

  private _selectionBlockText(blockId: string, visiting = new Set<string>()): string {
    const model = (this.doc as any).model
    if (typeof model?.exists === 'function' && model.exists(blockId)) {
      if (visiting.has(blockId)) return ''
      const deltas = model.getTextDeltas?.(blockId)
      if (deltas) return deltaToString(deltas)
      if (model.getNodeType?.(blockId) === BlockNodeType.void) return ''

      visiting.add(blockId)
      const text = (model.getChildrenIds?.(blockId) ?? [])
        .map((id: string) => this._selectionBlockText(id, visiting))
        .join('\n')
      visiting.delete(blockId)
      return text
    }
    try {
      return this.doc.getBlockById(blockId).textContent()
    } catch {
      return ''
    }
  }

  scrollSelectionIntoView() {
    const rect = this._getSelectionHeadRect() ?? this.getSelectionRect()
    if (!rect || rect.height === 0) return

    const container = this.doc.scrollContainer!
    const cRect = this._surface.getElementRect(container)
    const padding = 24

    if (rect.bottom > cRect.bottom) {
      container.scrollTop += rect.bottom - cRect.bottom + padding
    } else if (rect.top < cRect.top) {
      container.scrollTop -= cRect.top - rect.top + padding
    }
  }

  private _isSelectionVisibleInViewport(selection: ISelectionJSON): boolean {
    const container = this.doc.scrollContainer
    if (!container?.isConnected) return false
    const rect = this._getSelectionPointRect(selection.head)
    if (!rect || (!rect.width && !rect.height)) return false

    const viewport = this._surface.getElementRect(container)
    return rect.top >= viewport.top && rect.bottom <= viewport.bottom
  }

  private _getSelectionHeadRect(): DOMRect | null {
    const head = this.value?.head
    if (!head) return null
    return this._getSelectionPointRect(head)
  }

  private _getSelectionPointRect(
    point: ISelectionPoint | ISelectionPointJSON,
  ): DOMRect | null {
    const block = this._readBlock(point.blockId)
    if (!block) return null
    if (point.type === 'gap') {
      try {
        const span = getBlockGapCaretSpan(block.hostElement, point.side!)
        return span ? this._surface.getElementRect(span) : null
      } catch {
        return null
      }
    }
    if (point.type === 'selected' || point.type === 'table-cell') {
      return this._surface.getElementRect(block.hostElement)
    }
    try {
      const legacyPoint = pointToLegacy(point as ISelectionPoint)
      const range = this._buildDomRange(legacyPoint, legacyPoint)
      return this._surface.getRangeRect(range)
    } catch {
      return null
    }
  }

  private _pointFromJSON(p: ISelectionPointJSON): ISelectionPoint {
    if (p.type === 'gap') {
      return lazyGapPoint(p.blockId, p.side!, id => this.doc.getBlockById(id) as any)
    }
    if (p.type === 'boundary') {
      return lazyBoundaryPoint(p.blockId, p.index ?? 0, id => this.doc.getBlockById(id) as any)
    }
    if (p.type === 'table-cell') {
      return lazyTableCellPoint(p.blockId, p.tableId!, id => this.doc.getBlockById(id) as any)
    }
    if (isWholeBlockSelectionPoint(p)) {
      return _lazyPoint(wholeBlockSelectionPointJSON(p.blockId), id => this.doc.getBlockById(id) as any)
    }
    return _lazyPoint(p, id => this.doc.getBlockById(id) as any)
  }
}

/**
 * Detect if the native Selection is backward (user dragged right-to-left or bottom-to-top).
 * Range.start is always document-order first, but Selection.anchor may be after focus.
 */
function isSelectionBackward(sel: globalThis.Selection): boolean {
  if (sel.isCollapsed || !sel.anchorNode || !sel.focusNode) return false
  if (sel.anchorNode === sel.focusNode) {
    return sel.anchorOffset > sel.focusOffset
  }
  const cmp = sel.anchorNode.compareDocumentPosition(sel.focusNode)
  return !!(cmp & Node.DOCUMENT_POSITION_PRECEDING)
}

type DomRangePointJSON =
  | ISelectionPointJSON
  | IBlockInlineRangeJSON
  | (Extract<IBlockInlineRangeJSON, { type: 'text' }> & { offset?: number })

type SelectionWritePoint = ISelectionPoint | IBlockInlineRangeJSON

function isWholeBlockSelectionPoint(point: Pick<ISelectionPointJSON, 'type'>): boolean {
  return point.type === 'selected'
}

function wholeBlockSelectionPointJSON(blockId: string): ISelectionPointJSON {
  return {blockId, type: 'selected'}
}

/** Convert new ISelectionPoint to legacy-compatible shape for _buildDomRange */
function pointToLegacy(p: ISelectionPoint): DomRangePointJSON {
  if (p.type === 'gap') {
    return {blockId: p.blockId, type: 'gap', side: p.side}
  }
  if (p.type === 'boundary') {
    return {blockId: p.blockId, type: 'boundary', index: p.index}
  }
  if (p.type === 'table-cell') {
    return {blockId: p.blockId, type: 'table-cell', tableId: p.tableId}
  }
  if (p.type === 'text') {
    return {blockId: p.blockId, type: 'text', offset: p.offset, index: p.offset, length: 0}
  }
  return wholeBlockSelectionPointJSON(p.blockId)
}

export const searchEditableDescendant = (block: BlockCraft.BlockComponent, isStart: boolean): EditableBlockComponent | null => {
  if (block.nodeType === BlockNodeType.editable) return <EditableBlockComponent>block
  const child = isStart ? block.firstChildren : block.lastChildren
  if (!child || child.nodeType === BlockNodeType.void) return null
  return searchEditableDescendant(child, isStart)
}

declare global {
  namespace BlockCraft {
    type Selection = BlockSelection
  }
}

export * from './types'
export * from './createFakeRange'
export * from './blockSelection'
export * from './model-resolver'
export * from './projection-mount-adapter'
export {normalizeRange} from './normalize'
export type {INormalizedEndpoints} from './normalize'
