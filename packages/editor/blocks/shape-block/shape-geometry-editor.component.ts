import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnDestroy,
  Output,
  ViewChild,
} from '@angular/core'
import {getShapeDefinition} from './shape-definitions'
import {
  cloneCustomShapeGeometry,
  getShapeGeometryHandles,
  normalizeCustomShapeGeometry,
  resolveShapeRenderGeometry,
  updateShapeGeometryHandle,
  type ShapeGeometryControlLine,
  type ShapeGeometryHandle,
} from './shape-geometry'
import type {CustomShapeGeometry, ShapeKind} from './shape.types'

@Component({
  selector: 'shape-geometry-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'data-bc-placement-pick-ignore': '',
  },
  template: `
    <svg
      #overlay
      class="shape-geometry-editor__overlay"
      [attr.viewBox]="viewBox"
      preserveAspectRatio="none"
      aria-hidden="true">
      @for (line of controlLines; track line.id) {
        <line
          [attr.data-control-line-id]="line.id"
          [attr.x1]="line.x1"
          [attr.y1]="line.y1"
          [attr.x2]="line.x2"
          [attr.y2]="line.y2">
        </line>
      }
    </svg>
    @for (handle of handles; track handle.id) {
      <button
        type="button"
        class="shape-geometry-editor__handle"
        [class.shape-geometry-editor__handle--control]="handle.control"
        [attr.data-geometry-handle-id]="handle.id"
        [attr.aria-label]="handle.control ? '调整曲线控制点' : '调整形状端点'"
        [style.left.%]="handle.x / geometryWidth * 100"
        [style.top.%]="handle.y / geometryHeight * 100"
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

    .shape-geometry-editor__overlay {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: visible;
      pointer-events: none;
    }

    .shape-geometry-editor__overlay line {
      stroke: var(--bc-active-color, #4857e2);
      stroke-width: 1;
      stroke-dasharray: 4 3;
      vector-effect: non-scaling-stroke;
      opacity: 0.7;
    }

    .shape-geometry-editor__handle {
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

    .shape-geometry-editor__handle--control {
      width: 10px;
      height: 10px;
      border-width: 1px;
      border-color: var(--bc-active-color, #4857e2);
      border-radius: 2px;
    }
  `],
})
export class ShapeGeometryEditorComponent implements OnDestroy {
  @ViewChild('overlay', {read: ElementRef})
  private readonly overlay?: ElementRef<SVGSVGElement>

  @Input({required: true}) targetSvg!: Element
  @Input({required: true}) shapeType!: ShapeKind
  @Output() geometryCommit = new EventEmitter<CustomShapeGeometry>()

  private _geometry!: CustomShapeGeometry
  private _working!: CustomShapeGeometry
  private _activeHandle: ShapeGeometryHandle | null = null
  private _activePointerId: number | null = null
  private _originalPathData: string[] = []
  private _pendingPointer: PointerEvent | null = null
  private _raf = 0

  handles: ShapeGeometryHandle[] = []
  controlLines: ShapeGeometryControlLine[] = []

  constructor(
    private readonly cdr: ChangeDetectorRef,
    private readonly ngZone: NgZone,
  ) {}

  @Input({required: true})
  set geometry(value: CustomShapeGeometry) {
    if (this._activePointerId !== null) return
    const normalized = normalizeCustomShapeGeometry(value)
    if (!normalized) return
    this._geometry = cloneCustomShapeGeometry(normalized)
    this._working = cloneCustomShapeGeometry(normalized)
    this._refreshProjection()
  }

  get geometryWidth(): number {
    return this._working?.width ?? 1
  }

  get geometryHeight(): number {
    return this._working?.height ?? 1
  }

  get viewBox(): string {
    return `0 0 ${this.geometryWidth} ${this.geometryHeight}`
  }

  onPointerDown(event: PointerEvent, handle: ShapeGeometryHandle): void {
    if (event.button !== 0 || this._activePointerId !== null) return
    event.preventDefault()
    event.stopPropagation()
    this._activePointerId = event.pointerId
    this._activeHandle = handle
    this._working = cloneCustomShapeGeometry(this._geometry)
    this._originalPathData = Array.from(
      this.targetSvg.querySelectorAll<SVGPathElement>(
        '[data-bc-shape-render-path]',
      ),
    ).map(path => path.getAttribute('d') ?? '')
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
    const committed = normalizeCustomShapeGeometry(this._working)
    this._cancel(true)
    if (!committed) return
    this._geometry = cloneCustomShapeGeometry(committed)
    this._working = cloneCustomShapeGeometry(committed)
    this._refreshProjection()
    this.ngZone.run(() => this.geometryCommit.emit(committed))
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
    if (!this._activeHandle || !this.overlay) return
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
    const x = Math.max(0, Math.min(this.geometryWidth, local.x))
    const y = Math.max(0, Math.min(this.geometryHeight, local.y))
    this._working = updateShapeGeometryHandle(
      this._working,
      this._activeHandle,
      Math.round(x * 1000) / 1000,
      Math.round(y * 1000) / 1000,
    )
    this._renderTargetPreview()
    this._updateOverlayDom()
  }

  private _renderTargetPreview(): void {
    const definition = getShapeDefinition(this.shapeType)
    const resolved = resolveShapeRenderGeometry(
      this.shapeType,
      definition,
      this._working,
    )
    const targets = this.targetSvg.querySelectorAll<SVGPathElement>(
      '[data-bc-shape-render-path]',
    )
    resolved.paths.forEach((path, index) => {
      targets[index]?.setAttribute('d', path.d)
    })
  }

  private _updateOverlayDom(): void {
    const projection = getShapeGeometryHandles(this._working)
    const handles = new Map(projection.handles.map(handle => [handle.id, handle]))
    for (const button of Array.from(
      this.overlay?.nativeElement.parentElement?.querySelectorAll<HTMLElement>(
        '[data-geometry-handle-id]',
      ) ?? [],
    )) {
      const handle = handles.get(button.dataset['geometryHandleId'] ?? '')
      if (!handle) continue
      button.style.left = `${handle.x / this.geometryWidth * 100}%`
      button.style.top = `${handle.y / this.geometryHeight * 100}%`
    }
    const lines = new Map(projection.controlLines.map(line => [line.id, line]))
    for (const lineElement of Array.from(
      this.overlay?.nativeElement.querySelectorAll<SVGLineElement>(
        '[data-control-line-id]',
      ) ?? [],
    )) {
      const line = lines.get(lineElement.dataset['controlLineId'] ?? '')
      if (!line) continue
      lineElement.setAttribute('x1', `${line.x1}`)
      lineElement.setAttribute('y1', `${line.y1}`)
      lineElement.setAttribute('x2', `${line.x2}`)
      lineElement.setAttribute('y2', `${line.y2}`)
    }
  }

  private _refreshProjection(): void {
    if (!this._working) return
    const projection = getShapeGeometryHandles(this._working)
    this.handles = projection.handles
    this.controlLines = projection.controlLines
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
    if (!keepPreview && this.targetSvg) {
      const targets = this.targetSvg.querySelectorAll<SVGPathElement>(
        '[data-bc-shape-render-path]',
      )
      this._originalPathData.forEach((d, index) => {
        targets[index]?.setAttribute('d', d)
      })
      if (this._geometry) {
        this._working = cloneCustomShapeGeometry(this._geometry)
        this._refreshProjection()
      }
    }
    this._activePointerId = null
    this._activeHandle = null
    this._originalPathData = []
  }
}
