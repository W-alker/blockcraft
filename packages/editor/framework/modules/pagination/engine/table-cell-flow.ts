/**
 * 超高表格行的纯分页规划器。
 *
 * 表格通常只能在行边界分页；当单行本身高于内容区时，需要让同一逻辑单元格在不同纸张上继续流动。
 * 本模块只处理几何与安全锚点，不读取 DOM、也不修改 Yjs。视图层随后把 cell-flow 断点投影成
 * 单元格内的零模型长度页缝。
 */

const EPSILON = 0.01;

export type TableCellFlowAnchor =
  | {kind: "cell-start"}
  | {kind: "block"; blockId: string}
  | {kind: "text"; blockId: string; offset: number}
  | {kind: "cell-end"};

/** 单元格自然流中的一个安全切点；offset 相对当前表格行顶边。 */
export interface TableCellFlowPoint {
  offset: number;
  anchor: TableCellFlowAnchor;
  /**
   * 选中该切点时，本页在真实锚点之后还必须保留的安全高度。
   * 它只计入页面/片段的视觉推进，不改变 anchor offset 和 continuation.pageOffset。
   */
  requiredTail?: number;
}

export interface TableCellFlowInput {
  cellId: string;
  /** 第一个点之前的续排锚点。通常投影为单元格 children 容器的首位。 */
  startAnchor?: TableCellFlowAnchor;
  /** 严格递增，最后一个点必须是 cell-end。 */
  points: readonly TableCellFlowPoint[];
}

export type TableFlowRowInput =
  | {
      kind: "atomic";
      rowId: string;
      height: number;
    }
  | {
      kind: "cell-flow";
      rowId: string;
      cells: readonly TableCellFlowInput[];
    };

export interface TableCellContinuation {
  cellId: string;
  anchor: TableCellFlowAnchor;
  /** 锚点在上一张纸内容区内的 y；据此算出把后续内容推到下一页所需的视图页缝。 */
  pageOffset: number;
}

export type TableFlowBreak =
  | {
      kind: "row";
      beforeRowId: string;
    }
  | {
      kind: "cell-flow";
      rowId: string;
      continuations: TableCellContinuation[];
    };

export interface TableFlowSegment {
  fromOffset: number;
  toOffset: number;
  height: number;
  /** 存在时表示该片段后强制换页。 */
  breakAfter?: TableFlowBreak;
}

export interface TableCellFlowPlan {
  /** 供分页引擎消费的虚拟流高度；多列错位切点可能使它大于表格自然高度。 */
  paginationHeight: number;
  segments: TableFlowSegment[];
  splitOffsets: number[];
}

export class TableCellFlowPlanningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TableCellFlowPlanningError";
  }
}

interface CellCursor {
  input: TableCellFlowInput;
  pointIndex: number;
  offset: number;
  anchor: TableCellFlowAnchor;
  ended: boolean;
}

interface PointSelection {
  point?: TableCellFlowPoint;
  pointIndex: number;
  /** 单元格自然内容流中的真实推进量。 */
  delta: number;
  /** 计入 requiredTail 后的页面/虚拟片段推进量。 */
  pageAdvance: number;
  /** Advance only through the empty prefix before the first child block. */
  emptyPrefix?: boolean;
}

/**
 * 用同一页的剩余高度并行推进每个单元格：各列可落在不同安全锚点，片段高度取本轮最大推进量。
 * 这样不会切断块或文字行，也不会要求不同单元格恰好拥有相同 y 的切点。
 */
export function planTableCellFlow(
  rows: readonly TableFlowRowInput[],
  contentHeight: number,
): TableCellFlowPlan {
  if (!Number.isFinite(contentHeight) || contentHeight <= 0) {
    throw new TableCellFlowPlanningError(`contentHeight 必须为正数，当前为 ${contentHeight}`);
  }

  rows.forEach(validateRow);

  const segments: TableFlowSegment[] = [];
  let pageUsed = 0;
  let syntheticOffset = 0;

  const commitPage = (breakAfter?: TableFlowBreak): void => {
    if (pageUsed <= EPSILON) {
      throw new TableCellFlowPlanningError("无法提交空分页片段");
    }
    const fromOffset = syntheticOffset;
    syntheticOffset += pageUsed;
    segments.push({
      fromOffset,
      toOffset: syntheticOffset,
      height: pageUsed,
      ...(breakAfter ? {breakAfter} : {}),
    });
    pageUsed = 0;
  };

  for (const row of rows) {
    if (row.kind === "atomic") {
      if (row.height > contentHeight + EPSILON) {
        throw new TableCellFlowPlanningError(
          `原子行 ${row.rowId} 高 ${row.height}px，超过内容区 ${contentHeight}px，需先提供单元格安全切点或降级锁高`,
        );
      }
      if (pageUsed > EPSILON && pageUsed + row.height > contentHeight + EPSILON) {
        commitPage({kind: "row", beforeRowId: row.rowId});
      }
      pageUsed += row.height;
      continue;
    }

    const cursors = row.cells.map<CellCursor>(cell => ({
      input: cell,
      pointIndex: -1,
      offset: 0,
      anchor: cell.startAnchor ?? {kind: "cell-start"},
      ended: false,
    }));

    while (cursors.some(cursor => !cursor.ended)) {
      const remaining = contentHeight - pageUsed;
      const rowPageStart = pageUsed;
      const selections = cursors.map(cursor => selectPoint(cursor, remaining));
      const progress = selections.reduce(
        (max, selection) => Math.max(max, selection.pageAdvance),
        0,
      );

      if (progress <= EPSILON) {
        // 当前页已有前序行时，先把整行移到下一页再重新尝试。
        if (pageUsed > EPSILON && cursors.every(cursor => cursor.offset <= EPSILON)) {
          commitPage({kind: "row", beforeRowId: row.rowId});
          continue;
        }
        throw new TableCellFlowPlanningError(
          `表格行 ${row.rowId} 在 ${contentHeight}px 内容区内没有可前进的安全切点，需对不可拆原子内容应用锁高降级`,
        );
      }

      selections.forEach((selection, index) => {
        const cursor = cursors[index];
        if (!selection.point) {
          if (selection.emptyPrefix) cursor.offset += selection.delta;
          return;
        }
        cursor.pointIndex = selection.pointIndex;
        cursor.offset = selection.point.offset;
        cursor.anchor = cloneAnchor(selection.point.anchor);
        cursor.ended = selection.point.anchor.kind === "cell-end";
      });
      pageUsed += progress;

      const unfinished = cursors.filter(cursor => !cursor.ended);
      if (unfinished.length === 0) continue;

      const continuations: TableCellContinuation[] = [];
      cursors.forEach((cursor, index) => {
        if (cursor.ended) return;
        continuations.push({
          cellId: cursor.input.cellId,
          anchor: cloneAnchor(cursor.anchor),
          pageOffset: rowPageStart + selections[index].delta,
        });
      });
      commitPage({kind: "cell-flow", rowId: row.rowId, continuations});
    }
  }

  if (pageUsed > EPSILON) commitPage();

  return {
    paginationHeight: syntheticOffset,
    segments,
    splitOffsets: segments.filter(segment => segment.breakAfter).map(segment => segment.toOffset),
  };
}

export function cloneTableCellFlowPlan(plan: TableCellFlowPlan): TableCellFlowPlan {
  return {
    paginationHeight: plan.paginationHeight,
    splitOffsets: [...plan.splitOffsets],
    segments: plan.segments.map(segment => ({
      ...segment,
      ...(segment.breakAfter
        ? {breakAfter: cloneBreak(segment.breakAfter)}
        : {}),
    })),
  };
}

function selectPoint(
  cursor: CellCursor,
  remaining: number,
): PointSelection {
  if (cursor.ended) {
    return {pointIndex: cursor.pointIndex, delta: 0, pageAdvance: 0};
  }

  let selectedIndex = cursor.pointIndex;
  let selectedDelta = 0;
  let selectedPageAdvance = 0;
  for (let index = cursor.pointIndex + 1; index < cursor.input.points.length; index++) {
    const point = cursor.input.points[index];
    const delta = point.offset - cursor.offset;
    if (delta > remaining + EPSILON) break;
    const pageAdvance = delta + (point.requiredTail ?? 0);
    // A guarded text point can fail while a later unguarded cell-end still
    // fits. Keep scanning instead of breaking on the guard alone.
    if (pageAdvance > remaining + EPSILON) continue;
    selectedIndex = index;
    selectedDelta = delta;
    selectedPageAdvance = pageAdvance;
  }
  if (selectedIndex === cursor.pointIndex) {
    const nextPoint = cursor.input.points[cursor.pointIndex + 1];
    // A vertically aligned short cell can have more than one page of empty
    // space before its first child. That prefix is safe to consume page by
    // page while the continuation stays anchored at cell-start. This is
    // deliberately limited to the first block boundary: applying the same
    // rule between later points could split a real oversized atomic child.
    if (
      remaining > EPSILON
      && cursor.anchor.kind === "cell-start"
      && nextPoint?.anchor.kind === "block"
      && nextPoint.offset - cursor.offset > remaining + EPSILON
    ) {
      return {
        pointIndex: cursor.pointIndex,
        delta: remaining,
        pageAdvance: remaining,
        emptyPrefix: true,
      };
    }
    return {pointIndex: cursor.pointIndex, delta: 0, pageAdvance: 0};
  }
  const point = cursor.input.points[selectedIndex];
  return {
    point,
    pointIndex: selectedIndex,
    delta: selectedDelta,
    pageAdvance: selectedPageAdvance,
  };
}

function validateRow(row: TableFlowRowInput): void {
  if (row.kind === "atomic") {
    if (!Number.isFinite(row.height) || row.height < 0) {
      throw new TableCellFlowPlanningError(`表格行 ${row.rowId} 高度无效：${row.height}`);
    }
    return;
  }
  if (row.cells.length === 0) {
    throw new TableCellFlowPlanningError(`cell-flow 行 ${row.rowId} 至少需要一个单元格`);
  }
  for (const cell of row.cells) {
    if (cell.points.length === 0) {
      throw new TableCellFlowPlanningError(`单元格 ${cell.cellId} 没有安全切点`);
    }
    let previous = 0;
    cell.points.forEach((point, index) => {
      if (!Number.isFinite(point.offset) || point.offset <= previous + EPSILON) {
        throw new TableCellFlowPlanningError(`单元格 ${cell.cellId} 的切点必须严格递增`);
      }
      if (
        point.requiredTail !== undefined
        && (!Number.isFinite(point.requiredTail) || point.requiredTail < 0)
      ) {
        throw new TableCellFlowPlanningError(`单元格 ${cell.cellId} 的切点 requiredTail 无效`);
      }
      if (point.anchor.kind === "text" && (!Number.isInteger(point.anchor.offset) || point.anchor.offset < 0)) {
        throw new TableCellFlowPlanningError(`单元格 ${cell.cellId} 的文字锚点 offset 无效`);
      }
      previous = point.offset;
      if (index === cell.points.length - 1 && point.anchor.kind !== "cell-end") {
        throw new TableCellFlowPlanningError(`单元格 ${cell.cellId} 的最后切点必须是 cell-end`);
      }
    });
  }
}

function cloneBreak(value: TableFlowBreak): TableFlowBreak {
  if (value.kind === "row") return {...value};
  return {
    kind: "cell-flow",
    rowId: value.rowId,
    continuations: value.continuations.map(continuation => ({
      ...continuation,
      anchor: cloneAnchor(continuation.anchor),
    })),
  };
}

function cloneAnchor(anchor: TableCellFlowAnchor): TableCellFlowAnchor {
  return {...anchor};
}
