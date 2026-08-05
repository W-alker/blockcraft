// packages/editor/framework/modules/pagination/view/table-split.ts
//
// 把引擎的跨页拆分结果（某表格被切成多页的 fragment）映射成「表格内的行断点」：
// 每个续页首槽若是该表格的延续片段（fromOffset>0），就在 fromOffset 对应的行前插一段页缝，
// 把该行及其后的行推到下一页内容区顶。页缝高度复用整块下推的公式 sheet+pageGap−上页usedHeight。
//
// 纯逻辑，可单测。视图层 controller 拿结果调 table.applyPaginationBreaks。

import {
  PaginationResult,
} from "../engine";
import {
  TableCellFlowAnchor,
  TableCellFlowPlan,
} from "../engine/table-cell-flow";
import {TableRowGeom} from "./item-builder";

export interface TableRowBreak {
  beforeRowId: string;
  gap: number;
}

export interface TableCellFlowViewGap {
  cellId: string;
  anchor: TableCellFlowAnchor;
  gap: number;
  backdropOffset: number;
  backdropHeight: number;
}

export interface TableCellFlowViewBreak {
  kind: "cell-flow";
  rowId: string;
  cells: TableCellFlowViewGap[];
  mask: {
    top: number;
    height: number;
    backdropOffset: number;
    backdropHeight: number;
  };
}

export type TableBreak = TableRowBreak | TableCellFlowViewBreak;

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
  cellFlowPlan?: TableCellFlowPlan,
  contentTop = 0,
): TableBreak[] {
  const breaks: TableBreak[] = [];
  const firstTablePage = result.pages.findIndex(page =>
    page.slots.some(slot => slot.id === tableId));
  const flowSegments = cellFlowPlan?.segments ?? [];
  let flowSegmentIndex = 0;
  let rowIndex = 0;
  for (let i = 1; i < result.pages.length; i++) {
    const first = result.pages[i].slots[0];
    if (!first || first.id !== tableId) continue;
    if (!first.fragment || first.fragment.fromOffset <= 0) continue;

    const fromOffset = first.fragment.fromOffset;
    while (
      flowSegmentIndex < flowSegments.length
      && flowSegments[flowSegmentIndex].toOffset < fromOffset - ROW_MATCH_TOLERANCE
    ) {
      flowSegmentIndex++;
    }
    const flowSegment = flowSegments[flowSegmentIndex];
    const flowBreak = flowSegment
      && Math.abs(flowSegment.toOffset - fromOffset) <= ROW_MATCH_TOLERANCE
      ? flowSegment.breakAfter
      : undefined;
    if (flowBreak?.kind === "cell-flow") {
      const previous = result.pages[i - 1];
      const maskHeight = sheetHeightPx + pageGap - previous.usedHeight;
      if (maskHeight <= 0) continue;
      const previousTablePage = Math.max(0, i - 1 - Math.max(0, firstTablePage));
      breaks.push({
        kind: "cell-flow",
        rowId: flowBreak.rowId,
        cells: flowBreak.continuations.map(continuation => ({
          cellId: continuation.cellId,
          anchor: {...continuation.anchor},
          gap: Math.max(0, sheetHeightPx + pageGap - continuation.pageOffset),
          backdropOffset: Math.max(
            0,
            sheetHeightPx - contentTop - continuation.pageOffset,
          ),
          backdropHeight: pageGap,
        })),
        mask: {
          top: previousTablePage * (sheetHeightPx + pageGap) + previous.usedHeight,
          height: maskHeight,
          backdropOffset: Math.max(
            0,
            sheetHeightPx - contentTop - previous.usedHeight,
          ),
          backdropHeight: pageGap,
        },
      });
      continue;
    }
    if (flowBreak?.kind === "row") {
      const gap = sheetHeightPx + pageGap - result.pages[i - 1].usedHeight;
      if (gap > 0) breaks.push({beforeRowId: flowBreak.beforeRowId, gap});
      continue;
    }

    while (
      rowIndex < rows.length
      && rows[rowIndex].top < fromOffset - ROW_MATCH_TOLERANCE
    ) {
      rowIndex++;
    }
    const candidateRow = rows[rowIndex];
    const row = candidateRow
      && Math.abs(candidateRow.top - fromOffset) <= ROW_MATCH_TOLERANCE
      ? candidateRow
      : undefined;
    if (!row) continue;

    const gap = sheetHeightPx + pageGap - result.pages[i - 1].usedHeight;
    if (gap > 0) breaks.push({beforeRowId: row.id, gap});
  }
  return breaks;
}
