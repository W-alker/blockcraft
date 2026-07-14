import {BlockSelection} from "../selection";
import {INormalizedEndpoints} from "../selection/normalize";
import {IBoundarySelectionPoint, ISelectionPoint, ITextSelectionPoint} from "../selection/types";

export interface SelectionEditReader {
  getParentId(blockId: string): string | null | undefined
  getChildrenIds(blockId: string): readonly string[] | null
  getTextLength(blockId: string): number | null
}

export type SelectionEditTailMode = "merge" | "preserve";

export interface SelectionEditPlanOptions {
  tailMode?: SelectionEditTailMode
}

export interface SelectionTextEdge {
  kind: "text"
  blockId: string
  from: number
  to: number
}

export interface SelectionBlockEdge {
  kind: "block"
  blockId: string
}

export type SelectionReplaceEdge = SelectionTextEdge | SelectionBlockEdge;

export type SelectionEditPlan =
  | {kind: "text-cursor"; blockId: string; offset: number}
  | {
    kind: "range"
    start: SelectionReplaceEdge
    end: SelectionReplaceEdge | null
    insertAt: {blockId: string; offset: number} | null
    stabilizeAt: {blockId: string; offset: number} | null
    tailMode: SelectionEditTailMode
  }
  | {kind: "block-range"; startBlockId: string; endBlockId: string}
  | {kind: "gap"; blockId: string; side: "before" | "after"}
  | {kind: "boundary"; hostId: string; fromIndex: number; toIndex: number}
  | {kind: "table-cell"; tableId: string; anchorCellId: string; headCellId: string}
  | {kind: "unsupported"; reason: string};

export type SelectionEditSource = BlockSelection | INormalizedEndpoints;

export function planSelectionEdit(
  source: SelectionEditSource,
  reader: SelectionEditReader,
  options: SelectionEditPlanOptions = {},
): SelectionEditPlan {
  const tailMode = options.tailMode ?? "merge";

  if (source instanceof BlockSelection) {
    const tableSelection = source.getTableCellSelection();
    if (tableSelection) {
      if (
        !hasBlock(reader, tableSelection.tableId) ||
        !hasBlock(reader, tableSelection.anchorCellId) ||
        !hasBlock(reader, tableSelection.headCellId)
      ) {
        return unsupported("stale-model");
      }
      return {kind: "table-cell", ...tableSelection};
    }
  }

  const {start, end} = source;

  if (!hasBlock(reader, start.blockId) || !hasBlock(reader, end.blockId)) {
    return unsupported("stale-model");
  }

  if (start.type === "table-cell" && end.type === "table-cell") {
    if (start.tableId !== end.tableId || !hasBlock(reader, start.tableId)) {
      return unsupported("invalid-table-selection");
    }
    return {
      kind: "table-cell",
      tableId: start.tableId,
      anchorCellId: start.blockId,
      headCellId: end.blockId,
    };
  }

  if (
    start.type === "gap" &&
    end.type === "gap" &&
    start.blockId === end.blockId &&
    start.side === end.side
  ) {
    return {kind: "gap", blockId: start.blockId, side: start.side};
  }

  if (start.type === "boundary" || end.type === "boundary") {
    return planBoundaryRange(start, end, reader, tailMode);
  }

  if (start.type === "selected" && end.type === "selected") {
    return {
      kind: "block-range",
      startBlockId: start.blockId,
      endBlockId: end.blockId,
    };
  }

  if (start.type === "text" && end.type === "text") {
    return planTextRange(start, end, reader, tailMode);
  }

  if (start.type === "selected" && end.type === "text") {
    const endEdge = textEdge(reader, end, 0, end.offset);
    if (!endEdge) return unsupported("invalid-text-offset");
    const cursor = {blockId: end.blockId, offset: 0};
    return {
      kind: "range",
      start: {kind: "block", blockId: start.blockId},
      end: endEdge,
      insertAt: cursor,
      stabilizeAt: cursor,
      tailMode,
    };
  }

  if (start.type === "text" && end.type === "selected") {
    const textLength = readTextLength(reader, start.blockId);
    const startEdge = textEdge(reader, start, start.offset, textLength);
    if (!startEdge) return unsupported("invalid-text-offset");
    const cursor = {blockId: start.blockId, offset: start.offset};
    return {
      kind: "range",
      start: startEdge,
      end: {kind: "block", blockId: end.blockId},
      insertAt: cursor,
      stabilizeAt: cursor,
      tailMode,
    };
  }

  return unsupported("unsupported-endpoints");
}

function planTextRange(
  start: ITextSelectionPoint,
  end: ITextSelectionPoint,
  reader: SelectionEditReader,
  tailMode: SelectionEditTailMode,
): SelectionEditPlan {
  const startLength = readTextLength(reader, start.blockId);
  const endLength = start.blockId === end.blockId
    ? startLength
    : readTextLength(reader, end.blockId);
  if (startLength === null || endLength === null) return unsupported("stale-model");
  if (!isOffset(start.offset, startLength) || !isOffset(end.offset, endLength)) {
    return unsupported("invalid-text-offset");
  }

  if (start.blockId === end.blockId) {
    if (start.offset > end.offset) return unsupported("invalid-text-range");
    if (start.offset === end.offset) {
      return {kind: "text-cursor", blockId: start.blockId, offset: start.offset};
    }
    return {
      kind: "range",
      start: {kind: "text", blockId: start.blockId, from: start.offset, to: end.offset},
      end: null,
      insertAt: {blockId: start.blockId, offset: start.offset},
      stabilizeAt: null,
      tailMode,
    };
  }

  const cursor = {blockId: start.blockId, offset: start.offset};
  return {
    kind: "range",
    start: {kind: "text", blockId: start.blockId, from: start.offset, to: startLength},
    end: {kind: "text", blockId: end.blockId, from: 0, to: end.offset},
    insertAt: cursor,
    stabilizeAt: cursor,
    tailMode,
  };
}

function planBoundaryRange(
  start: ISelectionPoint,
  end: ISelectionPoint,
  reader: SelectionEditReader,
  tailMode: SelectionEditTailMode,
): SelectionEditPlan {
  if (start.type === "boundary" && end.type === "boundary") {
    if (start.blockId !== end.blockId) return unsupported("unsupported-endpoints");
    const children = readChildrenIds(reader, start.blockId);
    if (!children || !isBoundaryIndex(start.index, children.length) || !isBoundaryIndex(end.index, children.length)) {
      return unsupported("invalid-boundary-range");
    }
    return {
      kind: "boundary",
      hostId: start.blockId,
      fromIndex: Math.min(start.index, end.index),
      toIndex: Math.max(start.index, end.index),
    };
  }

  if (start.type === "boundary" && end.type === "text") {
    return planBoundaryToText(start, end, reader, tailMode);
  }
  if (start.type === "text" && end.type === "boundary") {
    return planTextToBoundary(start, end, reader, tailMode);
  }
  return unsupported("unsupported-endpoints");
}

function planBoundaryToText(
  start: IBoundarySelectionPoint,
  end: ITextSelectionPoint,
  reader: SelectionEditReader,
  tailMode: SelectionEditTailMode,
): SelectionEditPlan {
  const children = readChildrenIds(reader, start.blockId);
  const directChildId = directChildUnder(reader, start.blockId, end.blockId);
  const textLength = readTextLength(reader, end.blockId);
  if (!children || !directChildId || textLength === null || !isOffset(end.offset, textLength)) {
    return unsupported("stale-model");
  }
  const childIndex = children.indexOf(directChildId);
  if (!isBoundaryIndex(start.index, children.length) || childIndex < 0 || start.index > childIndex) {
    return unsupported("invalid-boundary-range");
  }

  const endEdge: SelectionTextEdge = {
    kind: "text",
    blockId: end.blockId,
    from: 0,
    to: end.offset,
  };
  const cursor = {blockId: end.blockId, offset: 0};
  if (start.index === childIndex) {
    if (directChildId !== end.blockId) return unsupported("invalid-boundary-range");
    return {
      kind: "range",
      start: endEdge,
      end: null,
      insertAt: cursor,
      stabilizeAt: null,
      tailMode,
    };
  }

  return {
    kind: "range",
    start: {kind: "block", blockId: children[start.index]},
    end: endEdge,
    insertAt: cursor,
    stabilizeAt: cursor,
    tailMode,
  };
}

function planTextToBoundary(
  start: ITextSelectionPoint,
  end: IBoundarySelectionPoint,
  reader: SelectionEditReader,
  tailMode: SelectionEditTailMode,
): SelectionEditPlan {
  const children = readChildrenIds(reader, end.blockId);
  const directChildId = directChildUnder(reader, end.blockId, start.blockId);
  const textLength = readTextLength(reader, start.blockId);
  if (!children || !directChildId || textLength === null || !isOffset(start.offset, textLength)) {
    return unsupported("stale-model");
  }
  const childIndex = children.indexOf(directChildId);
  if (!isBoundaryIndex(end.index, children.length) || childIndex < 0 || end.index <= childIndex) {
    return unsupported("invalid-boundary-range");
  }

  const startEdge: SelectionTextEdge = {
    kind: "text",
    blockId: start.blockId,
    from: start.offset,
    to: textLength,
  };
  const cursor = {blockId: start.blockId, offset: start.offset};
  if (end.index === childIndex + 1) {
    if (directChildId !== start.blockId) return unsupported("invalid-boundary-range");
    return {
      kind: "range",
      start: startEdge,
      end: null,
      insertAt: cursor,
      stabilizeAt: null,
      tailMode,
    };
  }

  return {
    kind: "range",
    start: startEdge,
    end: {kind: "block", blockId: children[end.index - 1]},
    insertAt: cursor,
    stabilizeAt: cursor,
    tailMode,
  };
}

function textEdge(
  reader: SelectionEditReader,
  point: ITextSelectionPoint,
  from: number,
  to: number | null,
): SelectionTextEdge | null {
  const textLength = readTextLength(reader, point.blockId);
  if (textLength === null || to === null || !isOffset(from, textLength) || !isOffset(to, textLength) || from > to) {
    return null;
  }
  return {kind: "text", blockId: point.blockId, from, to};
}

function directChildUnder(
  reader: SelectionEditReader,
  parentId: string,
  descendantId: string,
): string | null {
  const visited = new Set<string>();
  let currentId = descendantId;
  while (!visited.has(currentId)) {
    visited.add(currentId);
    const currentParentId = readParentId(reader, currentId);
    if (currentParentId === parentId) return currentId;
    if (currentParentId === null || currentParentId === undefined) return null;
    currentId = currentParentId;
  }
  return null;
}

function hasBlock(reader: SelectionEditReader, blockId: string): boolean {
  return readParentId(reader, blockId) !== undefined;
}

function readParentId(reader: SelectionEditReader, blockId: string): string | null | undefined {
  try {
    return reader.getParentId(blockId);
  } catch {
    return undefined;
  }
}

function readChildrenIds(reader: SelectionEditReader, blockId: string): readonly string[] | null {
  try {
    return reader.getChildrenIds(blockId);
  } catch {
    return null;
  }
}

function readTextLength(reader: SelectionEditReader, blockId: string): number | null {
  try {
    const length = reader.getTextLength(blockId);
    return typeof length === "number" && Number.isInteger(length) && length >= 0
      ? length
      : null;
  } catch {
    return null;
  }
}

function isOffset(offset: number, textLength: number): boolean {
  return Number.isInteger(offset) && offset >= 0 && offset <= textLength;
}

function isBoundaryIndex(index: number, childrenLength: number): boolean {
  return Number.isInteger(index) && index >= 0 && index <= childrenLength;
}

function unsupported(reason: string): SelectionEditPlan {
  return {kind: "unsupported", reason};
}
