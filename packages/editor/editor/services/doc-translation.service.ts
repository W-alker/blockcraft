import {
  DocTranslateOptions,
  TranslateLanguageOption,
  TranslatePluginService
} from "../../plugins/translate";

type ZvoTranslateResponse = {
  result?: number;
  info?: string;
  text?: unknown;
};

type ZvoLanguageItem = {
  id?: unknown;
  name?: unknown;
  serviceId?: unknown;
};

type ZvoLanguageResponse = {
  result?: number;
  info?: string;
  list?: unknown;
};

const DEFAULT_TRANSLATE_API_URL = "https://api.translate.zvo.cn/translate.json";
const DEFAULT_LANGUAGE_API_URL = "https://api.translate.zvo.cn/language.json";

const ZVO_LANG_MAP: Record<string, string> = {
  auto: "auto",
  en: "english",
  "en-us": "english",
  "en-gb": "english",
  english: "english",
  zh: "chinese_simplified",
  "zh-cn": "chinese_simplified",
  "zh-hans": "chinese_simplified",
  chinese_simplified: "chinese_simplified",
  "zh-tw": "chinese_traditional",
  "zh-hk": "chinese_traditional",
  "zh-hant": "chinese_traditional",
  chinese_traditional: "chinese_traditional",
  ja: "japanese",
  japanese: "japanese",
  ko: "korean",
  korean: "korean",
  fr: "french",
  french: "french",
  de: "german",
  german: "german",
  es: "spanish",
  spanish: "spanish",
  ru: "russian",
  russian: "russian",
};

export interface ZvoDocTranslationServiceOptions {
  apiUrl?: string;
  languageApiUrl?: string;
}

export class MyDocTranslationService implements TranslatePluginService {
  private readonly translateApiUrl: string;
  private readonly languageApiUrl: string;

  constructor(options: ZvoDocTranslationServiceOptions = {}) {
    this.translateApiUrl = options.apiUrl || DEFAULT_TRANSLATE_API_URL;
    this.languageApiUrl = options.languageApiUrl || this.resolveLanguageApiUrl(this.translateApiUrl);
  }

  async translate(text: string, options: DocTranslateOptions): Promise<string> {
    const payload = new URLSearchParams();
    payload.set("from", this.normalizeLang(options.sourceLang || "auto"));
    payload.set("to", this.normalizeLang(options.targetLang));
    payload.set("text", JSON.stringify([text]));

    const response = await fetch(this.translateApiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: payload.toString(),
    });

    if (!response.ok) {
      throw new Error(`翻译请求失败（HTTP ${response.status}）`);
    }

    const data = await response.json() as ZvoTranslateResponse;
    if (data.result !== 1) {
      throw new Error(data.info || "翻译失败，请稍后重试");
    }

    return this.pickTranslatedText(data.text);
  }

  async getSupportedLanguages(): Promise<TranslateLanguageOption[]> {
    const response = await fetch(this.languageApiUrl, { method: "GET" });
    if (!response.ok) {
      throw new Error(`获取翻译语言失败（HTTP ${response.status}）`);
    }

    const data = await response.json() as ZvoLanguageResponse;
    if (data.result !== 1) {
      throw new Error(data.info || "获取翻译语言失败");
    }

    return this.pickLanguages(data.list);
  }

  private normalizeLang(lang: string) {
    const normalized = lang.trim().toLowerCase();
    if (!normalized) return "auto";
    return ZVO_LANG_MAP[normalized] || normalized;
  }

  private resolveLanguageApiUrl(translateApiUrl: string) {
    if (translateApiUrl.endsWith("/translate.json")) {
      return `${translateApiUrl.slice(0, -"/translate.json".length)}/language.json`;
    }
    return DEFAULT_LANGUAGE_API_URL;
  }

  private pickTranslatedText(textField: unknown): string {
    if (!Array.isArray(textField)) {
      return "";
    }

    return textField
      .map(item => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  private pickLanguages(listField: unknown): TranslateLanguageOption[] {
    if (!Array.isArray(listField)) {
      return [];
    }

    const languageMap = new Map<string, TranslateLanguageOption>();

    for (const item of listField) {
      if (!item || typeof item !== "object") continue;
      const language = item as ZvoLanguageItem;
      const code = typeof language.id === "string" ? language.id.trim() : "";
      if (!code || languageMap.has(code)) continue;
      const label = typeof language.name === "string" && language.name.trim()
        ? language.name.trim()
        : code;
      const serviceCode = typeof language.serviceId === "string" && language.serviceId.trim()
        ? language.serviceId.trim()
        : undefined;

      languageMap.set(code, {
        code,
        label,
        serviceCode,
      });
    }

    return Array.from(languageMap.values());
  }
}
