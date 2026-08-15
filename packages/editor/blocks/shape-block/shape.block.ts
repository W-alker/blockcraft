import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
} from '@angular/core'
import {BaseBlockComponent} from '../../framework'
import {getShapeDefinition} from './shape-definitions'
import {
  normalizeShapeProps,
  normalizeShapeRotation,
  type NormalizedShapeBlockProps,
  type ShapeBlockProps,
} from './shape.types'
import type {ShapeBlockModel} from './index'
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
  imports: [ShapeResizerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      #shapeShell
      class="shape-block__shell"
      data-bc-print-visual-surface
      contenteditable="false"
      [style.width.px]="shapeProps.width"
      [style.height.px]="shapeProps.height"
      [style.transform]="rotationTransform"
      (dblclick)="onEditText($event)">
      <svg
        class="shape-block__geometry"
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        aria-hidden="true">
        <path
          [attr.d]="definition.path"
          [attr.fill]="definition.fillable === false ? 'none' : shapeProps.fillColor"
          [attr.fill-opacity]="shapeProps.fillOpacity"
          [attr.fill-rule]="definition.fillRule ?? null"
          [attr.stroke]="shapeProps.strokeColor"
          [attr.stroke-width]="shapeProps.strokeWidth"
          [attr.stroke-dasharray]="strokeDasharray"
          vector-effect="non-scaling-stroke">
        </path>
        @if (definition.detailPath) {
          <path
            [attr.d]="definition.detailPath"
            fill="none"
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
          [rotation]="shapeProps.rotation"
          (resizeCommit)="onResizeCommit($event)"
          (rotateCommit)="onRotateCommit($event)">
        </shape-resizer>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: fit-content;
      max-width: 100%;
      background: transparent !important;
    }

    :host(.selected) shape-resizer {
      display: block;
    }

    .shape-block__shell {
      position: relative;
      max-width: 100%;
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

  get shapeProps(): NormalizedShapeBlockProps {
    return normalizeShapeProps(this.props)
  }

  get definition() {
    return getShapeDefinition(this.shapeProps.shapeType)
  }

  get strokeDasharray(): string | null {
    return this.shapeProps.strokeStyle === 'dashed' ? '10 7' : null
  }

  get verticalJustify(): 'flex-start' | 'center' | 'flex-end' {
    if (this.shapeProps.verticalAlign === 'top') return 'flex-start'
    if (this.shapeProps.verticalAlign === 'bottom') return 'flex-end'
    return 'center'
  }

  get rotationTransform(): string {
    return shapeRotationTransform(this.shapeProps.rotation)
  }

  get placementContainer(): HTMLElement | undefined {
    if (this.doc.placement?.isInObjectGroup?.(this.id)) {
      const groupHost = this.hostElement.closest<HTMLElement>('[data-bc-object-group]')
      return this.doc.objectSizing.rootContentElement ?? groupHost?.parentElement ?? undefined
    }
    return this.hostElement.closest<HTMLElement>('[data-bc-placement-container]') ??
      this.hostElement.parentElement ??
      undefined
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
}
