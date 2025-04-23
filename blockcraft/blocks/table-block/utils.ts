/**
 * Powered by 庄建齐 Mr.zhuang
 */
import {TableBlockComponent} from "./table.block";
import {TableCellBlockComponent} from "./table-cell.block";

const getCellCoordinates = (cell: TableCellBlockComponent) => {
  const rowIdx = cell.parentBlock!.getIndexOfParent()
  const colIdx = cell.getIndexOfParent()
  const rowspan = cell.props.rowspan || 1
  const colspan = cell.props.colspan || 1
  return {
    min: [rowIdx, colIdx],
    max: [rowIdx + rowspan - 1, colIdx + colspan - 1]
  }
}

export class RectangleSelection {
  constructor(
    public startRow: number,
    public startCol: number,
    public endRow: number,
    public endCol: number,
  ) {
  }

  normalize(){
    let minRow = Math.min(this.startRow, this.endRow);
    let maxRow = Math.max(this.startRow, this.endRow);
    let minCol = Math.min(this.startCol, this.endCol);
    let maxCol = Math.max(this.startCol, this.endCol);
    this.startRow =minRow
    this.startCol =minCol
    this.endRow =maxRow
    this.endCol =maxCol
  }

  adjust(row: number, col: number) {
    this.startRow = Math.min(this.startRow, row);
    this.startCol = Math.min(this.startCol, col);
    this.endRow = Math.max(this.endRow, row);
    this.endCol = Math.max(this.endCol, col);
  }

  containsMerge(cor: {min: number[], max: number[]}) {
    return this.startRow <= cor.min[0] &&
      this.startCol <= cor.min[1] &&
      this.endRow >= cor.max[0] &&
      this.endCol >= cor.max[1]
  }
}

export function adjustSelection(selection: RectangleSelection, table: TableBlockComponent) {

  let changed = false

  do {
    changed = false
    selection.normalize()

    for(let i = selection.startRow; i <= selection.endRow; i++) {
      const row = table.getChildrenByIndex(i)
      for (let j = selection.startCol; j <= selection.endCol; j++) {
        const cell = row.getChildrenByIndex(j) as TableCellBlockComponent

        if (cell.props.display === 'none' || cell.props.rowspan || cell.props.colspan) {
          const mergeByCellId = cell.props.mergedBy
          const mergeByCell = mergeByCellId ? table.doc.getBlockById(mergeByCellId!) as TableCellBlockComponent : cell

          const cor = getCellCoordinates(mergeByCell)

          if (!selection.containsMerge(cor)) {
            selection.adjust(cor.min[0], cor.min[1])
            selection.adjust(cor.max[0], cor.max[1])
            changed = true
          }
        }

      }
    }
  } while (changed)

  return {
    start: [selection.startRow, selection.startCol],
    end: [selection.endRow, selection.endCol],
  }
}
