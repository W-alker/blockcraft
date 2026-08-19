import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  NgZone,
  OnDestroy,
  Output,
} from '@angular/core'
import {normalizeShapeRotation} from './shape.types'

export type ShapeResizeHandle =
  | 'north-west'
  | 'north'
  | 'north-east'
  | 'east'
  | 'south-east'
  | 'south'
  | 'south-west'
  | 'west'

type ShapeMoveEdge = 'north' | 'east' | 'south' | 'west'

export interface ShapeResizeBox {
  width: number
  height: number
  offsetX: number
  offsetY: number
}

export interface ShapeResizeCommit extends ShapeResizeBox {
  handle: ShapeResizeHandle
}

export interface ShapeRotateCommit {
  rotation: number
}

export interface ShapeVector {
  x: number
  y: number
}

export type ShapeResizeCalculator = (
  handle: ShapeResizeHandle,
  start: ShapeResizeBox,
  deltaX: number,
  deltaY: number,
  maxWidth?: number,
) => ShapeResizeBox

const MIN_WIDTH = 48
const MIN_HEIGHT = 32
const ROTATION_SNAP_DEGREES = 15

export function rotateShapeVector(
  vector: ShapeVector,
  degrees: number,
): ShapeVector {
  const radians = (degrees * Math.PI) / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  return {
    x: vector.x * cosine - vector.y * sine,
    y: vector.x * sine + vector.y * cosine,
  }
}

export function calculateShapeRotation(
  startRotation: number,
  startPointerAngle: number,
  currentPointerAngle: number,
  snap = false,
): number {
  const delta = ((currentPointerAngle - startPointerAngle + 540) % 360) - 180
  const rotation = normalizeShapeRotation(startRotation + delta)
  return snap
    ? normalizeShapeRotation(
        Math.round(rotation / ROTATION_SNAP_DEGREES) * ROTATION_SNAP_DEGREES,
      )
    : rotation
}

export function calculateShapeResize(
  handle: ShapeResizeHandle,
  start: ShapeResizeBox,
  deltaX: number,
  deltaY: number,
  maxWidth = Number.POSITIVE_INFINITY,
): ShapeResizeBox {
  const west = handle.includes('west')
  const east = handle.includes('east')
  const north = handle.includes('north')
  const south = handle.includes('south')

  let width = start.width + (east ? deltaX : west ? -deltaX : 0)
  let height = start.height + (south ? deltaY : north ? -deltaY : 0)
  const effectiveMaxWidth = Number.isFinite(maxWidth)
    ? Math.max(MIN_WIDTH, maxWidth)
    : Number.POSITIVE_INFINITY
  width = Math.min(effectiveMaxWidth, Math.max(MIN_WIDTH, width))
  height = Math.max(MIN_HEIGHT, height)

  return {
    width,
    height,
    offsetX: start.offsetX + (west ? start.width - width : 0),
    offsetY: start.offsetY + (north ? start.height - height : 0),
  }
}

@Component({
  selector: 'shape-resizer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'data-bc-placement-pick-ignore': '',
  },
  template: `
    @if (borderDraggable) {
      @for (edge of moveEdges; track edge) {
        <span
          class="shape-resizer__move-edge"
          [attr.data-move-edge]="edge"
          contenteditable="false"
          aria-hidden="true"
        >
        </span>
      }
    }
    @for (handle of handles; track handle) {
      <button
        type="button"
        class="shape-resizer__handle"
        [attr.data-handle]="handle"
        [attr.aria-label]="handle"
        contenteditable="false"
        (pointerdown)="onPointerDown($event, handle)"
      ></button>
    }
    <span class="shape-resizer__rotation-stem" aria-hidden="true"></span>
    <button
      type="button"
      class="shape-resizer__rotate"
      [attr.aria-label]="rotationLabel"
      contenteditable="false"
      (pointerdown)="onRotatePointerDown($event)"
    ></button>
  `,
  styles: [
    `
      :host {
        position: absolute;
        inset: 0;
        z-index: 4;
        display: none;
        pointer-events: none;
        outline: 2px solid var(--bc-active-color, #4857e2);
        outline-offset: 2px;
      }

      .shape-resizer__handle {
        position: absolute;
        z-index: 2;
        width: 10px;
        height: 10px;
        padding: 0;
        border: 1px solid var(--bc-active-color, #4857e2);
        border-radius: 2px;
        background: var(--bc-bg-primary, #fff);
        pointer-events: auto;
        touch-action: none;
      }

      .shape-resizer__move-edge {
        position: absolute;
        z-index: 1;
        display: block;
        pointer-events: auto;
        touch-action: none;
        cursor: move;
      }

      .shape-resizer__move-edge[data-move-edge='north'] {
        top: -4px;
        right: -4px;
        left: -4px;
        height: 8px;
      }

      .shape-resizer__move-edge[data-move-edge='east'] {
        top: -4px;
        right: -4px;
        bottom: -4px;
        width: 8px;
      }

      .shape-resizer__move-edge[data-move-edge='south'] {
        right: -4px;
        bottom: -4px;
        left: -4px;
        height: 8px;
      }

      .shape-resizer__move-edge[data-move-edge='west'] {
        top: -4px;
        bottom: -4px;
        left: -4px;
        width: 8px;
      }

      [data-handle='north-west'] {
        top: -7px;
        left: -7px;
        cursor: nwse-resize;
      }
      [data-handle='north'] {
        top: -7px;
        left: 50%;
        transform: translateX(-50%);
        cursor: ns-resize;
      }
      [data-handle='north-east'] {
        top: -7px;
        right: -7px;
        cursor: nesw-resize;
      }
      [data-handle='east'] {
        top: 50%;
        right: -7px;
        transform: translateY(-50%);
        cursor: ew-resize;
      }
      [data-handle='south-east'] {
        right: -7px;
        bottom: -7px;
        cursor: nwse-resize;
      }
      [data-handle='south'] {
        bottom: -7px;
        left: 50%;
        transform: translateX(-50%);
        cursor: ns-resize;
      }
      [data-handle='south-west'] {
        bottom: -7px;
        left: -7px;
        cursor: nesw-resize;
      }
      [data-handle='west'] {
        top: 50%;
        left: -7px;
        transform: translateY(-50%);
        cursor: ew-resize;
      }

      .shape-resizer__rotation-stem {
        position: absolute;
        top: -29px;
        left: 50%;
        width: 1px;
        height: 21px;
        background: var(--bc-active-color, #4857e2);
        transform: translateX(-50%);
        pointer-events: none;
      }

      .shape-resizer__rotate {
        position: absolute;
        z-index: 2;
        top: -42px;
        left: 50%;
        width: 13px;
        height: 13px;
        padding: 0;
        border: 1px solid var(--bc-active-color, #4857e2);
        border-radius: 50%;
        background: var(--bc-bg-primary, #fff);
        transform: translateX(-50%);
        pointer-events: auto;
        touch-action: none;
        cursor: grab;
      }

      .shape-resizer__rotate:active {
        cursor: grabbing;
      }
    `,
  ],
})
export class ShapeResizerComponent implements OnDestroy {
  @Input({required: true}) target!: HTMLElement
  @Input() previewMirror?: HTMLElement
  @Input() maxWidthContainer?: HTMLElement
  /**
   * 拉伸宽度上限求值器（layout px）。手势开始时求值一次：它要读布局，既不能
   * 进变更检测路径，也不该在每次 pointermove 里重算。返回 null 表示不设上限
   * （浮动对象的宽度完全归用户）；未绑定求值器时退回容器 clientWidth。
   */
  @Input() maxWidthResolver?: () => number | null
  @Input() rotation = 0
  @Input() rotationLabel = '旋转形状'
  @Input() borderDraggable = false
  @Input() resizeCalculator: ShapeResizeCalculator = calculateShapeResize
  @Output() resizeCommit = new EventEmitter<ShapeResizeCommit>()
  @Output() rotateCommit = new EventEmitter<ShapeRotateCommit>()

  readonly handles: readonly ShapeResizeHandle[] = [
    'north-west',
    'north',
    'north-east',
    'east',
    'south-east',
    'south',
    'south-west',
    'west',
  ]
  readonly moveEdges: readonly ShapeMoveEdge[] = [
    'north',
    'east',
    'south',
    'west',
  ]

  private _activeGesture:
    | {kind: 'resize'; handle: ShapeResizeHandle}
    | {kind: 'rotate'}
    | null = null
  private _activePointerId: number | null = null
  private _startClientX = 0
  private _startClientY = 0
  private _startRotation = 0
  private _startCenter: ShapeVector | null = null
  private _startPointerAngle = 0
  private _gestureVisualScale = 1
  private _gestureMaxWidth = Number.POSITIVE_INFINITY
  private _startBox: ShapeResizeBox | null = null
  private _previewBox: ShapeResizeBox | null = null
  private _previewRotation: number | null = null
  private _startInlineStyle: {
    width: string
    height: string
    transform: string
    fontSize: string
  } | null = null
  private _startMirrorInlineStyle: {
    width: string
    height: string
    transform: string
  } | null = null
  private _raf = 0
  private _pendingPointer: PointerEvent | null = null

  constructor(private readonly ngZone: NgZone) {}

  onPointerDown(event: PointerEvent, handle: ShapeResizeHandle): void {
    this._beginGesture(event, {kind: 'resize', handle})
  }

  onRotatePointerDown(event: PointerEvent): void {
    this._beginGesture(event, {kind: 'rotate'})
  }

  private _beginGesture(
    event: PointerEvent,
    gesture: {kind: 'resize'; handle: ShapeResizeHandle} | {kind: 'rotate'},
  ): void {
    if (event.button !== 0 || this._activePointerId != null) return
    event.preventDefault()
    event.stopPropagation()

    const rect = this.target.getBoundingClientRect()
    const inlineWidth = Number.parseFloat(this.target.style.width)
    const inlineHeight = Number.parseFloat(this.target.style.height)
    this._activePointerId = event.pointerId
    this._activeGesture = gesture
    this._startClientX = event.clientX
    this._startClientY = event.clientY
    const scaleContainer = this.maxWidthContainer
    const measuredScale = scaleContainer && scaleContainer.clientWidth > 0
      ? scaleContainer.getBoundingClientRect().width / scaleContainer.clientWidth
      : 1
    const resolvedMaxWidth = this.maxWidthResolver?.()
    this._gestureMaxWidth = resolvedMaxWidth === null
      ? Number.POSITIVE_INFINITY
      : typeof resolvedMaxWidth === 'number' &&
          Number.isFinite(resolvedMaxWidth) &&
          resolvedMaxWidth > 0
        ? resolvedMaxWidth
        : scaleContainer?.clientWidth ?? Number.POSITIVE_INFINITY
    this._gestureVisualScale = Number.isFinite(measuredScale) && measuredScale > 0
      ? measuredScale
      : 1
    this._startRotation = normalizeShapeRotation(this.rotation)
    this._startCenter = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    }
    this._startPointerAngle = this._pointerAngle(event)
    this._startBox = {
      width:
        Number.isFinite(inlineWidth) && inlineWidth > 0
          ? inlineWidth
          : this.target.offsetWidth || rect.width,
      height:
        Number.isFinite(inlineHeight) && inlineHeight > 0
          ? inlineHeight
          : this.target.offsetHeight || rect.height,
      offsetX: 0,
      offsetY: 0,
    }
    this._previewBox = this._startBox
    this._previewRotation = this._startRotation
    this._startInlineStyle = {
      width: this.target.style.width,
      height: this.target.style.height,
      transform: this.target.style.transform,
      fontSize: this.target.style.fontSize,
    }
    const previewMirror = this.previewMirror
    this._startMirrorInlineStyle = previewMirror
      ? {
          width: previewMirror.style.width,
          height: previewMirror.style.height,
          transform: previewMirror.style.transform,
        }
      : null

    const handleElement = event.currentTarget as HTMLElement
    handleElement.setPointerCapture?.(event.pointerId)

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
      const pointer = this._pendingPointer
      this._pendingPointer = null
      if (!pointer) return
      this._applyPointerPreview(pointer)
    })
  }

  private readonly _onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this._activePointerId) return
    event.preventDefault()
    const gesture = this._activeGesture
    if (!gesture) return
    // The final pointerup can arrive before the scheduled animation frame.
    // Calculate from its coordinates so a quick drag never commits the stale
    // start/previous frame state.
    if (gesture.kind === 'resize') {
      const result = this._calculateResizePreview(event) ?? this._previewBox
      if (result) this._applyResizePreview(result)
      this._cancel(true)
      if (!result) return
      this.ngZone.run(() => {
        this.resizeCommit.emit({...result, handle: gesture.handle})
      })
      return
    }

    const rotation =
      this._calculateRotationPreview(event) ?? this._previewRotation
    if (rotation != null) this._applyRotationPreview(rotation)
    this._cancel(false)
    if (rotation == null) return
    this.ngZone.run(() => {
      this.rotateCommit.emit({rotation})
    })
  }

  private readonly _onPointerCancel = (event: PointerEvent): void => {
    if (event.pointerId !== this._activePointerId) return
    this._cancel(false)
  }

  private readonly _onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || this._activePointerId == null) return
    event.preventDefault()
    event.stopPropagation()
    this._cancel(false)
  }

  private readonly _onWindowBlur = (): void => {
    if (this._activePointerId == null) return
    this._cancel(false)
  }

  private _cancel(keepResizePreview: boolean): void {
    window.removeEventListener('pointermove', this._onPointerMove, true)
    window.removeEventListener('pointerup', this._onPointerUp, true)
    window.removeEventListener('pointercancel', this._onPointerCancel, true)
    window.removeEventListener('keydown', this._onKeyDown, true)
    window.removeEventListener('blur', this._onWindowBlur, true)
    if (this._raf) cancelAnimationFrame(this._raf)
    this._raf = 0
    this._pendingPointer = null

    if (this.target && this._startInlineStyle) {
      if (!keepResizePreview) {
        this.target.style.width = this._startInlineStyle.width
        this.target.style.height = this._startInlineStyle.height
        this.target.style.fontSize = this._startInlineStyle.fontSize
      }
      this.target.style.transform = this._startInlineStyle.transform
    }
    if (this.previewMirror && this._startMirrorInlineStyle) {
      if (!keepResizePreview) {
        this.previewMirror.style.width = this._startMirrorInlineStyle.width
        this.previewMirror.style.height = this._startMirrorInlineStyle.height
      }
      this.previewMirror.style.transform =
        this._startMirrorInlineStyle.transform
    }
    this._activePointerId = null
    this._activeGesture = null
    this._startBox = null
    this._startCenter = null
    this._previewBox = null
    this._previewRotation = null
    this._startInlineStyle = null
    this._startMirrorInlineStyle = null
    this._gestureVisualScale = 1
    this._gestureMaxWidth = Number.POSITIVE_INFINITY
  }

  private _applyPointerPreview(event: PointerEvent): void {
    if (this._activeGesture?.kind === 'rotate') {
      const rotation = this._calculateRotationPreview(event)
      if (rotation == null) return
      this._previewRotation = rotation
      this._applyRotationPreview(rotation)
      return
    }

    const box = this._calculateResizePreview(event)
    if (!box) return
    this._previewBox = box
    this._applyResizePreview(box)
  }

  private _applyResizePreview(box: ShapeResizeBox): void {
    const translate = `translate(${Math.round(box.offsetX)}px, ${Math.round(box.offsetY)}px)`
    const transform =
      this._startRotation === 0
        ? translate
        : `${translate} rotate(${this._startRotation}deg)`
    this._applyPreviewStyle(
      `${Math.round(box.width)}px`,
      `${Math.round(box.height)}px`,
      transform,
    )
    this._applyScalableFontPreview(box)
  }

  private _applyScalableFontPreview(box: ShapeResizeBox): void {
    if (
      !this.target.hasAttribute('data-bc-scale-font-on-corner') ||
      !this._startBox ||
      !this._startInlineStyle ||
      this._activeGesture?.kind !== 'resize'
    ) {
      return
    }
    const handle = this._activeGesture.handle
    const isCorner =
      (handle.includes('east') || handle.includes('west')) &&
      (handle.includes('north') || handle.includes('south'))
    if (!isCorner) {
      this.target.style.fontSize = this._startInlineStyle.fontSize
      return
    }
    const inlineFontSize = Number.parseFloat(this._startInlineStyle.fontSize)
    const startFontSize = Number.isFinite(inlineFontSize)
      ? inlineFontSize
      : Number.parseFloat(getComputedStyle(this.target).fontSize)
    if (!Number.isFinite(startFontSize)) return
    const scale = box.width / Math.max(1, this._startBox.width)
    this.target.style.fontSize = `${startFontSize * scale}px`
  }

  private _applyRotationPreview(rotation: number): void {
    const transform = rotation === 0 ? '' : `rotate(${rotation}deg)`
    this.target.style.transform = transform
    if (this.previewMirror && this.previewMirror !== this.target) {
      this.previewMirror.style.transform = transform
    }
  }

  private _calculateResizePreview(event: PointerEvent): ShapeResizeBox | null {
    if (!this._startBox || this._activeGesture?.kind !== 'resize') return null
    const maxWidth = this._gestureMaxWidth
    const localDelta = rotateShapeVector(
      {
        x: (event.clientX - this._startClientX) / this._gestureVisualScale,
        y: (event.clientY - this._startClientY) / this._gestureVisualScale,
      },
      -this._startRotation,
    )
    const localBox = this.resizeCalculator(
      this._activeGesture.handle,
      this._startBox,
      localDelta.x,
      localDelta.y,
      maxWidth,
    )
    const globalOffset = rotateShapeVector(
      {
        x: localBox.offsetX,
        y: localBox.offsetY,
      },
      this._startRotation,
    )
    const keepsLayoutAnchor =
      this.target.getAttribute('data-bc-resize-preview-anchor') === 'layout'
    return {
      width: localBox.width,
      height: localBox.height,
      offsetX: keepsLayoutAnchor ? 0 : globalOffset.x,
      offsetY: keepsLayoutAnchor ? 0 : globalOffset.y,
    }
  }

  private _calculateRotationPreview(event: PointerEvent): number | null {
    if (this._activeGesture?.kind !== 'rotate' || !this._startCenter) {
      return null
    }
    return calculateShapeRotation(
      this._startRotation,
      this._startPointerAngle,
      this._pointerAngle(event),
      event.shiftKey,
    )
  }

  private _pointerAngle(event: PointerEvent): number {
    if (!this._startCenter) return 0
    return (
      (Math.atan2(
        event.clientY - this._startCenter.y,
        event.clientX - this._startCenter.x,
      ) *
        180) /
      Math.PI
    )
  }

  private _applyPreviewStyle(
    width: string,
    height: string,
    transform: string,
  ): void {
    this.target.style.width = width
    this.target.style.height = height
    this.target.style.transform = transform
    if (this.previewMirror && this.previewMirror !== this.target) {
      this.previewMirror.style.width = width
      this.previewMirror.style.height = height
      this.previewMirror.style.transform = transform
    }
  }
}
