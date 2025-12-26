import { TableBlockComponent } from "./table.block";
import { TableCellBlockComponent } from "./table-cell.block";
import { IBlockSnapshot } from "../../framework";
import { BlockCraftError, ErrorCode } from "../../global";
import { TableRowBlockComponent } from "./table-row.block";

const isSourceMergeCell = (cell: BlockCraft.BlockComponent) => cell.props.display !== 'none' && (cell.props.rowspan || cell.props.colspan)

// 辅助函数：安全计算交集长度
const calcIntersectionLength = (start1: number, length1: number, start2: number, length2: number) => {
  const end1 = start1 + length1;
  const end2 = start2 + length2;
  const intersectionStart = Math.max(start1, start2);
  const intersectionEnd = Math.min(end1, end2);
  return Math.max(0, intersectionEnd - intersectionStart);
};

/**
 * 核心工具：构建表格的虚拟矩阵，记录每个逻辑位置被哪个源单元格占据
 * @param rows 所有行的 Block 对象数组
 * @param rowCount 表格行数
 * @param colCount 表格列数
 * @returns 二维数组，每个位置存储占据该位置的源单元格信息
 */
const buildCellMatrix = (
  rows: BlockCraft.BlockComponent[],
  rowCount: number,
  colCount: number
): Array<Array<{ cell: TableCellBlockComponent; sourceRow: number; sourceCol: number } | null>> => {
  // 初始化虚拟矩阵
  const matrix: Array<Array<{ cell: TableCellBlockComponent; sourceRow: number; sourceCol: number } | null>> = [];
  for (let i = 0; i < rowCount; i++) {
    matrix[i] = new Array(colCount).fill(null);
  }

  // 遍历所有实际单元格，填充虚拟矩阵
  for (let r = 0; r < rowCount; r++) {
    const row = rows[r];
    if (!row) continue;

    for (let c = 0; c < colCount; c++) {
      const cell = row.getChildrenByIndex(c) as TableCellBlockComponent;
      if (!cell || cell.props.display === 'none') continue;

      // 该单元格是源单元格，计算它占据的范围
      const rowspan = cell.props.rowspan || 1;
      const colspan = cell.props.colspan || 1;

      // 填充该单元格占据的所有逻辑位置
      for (let rr = r; rr < r + rowspan && rr < rowCount; rr++) {
        for (let cc = c; cc < c + colspan && cc < colCount; cc++) {
          matrix[rr][cc] = { cell, sourceRow: r, sourceCol: c };
        }
      }
    }
  }

  return matrix;
};

/**
 * 查找某个逻辑位置的源单元格
 * @param matrix 虚拟矩阵
 * @param rowIdx 目标行索引
 * @param colIdx 目标列索引
 * @returns 源单元格信息，如果不存在则返回 null
 */
const getCellAt = (
  matrix: Array<Array<{ cell: TableCellBlockComponent; sourceRow: number; sourceCol: number } | null>>,
  rowIdx: number,
  colIdx: number
) => {
  if (rowIdx < 0 || colIdx < 0 || rowIdx >= matrix.length || colIdx >= matrix[0]?.length) {
    return null;
  }
  return matrix[rowIdx][colIdx];
};

export function mergeTableCells(this: TableBlockComponent, start: number[], end: number[]) {
  const adjustedSelection = this.confirmSelection(start, end);
  const cells = this.getCellsMatrixByCoordinates(adjustedSelection.start, adjustedSelection.end);
  const { start: [startRowIdx, startColIdx], end: [endRowIdx, endColIdx] } = adjustedSelection;

  if (!cells.length || !cells[0].length) return; // 安全检查

  const firstCell = cells[0][0] as TableCellBlockComponent;

  this.doc.crud.transact(() => {
    firstCell.updateProps({
      rowspan: endRowIdx - startRowIdx + 1,
      colspan: endColIdx - startColIdx + 1
    });

    for (let i = 0; i < cells.length; i++) {
      const rowCells = cells[i];
      rowCells.forEach(cell => {
        if (cell.id === firstCell.id) return;
        if (cell.props.display === 'none') return;

        // 移动内容前检查是否有内容，避免空操作
        if (cell.hasContent) {
          // 可选：在这里插入一个换行符 block，防止文本粘连
          this.doc.crud.moveBlocks(cell.id, 0, cell.childrenLength, firstCell.id, firstCell.childrenLength);
        }

        cell.updateProps({ display: 'none', rowspan: null, colspan: null });
      });
    }
  });

  this._clearSelected();
  // 确保选中操作在事务后执行
  setTimeout(() => {
    this.doc.selection.selectBlock(firstCell);
    this._startSelectingCell = this._lastSelectingCell = firstCell;
  }, 0);

  return firstCell;
}

export function unMergeTableCell(this: TableBlockComponent, cell: TableCellBlockComponent) {
  const rowIds = this.childrenIds;
  const rowIdx = rowIds.indexOf(cell.parentBlock!.id);
  const colIdx = cell.getIndexOfParent();

  const rowspan = cell.props.rowspan || 1;
  const colspan = cell.props.colspan || 1;

  this.doc.crud.transact(() => {
    for (let i = rowIdx; i < rowIdx + rowspan; i++) {
      const rowBlock = this.doc.getBlockById(rowIds[i]) as TableRowBlockComponent;
      if (!rowBlock) continue;

      for (let j = colIdx; j < colIdx + colspan; j++) {
        const targetCellId = rowBlock.childrenIds[j];
        const targetCell = this.doc.getBlockById(targetCellId) as TableCellBlockComponent;

        // 如果原本是空的（通常 display:none 的单元格是空的），填充一个段落防止塌陷
        if (targetCell.childrenLength === 0) {
          const p = this.doc.schemas.createSnapshot('paragraph', []);
          this.doc.crud.insertBlocks(targetCell.id, 0, [p]);
        }

        targetCell.updateProps({ colspan: null, rowspan: null, display: null });
        // 注意：循环中不要反复 selectCell，会影响性能，只在最后处理选中
      }
    }
  });

  // 恢复选中状态
  this._startSelectingCell = cell;
  // 计算右下角单元格用于选中范围
  const lastRow = this.doc.getBlockById(rowIds[Math.min(rowIds.length - 1, rowIdx + rowspan - 1)]);
  if (lastRow) {
    this._lastSelectingCell = lastRow.getChildrenByIndex(colIdx + colspan - 1) as TableCellBlockComponent;
  }
}

export function addTableRow(this: TableBlockComponent, index: number) {
  const cellCount = this.firstChildren!.childrenLength;
  const newRow = this.doc.schemas.createSnapshot('table-row', [cellCount]);

  // 如果插入到第一行，直接插入即可
  if (index === 0) {
    this.doc.crud.insertBlocks(this.id, index, [newRow]);
    return;
  }

  const rows = this.getChildrenBlocks();
  const rowCount = rows.length;

  // 构建虚拟矩阵
  const matrix = buildCellMatrix(rows, rowCount, cellCount);

  const newRowChildren = newRow.children as IBlockSnapshot[];

  // 遍历新行的每一列
  for (let colIdx = 0; colIdx < cellCount; colIdx++) {
    // 查找上一行该列的占据情况
    const cellInfo = getCellAt(matrix, index - 1, colIdx);

    if (!cellInfo) {
      // 上一行该位置没有单元格，保持默认
      continue;
    }

    const { cell: sourceCell, sourceRow, sourceCol } = cellInfo;
    const rowspan = sourceCell.props.rowspan || 1;
    const colspan = sourceCell.props.colspan || 1;

    // 检查源单元格是否纵向跨越了插入位置
    // 如果 sourceRow + rowspan > index，说明源单元格还要继续向下延伸
    if (sourceRow + rowspan > index) {
      // 需要扩展该源单元格的 rowspan
      sourceCell.updateProps({ rowspan: rowspan + 1 });

      // 将新行中被该源单元格覆盖的所有列设置为隐藏
      for (let c = colIdx; c < colIdx + colspan && c < cellCount; c++) {
        newRowChildren[c].props["display"] = 'none';
      }

      // 跳过已处理的列
      colIdx += colspan - 1;
    }
    // 否则，该源单元格在插入位置之上结束，不需要特殊处理
  }

  return this.doc.crud.insertBlocks(this.id, index, [newRow]);
}

export function addTableCol(this: TableBlockComponent, index: number) {
  const rows = this.getChildrenBlocks();
  const rowCount = rows.length;
  const currentColCount = rows[0]?.childrenLength || 0;

  // 构建虚拟矩阵
  const matrix = buildCellMatrix(rows, rowCount, currentColCount);

  this.doc.crud.transact(() => {
    for (let rowIdx = 0; rowIdx < rowCount; rowIdx++) {
      const row = rows[rowIdx];
      const newCol = this.doc.schemas.createSnapshot('table-cell', []);

      // 如果插入到第一列，直接插入即可
      if (index === 0) {
        this.doc.crud.insertBlocks(row.id, index, [newCol]);
        continue;
      }

      // 查找前一列该位置的占据情况
      const cellInfo = getCellAt(matrix, rowIdx, index - 1);

      if (cellInfo) {
        const { cell: sourceCell, sourceRow, sourceCol } = cellInfo;
        const colspan = sourceCell.props.colspan || 1;
        const rowspan = sourceCell.props.rowspan || 1;

        // 检查源单元格是否横向跨越了插入位置
        if (sourceCol + colspan > index) {
          // 需要扩展该源单元格的 colspan
          // 但是只需要更新一次，所以判断是否是第一次遇到这个源单元格
          if (rowIdx === sourceRow) {
            sourceCell.updateProps({ colspan: colspan + 1 });
          }
          newCol.props["display"] = 'none';
        }
      }

      this.doc.crud.insertBlocks(row.id, index, [newCol]);
    }
  });

  // 动态计算新列宽
  const oldWidths = this.props.colWidths || [];
  let newWidth = 100;
  if (oldWidths.length > 0) {
    const totalWidth = oldWidths.reduce((a, b) => a + b, 0);
    newWidth = Math.floor(totalWidth / oldWidths.length);
  } else {
    newWidth = Math.floor(100 / (currentColCount + 1 || 1));
  }

  const _colWidths = [...oldWidths];
  _colWidths.splice(index, 0, newWidth);
  this.updateProps({ colWidths: _colWidths });
}

/**
 * 核心修复：删除列（处理断头合并）
 */
export function deleteTableCols(this: TableBlockComponent, index: number, count: number) {
  const rows = this.getChildrenBlocks();
  const rowCount = rows.length;
  const currentColCount = rows[0]?.childrenLength || 0;

  // 构建虚拟矩阵
  const matrix = buildCellMatrix(rows, rowCount, currentColCount);

  // 记录已处理的源单元格，避免重复处理
  const processedCells = new Set<string>();

  this.doc.crud.transact(() => {
    // 1. 预处理：修复合并关系
    for (let rowIdx = 0; rowIdx < rowCount; rowIdx++) {
      for (let colIdx = index; colIdx < index + count && colIdx < currentColCount; colIdx++) {
        const cellInfo = getCellAt(matrix, rowIdx, colIdx);
        if (!cellInfo) continue;

        const { cell: sourceCell, sourceRow, sourceCol } = cellInfo;

        // 如果已经处理过这个源单元格，跳过
        if (processedCells.has(sourceCell.id)) continue;

        const colspan = sourceCell.props.colspan || 1;
        const rowspan = sourceCell.props.rowspan || 1;

        // 计算源单元格与删除范围的交集
        const intersection = calcIntersectionLength(sourceCol, colspan, index, count);
        const remainingSpan = colspan - intersection;

        if (remainingSpan > 0) {
          // 部分被删除，还有剩余部分
          const isHeadDeleted = sourceCol >= index && sourceCol < index + count;

          if (isHeadDeleted) {
            // 源头被删，需要寻找新的头部（删除范围后的第一列）
            const newHeadCol = index; // 删除后，原来的 index+count 位置会移动到 index

            // 查找新头部单元格（在每一行中）
            for (let r = sourceRow; r < sourceRow + rowspan && r < rowCount; r++) {
              // 在删除后，新头部的位置将是 index + count
              const newHeadCellInfo = getCellAt(matrix, r, index + count);
              if (newHeadCellInfo && newHeadCellInfo.sourceRow === sourceRow && newHeadCellInfo.sourceCol === sourceCol) {
                const newHeadCell = newHeadCellInfo.cell;
                // 只需要更新一次（在源行）
                if (r === sourceRow) {
                  newHeadCell.updateProps({
                    display: null,
                    rowspan: rowspan,
                    colspan: remainingSpan
                  });
                  processedCells.add(sourceCell.id);
                }
                break;
              }
            }
          } else {
            // 头部未被删，直接修改源头属性
            sourceCell.updateProps({
              colspan: remainingSpan > 1 ? remainingSpan : null
            });
            processedCells.add(sourceCell.id);
          }
        }
        // 如果 remainingSpan <= 0，整个被删了，deleteBlocks 会处理
      }
    }

    // 2. 执行物理删除
    rows.forEach(row => {
      this.doc.crud.deleteBlocks(row.id, index, count);
    });
  });

  // 3. 更新列宽数组
  const _colWidths = [...(this.props.colWidths || [])];
  if (_colWidths.length >= index + count) {
    _colWidths.splice(index, count);
    this.updateProps({ colWidths: _colWidths });
  }
}

/**
 * 核心修复：删除行（处理断头合并）
 */
export function deleteTableRows(this: TableBlockComponent, index: number, count: number) {
  const rows = this.getChildrenBlocks();
  const rowCount = rows.length;
  const colCount = rows[0]?.childrenLength || 0;

  // 构建虚拟矩阵
  const matrix = buildCellMatrix(rows, rowCount, colCount);

  // 记录已处理的源单元格
  const processedCells = new Set<string>();

  this.doc.crud.transact(() => {
    // 1. 预处理：修复合并关系
    for (let colIdx = 0; colIdx < colCount; colIdx++) {
      for (let rowIdx = index; rowIdx < index + count && rowIdx < rowCount; rowIdx++) {
        const cellInfo = getCellAt(matrix, rowIdx, colIdx);
        if (!cellInfo) continue;

        const { cell: sourceCell, sourceRow, sourceCol } = cellInfo;

        // 如果已经处理过这个源单元格，跳过
        if (processedCells.has(sourceCell.id)) continue;

        const rowspan = sourceCell.props.rowspan || 1;
        const colspan = sourceCell.props.colspan || 1;

        // 计算源单元格与删除范围的交集
        const intersection = calcIntersectionLength(sourceRow, rowspan, index, count);
        const remainingSpan = rowspan - intersection;

        if (remainingSpan > 0) {
          // 部分被删除，还有剩余部分
          const isHeadDeleted = sourceRow >= index && sourceRow < index + count;

          if (isHeadDeleted) {
            // 源头被删，需要寻找新的头部（删除范围后的第一行）
            const newHeadRow = index; // 删除后，原来的 index+count 位置会移动到 index

            // 查找新头部单元格（在每一列中）
            for (let c = sourceCol; c < sourceCol + colspan && c < colCount; c++) {
              const newHeadCellInfo = getCellAt(matrix, index + count, c);
              if (newHeadCellInfo && newHeadCellInfo.sourceRow === sourceRow && newHeadCellInfo.sourceCol === sourceCol) {
                const newHeadCell = newHeadCellInfo.cell;
                // 只需要更新一次（在源列）
                if (c === sourceCol) {
                  newHeadCell.updateProps({
                    display: null,
                    colspan: colspan,
                    rowspan: remainingSpan
                  });
                  processedCells.add(sourceCell.id);
                }
                break;
              }
            }
          } else {
            // 头部未被删，直接修改源头属性
            sourceCell.updateProps({
              rowspan: remainingSpan > 1 ? remainingSpan : null
            });
            processedCells.add(sourceCell.id);
          }
        }
        // 如果 remainingSpan <= 0，整个被删了，deleteBlocks 会处理
      }
    }

    // 2. 执行物理删除
    this.doc.crud.deleteBlocks(this.id, index, count);
  });
}

export function fixTable() {

}
