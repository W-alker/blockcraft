import {TableBlockComponent} from "./table.block";
import {TableCellBlockComponent} from "./table-cell.block";

export class RectangleSelection {
  constructor(
    public start: number[],
    public end: number[]
  ) {
  }

  getMinX() {
    return Math.min(this.start[0], this.end[0]);
  }

  getMinY() {
    return Math.min(this.start[1], this.end[1]);
  }

  getMaxX() {
    return Math.max(this.start[0], this.end[0]);
  }

  getMaxY() {
    return Math.max(this.start[1], this.end[1]);
  }

  setStart(x: number, y: number) {
    this.start = [x, y];
  }

  setEnd(x: number, y: number) {
    this.end = [x, y];
  }
}

export function confirmSelection(selection: RectangleSelection, table: TableBlockComponent) {
  let startX = selection.getMinX();
  let startY = selection.getMinY();
  let endX = selection.getMaxX();
  let endY = selection.getMaxY();

  const minX = startX;
  const minY = startY;
  const maxX = endX;
  const maxY = endY;

  // const xLength = table.childrenLength
  // const yLength = table.firstChildren!.childrenLength
  //
  // if (startX < 0 || startY < 0) {
  //   throw new Error("x or y is out of bounds");
  // }
  //
  // if (maxX >= xLength || maxY >= yLength) {
  //   throw new Error("x or y is out of bounds");
  // }

  const getCell = (colIdx: number, rowIdx: number) => {
    return table.getChildrenByIndex(rowIdx).getChildrenByIndex(colIdx) as TableCellBlockComponent
  }

  const getCellCoordinates = (cell: TableCellBlockComponent) => {
    const rowIdx = cell.parentBlock!.getIndexOfParent()
    const colIdx = cell.getIndexOfParent()
    const rowspan = cell.props.rowspan || 1
    const colspan = cell.props.colspan || 1
    return {
      min: [colIdx, rowIdx],
      max: [colIdx + colspan - 1, rowIdx + rowspan - 1]
    }
  }

  for (let i = minX; i <= maxX; i++) {
    for (let j = minY; j <= maxY; j++) {
      const cell = getCell(i, j)
      if (cell.props.display === 'none') {
        const mergedByRoot = cell.props.mergedBy
        if (mergedByRoot) {
          const coordinates = getCellCoordinates(table.doc.getBlockById(mergedByRoot) as TableCellBlockComponent)
          startX = Math.min(startX, coordinates.min[0])
          startY = Math.min(startY, coordinates.min[1]);
          endX = Math.max(endX, coordinates.max[0]);
          endY = Math.max(endY, coordinates.max[1]);
        }
      }
    }
  }

  selection.setStart(startX, startY);
  selection.setEnd(endX, endY);
  return selection
}
