import {ChangeDetectionStrategy, Component, ElementRef, ViewChild} from "@angular/core";
import {BaseBlockComponent} from "../../framework";
import {ImageBlockModel} from "./index";
import {fromEvent, Subscription, take, throttleTime} from "rxjs";
import {AsyncPipe} from "@angular/common";
import {nextTick} from "../../global";

@Component({
  selector: "div.image-block",
  template: `
    <figure class="image-block__container" [attr.data-align]="props.align">
      <div class="img-wrapper">
        <img [src]="props.src" [style.width.px]="props.width" loading="lazy" contenteditable="false"
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
    </figure>
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

    if (!this.props.width) {
      const img = this.imgEle.nativeElement
      img.addEventListener('load', () => {
        this.setInitProps({width: img.naturalWidth, height: img.naturalHeight})
      }, {once: true})
    }
  }

  private startPoint?: { x: number, y: number, direction: 'left' | 'right' }
  private mouseMove$?: Subscription
  private _showSize = {width: 0, height: 0}

  onResizeHandleMouseDown(event: MouseEvent, direction: 'left' | 'right') {
    event.stopPropagation()
    event.preventDefault()

    this.doc.ngZone.runOutsideAngular(() => {

      this.mouseMove$?.unsubscribe()
      this.startPoint = {x: event.clientX, y: event.clientY, direction}

      if (!this.props.width) {
        const rect = this.imgEle.nativeElement.getBoundingClientRect()
        this.setInitProps({width: rect.width, height: rect.height})
      }

      const maxWidth = this.hostElement.clientWidth
      const minWidth = 26

      this._showSize = {width: this.props.width!, height: this.props.height!}

      this.mouseMove$ = fromEvent<MouseEvent>(document, 'mousemove', {capture: true})
        .pipe(throttleTime(26))
        .subscribe((e) => {
          const movePx = e.clientX - this.startPoint!.x
          this.startPoint!.x = e.clientX

          const _resizeWidth = this._showSize.width + (this.startPoint!.direction === 'left' ? -movePx : movePx)
          if (_resizeWidth > maxWidth || _resizeWidth < minWidth) {
            return
          }

          const resizeHeight = this._showSize.height + (this.startPoint!.direction === 'left' ? -movePx : movePx)

          this._showSize.width = _resizeWidth
          this._showSize.height = resizeHeight

          this.imgEle.nativeElement.style.width = `${this._showSize.width}px`
        })

      fromEvent<MouseEvent>(document, 'mouseup', {capture: true}).pipe(take(1)).subscribe((e) => {
        this.startPoint = undefined
        this.mouseMove$?.unsubscribe()
        const rect = this.imgEle.nativeElement.getBoundingClientRect()
        this._showSize = {width: rect.width, height: rect.height}
        this.updateProps({
          width: this._showSize.width,
          height: this._showSize.height
        })
        this.changeDetectorRef.markForCheck()
      })

    })


  }
}
