// packages/editor/framework/modules/pagination/view/chrome-tokens.ts
import {PageChrome, PageChromeSegments} from "../pagination.types";

/** 页眉/页脚默认高度（px），当有文本但未显式指定 height 时使用。 */
export const DEFAULT_CHROME_HEIGHT = 24;

/** 页眉/页脚是否有任一段文本。 */
export function hasChromeText(c?: PageChrome): boolean {
  return !!(c && (c.left || c.center || c.right));
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

/** 替换 `{page}` / `{total}` 占位符（page 为 1 起页码）。 */
export function substituteTokens(text: string | undefined, page: number, total: number): string {
  if (!text) return '';
  return text.replace(/\{page\}/g, String(page)).replace(/\{total\}/g, String(total));
}

/** 解析某一页的三段文本（已替换占位符）。 */
export function resolveChromeSegments(c: PageChrome | undefined, page: number, total: number): PageChromeSegments {
  return {
    left: substituteTokens(c?.left, page, total),
    center: substituteTokens(c?.center, page, total),
    right: substituteTokens(c?.right, page, total),
  };
}
