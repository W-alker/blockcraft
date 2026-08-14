import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
} from '@angular/core'
import {
  BaseBlockComponent,
  blockSurfaceImageFitToObjectFit,
  resolveBlockSurface,
  resolvePlacementXInPixels,
} from '../../framework'
import {
  ShapeResizerComponent,
  type ShapeResizeCommit,
  type ShapeRotateCommit,
} from '../shape-block'
import {getShapeDefinition} from '../shape-block/shape-definitions'
import {
  resolveWordArtPresentation,
  type WordArtPresentation,
} from '../word-art-block/word-art.types'
import type {TextBoxBlockModel} from './index'
import {
  normalizeTextBoxProps,
  normalizeTextBoxWordArtStyle,
  type NormalizedTextBoxBlockProps,
  type TextBoxBlockProps,
} from './text-box.types'

const rotationTransform = (rotation: number): string =>
  rotation === 0 ? '' : `rotate(${rotation}deg)`

@Component({
  selector: 'div.text-box-block',
  standalone: true,
  imports: [ShapeResizerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      #textBoxSurface
      class="text-box-block__surface"
      data-bc-print-visual-surface
      contenteditable="false"
      [attr.data-bc-resize-preview-anchor]="
        textBoxProps.placement?.mode === 'absolute' ? null : 'layout'
      "
      [style.width.px]="textBoxProps.width"
      [style.height.px]="textBoxProps.height"
      [style.transform]="surfaceTransform">
      <svg
        class="text-box-block__geometry text-box-block__geometry--fill"
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        aria-hidden="true">
        <defs>
          <clipPath
            [attr.id]="clipPathId"
            clipPathUnits="objectBoundingBox">
            <path [attr.d]="shapeDefinition.path" transform="scale(.001)"></path>
          </clipPath>
        </defs>
        <path
          [attr.d]="shapeDefinition.path"
          [attr.fill]="textBoxProps.backColor"
          [attr.fill-opacity]="textBoxProps.fo"
          [attr.fill-rule]="shapeDefinition.fillRule ?? null">
        </path>
      </svg>

      @if (blockSurface.backgroundImage; as image) {
        <img
          class="text-box-block__background-image"
          [src]="image.src"
          [style.clip-path]="clipPathUrl"
          [style.-webkit-clip-path]="clipPathUrl"
          [style.object-fit]="objectFit(image.fit)"
          [style.object-position]="image.positionX + '% ' + image.positionY + '%'"
          [style.opacity]="image.opacity"
          alt=""
          aria-hidden="true"
          loading="eager"
          decoding="async"
          [draggable]="false">
      }

      <div
        class="text-box-block__content children-render-container"
        [class.text-box-block__content--word-art]="wordArtPresentation"
        [attr.contenteditable]="isReadonly ? 'false' : 'true'">
      </div>

      <svg
        class="text-box-block__geometry text-box-block__geometry--outline"
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        aria-hidden="true">
        <path
          [attr.d]="shapeDefinition.path"
          fill="none"
          [attr.stroke]="textBoxProps.borderColor"
          [attr.stroke-width]="textBoxProps.bw"
          [attr.stroke-dasharray]="strokeDasharray"
          vector-effect="non-scaling-stroke">
        </path>
        @if (shapeDefinition.detailPath) {
          <path
            [attr.d]="shapeDefinition.detailPath"
            fill="none"
            [attr.stroke]="textBoxProps.borderColor"
            [attr.stroke-width]="textBoxProps.bw"
            [attr.stroke-dasharray]="strokeDasharray"
            vector-effect="non-scaling-stroke">
          </path>
        }
      </svg>

      @if (!isReadonly) {
        <shape-resizer
          data-bc-print-exclude="true"
          [target]="textBoxSurface"
          [maxWidthContainer]="placementContainer"
          [rotation]="textBoxProps.rotation"
          [borderDraggable]="true"
          rotationLabel="旋转文本框"
          (resizeCommit)="commitResize($event)"
          (rotateCommit)="commitRotation($event)">
        </shape-resizer>
      }
    </div>
  `,
  host: {
    'data-bc-text-box': 'true',
    '[style.--bc-text-box-background-color]': 'textBoxProps.backColor',
    '[style.--bc-text-box-border-color]': 'textBoxProps.borderColor',
    '[style.--bc-text-box-padding-top]': 'blockSurface.padding.top + "px"',
    '[style.--bc-text-box-padding-right]': 'blockSurface.padding.right + "px"',
    '[style.--bc-text-box-padding-bottom]': 'blockSurface.padding.bottom + "px"',
    '[style.--bc-text-box-padding-left]': 'blockSurface.padding.left + "px"',
    '[style.--bc-text-box-shape-inset-top]': 'shapeInsetTop',
    '[style.--bc-text-box-shape-inset-right]': 'shapeInsetRight',
    '[style.--bc-text-box-shape-inset-bottom]': 'shapeInsetBottom',
    '[style.--bc-text-box-shape-inset-left]': 'shapeInsetLeft',
    '[style.--bc-text-box-word-art-font-family]': 'wordArtPresentation?.fontFamily ?? null',
    '[style.--bc-text-box-word-art-font-size]': 'wordArtFontSize',
    '[style.--bc-text-box-word-art-font-weight]': 'wordArtPresentation?.props?.fontWeight ?? null',
    '[style.--bc-text-box-word-art-font-style]': 'wordArtPresentation?.props?.fontStyle ?? null',
    '[style.--bc-text-box-word-art-letter-spacing]': 'wordArtLetterSpacing',
    '[style.--bc-text-box-word-art-line-height]': 'wordArtPresentation?.props?.lineHeight ?? null',
    '[style.--bc-text-box-word-art-align]': 'wordArtPresentation?.props?.horizontalAlign ?? null',
    '[style.--bc-text-box-word-art-vertical]': 'wordArtVerticalAlign',
    '[style.--bc-text-box-word-art-color]': 'wordArtPresentation?.textColor ?? null',
    '[style.--bc-text-box-word-art-background]': 'wordArtPresentation?.backgroundImage ?? null',
    '[style.--bc-text-box-word-art-stroke]': 'wordArtPresentation?.textStroke ?? null',
    '[style.--bc-text-box-word-art-shadow]': 'wordArtPresentation?.textShadow ?? null',
    '[style.--bc-text-box-word-art-transform]': 'wordArtTransform',
  },
})
export class TextBoxBlockComponent extends BaseBlockComponent<TextBoxBlockModel> {
  @ViewChild('textBoxSurface', {read: ElementRef})
  private readonly _surface?: ElementRef<HTMLElement>

  get textBoxProps(): NormalizedTextBoxBlockProps {
    return normalizeTextBoxProps(this.props)
  }

  get blockSurface() {
    return resolveBlockSurface(this.textBoxProps)
  }

  get shapeDefinition() {
    return getShapeDefinition(this.textBoxProps.sh)
  }

  get clipPathId(): string {
    return `bc-text-box-clip-${this.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
  }

  get clipPathUrl(): string {
    return `url(#${this.clipPathId})`
  }

  get strokeDasharray(): string | null {
    return this.textBoxProps.bs === 'dashed' ? '10 8' : null
  }

  get wordArtPresentation(): WordArtPresentation | null {
    const style = normalizeTextBoxWordArtStyle(this.textBoxProps.wa)
    return style ? resolveWordArtPresentation(style) : null
  }

  get wordArtFontSize(): string | null {
    return this.wordArtPresentation
      ? `${this.wordArtPresentation.props.fontSize}px`
      : null
  }

  get wordArtLetterSpacing(): string | null {
    return this.wordArtPresentation
      ? `${this.wordArtPresentation.props.letterSpacingEm}em`
      : null
  }

  get wordArtTransform(): string | null {
    return this.wordArtPresentation?.effectTransform || null
  }

  get wordArtVerticalAlign(): string | null {
    const value = this.wordArtPresentation?.props.verticalAlign
    if (!value) return null
    if (value === 'top') return 'flex-start'
    if (value === 'bottom') return 'flex-end'
    return 'center'
  }

  get shapeInsetTop(): string {
    return this._shapeInset('top')
  }

  get shapeInsetRight(): string {
    return this._shapeInset('right')
  }

  get shapeInsetBottom(): string {
    return this._shapeInset('bottom')
  }

  get shapeInsetLeft(): string {
    return this._shapeInset('left')
  }

  get surfaceTransform(): string {
    return rotationTransform(this.textBoxProps.rotation)
  }

  get placementContainer(): HTMLElement | undefined {
    return this.hostElement.closest<HTMLElement>('[data-bc-placement-container]') ??
      this.hostElement.parentElement ??
      undefined
  }

  objectFit(
    fit: NonNullable<ReturnType<typeof resolveBlockSurface>['backgroundImage']>['fit'],
  ): 'cover' | 'contain' | 'fill' {
    return blockSurfaceImageFitToObjectFit(fit)
  }

  /** Enter the first editable child through the shared container cursor path. */
  enterEditing(scrollIntoView = true): void {
    if (this.isReadonly) return
    this.doc.selection.setCursorAtBlock(this, true, scrollIntoView)
  }

  commitResize(event: ShapeResizeCommit): void {
    if (this.isReadonly) return
    const current = this.textBoxProps
    const next: Partial<TextBoxBlockProps> = {
      width: Math.round(event.width),
      height: Math.round(event.height),
    }

    if (current.placement?.mode === 'absolute') {
      const containerWidth = this.placementContainer?.clientWidth ?? 0
      next.placement = {
        ...current.placement,
        x: resolvePlacementXInPixels(current.placement, containerWidth) +
          event.offsetX,
        y: (current.placement.y ?? 0) + event.offsetY,
        unit: 'px',
      }
    }

    this.updateProps(next)
    const surface = this._surface?.nativeElement
    if (surface) surface.style.transform = rotationTransform(current.rotation)
  }

  commitRotation(event: ShapeRotateCommit): void {
    if (this.isReadonly) return
    this.updateProps({rotation: event.rotation})
    const surface = this._surface?.nativeElement
    if (surface) surface.style.transform = rotationTransform(event.rotation)
  }

  private _shapeInset(
    side: 'top' | 'right' | 'bottom' | 'left',
  ): string {
    if (this.textBoxProps.sh === 'rectangle') return '0%'
    return `${this.shapeDefinition.textInsets[side] * 100}%`
  }
}
