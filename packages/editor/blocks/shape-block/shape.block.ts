import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  NgZone,
  ViewChild,
} from '@angular/core'
import {
  BaseBlockComponent,
  colorWithOpacity,
  normalizeBlockObjectFormat,
  objectEffectsFilter,
  objectLineArrowPath,
  objectLineDasharray,
  objectPaintBackgroundPosition,
  objectPaintBackgroundSize,
  objectTextTransformCss,
  objectPicturePreserveAspectRatio,
} from '../../framework'
import {getShapeDefinition} from './shape-definitions'
import {resolveShapeAdjustmentProjection} from './shape-adjustments'
import {
  createDefaultEditableShapeGeometry,
  normalizeCustomShapeGeometry,
  resolveShapeRenderGeometry,
  serializeCustomShapeGeometry,
} from './shape-geometry'
import {
  createEditableShapeGeometryFromDefinition,
} from './shape-path-parser'
import {
  normalizeShapeProps,
  normalizeShapeRotation,
  resolveShapeFillGradient,
  SHAPE_OBJECT_FORMAT_CAPABILITY,
  shapeGradientToSvgVector,
  type CustomShapeGeometry,
  type NormalizedShapeBlockProps,
  type ShapeBlockProps,
  type ShapeAdjustmentValues,
} from './shape.types'
import type {ShapeBlockModel} from './index'
import {
  ShapeAdjustmentEditorComponent,
} from './shape-adjustment-editor.component'
import {ShapeGeometryEditorComponent} from './shape-geometry-editor.component'
import {
  ShapeResizerComponent,
  preserveResizeAspectRatio,
  type ShapeRotateCommit,
  type ShapeResizeCommit,
} from './shape-resizer.component'

const shapeRotationTransform = (rotation: unknown): string => {
  const normalized = normalizeShapeRotation(rotation)
  return normalized === 0 ? '' : `rotate(${normalized}deg)`
}

@Component({
  selector: 'div.shape-block',
  standalone: true,
  imports: [
    ShapeAdjustmentEditorComponent,
    ShapeGeometryEditorComponent,
    ShapeResizerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      #shapeShell
      class="shape-block__shell"
      data-bc-print-visual-surface
      data-bc-object-surface
      contenteditable="false"
      [style.width.px]="shapeProps.width"
      [style.height.px]="shapeProps.height"
      [style.transform]="rotationTransform"
      (dblclick)="onEditText($event)">
      <svg
        #shapeGeometry
        class="shape-block__geometry"
        [attr.viewBox]="renderGeometry.viewBox"
        preserveAspectRatio="none"
        aria-hidden="true">
        <defs>
        @if (fillGradient; as gradient) {
            <linearGradient
              [attr.id]="fillGradientId"
              [attr.x1]="gradient.vector.x1"
              [attr.y1]="gradient.vector.y1"
              [attr.x2]="gradient.vector.x2"
              [attr.y2]="gradient.vector.y2">
              @for (stop of gradient.stopList; track $index) {
                <stop
                  [attr.offset]="stop.offset"
                  [attr.stop-color]="stop.color"
                  [attr.stop-opacity]="stop.opacity">
                </stop>
              }
            </linearGradient>
        }
          @if (shapeFormat.shapeFill?.type === 'picture') {
            <pattern
              [attr.id]="pictureFillId"
              width="1"
              height="1"
              patternContentUnits="objectBoundingBox">
              <image
                x="0"
                y="0"
                width="1"
                height="1"
                [attr.href]="pictureFillSrc"
                [attr.preserveAspectRatio]="picturePreserveAspectRatio">
              </image>
            </pattern>
          }
          @if (shapeFormat.shapeOutline?.startArrow !== 'none') {
            <marker [attr.id]="startMarkerId" viewBox="0 0 10 10" refX="9" refY="5"
              markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path [attr.d]="arrowPath(shapeFormat.shapeOutline!.startArrow)"
                [attr.fill]="shapeFormat.shapeOutline?.color"></path>
            </marker>
          }
          @if (shapeFormat.shapeOutline?.endArrow !== 'none') {
            <marker [attr.id]="endMarkerId" viewBox="0 0 10 10" refX="9" refY="5"
              markerWidth="7" markerHeight="7" orient="auto">
              <path [attr.d]="arrowPath(shapeFormat.shapeOutline!.endArrow)"
                [attr.fill]="shapeFormat.shapeOutline?.color"></path>
            </marker>
          }
        </defs>
        @for (path of renderGeometry.paths; track $index) {
          <path
            data-bc-shape-render-path
            [attr.d]="path.d"
            [attr.fill]="path.fillable ? fillPaint : 'none'"
            [attr.fill-opacity]="shapeFillOpacity"
            [attr.fill-rule]="path.fillable ? renderGeometry.fillRule ?? null : null"
            [attr.stroke]="shapeStroke"
            [attr.stroke-opacity]="shapeFormat.shapeOutline?.opacity"
            [attr.stroke-width]="shapeFormat.shapeOutline?.width"
            [attr.stroke-dasharray]="strokeDasharray"
            [attr.stroke-linecap]="shapeFormat.shapeOutline?.cap"
            [attr.stroke-linejoin]="shapeFormat.shapeOutline?.join"
            [attr.marker-start]="startMarkerUrl"
            [attr.marker-end]="endMarkerUrl"
            [style.filter]="shapeEffectsFilter"
            vector-effect="non-scaling-stroke">
          </path>
        }
      </svg>

      <div
        #shapeTextFrame
        class="shape-block__text-frame children-render-container"
        [class.shape-block__text-frame--uniform-paint]="usesUniformTextPaint"
        [hidden]="definition.supportsText === false"
        [style.top]="textInset('top')"
        [style.right]="textInset('right')"
        [style.bottom]="textInset('bottom')"
        [style.left]="textInset('left')"
        [style.color]="shapeProps.textColor"
        [style.-webkit-text-fill-color]="textPaintColor"
        [style.background-image]="textPaintBackground"
        [style.background-size]="textPaintBackgroundSize"
        [style.background-position]="textPaintBackgroundPosition"
        [style.background-clip]="'text'"
        [style.-webkit-background-clip]="'text'"
        [style.-webkit-text-stroke]="textStroke"
        [style.text-align]="shapeProps.shapeTextAlign"
        [style.justify-content]="verticalJustify"
        [style.writing-mode]="textWritingMode"
        [style.font-family]="shapeFormat.textStyle?.fontFamily"
        [style.font-size.px]="shapeFormat.textStyle?.fontSize"
        [style.font-weight]="shapeFormat.textStyle?.fontWeight"
        [style.font-style]="shapeFormat.textStyle?.fontStyle"
        [style.letter-spacing.em]="shapeFormat.textStyle?.letterSpacingEm"
        [style.line-height]="shapeFormat.textStyle?.lineHeight"
        [style.white-space]="shapeFormat.textFrame?.wrap ? null : 'nowrap'"
        [style.filter]="textEffectsFilter"
        [style.opacity]="textPictureOpacity"
        [style.transform]="textTransform">
      </div>

      @if (!isReadonly) {
        <shape-resizer
          [target]="shapeShell"
          [maxWidthContainer]="placementContainer"
          [maxWidthResolver]="objectMaxWidthResolver"
          [rotation]="shapeProps.rotation"
          (resizeCommit)="onResizeCommit($event)"
          (rotateCommit)="onRotateCommit($event)">
        </shape-resizer>
        @if (editableGeometry) {
          <shape-geometry-editor
            [targetSvg]="shapeGeometry"
            [shapeType]="shapeProps.shapeType"
            [geometry]="editableGeometry"
            (geometryCommit)="onGeometryCommit($event)">
          </shape-geometry-editor>
        }
        @if (hasAdjustmentEditor) {
          <shape-adjustment-editor
            [targetSvg]="shapeGeometry"
            [shapeType]="shapeProps.shapeType"
            [adjustments]="shapeProps.adjustments"
            (adjustmentsCommit)="onAdjustmentsCommit($event)">
          </shape-adjustment-editor>
        }
      }
    </div>
  `,
  styles: [`
    /* 宽度契约（流内收敛到内容列、浮动不设上限）由 base.scss 按
       data-bc-object / data-bc-object-surface 统一实施，这里不再写 max-width。 */
    :host {
      display: block;
      width: fit-content;
      background: transparent !important;
    }

    :host(.selected) shape-resizer {
      display: block;
    }

    :host(.selected) shape-geometry-editor {
      display: block;
    }

    :host(.selected) shape-adjustment-editor {
      display: block;
    }

    .shape-block__shell {
      position: relative;
      box-sizing: border-box;
      transform-origin: center center;
      touch-action: none;
    }

    .shape-block__geometry {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: visible;
      pointer-events: none;
    }

    .shape-block__text-frame {
      position: absolute;
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      pointer-events: auto;
    }

    .shape-block__text-frame ::ng-deep > .shape-text-block {
      width: 100%;
      max-height: 100%;
      margin: 0;
      border: 0;
      outline: 0;
      overflow: auto;
      box-shadow: none;
      background: transparent;
      color: inherit;
      text-align: inherit;
      user-select: text;
      -webkit-user-select: text;
    }

    .shape-block__text-frame--uniform-paint ::ng-deep [data-node-type="editable"],
    .shape-block__text-frame--uniform-paint ::ng-deep [data-node-type="editable"] * {
      color: inherit !important;
      -webkit-text-fill-color: inherit !important;
      background-color: transparent !important;
      -webkit-text-stroke: inherit !important;
      text-shadow: inherit !important;
    }
  `],
})
export class ShapeBlockComponent extends BaseBlockComponent<ShapeBlockModel> {
  private readonly _ngZone = inject(NgZone)

  @ViewChild('shapeShell', {read: ElementRef})
  private readonly _shapeShell?: ElementRef<HTMLElement>

  @ViewChild('shapeGeometry', {read: ElementRef})
  private readonly _shapeGeometry?: ElementRef<SVGSVGElement>

  @ViewChild('shapeTextFrame', {read: ElementRef})
  private readonly _shapeTextFrame?: ElementRef<HTMLElement>
  private _autoFitObserver?: MutationObserver
  private _autoFitFrame: number | null = null

  override ngAfterViewInit(): void {
    super.ngAfterViewInit()
    const content = this._shapeTextFrame?.nativeElement
    const ownerWindow = content?.ownerDocument.defaultView
    if (!content || !ownerWindow?.MutationObserver) return
    this._ngZone.runOutsideAngular(() => {
      this._autoFitObserver = new ownerWindow.MutationObserver(() =>
        this._scheduleAutoFit(),
      )
      this._autoFitObserver.observe(content, {
        childList: true,
        characterData: true,
        subtree: true,
      })
    })
    this.onDestroy$.subscribe(() => {
      this._autoFitObserver?.disconnect()
      this._autoFitObserver = undefined
      if (this._autoFitFrame !== null) {
        ownerWindow.cancelAnimationFrame(this._autoFitFrame)
      }
      this._autoFitFrame = null
    })
    this._scheduleAutoFit()
  }

  get shapeProps(): NormalizedShapeBlockProps {
    return normalizeShapeProps(this.props)
  }

  get definition() {
    return getShapeDefinition(this.shapeProps.shapeType)
  }

  get shapeFormat() {
    return normalizeBlockObjectFormat(this.props, SHAPE_OBJECT_FORMAT_CAPABILITY)
  }

  get renderGeometry() {
    return resolveShapeRenderGeometry(
      this.shapeProps.shapeType,
      this.definition,
      this.customGeometry,
      this.shapeProps.adjustments,
    )
  }

  get customGeometry(): CustomShapeGeometry | undefined {
    return normalizeCustomShapeGeometry(this.shapeProps.customGeometry)
  }

  get editableGeometry(): CustomShapeGeometry | undefined {
    if (this.isReadonly) return undefined
    if (this.customGeometry) return this.customGeometry
    if (resolveShapeAdjustmentProjection(
      this.shapeProps.shapeType,
      this.shapeProps.adjustments,
    )) return undefined
    return createDefaultEditableShapeGeometry(this.shapeProps.shapeType) ??
      createEditableShapeGeometryFromDefinition(this.definition)
  }

  get hasAdjustmentEditor(): boolean {
    return !this.isReadonly && !this.customGeometry &&
      !!resolveShapeAdjustmentProjection(
      this.shapeProps.shapeType,
      this.shapeProps.adjustments,
    )
  }

  get strokeDasharray(): string | null {
    return objectLineDasharray(this.shapeFormat.shapeOutline!)
  }

  /** SVG 渐变 def 的 id 以 block id 收尾，保证同文档多形状互不串用。 */
  get fillGradientId(): string {
    return `bc-shape-fill-${this.id}`
  }

  get pictureFillId(): string {
    return `bc-shape-picture-${this.id}`
  }

  get startMarkerId(): string { return `bc-shape-arrow-start-${this.id}` }
  get endMarkerId(): string { return `bc-shape-arrow-end-${this.id}` }
  get startMarkerUrl(): string | null {
    return this.shapeFormat.shapeOutline!.startArrow === 'none'
      ? null
      : `url(#${this.startMarkerId})`
  }
  get endMarkerUrl(): string | null {
    return this.shapeFormat.shapeOutline!.endArrow === 'none'
      ? null
      : `url(#${this.endMarkerId})`
  }

  arrowPath(type: 'none' | 'triangle' | 'stealth' | 'diamond' | 'oval'): string {
    return objectLineArrowPath(type)
  }

  get fillGradient(): {
    vector: ReturnType<typeof shapeGradientToSvgVector>
    stopList: Array<{color: string; offset: number; opacity: number}>
  } | null {
    const gradient = resolveShapeFillGradient(this.shapeProps)
    if (!gradient) return null
    return {
      vector: shapeGradientToSvgVector(gradient.angle),
      stopList: gradient.colors.map((color, index) => ({
        color,
        offset: gradient.stops[index],
        opacity: this.shapeFormat.shapeFill!.type === 'linear-gradient'
          ? this.shapeFormat.shapeFill!.stops[index]?.opacity ?? 1
          : 1,
      })),
    }
  }

  get fillPaint(): string {
    const fill = this.shapeFormat.shapeFill!
    if (fill.type === 'none') return 'none'
    if (fill.type === 'linear-gradient') return `url(#${this.fillGradientId})`
    if (fill.type === 'picture') return `url(#${this.pictureFillId})`
    return fill.color
  }

  get shapeStroke(): string {
    const line = this.shapeFormat.shapeOutline!
    return line.type === 'none' ? 'none' : line.color
  }

  get shapeEffectsFilter(): string | null {
    return objectEffectsFilter(this.shapeFormat.shapeEffects!) || null
  }

  get textEffectsFilter(): string | null {
    return objectEffectsFilter(this.shapeFormat.textStyle!.effects) || null
  }

  get picturePreserveAspectRatio(): string {
    const fill = this.shapeFormat.shapeFill!
    return fill.type === 'picture'
      ? objectPicturePreserveAspectRatio(fill)
      : 'none'
  }

  get pictureFillSrc(): string | null {
    const fill = this.shapeFormat.shapeFill!
    return fill.type === 'picture' ? fill.src : null
  }

  get shapeFillOpacity(): number {
    const fill = this.shapeFormat.shapeFill!
    return fill.type === 'none' ? 0 : fill.opacity
  }

  get textWritingMode(): string {
    const direction = this.shapeFormat.textFrame!.direction
    return direction === 'vertical-rl' ? 'vertical-rl' : 'horizontal-tb'
  }

  get textTransform(): string | null {
    const frame = this.shapeFormat.textFrame!
    const transforms: string[] = []
    if (frame.direction === 'rotate-90') transforms.push('rotate(90deg)')
    if (frame.direction === 'rotate-270') transforms.push('rotate(270deg)')
    if (!frame.rotateWithShape && this.shapeProps.rotation) {
      transforms.push(`rotate(${-this.shapeProps.rotation}deg)`)
    }
    const transform = objectTextTransformCss(this.shapeFormat.textStyle!.transform)
    if (transform) transforms.push(transform)
    return transforms.join(' ') || null
  }

  get usesUniformTextPaint(): boolean {
    const style = this.shapeFormat.textStyle!
    return style.fill.type !== 'solid' || style.outline.type !== 'none' ||
      style.effects.shadow.enabled || style.effects.glow.enabled ||
      style.transform !== 'none'
  }

  get textPaintColor(): string {
    const fill = this.shapeFormat.textStyle!.fill
    return fill.type === 'solid'
      ? colorWithOpacity(fill.color, fill.opacity)
      : 'transparent'
  }

  get textPaintBackground(): string | null {
    const fill = this.shapeFormat.textStyle!.fill
    if (fill.type === 'picture' && fill.src) {
      return `url("${fill.src.replace(/["\\]/g, '\\$&')}")`
    }
    if (fill.type !== 'linear-gradient') return null
    const stops = fill.stops.map(stop =>
      `${colorWithOpacity(
        stop.color,
        stop.opacity * fill.opacity,
      )} ${stop.offset * 100}%`,
    )
    return `linear-gradient(${fill.angle}deg, ${stops.join(', ')})`
  }

  get textPictureOpacity(): number | null {
    const fill = this.shapeFormat.textStyle!.fill
    return fill.type === 'picture' ? fill.opacity : null
  }

  get textPaintBackgroundSize(): string {
    const fill = this.shapeFormat.textStyle!.fill
    return fill.type === 'picture' ? objectPaintBackgroundSize(fill) : 'auto'
  }

  get textPaintBackgroundPosition(): string {
    const fill = this.shapeFormat.textStyle!.fill
    return fill.type === 'picture'
      ? objectPaintBackgroundPosition(fill)
      : '0% 0%'
  }

  get textStroke(): string {
    const line = this.shapeFormat.textStyle!.outline
    return line.type === 'none' ? '0 transparent' : `${line.width}px ${line.color}`
  }

  textInset(side: 'top' | 'right' | 'bottom' | 'left'): string {
    const index = {top: 0, right: 1, bottom: 2, left: 3}[side]
    const inherent = this.definition.textInsets[side] * 100
    const margin = this.shapeFormat.textFrame!.margins[index]
    return `calc(${inherent}% + ${margin}px)`
  }

  private _scheduleAutoFit(): void {
    if (this._autoFitFrame !== null || this.isReadonly) return
    const content = this._shapeTextFrame?.nativeElement
    const ownerWindow = content?.ownerDocument.defaultView
    if (!content || !ownerWindow) return
    this._autoFitFrame = ownerWindow.requestAnimationFrame(() => {
      this._autoFitFrame = null
      const frame = this.shapeFormat.textFrame!
      if (frame.autoFit !== 'resize-shape') return
      const vertical = frame.direction === 'vertical-rl'
      const overflow = vertical
        ? content.scrollWidth - content.clientWidth
        : content.scrollHeight - content.clientHeight
      if (!Number.isFinite(overflow) || overflow <= .5) return
      const current = this.shapeProps
      this.doc.placement.updateObjectGeometry(this, vertical
        ? {width: Math.ceil(current.width + overflow)}
        : {height: Math.ceil(current.height + overflow)})
    })
  }

  get verticalJustify(): 'flex-start' | 'center' | 'flex-end' {
    if (this.shapeProps.verticalAlign === 'top') return 'flex-start'
    if (this.shapeProps.verticalAlign === 'bottom') return 'flex-end'
    return 'center'
  }

  get rotationTransform(): string {
    return shapeRotationTransform(this.shapeProps.rotation)
  }

  onEditText(event: MouseEvent): void {
    if (this.isReadonly || this.definition?.supportsText === false) return
    event.preventDefault()
    event.stopPropagation()
    const textBlock = this.firstChildren as
      BlockCraft.IBlockComponents['shape-text'] | null
    if (!textBlock) {
      const snapshot = this.doc.schemas.createSnapshot('shape-text', [])
      void this.doc.chain()
        .insertSnapshots(this.id, 0, [snapshot])
        .selectOrSetCursorAtBlock(snapshot.id, true)
        .run()
      return
    }
    if (textBlock.flavour !== 'shape-text') return
    textBlock.setInlineRange(textBlock.textContent().length)
  }

  onResizeCommit(event: ShapeResizeCommit): void {
    if (this.isReadonly) return
    const current = this.shapeProps
    event = this.shapeFormat.lockAspectRatio
      ? preserveResizeAspectRatio(event, current.width, current.height)
      : event
    const next: Partial<ShapeBlockProps> = {
      width: Math.round(event.width),
      height: Math.round(event.height),
    }

    const placement = this.doc.placement?.getState?.(this.id) ?? {
      mode: 'relative' as const,
      x: 0,
      y: 0,
      layer: 'over' as const,
    }
    if (placement.mode === 'absolute') {
      next.position = {
        x: placement.x + event.offsetX,
        y: placement.y + event.offsetY,
      }
    }
    this.doc.placement.updateObjectGeometry(this, next)
    const shell = this._shapeShell?.nativeElement
    if (shell) {
      shell.style.transform = shapeRotationTransform(current.rotation)
    }
  }

  onRotateCommit(event: ShapeRotateCommit): void {
    if (this.isReadonly) return
    this.doc.placement.updateObjectGeometry(this, {rotation: event.rotation})
    const shell = this._shapeShell?.nativeElement
    if (shell) {
      shell.style.transform = shapeRotationTransform(event.rotation)
    }
  }

  onGeometryCommit(geometry: CustomShapeGeometry): void {
    if (this.isReadonly) return
    const serialized = serializeCustomShapeGeometry(geometry)
    if (!serialized) return
    this.doc.placement.updateObjectGeometry(this, {customGeometry: serialized})
    const svg = this._shapeGeometry?.nativeElement
    if (svg) svg.setAttribute('viewBox', `0 0 ${geometry.width} ${geometry.height}`)
  }

  onAdjustmentsCommit(adjustments: ShapeAdjustmentValues): void {
    if (this.isReadonly) return
    this.doc.placement.updateObjectGeometry(this, {adjustments})
  }
}
