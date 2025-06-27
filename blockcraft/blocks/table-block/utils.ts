import { TableBlockComponent } from "./table.block";
import { TableCellBlockComponent } from "./table-cell.block";

const getCellCoordinates = (cell: TableCellBlockComponent) => {
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

export function adjustSelection(
  selection: RectangleSelection,
  table: TableBlockComponent
) {
  const masterMap = new Map<string, TableCellBlockComponent>();

  // Step 1: 构建 masterMap
  const rowCount = table.childrenLength;
  for (let i = 0; i < rowCount; i++) {
    const row = table.getChildrenByIndex(i);
    const colCount = row.childrenLength;
    for (let j = 0; j < colCount; j++) {
      const cell = row.getChildrenByIndex(j) as TableCellBlockComponent;
      if (!cell || cell.props.display === "none") continue;

      const { min, max } = getCellCoordinates(cell);
      for (let r = min[0]; r <= max[0]; r++) {
        for (let c = min[1]; c <= max[1]; c++) {
          masterMap.set(`${r},${c}`, cell);
        }
      }
    }
  }

  // Step 2: 增量 flood-fill 扩展区域
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

    const { min, max } = getCellCoordinates(cell);

    // 如果 master 超出选区范围，就扩展，并把新的格子也加入队列
    let expanded = false;
    if (min[0] < selection.startRow) {
      selection.startRow = min[0];
      expanded = true;
    }
    if (min[1] < selection.startCol) {
      selection.startCol = min[1];
      expanded = true;
    }
    if (max[0] > selection.endRow) {
      selection.endRow = max[0];
      expanded = true;
    }
    if (max[1] > selection.endCol) {
      selection.endCol = max[1];
      expanded = true;
    }

    if (expanded) {
      // 将新区域加入队列
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


