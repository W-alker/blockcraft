import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostBinding,
  ViewChild
} from "@angular/core";
import {AsyncPipe, NgForOf, NgIf} from "@angular/common";
import {BehaviorSubject, fromEvent, Subscription, take, throttleTime} from "rxjs";
import Viewer from 'viewerjs';
import {FloatToolbar, IToolbarItem} from "../../components";
import {IImageBlockProps, IImgBlockModel} from "./type";
import {BaseBlock} from "../../core";
import {ParagraphBlock} from "../paragraph/paragraph.block";
import {OverlayModule} from "@angular/cdk/overlay";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";


const COPIED_MENU: IToolbarItem = {
  id: 'copied',
  name: 'copied',
  icon: 'bf_icon bf_xuanzhong',
  title: '已复制',
  text: '已复制'
}

const IMAGE_BLOCK_TOOLBAR_LIST: IToolbarItem[] = [
  {
    id: 'caption',
    name: 'caption',
    icon: 'bf_icon bf_tianjiamiaoshu',
    title: '添加图片标题',
    divide: true
  },
  {
    id: 'align-start',
    name: 'align',
    icon: 'bf_icon bf_tupianjuzuo',
    value: 'start',
    title: '居左'
  },
  {
    id: 'align-center',
    name: 'align',
    icon: 'bf_icon bf_tupianjuzhong',
    value: 'center',
    title: '居中'
  },
  {
    id: 'align-end',
    name: 'align',
    icon: 'bf_icon bf_tupianjuyou',
    value: 'end',
    title: '居右',
    divide: true
  },
  {
    id: 'copy-link',
    name: 'copy-link',
    icon: 'bf_icon bf_tupianlianjie',
    title: '复制图片链接'
  },
  {
    id: 'download',
    name: 'download',
    icon: 'bf_icon bf_xiazai-2',
    title: '下载图片'
  }
]

@Component({
  selector: 'div.image-block',
  standalone: true,
  template: `
    <div class="img-block__container" [style.width.px]="_showWidth"
         [attr.tabindex]=" (controller.readonly$ | async) ? null : 0 " (keydown)="onKeydown($event)"
         (focus)="onImgFocus($event)" (blur)="onImgBlur($event)">

      <div [class]="['img-default-skeleton', imgLoadState]" *ngIf="imgLoadState !== 'loaded'">
        <span class="img-default-skeleton__icon bf_icon bf_jiazai" *ngIf="imgLoadState === 'loading'"></span>
        <span class="img-default-skeleton__error" *ngIf="imgLoadState === 'error'">加载失败!</span>
      </div>

      @if (imgLoadState === 'loaded') {
        <div class="bf-float-toolbar img-block__toolbar" *ngIf="isFocusing$ | async"
             [toolbarList]="TOOLBAR_LIST" [activeMenu]="activeMenu" (click)="$event.stopPropagation();"
             (itemClick)="onToolbarItemClick($event)">
        </div>
      }

      <img [src]="model.props.src" [class.resize-mode]="isFocusing$ | async" draggable="false" #img>

      <ng-container *ngIf="imgLoadState === 'loaded'">
        <p class="img-block__caption editable-container" *ngFor="let item of children"
           [controller]="controller" [model]="item" [placeholder]="'添加标题'"
           (click)="$event.stopPropagation()" (mousemove)="$event.stopPropagation()"></p>
      </ng-container>

      <div class="img-resizer" *ngIf="isFocusing$ | async" (mousedown)="onImgClick($event)">
        <div class="img-resizer__handle img-resizer__handle__line img-resizer__handle--left"
             (click)="$event.stopPropagation()"
             (mousedown)="onResizeHandleMouseDown($event, 'left')"></div>
        <div class="img-resizer__handle img-resizer__handle__line  img-resizer__handle--right"
             (click)="$event.stopPropagation()"
             (mousedown)="onResizeHandleMouseDown($event, 'right')"></div>
        <div class="img-resizer__handle img-resizer__handle__point img-resizer__handle--tl"
             (click)="$event.stopPropagation()"
             (mousedown)="onResizeHandleMouseDown($event, 'left')"></div>
        <div class="img-resizer__handle img-resizer__handle__point img-resizer__handle--tr"
             (click)="$event.stopPropagation()"
             (mousedown)="onResizeHandleMouseDown($event, 'right')"></div>
        <div class="img-resizer__handle img-resizer__handle__point img-resizer__handle--bl"
             (click)="$event.stopPropagation()"
             (mousedown)="onResizeHandleMouseDown($event, 'left')"></div>
        <div class="img-resizer__handle img-resizer__handle__point img-resizer__handle--br"
             (click)="$event.stopPropagation()"
             (mousedown)="onResizeHandleMouseDown($event, 'right')"></div>
      </div>

    </div>
  `,
  styleUrls: ['image.block.scss'],
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

  protected TOOLBAR_LIST = [...IMAGE_BLOCK_TOOLBAR_LIST]
  protected activeMenu?: Set<string>

  protected imgLoadState: 'loading' | 'loaded' | 'error' = 'loading'
  protected _showWidth = 100

  protected isFocusing$ = new BehaviorSubject(false)

  private _viewer: Viewer | null = null

  override ngOnInit() {
    super.ngOnInit();
    this._showWidth = this.model.props.width
    this.model.update$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(e => {
      if (e.type === 'props') {
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

  onKeydown(e: KeyboardEvent) {
    if (e.isComposing || e.eventPhase !== 2) return
    switch (e.key) {
      case 'Delete':
      case 'Backspace':
        e.stopPropagation()
        e.preventDefault()
        this.deleteSelf()
        break
    }
  }

  deleteSelf() {
    const {parentId, index} = this.getPosition()
    if (parentId === this.controller.rootId && index > 0) {
      const prevEditable = this.controller.findPrevEditableBlock(this.id)
      prevEditable && prevEditable.setSelection('end')
    }
    this.controller.deleteBlocks(index, 1, parentId)
  }

  setToolbarActive() {
    const set = new Set<string>()
    if (this.model.children.length) set.add('caption')
    set.add('align-' + this.props.align)
    this.activeMenu = set
  }

  onImgFocus(event: FocusEvent) {
    event.stopPropagation()
    event.preventDefault()
    this.setToolbarActive()
    this.isFocusing$.next(true)
  }

  onImgBlur(event: FocusEvent) {
    event.stopPropagation()
    this.isFocusing$.next(false)
  }

  onImgClick(event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    if (this.controller.readonly$.value) {
      this.previewImg()
      return
    }
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
      this._showWidth !== this.props.width && this.setProp('width', this._showWidth)
    })
  }

  onToolbarItemClick(e: { item: IToolbarItem }) {
    const item = e.item
    switch (item.name) {
      case 'caption':
        if (this.model.children.length) {
          this.model.deleteChildren(0, 1)
        } else {
          const paragraph = this.controller.createBlock('paragraph')
          this.controller.insertBlocks(0, [paragraph], this.id).then(() => {
            this.controller.selection.setSelection(paragraph.id, 0)
          })
        }
        this.setToolbarActive()
        break
      case 'align':
        if (this.props.align === item.value) return
        this.setProp('align', item.value as IImageBlockProps['align'])
        this.setToolbarActive()
        break
      case 'copy-link':
        this.controller.clipboard.writeText(this.props.src).then(() => {
          const idx = this.TOOLBAR_LIST.findIndex(item => item.name === 'copy-link')
          this.TOOLBAR_LIST.splice(idx, 1, COPIED_MENU)
          this.activeMenu?.add(COPIED_MENU.id)
          this.TOOLBAR_LIST = [...this.TOOLBAR_LIST]
          setTimeout(() => {
            this.TOOLBAR_LIST.splice(idx, 1, item)
            this.TOOLBAR_LIST = [...this.TOOLBAR_LIST]
          }, 2000)
        })
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
