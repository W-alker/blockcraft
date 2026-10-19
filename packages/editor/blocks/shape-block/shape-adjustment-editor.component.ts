import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core'
import {
  resolveShapeAdjustmentProjection,
  updateShapeAdjustment,
  type ShapeAdjustmentHandle,
  type ShapeAdjustmentProjection,
} from './shape-adjustments'
import type {ShapeAdjustmentValues, ShapeKind} from './shape.types'

@Component({
  selector: 'shape-adjustment-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {'data-bc-placement-pick-ignore': ''},
  template: `
    <svg #overlay class="shape-adjustment-editor__overlay"
      viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
    </svg>
    @for (handle of handles; track handle.id) {
      <button type="button" class="shape-adjustment-editor__handle"
        [attr.data-adjustment-handle-id]="handle.id"
        [attr.aria-label]="handle.label"
        [style.left.%]="handle.x / 10"
        [style.top.%]="handle.y / 10"
        contenteditable="false"
        (pointerdown)="onPointerDown($event, handle)">
      </button>
    }
  `,
  styles: [`
    :host {
      position: absolute;
      inset: 0;
      z-index: 6;
      display: none;
      overflow: visible;
      pointer-events: none;
    }

    .shape-adjustment-editor__overlay {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: visible;
      pointer-events: none;
    }

    .shape-adjustment-editor__handle {
      position: absolute;
      width: 12px;
      height: 12px;
      padding: 0;
      border: 2px solid var(--bc-warning-color, #f5a623);
      border-radius: 50%;
      background: var(--bc-bg-primary, #fff);
      transform: translate(-50%, -50%);
      pointer-events: auto;
      touch-action: none;
      cursor: move;
    }
  `],
})
export class ShapeAdjustmentEditorComponent implements OnChanges, OnDestroy {
  @ViewChild('overlay', {read: ElementRef})
  private readonly overlay?: ElementRef<SVGSVGElement>

  @Input({required: true}) targetSvg!: Element
  @Input({required: true}) shapeType!: ShapeKind
  @Input() adjustments?: ShapeAdjustmentValues
  @Output() adjustmentsCommit = new EventEmitter<ShapeAdjustmentValues>()

  private _committed?: ShapeAdjustmentProjection
  private _working?: ShapeAdjustmentProjection
  private _activeHandle: ShapeAdjustmentHandle | null = null
  private _activePointerId: number | null = null
  private _originalPathData = ''
  private _pendingPointer: PointerEvent | null = null
  private _raf = 0

  handles: readonly ShapeAdjustmentHandle[] = []

  constructor(
    private readonly cdr: ChangeDetectorRef,
    private readonly ngZone: NgZone,
  ) {}

  ngOnChanges(_changes: SimpleChanges): void {
    if (this._activePointerId !== null) return
    this._committed = resolveShapeAdjustmentProjection(
      this.shapeType,
      this.adjustments,
    )
    this._working = this._committed
    this._refreshProjection()
  }

  onPointerDown(event: PointerEvent, handle: ShapeAdjustmentHandle): void {
    if (event.button !== 0 || this._activePointerId !== null || !this._committed) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    this._activePointerId = event.pointerId
    this._activeHandle = handle
    this._working = this._committed
    this._originalPathData = this._targetPath()?.getAttribute('d') ?? ''
    ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
    this.ngZone.runOutsideAngular(() => {
      window.addEventListener('pointermove', this._onPointerMove, true)
      window.addEventListener('pointerup', this._onPointerUp, true)
      window.addEventListener('pointercancel', this._onPointerCancel, true)
      window.addEventListener('keydown', this._onKeyDown, true)
      window.addEventListener('blur', this._onWindowBlur, true)
    })
  }

  ngOnDestroy(): void {
    this._cancel(false)
  }

  private readonly _onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this._activePointerId) return
    event.preventDefault()
    this._pendingPointer = event
    if (this._raf) return
    this._raf = requestAnimationFrame(() => {
      this._raf = 0
      const pending = this._pendingPointer
      this._pendingPointer = null
      if (pending) this._applyPointer(pending)
    })
  }

  private readonly _onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this._activePointerId) return
    event.preventDefault()
    this._applyPointer(event)
    const committed = this._working
    this._cancel(true)
    if (!committed) return
    this._committed = committed
    this._refreshProjection()
    this.ngZone.run(() => this.adjustmentsCommit.emit({...committed.adjustments}))
  }

  private readonly _onPointerCancel = (event: PointerEvent): void => {
    if (event.pointerId === this._activePointerId) this._cancel(false)
  }

  private readonly _onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || this._activePointerId === null) return
    event.preventDefault()
    event.stopPropagation()
    this._cancel(false)
  }

  private readonly _onWindowBlur = (): void => this._cancel(false)

  private _applyPointer(event: PointerEvent): void {
    if (!this._activeHandle || !this._working || !this.overlay) return
    const matrix = this.overlay.nativeElement.getScreenCTM()
    if (!matrix) return
    const point = this.overlay.nativeElement.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    let local: DOMPoint
    try {
      local = point.matrixTransform(matrix.inverse())
    } catch {
      return
    }
    const next = updateShapeAdjustment(
      this.shapeType,
      this._working.adjustments,
      this._activeHandle.id,
      Math.max(0, Math.min(1000, local.x)),
      Math.max(0, Math.min(1000, local.y)),
    )
    if (!next) return
    this._working = next
    this._targetPath()?.setAttribute('d', next.path)
    this._updateHandleDom()
  }

  private _targetPath(): SVGPathElement | null {
    return this.targetSvg.querySelector<SVGPathElement>(
      '[data-bc-shape-render-path]',
    )
  }

  private _updateHandleDom(): void {
    if (!this._working) return
    const handles = new Map(this._working.handles.map(handle => [handle.id, handle]))
    for (const button of Array.from(
      this.overlay?.nativeElement.parentElement?.querySelectorAll<HTMLElement>(
        '[data-adjustment-handle-id]',
      ) ?? [],
    )) {
      const handle = handles.get(button.dataset['adjustmentHandleId'] ?? '')
      if (!handle) continue
      button.style.left = `${handle.x / 10}%`
      button.style.top = `${handle.y / 10}%`
    }
  }

  private _refreshProjection(): void {
    this.handles = this._working?.handles ?? []
    this.cdr.markForCheck()
  }

  private _cancel(keepPreview: boolean): void {
    window.removeEventListener('pointermove', this._onPointerMove, true)
    window.removeEventListener('pointerup', this._onPointerUp, true)
    window.removeEventListener('pointercancel', this._onPointerCancel, true)
    window.removeEventListener('keydown', this._onKeyDown, true)
    window.removeEventListener('blur', this._onWindowBlur, true)
    if (this._raf) cancelAnimationFrame(this._raf)
    this._raf = 0
    this._pendingPointer = null
    if (!keepPreview) {
      this._targetPath()?.setAttribute('d', this._originalPathData)
      this._working = this._committed
      this._refreshProjection()
    }
    this._activePointerId = null
    this._activeHandle = null
    this._originalPathData = ''
  }
}
