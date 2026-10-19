import {SelectionEditPlan, SelectionEditReader} from "./selection-edit-plan";

export interface ReadonlyWriteFootprint {
  textBlockIds: string[];
  removableRootIds: string[];
  insertParentIds: string[];
}

export function buildReadonlyWriteFootprint(
  plan: SelectionEditPlan,
  reader: SelectionEditReader,
): ReadonlyWriteFootprint {
  const textBlockIds: string[] = [];
  const removableRootIds: string[] = [];
  const insertParentIds: string[] = [];
  const addText = (id: string) => pushUnique(textBlockIds, id);
  const addRemovable = (id: string) => pushUnique(removableRootIds, id);
  const addParent = (id: string | null | undefined) => {
    if (id !== null && id !== undefined) pushUnique(insertParentIds, id);
  };

  switch (plan.kind) {
    case "text-cursor":
      addText(plan.blockId);
      break;
    case "range": {
      if (plan.start.kind === "text") addText(plan.start.blockId);
      else addRemovable(plan.start.blockId);

      if (plan.end) {
        if (plan.end.kind === "text") addText(plan.end.blockId);
        else addRemovable(plan.end.blockId);

        collectInclusiveRange(plan.start.blockId, plan.end.blockId, reader)
          .filter(id => id !== plan.start.blockId && id !== plan.end!.blockId)
          .forEach(addRemovable);

        if (
          plan.end.kind === "text" &&
          (
            plan.tailMode === "merge" ||
            plan.end.to >= (safeTextLength(reader, plan.end.blockId) ?? Number.MAX_SAFE_INTEGER)
          )
        ) {
          addRemovable(plan.end.blockId);
        }
      }
      break;
    }
    case "block-range":
      collectInclusiveRange(plan.startBlockId, plan.endBlockId, reader)
        .forEach(addRemovable);
      break;
    case "gap":
      addRemovable(plan.blockId);
      addParent(safeParentId(reader, plan.blockId));
      break;
    case "boundary": {
      const children = safeChildrenIds(reader, plan.hostId);
      const from = Math.max(0, Math.min(plan.fromIndex, plan.toIndex, children.length));
      const to = Math.max(from, Math.min(Math.max(plan.fromIndex, plan.toIndex), children.length));
      children.slice(from, to).forEach(addRemovable);
      addParent(plan.hostId);
      break;
    }
    case "table-cell": {
      const cells = collectTableCells(plan, reader);
      cells.forEach(cellId => {
        addParent(cellId);
        safeChildrenIds(reader, cellId).forEach(addRemovable);
      });
      break;
    }
    case "unsupported":
      break;
  }

  return {textBlockIds, removableRootIds, insertParentIds};
}

function collectInclusiveRange(
  startId: string,
  endId: string,
  reader: SelectionEditReader,
): string[] {
  if (startId === endId) return [startId];
  const startPath = pathToRoot(startId, reader);
  const endPath = pathToRoot(endId, reader);
  if (!startPath || !endPath) return [startId, endId];

  let commonIndex = -1;
  const commonLength = Math.min(startPath.length, endPath.length);
  while (
    commonIndex + 1 < commonLength &&
    startPath[commonIndex + 1] === endPath[commonIndex + 1]
  ) {
    commonIndex++;
  }
  if (commonIndex < 0) return [startId, endId];
  if (commonIndex === startPath.length - 1) return [startId];
  if (commonIndex === endPath.length - 1) return [endId];

  const result: string[] = [startId];
  let current = startId;
  while (safeParentId(reader, current) !== startPath[commonIndex]) {
    const parentId = safeParentId(reader, current);
    if (parentId === null || parentId === undefined) break;
    const siblings = safeChildrenIds(reader, parentId);
    const index = siblings.indexOf(current);
    if (index >= 0) siblings.slice(index + 1).forEach(id => pushUnique(result, id));
    current = parentId;
  }

  const commonParentId = startPath[commonIndex];
  const startBranchId = startPath[commonIndex + 1];
  const endBranchId = endPath[commonIndex + 1];
  const commonChildren = safeChildrenIds(reader, commonParentId);
  const startIndex = commonChildren.indexOf(startBranchId);
  const endIndex = commonChildren.indexOf(endBranchId);
  if (startIndex >= 0 && endIndex > startIndex) {
    commonChildren.slice(startIndex + 1, endIndex).forEach(id => pushUnique(result, id));
  }

  for (let level = commonIndex + 2; level < endPath.length; level++) {
    const parentId = endPath[level - 1];
    const childId = endPath[level];
    const siblings = safeChildrenIds(reader, parentId);
    const index = siblings.indexOf(childId);
    if (index > 0) siblings.slice(0, index).forEach(id => pushUnique(result, id));
  }
  pushUnique(result, endId);
  return result;
}

function collectTableCells(
  plan: Extract<SelectionEditPlan, {kind: "table-cell"}>,
  reader: SelectionEditReader,
): string[] {
  if (reader.resolveTableCellIds) {
    return [...(reader.resolveTableCellIds(
      plan.tableId,
      plan.anchorCellId,
      plan.headCellId,
    ) ?? [])];
  }

  const rowIds = safeChildrenIds(reader, plan.tableId);
  const anchorRowId = safeParentId(reader, plan.anchorCellId);
  const headRowId = safeParentId(reader, plan.headCellId);
  if (!anchorRowId || !headRowId) return [];

  const anchorRowIndex = rowIds.indexOf(anchorRowId);
  const headRowIndex = rowIds.indexOf(headRowId);
  const anchorColumnIndex = safeChildrenIds(reader, anchorRowId).indexOf(plan.anchorCellId);
  const headColumnIndex = safeChildrenIds(reader, headRowId).indexOf(plan.headCellId);
  if (
    anchorRowIndex < 0 || headRowIndex < 0 ||
    anchorColumnIndex < 0 || headColumnIndex < 0
  ) {
    return [];
  }

  const fromRow = Math.min(anchorRowIndex, headRowIndex);
  const toRow = Math.max(anchorRowIndex, headRowIndex);
  const fromColumn = Math.min(anchorColumnIndex, headColumnIndex);
  const toColumn = Math.max(anchorColumnIndex, headColumnIndex);
  return rowIds.slice(fromRow, toRow + 1).flatMap(rowId =>
    safeChildrenIds(reader, rowId).slice(fromColumn, toColumn + 1),
  );
}

function pathToRoot(blockId: string, reader: SelectionEditReader): string[] | null {
  const path: string[] = [];
  const seen = new Set<string>();
  let current: string | null | undefined = blockId;
  while (current !== null && current !== undefined && !seen.has(current)) {
    seen.add(current);
    path.push(current);
    current = safeParentId(reader, current);
  }
  return current === undefined ? null : path.reverse();
}

function safeParentId(reader: SelectionEditReader, blockId: string): string | null | undefined {
  try {
    return reader.getParentId(blockId);
  } catch {
    return undefined;
  }
}

function safeChildrenIds(reader: SelectionEditReader, blockId: string): readonly string[] {
  try {
    return reader.getChildrenIds(blockId) ?? [];
  } catch {
    return [];
  }
}

function safeTextLength(reader: SelectionEditReader, blockId: string): number | null {
  try {
    return reader.getTextLength(blockId);
  } catch {
    return null;
  }
}

function pushUnique(target: string[], value: string): void {
  if (!target.includes(value)) target.push(value);
}
