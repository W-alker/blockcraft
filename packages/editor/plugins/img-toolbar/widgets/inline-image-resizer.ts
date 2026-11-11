import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
} from '@angular/core';
import type {InlineImageResizeSide} from '../inline-image-resize';

export interface InlineImageResizeHandleEvent {
  event: PointerEvent;
  side: InlineImageResizeSide;
}

@Component({
  selector: 'inline-image-resizer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'contenteditable': 'false',
    'data-bc-inline-image-resizer': '',
  },
  template: `
    <div class="inline-image-resizer__bar inline-image-resizer__bar--left"
         contenteditable="false"
         (click)="$event.stopPropagation()"
         (pointerdown)="onPointerDown($event, 'left')">
      <div class="inline-image-resizer__bar-inner"></div>
    </div>
    <div class="inline-image-resizer__bar inline-image-resizer__bar--right"
         contenteditable="false"
         (click)="$event.stopPropagation()"
         (pointerdown)="onPointerDown($event, 'right')">
      <div class="inline-image-resizer__bar-inner"></div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      position: absolute;
      inset: 0;
      pointer-events: none;
    }

    .inline-image-resizer__bar {
      position: absolute;
      top: 0;
      width: 20px;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: auto;
      cursor: col-resize;
      touch-action: none;
      z-index: 10;
      opacity: 0;
      transition: opacity 0.2s ease;
    }

    :host(.visible) > .inline-image-resizer__bar {
      opacity: 1;
    }

    .inline-image-resizer__bar--left {
      left: -10px;
    }

    .inline-image-resizer__bar--right {
      right: -10px;
    }

    .inline-image-resizer__bar-inner {
      width: 6px;
      height: 48px;
      max-height: 60%;
      min-height: 24px;
      border-radius: 3px;
      background: var(--bc-active-color, #4857e2);
      opacity: 0.75;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
      transition: opacity 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
    }

    .inline-image-resizer__bar:hover .inline-image-resizer__bar-inner,
    .inline-image-resizer__bar:active .inline-image-resizer__bar-inner {
      opacity: 1;
      transform: scaleY(1.15);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    }
  `],
})
export class InlineImageResizerComponent implements AfterViewInit, OnDestroy {
  @Input({required: true})
  container!: HTMLElement;

  @Output()
  handlePointerDown = new EventEmitter<InlineImageResizeHandleEvent>();

  private _hoverTarget?: HTMLElement;
  private _hoverEnter?: () => void;
  private _hoverLeave?: () => void;

  constructor(private readonly _host: ElementRef<HTMLElement>) {}

  ngAfterViewInit(): void {
    const host = this._host.nativeElement;
    this._hoverTarget = this.container.parentElement ?? this.container;
    this._hoverEnter = () => host.classList.add('visible');
    this._hoverLeave = () => host.classList.remove('visible');
    this._hoverTarget.addEventListener('mouseenter', this._hoverEnter);
    this._hoverTarget.addEventListener('mouseleave', this._hoverLeave);
  }

  ngOnDestroy(): void {
    if (this._hoverEnter) {
      this._hoverTarget?.removeEventListener('mouseenter', this._hoverEnter);
    }
    if (this._hoverLeave) {
      this._hoverTarget?.removeEventListener('mouseleave', this._hoverLeave);
    }
  }

  onPointerDown(event: PointerEvent, side: InlineImageResizeSide): void {
    if (event.isPrimary === false || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    this.handlePointerDown.emit({event, side});
  }
}
