// packages/editor/framework/modules/pagination/view/pagination-geometry.ts
import {ptToPx, resolveGeometry, resolvePageDimensions, PageMargins} from "../engine";
import {PaginationConfig, ResolvedPaginationGeometry} from "../pagination.types";
import {chromeHeight} from "./chrome-tokens";

const DEFAULT_MARGIN = 72;   // px (~0.75in @96dpi)
const DEFAULT_PAGE_GAP = 24; // px

export function resolveMargins(m?: Partial<PageMargins>): PageMargins {
  return {
    top: Math.max(0, m?.top ?? DEFAULT_MARGIN),
    right: Math.max(0, m?.right ?? DEFAULT_MARGIN),
    bottom: Math.max(0, m?.bottom ?? DEFAULT_MARGIN),
    left: Math.max(0, m?.left ?? DEFAULT_MARGIN),
  };
}

export function resolveScreenGeometry(config: PaginationConfig): ResolvedPaginationGeometry {
  const pageSize = config.pageSize ?? 'A4';
  const isNamed = typeof pageSize === 'string';
  const rawDims = resolvePageDimensions(pageSize, config.orientation ?? 'portrait');
  const dims = {width: Math.max(1, rawDims.width), height: Math.max(1, rawDims.height)};
  // 命名尺寸是 pt → 转 px；自定义尺寸视为已是 px。
  const sheetWidthPx = isNamed ? Math.round(ptToPx(dims.width)) : dims.width;
  const sheetHeightPx = isNamed ? Math.round(ptToPx(dims.height)) : dims.height;
  const margins = resolveMargins(config.margins);
  const pageGap = Math.max(0, config.pageGap ?? DEFAULT_PAGE_GAP);
  const headerHeight = chromeHeight(config.header);
  const footerHeight = chromeHeight(config.footer);
  const geometry = resolveGeometry({pageHeightPx: sheetHeightPx, margins, headerHeight, footerHeight});
  return {sheetWidthPx, sheetHeightPx, margins, pageGap, headerHeight, footerHeight, geometry};
}
