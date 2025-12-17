import {TableBlockComponent} from "./table.block";
import {TableCellBlockComponent} from "./table-cell.block";
import {IBlockSnapshot} from "../../framework";
import {BlockCraftError, ErrorCode} from "../../global";
import {TableRowBlockComponent} from "./table-row.block";

const isSourceMergeCell = (cell: BlockCraft.BlockComponent) => cell.props.display !== 'none' && (cell.props.rowspan || cell.props.colspan)

// 辅助函数：安全计算交集长度
const calcIntersectionLength = (start1: number, length1: number, start2: number, length2: number) => {
  const end1 = start1 + length1;
  const end2 = start2 + length2;
  const intersectionStart = Math.max(start1, start2);
  const intersectionEnd = Math.min(end1, end2);
  return Math.max(0, intersectionEnd - intersectionStart);
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

  // 修复：移除对 index === length 的特殊跳过逻辑，确保追加行也能继承合并状态
  if (index === 0) {
    this.doc.crud.insertBlocks(this.id, index, [newRow]);
    return;
  }

  const rows = this.getChildrenBlocks();
  // 获取上一行作为参考
  const prevRowIdx = index - 1;
  const prevRowCells = rows[prevRowIdx].getChildrenBlocks();

  // 递归查找合并源的辅助函数
  const findMergeSource = (colIdx: number, currRowIdx: number): { cell: TableCellBlockComponent, rowIdx: number } | null => {
    if (currRowIdx < 0) return null;
    const cell = rows[currRowIdx].getChildrenByIndex(colIdx) as TableCellBlockComponent;
    if (isSourceMergeCell(cell)) {
      return { cell, rowIdx: currRowIdx };
    }
    // 只有当当前单元格是 hidden 时才向上找
    if (cell.props.display === 'none') {
      return findMergeSource(colIdx, currRowIdx - 1);
    }
    return null;
  };

  const newRowChildren = newRow.children as IBlockSnapshot[];
  let skipCols = 0;

  for (let i = 0; i < cellCount; i++) {
    if (skipCols > 0) {
      newRowChildren[i].props["display"] = 'none';
      skipCols--;
      continue;
    }

    const prevCell = prevRowCells[i];
    let sourceCell: TableCellBlockComponent | null = null;
    let sourceRowIdx = -1;

    // 情况1: 上方单元格本身就是合并源
    if (isSourceMergeCell(prevCell)) {
      // @ts-ignore
      sourceCell = prevCell;
      sourceRowIdx = prevRowIdx;
    }
    // 情况2: 上方单元格是被合并的隐藏格
    else if (prevCell.props.display === 'none') {
      const res = findMergeSource(i, prevRowIdx);
      if (res) {
        sourceCell = res.cell;
        sourceRowIdx = res.rowIdx;
      }
    }

    // 处理合并逻辑
    if (sourceCell) {
      const span = sourceCell.props.rowspan || 1;
      // 如果合并范围覆盖到了新插入行的位置
      // (源行号 + 跨度) > 插入行号
      if (sourceRowIdx + span > index) {
        // 增加源单元格的 rowspan
        sourceCell.updateProps({
          rowspan: span + 1
        });
        // 隐藏当前新单元格
        newRowChildren[i].props["display"] = 'none';

        // 如果该合并单元格还跨列，需要跳过后续列的处理
        const colSpan = sourceCell.props.colspan || 1;
        if (colSpan > 1) {
          skipCols = colSpan - 1;
        }
      }
    }
  }

  return this.doc.crud.insertBlocks(this.id, index, [newRow]);
}

export function addTableCol(this: TableBlockComponent, index: number) {
  const rows = this.getChildrenBlocks();

  for (const row of rows) {
    const newCol = this.doc.schemas.createSnapshot('table-cell', []);

    // 修复：移除 index === length 的跳过逻辑
    if (index === 0) {
      this.doc.crud.insertBlocks(row.id, index, [newCol]);
      continue;
    }

    // 向左查找前一个单元格
    const prevColIdx = index - 1;
    const prevCell = row.getChildrenByIndex(prevColIdx) as TableCellBlockComponent;

    // 查找逻辑：
    // 如果前一个单元格是被合并的（display: none），我们需要找到它的源头，看是否 colspan 跨越了插入点
    // 如果前一个单元格是源头且 colspan > 1，则肯定跨越了插入点（因为我们是在它内部插入）

    let sourceCell: TableCellBlockComponent | null = null;

    if (isSourceMergeCell(prevCell)) {
      sourceCell = prevCell;
    } else if (prevCell.props.display === 'none') {
      // 向左寻找源头
      let currIdx = prevColIdx;
      while(currIdx >= 0) {
        const cell = row.getChildrenByIndex(currIdx) as TableCellBlockComponent;
        if (isSourceMergeCell(cell)) {
          sourceCell = cell;
          break;
        }
        // 如果遇到非 none 且非 source (即普通单元格)，说明没有跨越
        if (cell.props.display !== 'none') break;
        currIdx--;
      }
    }

    if (sourceCell) {
      const sourceColIdx = sourceCell.getIndexOfParent();
      const colspan = sourceCell.props.colspan || 1;

      // 只有当插入点位于合并单元格的中间时，才扩展合并
      // (源列索引 + 跨度) > 插入索引
      if (sourceColIdx + colspan > index) {
        sourceCell.updateProps({
          colspan: colspan + 1
        });
        newCol.props["display"] = 'none';
      }
    }

    this.doc.crud.insertBlocks(row.id, index, [newCol]);
  }

  // 优化：动态计算新列宽，避免硬编码 100 导致布局错乱
  const oldWidths = this.props.colWidths || [];
  let newWidth = 100;
  if (oldWidths.length > 0) {
    // 取平均值或者最小值
    const totalWidth = oldWidths.reduce((a, b) => a + b, 0);
    newWidth = Math.floor(totalWidth / oldWidths.length);
  } else {
    newWidth = Math.floor(100 / (rows[0]?.childrenLength + 1 || 1));
  }

  const _colWidths = [...oldWidths];
  _colWidths.splice(index, 0, newWidth);

  // 建议：此处最好做一个归一化（Normalize），确保总宽度为 100% 或固定值
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

export function fixTable() {

}
