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
  blockSurfaceImageFitToObjectFit,
  colorWithOpacity,
  normalizeBlockObjectFormat,
  objectEffectsFilter,
  objectLineDasharray,
  objectPaintBackgroundPosition,
  objectPaintBackgroundSize,
  objectTextTransformCss,
  resolveBlockSurface,
  storeObjectTextFrame,
  storeObjectTextStyle,
} from '../../framework'
import {
  shapeGradientToSvgVector,
  ShapeResizerComponent,
  preserveResizeAspectRatio,
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
  TEXT_BOX_OBJECT_FORMAT_CAPABILITY,
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
      [style.filter]="shapeEffectsFilter"
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
          @if (textBoxFormat.shapeFill?.type === 'linear-gradient') {
            <linearGradient [attr.id]="gradientId"
              [attr.x1]="gradientVector.x1" [attr.y1]="gradientVector.y1"
              [attr.x2]="gradientVector.x2" [attr.y2]="gradientVector.y2">
              @for (stop of frameGradientStops; track $index) {
                <stop [attr.offset]="stop.offset"
                  [attr.stop-color]="stop.color"
                  [attr.stop-opacity]="stop.opacity"></stop>
              }
            </linearGradient>
          }
        </defs>
        <path
          [attr.d]="shapeDefinition.path"
          [attr.fill]="frameFill"
          [attr.fill-opacity]="frameFillOpacity"
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

      @if (artworkImage; as artwork) {
        <img
          class="text-box-block__background-image text-box-block__background-image--artwork"
          [src]="artwork"
          [style.clip-path]="clipPathUrl"
          [style.-webkit-clip-path]="clipPathUrl"
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
        #textContent
        class="text-box-block__content children-render-container"
        [class.text-box-block__content--word-art]="usesUniformTextPaint"
        [style.font-family]="textBoxFormat.textStyle?.fontFamily"
        [style.font-size.px]="textBoxFormat.textStyle?.fontSize"
        [style.font-weight]="textBoxFormat.textStyle?.fontWeight"
        [style.font-style]="textBoxFormat.textStyle?.fontStyle"
        [style.letter-spacing.em]="textBoxFormat.textStyle?.letterSpacingEm"
        [style.line-height]="textBoxFormat.textStyle?.lineHeight"
        [style.text-align]="textBoxFormat.textFrame?.horizontalAlign"
        [style.justify-content]="textVerticalJustify"
        [style.white-space]="textBoxFormat.textFrame?.wrap ? null : 'nowrap'"
        [style.transform]="textFrameTransform"
        [style.background-size]="textPaintBackgroundSize"
        [style.background-position]="textPaintBackgroundPosition"
        [style.opacity]="textPictureOpacity"
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
          [attr.stroke]="frameStroke"
          [attr.stroke-opacity]="textBoxFormat.shapeOutline?.opacity"
          [attr.stroke-width]="textBoxFormat.shapeOutline?.width"
          [attr.stroke-dasharray]="strokeDasharray"
          [attr.stroke-linecap]="textBoxFormat.shapeOutline?.cap"
          [attr.stroke-linejoin]="textBoxFormat.shapeOutline?.join"
          vector-effect="non-scaling-stroke">
        </path>
        @if (shapeDefinition.detailPath) {
          <path
            [attr.d]="shapeDefinition.detailPath"
            fill="none"
            [attr.stroke]="frameStroke"
            [attr.stroke-opacity]="textBoxFormat.shapeOutline?.opacity"
            [attr.stroke-width]="textBoxFormat.shapeOutline?.width"
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
    '[style.--bc-text-box-word-art-color]': 'textPaintColor',
    '[style.--bc-text-box-word-art-background]': 'textPaintBackground',
    '[style.--bc-text-box-word-art-stroke]': 'wordArtPresentation?.textStroke ?? null',
    '[style.--bc-text-box-word-art-shadow]': 'wordArtPresentation?.textShadow ?? null',
    '[style.--bc-text-box-word-art-transform]': 'wordArtTransform',
  },
})
export class TextBoxBlockComponent extends BaseBlockComponent<TextBoxBlockModel> {
  private readonly _ngZone = inject(NgZone)

  @ViewChild('textBoxSurface', {read: ElementRef})
  private readonly _surface?: ElementRef<HTMLElement>
  @ViewChild('textContent', {read: ElementRef})
  private readonly _textContent?: ElementRef<HTMLElement>
  private _autoFitObserver?: MutationObserver
  private _autoFitFrame: number | null = null

  override ngAfterViewInit(): void {
    super.ngAfterViewInit()
    const content = this._textContent?.nativeElement
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
      if (this._autoFitFrame !== null) ownerWindow.cancelAnimationFrame(this._autoFitFrame)
      this._autoFitFrame = null
    })
    this._scheduleAutoFit()
  }

  get textBoxProps(): NormalizedTextBoxBlockProps {
    return normalizeTextBoxProps(this.props)
  }

  get textBoxFormat() {
    return normalizeBlockObjectFormat(this.props, TEXT_BOX_OBJECT_FORMAT_CAPABILITY)
  }

  get blockSurface() {
    return resolveBlockSurface(this.textBoxProps as never)
  }

  get shapeDefinition() {
    return getShapeDefinition(this.textBoxProps.shapeType)
  }

  get clipPathId(): string {
    return `bc-text-box-clip-${this.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
  }

  get clipPathUrl(): string {
    return `url(#${this.clipPathId})`
  }

  get strokeDasharray(): string | null {
    return objectLineDasharray(this.textBoxFormat.shapeOutline!)
  }

  get gradientId(): string { return `bc-text-box-gradient-${this.id}` }
  get frameGradientStops() {
    const fill = this.textBoxFormat.shapeFill!
    return fill.type === 'linear-gradient' ? fill.stops : []
  }
  get gradientVector() {
    const fill = this.textBoxFormat.shapeFill!
    return shapeGradientToSvgVector(
      fill.type === 'linear-gradient' ? fill.angle : 0,
    )
  }
  get frameFillOpacity(): number {
    const fill = this.textBoxFormat.shapeFill!
    return fill.type === 'none' ? 0 : fill.opacity
  }
  get frameFill(): string {
    const fill = this.textBoxFormat.shapeFill!
    if (fill.type === 'none' || fill.type === 'picture') return 'none'
    return fill.type === 'linear-gradient' ? `url(#${this.gradientId})` : fill.color
  }
  get frameStroke(): string {
    const line = this.textBoxFormat.shapeOutline!
    return line.type === 'none' ? 'none' : line.color
  }
  get shapeEffectsFilter(): string | null {
    return objectEffectsFilter(this.textBoxFormat.shapeEffects!) || null
  }

  /**
   * Projects the frame's text flow direction. Horizontal frames emit nothing so
   * the theme's `horizontal-tb` fallback keeps existing documents byte-identical.
   */
  get writingMode(): string | null {
    return this.textBoxFormat.textFrame!.direction === 'vertical-rl'
      ? 'vertical-rl'
      : null
  }

  get textFrameTransform(): string | null {
    const frame = this.textBoxFormat.textFrame!
    const transforms: string[] = []
    if (frame.direction === 'rotate-90') transforms.push('rotate(90deg)')
    if (frame.direction === 'rotate-270') transforms.push('rotate(270deg)')
    if (!frame.rotateWithShape && this.textBoxProps.rotation) {
      transforms.push(`rotate(${-this.textBoxProps.rotation}deg)`)
    }
    const textTransform = objectTextTransformCss(
      this.textBoxFormat.textStyle!.transform,
    )
    if (textTransform) transforms.push(textTransform)
    return transforms.join(' ') || null
  }

  get textVerticalJustify(): 'flex-start' | 'center' | 'flex-end' {
    const value = this.textBoxFormat.textFrame!.verticalAlign
    return value === 'top' ? 'flex-start' : value === 'bottom' ? 'flex-end' : 'center'
  }

  get usesUniformTextPaint(): boolean {
    const style = this.textBoxFormat.textStyle!
    return style.fill.type !== 'solid' || style.outline.type !== 'none' ||
      style.effects.shadow.enabled || style.effects.glow.enabled ||
      style.transform !== 'none'
  }

  get textPaintColor(): string | null {
    const fill = this.textBoxFormat.textStyle!.fill
    return fill.type === 'linear-gradient' || fill.type === 'picture'
      ? 'transparent'
      : fill.type === 'none'
        ? 'transparent'
        : colorWithOpacity(fill.color, fill.opacity)
  }

  get textPaintBackground(): string | null {
    const fill = this.textBoxFormat.textStyle!.fill
    if (fill.type === 'picture' && fill.src) {
      return `url("${fill.src.replace(/["\\]/g, '\\$&')}")`
    }
    return this.wordArtPresentation?.backgroundImage ?? null
  }

  get textPictureOpacity(): number | null {
    const fill = this.textBoxFormat.textStyle!.fill
    return fill.type === 'picture' ? fill.opacity : null
  }

  get textPaintBackgroundSize(): string {
    const fill = this.textBoxFormat.textStyle!.fill
    return fill.type === 'picture' ? objectPaintBackgroundSize(fill) : 'auto'
  }

  get textPaintBackgroundPosition(): string {
    const fill = this.textBoxFormat.textStyle!.fill
    return fill.type === 'picture'
      ? objectPaintBackgroundPosition(fill)
      : '0% 0%'
  }

  get wordArtPresentation(): WordArtPresentation | null {
    return resolveWordArtPresentation({
      depth: 0,
      width: this.textBoxProps.width,
      height: this.textBoxProps.height,
      rotation: 0,
      textFrame: storeObjectTextFrame(this.textBoxProps.textFrame),
      textStyle: storeObjectTextStyle(this.textBoxProps.textStyle),
    })
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
   * User-selected picture fill. Catalog artwork has its own field and
   * never appears in the picture controls.
   */
  get backgroundImage() {
    return this.blockSurface.backgroundImage
  }

  get artworkImage(): string | null {
    return typeof this.textBoxProps.artwork === 'string'
      ? resolveTextBoxArtworkSrc(this.textBoxProps.artwork)
      : null
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
    event = this.textBoxFormat.lockAspectRatio
      ? preserveResizeAspectRatio(event, current.width, current.height)
      : event
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
    const artwork = getTextBoxArtwork(this.textBoxProps.artwork)
    if (artwork) return `${artwork.textInsets[side] * 100}%`
    if (this.textBoxProps.shapeType === 'rectangle') return '0%'
    return `${this.shapeDefinition.textInsets[side] * 100}%`
  }

  private _scheduleAutoFit(): void {
    if (this._autoFitFrame !== null || this.isReadonly) return
    const content = this._textContent?.nativeElement
    const ownerWindow = content?.ownerDocument.defaultView
    if (!content || !ownerWindow) return
    this._autoFitFrame = ownerWindow.requestAnimationFrame(() => {
      this._autoFitFrame = null
      if (this.textBoxFormat.textFrame!.autoFit !== 'resize-shape') return
      const overflow = this.textBoxFormat.textFrame!.direction === 'vertical-rl'
        ? content.scrollWidth - content.clientWidth
        : content.scrollHeight - content.clientHeight
      if (!Number.isFinite(overflow) || overflow <= .5) return
      const current = this.textBoxProps
      this.doc.placement.updateObjectGeometry(this, {
        [this.textBoxFormat.textFrame!.direction === 'vertical-rl'
          ? 'width'
          : 'height']: Math.ceil(
          (this.textBoxFormat.textFrame!.direction === 'vertical-rl'
            ? current.width
            : current.height) + overflow,
        ),
      })
    })
  }
}
