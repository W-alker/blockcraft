import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from "@angular/core";
import { NgIf } from "@angular/common";
import { NzDropDownDirective, NzDropdownMenuComponent } from "ng-zorro-antd/dropdown";
import { NzTooltipDirective } from "ng-zorro-antd/tooltip";
import type { TranslateLanguageOption } from "../translate.plugin";

@Component({
  selector: "bc-translation-preview",
  standalone: true,
  imports: [NgIf, NzDropDownDirective, NzDropdownMenuComponent, NzTooltipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    "contenteditable": "false"
  },
  template: `
    <div class="translation-preview" (mousedown)="$event.stopPropagation()">
      <div class="translation-preview__body">
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
      </div>

      <div class="translation-preview__actions">
        @if (displayLanguages.length > 0) {
          <button type="button"
                  class="translation-preview__lang-trigger"
                  nz-dropdown
                  [nzDropdownMenu]="langMenu"
                  nzPlacement="bottomLeft"
                  nzTrigger="click"
                  (mousedown)="onLangTriggerMousedown($event)">
            <span class="translation-preview__lang-badge">
              {{ selectedLanguageLabel }}
              <i class="bc_icon bc_xiajaintou"></i>
            </span>
          </button>
        }
        <span style="flex: 1;"></span>
        <button type="button"
                class="icon-btn icon-btn--apply"
                [disabled]="loading || !translatedText"
                [nz-tooltip]="'替换原文'"
                (mousedown)="onApply($event)">
          <i class="bc_icon bc_xuanzhong"></i>
        </button>
        <button type="button"
                class="icon-btn icon-btn--append"
                [disabled]="loading || !translatedText"
                [nz-tooltip]="'追加到段落后'"
                (mousedown)="onAppend($event)">
          <i class="bc_icon bc_plus"></i>
        </button>
        <button type="button"
                class="icon-btn icon-btn--close"
                [nz-tooltip]="'关闭预览'"
                (mousedown)="onClose($event)">
          <i class="bc_icon bc_guanbi"></i>
        </button>
      </div>

      <nz-dropdown-menu #langMenu="nzDropdownMenu">
        <div class="translation-preview__lang-menu" (mousedown)="onLangMenuMousedown($event)">
          @for (language of displayLanguages; track language.code) {
            <button type="button"
                    class="translation-preview__lang-menu-item"
                    [class.active]="language.code === selectedTargetLang"
                    (mousedown)="onTargetLangSelect($event, language.code)">
              {{ language.label }}
            </button>
          }
        </div>
      </nz-dropdown-menu>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      margin: var(--bc-segments-gap) 0;
      pointer-events: auto;
    }

    .translation-preview {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 4px;
      box-sizing: border-box;
      background: var(--bc-bg-muted);
      border: 0;
      border-left: 3px solid var(--bc-border-color);
      padding: 6px 6px 6px 10px;

      &:hover {
        border-left-color: var(--bc-active-color-light);
      }
    }

    .translation-preview__lang-badge {
      appearance: none;
      -webkit-appearance: none;
      border: 0;
      border-radius: 4px;
      background: rgba(71, 102, 206, 0.14);
      color: #4666ce;
      font-size: 12px;
      font-weight: 500;
      line-height: 1;
      padding: 4px 8px;
      min-width: 58px;
      max-width: 140px;
      outline: none;
      cursor: pointer;
    }

    .translation-preview__lang-badge:focus {
      box-shadow: 0 0 0 1px var(--bc-active-color);
    }

    .translation-preview__loading,
    .translation-preview__error,
    .translation-preview__content {
      border: 0;
      background: transparent;
      padding: 0;
      margin: 0;
      min-height: 0;
      max-height: min(30vh, 220px);
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
      color: #5d6879;
      font-size: 13px;
      line-height: 1.52;
      box-sizing: border-box;
    }

    .translation-preview__loading {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #6d7888;
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
      margin-top: 4px;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .translation-preview__lang-trigger {
      border: 0;
      background: transparent;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 0;
      margin: 0;
      cursor: pointer;
      color: var(--bc-color-light);
    }

    .translation-preview__lang-trigger .bc_xiajaintou {
      font-size: 12px;
      color: #8b94a3;
    }

    .translation-preview__lang-menu {
      min-width: 120px;
      width: 160px;
      max-height: 260px;
      overflow: auto;
      padding: 4px;
      background: var(--bc-bg-primary);
      border: 1px solid var(--bc-border-color);
      border-radius: 6px;
      box-shadow: var(--bc-shadow-lg);
      box-sizing: border-box;

      scrollbar-width: thin;
    }

    .translation-preview__lang-menu-item {
      width: 100%;
      border: 0;
      background: transparent;
      color: var(--bc-color);
      text-align: left;
      font-size: 12px;
      line-height: 1.2;
      padding: 6px 8px;
      border-radius: 4px;
      cursor: pointer;
    }

    .translation-preview__lang-menu-item:hover,
    .translation-preview__lang-menu-item.active {
      background: var(--bc-bg-hover);
      color: var(--bc-active-color);
    }

    .icon-btn {
      border: 1px solid #dfe3e9;
      border-radius: 4px;
      background: var(--bc-bg-secondary);
      color: var(--bc-color);
      width: 22px;
      height: 22px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      font-size: 12px;
      line-height: 1;
      cursor: pointer;
      user-select: none;
    }

    .icon-btn:hover {
      background: #e5e9ef;
    }

    .icon-btn[disabled] {
      opacity: .48;
      cursor: not-allowed;
      pointer-events: none;
    }

    .icon-btn .bc_icon {
      font-size: 12px;
      line-height: 1;
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
  @Output() append = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();
  @Output() targetLangChange = new EventEmitter<string>();

  protected readonly mainstreamLanguageCodes = new Set<string>([
    "chinese_simplified",
    "english",
    "japanese",
    "korean",
    "french",
    "german",
    "spanish",
    "russian",
    "arabic",
    "portuguese",
    "italian",
    "chinese_traditional",
  ]);

  protected get displayLanguages() {
    return this.languages.filter(language => this.mainstreamLanguageCodes.has(language.code));
  }

  protected get selectedLanguageLabel() {
    return this.displayLanguages.find(language => language.code === this.selectedTargetLang)?.label
      || this.displayLanguages[0]?.label
      || "选择语言";
  }

  protected onApply(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.apply.emit();
  }

  protected onAppend(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.append.emit();
  }

  protected onClose(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.close.emit();
  }

  protected onLangTriggerMousedown(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  protected onLangMenuMousedown(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  protected onTargetLangSelect(event: MouseEvent, code: string) {
    event.preventDefault();
    event.stopPropagation();
    this.targetLangChange.emit(code);
  }
}
