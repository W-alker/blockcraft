import {AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, inject, Input, OnDestroy, ViewChild} from "@angular/core";
import {merge, Subject, takeUntil} from 'rxjs';
import {IBaseEmbedBlockProps} from "../base.block";
import {IS_SAFARI} from "../../../global";
import {ShapeResizerComponent, type ShapeResizeBox, type ShapeResizeCalculator, type ShapeResizeCommit} from '../../shape-block/shape-resizer.component';
import {calculateImageResize} from '../../image-block/image-resize';
import {deriveObjectSizeFromPixels} from '../../../framework/modules/object/block-object-sizing.manager';
import {resolveEmbedFrameSize} from './embed-sizing';

@Component({
  selector: 'embed-frame-card',
  template: `
    <div class="iframe-wrapper">
      @if (isolateUrl) {
        <iframe loading="lazy" allowfullscreen #iframeEle title="网页嵌入"
                sandbox="allow-scripts allow-forms allow-popups"
                draggable="false" frameborder="0"></iframe>
      } @else {
      <iframe loading="lazy" allowfullscreen #iframeEle title="网页嵌入"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-storage-access-by-user-activation"
              draggable="false"
              allow="encrypted-media;clipboard-read *;clipboard-write *;" referrerpolicy=""
              data-iframe-will-auto-focus="1"
              frameborder="0" data-aha-samesite=""></iframe>
      }
      <div class="iframe-mask" #iframeMask></div>
    </div>
    @if (block && !block.isReadonly) {
      <shape-resizer data-bc-selection-interaction-ignore
        [target]="hostElement" [maxWidthContainer]="block.hostElement"
        [maxWidthResolver]="resizeMaxWidth" [rotatable]="false"
        [resizeCalculator]="resizeCalculator" (resizeStart)="onResizeStart()"
        (resizeCommit)="onResized($event)" />
    }
  `,
  standalone: true,
  imports: [ShapeResizerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.width]': 'frameSize.width',
    '[style.height]': 'frameSize.height',
    '[style.aspect-ratio]': 'frameSize.aspectRatio',
    'data-bc-resize-preview-anchor': 'layout',
    'data-bc-selection-interaction-frame': '',
  }
})
export class IframeCardComponent implements AfterViewInit, OnDestroy {
  @Input({required: true})
  props!: IBaseEmbedBlockProps

  /** Supplies the document sizing basis and enables editable resize handles. */
  @Input() block?: BlockCraft.IBlockComponents['embed' | 'figma-embed' | 'juejin-embed']
  readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement
  private readonly cdr = inject(ChangeDetectorRef)
  private readonly destroyed$ = new Subject<void>()
  private resizeStartBox: ShapeResizeBox | null = null
  private resizeBasisWidth = 0
  private resizeMaxHeight = Number.POSITIVE_INFINITY

  get frameSize() {
    const referenceWidth = this.block?.doc.objectSizing.getReferenceWidth(this.block.id)
    return resolveEmbedFrameSize(this.props, referenceWidth)
  }

  readonly resizeCalculator: ShapeResizeCalculator = (handle, start, dx, dy, maxWidth) => {
    start = this.resizeStartBox ?? start
    // Keep corner resizing proportional when the page's height is the limit.
    const widthLimit = handle.includes('-')
      ? Math.min(maxWidth ?? Infinity, this.resizeMaxHeight * start.width / start.height)
      : maxWidth
    const box = calculateImageResize(handle, start, dx, dy, widthLimit)
    if (box.height <= this.resizeMaxHeight) return box
    const height = this.resizeMaxHeight
    return {...box, height, offsetY: start.offsetY + (handle.includes('north') ? start.height - height : 0)}
  }

  readonly resizeMaxWidth = () => {
    this.resizeBasisWidth = this.block!.doc.objectSizing.getReferenceWidth(this.block!.id)
    // Like images, measure the visible box only once when the gesture starts.
    // Its inline width can exceed the CSS limit inside a narrow column.
    const style = getComputedStyle(this.hostElement)
    this.resizeStartBox = {
      width: Number.parseFloat(style.width), height: Number.parseFloat(style.height),
      offsetX: 0, offsetY: 0,
    }
    const containerStyle = getComputedStyle(this.block!.hostElement)
    const containerWidth = Number.parseFloat(containerStyle.width)
    const maxHeight = Number.parseFloat(containerStyle.maxHeight)
    const verticalInset = ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth']
      .reduce((sum, key) => sum + (Number.parseFloat(containerStyle[key as keyof CSSStyleDeclaration] as string) || 0), 0)
    this.resizeMaxHeight = Number.isFinite(maxHeight) && maxHeight > verticalInset
      ? maxHeight - verticalInset
      : Infinity
    return Math.min(this.resizeBasisWidth, containerWidth || this.block!.hostElement.clientWidth)
  }

  onResizeStart() {
    if (this.block && !this.block.isReadonly) this.block.doc.selection.selectBlock(this.block)
  }

  onResized(event: ShapeResizeCommit) {
    const block = this.block
    const start = this.resizeStartBox
    const changed = !start || Math.round(event.width) !== Math.round(start.width) || Math.round(event.height) !== Math.round(start.height)
    if (changed && block && !block.isReadonly && block.doc.getBlockById(block.id) === block) {
      const height = Math.min(Math.round(event.height), Math.floor(this.resizeMaxHeight))
      const size = deriveObjectSizeFromPixels(Math.round(event.width), height, this.resizeBasisWidth)
      if (size) block.doc.crud.undoManager.captureUndoItem(() => block.updateProps({...size, width: null, height: null}))
    }
    // Clear the resizer's pixel preview, including when a handle was only clicked.
    // Otherwise a later root-width change would keep the preview's fixed height.
    const size = this.frameSize
    this.hostElement.style.width = size.width
    this.hostElement.style.height = size.height
    this.hostElement.style.aspectRatio = size.aspectRatio
    this.cdr.markForCheck()
  }

  /** @deprecated 品牌信息不再显示；保留输入以兼容既有宿主绑定。 */
  @Input() fontIcon = false
  @Input() isolateUrl = false

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
  set iframeElement(value: ElementRef<HTMLIFrameElement> | undefined) {
    if (!value || value.nativeElement === this.iframe?.nativeElement) return
    this._observer?.disconnect()
    this._hitTestObserver?.disconnect()
    this.iframe = value
    this._mountedSrc = ''
    if (this.isViewInit) {
      this.initSafariViewportObserver()
      this.initSafariHitTestObserver()
      this.syncIframeSrc()
    }
  }
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

  /** @deprecated 品牌信息不再显示；保留输入以兼容既有宿主绑定。 */
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
    if (this.block) {
      merge(this.block.doc.objectSizing.widthChange$, this.block.doc.readonlySwitch$, this.block.onPropsChange)
        .pipe(takeUntil(this.destroyed$)).subscribe(() => this.cdr.markForCheck())
    }
  }

  ngOnDestroy() {
    this.destroyed$.next()
    this.destroyed$.complete()
    this._observer?.disconnect()
    this._observer = undefined
    this._hitTestObserver?.disconnect()
    this._hitTestObserver = undefined
  }

  private initSafariViewportObserver() {
    if (!this._enableSafariPerfMode) return
    if (this._isActivated) return
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
    // Wait for the static isolated branch before assigning a same-origin URL.
    if (this.isolateUrl && iframe.sandbox.contains('allow-same-origin')) return
    const nextUrl = this._url || 'about:blank'
    if (this._mountedSrc === nextUrl) return
    iframe.src = nextUrl
    this._mountedSrc = nextUrl
  }

  reload() {
    this._mountedSrc = ''
    this.syncIframeSrc()
  }
}
