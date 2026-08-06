import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Output,
} from "@angular/core";
import { NzTooltipDirective } from "ng-zorro-antd/tooltip";
import {
  resolveWordArtPresentation,
  WORD_ART_PRESETS,
  type WordArtPresetId,
} from "../../../blocks/word-art-block";

@Component({
  selector: "bc-word-art-preset-picker",
  standalone: true,
  imports: [NzTooltipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="word-art-preset-picker"
      contenteditable="false"
      role="menu"
      aria-label="选择艺术字预设"
    >
      <div class="word-art-preset-picker__title">艺术字预设</div>
      <div class="word-art-preset-picker__viewport">
        @for (item of items; track item.id) {
          <button
            type="button"
            class="word-art-preset-picker__item"
            role="menuitem"
            [attr.data-preset-id]="item.id"
            [attr.aria-label]="item.label"
            [title]="item.label"
            [nz-tooltip]="item.label"
            (click)="pick.emit(item.id)"
          >
            <span
              class="word-art-preset-picker__preview"
              aria-hidden="true"
              [style.font-family]="item.presentation.fontFamily"
              [style.font-weight]="item.presentation.props.fontWeight"
              [style.font-style]="item.presentation.props.fontStyle"
              [style.letter-spacing.em]="
                item.presentation.props.letterSpacingEm
              "
              [style.color]="item.presentation.textColor"
              [style.-webkit-text-fill-color]="item.presentation.textColor"
              [style.background-image]="item.presentation.backgroundImage"
              [style.-webkit-text-stroke]="item.presentation.textStroke"
              [style.text-shadow]="item.presentation.textShadow"
              [style.transform]="item.presentation.effectTransform || 'none'"
              >A</span
            >
          </button>
        }
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        max-width: calc(100vw - 24px);
      }

      .word-art-preset-picker {
        box-sizing: border-box;
        max-width: 100%;
        padding: 12px;
        border: 1px solid var(--bc-float-toolbar-divider-color);
        border-radius: 10px;
        background: var(--bc-float-toolbar-bg);
        color: var(--bc-float-toolbar-item-color);
        box-shadow: var(
          --bc-fixed-toolbar-shadow,
          0 6px 16px rgba(15, 15, 15, 0.08)
        );
      }

      .word-art-preset-picker__title {
        margin-bottom: 8px;
        font-size: 13px;
        font-weight: 600;
        line-height: 20px;
      }

      .word-art-preset-picker__viewport {
        display: grid;
        grid-auto-columns: 68px;
        grid-auto-flow: column;
        gap: 6px;
        max-width: 100%;
        overflow-x: auto;
        overscroll-behavior-inline: contain;
      }

      .word-art-preset-picker__item {
        box-sizing: border-box;
        width: 68px;
        height: 64px;
        padding: 0;
        overflow: visible;
        border: 1px solid transparent;
        border-radius: 6px;
        background: transparent;
        color: inherit;
        cursor: pointer;
      }

      .word-art-preset-picker__item:hover,
      .word-art-preset-picker__item:focus-visible {
        border-color: var(--bc-active-color-light);
        background: var(--bc-float-toolbar-item-hover-bg);
        outline: none;
      }

      .word-art-preset-picker__item:focus-visible {
        box-shadow: 0 0 0 2px var(--bc-active-color-light);
      }

      .word-art-preset-picker__preview {
        display: inline-block;
        font-size: 40px;
        line-height: 1;
        background-clip: text;
        -webkit-background-clip: text;
        transform-origin: center;
        white-space: nowrap;
        pointer-events: none;
      }
    `,
  ],
})
export class WordArtPresetPickerComponent {
  @Output()
  readonly pick = new EventEmitter<WordArtPresetId>();

  protected readonly items = WORD_ART_PRESETS.map((item) => ({
    id: item.id,
    label: item.label,
    presentation: resolveWordArtPresentation(item.props),
  }));
}
