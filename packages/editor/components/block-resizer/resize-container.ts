import {Component, EventEmitter, Input, Output} from "@angular/core";
import {fromEvent, Subscription, take, throttleTime} from "rxjs";

@Component({
  selector: 'block-resizer',
  template: `
    <div class="block-resizer__handle block-resizer__handle__point block-resizer__handle--tl"
         (click)="$event.stopPropagation()" contenteditable="false"
         (mousedown)="onResizeHandleMouseDown($event, 'left')"></div>
    <div class="block-resizer__handle block-resizer__handle__point block-resizer__handle--tr"
         (click)="$event.stopPropagation()" contenteditable="false"
         (mousedown)="onResizeHandleMouseDown($event, 'right')"></div>
    <div class="block-resizer__handle block-resizer__handle__point block-resizer__handle--bl"
         (click)="$event.stopPropagation()" contenteditable="false"
         (mousedown)="onResizeHandleMouseDown($event, 'left')"></div>
    <div class="block-resizer__handle block-resizer__handle__point block-resizer__handle--br"
         (click)="$event.stopPropagation()" contenteditable="false"
         (mousedown)="onResizeHandleMouseDown($event, 'right')"></div>
  `,
  styles: [`
    :host {
      display: block;
      position: absolute;
      width: 100%;
      height: 100%;
      top: 0;
      left: 0;

      .block-resizer__handle__point {
        width: 10px;
        height: 10px;
        background-color: #fff;
        border: 1px solid var(--bc-active-color);
        border-radius: 50%;
      }

      .block-resizer__handle {
        position: absolute;
        /*display: none;*/
      }

      .block-resizer__handle--tl {
        top: -7px;
        left: -7px;
        cursor: nwse-resize;
      }

      .block-resizer__handle--tr {
        top: -7px;
        right: -7px;
        cursor: nesw-resize;
      }

      .block-resizer__handle--bl {
        bottom: -7px;
        left: -7px;
        cursor: nesw-resize;
      }

      .block-resizer__handle--br {
        bottom: -7px;
        right: -7px;
        cursor: nwse-resize;
      }

      .block-resizer__handle--left, .block-resizer__handle--right {
        top: 0;
        width: 4px;
        height: 100%;
        cursor: w-resize;
      }

      .block-resizer__handle--left {
        left: -2px;
      }

      .block-resizer__handle--right {
        right: -2px;
      }
    }

  `],
  standalone: true
})
export class ResizeContainerComponent {
  @Input({required: true})
  container!: HTMLElement


  @Output()
  sizeChange = new EventEmitter<{ width: number, height: number }>()

  private startPoint?: { x: number, y: number, direction: 'left' | 'right' }
  private mouseMove$?: Subscription
  private _showSize = {width: 0, height: 0}

  ngAfterViewInit() {
    const rect = this.container.getBoundingClientRect()
    this._showSize = {width: rect.width, height: rect.height}
  }

  onResizeHandleMouseDown(event: MouseEvent, direction: 'left' | 'right') {
    event.stopPropagation()
    event.preventDefault()

    this.mouseMove$?.unsubscribe()
    this.startPoint = {x: event.clientX, y: event.clientY, direction}

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

        this.container.style.width = `${this._showSize.width}px`
        this.container.style.height = `${this._showSize.height}px`
      })

    fromEvent<MouseEvent>(document, 'mouseup').pipe(take(1)).subscribe((e) => {
      this.startPoint = undefined
      this.mouseMove$?.unsubscribe()
      const rect = this.container.getBoundingClientRect()
      this._showSize = {width: rect.width, height: rect.height}
      this.sizeChange.emit(this._showSize)
    })
  }
}
