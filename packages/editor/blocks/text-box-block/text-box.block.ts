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
} from '../../framework'
import {
  ShapeResizerComponent,
  type ShapeResizeCommit,
  type ShapeRotateCommit,
} from '../shape-block'
import {getShapeDefinition} from '../shape-block/shape-definitions'
import {
  getTextBoxArtwork,
  resolveTextBoxArtworkSrc,
} from './presets/artwork'
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
      data-bc-object-surface
      contenteditable="false"
      [attr.data-bc-resize-preview-anchor]="
        isAbsolute ? null : 'layout'
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

      @if (backgroundImage; as image) {
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

      @if (!isReadonly) {
        <button
          type="button"
          class="text-box-block__object-handle"
          data-bc-print-exclude="true"
          data-bc-selection-interaction-ignore
          data-bc-placement-pick-ignore
          contenteditable="false"
          aria-label="选中文本框并拖动"
          title="选中文本框并拖动">
          <i class="bc_icon bc_yidong" aria-hidden="true"></i>
        </button>
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
          class="text-box-block__frame-hit-target"
          data-bc-selection-interaction-frame
          [attr.d]="shapeDefinition.path"
          fill="none"
          stroke="transparent"
          stroke-width="12"
          vector-effect="non-scaling-stroke">
        </path>
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
          data-bc-selection-interaction-ignore
          [target]="textBoxSurface"
          [maxWidthContainer]="placementContainer"
          [maxWidthResolver]="objectMaxWidthResolver"
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
    '[attr.data-bc-text-box-wm]': 'textBoxProps.wm',
    '[style.--bc-text-box-writing-mode]': 'writingMode',
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

  /**
   * Projects the frame's text flow direction. Horizontal frames emit nothing so
   * the theme's `horizontal-tb` fallback keeps existing documents byte-identical.
   */
  get writingMode(): string | null {
    return this.textBoxProps.wm === 'v' ? 'vertical-rl' : null
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

  /**
   * The paintable surface image. `bgi` holds a reference — `bc:<id>` for a
   * catalog drawing, a host URL for an uploaded one — so the registry resolves
   * it here rather than handing the raw value to `<img>`. An id this build does
   * not know paints nothing, which leaves an ordinary framed box rather than a
   * broken-image icon.
   */
  get backgroundImage() {
    const image = this.blockSurface.backgroundImage
    if (!image) return null
    const src = resolveTextBoxArtworkSrc(image.src)
    return src ? {...image, src} : null
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

  get isAbsolute(): boolean {
    return this.doc.placement?.isInAbsoluteLayout?.(this.id) ?? false
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
    const surface = this._surface?.nativeElement
    if (surface) surface.style.transform = rotationTransform(current.rotation)
  }

  commitRotation(event: ShapeRotateCommit): void {
    if (this.isReadonly) return
    this.doc.placement.updateObjectGeometry(this, {rotation: event.rotation})
    const surface = this._surface?.nativeElement
    if (surface) surface.style.transform = rotationTransform(event.rotation)
  }

  /**
   * The frame's text-safe area, as a percentage so it tracks the frame at any
   * size. A catalog drawing carries its own — no shape can describe where a
   * hand-drawn balloon's rim sits — and takes precedence over the shape's,
   * whose value the drawing is painted over anyway. `rectangle` alone reports
   * nothing: a plain rectangle has no artwork to dodge and its whole area is
   * usable.
   */
  private _shapeInset(
    side: 'top' | 'right' | 'bottom' | 'left',
  ): string {
    const artwork = getTextBoxArtwork(this.textBoxProps.bgi)
    if (artwork) return `${artwork.textInsets[side] * 100}%`
    if (this.textBoxProps.sh === 'rectangle') return '0%'
    return `${this.shapeDefinition.textInsets[side] * 100}%`
  }
}
