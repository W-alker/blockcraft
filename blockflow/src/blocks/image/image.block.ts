import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostBinding,
  ViewChild
} from "@angular/core";
import {AsyncPipe, NgForOf, NgIf} from "@angular/common";
import { BehaviorSubject, fromEvent, Subscription, take, throttleTime} from "rxjs";
import Viewer from 'viewerjs';
import {FloatToolbar, IToolbarItem} from "../../components";
import {IImageBlockProps, IImgBlockModel} from "./type";
import {BaseBlock} from "../../core";
import {ParagraphBlock} from "../paragraph/paragraph.block";
import {OverlayModule} from "@angular/cdk/overlay";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";

@Component({
  selector: 'div.image-block',
  standalone: true,
  template: `
      <div class="img-block__container" [style.width.px]="_showWidth" tabindex="0" (focus)="onImgFocus($event)"
           (blur)="onImgBlur($event)">
          <!--           (mouseenter)="onContainerMouseEnter($event)" (mouseleave)="onContainerMouseLeave($event)"-->

          <div [class]="['img-default-skeleton', imgLoadState]" *ngIf="imgLoadState !== 'loaded'">
              <span class="img-default-skeleton__icon bf_icon bf_jiazai" *ngIf="imgLoadState === 'loading'"></span>
              <span class="img-default-skeleton__error" *ngIf="imgLoadState === 'error'">加载失败!</span>
          </div>

          <ng-container *ngIf="imgLoadState === 'loaded'">
              <div class="bf-float-toolbar img-block__toolbar" *ngIf="isFocusing$ | async"
                   [toolbarList]="TOOLBAR_LIST" (click)="$event.stopPropagation();"
                   (itemClick)="onToolbarItemClick($event)">
              </div>
          </ng-container>

          <img [src]="model.props.src" [class.resize-mode]="isFocusing$ | async" draggable="false" #img>

          <ng-container *ngIf="imgLoadState === 'loaded'">
              <p class="img-block__caption editable-container" *ngFor="let item of children"
                 [controller]="controller" [model]="item" [placeholder]="'添加标题'"
                 (click)="$event.stopPropagation()" (mousemove)="$event.stopPropagation()"></p>
          </ng-container>

          <div class="img-resizer" [hidden]="!(isFocusing$ | async)" (mousedown)="onImgClick($event)">
              <div class="img-resizer__handle img-resizer__handle--tl" (click)="$event.stopPropagation()"
                   (mousedown)="onResizeHandleMouseDown($event, 'left')"></div>
              <div class="img-resizer__handle img-resizer__handle--tr" (click)="$event.stopPropagation()"
                   (mousedown)="onResizeHandleMouseDown($event, 'right')"></div>
              <div class="img-resizer__handle img-resizer__handle--bl" (click)="$event.stopPropagation()"
                   (mousedown)="onResizeHandleMouseDown($event, 'left')"></div>
              <div class="img-resizer__handle img-resizer__handle--br" (click)="$event.stopPropagation()"
                   (mousedown)="onResizeHandleMouseDown($event, 'right')"></div>
          </div>

      </div>
  `,
  styles: [`
    .img-block__toolbar {
      z-index: 100;
      position: absolute;
      top: -40px;
      right: 50%;
      transform: translateX(50%);
    }

    :host {
      display: flex;
    }

    .img-block__container {
      position: relative;
      max-width: 100%;
      min-width: 150px;
    }

    .img-default-skeleton {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(243, 243, 243, 0.5);
    }

    .img-default-skeleton.loading,
    .img-default-skeleton.error {
      min-height: 200px;
      width: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
    }

    .img-default-skeleton__icon {
      font-size: 40px;
      color: #5089b2;
      transform-origin: center center;
      @keyframes bf_img_loading {
        to {
          transform: rotate(360deg);
        }
      }
      animation: bf_img_loading 1s linear infinite;
    }

    .img-default-skeleton__error {
      color: #f00;
    }

    .img-block__container img {
      display: block;
      width: 100%;
    }

    .img-block__caption {
      z-index: 1;
      position: absolute;
      margin: 0;
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
      z-index: 2;
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
    NgIf, ParagraphBlock, NgForOf, FloatToolbar, OverlayModule, AsyncPipe
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

  constructor(private readonly _cdr: ChangeDetectorRef) {
    super();
  }

  protected TOOLBAR_LIST: IToolbarItem[] = [
    {
      name: 'caption',
      icon: 'bf_icon bf_tianjiamiaoshu',
      title: '添加图片标题'
    },
    {
      name: '|',
    },
    {
      name: 'align',
      icon: 'bf_icon bf_tupianjuzuo',
      value: 'start',
      title: '居左'
    },
    {
      name: 'align',
      icon: 'bf_icon bf_tupianjuzhong',
      value: 'center',
      title: '居中'
    },
    {
      name: 'align',
      icon: 'bf_icon bf_tupianjuyou',
      value: 'end',
      title: '居右'
    },
    {
      name: '|',
    },
    {
      name: 'copy-link',
      icon: 'bf_icon bf_tupianlianjie',
      title: '复制图片链接'
    },
    {
      name: 'download',
      icon: 'bf_icon bf_xiazai-2',
      title: '下载图片'
    }
  ]

  protected imgLoadState: 'loading' | 'loaded' | 'error' = 'loading'
  protected _showWidth = 100

  protected isFocusing$ = new BehaviorSubject(false)

  private _viewer: Viewer | null = null

  override ngOnInit() {
    super.ngOnInit();
    this._showWidth = this.model.props.width
    this.model.update$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(e => {
      if(e.type === 'props') {
        this._showWidth !== this.props.width && (this._showWidth = this.props.width)
      }
    })
  }

  override ngAfterViewInit() {
    super.ngAfterViewInit();
    const img = this.img.nativeElement
    if (img.complete && img.naturalHeight !== 0) {
      this.imgLoadState = 'loaded'
      return
    }
    const errorSub = fromEvent(img, 'error').pipe(take(1)).subscribe(() => {
      this.imgLoadState = 'error'
      this._cdr.detectChanges()
      loadSub.unsubscribe()
    })
    const loadSub = fromEvent(img, 'load').pipe(take(1)).subscribe(() => {
      this.imgLoadState = 'loaded'
      this._cdr.detectChanges()
      errorSub.unsubscribe()
    })
  }

  onImgFocus(event: FocusEvent) {
    event.stopPropagation()
    event.preventDefault()
    this.TOOLBAR_LIST = this.TOOLBAR_LIST.map((item) => ({...item, active: false}))
    this.TOOLBAR_LIST[0].active = !!this.model.children.length
    this.TOOLBAR_LIST[['start', 'center', 'end'].indexOf(this.props.align) + 2].active = true
    this.isFocusing$.next(true)
  }

  onImgBlur(event: FocusEvent) {
    event.stopPropagation()
    this.isFocusing$.next(false)
    // this._viewer?.destroy()
    // this._viewer = null
  }

  onImgClick(event: MouseEvent) {
    event.preventDefault()
    if (!this.isFocusing$.value) return
    this.previewImg()
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
      })

    fromEvent<MouseEvent>(document.body, 'mouseup').pipe(take(1)).subscribe((e) => {
      this.startPoint = undefined
      this.mouseMove$?.unsubscribe()
      this.setProp('width', this._showWidth)
    })
  }

  onToolbarItemClick(e: {item: IToolbarItem}) {
    const item = e.item
    switch (item.name) {
      case 'caption':
        if (this.model.children.length) {
          this.model.deleteChildren(0,1)
        } else {
          const paragraph = this.controller.createBlock('paragraph')
          this.controller.insertBlocks(0, [paragraph], this.id).then(() => {
            this.controller.setSelection(paragraph.id, 0)
          })
        }
        this.TOOLBAR_LIST[0].active = !!this.model.children.length
        break
      case 'align':
        if (this.props.align === item.value) return
        this.setProp('align', item.value as IImageBlockProps['align'])
        break
      case 'copy-link':
        navigator.clipboard.writeText(this.props.src)
        break
      case 'download':
        this.download(this.props.src)
        break
    }
  }

  download(src: string, caption?: string) {
    let a: HTMLAnchorElement | null = document.createElement('a')
    a.href = src
    a.download = caption || src
    a.target = '_blank'
    a.dispatchEvent(new MouseEvent('click'))
    a = null
  }

  override ngOnDestroy() {
    super.ngOnDestroy();
    this._viewer?.destroy()
  }
}
