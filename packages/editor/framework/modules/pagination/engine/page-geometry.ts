// packages/editor/framework/modules/pagination/engine/page-geometry.ts
import {PageGeometry, PageMargins, PageSizeName} from "./types";

const MM_TO_PT = 72 / 25.4;
const mmPage = (width: number, height: number): {width: number; height: number} => ({
  width: width * MM_TO_PT,
  height: height * MM_TO_PT,
});

/** 标准纸张尺寸（PDF 点 pt，竖向 width×height，由标准 mm/in 尺寸精确换算）。 */
export const PAGE_SIZES: Record<PageSizeName, {width: number; height: number}> = {
  // 不预先保留两位小数：screen px、CSS mm 与原生 pt 必须来自同一个物理值。
  A0: mmPage(841, 1189),
  A1: mmPage(594, 841),
  A2: mmPage(420, 594),
  A3: mmPage(297, 420),
  A4: mmPage(210, 297),
  A5: mmPage(148, 210),
  A6: mmPage(105, 148),
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
