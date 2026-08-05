import { BehaviorSubject } from 'rxjs'

const HOST_CLASS = 'is-fullscreen'
const BODY_CLASS = 'bc-table-fullscreen-lock'
const PLACEHOLDER_CLASS = 'bc-table-fullscreen-placeholder'
const VIEW_ANCHOR_EPSILON = 0.5
const VIEW_ANCHOR_STABLE_FRAMES = 2
const VIEW_ANCHOR_MAX_FRAMES = 8

interface FullscreenViewAnchor {
  scrollContainer: HTMLElement
  /** Table top relative to the editor viewport before it leaves normal flow. */
  relativeTop: number
}

/**
 * Manages the local "fullscreen view" state for a TableBlockComponent.
 *
 * - State is local (NOT persisted to Yjs / Undo history).
 * - Toggles CSS classes on the host element and body for view transitions.
 * - Enforces a single global fullscreen table at a time (WeakRef registry).
 * - Provides Escape key exit with IME-composing guard.
 *
 * Cross-browser notes:
 * - `KeyboardEvent.key === 'Escape'` is consistent across Chrome / Safari / Firefox / Edge.
 * - `compositionstart` / `compositionend` are observed on the host with capture phase so
 *   any descendant composing (e.g. cell editor) is detected.
 * - The host remains in its Angular-owned DOM position. Fullscreen isolation is handled by
 *   the body lock stylesheet, while an inverse host `zoom` cancels a host-owned document
 *   view scale. This avoids reparenting the block out of pagination / virtualization trees.
 *
 * Lifetime is tied to the owning component: call {@link destroy} from the component's
 * destroy hook to guarantee body-class cleanup (otherwise a destroyed-while-fullscreen
 * component leaks the body scroll lock).
 */
export class TableFullscreenController {
  /**
   * Currently-active fullscreen controller (process-wide). WeakRef so that a destroyed
   * component that was the active one does not keep itself alive via this slot.
   */
  private static current: WeakRef<TableFullscreenController> | null = null

  /** Test-only: reset the global registry (kept package-private via JSDoc convention). */
  static __resetForTesting(): void {
    TableFullscreenController.current = null
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
   * Ctrl/Cmd + wheel 触发缩放调整。仅在全屏态下挂载。
   * `passive: false` 是为了 preventDefault 拦截浏览器的页面缩放。
   */
  private readonly wheelHandler = (e: WheelEvent): void => {
    const target = e.target
    if (!(target instanceof Node) || !this.host.contains(target)) return
    if (!(e.ctrlKey || e.metaKey)) return
    e.preventDefault()
    // This listener runs on document capture, before a host document-scale surface.
    // A fullscreen table owns Ctrl/Cmd+wheel exclusively; otherwise one gesture would
    // change both the table zoom and the document zoom underneath it.
    e.stopImmediatePropagation()
    const direction = e.deltaY < 0 ? 1 : -1
    this.setZoom(this.zoom$.value + direction * TableFullscreenController.ZOOM_STEP)
  }

  constructor(
    private readonly host: HTMLElement,
    private readonly resolveScrollContainer: () => HTMLElement | null = () => null,
    private readonly resolveDocumentScale: () => number = () => 1,
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
   * - Exits any other table that is currently fullscreen.
   * - Adds `.is-fullscreen` to host, `.bc-table-fullscreen-lock` to body.
   * - Attaches capture-phase Escape handler on `document`.
   *
   * Side effects (when leaving): reverses all of the above.
   */
  set(value: boolean): void {
    if (this.state$.value === value) return

    if (value) {
      this.cancelViewAnchorRestore()
      const prev = TableFullscreenController.current?.deref()
      if (prev && prev !== this) {
        // Recursively exits previous; safe because that call hits the early-return
        // (state$.value === false matches its setter input false → no-op for it after first exit).
        prev.set(false)
      }
      const normalFlowRect = this.captureViewAnchor()
      this.installFlowPlaceholder(normalFlowRect)
      TableFullscreenController.current = new WeakRef(this)
    } else if (TableFullscreenController.current?.deref() === this) {
      TableFullscreenController.current = null
    }

    if (value) {
      this.host.classList.add(HOST_CLASS)
      this.installDocumentScaleCompensation()
      document.body.classList.add(BODY_CLASS)
      document.addEventListener('keydown', this.escHandler, { capture: true })
      document.addEventListener('wheel', this.wheelHandler, { passive: false, capture: true })
    } else {
      // 占位符移除与 fixed class 撤销之间不做任何布局读取，浏览器只会看到
      // 最终的普通流，不会在中间态先 clamp scrollTop。
      this.removeFlowPlaceholder()
      this.host.classList.remove(HOST_CLASS)
      this.removeDocumentScaleCompensation()
      document.body.classList.remove(BODY_CLASS)
      document.removeEventListener('keydown', this.escHandler, { capture: true })
      document.removeEventListener('wheel', this.wheelHandler, { capture: true })
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
   * 设置缩放比例。会按 [ZOOM_MIN, ZOOM_MAX] clamp，同值是 no-op。
   * 浮点误差以 0.001 容差去重，避免 wheel 滚动累积出"0.999999"这样的脏值。
   */
  setZoom(value: number): void {
    const clamped = Math.max(
      TableFullscreenController.ZOOM_MIN,
      Math.min(TableFullscreenController.ZOOM_MAX, value),
    )
    if (Math.abs(this.zoom$.value - clamped) < 0.001) return
    this.zoom$.next(clamped)
  }

  /** 放大一步（10%）。 */
  zoomIn(): void {
    this.setZoom(this.zoom$.value + TableFullscreenController.ZOOM_STEP)
  }

  /** 缩小一步（10%）。 */
  zoomOut(): void {
    this.setZoom(this.zoom$.value - TableFullscreenController.ZOOM_STEP)
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
