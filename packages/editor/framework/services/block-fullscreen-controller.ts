import { BehaviorSubject } from 'rxjs'

const HOST_CLASS = 'is-fullscreen'
const BODY_CLASS = 'bc-table-fullscreen-lock'
const PLACEHOLDER_CLASS = 'bc-table-fullscreen-placeholder'
const ISOLATION_CONTAINER_CLASS = 'bc-table-fullscreen-isolation-container'
const ISOLATION_BRANCH_CLASS = 'bc-table-fullscreen-isolation-branch'
const VIEW_ANCHOR_EPSILON = 0.5
const VIEW_ANCHOR_STABLE_FRAMES = 2
const VIEW_ANCHOR_MAX_FRAMES = 8

interface FullscreenViewAnchor {
  scrollContainer: HTMLElement
  /** Block top relative to the editor viewport before it leaves normal flow. */
  relativeTop: number
}

interface InlineStyleSnapshot {
  value: string
  priority: string
}

interface FullscreenScrollLock {
  scrollContainer: HTMLElement
  scrollLeft: number
  scrollTop: number
  overflowX: InlineStyleSnapshot
  overflowY: InlineStyleSnapshot
}

type FullscreenModifierWheelMode = 'zoom' | 'block' | 'passthrough'

/**
 * Manages the local fullscreen-view state for an in-place Block component.
 *
 * - State is local (NOT persisted to Yjs / Undo history).
 * - Toggles CSS classes on the host element and body for view transitions.
 * - Enforces a single global fullscreen block at a time (WeakRef registry).
 * - Provides Escape key exit with IME-composing guard.
 *
 * Cross-browser notes:
 * - `KeyboardEvent.key === 'Escape'` is consistent across Chrome / Safari / Firefox / Edge.
 * - `compositionstart` / `compositionend` are observed on the host with capture phase so
 *   any descendant composing (e.g. cell editor) is detected.
 * - The host remains in its Angular-owned DOM position. Fullscreen isolation is handled by
 *   hiding sibling branches along its ancestor path, while an inverse host `zoom` cancels a
 *   host-owned document view scale. Ancestors themselves must stay visible: Chromium omits
 *   `beforeinput` when a contenteditable editing host has a `visibility:hidden` ancestor.
 *   This avoids reparenting the block out of pagination / virtualization trees.
 *
 * Lifetime is tied to the owning component: call {@link destroy} from the component's
 * destroy hook to guarantee body-class cleanup (otherwise a destroyed-while-fullscreen
 * component leaks the body scroll lock).
 */
export class BlockFullscreenController {
  /**
   * Currently-active fullscreen controller (process-wide). WeakRef so that a destroyed
   * component that was the active one does not keep itself alive via this slot.
   */
  private static current: WeakRef<BlockFullscreenController> | null = null

  /** Test-only: reset the global registry (kept package-private via JSDoc convention). */
  static __resetForTesting(): void {
    BlockFullscreenController.current = null
  }

  /** Min / max / step for fullscreen zoom (Ctrl/Cmd + wheel)。 */
  static readonly ZOOM_MIN = 0.5
  static readonly ZOOM_MAX = 3
  static readonly ZOOM_STEP = 0.1

  readonly state$ = new BehaviorSubject<boolean>(false)

  /**
   * 当前全屏视图的缩放比例（1 = 100%）。仅在全屏态下接受用户调整；退出全屏会重置到 1。
   * 缩放通过 CSS `zoom` 实现，layout 会真实重排、scrollbar 自动跟随。
   * 已知次要副作用：在 zoom ≠ 1 时进行行/列拖拽重排，drop-line 位置会按 zoom 比例
   * 偏移（math 没有按 zoom 修正）；阅读场景不受影响。
   */
  readonly zoom$ = new BehaviorSubject<number>(1)

  private isImeComposing = false
  private viewAnchor: FullscreenViewAnchor | null = null
  private viewAnchorFrame: number | null = null
  private viewAnchorFrames = 0
  private viewAnchorStableFrames = 0
  private flowPlaceholder: HTMLElement | null = null
  private originalHostZoom: string | null = null
  private backgroundScrollLocks: FullscreenScrollLock[] = []
  private isolationContainers = new Set<HTMLElement>()
  private isolationBranches = new Set<HTMLElement>()
  private isolationObserver: MutationObserver | null = null

  private readonly compositionStartHandler = (): void => {
    this.isImeComposing = true
  }

  private readonly compositionEndHandler = (): void => {
    this.isImeComposing = false
  }

  private readonly escHandler = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return
    if (!this.state$.value) return
    if (this.isImeComposing) return
    e.stopPropagation()
    e.preventDefault()
    this.set(false)
  }

  /**
   * Ctrl/Cmd + wheel is owned by the active fullscreen block. Tables map it
   * to local zoom; blocks with their own zoom UI can consume it without
   * changing scale so the document/host shortcut cannot run underneath.
   */
  private readonly wheelHandler = (e: WheelEvent): void => {
    const target = e.target
    const NodeConstructor = this.host.ownerDocument.defaultView?.Node
    if (!NodeConstructor || !(target instanceof NodeConstructor) || !this.host.contains(target)) return
    if (!(e.ctrlKey || e.metaKey)) return
    e.preventDefault()
    // This listener runs on document capture, before a host document-scale surface.
    // A fullscreen table owns Ctrl/Cmd+wheel exclusively; otherwise one gesture would
    // change both the table zoom and the document zoom underneath it.
    e.stopImmediatePropagation()
    if (this.modifierWheelMode !== 'zoom') return
    const direction = e.deltaY < 0 ? 1 : -1
    this.setZoom(this.zoom$.value + direction * BlockFullscreenController.ZOOM_STEP)
  }

  constructor(
    private readonly host: HTMLElement,
    private readonly resolveScrollContainer: () => HTMLElement | null = () => null,
    private readonly resolveDocumentScale: () => number = () => 1,
    private readonly modifierWheelMode: FullscreenModifierWheelMode = 'zoom',
  ) {
    this.host.addEventListener('compositionstart', this.compositionStartHandler, { capture: true })
    this.host.addEventListener('compositionend', this.compositionEndHandler, { capture: true })
  }

  /** Current fullscreen state. */
  get isFullscreen(): boolean {
    return this.state$.value
  }

  /** Flip current value. */
  toggle(): void {
    this.set(!this.state$.value)
  }

  /**
   * Enter or leave fullscreen. Repeated calls with the same value are no-ops.
   *
   * Side effects (when entering):
   * - Exits any other block that is currently fullscreen.
   * - Adds `.is-fullscreen` to host, `.bc-table-fullscreen-lock` to body.
   * - Locks the resolved background editor scroller without touching table-local scrollers.
   * - Attaches capture-phase Escape handler on `document`.
   *
   * Side effects (when leaving): reverses all of the above.
   */
  set(value: boolean): void {
    if (this.state$.value === value) return

    if (value) {
      this.cancelViewAnchorRestore()
      const prev = BlockFullscreenController.current?.deref()
      if (prev && prev !== this) {
        // Recursively exits previous; safe because that call hits the early-return
        // (state$.value === false matches its setter input false → no-op for it after first exit).
        prev.set(false)
      }
      const normalFlowRect = this.captureViewAnchor()
      this.installFlowPlaceholder(normalFlowRect)
      this.installBackgroundScrollLocks()
      BlockFullscreenController.current = new WeakRef(this)
    } else if (BlockFullscreenController.current?.deref() === this) {
      BlockFullscreenController.current = null
    }

    if (value) {
      const ownerDocument = this.host.ownerDocument
      this.host.classList.add(HOST_CLASS)
      this.installDocumentScaleCompensation()
      this.installViewIsolation()
      ownerDocument.body.classList.add(BODY_CLASS)
      ownerDocument.addEventListener('keydown', this.escHandler, { capture: true })
      if (this.modifierWheelMode !== 'passthrough') {
        ownerDocument.addEventListener('wheel', this.wheelHandler, { passive: false, capture: true })
      }
    } else {
      const ownerDocument = this.host.ownerDocument
      // 占位符移除与 fixed class 撤销之间不做任何布局读取，浏览器只会看到
      // 最终的普通流，不会在中间态先 clamp scrollTop。
      this.removeFlowPlaceholder()
      this.host.classList.remove(HOST_CLASS)
      this.removeDocumentScaleCompensation()
      this.removeViewIsolation()
      ownerDocument.body.classList.remove(BODY_CLASS)
      this.removeBackgroundScrollLocks()
      ownerDocument.removeEventListener('keydown', this.escHandler, { capture: true })
      if (this.modifierWheelMode !== 'passthrough') {
        ownerDocument.removeEventListener('wheel', this.wheelHandler, { capture: true })
      }
      // 退出全屏 → 重置缩放
      if (this.zoom$.value !== 1) this.zoom$.next(1)
      // `position: fixed` 恢复为普通流后，先在本帧恢复一次，避免退出时先闪到
      // 浏览器因 scrollHeight 缩小而 clamp 后的位置。分页 / 虚拟化还会在后续 RAF
      // 提交几何，因此继续用同一视图锚点做有界收敛。
      this.restoreViewAnchor()
      this.scheduleViewAnchorRestore()
    }

    this.state$.next(value)
  }

  /**
   * A BlockCraft document can be visually scaled by a host surface using CSS `zoom`.
   * A fixed descendant still inherits that scale, so a nominal viewport-sized table
   * becomes a small sheet floating over the document. Apply the reciprocal scale to
   * the fullscreen host only; normal-flow rendering is restored byte-for-byte on exit.
   */
  private installDocumentScaleCompensation(): void {
    if (this.originalHostZoom !== null) return
    this.originalHostZoom = this.host.style.getPropertyValue('zoom')
    const scale = this.resolveDocumentScale()
    if (!Number.isFinite(scale) || scale <= 0 || Math.abs(scale - 1) < 0.0001) return
    const ownZoom = parseFloat(this.host.ownerDocument.defaultView
      ?.getComputedStyle(this.host).zoom ?? '') || 1
    this.host.style.setProperty('zoom', String(ownZoom / scale))
  }

  private removeDocumentScaleCompensation(): void {
    if (this.originalHostZoom === null) return
    if (this.originalHostZoom) {
      this.host.style.setProperty('zoom', this.originalHostZoom)
    } else {
      this.host.style.removeProperty('zoom')
    }
    this.originalHostZoom = null
  }

  /**
   * The editor normally scrolls inside `doc.scrollContainer`, not `body`. Safari
   * paints that ancestor's native scrollbars above a viewport-fixed descendant,
   * so the body lock alone still exposes the paginated background scrollbars.
   * Lock the resolved document scroller plus every scrollable ancestor on the
   * active block's ownership path, restoring each exact inline declaration and
   * scroll offset on exit. Safari can paint any ancestor's native scrollbar
   * above a viewport-fixed descendant, including host-app containers outside
   * BlockCraft. Descendant scrollers are deliberately ignored so the active
   * block's own horizontal/vertical navigation remains available.
   */
  private installBackgroundScrollLocks(): void {
    this.removeBackgroundScrollLocks()
    const candidates = new Set<HTMLElement>()
    const resolved = this.resolveScrollContainer()
    if (this.isBackgroundAncestor(resolved)) candidates.add(resolved)

    const body = this.host.ownerDocument.body
    let ancestor = this.host.parentElement
    while (ancestor) {
      if (ancestor !== body && this.isScrollableAncestor(ancestor)) {
        candidates.add(ancestor)
      }
      ancestor = ancestor.parentElement
    }

    this.backgroundScrollLocks = Array.from(candidates, scrollContainer => {
      const lock = {
        scrollContainer,
        scrollLeft: scrollContainer.scrollLeft,
        scrollTop: scrollContainer.scrollTop,
        overflowX: this.captureInlineStyle(scrollContainer, 'overflow-x'),
        overflowY: this.captureInlineStyle(scrollContainer, 'overflow-y'),
      }
      scrollContainer.style.setProperty('overflow-x', 'hidden', 'important')
      scrollContainer.style.setProperty('overflow-y', 'hidden', 'important')
      return lock
    })
  }

  private removeBackgroundScrollLocks(): void {
    const locks = this.backgroundScrollLocks
    this.backgroundScrollLocks = []
    for (const lock of locks) {
      this.restoreInlineStyle(lock.scrollContainer, 'overflow-x', lock.overflowX)
      this.restoreInlineStyle(lock.scrollContainer, 'overflow-y', lock.overflowY)
      if (!lock.scrollContainer.isConnected) continue
      lock.scrollContainer.scrollLeft = lock.scrollLeft
      lock.scrollContainer.scrollTop = lock.scrollTop
    }
  }

  private isBackgroundAncestor(element: HTMLElement | null): element is HTMLElement {
    return !!element?.isConnected
      && element !== this.host
      && !this.host.contains(element)
      && element.contains(this.host)
  }

  private isScrollableAncestor(element: HTMLElement): boolean {
    const view = this.host.ownerDocument.defaultView
    if (!view) return false
    const style = view.getComputedStyle(element)
    return this.isScrollableOverflow(style.overflowX)
      || this.isScrollableOverflow(style.overflowY)
  }

  private isScrollableOverflow(value: string): boolean {
    return value === 'auto' || value === 'scroll' || value === 'overlay'
  }

  private captureInlineStyle(element: HTMLElement, property: string): InlineStyleSnapshot {
    return {
      value: element.style.getPropertyValue(property),
      priority: element.style.getPropertyPriority(property),
    }
  }

  private restoreInlineStyle(
    element: HTMLElement,
    property: string,
    snapshot: InlineStyleSnapshot,
  ): void {
    if (snapshot.value) {
      element.style.setProperty(property, snapshot.value, snapshot.priority)
    } else {
      element.style.removeProperty(property)
    }
  }

  /**
   * Hide only branches that are siblings of the active table's DOM ownership
   * path. Hiding an ancestor of the root editing host makes Chromium emit native
   * `input` without `beforeinput`, bypassing InputTransformer and Y.Text. Marking
   * the active branch at each ancestor lets CSS isolate both existing and newly
   * inserted siblings without O(document-size) inline writes. A child-list observer
   * watches only the current ancestor path and refreshes these O(depth) markers if
   * pagination or virtualization reparents the table while fullscreen is open.
   */
  private installViewIsolation(): void {
    this.removeViewIsolation()
    this.syncViewIsolationPath()

    const view = this.host.ownerDocument.defaultView
    if (!view) return
    this.isolationObserver = new view.MutationObserver(() => {
      if (!this.state$.value) return
      this.syncViewIsolationPath()
      this.observeIsolationPath()
    })
    this.observeIsolationPath()
  }

  private observeIsolationPath(): void {
    if (!this.isolationObserver) return
    this.isolationObserver.disconnect()
    for (const container of this.isolationContainers) {
      this.isolationObserver.observe(container, { childList: true })
    }
  }

  private syncViewIsolationPath(): void {
    const nextContainers = new Set<HTMLElement>()
    const nextBranches = new Set<HTMLElement>()
    const body = this.host.ownerDocument.body
    let branch: HTMLElement = this.host
    let parent = branch.parentElement

    while (parent) {
      nextContainers.add(parent)
      nextBranches.add(branch)
      if (parent === body) break
      branch = parent
      parent = parent.parentElement
    }

    this.replaceIsolationMarkers(
      this.isolationContainers,
      nextContainers,
      ISOLATION_CONTAINER_CLASS,
    )
    this.replaceIsolationMarkers(
      this.isolationBranches,
      nextBranches,
      ISOLATION_BRANCH_CLASS,
    )
    this.isolationContainers = nextContainers
    this.isolationBranches = nextBranches
  }

  private replaceIsolationMarkers(
    previous: ReadonlySet<HTMLElement>,
    next: ReadonlySet<HTMLElement>,
    className: string,
  ): void {
    for (const element of previous) {
      if (!next.has(element)) element.classList.remove(className)
    }
    for (const element of next) {
      if (!previous.has(element)) element.classList.add(className)
    }
  }

  private removeViewIsolation(): void {
    this.isolationObserver?.disconnect()
    this.isolationObserver = null
    for (const element of this.isolationContainers) {
      element.classList.remove(ISOLATION_CONTAINER_CLASS)
    }
    for (const element of this.isolationBranches) {
      element.classList.remove(ISOLATION_BRANCH_CLASS)
    }
    this.isolationContainers.clear()
    this.isolationBranches.clear()
  }

  /**
   * 设置缩放比例。会按 [ZOOM_MIN, ZOOM_MAX] clamp，同值是 no-op。
   * 浮点误差以 0.001 容差去重，避免 wheel 滚动累积出"0.999999"这样的脏值。
   */
  setZoom(value: number): void {
    const clamped = Math.max(
      BlockFullscreenController.ZOOM_MIN,
      Math.min(BlockFullscreenController.ZOOM_MAX, value),
    )
    if (Math.abs(this.zoom$.value - clamped) < 0.001) return
    this.zoom$.next(clamped)
  }

  /** 放大一步（10%）。 */
  zoomIn(): void {
    this.setZoom(this.zoom$.value + BlockFullscreenController.ZOOM_STEP)
  }

  /** 缩小一步（10%）。 */
  zoomOut(): void {
    this.setZoom(this.zoom$.value - BlockFullscreenController.ZOOM_STEP)
  }

  /** 重置到 100%。 */
  resetZoom(): void {
    this.setZoom(1)
  }

  private captureViewAnchor(): DOMRect | null {
    this.viewAnchor = null
    if (!this.host.isConnected) return null

    const hostRect = this.host.getBoundingClientRect()
    const scrollContainer = this.resolveScrollContainer()
    if (!scrollContainer?.isConnected) return hostRect

    const relativeTop = hostRect.top - scrollContainer.getBoundingClientRect().top
    if (!Number.isFinite(relativeTop)) return hostRect
    this.viewAnchor = { scrollContainer, relativeTop }
    return hostRect
  }

  /**
   * `position: fixed` removes the table from normal flow. A tall table can therefore
   * shrink the editor's scrollHeight enough for the browser to clamp scrollTop and for
   * root virtualization to recalculate against the wrong viewport. Keep a zero-content
   * local-view placeholder at the exact flow position while fullscreen is open.
   */
  private installFlowPlaceholder(rect: DOMRect | null): void {
    this.removeFlowPlaceholder()
    if (!rect || !Number.isFinite(rect.height) || rect.height <= 0 || !this.host.parentNode) return

    const view = this.host.ownerDocument.defaultView
    if (!view) return
    const hostStyle = view.getComputedStyle(this.host)
    const placeholder = this.host.ownerDocument.createElement('div')
    placeholder.className = PLACEHOLDER_CLASS
    placeholder.setAttribute('aria-hidden', 'true')
    placeholder.setAttribute('contenteditable', 'false')
    placeholder.style.display = hostStyle.display === 'inline' ? 'block' : hostStyle.display
    placeholder.style.boxSizing = 'border-box'
    placeholder.style.width = `${rect.width}px`
    placeholder.style.height = `${rect.height}px`
    placeholder.style.minHeight = `${rect.height}px`
    placeholder.style.maxHeight = `${rect.height}px`
    placeholder.style.marginTop = hostStyle.marginTop
    placeholder.style.marginRight = hostStyle.marginRight
    placeholder.style.marginBottom = hostStyle.marginBottom
    placeholder.style.marginLeft = hostStyle.marginLeft
    placeholder.style.flexShrink = '0'
    placeholder.style.visibility = 'hidden'
    placeholder.style.pointerEvents = 'none'
    placeholder.style.overflowAnchor = 'none'
    this.host.parentNode.insertBefore(placeholder, this.host)
    this.flowPlaceholder = placeholder
  }

  private removeFlowPlaceholder(): void {
    this.flowPlaceholder?.remove()
    this.flowPlaceholder = null
  }

  private restoreViewAnchor(): boolean {
    const anchor = this.viewAnchor
    if (
      !anchor
      || !anchor.scrollContainer.isConnected
      || !this.host.isConnected
    ) {
      return true
    }

    const currentRelativeTop = this.host.getBoundingClientRect().top
      - anchor.scrollContainer.getBoundingClientRect().top
    const correction = currentRelativeTop - anchor.relativeTop
    if (!Number.isFinite(correction) || Math.abs(correction) < VIEW_ANCHOR_EPSILON) {
      return true
    }

    anchor.scrollContainer.scrollTop += correction
    return false
  }

  private scheduleViewAnchorRestore(): void {
    if (!this.viewAnchor || this.viewAnchorFrame !== null) return
    this.viewAnchorFrames = 0
    this.viewAnchorStableFrames = 0
    const view = this.host.ownerDocument.defaultView
    if (!view) {
      this.viewAnchor = null
      return
    }

    const settle = (): void => {
      this.viewAnchorFrame = null
      this.viewAnchorFrames++
      if (this.restoreViewAnchor()) {
        this.viewAnchorStableFrames++
      } else {
        this.viewAnchorStableFrames = 0
      }
      if (
        this.viewAnchorStableFrames >= VIEW_ANCHOR_STABLE_FRAMES
        || this.viewAnchorFrames >= VIEW_ANCHOR_MAX_FRAMES
      ) {
        this.viewAnchor = null
        return
      }
      this.viewAnchorFrame = view.requestAnimationFrame(settle)
    }
    this.viewAnchorFrame = view.requestAnimationFrame(settle)
  }

  private cancelViewAnchorRestore(): void {
    if (this.viewAnchorFrame !== null) {
      this.host.ownerDocument.defaultView?.cancelAnimationFrame(this.viewAnchorFrame)
      this.viewAnchorFrame = null
    }
    this.viewAnchor = null
    this.viewAnchorFrames = 0
    this.viewAnchorStableFrames = 0
  }

  /**
   * Clean up. Exits fullscreen if active and detaches all listeners.
   * Idempotent — safe to call multiple times.
   */
  destroy(): void {
    if (this.state$.value) {
      this.set(false)
    }
    this.cancelViewAnchorRestore()
    this.removeFlowPlaceholder()
    this.removeDocumentScaleCompensation()
    this.removeBackgroundScrollLocks()
    this.removeViewIsolation()
    this.host.removeEventListener('compositionstart', this.compositionStartHandler, { capture: true })
    this.host.removeEventListener('compositionend', this.compositionEndHandler, { capture: true })
    if (!this.state$.closed) {
      this.state$.complete()
    }
    if (!this.zoom$.closed) {
      this.zoom$.complete()
    }
  }
}
