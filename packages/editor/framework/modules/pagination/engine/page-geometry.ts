// packages/editor/framework/modules/pagination/engine/page-geometry.ts
import {PageGeometry, PageMargins, PageSizeName} from "./types";

/** 标准纸张尺寸（PDF 点 pt，竖向 width×height，与 tools/export-manager pdfSizes 对齐）。 */
export const PAGE_SIZES: Record<PageSizeName, {width: number; height: number}> = {
  A0: {width: 2384, height: 3370},
  A1: {width: 1684, height: 2384},
  A2: {width: 1191, height: 1684},
  A3: {width: 842, height: 1191},
  A4: {width: 595, height: 842},
  A5: {width: 420, height: 595},
  A6: {width: 298, height: 420},
  Letter: {width: 612, height: 792},
  Legal: {width: 612, height: 1008},
  Tabloid: {width: 792, height: 1224},
};

/** PDF 点 → CSS 像素（默认 96dpi：1pt = 96/72 px）。 */
export function ptToPx(pt: number, dpi = 96): number {
  return (pt * dpi) / 72;
}

/** 解析纸张尺寸；landscape 交换宽高。单位由调用方决定（命名尺寸为 pt）。 */
export function resolvePageDimensions(
  pageSize: PageSizeName | {width: number; height: number},
  orientation: 'portrait' | 'landscape' = 'portrait',
): {width: number; height: number} {
  const base = typeof pageSize === 'string' ? PAGE_SIZES[pageSize] : pageSize;
  return orientation === 'landscape'
    ? {width: base.height, height: base.width}
    : {width: base.width, height: base.height};
}

export interface GeometryInput {
  /** 整页高度（px）。调用方需先把 pt 尺寸用 ptToPx 转好。 */
  pageHeightPx: number;
  /** 页边距（px）。 */
  margins: PageMargins;
  /** 页眉高度（px），缺省 0。 */
  headerHeight?: number;
  /** 页脚高度（px），缺省 0。 */
  footerHeight?: number;
  /** 首页额外顶部占用（px），缺省 0；用于首页特殊留白。 */
  firstPageExtraTop?: number;
}

/**
 * 由整页几何推出每页可用内容高度。
 * 非法配置会被收敛到至少 1px，避免分页算法因非正容量退化。
 */
export function resolveGeometry(input: GeometryInput): PageGeometry {
  const {pageHeightPx, margins, headerHeight = 0, footerHeight = 0, firstPageExtraTop = 0} = input;
  const contentHeight = Math.max(1, pageHeightPx - margins.top - margins.bottom - headerHeight - footerHeight);
  const geometry: PageGeometry = {contentHeight};
  if (firstPageExtraTop > 0) {
    geometry.firstPageContentHeight = Math.max(1, contentHeight - firstPageExtraTop);
  }
  return geometry;
}
