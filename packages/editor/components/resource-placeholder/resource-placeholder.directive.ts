import {
  AfterViewInit,
  Directive,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnDestroy,
  Output,
} from '@angular/core'
import {
  iframeResourcePlaceholderAdapter,
  imageResourcePlaceholderAdapter,
  ResourceIntrinsicSize,
  ResourcePlaceholderAdapter,
  ResourcePlaceholderController,
  ResourcePlaceholderElement,
  ResourcePlaceholderState,
  videoResourcePlaceholderAdapter,
} from '../../global/resource-placeholder'

function defaultAdapter(
  element: ResourcePlaceholderElement,
): ResourcePlaceholderAdapter {
  if (element instanceof HTMLVideoElement) {
    return videoResourcePlaceholderAdapter
  }
  if (element instanceof HTMLIFrameElement) {
    return iframeResourcePlaceholderAdapter
  }
  return imageResourcePlaceholderAdapter
}

@Directive({
  selector: '[bcResourcePlaceholder]',
  standalone: true,
  exportAs: 'bcResourcePlaceholder',
})
export class BcResourcePlaceholderDirective
implements AfterViewInit, OnDestroy {
  private readonly frame: HTMLElement
  private controller: ResourcePlaceholderController | null = null
  private viewReady = false
  private destroyed = false
  private refreshRevision = 0
  private _resourceElement: ResourcePlaceholderElement | null = null
  private _resourceKey: unknown = null
  private _resourceAdapter: ResourcePlaceholderAdapter | null = null
  private _resourceTimeoutMs: number | undefined

  @Input()
  set resourceElement(value: ResourcePlaceholderElement | null | undefined) {
    this._resourceElement = value ?? null
    this.scheduleRefresh()
  }

  @Input()
  set resourceKey(value: unknown) {
    this._resourceKey = value
    this.scheduleRefresh()
  }

  @Input()
  set resourceAdapter(value: ResourcePlaceholderAdapter | null | undefined) {
    this._resourceAdapter = value ?? null
    this.scheduleRefresh()
  }

  @Input()
  set resourceTimeoutMs(value: number | null | undefined) {
    this._resourceTimeoutMs =
      typeof value === 'number' && Number.isFinite(value)
        ? value
        : undefined
    this.scheduleRefresh()
  }

  @Output()
  readonly resourceStateChange =
    new EventEmitter<ResourcePlaceholderState>()

  @Output()
  readonly resourceIntrinsicSize =
    new EventEmitter<ResourceIntrinsicSize>()

  constructor(
    elementRef: ElementRef<HTMLElement>,
    private readonly ngZone: NgZone,
  ) {
    this.frame = elementRef.nativeElement
    this.ngZone.runOutsideAngular(() => {
      this.controller = new ResourcePlaceholderController(this.frame, {
        onStateChange: state => {
          this.ngZone.run(() => this.resourceStateChange.emit(state))
        },
        onIntrinsicSize: size => {
          this.ngZone.run(() => this.resourceIntrinsicSize.emit(size))
        },
      })
    })
  }

  ngAfterViewInit(): void {
    this.viewReady = true
    this.scheduleRefresh()
  }

  retry(): void {
    this.controller?.retry()
  }

  ngOnDestroy(): void {
    this.destroyed = true
    this.refreshRevision++
    this.controller?.destroy()
    this.controller = null
  }

  private scheduleRefresh(): void {
    if (!this.viewReady || this.destroyed) return
    const revision = ++this.refreshRevision
    queueMicrotask(() => {
      if (
        this.destroyed ||
        revision !== this.refreshRevision ||
        !this.controller
      ) {
        return
      }
      const resourceElement =
        this._resourceElement ??
        this.frame.querySelector<ResourcePlaceholderElement>(
          'img, video, iframe',
        )
      if (!resourceElement) {
        this.controller.clear()
        return
      }
      this.controller.bind({
        element: resourceElement,
        adapter:
          this._resourceAdapter ??
          defaultAdapter(resourceElement),
        resourceKey: this._resourceKey,
        timeoutMs: this._resourceTimeoutMs,
      })
    })
  }
}
