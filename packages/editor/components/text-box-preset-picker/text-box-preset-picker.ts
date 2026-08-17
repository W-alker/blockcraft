import {FormsModule} from '@angular/forms'
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core'
import {
  CsSegmentedComponent,
  CsTooltipDirective,
  type CsSegmentedOptions,
} from '@cses/ui'
import {
  getTextBoxPresetCategoriesFor,
  getTextBoxPresetsFor,
  resolveTextBoxArtworkSrc,
  normalizeTextBoxWordArtStyle,
  type TextBoxPresetCategory,
  type TextBoxPresetId,
} from '../../blocks/text-box-block'
import {getShapeDefinition} from '../../blocks/shape-block/shape-definitions'
import {resolveWordArtPresentation} from '../../blocks/word-art-block'

@Component({
  selector: 'bc-text-box-preset-picker',
  standalone: true,
  imports: [CsSegmentedComponent, CsTooltipDirective, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.text-box-preset-picker-host--embedded]': 'embedded',
  },
  template: `
    <div
      class="text-box-preset-picker"
      contenteditable="false"
      role="menu"
      aria-label="选择文本框样式">
      <div class="text-box-preset-picker__title">文本框样式</div>
      <!-- Same mousedown guard the grid buttons carry: each tab is a label
           wrapping a radio, so a plain click pulls focus out of the editor and
           drops the selection this picker is being shown for. cs-segmented
           commits on click, not on the radio's own state, so suppressing the
           default costs nothing. -->
      <cs-segmented
        class="text-box-preset-picker__tabs"
        csSize="small"
        [csBlock]="true"
        [csOptions]="categoryOptions"
        [ngModel]="activeCategory"
        (ngModelChange)="setCategory($event)"
        (mousedown)="preserveSelection($event)"
        csAriaLabel="文本框分类">
      </cs-segmented>
      <div class="text-box-preset-picker__grid">
        @for (item of items; track item.id) {
          <button
            type="button"
            class="text-box-preset-picker__item"
            role="menuitemradio"
            [class.active]="current === item.id"
            [attr.aria-checked]="current === item.id"
            [attr.data-preset-id]="item.id"
            [attr.aria-label]="item.label"
            [csTooltip]="item.label"
            (mousedown)="preserveSelection($event)"
            (click)="pick.emit(item.id)">
            <span class="text-box-preset-picker__preview" aria-hidden="true">
              <!-- Three layers, in the same order the live Block paints them:
                   shape fill, then the surface image, then the outline. Drawing
                   fill and outline in one pass buries the image under an opaque
                   fill, which blanks out every entry that pairs a fill opacity
                   with a decorated surface. -->
              <svg viewBox="0 0 1000 1000" preserveAspectRatio="none">
                <path
                  [attr.d]="item.path"
                  [attr.fill]="item.props.backColor"
                  [attr.fill-opacity]="item.props.fo"
                  [attr.fill-rule]="item.fillRule"
                  stroke="none">
                </path>
              </svg>
              @if (item.artworkSrc) {
                <img
                  class="text-box-preset-picker__bg"
                  [src]="item.artworkSrc"
                  [style.object-fit]="item.backgroundFit"
                  alt=""
                  loading="eager"
                  decoding="async">
              }
              <svg viewBox="0 0 1000 1000" preserveAspectRatio="none">
                <path
                  [attr.d]="item.path"
                  fill="none"
                  [attr.stroke]="item.previewStroke"
                  [attr.stroke-width]="item.previewStrokeWidth"
                  [attr.stroke-dasharray]="item.props.bs === 'dashed' ? '24 16' : null"
                  vector-effect="non-scaling-stroke">
                </path>
                @if (item.detailPath) {
                  <path
                    [attr.d]="item.detailPath"
                    fill="none"
                    [attr.stroke]="item.previewStroke"
                    [attr.stroke-width]="item.previewStrokeWidth"
                    [attr.stroke-dasharray]="item.props.bs === 'dashed' ? '24 16' : null"
                    vector-effect="non-scaling-stroke">
                  </path>
                }
              </svg>
              <span
                class="text-box-preset-picker__sample"
                [style.font-family]="item.wordArt?.fontFamily"
                [style.font-weight]="item.wordArt?.props?.fontWeight"
                [style.font-style]="item.wordArt?.props?.fontStyle"
                [style.color]="item.wordArt?.textColor ?? sampleColor(item.props.backColor)"
                [style.-webkit-text-fill-color]="item.wordArt?.textColor"
                [style.background-image]="item.wordArt?.backgroundImage"
                [style.-webkit-text-stroke]="item.wordArt?.textStroke"
                [style.text-shadow]="item.wordArt?.textShadow"
                [style.transform]="item.wordArt?.effectTransform || 'none'">
                Aa
              </span>
            </span>
            <span class="text-box-preset-picker__label">{{ item.label }}</span>
          </button>
        }
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      max-width: calc(100vw - 24px);
    }

    :host(.text-box-preset-picker-host--embedded) {
      max-width: none;
    }

    :host(.text-box-preset-picker-host--embedded) .text-box-preset-picker {
      width: auto;
      max-height: 360px;
      padding: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
    }

    /* Embedded hosts supply their own heading, so the standalone one would
       duplicate it. */
    :host(.text-box-preset-picker-host--embedded)
      .text-box-preset-picker__title {
      display: none;
    }

    .text-box-preset-picker {
      box-sizing: border-box;
      width: min(430px, calc(100vw - 16px));
      max-height: min(420px, calc(100vh - 24px));
      padding: 8px;
      overflow: auto;
      overscroll-behavior: contain;
      border: 1px solid var(--bc-float-toolbar-divider-color);
      border-radius: 10px;
      background: var(--bc-float-toolbar-bg);
      color: var(--bc-float-toolbar-item-color);
      box-shadow: var(--bc-fixed-toolbar-shadow, 0 6px 16px rgba(15, 15, 15, .08));
    }

    .text-box-preset-picker__title {
      margin-bottom: 7px;
      font-size: 11px;
      font-weight: 600;
      line-height: 16px;
    }

    /* Skin only the outer spacing — the tab strip itself is cs-segmented, and
       overriding its layout would break the sliding thumb it measures. */
    .text-box-preset-picker__tabs {
      display: block;
      margin-bottom: 7px;
    }

    .text-box-preset-picker__grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 6px;
    }

    .text-box-preset-picker__item {
      min-width: 0;
      padding: 5px;
      border: 1px solid transparent;
      border-radius: 7px;
      background: transparent;
      color: inherit;
      cursor: pointer;
    }

    .text-box-preset-picker__item:hover,
    .text-box-preset-picker__item:focus-visible,
    .text-box-preset-picker__item.active {
      border-color: var(--bc-active-color-light);
      background: var(--bc-float-toolbar-item-hover-bg);
      outline: none;
    }

    .text-box-preset-picker__preview {
      position: relative;
      display: block;
      height: 58px;
    }


    .text-box-preset-picker__preview svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: visible;
    }

    .text-box-preset-picker__bg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      display: block;
    }

    .text-box-preset-picker__sample {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      font-size: 19px;
      font-weight: 700;
      line-height: 1;
      background-clip: text;
      -webkit-background-clip: text;
      transform-origin: center;
      pointer-events: none;
    }

    .text-box-preset-picker__label {
      display: block;
      margin-top: 2px;
      overflow: hidden;
      font-size: 10px;
      line-height: 14px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `],
})
export class TextBoxPresetPickerComponent {
  /** Removes standalone popup chrome when hosted inside a settings panel. */
  @Input()
  embedded = false

  @Input()
  current?: TextBoxPresetId

  @Output()
  readonly pick = new EventEmitter<TextBoxPresetId>()

  protected activeCategory: TextBoxPresetCategory = 'outline'

  /**
   * Shape tabs only. Direction is a frame flag applied on top of whichever
   * style is picked — a vertical frame reuses the same catalog entry — so
   * splitting the catalog by direction would just duplicate every row.
   */
  protected readonly categoryOptions: CsSegmentedOptions =
    getTextBoxPresetCategoriesFor('h').map(category => ({
      value: category.id,
      label: category.label,
    }))

  /**
   * Rebuilt per tab rather than precomputed once: the catalog is small, and
   * each entry has to resolve its shape path and word-art presentation before
   * the preview can draw it.
   */
  protected get items() {
    const visible = getTextBoxPresetsFor('h', this.activeCategory)
    return visible.map(preset => {
      const definition = getShapeDefinition(preset.props.sh ?? 'rectangle')
      return {
        ...preset,
        path: definition.path,
        // Without these two the double-line frames and rings collapse into a
        // plain rectangle or a solid disc in the thumbnail.
        detailPath: definition.detailPath ?? null,
        fillRule: definition.fillRule ?? null,
        // `bgi` holds a `bc:` reference rather than the drawing, so the
        // thumbnail resolves it the same way the Block does — handing the raw
        // value to `<img>` renders every decorated entry as a broken image.
        artworkSrc: preset.props.bgi
          ? resolveTextBoxArtworkSrc(preset.props.bgi)
          : null,
        // Decorated presets carry their whole appearance in the surface image
        // and set `bw: 0` / `fo: 0`, so a shape-only thumbnail renders blank.
        backgroundFit: preset.props.bgs === 'stretch'
          ? 'fill'
          : preset.props.bgs === 'contain' ? 'contain' : 'cover',
        // `bw: 0` means the entry draws its own outline inside the surface
        // image. Forcing a minimum hairline here would ring every such preset
        // with an unwanted border in its default color.
        previewStroke: Number(preset.props.bw ?? 1) > 0
          ? preset.props.borderColor
          : 'none',
        previewStrokeWidth: Math.max(1, Number(preset.props.bw ?? 1)),
        wordArt: preset.props.wa
          ? resolveWordArtPresentation(
            normalizeTextBoxWordArtStyle(preset.props.wa),
          )
          : null,
      }
    })
  }


  protected setCategory(value: string | number): void {
    this.activeCategory = value as TextBoxPresetCategory
  }

  protected preserveSelection(event: MouseEvent): void {
    event.preventDefault()
    event.stopPropagation()
  }

  protected sampleColor(background: unknown): string {
    return background === '#0F172A' || background === '#18181B'
      ? '#F8FAFC'
      : '#0F172A'
  }
}
