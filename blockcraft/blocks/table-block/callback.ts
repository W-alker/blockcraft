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

export function fixTable(this: TableBlockComponent) {
  try {
    const rows = this.getChildrenBlocks() as TableRowBlockComponent[];
    if (!rows || !rows.length) return;

    const rowCount = rows.length;

    // 1. 确定正确的列数（考虑合并单元格）
    // 先找出所有行的最大 childrenLength
    let maxChildrenLength = 0;
    try {
      maxChildrenLength = Math.max(...rows.map(row => row?.childrenLength || 0), 0);
    } catch (e) {
      console.warn('fixTable: 计算最大列数时出错', e);
      maxChildrenLength = rows[0]?.childrenLength || 0;
    }

    // 如果表格为空，创建一个默认列
    if (maxChildrenLength === 0) {
      maxChildrenLength = 1;
    }

    // 计算实际需要的最大列数（考虑合并单元格的 colspan）
    // 遍历所有可见单元格，找出最大的 colIdx + colspan
    let maxLogicalCol = maxChildrenLength;
    try {
      for (let r = 0; r < rowCount; r++) {
        const row = rows[r];
        if (!row) continue;

        // 检查这一行的所有可见单元格
        for (let c = 0; c < row.childrenLength; c++) {
          try {
            const cell = row.getChildrenByIndex(c) as TableCellBlockComponent;
            if (cell && cell.props && cell.props.display !== 'none') {
              const colspan = cell.props.colspan || 1;
              // 计算这个单元格占据的最大逻辑列位置
              // 注意：c 是单元格在行中的索引，colspan 是它占据的列数
              // 所以它占据的逻辑列范围是 [c, c + colspan)
              const maxColForCell = c + colspan;
              maxLogicalCol = Math.max(maxLogicalCol, maxColForCell);
            }
          } catch (e) {
            // 忽略错误，继续检查下一个
          }
        }
      }
    } catch (e) {
      console.warn('fixTable: 计算最大逻辑列数时出错', e);
    }

    // 使用实际需要的最大列数和最大 childrenLength 的较大值
    // 这样可以确保即使某行缺少单元格，也能正确补充
    let expectedColCount = Math.max(maxLogicalCol, maxChildrenLength);

    // 确保至少有一列
    if (expectedColCount === 0) {
      expectedColCount = 1;
    }

    this.doc.crud.transact(() => {
      try {
        // ========== 第一阶段：补充所有缺失的单元格 ==========

        // 2. 首先确保每行的列数一致（补充缺失的列）
        for (let rowIdx = 0; rowIdx < rowCount; rowIdx++) {
          const row = rows[rowIdx];
          if (!row) continue;

          try {
            const currentColCount = row.childrenLength || 0;
            if (currentColCount < expectedColCount) {
              // 补充缺失的列
              for (let colIdx = currentColCount; colIdx < expectedColCount; colIdx++) {
                try {
                  const newCell = this.doc.schemas.createSnapshot('table-cell', []);
                  this.doc.crud.insertBlocks(row.id, colIdx, [newCell]);
                } catch (e) {
                  console.warn(`fixTable: 在第 ${rowIdx} 行第 ${colIdx} 列插入单元格时出错`, e);
                }
              }
            }
          } catch (e) {
            console.warn(`fixTable: 处理第 ${rowIdx} 行时出错`, e);
            continue;
          }
        }

        // 3. 重新获取行（因为可能添加了新列）
        const updatedRows = this.getChildrenBlocks() as TableRowBlockComponent[];
        if (!updatedRows || !updatedRows.length) return;

        // 4. 重新计算列数（可能已经改变）
        let actualColCount = 0;
        try {
          actualColCount = Math.max(...updatedRows.map(row => row?.childrenLength || 0), expectedColCount);
        } catch (e) {
          console.warn('fixTable: 重新计算列数时出错', e);
          actualColCount = updatedRows[0]?.childrenLength || expectedColCount;
        }

        // 5. 补充所有缺失的单元格（遍历所有可能的位置）
        // 确保每一行都有 expectedColCount 个单元格
        for (let rowIdx = 0; rowIdx < updatedRows.length; rowIdx++) {
          const row = updatedRows[rowIdx];
          if (!row) continue;

          try {
            const rowColCount = row.childrenLength || 0;
            // 确保这一行有足够的单元格
            const targetColCount = Math.max(actualColCount, expectedColCount);

            // 如果当前行的列数不足，补充到目标列数
            if (rowColCount < targetColCount) {
              for (let colIdx = rowColCount; colIdx < targetColCount; colIdx++) {
                try {
                  const newCell = this.doc.schemas.createSnapshot('table-cell', []);
                  this.doc.crud.insertBlocks(row.id, colIdx, [newCell]);
                } catch (e) {
                  console.warn(`fixTable: 在第 ${rowIdx} 行第 ${colIdx} 列插入单元格时出错`, e);
                }
              }
            }

            // 检查中间是否有缺失的单元格（防御性检查）
            // 遍历到目标列数，确保每个位置都有单元格
            for (let colIdx = 0; colIdx < targetColCount; colIdx++) {
              try {
                let cell: TableCellBlockComponent | undefined;
                try {
                  cell = row.getChildrenByIndex(colIdx) as TableCellBlockComponent;
                } catch (e) {
                  // 如果获取失败，说明这个位置没有单元格
                  cell = undefined;
                }

                if (!cell) {
                  // 单元格不存在，创建它
                  try {
                    const newCell = this.doc.schemas.createSnapshot('table-cell', []);
                    this.doc.crud.insertBlocks(row.id, colIdx, [newCell]);
                  } catch (e) {
                    console.warn(`fixTable: 创建第 ${rowIdx} 行第 ${colIdx} 列的单元格时出错`, e);
                  }
                }
              } catch (e) {
                console.warn(`fixTable: 检查第 ${rowIdx} 行第 ${colIdx} 列单元格时出错`, e);
                continue;
              }
            }
          } catch (e) {
            console.warn(`fixTable: 补充第 ${rowIdx} 行单元格时出错`, e);
            continue;
          }
        }

        // 6. 重新获取行（因为可能添加了更多单元格）
        const finalRows = this.getChildrenBlocks() as TableRowBlockComponent[];
        if (!finalRows || !finalRows.length) return;

        // 7. 重新计算最终列数
        let finalColCount = 0;
        try {
          finalColCount = Math.max(...finalRows.map(row => row?.childrenLength || 0), actualColCount);
        } catch (e) {
          console.warn('fixTable: 重新计算最终列数时出错', e);
          finalColCount = finalRows[0]?.childrenLength || actualColCount;
        }

        // ========== 第二阶段：修复显示状态 ==========

        // 8. 构建虚拟矩阵，了解每个位置应该被哪个源单元格占据
        // 注意：buildCellMatrix 只考虑 display !== 'none' 的单元格
        // 所以我们需要先确保所有应该隐藏的单元格都被隐藏
        const matrix = buildCellMatrix(finalRows, finalRows.length, finalColCount);

        // 9. 遍历每个位置，修复单元格的显示状态
        for (let rowIdx = 0; rowIdx < finalRows.length; rowIdx++) {
          const row = finalRows[rowIdx];
          if (!row) continue;

          try {
            const rowColCount = row.childrenLength || 0;
            for (let colIdx = 0; colIdx < Math.max(finalColCount, rowColCount); colIdx++) {
              try {
                // 安全获取单元格（此时所有单元格应该都已存在）
                let cell: TableCellBlockComponent | undefined;
                try {
                  cell = row.getChildrenByIndex(colIdx) as TableCellBlockComponent;
                } catch (e) {
                  console.warn(`fixTable: 获取第 ${rowIdx} 行第 ${colIdx} 列的单元格时出错`, e);
                  continue;
                }

                if (!cell) {
                  // 如果单元格仍然不存在，创建它（防御性编程）
                  try {
                    const newCell = this.doc.schemas.createSnapshot('table-cell', []);
                    this.doc.crud.insertBlocks(row.id, colIdx, [newCell]);
                    cell = row.getChildrenByIndex(colIdx) as TableCellBlockComponent;
                  } catch (e) {
                    console.warn(`fixTable: 创建第 ${rowIdx} 行第 ${colIdx} 列的单元格时出错`, e);
                    continue;
                  }
                }

                // 安全访问单元格属性
                if (!cell.props) {
                  console.warn(`fixTable: 第 ${rowIdx} 行第 ${colIdx} 列的单元格没有 props`);
                  continue;
                }

                // 安全访问单元格属性
                if (!cell.props) {
                  console.warn(`fixTable: 第 ${rowIdx} 行第 ${colIdx} 列的单元格没有 props`);
                  continue;
                }

                // 检查这个单元格是否是源单元格（有 rowspan 或 colspan）
                const hasRowspan = cell.props.rowspan && cell.props.rowspan > 1;
                const hasColspan = cell.props.colspan && cell.props.colspan > 1;
                const isSourceCell = hasRowspan || hasColspan;

                // 获取矩阵信息
                const cellInfo = getCellAt(matrix, rowIdx, colIdx);

                if (!cellInfo) {
                  // 矩阵中该位置没有源单元格，说明这个位置不应该有可见单元格
                  // 但如果单元格有内容，需要保留内容
                  try {
                    // 如果这个单元格是源单元格（有合并属性），但矩阵中没有它
                    // 说明它可能是新补充的单元格，应该隐藏
                    // 或者如果它当前可见但没有合并属性，也应该隐藏
                    if (cell.props.display !== 'none') {
                      // 检查是否有内容需要保留
                      if (cell.hasContent) {
                        // 尝试找到一个合适的源单元格来接收内容
                        // 优先查找同一行的下一个可见单元格
                        let targetCell: TableCellBlockComponent | null = null;
                        for (let c = colIdx + 1; c < finalColCount; c++) {
                          const info = getCellAt(matrix, rowIdx, c);
                          if (info && info.sourceRow === rowIdx && info.sourceCol === c) {
                            const candidate = finalRows[rowIdx]?.getChildrenByIndex(c) as TableCellBlockComponent;
                            if (candidate && candidate.id === info.cell.id && candidate.props?.display !== 'none') {
                              targetCell = candidate;
                              break;
                            }
                          }
                        }
                        // 如果没找到，查找上一行的对应位置
                        if (!targetCell && rowIdx > 0) {
                          const info = getCellAt(matrix, rowIdx - 1, colIdx);
                          if (info) {
                            const candidate = finalRows[info.sourceRow]?.getChildrenByIndex(info.sourceCol) as TableCellBlockComponent;
                            if (candidate && candidate.id === info.cell.id && candidate.props?.display !== 'none') {
                              targetCell = candidate;
                            }
                          }
                        }
                        // 如果找到了目标单元格，移动内容
                        if (targetCell) {
                          try {
                            this.doc.crud.moveBlocks(cell.id, 0, cell.childrenLength, targetCell.id, targetCell.childrenLength);
                          } catch (e) {
                            console.warn(`fixTable: 移动第 ${rowIdx} 行第 ${colIdx} 列内容时出错`, e);
                          }
                        }
                      }
                      // 隐藏单元格（不修改 rowspan/colspan，保持原有设置）
                      cell.updateProps({ display: 'none' });
                    }
                  } catch (e) {
                    console.warn(`fixTable: 更新第 ${rowIdx} 行第 ${colIdx} 列单元格显示状态时出错`, e);
                  }
                  continue;
                }

                const { cell: sourceCell, sourceRow, sourceCol } = cellInfo;

                // 验证 sourceCell 是否存在
                if (!sourceCell || !sourceCell.props) {
                  console.warn(`fixTable: 源单元格无效 (${rowIdx}, ${colIdx})`);
                  continue;
                }

                // 10. 检查单元格的显示状态是否正确（不修改 rowspan/colspan）
                if (sourceRow === rowIdx && sourceCol === colIdx) {
                  // 这是源单元格位置，应该可见
                  if (cell.id !== sourceCell.id) {
                    // 位置不匹配：这个位置的单元格不是源单元格
                    // 这可能是新补充的单元格，应该隐藏它
                    // 如果当前单元格有内容，应该移动到源单元格
                    try {
                      if (cell.hasContent && sourceCell.id !== cell.id) {
                        try {
                          this.doc.crud.moveBlocks(cell.id, 0, cell.childrenLength, sourceCell.id, sourceCell.childrenLength);
                        } catch (e) {
                          console.warn(`fixTable: 移动第 ${rowIdx} 行第 ${colIdx} 列内容到源单元格时出错`, e);
                        }
                      }
                      // 隐藏当前单元格（但不修改 rowspan/colspan，保持源单元格的原有设置）
                      if (cell.props.display !== 'none') {
                        cell.updateProps({ display: 'none' });
                      }
                    } catch (e) {
                      console.warn(`fixTable: 隐藏第 ${rowIdx} 行第 ${colIdx} 列单元格时出错`, e);
                    }
                    continue;
                  }

                  // 源单元格应该可见，只修复显示状态，不修改 rowspan/colspan
                  try {
                    if (sourceCell.props.display === 'none') {
                      sourceCell.updateProps({ display: null });
                    }
                    // 不修改 rowspan 和 colspan，保持原有设置
                  } catch (e) {
                    console.warn(`fixTable: 更新源单元格 (${rowIdx}, ${colIdx}) 显示状态时出错`, e);
                  }
                } else {
                  // 这不是源单元格位置，应该被隐藏
                  // 这个位置的单元格是被合并单元格覆盖的，应该隐藏
                  // 但如果单元格有内容，需要移动到源单元格
                  try {
                    if (cell.id === sourceCell.id) {
                      // 单元格ID匹配，但位置不对（说明单元格在错误的位置）
                      // 这种情况不应该发生，但如果发生了，只修复显示状态
                      if (cell.props.display !== 'none') {
                        cell.updateProps({ display: 'none' });
                      }
                    } else {
                      // 单元格ID不匹配，这个位置的单元格应该被隐藏
                      // 这可能是新补充的单元格，应该隐藏它
                      // 如果它有内容，应该移动到源单元格
                      if (cell.hasContent && sourceCell.id !== cell.id) {
                        try {
                          this.doc.crud.moveBlocks(cell.id, 0, cell.childrenLength, sourceCell.id, sourceCell.childrenLength);
                        } catch (e) {
                          console.warn(`fixTable: 移动第 ${rowIdx} 行第 ${colIdx} 列内容到源单元格时出错`, e);
                        }
                      }
                      // 隐藏单元格（不修改 rowspan/colspan）
                      if (cell.props.display !== 'none') {
                        cell.updateProps({ display: 'none' });
                      }
                    }
                  } catch (e) {
                    console.warn(`fixTable: 更新第 ${rowIdx} 行第 ${colIdx} 列单元格状态时出错`, e);
                  }
                }
              } catch (e) {
                console.warn(`fixTable: 处理第 ${rowIdx} 行第 ${colIdx} 列时出错`, e);
                continue;
              }
            }
          } catch (e) {
            console.warn(`fixTable: 处理第 ${rowIdx} 行时出错`, e);
            continue;
          }
        }

        // 10. 最后清理：删除每行末尾多余的隐藏列
        try {
          // 使用已有的 finalRows 和 finalColCount（在第二阶段已计算）
          if (!finalRows || !finalRows.length) return;

          // 找到实际需要的最大列数（考虑合并单元格）
          let maxNeededCol = 0;
          for (let rowIdx = 0; rowIdx < finalRows.length; rowIdx++) {
            const row = finalRows[rowIdx];
            if (!row) continue;

            try {
              for (let colIdx = 0; colIdx < (row.childrenLength || 0); colIdx++) {
                try {
                  const cell = row.getChildrenByIndex(colIdx) as TableCellBlockComponent;
                  if (cell && cell.props && cell.props.display !== 'none') {
                    const colspan = cell.props.colspan || 1;
                    maxNeededCol = Math.max(maxNeededCol, colIdx + colspan);
                  }
                } catch (e) {
                  console.warn(`fixTable: 检查第 ${rowIdx} 行第 ${colIdx} 列时出错`, e);
                }
              }
            } catch (e) {
              console.warn(`fixTable: 遍历第 ${rowIdx} 行时出错`, e);
            }
          }

          // 如果末尾有多余的列，删除它们
          // 但需要先检查是否有内容需要保留
          if (maxNeededCol > 0 && maxNeededCol < finalColCount) {
            for (let rowIdx = 0; rowIdx < finalRows.length; rowIdx++) {
              const row = finalRows[rowIdx];
              if (!row) continue;

              try {
                const currentColCount = row.childrenLength || 0;
                if (currentColCount > maxNeededCol) {
                  // 检查末尾的列是否都是隐藏的，并且没有内容
                  let canDelete = true;
                  const cellsWithContent: Array<{ cell: TableCellBlockComponent; colIdx: number }> = [];

                  for (let colIdx = maxNeededCol; colIdx < currentColCount; colIdx++) {
                    try {
                      const cell = row.getChildrenByIndex(colIdx) as TableCellBlockComponent;
                      if (cell && cell.props) {
                        // 如果单元格可见，不能删除
                        if (cell.props.display !== 'none') {
                          canDelete = false;
                          break;
                        }
                        // 如果单元格有内容，需要先移动内容
                        if (cell.hasContent) {
                          cellsWithContent.push({ cell, colIdx });
                        }
                      }
                    } catch (e) {
                      console.warn(`fixTable: 检查第 ${rowIdx} 行第 ${colIdx} 列是否可删除时出错`, e);
                    }
                  }

                  // 如果有内容的单元格，尝试将内容移动到前面的单元格
                  if (canDelete && cellsWithContent.length > 0) {
                    // 找到最后一个可见的单元格作为目标
                    let targetCell: TableCellBlockComponent | null = null;
                    for (let colIdx = maxNeededCol - 1; colIdx >= 0; colIdx--) {
                      try {
                        const candidate = row.getChildrenByIndex(colIdx) as TableCellBlockComponent;
                        if (candidate && candidate.props && candidate.props.display !== 'none') {
                          targetCell = candidate;
                          break;
                        }
                      } catch (e) {
                        // 忽略错误，继续查找
                      }
                    }

                    // 如果找到了目标单元格，移动所有内容
                    if (targetCell) {
                      for (const { cell } of cellsWithContent) {
                        try {
                          this.doc.crud.moveBlocks(cell.id, 0, cell.childrenLength, targetCell.id, targetCell.childrenLength);
                        } catch (e) {
                          console.warn(`fixTable: 移动第 ${rowIdx} 行第 ${cell.getIndexOfParent()} 列内容时出错`, e);
                        }
                      }
                    } else {
                      // 如果没找到目标单元格，不能删除（保留内容）
                      canDelete = false;
                    }
                  }

                  if (canDelete) {
                    try {
                      this.doc.crud.deleteBlocks(row.id, maxNeededCol, currentColCount - maxNeededCol);
                    } catch (e) {
                      console.warn(`fixTable: 删除第 ${rowIdx} 行多余列时出错`, e);
                    }
                  }
                }
              } catch (e) {
                console.warn(`fixTable: 处理第 ${rowIdx} 行清理时出错`, e);
              }
            }
          }
        } catch (e) {
          console.warn('fixTable: 清理多余列时出错', e);
        }
      } catch (e) {
        console.error('fixTable: 事务执行时出错', e);
      }
    });
  } catch (e) {
    console.error('fixTable: 执行失败', e);
  }
}
