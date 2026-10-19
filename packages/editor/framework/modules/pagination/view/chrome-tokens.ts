// packages/editor/framework/modules/pagination/view/chrome-tokens.ts
import {PageChrome, PageChromeInlineContent, PageChromeSegments} from "../pagination.types";

export type PageNumberTokenStyle = 'decimal' | 'roman-upper' | 'roman-lower' | 'chinese';

/** 页眉/页脚默认高度（px），当有文本但未显式指定 height 时使用。 */
export const DEFAULT_CHROME_HEIGHT = 24;

/** 页眉/页脚是否有任一段文本。 */
export function hasChromeText(c?: PageChrome): boolean {
  return !!(c && (
    c.left || c.center || c.right ||
    hasInlineContent(c.content?.left) ||
    hasInlineContent(c.content?.center) ||
    hasInlineContent(c.content?.right)
  ));
}

/** 页眉/页脚高度（px）：无文本 = 0；有文本且未给出合法高度时用默认高度。 */
export function chromeHeight(c?: PageChrome): number {
  if (!hasChromeText(c)) return 0;
  const height = c!.height;
  if (height === undefined) return DEFAULT_CHROME_HEIGHT;
  return Number.isFinite(height) && height >= 0
    ? height
    : DEFAULT_CHROME_HEIGHT;
}

/** 把正整数转换为常用罗马数字；超出传统 1..3999 范围时回退十进制。 */
function toRoman(value: number): string {
  if (!Number.isInteger(value) || value <= 0 || value > 3999) return String(value);
  const tokens: ReadonlyArray<readonly [number, string]> = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let rest = value;
  let result = '';
  for (const [number, token] of tokens) {
    while (rest >= number) {
      result += token;
      rest -= number;
    }
  }
  return result;
}

function chineseSection(value: number): string {
  const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const units = ['', '十', '百', '千'];
  let section = value;
  let unitIndex = 0;
  let zeroPending = false;
  let result = '';
  while (section > 0) {
    const digit = section % 10;
    if (digit === 0) {
      zeroPending = result.length > 0;
    } else {
      if (zeroPending) result = `零${result}`;
      result = `${digits[digit]}${units[unitIndex]}${result}`;
      zeroPending = false;
    }
    section = Math.floor(section / 10);
    unitIndex += 1;
  }
  return result.startsWith('一十') ? result.slice(1) : result;
}

/** 把非负整数转换为常用中文数字；超过“亿”级时回退十进制。 */
function toChinese(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value >= 1_000_000_000_000) return String(value);
  if (value === 0) return '零';
  const sectionUnits = ['', '万', '亿'];
  const parts: string[] = [];
  let rest = value;
  let sectionIndex = 0;
  let needsZero = false;
  while (rest > 0) {
    const section = rest % 10_000;
    if (section === 0) {
      needsZero = parts.length > 0;
    } else {
      let part = `${chineseSection(section)}${sectionUnits[sectionIndex]}`;
      if (needsZero || (parts.length > 0 && section < 1000)) part += '零';
      parts.unshift(part);
      needsZero = false;
    }
    rest = Math.floor(rest / 10_000);
    sectionIndex += 1;
  }
  return parts.join('').replace(/零+/g, '零').replace(/零$/g, '');
}

export function formatPageNumber(value: number, style: PageNumberTokenStyle = 'decimal'): string {
  const normalized = Math.max(0, Math.floor(value));
  switch (style) {
    case 'roman-upper': return toRoman(normalized);
    case 'roman-lower': return toRoman(normalized).toLowerCase();
    case 'chinese': return toChinese(normalized);
    default: return String(normalized);
  }
}

/**
 * 替换 `{page}` / `{total}` 占位符（page 为 1 起页码）。
 * 可用 `:roman-upper`、`:roman-lower`、`:chinese` 指定数字样式。
 */
export function substituteTokens(text: string | undefined, page: number, total: number): string {
  if (!text) return '';
  return text.replace(
    /\{(page|total)(?::(decimal|roman-upper|roman-lower|chinese))?\}/g,
    (_token, key: 'page' | 'total', style: PageNumberTokenStyle | undefined) =>
      formatPageNumber(key === 'page' ? page : total, style),
  );
}

/** 解析某一页的三段文本（已替换占位符）。 */
export function resolveChromeSegments(c: PageChrome | undefined, page: number, total: number): PageChromeSegments {
  return {
    left: substituteTokens(c?.left, page, total),
    center: substituteTokens(c?.center, page, total),
    right: substituteTokens(c?.right, page, total),
  };
}

/** 解析结构化文本项中的页码 token；图片项保持原值。 */
export function resolveChromeInlineContent(
  content: PageChromeInlineContent | undefined,
  page: number,
  total: number,
): PageChromeInlineContent | undefined {
  if (!content) return undefined;
  return {
    ...content,
    items: content.items.map(item => item.kind === 'text'
      ? {...item, text: substituteTokens(item.text, page, total)}
      : item),
  };
}

function hasInlineContent(content: PageChromeInlineContent | undefined): boolean {
  return !!content?.items?.some(item => item.kind === 'image' ? !!item.src : !!item.text);
}
