import {
  getTableModelProjection,
} from "./table-model-projection";
import {
  TableModelGrid,
  TableModelGridDocument,
  TableModelRectangle,
} from "./table-model-grid";

export interface TableCellSelectionIntent {
  readonly tableId: string;
  readonly anchorCellId: string;
  readonly headCellId: string;
}

export interface TableCellSelectionModelTarget {
  readonly tableId: string;
  readonly anchorCellId: string;
  readonly headCellId: string;
  readonly grid: TableModelGrid;
  readonly rectangle: TableModelRectangle;
  readonly physicalCellIds: readonly (readonly string[])[];
  readonly visibleCellIds: readonly string[];
}

/** Resolve a model-owned table rectangle without requiring any ComponentRef. */
export function resolveTableCellSelectionTarget(
  doc: TableModelGridDocument,
  selection: TableCellSelectionIntent,
): TableCellSelectionModelTarget | null {
  if (
    !doc?.model ||
    typeof doc.model.getFlavour !== "function" ||
    typeof doc.model.getChildrenIds !== "function" ||
    typeof doc.model.getProps !== "function"
  ) {
    return null;
  }
  if (doc.model.getFlavour(selection.tableId) !== "table") return null;

  let grid: TableModelGrid;
  try {
    grid = getTableModelProjection(doc as any, selection.tableId).grid;
  } catch {
    return null;
  }
  if (!grid.isValid) return null;

  const anchorCellId = grid.getMasterCellId(selection.anchorCellId);
  const headCellId = grid.getMasterCellId(selection.headCellId);
  if (!anchorCellId || !headCellId) return null;

  const anchor = grid.getCellCoordinate(anchorCellId);
  const head = grid.getCellCoordinate(headCellId);
  if (!anchor || !head) return null;

  const rectangle = grid.adjustSelection(anchor, head);
  if (!rectangle) return null;
  const physicalCellIds = grid.getPhysicalCellIds(rectangle);
  const visibleCellIds = grid.getMasterCellIds(rectangle);
  if (!physicalCellIds.length || !visibleCellIds.length) return null;

  return {
    tableId: selection.tableId,
    anchorCellId,
    headCellId,
    grid,
    rectangle,
    physicalCellIds,
    visibleCellIds,
  };
}
