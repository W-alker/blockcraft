/** Compact, semantic typography attributes persisted on inline Delta runs. */
export const INLINE_TYPOGRAPHY_ATTRS = {
  fontFamily: "t:ff",
  fontScale: "t:fs",
  letterSpacing: "t:ls",
} as const;

export type InlineTypographyAttr =
  (typeof INLINE_TYPOGRAPHY_ATTRS)[keyof typeof INLINE_TYPOGRAPHY_ATTRS];

export type InlineTypographyKey = "ff" | "fs" | "ls";

export type TypographyFontFamilyId =
  | "sans"
  | "arial"
  | "calibri"
  | "verdana"
  | "tahoma"
  | "hei"
  | "yahei"
  | "pingfang"
  | "serif"
  | "times"
  | "georgia"
  | "simsun"
  | "kai"
  | "fang"
  | "mono";

export interface TypographyFontFamilyOption {
  readonly id: TypographyFontFamilyId;
  readonly label: string;
  readonly css: string;
}

export const INLINE_FONT_SCALE_PRESETS = [
  0.5, 0.625, 0.75, 0.875, 1, 1.125, 1.25, 1.375, 1.5, 1.75, 2, 2.5, 3,
] as const;

export const INLINE_LETTER_SPACING_PRESETS = [
  -0.1, -0.075, -0.05, -0.025, 0.025, 0.05, 0.075, 0.1, 0.15, 0.2, 0.3, 0.4,
  0.5,
] as const;

export const PARAGRAPH_LINE_HEIGHT_PRESETS = [
  1, 1.25, 1.5, 1.75, 2, 2.5,
] as const;

/**
 * Safe, portable font stacks. Documents persist only the short `id`; the CSS
 * stack is resolved at render time so repeated inline runs stay compact.
 */
export const TYPOGRAPHY_FONT_FAMILIES: readonly TypographyFontFamilyOption[] =
  Object.freeze([
    {
      id: "sans",
      label: "系统默认",
      css: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    },
    {
      id: "arial",
      label: "Arial",
      css: 'Arial, Helvetica, "PingFang SC", "Microsoft YaHei", sans-serif',
    },
    {
      id: "calibri",
      label: "Calibri",
      css: 'Calibri, Candara, "Segoe UI", Arial, sans-serif',
    },
    {
      id: "verdana",
      label: "Verdana",
      css: 'Verdana, Geneva, "PingFang SC", "Microsoft YaHei", sans-serif',
    },
    {
      id: "tahoma",
      label: "Tahoma",
      css: 'Tahoma, Geneva, "PingFang SC", "Microsoft YaHei", sans-serif',
    },
    {
      id: "hei",
      label: "黑体",
      css: 'SimHei, "Noto Sans CJK SC", "Source Han Sans SC", sans-serif',
    },
    {
      id: "yahei",
      label: "微软雅黑",
      css: '"Microsoft YaHei", "Noto Sans CJK SC", sans-serif',
    },
    {
      id: "pingfang",
      label: "苹方",
      css: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
    },
    {
      id: "serif",
      label: "通用衬线",
      css: '"Songti SC", "Noto Serif CJK SC", "Source Han Serif SC", SimSun, serif',
    },
    {
      id: "times",
      label: "Times New Roman",
      css: '"Times New Roman", Times, "Songti SC", SimSun, serif',
    },
    {
      id: "georgia",
      label: "Georgia",
      css: 'Georgia, "Times New Roman", "Songti SC", SimSun, serif',
    },
    {
      id: "simsun",
      label: "宋体",
      css: 'SimSun, "Songti SC", "Noto Serif CJK SC", serif',
    },
    {
      id: "kai",
      label: "楷体",
      css: '"Kaiti SC", KaiTi, STKaiti, serif',
    },
    {
      id: "fang",
      label: "仿宋",
      css: 'FangSong, STFangsong, "FangSong_GB2312", serif',
    },
    {
      id: "mono",
      label: "等宽",
      css: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
    },
  ] satisfies TypographyFontFamilyOption[]);

const FAMILY_BY_ID = new Map(
  TYPOGRAPHY_FONT_FAMILIES.map((option) => [option.id, option] as const),
);

const roundCompact = (value: number): number => Math.round(value * 1000) / 1000;

const boundedNumber = (
  value: unknown,
  min: number,
  max: number,
): number | null => {
  const normalized =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(normalized) && normalized >= min && normalized <= max
    ? roundCompact(normalized)
    : null;
};

export const isTypographyFontFamilyId = (
  value: unknown,
): value is TypographyFontFamilyId =>
  typeof value === "string" &&
  FAMILY_BY_ID.has(value as TypographyFontFamilyId);

export const getTypographyFontFamily = (
  id: unknown,
): TypographyFontFamilyOption | null =>
  isTypographyFontFamilyId(id) ? FAMILY_BY_ID.get(id)! : null;

export const resolveTypographyFontFamily = (value: unknown): string | null => {
  const catalog = getTypographyFontFamily(value);
  if (catalog) return catalog.css;

  // Preserve safe legacy root `ff` values without accepting CSS expressions.
  if (typeof value !== "string") return null;
  const legacy = value.trim();
  if (
    !legacy ||
    legacy.length > 256 ||
    /[;{}]|(?:url|var|attr|expression)\s*\(/i.test(legacy)
  )
    return null;
  return legacy;
};

/** Best-effort import bridge for ordinary external HTML font-family styles. */
export const matchTypographyFontFamily = (
  value: unknown,
): TypographyFontFamilyId | null => {
  if (isTypographyFontFamilyId(value)) return value;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) return null;

  for (const option of TYPOGRAPHY_FONT_FAMILIES) {
    if (option.css.toLowerCase().replace(/\s+/g, " ") === normalized) {
      return option.id;
    }
  }
  if (/\b(?:sfmono|consolas|monaco|courier|monospace)\b/i.test(normalized))
    return "mono";
  if (/(?:kaiti|stkaiti|楷体)/i.test(normalized)) return "kai";
  if (/(?:fangsong|仿宋)/i.test(normalized)) return "fang";
  if (/(?:microsoft yahei|微软雅黑)/i.test(normalized)) return "yahei";
  if (/(?:pingfang|hiragino sans gb|苹方)/i.test(normalized)) return "pingfang";
  if (/(?:simsun|宋体)/i.test(normalized)) return "simsun";
  if (/times new roman|\btimes\b/i.test(normalized)) return "times";
  if (/\bgeorgia\b/i.test(normalized)) return "georgia";
  if (/\bcalibri\b/i.test(normalized)) return "calibri";
  if (/\bverdana\b/i.test(normalized)) return "verdana";
  if (/\btahoma\b/i.test(normalized)) return "tahoma";
  if (/\barial\b|\bhelvetica\b/i.test(normalized)) return "arial";
  if (/(?:simhei|heiti|黑体)/i.test(normalized)) return "hei";
  // Match sans before the generic `serif` token (`sans-serif` contains it).
  if (/sans-serif|system-ui/i.test(normalized)) return "sans";
  if (/(?:songti|serif)/i.test(normalized)) return "serif";
  return null;
};

export const normalizeInlineFontScale = (value: unknown): number | null =>
  boundedNumber(value, 0.5, 3);

export const normalizeInlineLetterSpacing = (value: unknown): number | null =>
  boundedNumber(value, -0.1, 0.5);

export const normalizeDocumentFontSize = (value: unknown): number | null =>
  boundedNumber(value, 10, 32);

export const normalizeTypographyLineHeight = (value: unknown): number | null =>
  boundedNumber(value, 1, 3);

/**
 * Produces one canonical inline-format patch and removes its legacy CSS alias.
 * Neutral values are omitted so repeated text runs stay as small as possible.
 */
export const createInlineTypographyPatch = (
  key: InlineTypographyKey,
  value: unknown,
): Record<string, TypographyFontFamilyId | number | null> => {
  switch (key) {
    case "ff": {
      const ff = isTypographyFontFamilyId(value) ? value : null;
      return {
        [INLINE_TYPOGRAPHY_ATTRS.fontFamily]: ff,
        "s:fontFamily": null,
      };
    }
    case "fs": {
      const fs = normalizeInlineFontScale(value);
      return {
        [INLINE_TYPOGRAPHY_ATTRS.fontScale]: fs === 1 ? null : fs,
        "s:fontSize": null,
      };
    }
    case "ls": {
      const ls = normalizeInlineLetterSpacing(value);
      return {
        [INLINE_TYPOGRAPHY_ATTRS.letterSpacing]: ls === 0 ? null : ls,
        "s:letterSpacing": null,
      };
    }
  }
};

export const inlineTypographyCssProperty = (
  key: string,
): "font-family" | "font-size" | "letter-spacing" | null => {
  switch (key) {
    case INLINE_TYPOGRAPHY_ATTRS.fontFamily:
      return "font-family";
    case INLINE_TYPOGRAPHY_ATTRS.fontScale:
      return "font-size";
    case INLINE_TYPOGRAPHY_ATTRS.letterSpacing:
      return "letter-spacing";
    default:
      return null;
  }
};

export const inlineTypographyDatasetKey = (
  key: string,
): "bcFf" | "bcFs" | "bcLs" | null => {
  switch (key) {
    case INLINE_TYPOGRAPHY_ATTRS.fontFamily:
      return "bcFf";
    case INLINE_TYPOGRAPHY_ATTRS.fontScale:
      return "bcFs";
    case INLINE_TYPOGRAPHY_ATTRS.letterSpacing:
      return "bcLs";
    default:
      return null;
  }
};

/** Apply one compact typography attribute to a live or readonly inline shell. */
export const applyInlineTypographyAttribute = (
  element: HTMLElement,
  key: string,
  value: unknown,
): boolean => {
  const property = inlineTypographyCssProperty(key);
  const datasetKey = inlineTypographyDatasetKey(key);
  if (!property || !datasetKey) return false;

  let normalized: TypographyFontFamilyId | number | null = null;
  let cssValue: string | null = null;
  if (key === INLINE_TYPOGRAPHY_ATTRS.fontFamily) {
    normalized = isTypographyFontFamilyId(value) ? value : null;
    cssValue = normalized ? resolveTypographyFontFamily(normalized) : null;
  } else if (key === INLINE_TYPOGRAPHY_ATTRS.fontScale) {
    normalized = normalizeInlineFontScale(value);
    cssValue = normalized === null ? null : `${normalized}em`;
  } else {
    normalized = normalizeInlineLetterSpacing(value);
    cssValue = normalized === null ? null : `${normalized}em`;
  }

  if (normalized === null || cssValue === null) {
    delete element.dataset[datasetKey];
    element.style.removeProperty(property);
  } else {
    element.dataset[datasetKey] = `${normalized}`;
    element.style.setProperty(property, cssValue);
  }
  return true;
};
