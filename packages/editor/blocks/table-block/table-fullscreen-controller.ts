import { BehaviorSubject } from 'rxjs'

const HOST_CLASS = 'is-fullscreen'
const BODY_CLASS = 'bc-table-fullscreen-lock'

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
 * - `position: fixed` for the host (applied via the CSS class) is interpreted relative to
 *   viewport unless an ancestor has `transform` / `filter` / `will-change` / `perspective`;
 *   host integration documentation calls this out.
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
    if (!(e.ctrlKey || e.metaKey)) return
    e.preventDefault()
    const direction = e.deltaY < 0 ? 1 : -1
    this.setZoom(this.zoom$.value + direction * TableFullscreenController.ZOOM_STEP)
  }

  constructor(private readonly host: HTMLElement) {
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
      const prev = TableFullscreenController.current?.deref()
      if (prev && prev !== this) {
        // Recursively exits previous; safe because that call hits the early-return
        // (state$.value === false matches its setter input false → no-op for it after first exit).
        prev.set(false)
      }
      TableFullscreenController.current = new WeakRef(this)
    } else if (TableFullscreenController.current?.deref() === this) {
      TableFullscreenController.current = null
    }

    if (value) {
      this.host.classList.add(HOST_CLASS)
      document.body.classList.add(BODY_CLASS)
      document.addEventListener('keydown', this.escHandler, { capture: true })
      this.host.addEventListener('wheel', this.wheelHandler, { passive: false, capture: true })
    } else {
      this.host.classList.remove(HOST_CLASS)
      document.body.classList.remove(BODY_CLASS)
      document.removeEventListener('keydown', this.escHandler, { capture: true })
      this.host.removeEventListener('wheel', this.wheelHandler, { capture: true })
      // 退出全屏 → 重置缩放
      if (this.zoom$.value !== 1) this.zoom$.next(1)
    }

    this.state$.next(value)
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

  /**
   * Clean up. Exits fullscreen if active and detaches all listeners.
   * Idempotent — safe to call multiple times.
   */
  destroy(): void {
    if (this.state$.value) {
      this.set(false)
    }
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
