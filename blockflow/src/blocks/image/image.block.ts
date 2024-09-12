import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostBinding,
  SimpleChanges,
  ViewChild
} from "@angular/core";
import {BaseBlock} from "@core";
import {IImageBlockProps, IImgBlockModel} from "@blocks/image/type";
import {NgIf} from "@angular/common";
import {filter, fromEvent, Subscription, take, throttleTime} from "rxjs";
import Viewer from 'viewerjs';
import {OverlayModule} from "@angular/cdk/overlay";
import {ImageBlockFloatToolbar, IToolbarItem} from "@blocks/image/float-toolbar";
import {ParagraphBlock} from "@blocks/paragraph/paragraph.block";

@Component({
  selector: 'div.image-block',
  standalone: true,
  template: `
    <div class="img-block__container" [style.width.px]="_showWidth" (click)="onImgClick($event)"
         (mouseenter)="onContainerMouseEnter($event)" (mouseleave)="onContainerMouseLeave($event)">
      <img [src]="model.props.src" #img="cdkOverlayOrigin" cdkOverlayOrigin
           [class.resize-mode]="resizeMode !== 'none'" draggable="false">

      <p class="img-block__caption editable-container" *ngIf="model.children?.length" #caption
         [controller]="controller" [model]="model.children[0]" [placeholder]="'添加标题'"
         (blur)="onCaptionBlur()" (click)="$event.stopPropagation()" (mousemove)="$event.stopPropagation()">

      <div class="img-resizer" *ngIf="resizeMode !== 'none'" (click)="$event.stopPropagation()">
        <div class="img-resizer__handle img-resizer__handle--tl"
             (mousedown)="onResizeHandleMouseDown($event, 'left')"></div>
        <div class="img-resizer__handle img-resizer__handle--tr"
             (mousedown)="onResizeHandleMouseDown($event, 'right')"></div>
        <div class="img-resizer__handle img-resizer__handle--bl"
             (mousedown)="onResizeHandleMouseDown($event, 'left')"></div>
        <div class="img-resizer__handle img-resizer__handle--br"
             (mousedown)="onResizeHandleMouseDown($event, 'right')"></div>
      </div>
    </div>

    <ng-template cdkConnectedOverlay
                 [cdkConnectedOverlayPositions]="[{originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom'}]"
                 [cdkConnectedOverlayOffsetY]="-8" [cdkConnectedOverlayPush]="true"
                 [cdkConnectedOverlayOrigin]="img"
                 [cdkConnectedOverlayOpen]="showToolbar"
                 [cdkConnectedOverlayHasBackdrop]="false">
      <div class="img-block__toolbar" [props]="props" (itemClick)="onToolbarItemClick($event)"
           (mouseenter)="onContainerMouseEnter($event)" (mouseleave)="onContainerMouseLeave($event)">
      </div>
    </ng-template>
  `,
  styles: [`
    ::ng-deep .cdk-overlay-pane {
      position: absolute;
    }

    :host {
      display: flex;
    }

    .img-block__container {
      position: relative;
      max-width: 100%;
      min-width: 100px;
    }

    .img-block__container img {
      display: block;
      width: 100%;
    }

    .img-block__caption {
      z-index: 10;
      position: absolute;
      width: 100%;
      bottom: 0;
      left: 0;
      padding: 8px;
      font-size: 14px;
      color: #fff;
      background: linear-gradient(180deg, rgba(0, 0, 0, 0.00) 0%, #000 100%);
      box-sizing: border-box;
    }

    .img-resizer {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      outline: 2px solid #4857E2;
      cursor: zoom-in;
      box-shadow: 0 0 5px 2px #e8e8e8;
    }

    .img-resizer__handle {
      position: absolute;
      width: 10px;
      height: 10px;
      background-color: #4857E2;
      border: 2px solid #fff;
      border-radius: 50%;
    }

    .img-resizer__handle--tl {
      top: -7px;
      left: -7px;
      cursor: nwse-resize;
    }

    .img-resizer__handle--tr {
      top: -7px;
      right: -7px;
      cursor: nesw-resize;
    }

    .img-resizer__handle--bl {
      bottom: -7px;
      left: -7px;
      cursor: nesw-resize;

    }

    .img-resizer__handle--br {
      bottom: -7px;
      right: -7px;
      cursor: nwse-resize;
    }
  `],
  imports: [
    NgIf, ImageBlockFloatToolbar, OverlayModule, ParagraphBlock
  ],
  // changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.contenteditable]': 'false',
  }
})
export class ImageBlock extends BaseBlock<IImgBlockModel> {
  @HostBinding('style.justify-content')
  get align() {
    return this.model.props.align
  }

  @ViewChild('img', {static: true, read: ElementRef}) img!: ElementRef<HTMLImageElement>
  @ViewChild('caption') captionBlock!: ParagraphBlock

  constructor(private readonly _cdr: ChangeDetectorRef) {
    super();
  }

  protected _showWidth = 100

  protected resizeMode: 'none' | 'resize' = 'none'
  protected showToolbar = false

  private _viewer?: Viewer
  private closeToolbarTimer?: number

  ngOnChanges(change: SimpleChanges) {
    if (change["model"] && change["model"].firstChange) {
      this._showWidth = this.model.props.width
    }
  }

  onContainerMouseEnter(e: Event) {
    e.stopPropagation()
    this.closeToolbarTimer && clearTimeout(this.closeToolbarTimer)
    !this.showToolbar && (this.showToolbar = true)
  }

  onContainerMouseLeave(e: Event) {
    e.stopPropagation()
    this.closeToolbarTimer = setTimeout(() => {
      this.showToolbar = false
      this._cdr.detectChanges()
    }, 300)
  }

  onImgClick(event: MouseEvent) {
    event.stopPropagation()
    event.preventDefault()
    if (this.resizeMode === 'resize') return this.previewImg()

    this.resizeMode = 'resize'
    fromEvent<MouseEvent>(this.controller.rootElement, 'click')
      .pipe(filter(e => e.target !== this.img.nativeElement), take(1))
      .subscribe((e) => {
        this.resizeMode = 'none'
        this._viewer?.destroy()
        this._viewer = undefined
        this._cdr.detectChanges()
      })
  }

  previewImg() {
    this._viewer ??= new Viewer(this.img.nativeElement, {inline: false,})
    this._viewer.show()
  }

  private startPoint?: { x: number, y: number, direction: 'left' | 'right' }
  private mouseMove$?: Subscription

  onResizeHandleMouseDown(event: MouseEvent, direction: 'left' | 'right') {
    event.stopPropagation()
    event.preventDefault()
    this.mouseMove$?.unsubscribe()
    this.startPoint = {x: event.clientX, y: event.clientY, direction}

    this.mouseMove$ = fromEvent<MouseEvent>(document.body, 'mousemove')
      .pipe(throttleTime(60))
      .subscribe((e) => {
        const movePx = e.clientX - this.startPoint!.x
        if (this.startPoint!.direction === 'left') this._showWidth -= movePx
        else this._showWidth += movePx
        this.startPoint!.x = e.clientX
        this._cdr.detectChanges()
      })

    fromEvent<MouseEvent>(document.body, 'mouseup').pipe(take(1)).subscribe((e) => {
      this.startPoint = undefined
      this.mouseMove$?.unsubscribe()
      this.props.width = this._showWidth
    })
  }

  onCaptionBlur() {
    if (!this.model.children.length) return
    if (!this.captionBlock.textLength) {
      this.controller.deleteBlocks(0, 1, this.id)
    }
  }

  onToolbarItemClick(item: Pick<IToolbarItem, 'name' | 'value'>) {
    switch (item.name) {
      case 'caption':
        if (this.model.children.length) return
        const paragraph = this.controller.schemaStore.create('paragraph')
        this.controller.insertBlocks(0, [paragraph], this.id).then(() => {
          this.captionBlock.containerEle.focus()
        })
        break
      case 'align':
        this.props.align !== item.value && (this.props.align = item.value as IImageBlockProps['align'])
        this.showToolbar = false
        break
      case 'delete':
        break
      case 'copy':
        break
      case 'download':
        break
    }
  }

}
