import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
} from '@angular/core'
import {BaseBlockComponent} from '../../framework'
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
        @if (fillGradient; as gradient) {
          <defs>
            <linearGradient
              [attr.id]="fillGradientId"
              [attr.x1]="gradient.vector.x1"
              [attr.y1]="gradient.vector.y1"
              [attr.x2]="gradient.vector.x2"
              [attr.y2]="gradient.vector.y2">
              @for (stop of gradient.stopList; track $index) {
                <stop
                  [attr.offset]="stop.offset"
                  [attr.stop-color]="stop.color">
                </stop>
              }
            </linearGradient>
          </defs>
        }
        @for (path of renderGeometry.paths; track $index) {
          <path
            data-bc-shape-render-path
            [attr.d]="path.d"
            [attr.fill]="path.fillable ? fillPaint : 'none'"
            [attr.fill-opacity]="shapeProps.fillOpacity"
            [attr.fill-rule]="path.fillable ? renderGeometry.fillRule ?? null : null"
            [attr.stroke]="shapeProps.strokeColor"
            [attr.stroke-width]="shapeProps.strokeWidth"
            [attr.stroke-dasharray]="strokeDasharray"
            vector-effect="non-scaling-stroke">
          </path>
        }
      </svg>

      <div
        class="shape-block__text-frame children-render-container"
        [hidden]="definition.supportsText === false"
        [style.top.%]="definition.textInsets.top * 100"
        [style.right.%]="definition.textInsets.right * 100"
        [style.bottom.%]="definition.textInsets.bottom * 100"
        [style.left.%]="definition.textInsets.left * 100"
        [style.color]="shapeProps.textColor"
        [style.text-align]="shapeProps.shapeTextAlign"
        [style.justify-content]="verticalJustify">
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
  `],
})
export class ShapeBlockComponent extends BaseBlockComponent<ShapeBlockModel> {
  @ViewChild('shapeShell', {read: ElementRef})
  private readonly _shapeShell?: ElementRef<HTMLElement>

  @ViewChild('shapeGeometry', {read: ElementRef})
  private readonly _shapeGeometry?: ElementRef<SVGSVGElement>

  get shapeProps(): NormalizedShapeBlockProps {
    return normalizeShapeProps(this.props)
  }

  get definition() {
    return getShapeDefinition(this.shapeProps.shapeType)
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
    return this.shapeProps.strokeStyle === 'dashed' ? '10 7' : null
  }

  /** SVG 渐变 def 的 id 以 block id 收尾，保证同文档多形状互不串用。 */
  get fillGradientId(): string {
    return `bc-shape-fill-${this.id}`
  }

  get fillGradient(): {
    vector: ReturnType<typeof shapeGradientToSvgVector>
    stopList: Array<{color: string; offset: number}>
  } | null {
    const gradient = resolveShapeFillGradient(this.shapeProps)
    if (!gradient) return null
    return {
      vector: shapeGradientToSvgVector(gradient.angle),
      stopList: gradient.colors.map((color, index) => ({
        color,
        offset: gradient.stops[index],
      })),
    }
  }

  get fillPaint(): string {
    return this.shapeProps.fillType === 'linear-gradient'
      ? `url(#${this.fillGradientId})`
      : this.shapeProps.fillColor
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
