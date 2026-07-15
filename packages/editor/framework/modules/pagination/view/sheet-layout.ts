// packages/editor/framework/modules/pagination/view/sheet-layout.ts
import {PaginationResult} from "../engine";

export interface SheetRect {
  top: number;
  height: number;
}

/** 各纸张在滚动内容坐标系里的矩形（顶/高，px）。 */
export function computeSheetRects(pageCount: number, sheetHeightPx: number, pageGap: number): SheetRect[] {
  const rects: SheetRect[] = [];
  for (let i = 0; i < pageCount; i++) {
    rects.push({top: i * (sheetHeightPx + pageGap), height: sheetHeightPx});
  }
  return rects;
}

/** 背景层总高（px）。 */
export function computeBackdropHeight(pageCount: number, sheetHeightPx: number, pageGap: number): number {
  if (pageCount <= 0) return 0;
  return pageCount * sheetHeightPx + (pageCount - 1) * pageGap;
}

/**
 * 每页首块（页 index ≥ 1）需要的 margin-top 下推（px）。
 * gap = sheetHeightPx + pageGap − 上一页 usedHeight。
 * 跳过：页无 slot、或首 slot 是延续片段（fragment.fromOffset > 0，块在上页就开始了）。
 */
export function computeBlockGaps(result: PaginationResult, sheetHeightPx: number, pageGap: number): Map<string, number> {
  const gaps = new Map<string, number>();
  for (let i = 1; i < result.pages.length; i++) {
    const firstSlot = result.pages[i].slots[0];
    if (!firstSlot) continue;
    if (firstSlot.fragment && firstSlot.fragment.fromOffset > 0) continue;
    const prevUsed = result.pages[i - 1].usedHeight;
    const gap = sheetHeightPx + pageGap - prevUsed;
    if (gap > 0) gaps.set(firstSlot.id, gap);
  }
  return gaps;
}
