import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core'
import {CsTooltipDirective} from '@cses/ui'
import {
  TEXT_BOX_PRESETS,
  normalizeTextBoxWordArtStyle,
  type TextBoxPresetId,
} from '../../blocks/text-box-block'
import {getShapeDefinition} from '../../blocks/shape-block/shape-definitions'
import {resolveWordArtPresentation} from '../../blocks/word-art-block'

@Component({
  selector: 'bc-text-box-preset-picker',
  standalone: true,
  imports: [CsTooltipDirective],
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
              <svg viewBox="0 0 1000 1000" preserveAspectRatio="none">
                <path
                  [attr.d]="item.path"
                  [attr.fill]="item.props.backColor"
                  [attr.fill-opacity]="item.props.fo"
                  [attr.stroke]="item.props.borderColor"
                  [attr.stroke-width]="item.previewStrokeWidth"
                  [attr.stroke-dasharray]="item.props.bs === 'dashed' ? '24 16' : null"
                  vector-effect="non-scaling-stroke">
                </path>
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

  protected readonly items = TEXT_BOX_PRESETS.map(preset => {
    const definition = getShapeDefinition(preset.props.sh ?? 'rectangle')
    return {
      ...preset,
      path: definition.path,
      previewStrokeWidth: Math.max(1, Number(preset.props.bw ?? 1)),
      wordArt: preset.props.wa
        ? resolveWordArtPresentation(normalizeTextBoxWordArtStyle(preset.props.wa))
        : null,
    }
  })

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
