import {
  ResourcePlaceholderAdapter,
  ResourcePlaceholderBinding,
  ResourcePlaceholderControllerOptions,
  ResourcePlaceholderElement,
  ResourcePlaceholderState,
} from './resource-placeholder.types'

const FRAME_CLASS = 'bc-resource-placeholder-frame'
const OVERLAY_CLASS = 'bc-resource-placeholder'
const controllers =
  new WeakMap<HTMLElement, ResourcePlaceholderController>()

function hasResourceKey(value: unknown): boolean {
  return value !== null &&
    value !== undefined &&
    (typeof value !== 'string' || value.trim().length > 0)
}

export class ResourcePlaceholderController {
  private readonly overlay = document.createElement('div')
  private readonly skeleton = document.createElement('div')
  private readonly error = document.createElement('div')
  private readonly retryButton = document.createElement('button')
  private cleanupResource: (() => void) | null = null
  private timeout: ReturnType<typeof setTimeout> | null = null
  private binding: ResourcePlaceholderBinding | null = null
  private revision = 0
  private destroyed = false
  private _state: ResourcePlaceholderState = 'idle'

  constructor(
    private readonly frame: HTMLElement,
    private readonly options: ResourcePlaceholderControllerOptions = {},
  ) {
    controllers.get(this.frame)?.destroy()
    controllers.set(this.frame, this)
    this.overlay.className = OVERLAY_CLASS
    this.overlay.contentEditable = 'false'
    this.overlay.setAttribute('aria-hidden', 'true')

    this.skeleton.className = `${OVERLAY_CLASS}__skeleton`

    this.error.className = `${OVERLAY_CLASS}__error`
    this.error.setAttribute('role', 'status')
    const icon = document.createElement('i')
    icon.className = 'bc_icon bc_jinggao'
    icon.setAttribute('aria-hidden', 'true')
    const label = document.createElement('span')
    label.textContent = '资源加载失败'

    this.retryButton.type = 'button'
    this.retryButton.className = `${OVERLAY_CLASS}__retry`
    this.retryButton.textContent = '重新加载'
    this.retryButton.contentEditable = 'false'
    this.retryButton.setAttribute('data-bc-native-input', '')
    this.retryButton.setAttribute('data-bc-placement-pick-ignore', '')
    this.retryButton.setAttribute('aria-label', '重新加载资源')

    this.error.append(icon, label, this.retryButton)
    this.overlay.append(this.skeleton, this.error)
    this.frame.classList.add(FRAME_CLASS)
    this.frame.append(this.overlay)

    for (const type of ['pointerdown', 'mousedown', 'click', 'keydown']) {
      this.retryButton.addEventListener(type, this.stopRetryEvent)
    }
    this.retryButton.addEventListener('click', this.onRetry)
    this.setState('idle')
  }

  get state(): ResourcePlaceholderState {
    return this._state
  }

  bind(binding: ResourcePlaceholderBinding): void {
    if (this.destroyed) return
    this.binding = binding
    this.start(false)
  }

  clear(): void {
    if (this.destroyed) return
    this.binding = null
    this.revision++
    this.clearPending()
    this.setState('idle')
  }

  retry(): void {
    if (this.destroyed || !this.binding) return
    this.start(true)
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.revision++
    this.clearPending()
    for (const type of ['pointerdown', 'mousedown', 'click', 'keydown']) {
      this.retryButton.removeEventListener(type, this.stopRetryEvent)
    }
    this.retryButton.removeEventListener('click', this.onRetry)
    this.overlay.remove()
    this.frame.classList.remove(FRAME_CLASS)
    this.frame.removeAttribute('data-bc-resource-state')
    this.frame.removeAttribute('aria-busy')
    if (controllers.get(this.frame) === this) {
      controllers.delete(this.frame)
    }
  }

  private start(retry: boolean): void {
    const binding = this.binding
    if (!binding) return
    const revision = ++this.revision
    this.clearPending()

    if (!hasResourceKey(binding.resourceKey)) {
      this.setState('idle')
      return
    }

    this.setState('loading')
    const adapter = binding.adapter as ResourcePlaceholderAdapter<
      ResourcePlaceholderElement
    >
    this.cleanupResource = adapter.subscribe(binding.element, {
      ready: () => this.handleReady(revision),
      error: () => this.handleError(revision),
    })

    const timeoutMs = binding.timeoutMs ?? adapter.defaultTimeoutMs ?? 0
    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
      this.timeout = setTimeout(
        () => this.handleError(revision),
        timeoutMs,
      )
    }

    if (retry) {
      adapter.retry(binding.element)
      return
    }

    queueMicrotask(() => {
      if (
        this.isCurrent(revision) &&
        adapter.isReady(binding.element)
      ) {
        this.handleReady(revision)
      }
    })
  }

  private handleReady(revision: number): void {
    if (!this.isCurrent(revision) || !this.binding) return
    this.clearPending()
    this.setState('ready')
    const size = this.binding.adapter.readIntrinsicSize(
      this.binding.element as never,
    )
    if (size) this.options.onIntrinsicSize?.(size)
  }

  private handleError(revision: number): void {
    if (!this.isCurrent(revision)) return
    this.clearPending()
    this.setState('error')
  }

  private isCurrent(revision: number): boolean {
    return !this.destroyed && revision === this.revision
  }

  private clearPending(): void {
    this.cleanupResource?.()
    this.cleanupResource = null
    if (this.timeout !== null) {
      clearTimeout(this.timeout)
      this.timeout = null
    }
  }

  private setState(state: ResourcePlaceholderState): void {
    if (this._state === state && this.frame.dataset['bcResourceState'] === state) {
      return
    }
    this._state = state
    this.frame.dataset['bcResourceState'] = state
    if (state === 'loading') this.frame.setAttribute('aria-busy', 'true')
    else this.frame.removeAttribute('aria-busy')
    this.overlay.setAttribute(
      'aria-hidden',
      state === 'loading' || state === 'error' ? 'false' : 'true',
    )
    this.options.onStateChange?.(state)
  }

  private readonly stopRetryEvent = (event: Event): void => {
    event.stopPropagation()
    if (event.type !== 'keydown') event.preventDefault()
  }

  private readonly onRetry = (): void => {
    this.retry()
  }
}

export function destroyResourcePlaceholder(frame: HTMLElement): void {
  controllers.get(frame)?.destroy()
}
