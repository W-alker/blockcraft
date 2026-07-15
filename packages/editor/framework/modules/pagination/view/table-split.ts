// packages/editor/framework/modules/pagination/view/table-split.ts
//
// 把引擎的跨页拆分结果（某表格被切成多页的 fragment）映射成「表格内的行断点」：
// 每个续页首槽若是该表格的延续片段（fromOffset>0），就在 fromOffset 对应的行前插一段页缝，
// 把该行及其后的行推到下一页内容区顶。页缝高度复用整块下推的公式 sheet+pageGap−上页usedHeight。
//
// 纯逻辑，可单测。视图层 controller 拿结果调 table.applyPaginationBreaks。

import {PaginationResult} from "../engine";
import {TableRowGeom} from "./item-builder";

export interface TableBreak {
  beforeRowId: string;
  gap: number;
}

/** 切点偏移→行的匹配容差（px）：cuts 来自行底边、行连续，理论精确，留 2px 抗 border-collapse 边线与亚像素。 */
const ROW_MATCH_TOLERANCE = 2;

/**
 * 计算某个表格的屏幕分页行断点。
 * @param tableId 目标表格块 id
 * @param rows 表格行自然几何（top/bottom 相对表格 host 顶，已扣占位）
 * @param result 引擎分页结果
 * @param sheetHeightPx 单张纸高（px）
 * @param pageGap 屏幕纸间距（px）
 */
export function computeTableBreaks(
  tableId: string,
  rows: TableRowGeom[],
  result: PaginationResult,
  sheetHeightPx: number,
  pageGap: number,
): TableBreak[] {
  const breaks: TableBreak[] = [];
  for (let i = 1; i < result.pages.length; i++) {
    const first = result.pages[i].slots[0];
    if (!first || first.id !== tableId) continue;
    if (!first.fragment || first.fragment.fromOffset <= 0) continue;

    const fromOffset = first.fragment.fromOffset;
    const row = rows.find(r => Math.abs(r.top - fromOffset) <= ROW_MATCH_TOLERANCE);
    if (!row) continue;

    const gap = sheetHeightPx + pageGap - result.pages[i - 1].usedHeight;
    if (gap > 0) breaks.push({beforeRowId: row.id, gap});
  }
  return breaks;
}
