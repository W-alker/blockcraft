import {AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, Input, OnDestroy, ViewChild} from "@angular/core";
import {IBaseEmbedBlockProps} from "../base.block";
import {HostUrlPipe} from "../pipes";
import {NgIf} from "@angular/common";
import {MatIcon} from "@angular/material/icon";
import {IS_SAFARI} from "../../../global";

@Component({
  selector: 'embed-frame-card',
  template: `
    <div class="iframe-wrapper">
      <iframe loading="lazy" allowfullscreen #iframeEle
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-storage-access-by-user-activation"
              draggable="false"
              allow="encrypted-media;clipboard-read *;clipboard-write *;" referrerpolicy=""
              data-iframe-will-auto-focus="1"
              frameborder="0" data-aha-samesite=""></iframe>
      <div class="iframe-mask" #iframeMask></div>
    </div>
    <div class="iframe-brand" *ngIf="brand">
      <mat-icon [svgIcon]="brand.icon"></mat-icon>
      <span spellcheck="false">{{ brand.title }}</span>
    </div>
    <a class="iframe-link" target="_blank" [href]="props.url" contenteditable="false">
      <span>{{ props.url | hostUrl }}</span>
      <i class="bc_icon bc_tiaozhuan"></i>
    </a>
  `,
  standalone: true,
  imports: [
    HostUrlPipe,
    NgIf,
    MatIcon
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.width]': 'props.width ? props.width + "px" : "100%"',
    '[style.height]': 'props.height ? props.height + "px" : "100%"',
  }
})
export class IframeCardComponent implements AfterViewInit, OnDestroy {
  @Input({required: true})
  props!: IBaseEmbedBlockProps

  private _url = ''
  @Input()
  set url(value: string) {
    this._url = value
    this.syncIframeSrc()
  }

  get url() {
    return this._url
  }

  @ViewChild('iframeEle', {read: ElementRef})
  iframe!: ElementRef<HTMLIFrameElement>

  @ViewChild('iframeMask', {read: ElementRef})
  iframeMask!: ElementRef<HTMLDivElement>

  isViewInit = false
  private readonly _enableSafariPerfMode = IS_SAFARI
  private _isNearViewport = true
  private _isActivated = !this._enableSafariPerfMode
  private _observer?: IntersectionObserver
  private _hitTestObserver?: IntersectionObserver
  private _mountedSrc = ''

  @Input()
  brand?: {
    icon: string
    title: string
  }

  ngAfterViewInit() {
    this.isViewInit = true
    this.initSafariViewportObserver()
    this.initSafariHitTestObserver()
    this.syncIframeSrc()
  }

  ngOnDestroy() {
    this._observer?.disconnect()
    this._observer = undefined
    this._hitTestObserver?.disconnect()
    this._hitTestObserver = undefined
  }

  private initSafariViewportObserver() {
    if (!this._enableSafariPerfMode) return
    if (typeof IntersectionObserver === 'undefined') {
      this._isActivated = true
      this.syncIframeSrc()
      return
    }
    const root = this.getScrollRoot()
    this._observer = new IntersectionObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      this._isNearViewport = entry.isIntersecting || entry.intersectionRatio > 0
      if (!this._isActivated && this._isNearViewport) {
        this._isActivated = true
        this.syncIframeSrc()
        this._observer?.disconnect()
        this._observer = undefined
      }
    }, {
      root,
      // 预热加载，避免刚滚到视区时空白
      rootMargin: '1000px 0px 1000px 0px',
      threshold: 0
    })
    this._observer.observe(this.iframe.nativeElement)
  }

  private getScrollRoot() {
    const documentRoot = this.iframe.nativeElement.closest('[data-blockcraft-root="true"]')
    let candidate = documentRoot?.parentElement
    while (candidate) {
      const style = getComputedStyle(candidate)
      if (/(auto|scroll|overlay)/.test(`${style.overflow} ${style.overflowY}`)) {
        return candidate
      }
      candidate = candidate.parentElement
    }
    return null
  }

  /**
   * Safari can retain an iframe compositing layer's old hit-test region after
   * paginated scrolling. The transparent mask then intercepts events over a
   * completely different block (for example a table several pages below).
   * Keep offscreen iframe layers non-interactive; restore their normal editor
   * selection/activation behavior as soon as they re-enter the viewport.
   */
  private initSafariHitTestObserver() {
    if (!this._enableSafariPerfMode) return
    if (typeof IntersectionObserver === 'undefined') return
    this._setSafariHitTesting(false)
    this._hitTestObserver = new IntersectionObserver((entries) => {
      const entry = entries[0]
      this._setSafariHitTesting(Boolean(
        entry && entry.isIntersecting && entry.intersectionRatio > 0,
      ))
    }, {
      root: this.getScrollRoot(),
      rootMargin: '0px',
      threshold: 0,
    })
    this._hitTestObserver.observe(this.iframe.nativeElement)
  }

  private _setSafariHitTesting(enabled: boolean) {
    const pointerEvents = enabled ? '' : 'none'
    this.iframe.nativeElement.style.pointerEvents = pointerEvents
    this.iframeMask.nativeElement.style.pointerEvents = pointerEvents
  }

  private syncIframeSrc() {
    if (!this.isViewInit) return
    if (!this._isActivated) return
    const iframe = this.iframe.nativeElement
    const nextUrl = this._url || 'about:blank'
    if (this._mountedSrc === nextUrl) return
    iframe.src = nextUrl
    this._mountedSrc = nextUrl
  }
}
