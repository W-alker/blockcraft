import {
  ApplicationRef,
  ComponentRef,
  createComponent,
  EnvironmentInjector
} from "@angular/core";
import { Subject, take, takeUntil } from "rxjs";
import {
  DocPlugin,
  EditableBlockComponent,
  STR_LINE_BREAK
} from "../../framework";
import {
  BlockControllerPluginOptions,
  BlockMenuActionEvent,
  BlockMenuActionHandler,
  BlockMenuContext,
  BlockMenuResolver,
  BlockMenuSection
} from "../block-controller";
import { TranslationPreviewComponent } from "./widgets/translation-preview.component";

const TRANSLATE_MENU_NAMES = {
  translateParagraph: "translate-paragraph",
} as const;

const MAINSTREAM_TRANSLATE_LANGUAGE_CODES = new Set<string>([
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

export interface DocTranslateOptions {
  sourceLang?: string;
  targetLang: string;
}

export interface TranslateLanguageOption {
  code: string;
  label: string;
  serviceCode?: string;
}

export interface TranslatePluginService {
  translate(text: string, options: DocTranslateOptions): Promise<string>;
  getSupportedLanguages(): Promise<TranslateLanguageOption[]>;
}

export interface TranslatePluginOptions {
  sourceLang?: string;
  /**
   * @deprecated Use defaultTargetLang instead.
   */
  targetLang?: string;
  defaultTargetLang?: string;
  targetLangWhenSourceIsChinese?: string;
  menuSectionTitle?: string;
  menuLabel?: string;
  menuIcon?: string;
  persistLastTargetLang?: boolean;
  targetLangStorageKey?: string;
  service?: TranslatePluginService;
}

interface TranslateParagraphOptions {
  reusePreview?: boolean;
}

export class TranslatePlugin extends DocPlugin {
  override name = "translate-plugin";
  override version = 1.0;

  private readonly options: {
    sourceLang: string;
    defaultTargetLang: string;
    targetLangWhenSourceIsChinese: string;
    menuSectionTitle: string;
    menuLabel: string;
    menuIcon: string;
    persistLastTargetLang: boolean;
    targetLangStorageKey: string;
  };
  private translationService: TranslatePluginService | null;
  private _supportedLanguages: TranslateLanguageOption[] = [];
  private _selectedTargetLang = "";
  private _persistedTargetLang: string | null = null;

  private _previewRef: ComponentRef<TranslationPreviewComponent> | null = null;
  private _closePreview$ = new Subject<void>();
  private _activeEditableBlock: EditableBlockComponent | null = null;
  private _translatedText = "";
  private _translateRequestId = 0;

  constructor(options: TranslatePluginOptions = {}) {
    super();
    const defaultTargetLang = options.defaultTargetLang || options.targetLang || "chinese_simplified";
    this.options = {
      sourceLang: options.sourceLang || "auto",
      defaultTargetLang,
      targetLangWhenSourceIsChinese: options.targetLangWhenSourceIsChinese || "chinese_simplified",
      menuSectionTitle: options.menuSectionTitle || "翻译",
      menuLabel: options.menuLabel || "翻译段落",
      menuIcon: options.menuIcon || "bc_fanyi",
      persistLastTargetLang: options.persistLastTargetLang !== false,
      targetLangStorageKey: options.targetLangStorageKey || "blockcraft.translate.lastTargetLang",
    };
    this.translationService = options.service || null;
    this._selectedTargetLang = this.options.defaultTargetLang;
  }

  init() {
    this.restorePersistedTargetLang();
    void this.loadSupportedLanguages();
    this.doc.subscribeReadonlyChange(v => {
      if (v) this.closePreview();
    });
    this.doc.onDestroy$.pipe(take(1)).subscribe(() => this.closePreview());
  }

  setService(service: TranslatePluginService | null) {
    this.translationService = service;
    void this.loadSupportedLanguages();
  }

  createBlockControllerOptions(): Pick<BlockControllerPluginOptions, "blockMenuResolver" | "blockMenuActionHandler"> {
    return {
      blockMenuResolver: this.blockMenuResolver,
      blockMenuActionHandler: this.blockMenuActionHandler,
    };
  }

  private blockMenuResolver: BlockMenuResolver = (ctx: BlockMenuContext): BlockMenuSection[] => {
    if (!this.translationService || !this.doc.isEditable(ctx.activeBlock)) return [];
    return [
      {
        key: "translate-tools",
        title: this.options.menuSectionTitle,
        items: [
          {
            type: "simple",
            name: TRANSLATE_MENU_NAMES.translateParagraph,
            label: this.options.menuLabel,
            icon: this.options.menuIcon,
          }
        ],
      }
    ];
  };

  private blockMenuActionHandler: BlockMenuActionHandler = (event: BlockMenuActionEvent, ctx: BlockMenuContext) => {
    if (event.item.name !== TRANSLATE_MENU_NAMES.translateParagraph || event.source !== "simple") {
      return false;
    }
    if (!this.doc.isEditable(ctx.activeBlock)) {
      return false;
    }
    void this.translateParagraph(ctx.activeBlock);
    return true;
  };

  private async translateParagraph(block: EditableBlockComponent, options: TranslateParagraphOptions = {}) {
    if (!this.translationService) {
      this.doc.messageService.warn("未配置翻译服务");
      return;
    }
    const sourceText = block.textContent();
    if (!sourceText.trim()) {
      this.doc.messageService.warn("当前段落为空，无法翻译");
      return;
    }

    if (!options.reusePreview) {
      this._selectedTargetLang = this.resolvePersistedTargetLang()
        || this.resolveDefaultTargetLang(sourceText);
    }

    if (!options.reusePreview || !this._previewRef || this._activeEditableBlock?.id !== block.id) {
      this.openPreview(block);
    }
    const targetLang = this._selectedTargetLang || this.options.defaultTargetLang;
    this._selectedTargetLang = targetLang;
    this._previewRef?.setInput("selectedTargetLang", targetLang);
    const requestId = ++this._translateRequestId;
    this._translatedText = "";
    this._previewRef?.setInput("loading", true);
    this._previewRef?.setInput("errorText", "");
    this._previewRef?.setInput("translatedText", "");

    try {
      const translated = await this.translationService.translate(sourceText, {
        sourceLang: this.options.sourceLang,
        targetLang,
      });
      if (requestId !== this._translateRequestId) return;
      if (!this._previewRef || this._activeEditableBlock?.id !== block.id) return;
      const resultText = (translated || "").trim();
      this._translatedText = resultText;
      if (!resultText) {
        this._previewRef.setInput("errorText", "翻译返回为空，请稍后重试");
        return;
      }
      this._previewRef.setInput("translatedText", resultText);
    } catch (error) {
      if (requestId !== this._translateRequestId) return;
      const errorMessage = error instanceof Error ? error.message : "翻译失败，请稍后重试";
      this._previewRef?.setInput("errorText", errorMessage);
    } finally {
      if (requestId !== this._translateRequestId) return;
      this._previewRef?.setInput("loading", false);
    }
  }

  private openPreview(block: EditableBlockComponent) {
    this.closePreview();

    this._activeEditableBlock = block;
    this._closePreview$ = new Subject<void>();
    const mounted = this.mountInlinePreview(block);
    if (!mounted) {
      this.doc.messageService.warn("无法创建翻译区域");
      this.resetPreviewState();
      return;
    }

    const appRef = this.doc.injector.get(ApplicationRef);
    this._previewRef = mounted.componentRef;
    this._closePreview$.pipe(take(1)).subscribe(() => {
      appRef.detachView(mounted.componentRef.hostView);
      mounted.componentRef.destroy();
      mounted.hostElement.remove();
      this.resetPreviewState();
    });

    this._previewRef.setInput("loading", true);
    this._previewRef.setInput("translatedText", "");
    this._previewRef.setInput("errorText", "");
    this.syncPreviewLanguageInputs();

    this._previewRef.instance.close.pipe(takeUntil(this._closePreview$)).subscribe(() => {
      this.closePreview();
    });

    this._previewRef.instance.targetLangChange.pipe(takeUntil(this._closePreview$)).subscribe(code => {
      const nextCode = this.findLanguageCode(code) || code;
      if (!nextCode || nextCode === this._selectedTargetLang || !this._activeEditableBlock) {
        return;
      }
      this._selectedTargetLang = nextCode;
      this.persistLastTargetLang(nextCode);
      this._previewRef?.setInput("selectedTargetLang", this._selectedTargetLang);
      void this.translateParagraph(this._activeEditableBlock, { reusePreview: true });
    });

    this._previewRef.instance.apply.pipe(takeUntil(this._closePreview$)).subscribe(() => {
      this.replaceOriginalText();
    });

    this._previewRef.instance.append.pipe(takeUntil(this._closePreview$)).subscribe(() => {
      this.appendTranslatedText();
    });

    block.onDestroy$.pipe(takeUntil(this._closePreview$)).subscribe(() => {
      this.closePreview();
    });
  }

  private replaceOriginalText() {
    if (!this._activeEditableBlock) return;
    if (!this._translatedText.trim()) {
      this.doc.messageService.warn("当前没有可替换的翻译结果");
      return;
    }
    const block = this._activeEditableBlock;
    block.replaceText(0, block.textLength, this._translatedText);
    block.setInlineRange(this._translatedText.length);
    this.doc.messageService.success("已替换为翻译结果");
    this.closePreview();
  }

  private appendTranslatedText() {
    if (!this._activeEditableBlock) return;
    if (!this._translatedText.trim()) {
      this.doc.messageService.warn("当前没有可追加的翻译结果");
      return;
    }

    const block = this._activeEditableBlock;
    const startIndex = block.textLength;
    const separator = startIndex > 0 && !block.textContent().endsWith(STR_LINE_BREAK)
      ? STR_LINE_BREAK
      : "";
    const appendedText = `${separator}${this._translatedText}`;

    block.insertText(startIndex, appendedText);
    block.setInlineRange(startIndex + appendedText.length);
    this.doc.messageService.success("已将翻译结果追加到段落后");
    this.closePreview();
  }

  private closePreview() {
    this._translateRequestId += 1;
    this._closePreview$.next();
  }

  destroy() {
    this.closePreview();
  }

  private async loadSupportedLanguages() {
    if (!this.translationService) {
      this._supportedLanguages = [];
      this._selectedTargetLang = this.options.defaultTargetLang;
      this.syncPreviewLanguageInputs();
      return;
    }

    try {
      const languages = await this.translationService.getSupportedLanguages();
      this._supportedLanguages = this.normalizeLanguages(languages);
    } catch {
      this._supportedLanguages = [];
    }

    this.ensureSelectedTargetLang();
    this.syncPreviewLanguageInputs();
  }

  private normalizeLanguages(languages: TranslateLanguageOption[]): TranslateLanguageOption[] {
    const map = new Map<string, TranslateLanguageOption>();
    for (const language of languages) {
      const code = language.code?.trim();
      if (!code) continue;
      if (!MAINSTREAM_TRANSLATE_LANGUAGE_CODES.has(code)) continue;
      if (map.has(code)) continue;
      map.set(code, {
        code,
        label: language.label?.trim() || code,
        serviceCode: language.serviceCode?.trim() || undefined,
      });
    }
    return Array.from(map.values());
  }

  private ensureSelectedTargetLang() {
    if (!this._supportedLanguages.length) {
      this._selectedTargetLang = this.options.defaultTargetLang;
      return;
    }

    this._selectedTargetLang = this.findLanguageCode(this._selectedTargetLang)
      || this.resolvePersistedTargetLang()
      || this.findLanguageCode(this.options.defaultTargetLang)
      || this.findLanguageCode("chinese_simplified")
      || this.findLanguageCode("english")
      || this._supportedLanguages[0].code;
  }

  private findLanguageCode(code: string): string | null {
    const normalized = code.trim().toLowerCase();
    if (!normalized) return null;
    const matched = this._supportedLanguages.find(language => {
      return language.code.toLowerCase() === normalized
        || language.serviceCode?.toLowerCase() === normalized;
    });
    return matched?.code || null;
  }

  private syncPreviewLanguageInputs() {
    this._previewRef?.setInput("languages", this._supportedLanguages);
    this._previewRef?.setInput("selectedTargetLang", this._selectedTargetLang);
  }

  private resolveDefaultTargetLang(sourceText: string) {
    const defaultTargetLang = this.findLanguageCode(this.options.defaultTargetLang)
      || this.options.defaultTargetLang;
    const chineseSourceTargetLang = this.findLanguageCode(this.options.targetLangWhenSourceIsChinese)
      || this.options.targetLangWhenSourceIsChinese;
    if (this.isChineseText(sourceText)) {
      return chineseSourceTargetLang;
    }
    return defaultTargetLang;
  }

  private isChineseText(text: string) {
    return /[\u3400-\u9FFF]/.test(text);
  }

  private resolvePersistedTargetLang() {
    if (!this._persistedTargetLang) return null;
    return this.findLanguageCode(this._persistedTargetLang) || this._persistedTargetLang;
  }

  private persistLastTargetLang(targetLang: string) {
    if (!this.options.persistLastTargetLang) return;
    const normalized = targetLang.trim();
    if (!normalized) return;
    this._persistedTargetLang = normalized;
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(this.options.targetLangStorageKey, normalized);
    } catch {
      // ignore storage errors
    }
  }

  private restorePersistedTargetLang() {
    if (!this.options.persistLastTargetLang) return;
    if (typeof window === "undefined") return;
    try {
      const value = window.localStorage.getItem(this.options.targetLangStorageKey);
      if (!value) return;
      const normalized = value.trim();
      if (!normalized) return;
      this._persistedTargetLang = normalized;
      this._selectedTargetLang = normalized;
    } catch {
      // ignore storage errors
    }
  }

  private mountInlinePreview(block: EditableBlockComponent): {
    componentRef: ComponentRef<TranslationPreviewComponent>;
    hostElement: HTMLElement;
  } | null {
    const parent = block.hostElement.parentElement;
    if (!parent) return null;

    const hostElement = document.createElement("div");
    hostElement.classList.add("bc-translation-inline-host");
    hostElement.setAttribute("contenteditable", "false");
    block.hostElement.insertAdjacentElement("afterend", hostElement);

    const environmentInjector = this.doc.injector.get(EnvironmentInjector);
    const componentRef = createComponent(TranslationPreviewComponent, {
      environmentInjector,
      elementInjector: this.doc.injector,
      hostElement
    });
    const appRef = this.doc.injector.get(ApplicationRef);
    appRef.attachView(componentRef.hostView);

    return {
      componentRef,
      hostElement,
    };
  }

  private resetPreviewState() {
    this._previewRef = null;
    this._activeEditableBlock = null;
    this._translatedText = "";
  }
}
