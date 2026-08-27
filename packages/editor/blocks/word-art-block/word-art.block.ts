import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  NgZone,
  ViewChild,
} from '@angular/core'
import {fromEvent, takeUntil} from 'rxjs'
import {
  EditableBlockComponent,
  normalizeBlockObjectFormat,
  objectEffectsFilter,
  objectPaintBackgroundPosition,
  objectPaintBackgroundSize,
  objectPicturePreserveAspectRatio,
  storeObjectTextStyle,
} from '../../framework'
import {
  ShapeResizerComponent,
  preserveResizeAspectRatio,
  type ShapeResizeCommit,
  type ShapeRotateCommit,
} from '../shape-block'
import type {WordArtBlockModel} from './index'
import {calculateWordArtResize} from './word-art-resize'
import {
  normalizeWordArtProps,
  resolveWordArtPresentation,
  resolveWordArtProjectionPath,
  WORD_ART_OBJECT_FORMAT_CAPABILITY,
  type NormalizedWordArtBlockProps,
  type WordArtBlockProps,
  type WordArtPresentation,
} from './word-art.types'

const rotationTransform = (rotation: number): string =>
  rotation === 0 ? '' : `rotate(${rotation}deg)`

@Component({
  selector: 'div.word-art-block',
  standalone: true,
  imports: [ShapeResizerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      #surface
      class="word-art-block__surface"
      [class.word-art-block__surface--nonlinear]="isNonlinear"
      data-bc-print-visual-surface
      data-bc-object-surface
      data-bc-fake-range-overlay-host
      data-bc-scale-font-on-corner
      [attr.data-bc-resize-preview-anchor]="
        isAbsolute ? null : 'layout'
      "
      [style.width.px]="wordArtProps.width"
      [style.height.px]="wordArtProps.height"
      [style.font-size.px]="wordArtProps.fontSize"
      [style.transform]="surfaceTransform"
      [style.align-items]="verticalAlignment"
    >
      @if (!isReadonly) {
        <button
          type="button"
          class="word-art-block__object-handle"
          data-bc-print-exclude="true"
          data-bc-selection-interaction-ignore
          data-bc-placement-pick-ignore
          contenteditable="false"
          aria-label="选中艺术字并拖动"
          title="选中艺术字并拖动">
          <i class="bc_icon bc_yidong" aria-hidden="true"></i>
        </button>
      }
      @if (isNonlinear) {
        <svg class="word-art-block__projection" [attr.viewBox]="'0 0 ' + wordArtProps.width + ' ' + wordArtProps.height"
          preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <path [attr.id]="projectionPathId" [attr.d]="projectionPath"></path>
            @if (wordArtFormat.textStyle?.fill?.type === 'linear-gradient') {
              <linearGradient [attr.id]="projectionGradientId" x1="0" y1="0" x2="1" y2="0">
                @for (stop of projectionGradientStops; track $index) {
                  <stop [attr.offset]="stop.offset"
                    [attr.stop-color]="stop.color"
                    [attr.stop-opacity]="stop.opacity"></stop>
                }
              </linearGradient>
            }
            @if (wordArtFormat.textStyle?.fill?.type === 'picture') {
              <pattern [attr.id]="projectionPictureId" width="1" height="1" patternContentUnits="objectBoundingBox">
                <image width="1" height="1" [attr.href]="projectionPictureSrc"
                  [attr.preserveAspectRatio]="projectionPictureAspectRatio"></image>
              </pattern>
            }
          </defs>
          <text text-anchor="middle" [attr.fill]="projectionFill"
            [attr.fill-opacity]="projectionFillOpacity"
            [attr.stroke]="projectionStroke" [attr.stroke-width]="projectionStrokeWidth"
            [style.font-family]="presentation.fontFamily" [style.font-size.px]="wordArtProps.fontSize"
            [style.font-weight]="wordArtProps.fontWeight" [style.font-style]="wordArtProps.fontStyle"
            [style.letter-spacing.em]="wordArtProps.letterSpacingEm" [style.filter]="projectionFilter">
            <textPath [attr.href]="'#' + projectionPathId" startOffset="50%">{{ textContent() }}</textPath>
          </text>
        </svg>
      }
      <div
        class="word-art-block__editor edit-container"
        [attr.data-bc-word-art-print-props]="printProps"
        [attr.contenteditable]="isReadonly ? 'false' : 'true'"
        [style.font-family]="presentation.fontFamily"
        [style.font-weight]="wordArtProps.fontWeight"
        [style.font-style]="wordArtProps.fontStyle"
        [style.letter-spacing.em]="wordArtProps.letterSpacingEm"
        [style.line-height]="wordArtProps.lineHeight"
        [style.text-align]="wordArtProps.horizontalAlign"
        [style.color]="presentation.textColor"
        [style.-webkit-text-fill-color]="presentation.textColor"
        [style.caret-color]="presentation.fallbackColor"
        [style.background-image]="presentation.backgroundImage"
        [style.background-size]="textBackgroundSize"
        [style.background-position]="textBackgroundPosition"
        [style.background-clip]="'text'"
        [style.-webkit-background-clip]="'text'"
        [style.-webkit-text-stroke]="presentation.textStroke"
        [style.text-shadow]="presentation.textShadow"
        [style.transform]="presentation.effectTransform"
        [style.opacity]="presentation.textOpacity"
        [attr.data-bc-word-art-effect-transform]="presentation.effectTransform"
      ></div>
      @if (!isReadonly) {
        <shape-resizer
          [target]="surface"
          [maxWidthContainer]="placementContainer"
          [maxWidthResolver]="objectMaxWidthResolver"
          [rotation]="wordArtProps.rotation"
          [borderDraggable]="true"
          [resizeCalculator]="resizeCalculator"
          rotationLabel="旋转艺术字"
          (resizeCommit)="commitResize($event)"
          (rotateCommit)="commitRotation($event)"
        >
        </shape-resizer>
      }
    </div>
  `,
})
export class WordArtBlockComponent extends EditableBlockComponent<WordArtBlockModel> {
  override plainTextOnly = true
  readonly resizeCalculator = calculateWordArtResize
  private readonly _ngZone = inject(NgZone)

  @ViewChild('surface', {read: ElementRef})
  private readonly _surface?: ElementRef<HTMLElement>

  override ngAfterViewInit(): void {
    super.ngAfterViewInit()
    this._ngZone.runOutsideAngular(() => {
      fromEvent(this.containerElement, 'scroll', {passive: true})
        .pipe(takeUntil(this.onDestroy$))
        .subscribe(() => this._resetEditorScroll())
    })
  }

  get wordArtProps(): NormalizedWordArtBlockProps {
    return normalizeWordArtProps(this.props)
  }

  get wordArtFormat() {
    return normalizeBlockObjectFormat(this.props, WORD_ART_OBJECT_FORMAT_CAPABILITY)
  }

  get isNonlinear(): boolean {
    return ['arch-up', 'arch-down', 'circle', 'wave']
      .includes(this.wordArtFormat.textStyle!.transform)
  }

  get projectionPathId(): string { return `bc-word-art-path-${this.id}` }
  get projectionGradientId(): string { return `bc-word-art-gradient-${this.id}` }
  get projectionPictureId(): string { return `bc-word-art-picture-${this.id}` }
  get projectionGradientStops() {
    const fill = this.wordArtFormat.textStyle!.fill
    return fill.type === 'linear-gradient' ? fill.stops : []
  }
  get projectionPictureSrc(): string | null {
    const fill = this.wordArtFormat.textStyle!.fill
    return fill.type === 'picture' ? fill.src : null
  }
  get projectionPath(): string {
    const {width, height} = this.wordArtProps
    return resolveWordArtProjectionPath(
      this.wordArtFormat.textStyle!.transform,
      width,
      height,
    ) ?? ''
  }

  get textBackgroundSize(): string {
    const fill = this.wordArtFormat.textStyle!.fill
    return fill.type === 'picture' ? objectPaintBackgroundSize(fill) : 'auto'
  }

  get textBackgroundPosition(): string {
    const fill = this.wordArtFormat.textStyle!.fill
    return fill.type === 'picture'
      ? objectPaintBackgroundPosition(fill)
      : '0% 0%'
  }
  get projectionFill(): string {
    const fill = this.wordArtFormat.textStyle!.fill
    if (fill.type === 'none') return 'none'
    return fill.type === 'linear-gradient'
      ? `url(#${this.projectionGradientId})`
      : fill.type === 'picture'
        ? `url(#${this.projectionPictureId})`
      : fill.color
  }
  get projectionPictureAspectRatio(): string {
    const fill = this.wordArtFormat.textStyle!.fill
    return fill.type === 'picture'
      ? objectPicturePreserveAspectRatio(fill)
      : 'none'
  }
  get projectionFillOpacity(): number {
    const fill = this.wordArtFormat.textStyle!.fill
    return fill.type === 'none' ? 0 : fill.opacity
  }
  get projectionStroke(): string {
    const line = this.wordArtFormat.textStyle!.outline
    return line.type === 'none' ? 'none' : line.color
  }
  get projectionStrokeWidth(): number {
    const line = this.wordArtFormat.textStyle!.outline
    return line.type === 'none' ? 0 : line.width
  }
  get projectionFilter(): string | null {
    return objectEffectsFilter(this.wordArtFormat.textStyle!.effects) || null
  }

  get presentation(): WordArtPresentation {
    return resolveWordArtPresentation(this.props)
  }

  /** 打印副本用的确定性视觉参数；分页打印层只消费隔离 DOM，不回写文档模型。 */
  get printProps(): string {
    return JSON.stringify(this.wordArtProps)
  }

  get surfaceTransform(): string {
    return rotationTransform(this.wordArtProps.rotation)
  }

  get verticalAlignment(): 'flex-start' | 'center' | 'flex-end' {
    if (this.wordArtProps.verticalAlign === 'top') return 'flex-start'
    if (this.wordArtProps.verticalAlign === 'bottom') return 'flex-end'
    return 'center'
  }

  get surfaceElement(): HTMLElement {
    return (
      this._surface?.nativeElement ??
      this.hostElement.querySelector<HTMLElement>('.word-art-block__surface') ??
      this.hostElement
    )
  }

  get isAbsolute(): boolean {
    return this.doc.placement?.isInAbsoluteLayout?.(this.id) ?? false
  }

  enterEditing(selectAll = false): void {
    if (this.isReadonly) return
    this.setInlineRange(
      selectAll ? 0 : this.textLength,
      selectAll ? this.textLength : 0,
    )
  }

  commitResize(event: ShapeResizeCommit): void {
    if (this.isReadonly) return
    const current = this.wordArtProps
    event = this.wordArtFormat.lockAspectRatio
      ? preserveResizeAspectRatio(event, current.width, current.height)
      : event
    const isCorner =
      (event.handle.includes('east') || event.handle.includes('west')) &&
      (event.handle.includes('north') || event.handle.includes('south'))
    const next: Partial<WordArtBlockProps> = {
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
    const nextTextStyle = isCorner
      ? {
          ...this.wordArtFormat.textStyle!,
          fontSize: this.wordArtFormat.textStyle!.fontSize *
            event.width / Math.max(1, current.width),
        }
      : null
    this.doc.crud.transact(() => {
      this.doc.placement.updateObjectGeometry(this, next)
      if (nextTextStyle) {
        this.doc.crud.updateBlockProps(this.id, {
          textStyle: storeObjectTextStyle(nextTextStyle),
        })
      }
    }, this)
    const surface = this._surface?.nativeElement
    if (surface) {
      surface.style.transform = rotationTransform(current.rotation)
      if (nextTextStyle) {
        surface.style.fontSize = `${nextTextStyle.fontSize}px`
      }
    }
  }

  commitRotation(event: ShapeRotateCommit): void {
    if (this.isReadonly) return
    this.doc.placement.updateObjectGeometry(this, {rotation: event.rotation})
    const surface = this._surface?.nativeElement
    if (surface) {
      surface.style.transform = rotationTransform(event.rotation)
    }
  }

  private _resetEditorScroll(): void {
    const editor = this.containerElement
    if (editor.scrollTop !== 0) editor.scrollTop = 0
    if (editor.scrollLeft !== 0) editor.scrollLeft = 0
  }
}
