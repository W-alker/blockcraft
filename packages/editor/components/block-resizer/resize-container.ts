import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnDestroy,
  Output
} from "@angular/core";
import {fromEvent, Subscription, take, throttleTime} from "rxjs";

@Component({
  selector: 'block-resizer',
  template: `
    <div class="block-resizer__bar block-resizer__bar--left"
         (click)="$event.stopPropagation()" contenteditable="false"
         (mousedown)="onHandleMouseDown($event, 'left')">
      <div class="block-resizer__bar-inner"></div>
    </div>
    <div class="block-resizer__bar block-resizer__bar--right"
         (click)="$event.stopPropagation()" contenteditable="false"
         (mousedown)="onHandleMouseDown($event, 'right')">
      <div class="block-resizer__bar-inner"></div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      position: absolute;
      inset: 0;
      pointer-events: none;
    }

    .block-resizer__bar {
      position: absolute;
      top: 0;
      width: 20px;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: auto;
      cursor: col-resize;
      z-index: 10;
      opacity: 0;
      transition: opacity 0.2s ease;
    }

    :host(.visible) > .block-resizer__bar {
      opacity: 1;
    }

    .block-resizer__bar--left {
      left: -10px;
    }

    .block-resizer__bar--right {
      right: -10px;
    }

    .block-resizer__bar-inner {
      width: 6px;
      height: 48px;
      max-height: 60%;
      min-height: 24px;
      border-radius: 3px;
      background: var(--bc-active-color, #4857E2);
      opacity: 0.75;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
      transition: opacity 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
    }

    .block-resizer__bar:hover .block-resizer__bar-inner {
      opacity: 1;
      transform: scaleY(1.15);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    }

    .block-resizer__bar:active .block-resizer__bar-inner {
      opacity: 1;
      transform: scaleY(1.15);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    }
  `],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ResizeContainerComponent implements AfterViewInit, OnDestroy {
  @Input({required: true})
  container!: HTMLElement

  @Input()
  maxWidthContainer?: HTMLElement

  @Input()
  minWidth = 30

  @Output()
  widthChange = new EventEmitter<number>()

  @Output()
  resizeStart = new EventEmitter<void>()

  @Output()
  resizeEnd = new EventEmitter<void>()

  private _startPoint?: { x: number; side: string }
  private _mouseMove$?: Subscription
  private _hoverEnter?: () => void
  private _hoverLeave?: () => void

  constructor(private ngZone: NgZone, private elRef: ElementRef<HTMLElement>) {}

  ngAfterViewInit() {
    const host = this.elRef.nativeElement;
    const parent = this.container?.parentElement ?? this.container;

    this._hoverEnter = () => host.classList.add('visible');
    this._hoverLeave = () => {
      if (!this._startPoint) host.classList.remove('visible');
    };

    parent.addEventListener('mouseenter', this._hoverEnter);
    parent.addEventListener('mouseleave', this._hoverLeave);
  }

  ngOnDestroy() {
    this._mouseMove$?.unsubscribe();
    const parent = this.container?.parentElement ?? this.container;
    if (this._hoverEnter) parent.removeEventListener('mouseenter', this._hoverEnter);
    if (this._hoverLeave) parent.removeEventListener('mouseleave', this._hoverLeave);
  }

  onHandleMouseDown(event: MouseEvent, side: 'left' | 'right') {
    event.preventDefault();
    event.stopPropagation();

    let width = this.container.clientWidth;
    const maxWidthEl = this.maxWidthContainer ?? this.container.parentElement;
    const maxWidth = maxWidthEl ? maxWidthEl.clientWidth : Infinity;

    this.resizeStart.emit();

    this.ngZone.runOutsideAngular(() => {
      this._mouseMove$?.unsubscribe();
      this._startPoint = {x: event.clientX, side};

      this._mouseMove$ = fromEvent<MouseEvent>(document, 'mousemove', {capture: true})
        .pipe(throttleTime(16))
        .subscribe((e) => {
          const deltaX = e.clientX - this._startPoint!.x;
          this._startPoint!.x = e.clientX;

          width += this._startPoint!.side === 'left' ? -deltaX : deltaX;

          if (width > maxWidth || width < this.minWidth) return;

          this.container.style.width = `${width}px`;
        });

      fromEvent<MouseEvent>(document, 'mouseup', {capture: true})
        .pipe(take(1))
        .subscribe(() => {
          this._startPoint = undefined;
          this._mouseMove$?.unsubscribe();
          this.elRef.nativeElement.classList.remove('visible');
          this.ngZone.run(() => {
            this.widthChange.emit(Math.round(width));
            this.resizeEnd.emit();
          });
        });
    });
  }
}
