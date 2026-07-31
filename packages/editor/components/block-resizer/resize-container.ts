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

export interface BlockResizeCommit {
  width: number
  height: number
  offsetX: number
  basisWidth: number
}

interface ResizeGesture {
  pointerId: number
  side: 'left' | 'right'
  handle: HTMLElement
  ownerWindow: Window
  startX: number
  startWidth: number
  minWidth: number
  maxWidth: number
  basisWidth: number
  width: number
  offsetX: number
  originalWidth: string
  originalTransform: string
  pendingClientX: number
  frame: number | null
}

@Component({
  selector: 'block-resizer',
  template: `
    <div class="block-resizer__bar block-resizer__bar--left"
         (click)="$event.stopPropagation()" contenteditable="false"
         (pointerdown)="onHandlePointerDown($event, 'left')">
      <div class="block-resizer__bar-inner"></div>
    </div>
    <div class="block-resizer__bar block-resizer__bar--right"
         (click)="$event.stopPropagation()" contenteditable="false"
         (pointerdown)="onHandlePointerDown($event, 'right')">
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
      touch-action: none;
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
  maxWidth?: number

  @Input()
  referenceWidth?: number

  @Input()
  minWidth = 30

  @Input()
  preserveRightEdge = false

  @Output()
  widthChange = new EventEmitter<number>()

  @Output()
  resizeCommit = new EventEmitter<BlockResizeCommit>()

  @Output()
  resizeStart = new EventEmitter<void>()

  @Output()
  resizeEnd = new EventEmitter<void>()

  private _gesture: ResizeGesture | null = null
  private _hoverEnter?: () => void
  private _hoverLeave?: () => void

  constructor(private ngZone: NgZone, private elRef: ElementRef<HTMLElement>) {}

  ngAfterViewInit() {
    const host = this.elRef.nativeElement;
    const parent = this.container?.parentElement ?? this.container;

    this._hoverEnter = () => host.classList.add('visible');
    this._hoverLeave = () => {
      if (!this._gesture) host.classList.remove('visible');
    };

    parent.addEventListener('mouseenter', this._hoverEnter);
    parent.addEventListener('mouseleave', this._hoverLeave);
  }

  ngOnDestroy() {
    this.finishGesture(false, false);
    const parent = this.container?.parentElement ?? this.container;
    if (this._hoverEnter) parent.removeEventListener('mouseenter', this._hoverEnter);
    if (this._hoverLeave) parent.removeEventListener('mouseleave', this._hoverLeave);
  }

  onHandlePointerDown(event: PointerEvent, side: 'left' | 'right') {
    if (!event.isPrimary || event.button !== 0) return
    event.preventDefault();
    event.stopPropagation();

    this.finishGesture(false, false)
    const handle = event.currentTarget as HTMLElement
    const ownerWindow =
      this.container.ownerDocument.defaultView ?? window
    const startWidth =
      this.container.getBoundingClientRect().width ||
      this.container.clientWidth
    const maxWidthEl = this.maxWidthContainer ?? this.container.parentElement;
    const configuredMaxWidth =
      Number.isFinite(this.maxWidth) && (this.maxWidth ?? 0) > 0
        ? this.maxWidth!
        : (maxWidthEl?.clientWidth ?? Number.POSITIVE_INFINITY)
    const maxWidth = Math.max(1, configuredMaxWidth)
    const basisWidth =
      Number.isFinite(this.referenceWidth) && (this.referenceWidth ?? 0) > 0
        ? this.referenceWidth!
        : (Number.isFinite(maxWidth) ? maxWidth : startWidth)
    const minWidth = Math.min(
      maxWidth,
      Math.max(1, Number.isFinite(this.minWidth) ? this.minWidth : 30),
    )

    this.resizeStart.emit();

    this.ngZone.runOutsideAngular(() => {
      this._gesture = {
        pointerId: event.pointerId,
        side,
        handle,
        ownerWindow,
        startX: event.clientX,
        startWidth,
        minWidth,
        maxWidth,
        basisWidth,
        width: startWidth,
        offsetX: 0,
        originalWidth: this.container.style.width,
        originalTransform: this.container.style.transform,
        pendingClientX: event.clientX,
        frame: null,
      }
      handle.setPointerCapture?.(event.pointerId)
      ownerWindow.addEventListener('pointermove', this.onPointerMove, true)
      ownerWindow.addEventListener('pointerup', this.onPointerUp, true)
      ownerWindow.addEventListener('pointercancel', this.onPointerCancel, true)
      ownerWindow.addEventListener('keydown', this.onKeyDown, true)
      ownerWindow.addEventListener('blur', this.onWindowBlur)
    });
  }

  private readonly onPointerMove = (event: PointerEvent) => {
    const gesture = this._gesture
    if (!gesture || event.pointerId !== gesture.pointerId) return
    event.preventDefault()
    gesture.pendingClientX = event.clientX
    if (gesture.frame !== null) return
    gesture.frame = gesture.ownerWindow.requestAnimationFrame(() => {
      gesture.frame = null
      this.applyPreview(gesture.pendingClientX)
    })
  }

  private readonly onPointerUp = (event: PointerEvent) => {
    const gesture = this._gesture
    if (!gesture || event.pointerId !== gesture.pointerId) return
    event.preventDefault()
    gesture.pendingClientX = event.clientX
    this.finishGesture(true, true)
  }

  private readonly onPointerCancel = (event: PointerEvent) => {
    if (!this._gesture || event.pointerId !== this._gesture.pointerId) return
    this.finishGesture(false, true)
  }

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !this._gesture) return
    event.preventDefault()
    this.finishGesture(false, true)
  }

  private readonly onWindowBlur = () => {
    if (this._gesture) this.finishGesture(false, true)
  }

  private applyPreview(clientX: number): void {
    const gesture = this._gesture
    if (!gesture) return
    const delta = clientX - gesture.startX
    const requestedWidth =
      gesture.startWidth + (gesture.side === 'left' ? -delta : delta)
    gesture.width = Math.min(
      gesture.maxWidth,
      Math.max(gesture.minWidth, requestedWidth),
    )
    gesture.offsetX =
      this.preserveRightEdge && gesture.side === 'left'
        ? gesture.startWidth - gesture.width
        : 0
    this.container.style.width = `${gesture.width}px`
    this.container.style.transform = gesture.offsetX === 0
      ? gesture.originalTransform
      : `translateX(${gesture.offsetX}px)${gesture.originalTransform
        ? ` ${gesture.originalTransform}`
        : ''}`
  }

  private finishGesture(commit: boolean, emitEnd: boolean): void {
    const gesture = this._gesture
    if (!gesture) return
    this._gesture = null
    if (gesture.frame !== null) {
      gesture.ownerWindow.cancelAnimationFrame(gesture.frame)
      gesture.frame = null
    }
    this.removeGestureListeners(gesture)
    try {
      gesture.handle.releasePointerCapture?.(gesture.pointerId)
    } catch {}

    if (!commit) {
      this.container.style.width = gesture.originalWidth
      this.container.style.transform = gesture.originalTransform
      this.elRef.nativeElement.classList.remove('visible')
      if (emitEnd) {
        this.ngZone.run(() => this.resizeEnd.emit())
      }
      return
    }

    // Pointerup owns the final coordinates even if the last RAF has not run.
    this._gesture = gesture
    this.applyPreview(gesture.pendingClientX)
    this._gesture = null
    const rect = this.container.getBoundingClientRect()
    const result: BlockResizeCommit = {
      width: Math.round(gesture.width),
      height: Math.max(1, Math.round(rect.height)),
      offsetX: gesture.offsetX,
      basisWidth: gesture.basisWidth,
    }
    this.ngZone.run(() => {
      this.widthChange.emit(result.width)
      this.resizeCommit.emit(result)
      this.resizeEnd.emit()
    })
    this.container.style.transform = gesture.originalTransform
    this.elRef.nativeElement.classList.remove('visible')
  }

  private removeGestureListeners(gesture: ResizeGesture): void {
    gesture.ownerWindow.removeEventListener('pointermove', this.onPointerMove, true)
    gesture.ownerWindow.removeEventListener('pointerup', this.onPointerUp, true)
    gesture.ownerWindow.removeEventListener('pointercancel', this.onPointerCancel, true)
    gesture.ownerWindow.removeEventListener('keydown', this.onKeyDown, true)
    gesture.ownerWindow.removeEventListener('blur', this.onWindowBlur)
  }
}
