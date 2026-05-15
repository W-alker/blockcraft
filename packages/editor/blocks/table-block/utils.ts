import { TableBlockComponent } from "./table.block";
import { TableCellBlockComponent } from "./table-cell.block";
import {TableCellsSelection} from "./types";

export const getCellCoordinates = (cell: TableCellBlockComponent) => {
  const rowIdx = cell.parentBlock!.getIndexOfParent();
  const colIdx = cell.getIndexOfParent();
  const rowspan = cell.props.rowspan || 1;
  const colspan = cell.props.colspan || 1;
  return {
    min: [rowIdx, colIdx],
    max: [rowIdx + rowspan - 1, colIdx + colspan - 1],
  };
};

export class RectangleSelection {
  constructor(
    public startRow: number,
    public startCol: number,
    public endRow: number,
    public endCol: number,
  ) {}

  normalize() {
    const minRow = Math.min(this.startRow, this.endRow);
    const maxRow = Math.max(this.startRow, this.endRow);
    const minCol = Math.min(this.startCol, this.endCol);
    const maxCol = Math.max(this.startCol, this.endCol);
    this.startRow = minRow;
    this.startCol = minCol;
    this.endRow = maxRow;
    this.endCol = maxCol;
  }
}

export type CellMasterMap = Map<string, TableCellBlockComponent>;

/**
 * Build a (row, col) → cell lookup covering every visible cell, including
 * the coverage cells of any rowspan/colspan merge. O(rows × cols).
 *
 * The result is stable for the lifetime of an interactive drag — call sites
 * that re-run adjustment many times in a row (cell-rectangle drag selection)
 * should build this once and reuse via `adjustSelectionWithMap`.
 *
 * Note: deliberately bypasses `getCellCoordinates` (which walks
 * `parentBlock.childrenIds.indexOf(...)` and would dominate the build for
 * large tables). The outer-loop indices `i`/`j` already give the source row
 * and column directly.
 */
export function buildCellMasterMap(table: TableBlockComponent): CellMasterMap {
  return buildCellMasterMapWithSources(table).masterMap;
}

export function buildCellMasterMapWithSources(table: TableBlockComponent): {
  masterMap: CellMasterMap,
  sourceCoords: Map<TableCellBlockComponent, [number, number]>,
} {
  const masterMap: CellMasterMap = new Map();
  const sourceCoords = new Map<TableCellBlockComponent, [number, number]>();
  const rowCount = table.childrenLength;
  for (let i = 0; i < rowCount; i++) {
    const row = table.getChildrenByIndex(i);
    const colCount = row.childrenLength;
    for (let j = 0; j < colCount; j++) {
      const cell = row.getChildrenByIndex(j) as TableCellBlockComponent;
      if (!cell || cell.props.display === "none") continue;

      sourceCoords.set(cell, [i, j]);

      const rowspan = cell.props.rowspan || 1;
      const colspan = cell.props.colspan || 1;
      const lastRow = i + rowspan - 1;
      const lastCol = j + colspan - 1;
      for (let r = i; r <= lastRow; r++) {
        for (let c = j; c <= lastCol; c++) {
          masterMap.set(`${r},${c}`, cell);
        }
      }
    }
  }
  return { masterMap, sourceCoords };
}

export function adjustSelectionWithMap(
  selection: RectangleSelection,
  masterMap: CellMasterMap,
  sourceCoords?: Map<TableCellBlockComponent, [number, number]>,
): TableCellsSelection {
  selection.normalize();
  const visited = new Set<string>();
  const queue: [number, number][] = [];

  // 初始化：把初始区域全部放入队列
  for (let r = selection.startRow; r <= selection.endRow; r++) {
    for (let c = selection.startCol; c <= selection.endCol; c++) {
      const key = `${r},${c}`;
      queue.push([r, c]);
      visited.add(key);
    }
  }

  while (queue.length > 0) {
    const [r, c] = queue.shift()!;
    const cell = masterMap.get(`${r},${c}`);
    if (!cell) continue;

    // Resolve the cell's source position. With a precomputed `sourceCoords`
    // we skip `getCellCoordinates` (which walks `childrenIds.indexOf` twice).
    let sourceRow: number, sourceCol: number;
    if (sourceCoords) {
      const coord = sourceCoords.get(cell);
      if (!coord) continue;
      sourceRow = coord[0];
      sourceCol = coord[1];
    } else {
      const { min } = getCellCoordinates(cell);
      sourceRow = min[0];
      sourceCol = min[1];
    }
    const rowspan = cell.props.rowspan || 1;
    const colspan = cell.props.colspan || 1;
    const lastRow = sourceRow + rowspan - 1;
    const lastCol = sourceCol + colspan - 1;

    // 如果 master 超出选区范围，就扩展，并把新的格子也加入队列
    let expanded = false;
    if (sourceRow < selection.startRow) {
      selection.startRow = sourceRow;
      expanded = true;
    }
    if (sourceCol < selection.startCol) {
      selection.startCol = sourceCol;
      expanded = true;
    }
    if (lastRow > selection.endRow) {
      selection.endRow = lastRow;
      expanded = true;
    }
    if (lastCol > selection.endCol) {
      selection.endCol = lastCol;
      expanded = true;
    }

    if (expanded) {
      for (let rr = selection.startRow; rr <= selection.endRow; rr++) {
        for (let cc = selection.startCol; cc <= selection.endCol; cc++) {
          const key = `${rr},${cc}`;
          if (!visited.has(key)) {
            queue.push([rr, cc]);
            visited.add(key);
          }
        }
      }
    }
  }

  return {
    start: [selection.startRow, selection.startCol],
    end: [selection.endRow, selection.endCol],
  };
}

export function adjustSelection(
  selection: RectangleSelection,
  table: TableBlockComponent,
): TableCellsSelection {
  return adjustSelectionWithMap(selection, buildCellMasterMap(table));
}


