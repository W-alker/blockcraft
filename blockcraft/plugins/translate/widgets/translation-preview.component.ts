import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from "@angular/core";
import { NgIf } from "@angular/common";
import type { TranslateLanguageOption } from "../translate.plugin";

@Component({
  selector: "bc-translation-preview",
  standalone: true,
  imports: [NgIf],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    "contenteditable": "false"
  },
  template: `
    <div class="translation-preview" (mousedown)="$event.stopPropagation()">
      <button type="button" class="close-btn close-btn--corner" (mousedown)="onClose($event)">
        <i class="bc_icon bc_guanbi"></i>
      </button>

      @if (loading) {
        <div class="translation-preview__loading">
          <i class="bc_icon bc_jiazai"></i>
          <span>翻译中...</span>
        </div>
      } @else if (errorText) {
        <div class="translation-preview__error">{{ errorText }}</div>
      } @else {
        <pre class="translation-preview__content">{{ translatedText }}</pre>
      }

      <div class="translation-preview__actions">
        @if (languages.length > 0) {
          <div class="translation-preview__lang">
            <label class="translation-preview__label" for="bc-translate-target-lang">目标语言</label>
            <select id="bc-translate-target-lang"
                    class="translation-preview__select"
                    [value]="selectedTargetLang"
                    (change)="onTargetLangChange($event)">
              @for (language of languages; track language.code) {
                <option [value]="language.code"
                        [selected]="language.code === selectedTargetLang">
                  {{ language.label }}
                </option>
              }
            </select>
          </div>
        }
        <button type="button"
                class="btn btn-primary"
                [disabled]="loading || !translatedText"
                (mousedown)="onApply($event)">
          替换原文
        </button>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      margin: 4px 0 0;
      pointer-events: auto;
    }

    .translation-preview {
      width: 100%;
      max-width: 920px;
      max-height: none;
      display: flex;
      flex-direction: column;
      gap: 8px;
      box-sizing: border-box;
      border-radius: 6px;
      border: 1px solid var(--bc-border-color);
      background: var(--bc-bg-muted);
      box-shadow: none;
      padding: 8px 34px 8px 10px;
      position: relative;
    }

    .translation-preview__lang {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .translation-preview__label {
      color: var(--bc-color-light);
      font-size: 11px;
      line-height: 1;
      white-space: nowrap;
    }

    .translation-preview__select {
      border: 1px solid var(--bc-border-color);
      border-radius: 4px;
      background: var(--bc-bg-primary);
      color: var(--bc-color);
      font-size: 11px;
      line-height: 1;
      padding: 6px 8px;
      min-width: 170px;
      outline: none;
      cursor: pointer;
    }

    .translation-preview__select:focus {
      border-color: var(--bc-active-color);
      box-shadow: 0 0 0 1px var(--bc-active-color);
    }

    .close-btn {
      border: 0;
      outline: none;
      background: transparent;
      color: var(--bc-color-lighter);
      width: 20px;
      height: 20px;
      border-radius: 4px;
      cursor: pointer;
    }

    .close-btn--corner {
      position: absolute;
      top: 7px;
      right: 6px;
      z-index: 1;
    }

    .close-btn:hover {
      background: var(--bc-bg-hover);
    }

    .translation-preview__loading,
    .translation-preview__error,
    .translation-preview__content {
      border-radius: var(--bc-radius-md);
      background: var(--bc-bg-muted);
      border: 1px solid var(--bc-border-color);
      padding: 8px 10px;
      margin: 0;
      min-height: 44px;
      max-height: min(28vh, 220px);
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
      color: var(--bc-color);
      font-size: 12px;
      line-height: 1.5;
      box-sizing: border-box;
    }

    .translation-preview__loading {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--bc-color-light);
    }

    .translation-preview__loading .bc_jiazai {
      animation: bc-translation-rotate 1s linear infinite;
    }

    @keyframes bc-translation-rotate {
      from {
        transform: rotate(0deg);
      }
      to {
        transform: rotate(360deg);
      }
    }

    .translation-preview__error {
      color: var(--bc-error-color);
    }

    .translation-preview__actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .btn {
      border: 1px solid var(--bc-border-color);
      border-radius: 4px;
      background: var(--bc-bg-primary);
      color: var(--bc-color-light);
      font-size: 11px;
      line-height: 1;
      padding: 6px 10px;
      cursor: pointer;
      user-select: none;
    }

    .btn.btn-primary {
      margin-left: auto;
    }

    .btn:hover {
      background: var(--bc-bg-hover);
    }

    .btn.btn-primary {
      background: var(--bc-active-color);
      border-color: var(--bc-active-color);
      color: #fff;
    }

    .btn.btn-primary:hover {
      filter: brightness(0.95);
    }

    .btn[disabled] {
      opacity: .48;
      cursor: not-allowed;
      pointer-events: none;
    }
  `]
})
export class TranslationPreviewComponent {
  @Input() loading = false;
  @Input() translatedText = "";
  @Input() errorText = "";
  @Input() languages: TranslateLanguageOption[] = [];
  @Input() selectedTargetLang = "";

  @Output() apply = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();
  @Output() targetLangChange = new EventEmitter<string>();

  protected onApply(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.apply.emit();
  }

  protected onClose(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.close.emit();
  }

  protected onTargetLangChange(event: Event) {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    this.targetLangChange.emit(target.value);
  }
}
