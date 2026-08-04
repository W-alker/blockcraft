export type TableModelCoordinate = readonly [rowIndex: number, columnIndex: number];

export interface TableModelRectangle {
  readonly start: TableModelCoordinate;
  readonly end: TableModelCoordinate;
}

export type TableModelGridDiagnosticCode =
  | "table-not-found"
  | "unexpected-table-child"
  | "unexpected-row-child"
  | "invalid-column-widths"
  | "column-width-count-mismatch"
  | "ragged-row"
  | "missing-physical-cell"
  | "duplicate-cell-id"
  | "invalid-rowspan"
  | "invalid-colspan"
  | "rowspan-out-of-bounds"
  | "colspan-out-of-bounds"
  | "span-overlap"
  | "visible-cell-covered"
  | "orphan-hidden-cell"
  | "diagnostics-truncated";

export interface TableModelGridDiagnostic {
  readonly code: TableModelGridDiagnosticCode;
  readonly severity: "error";
  readonly blockId?: string;
  readonly coordinate?: TableModelCoordinate;
}

export interface TableModelCellRecord {
  readonly id: string;
  readonly rowId: string;
  readonly coordinate: TableModelCoordinate;
  readonly rowspan: number;
  readonly colspan: number;
  readonly span: TableModelRectangle;
}

export interface TableModelGraphReader {
  getChildrenIds(blockId: string): readonly string[];
  getFlavour(blockId: string): string | undefined;
  getProps(blockId: string): Record<string, unknown> | undefined;
}

export interface TableModelGridDocument {
  readonly model: TableModelGraphReader;
}

const MAX_DIAGNOSTICS = 100;

class DiagnosticCollector {
  private truncated = false;
  readonly values: TableModelGridDiagnostic[] = [];

  report(diagnostic: Omit<TableModelGridDiagnostic, "severity">): void {
    if (this.values.length < MAX_DIAGNOSTICS) {
      this.values.push({...diagnostic, severity: "error"});
      return;
    }
    this.truncated = true;
  }

  finish(): readonly TableModelGridDiagnostic[] {
    if (this.truncated) {
      this.values[MAX_DIAGNOSTICS - 1] = {
        code: "diagnostics-truncated",
        severity: "error",
      };
    }
    return this.values;
  }
}

/**
 * DOM-free logical table projection built from direct table/row/cell models.
 *
 * The projection is read-only: malformed structure is diagnosed and makes the
 * grid invalid, but is never repaired or guessed from mounted components.
 */
export class TableModelGrid {
  static fromDoc(doc: TableModelGridDocument, tableId: string): TableModelGrid {
    const diagnostics = new DiagnosticCollector();
    if (doc.model.getFlavour(tableId) !== "table") {
      diagnostics.report({code: "table-not-found", blockId: tableId});
      return new TableModelGrid(
        tableId,
        [],
        0,
        [],
        [],
        new Map(),
        new Map(),
        diagnostics.finish(),
      );
    }

    const rowIds: string[] = [];
    for (const childId of doc.model.getChildrenIds(tableId)) {
      if (doc.model.getFlavour(childId) !== "table-row") {
        diagnostics.report({code: "unexpected-table-child", blockId: childId});
        continue;
      }
      rowIds.push(childId);
    }

    const rowCellIds = rowIds.map(rowId => [...doc.model.getChildrenIds(rowId)]);
    const tableProps = doc.model.getProps(tableId);
    const colWidths = tableProps?.["colWidths"];
    const configuredColumnCount = Array.isArray(colWidths) ? colWidths.length : 0;
    if (!Array.isArray(colWidths)) {
      diagnostics.report({code: "invalid-column-widths", blockId: tableId});
    }
    const physicalColumnCount = Math.max(
      ...rowCellIds.map(cellIds => cellIds.length),
      0,
    );
    if (
      Array.isArray(colWidths) &&
      rowIds.length > 0 &&
      configuredColumnCount !== physicalColumnCount
    ) {
      diagnostics.report({code: "column-width-count-mismatch", blockId: tableId});
    }
    const columnCount = Math.max(configuredColumnCount, physicalColumnCount);

    const physicalCellIds: Array<Array<string | null>> = rowIds.map(() =>
      new Array<string | null>(columnCount).fill(null),
    );
    const coordinateByCellId = new Map<string, TableModelCoordinate>();
    const propsByCellId = new Map<string, Record<string, unknown>>();

    rowCellIds.forEach((cellIds, rowIndex) => {
      if (cellIds.length !== columnCount) {
        diagnostics.report({
          code: "ragged-row",
          blockId: rowIds[rowIndex],
          coordinate: [rowIndex, Math.min(cellIds.length, columnCount)],
        });
      }
      cellIds.forEach((cellId, columnIndex) => {
        const coordinate: TableModelCoordinate = [rowIndex, columnIndex];
        if (doc.model.getFlavour(cellId) !== "table-cell") {
          diagnostics.report({
            code: "unexpected-row-child",
            blockId: cellId,
            coordinate,
          });
          return;
        }
        if (coordinateByCellId.has(cellId)) {
          diagnostics.report({code: "duplicate-cell-id", blockId: cellId, coordinate});
          return;
        }
        physicalCellIds[rowIndex][columnIndex] = cellId;
        coordinateByCellId.set(cellId, coordinate);
        propsByCellId.set(cellId, doc.model.getProps(cellId) ?? {});
      });
    });

    for (let rowIndex = 0; rowIndex < rowIds.length; rowIndex++) {
      for (let columnIndex = 0; columnIndex < columnCount; columnIndex++) {
        if (physicalCellIds[rowIndex][columnIndex] !== null) continue;
        diagnostics.report({
          code: "missing-physical-cell",
          blockId: rowIds[rowIndex],
          coordinate: [rowIndex, columnIndex],
        });
      }
    }

    const masterIds: Array<Array<string | null>> = rowIds.map(() =>
      new Array<string | null>(columnCount).fill(null),
    );
    const masters = new Map<string, TableModelCellRecord>();

    for (let rowIndex = 0; rowIndex < rowIds.length; rowIndex++) {
      for (let columnIndex = 0; columnIndex < columnCount; columnIndex++) {
        const cellId = physicalCellIds[rowIndex][columnIndex];
        if (!cellId) continue;
        const props = propsByCellId.get(cellId) ?? {};
        if (props["display"] === "none") continue;

        const coordinate: TableModelCoordinate = [rowIndex, columnIndex];
        if (masterIds[rowIndex][columnIndex] !== null) {
          diagnostics.report({code: "visible-cell-covered", blockId: cellId, coordinate});
          continue;
        }

        const requestedRowspan = readSpan(
          props["rowspan"],
          "invalid-rowspan",
          cellId,
          coordinate,
          diagnostics,
        );
        const requestedColspan = readSpan(
          props["colspan"],
          "invalid-colspan",
          cellId,
          coordinate,
          diagnostics,
        );
        const requestedEndRow = rowIndex + requestedRowspan - 1;
        const requestedEndColumn = columnIndex + requestedColspan - 1;
        if (requestedEndRow >= rowIds.length) {
          diagnostics.report({code: "rowspan-out-of-bounds", blockId: cellId, coordinate});
        }
        if (requestedEndColumn >= columnCount) {
          diagnostics.report({code: "colspan-out-of-bounds", blockId: cellId, coordinate});
        }

        const targetEndRow = Math.min(rowIds.length - 1, requestedEndRow);
        const targetEndColumn = Math.min(columnCount - 1, requestedEndColumn);
        let endColumn = columnIndex;
        for (let column = columnIndex; column <= targetEndColumn; column++) {
          if (masterIds[rowIndex][column] !== null) {
            diagnostics.report({code: "span-overlap", blockId: cellId, coordinate});
            break;
          }
          endColumn = column;
        }

        let endRow = rowIndex;
        for (let row = rowIndex; row <= targetEndRow; row++) {
          let available = true;
          for (let column = columnIndex; column <= endColumn; column++) {
            if (masterIds[row][column] !== null) {
              available = false;
              break;
            }
          }
          if (!available) {
            diagnostics.report({code: "span-overlap", blockId: cellId, coordinate});
            break;
          }
          endRow = row;
        }

        const record: TableModelCellRecord = {
          id: cellId,
          rowId: rowIds[rowIndex],
          coordinate,
          rowspan: endRow - rowIndex + 1,
          colspan: endColumn - columnIndex + 1,
          span: {
            start: coordinate,
            end: [endRow, endColumn],
          },
        };
        masters.set(cellId, record);
        for (let row = rowIndex; row <= endRow; row++) {
          for (let column = columnIndex; column <= endColumn; column++) {
            masterIds[row][column] = cellId;
          }
        }
      }
    }

    for (let rowIndex = 0; rowIndex < rowIds.length; rowIndex++) {
      for (let columnIndex = 0; columnIndex < columnCount; columnIndex++) {
        const cellId = physicalCellIds[rowIndex][columnIndex];
        if (!cellId) continue;
        const props = propsByCellId.get(cellId) ?? {};
        const masterId = masterIds[rowIndex][columnIndex];
        const coordinate: TableModelCoordinate = [rowIndex, columnIndex];
        if (props["display"] === "none") {
          if (masterId === null) {
            diagnostics.report({code: "orphan-hidden-cell", blockId: cellId, coordinate});
          }
        } else if (masterId !== cellId) {
          diagnostics.report({code: "visible-cell-covered", blockId: cellId, coordinate});
        }
      }
    }

    return new TableModelGrid(
      tableId,
      rowIds,
      columnCount,
      physicalCellIds,
      masterIds,
      coordinateByCellId,
      masters,
      diagnostics.finish(),
    );
  }

  readonly isValid: boolean;
  readonly rowCount: number;

  private constructor(
    readonly tableId: string,
    readonly rowIds: readonly string[],
    readonly columnCount: number,
    private readonly physicalCellIds: ReadonlyArray<ReadonlyArray<string | null>>,
    private readonly masterIds: ReadonlyArray<ReadonlyArray<string | null>>,
    private readonly coordinateByCellId: ReadonlyMap<string, TableModelCoordinate>,
    private readonly masters: ReadonlyMap<string, TableModelCellRecord>,
    readonly diagnostics: readonly TableModelGridDiagnostic[],
  ) {
    this.rowCount = rowIds.length;
    this.isValid = diagnostics.length === 0;
  }

  getPhysicalCellIdAt(rowIndex: number, columnIndex: number): string | null {
    return this.physicalCellIds[rowIndex]?.[columnIndex] ?? null;
  }

  getMasterCellIdAt(rowIndex: number, columnIndex: number): string | null {
    return this.masterIds[rowIndex]?.[columnIndex] ?? null;
  }

  getVisibleSourceCellIdAt(rowIndex: number, columnIndex: number): string | null {
    const physicalId = this.getPhysicalCellIdAt(rowIndex, columnIndex);
    return physicalId && this.masters.has(physicalId) ? physicalId : null;
  }

  getCellCoordinate(cellId: string): TableModelCoordinate | null {
    return this.coordinateByCellId.get(cellId) ?? null;
  }

  getMasterCellId(cellId: string): string | null {
    const coordinate = this.getCellCoordinate(cellId);
    return coordinate
      ? this.getMasterCellIdAt(coordinate[0], coordinate[1])
      : null;
  }

  getMaster(cellId: string): TableModelCellRecord | null {
    const masterId = this.getMasterCellId(cellId);
    return masterId ? this.masters.get(masterId) ?? null : null;
  }

  getSpan(cellId: string): TableModelRectangle | null {
    return this.getMaster(cellId)?.span ?? null;
  }

  adjustSelection(
    start: TableModelCoordinate,
    end: TableModelCoordinate,
  ): TableModelRectangle | null {
    const rectangle = this.normalizeRectangle({start, end});
    if (!rectangle) return null;
    let startRow = rectangle.start[0];
    let startColumn = rectangle.start[1];
    let endRow = rectangle.end[0];
    let endColumn = rectangle.end[1];
    let expanded = true;

    while (expanded) {
      expanded = false;
      for (let row = startRow; row <= endRow; row++) {
        for (let column = startColumn; column <= endColumn; column++) {
          const masterId = this.getMasterCellIdAt(row, column);
          if (!masterId) continue;
          const span = this.masters.get(masterId)?.span;
          if (!span) continue;
          const nextStartRow = Math.min(startRow, span.start[0]);
          const nextStartColumn = Math.min(startColumn, span.start[1]);
          const nextEndRow = Math.max(endRow, span.end[0]);
          const nextEndColumn = Math.max(endColumn, span.end[1]);
          if (
            nextStartRow !== startRow ||
            nextStartColumn !== startColumn ||
            nextEndRow !== endRow ||
            nextEndColumn !== endColumn
          ) {
            startRow = nextStartRow;
            startColumn = nextStartColumn;
            endRow = nextEndRow;
            endColumn = nextEndColumn;
            expanded = true;
          }
        }
      }
    }

    return {start: [startRow, startColumn], end: [endRow, endColumn]};
  }

  getPhysicalCellIds(rectangle: TableModelRectangle): string[][] {
    const normalized = this.normalizeRectangle(rectangle);
    if (!normalized) return [];
    const rows: string[][] = [];
    for (let row = normalized.start[0]; row <= normalized.end[0]; row++) {
      const cells: string[] = [];
      for (let column = normalized.start[1]; column <= normalized.end[1]; column++) {
        const cellId = this.getPhysicalCellIdAt(row, column);
        if (cellId) cells.push(cellId);
      }
      rows.push(cells);
    }
    return rows;
  }

  getMasterCellIds(rectangle: TableModelRectangle): string[] {
    const normalized = this.normalizeRectangle(rectangle);
    if (!normalized) return [];
    const seen = new Set<string>();
    const cells: string[] = [];
    for (let row = normalized.start[0]; row <= normalized.end[0]; row++) {
      for (let column = normalized.start[1]; column <= normalized.end[1]; column++) {
        const cellId = this.getMasterCellIdAt(row, column);
        if (!cellId || seen.has(cellId)) continue;
        seen.add(cellId);
        cells.push(cellId);
      }
    }
    return cells;
  }

  private normalizeRectangle(rectangle: TableModelRectangle): TableModelRectangle | null {
    const startRow = Math.min(rectangle.start[0], rectangle.end[0]);
    const startColumn = Math.min(rectangle.start[1], rectangle.end[1]);
    const endRow = Math.max(rectangle.start[0], rectangle.end[0]);
    const endColumn = Math.max(rectangle.start[1], rectangle.end[1]);
    if (
      !Number.isInteger(startRow) ||
      !Number.isInteger(startColumn) ||
      !Number.isInteger(endRow) ||
      !Number.isInteger(endColumn) ||
      startRow < 0 ||
      startColumn < 0 ||
      endRow >= this.rowCount ||
      endColumn >= this.columnCount
    ) {
      return null;
    }
    return {start: [startRow, startColumn], end: [endRow, endColumn]};
  }
}

function readSpan(
  value: unknown,
  invalidCode: "invalid-rowspan" | "invalid-colspan",
  blockId: string,
  coordinate: TableModelCoordinate,
  diagnostics: DiagnosticCollector,
): number {
  if (value === null || value === undefined) return 1;
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  diagnostics.report({code: invalidCode, blockId, coordinate});
  return 1;
}
