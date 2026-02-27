import { TableBlockComponent } from "./table.block";
import { TableCellBlockComponent } from "./table-cell.block";
import { IBlockSnapshot } from "../../framework";
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
  const masterCells = rows.map(row => row.getChildrenBlocks() as TableCellBlockComponent[]);

  const handledSourceIds = new Set<string>(); // 记录已处理过的源单元格，避免重复计算

  // 1. 先进行属性修复 (Pre-process)
  for (let rowIdx = 0; rowIdx < masterCells.length; rowIdx++) {
    // 遍历被删除范围内的每一列
    for (let c = 0; c < count; c++) {
      const colIdx = index + c;
      const cell = masterCells[rowIdx][colIdx];

      // 如果遇到了合并源单元格
      if (isSourceMergeCell(cell)) {
        if (handledSourceIds.has(cell.id)) continue;
        handledSourceIds.add(cell.id);

        const oldColspan = cell.props.colspan || 1;
        const intersection = calcIntersectionLength(colIdx, oldColspan, index, count);
        const remainingSpan = oldColspan - intersection;

        // 如果合并单元格只是部分被切除（还有剩余部分）
        if (remainingSpan > 0) {
          // 判断源单元格是否被删除了（即头部被切）
          const isHeadDeleted = colIdx >= index && colIdx < index + count;

          if (isHeadDeleted) {
            // 核心逻辑：源头被删，需要寻找新的“头部”
            // 新头部的位置应该是删除范围之后的第一列
            const newHeadColIdx = index + count;
            // 注意：这里我们假设剩余部分一定在右侧。
            // 如果删除的是中间，造成左右分裂，这在Excel里通常不支持，
            // 这里我们假设删除行为是连续的，剩余部分只会在一侧。

            const newHeadCell = masterCells[rowIdx][newHeadColIdx];
            if (newHeadCell) {
              // 将属性转移给新头部
              newHeadCell.updateProps({
                display: null, // 恢复显示
                rowspan: cell.props.rowspan, // 保持垂直合并
                colspan: remainingSpan
              });
            }
          } else {
            // 头部没被删（比如删的是尾部），直接修改源头属性
            cell.updateProps({
              colspan: remainingSpan
            });
          }
        }
        // 如果 remainingSpan <= 0，说明整个被删了，不需要做额外操作，deleteBlocks 会处理
      }

      // 如果遇到了被合并的隐藏单元格 (display: none)
      else if (cell.props.display === 'none') {
        // 向左找源头
        let l = colIdx - 1;
        while(l >= 0) {
          const leftCell = masterCells[rowIdx][l];
          if (isSourceMergeCell(leftCell)) {
            if (handledSourceIds.has(leftCell.id)) break;

            // 这里的逻辑稍微复杂，源头可能在删除范围外，也可能在范围内（上面if已处理）
            // 如果源头在删除范围外（左侧），我们需要缩减它的 colspan
            if (l < index) {
              handledSourceIds.add(leftCell.id);
              const oldSpan = leftCell.props.colspan || 1;
              const intersection = calcIntersectionLength(l, oldSpan, index, count);
              const newSpan = oldSpan - intersection;

              leftCell.updateProps({
                colspan: newSpan <= 1 ? null : newSpan
              });
            }
            break;
          }
          if(leftCell.props.display !== 'none') break; // 没找到
          l--;
        }
      }
    }
  }

  // 2. 执行物理删除
  // 注意：某些情况下列宽数组也需要同步删除
  const _colWidths = [...(this.props.colWidths || [])];
  if (_colWidths.length >= index + count) {
    _colWidths.splice(index, count);
    this.updateProps({ colWidths: _colWidths });
  }

  this.doc.crud.deleteBlocks(rows[0].parentBlock!.id, index, count); // 这里可能有误，deleteTableCols 应该是删除每行的子元素
  // 修正：删除列通常意味着遍历每行删除对应的子 Block
  this.doc.crud.transact(() => {
    rows.forEach(row => {
      this.doc.crud.deleteBlocks(row.id, index, count);
    });
  });
}

/**
 * 核心修复：删除行（处理断头合并）
 */
export function deleteTableRows(this: TableBlockComponent, index: number, count: number) {
  const rows = this.getChildrenBlocks();
  const masterCells = rows.map(row => row.getChildrenBlocks() as TableCellBlockComponent[]);
  const handledSourceIds = new Set<string>();

  // 1. 预处理：修复合并关系
  // 我们不仅要遍历删除范围内的行，还要检查可能跨越这些行的外部合并单元格
  // 但为了性能，我们主要关注删除范围内的格子引发的变更，以及上方跨下来的格子

  // 策略：遍历所有列
  const colCount = masterCells[0]?.length || 0;

  for (let c = 0; c < colCount; c++) {
    // 检查被删除区域内的格子
    for (let r = index; r < index + count; r++) {
      // 防止越界（虽然 deleteBlocks 会处理，但我们读属性需要安全）
      if (r >= masterCells.length) break;

      const cell = masterCells[r][c];

      if (isSourceMergeCell(cell)) {
        if (handledSourceIds.has(cell.id)) continue;
        handledSourceIds.add(cell.id);

        const oldRowspan = cell.props.rowspan || 1;
        const intersection = calcIntersectionLength(r, oldRowspan, index, count);
        const remainingSpan = oldRowspan - intersection;

        if (remainingSpan > 0) {
          // 源头被删了吗？
          // 源头是 cell (rowIndex = r)，既然我们在遍历删除区域，r 肯定在 [index, index+count) 之间
          // 所以源头一定被删了。

          // 新的头部应该在删除区域的下方： index + count
          const newHeadRowIdx = index + count;
          if (newHeadRowIdx < masterCells.length) {
            const newHeadCell = masterCells[newHeadRowIdx][c];
            // 转移属性
            newHeadCell.updateProps({
              display: null,
              colspan: cell.props.colspan, // 保持水平合并
              rowspan: remainingSpan
            });
          }
        }
      }
      else if (cell.props.display === 'none') {
        // 向上找源头
        let u = r - 1;
        while (u >= 0) {
          const upCell = masterCells[u][c];
          if (isSourceMergeCell(upCell)) {
            if (handledSourceIds.has(upCell.id)) break;

            // 如果源头在删除区域上方（未被删）
            if (u < index) {
              handledSourceIds.add(upCell.id);
              const oldSpan = upCell.props.rowspan || 1;
              const intersection = calcIntersectionLength(u, oldSpan, index, count);
              const newSpan = oldSpan - intersection;

              upCell.updateProps({
                rowspan: newSpan <= 1 ? null : newSpan
              });
            }
            break;
          }
          if (upCell.props.display !== 'none') break;
          u--;
        }
      }
    }
  }

  // 2. 执行物理删除
  this.doc.crud.deleteBlocks(this.id, index, count);
}

/**
 * 修复表格中逻辑合并与物理属性不一致的问题
 *
 * 策略：以可见源单元格为权威，按阅读顺序（上→下，左→右）"先到先得"构建优先级矩阵，
 * 再根据矩阵统一修正所有单元格的 display / rowspan / colspan。
 */
export function fixTable(this: TableBlockComponent) {
  const rows = this.getChildrenBlocks();
  const rowCount = rows.length;
  const colCount = rows[0]?.childrenLength || 0;
  if (rowCount === 0 || colCount === 0) return;

  // ── Phase 1: 构建优先级矩阵 ──────────────────────────────
  type CellInfo = { cell: TableCellBlockComponent; sourceRow: number; sourceCol: number };
  const matrix: (CellInfo | null)[][] = [];
  for (let i = 0; i < rowCount; i++) {
    matrix[i] = new Array(colCount).fill(null);
  }

  // 记录每个源单元格在矩阵中实际能占据的 span（可能因冲突而缩小）
  const resolvedSpans = new Map<string, { rowspan: number; colspan: number }>();

  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < colCount; c++) {
      const cell = rows[r].getChildrenByIndex(c) as TableCellBlockComponent;
      if (!cell || cell.props.display === 'none') continue;

      // 该位置已被更早的源单元格占据 → 此 cell 不能做源，后续会被修正为隐藏
      if (matrix[r][c] !== null) continue;

      const rowspan = cell.props.rowspan || 1;
      const colspan = cell.props.colspan || 1;

      // 计算实际可达的矩形区域：向右扩展时遇到已占据就停，向下同理
      let actualColspan = 0;
      for (let cc = c; cc < c + colspan && cc < colCount; cc++) {
        if (matrix[r][cc] !== null) break;
        actualColspan++;
      }
      actualColspan = Math.max(1, actualColspan);

      let actualRowspan = 0;
      for (let rr = r; rr < r + rowspan && rr < rowCount; rr++) {
        let rowAvailable = true;
        for (let cc = c; cc < c + actualColspan; cc++) {
          if (matrix[rr][cc] !== null) { rowAvailable = false; break; }
        }
        if (!rowAvailable) break;
        actualRowspan++;
      }
      actualRowspan = Math.max(1, actualRowspan);

      // 填充矩阵
      for (let rr = r; rr < r + actualRowspan; rr++) {
        for (let cc = c; cc < c + actualColspan; cc++) {
          matrix[rr][cc] = { cell, sourceRow: r, sourceCol: c };
        }
      }

      resolvedSpans.set(cell.id, { rowspan: actualRowspan, colspan: actualColspan });
    }
  }

  // ── Phase 2: 根据矩阵修复所有单元格 ─────────────────────
  let fixCount = 0;

  this.doc.crud.transact(() => {
    for (let r = 0; r < rowCount; r++) {
      for (let c = 0; c < colCount; c++) {
        const cell = rows[r].getChildrenByIndex(c) as TableCellBlockComponent;
        if (!cell) continue;

        const cellInfo = matrix[r][c];
        const isHidden = cell.props.display === 'none';

        if (!cellInfo) {
          // ── 无主位置：应该是可见 1×1 ──
          if (isHidden || cell.props.rowspan || cell.props.colspan) {
            cell.updateProps({ display: null, rowspan: null, colspan: null });
            if (cell.childrenLength === 0) {
              this.doc.crud.insertBlocks(cell.id, 0, [
                this.doc.schemas.createSnapshot('paragraph', [])
              ]);
            }
            fixCount++;
          }
        } else if (cellInfo.sourceRow === r && cellInfo.sourceCol === c) {
          // ── 当前位置是源单元格 ──
          const updates: Record<string, any> = {};

          if (isHidden) {
            updates["display"] = null;
            if (cell.childrenLength === 0) {
              this.doc.crud.insertBlocks(cell.id, 0, [
                this.doc.schemas.createSnapshot('paragraph', [])
              ]);
            }
          }

          const span = resolvedSpans.get(cell.id)!;
          const expectedRowspan = span.rowspan <= 1 ? null : span.rowspan;
          const expectedColspan = span.colspan <= 1 ? null : span.colspan;

          if ((cell.props.rowspan || null) !== expectedRowspan) updates["rowspan"] = expectedRowspan;
          if ((cell.props.colspan || null) !== expectedColspan) updates["colspan"] = expectedColspan;

          if (Object.keys(updates).length > 0) {
            cell.updateProps(updates);
            fixCount++;
          }
        } else {
          // ── 被其他源单元格占据的位置：应该隐藏 ──
          const updates: Record<string, any> = {};
          if (!isHidden) updates["display"] = 'none';
          if (cell.props.rowspan) updates["rowspan"] = null;
          if (cell.props.colspan) updates["colspan"] = null;

          if (Object.keys(updates).length > 0) {
            cell.updateProps(updates);
            fixCount++;
          }
        }
      }
    }
  });

  if (fixCount > 0) {
    console.log(`fixTable: 修复了 ${fixCount} 个单元格`);
  } else {
    console.log('fixTable: 表格数据一致，无需修复');
  }
}

export function debugTableMerge(this: TableBlockComponent) {
  const rows = this.getChildrenBlocks();
  const rowCount = rows.length;
  const colCount = rows[0]?.childrenLength || 0;

  console.log('\n========== 表格合并情况 ==========');
  console.log(`表格大小: ${rowCount} 行 × ${colCount} 列\n`);

  // 构建虚拟矩阵
  const matrix = buildCellMatrix(rows, rowCount, colCount);

  // 1. 打印逻辑矩阵（应该合并的情况）
  console.log('【逻辑矩阵】每个位置应该被哪个源单元格占据:');
  const logicalTable: any = {};
  for (let r = 0; r < rowCount; r++) {
    const rowData: any = {};
    for (let c = 0; c < colCount; c++) {
      const cellInfo = matrix[r][c];
      if (cellInfo) {
        const { sourceRow, sourceCol } = cellInfo;
        rowData[`列${c}`] = `(${sourceRow},${sourceCol})`;
      } else {
        rowData[`列${c}`] = '空';
      }
    }
    logicalTable[`行${r}`] = rowData;
  }
  console.table(logicalTable);

  // 2. 打印物理结构（真实属性）
  console.log('\n【物理结构】每行的实际单元格属性:');
  const physicalTable: any = {};
  rows.forEach((row, r) => {
    const cells = row.getChildrenBlocks() as TableCellBlockComponent[];
    const rowData: any = {};

    cells.forEach((cell, c) => {
      const display = cell.props.display;
      const rowspan = cell.props.rowspan || 1;
      const colspan = cell.props.colspan || 1;

      if (display === 'none') {
        rowData[`列${c}`] = '隐藏';
      } else if (rowspan > 1 || colspan > 1) {
        rowData[`列${c}`] = `${rowspan}×${colspan}`;
      } else {
        rowData[`列${c}`] = '1×1';
      }
    });

    physicalTable[`行${r}`] = rowData;
  });
  console.table(physicalTable);

  // 3. 打印差异检测
  console.log('\n【差异检测】逻辑与物理不一致的单元格:');
  const errors: any[] = [];

  for (let r = 0; r < rowCount; r++) {
    const row = rows[r];
    const cells = row.getChildrenBlocks() as TableCellBlockComponent[];

    cells.forEach((cell, physicalIdx) => {
      // 在此表格模型中，每行始终有 colCount 个子 cell，物理索引即逻辑列索引
      const logicalCol = physicalIdx;

      const cellInfo = matrix[r]?.[logicalCol];
      const isHidden = cell.props.display === 'none';
      const shouldBeHidden = cellInfo && (cellInfo.sourceRow !== r || cellInfo.sourceCol !== logicalCol);

      if (isHidden !== shouldBeHidden) {
        errors.push({
          位置: `(${r},${logicalCol})`,
          物理索引: physicalIdx,
          当前display: isHidden ? 'none' : 'visible',
          应该是: shouldBeHidden ? 'none' : 'visible',
          占据者: cellInfo ? `(${cellInfo.sourceRow},${cellInfo.sourceCol})` : '无',
          问题: isHidden ? '不应该隐藏' : '应该隐藏'
        });
      }

      // 检查合并属性
      if (!isHidden && cellInfo) {
        const actualRowspan = cell.props.rowspan || 1;
        const actualColspan = cell.props.colspan || 1;

        // 计算该源单元格应该占据的范围
        let expectedRowspan = 1;
        let expectedColspan = 1;

        for (let rr = r; rr < rowCount; rr++) {
          if (matrix[rr]?.[logicalCol]?.cell.id === cell.id) {
            expectedRowspan = rr - r + 1;
          } else {
            break;
          }
        }

        for (let cc = logicalCol; cc < colCount; cc++) {
          if (matrix[r]?.[cc]?.cell.id === cell.id) {
            expectedColspan = cc - logicalCol + 1;
          } else {
            break;
          }
        }

        if (actualRowspan !== expectedRowspan || actualColspan !== expectedColspan) {
          errors.push({
            位置: `(${r},${logicalCol})`,
            物理索引: physicalIdx,
            当前合并: `${actualRowspan}×${actualColspan}`,
            应该是: `${expectedRowspan}×${expectedColspan}`,
            占据者: '自己',
            问题: '合并范围不正确'
          });
        }
      }
    });
  }

  if (errors.length > 0) {
    console.table(errors);
  } else {
    console.log('  ✓ 没有发现不一致');
  }

  console.log('\n==================================\n');
}
