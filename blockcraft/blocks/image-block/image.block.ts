import {ChangeDetectionStrategy, Component, ElementRef, ViewChild} from "@angular/core";
import {BaseBlockComponent, ORIGIN_NO_RECORD} from "../../framework";
import {ImageBlockModel} from "./index";
import {fromEvent, Subscription, take, throttleTime} from "rxjs";
import {AsyncPipe} from "@angular/common";

@Component({
  selector: "div.image-block",
  template: `
    <div class="img-wrapper">
      <img [src]="props.src" [style.width.px]="props.size.width"
           [style.height.px]="props.size.height" loading="lazy"
           [draggable]="!(doc.readonlySwitch$ | async)" #imgEle/>

      <div class="img-resizer__handle img-resizer__handle__point img-resizer__handle--tl"
           (click)="$event.stopPropagation()" contenteditable="false"
           (mousedown)="onResizeHandleMouseDown($event, 'left')"></div>
      <div class="img-resizer__handle img-resizer__handle__point img-resizer__handle--tr"
           (click)="$event.stopPropagation()" contenteditable="false"
           (mousedown)="onResizeHandleMouseDown($event, 'right')"></div>
      <div class="img-resizer__handle img-resizer__handle__point img-resizer__handle--bl"
           (click)="$event.stopPropagation()" contenteditable="false"
           (mousedown)="onResizeHandleMouseDown($event, 'left')"></div>
      <div class="img-resizer__handle img-resizer__handle__point img-resizer__handle--br"
           (click)="$event.stopPropagation()" contenteditable="false"
           (mousedown)="onResizeHandleMouseDown($event, 'right')"></div>
    </div>

    <ng-container #childrenContainer></ng-container>
  `,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AsyncPipe
  ],
  host: {
    '[attr.data-align]': 'props.align',
  }
})
export class ImageBlockComponent extends BaseBlockComponent<ImageBlockModel> {
  @ViewChild('imgEle', {read: ElementRef})
  imgEle!: ElementRef<HTMLImageElement>

  override ngAfterViewInit() {
    super.ngAfterViewInit();

    // 第一次出现在页面上时自动更新尺寸数据
    if (!this.props.size.height) {
      this._setInitSize()
    }

  }

  private startPoint?: { x: number, y: number, direction: 'left' | 'right' }
  private mouseMove$?: Subscription
  private _showSize = {width: 0, height: 0}

  private _setInitSize() {
    const rect = this.imgEle.nativeElement.getBoundingClientRect()
    const size = {
      width: rect.width,
      height: rect.height
    }
    this.setInitProps({size})
  }

  onResizeHandleMouseDown(event: MouseEvent, direction: 'left' | 'right') {
    event.stopPropagation()
    event.preventDefault()

    this.mouseMove$?.unsubscribe()
    this.startPoint = {x: event.clientX, y: event.clientY, direction}

    if (!this.props.size.height) {
      this._setInitSize()
    }

    this._showSize = {width: this.props.size.width, height: this.props.size.height!}

    this.mouseMove$ = fromEvent<MouseEvent>(document, 'mousemove')
      .pipe(throttleTime(60))
      .subscribe((e) => {
        const movePx = e.clientX - this.startPoint!.x
        if (this.startPoint!.direction === 'left') {
          this._showSize.width -= movePx
          this._showSize.height -= movePx
        } else {
          this._showSize.width += movePx
          this._showSize.height += movePx
        }
        this.startPoint!.x = e.clientX

        this.imgEle.nativeElement.style.width = `${this._showSize.width}px`
        this.imgEle.nativeElement.style.height = `${this._showSize.height}px`
      })

    fromEvent<MouseEvent>(document, 'mouseup').pipe(take(1)).subscribe((e) => {
      this.startPoint = undefined
      this.mouseMove$?.unsubscribe()
      const rect = this.imgEle.nativeElement.getBoundingClientRect()
      this._showSize = {width: rect.width, height: rect.height}
      this.updateProps({
        size: this._showSize
      })
      this.changeDetectorRef.markForCheck()
    })
  }
}
