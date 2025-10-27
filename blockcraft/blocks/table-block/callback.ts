import {TableBlockComponent} from "./table.block";
import {TableCellBlockComponent} from "./table-cell.block";
import {IBlockSnapshot} from "../../framework";
import {BlockCraftError, ErrorCode} from "../../global";
import {TableRowBlockComponent} from "./table-row.block";

const isSourceMergeCell = (cell: BlockCraft.BlockComponent) => cell.props.display !== 'none' && (cell.props.rowspan || cell.props.colspan)
/**
 * 合并单元格（优先确认范围）
 * @param start 起始坐标
 * @param end 结束坐标
 */
export function mergeTableCells(this: TableBlockComponent, start: number[], end: number[]) {
  const adjustedSelection = this.confirmSelection(start, end)

  const cells = this.getCellsMatrixByCoordinates(adjustedSelection.start, adjustedSelection.end)

  const {start: [startRowIdx, startColIdx], end: [endRowIdx, endColIdx]} = adjustedSelection
  const firstCell = cells[0][0] as TableCellBlockComponent

  this.doc.crud.transact(() => {

    firstCell.updateProps({
      rowspan: endRowIdx - startRowIdx + 1,
      colspan: endColIdx - startColIdx + 1
    })

    for (let i = 0; i < cells.length; i++) {
      const rowCells = cells[i]

      rowCells.forEach(cell => {
        if (cell === firstCell) return
        if (cell.props.display === 'none') return
        if (cell.hasContent) {
          this.doc.crud.moveBlocks(cell.id, 0, cell.childrenLength, firstCell.id, firstCell.childrenLength)
        }
        cell.updateProps({display: 'none', rowspan: null, colspan: null})
      })
    }

  })

  this._clearSelected()
  this.doc.selection.selectBlock(firstCell)
  this._startSelectingCell = this._lastSelectingCell = firstCell
  return firstCell
}

export function unMergeTableCell(this: TableBlockComponent, cell: TableCellBlockComponent) {
  const rowIds = this.childrenIds
  const rowIdx = rowIds.indexOf(cell.parentBlock!.id)
  const colIdx = cell.getIndexOfParent()

  const rowspan = cell.props.rowspan!
  const colspan = cell.props.colspan!
  this.doc.crud.transact(() => {

    for (let i = rowIdx; i < rowIdx + rowspan; i++) {
      const row = this.doc.getBlockById(this.childrenIds[i]) as TableRowBlockComponent
      for (let j = colIdx; j < colIdx + colspan; j++) {
        const cell = row.childrenIds[j]
        const cellBlock = this.doc.getBlockById(cell) as TableCellBlockComponent

        if (!cellBlock.childrenLength) {
          const p = this.doc.schemas.createSnapshot('paragraph', [])
          this.doc.crud.insertBlocks(cellBlock.id, 0, [p])
        }
        cellBlock.updateProps({colspan: null, rowspan: null, display: null})

        this.selectCell(cellBlock)
      }
    }

  })
  this._startSelectingCell = cell
  this._lastSelectingCell = this.doc.getBlockById(rowIds[rowIdx + rowspan - 1]).getChildrenByIndex(colIdx + colspan - 1) as TableCellBlockComponent
}

export function addTableRow(this: TableBlockComponent, index: number) {
  const cellCount = this.firstChildren!.childrenLength
  const newRow = this.doc.schemas.createSnapshot('table-row', [cellCount])
  if (index === 0 || index === this.childrenLength) {
    this.doc.crud.insertBlocks(this.id, index, [newRow])
    return
  }

  const rows = this.getChildrenBlocks()
  const prevRowCells = rows[index - 1].getChildrenBlocks()

  const findMergeCellRecursion = (colIdx: number, rowIdx: number): {
    cell: TableCellBlockComponent,
    rowIdx: number
  } | null => {
    const cell = rows[rowIdx].getChildrenByIndex(colIdx) as TableCellBlockComponent
    if (isSourceMergeCell(cell)) {
      return {
        cell,
        rowIdx
      }
    }
    if (rowIdx === 0) {
      return null
    }
    return findMergeCellRecursion(colIdx, rowIdx - 1)
  }

  const newRowChildren = newRow.children as IBlockSnapshot[]

  let mergeColRange = 0
  let setDisplayNone = false
  // 一一比对是否有被合并的单元格
  for (let i = 0; i < cellCount; i++) {

    if (mergeColRange > 0) {
      mergeColRange--
      setDisplayNone && (newRowChildren[i].props["display"] = 'none')
      continue
    }

    const prevCell = prevRowCells[i]

    // 如果有合并单元格
    if (isSourceMergeCell(prevCell)) {

      if (prevCell.props.rowspan > 1) {
        prevCell.updateProps({
          rowspan: prevCell.props.rowspan! + 1
        })
        newRowChildren[i].props["display"] = 'none'
        setDisplayNone = true
      } else {
        setDisplayNone = false
      }

      mergeColRange = (prevCell.props.colspan || 1) - 1
      continue
    }

    if (prevCell.props.display === 'none') {

      // 如果有，找到原始合并单元格，设置rowspan+count
      // 查找方式为向上递归查找
      const result = findMergeCellRecursion(i, index - 1)!
      if (!result) {
        this.doc.logger.warn('TableBlockComponent', 'addRows', 'findMergeCellRecursion', 'result is null')
        continue
      }
      const {cell, rowIdx} = result

      if (index >= (cell.props.rowspan || 1) + rowIdx) {
        setDisplayNone = false
      } else {
        setDisplayNone = true
        newRowChildren[i].props["display"] = 'none'
        cell.updateProps({
          rowspan: cell.props.rowspan! + 1
        })
      }

      mergeColRange = (cell.props.colspan || 1) - 1
    }

  }

  return this.doc.crud.insertBlocks(this.id, index, [newRow])
}

export function addTableCol(this: TableBlockComponent, index: number) {
  const rows = this.getChildrenBlocks()

  let mergeRowRange = 0
  let setDisplayNone = false

  for (const row of rows) {
    const newCol = this.doc.schemas.createSnapshot('table-cell', [])

    if (index === 0 || index === row.childrenLength) {
      this.doc.crud.insertBlocks(row.id, index, [newCol])
      continue
    }

    if (mergeRowRange > 0) {
      mergeRowRange--
      setDisplayNone && (newCol.props["display"] = 'none')
      this.doc.crud.insertBlocks(row.id, index, [newCol])
      continue
    }

    const prevCell = row.getChildrenByIndex(index - 1) as TableCellBlockComponent
    // 是合并单元格
    if (isSourceMergeCell(prevCell)) {

      if (<number>prevCell.props.colspan > 1) {

        prevCell.updateProps({
          colspan: prevCell.props.colspan! + 1
        })
        newCol.props["display"] = 'none'
        setDisplayNone = true
      } else {
        setDisplayNone = false
      }

      mergeRowRange = (prevCell.props.rowspan || 1) - 1
      this.doc.crud.insertBlocks(row.id, index, [newCol])
      continue
    }

    if (prevCell.props.display === 'none') {

      // 如果有，找到原始合并单元格，设置rowspan+count
      // 查找方式为向左递归查找
      let findColIdx = index - 1
      while (findColIdx >= 0) {
        if (<number>row.getChildrenByIndex(findColIdx).props.colspan > 1) {
          break
        }
        findColIdx--
      }

      if (findColIdx < 0) {
        throw new BlockCraftError(ErrorCode.ModelCRUDError, 'findColIdx < 0')
      }

      const mergeCell = row.getChildrenByIndex(findColIdx) as TableCellBlockComponent
      mergeRowRange = (mergeCell.props.rowspan || 1) - 1

      if (index >= (mergeCell.props.colspan || 1) + findColIdx) {
        setDisplayNone = false
        this.doc.crud.insertBlocks(row.id, index, [newCol])
        continue
      }

      setDisplayNone = true
      mergeCell.updateProps({
        colspan: mergeCell.props.colspan! + 1
      })
      newCol.props["display"] = 'none'
      this.doc.crud.insertBlocks(row.id, index, [newCol])
      continue
    }

    this.doc.crud.insertBlocks(row.id, index, [newCol])
  }

  const _colWidths: number[] = [...this.props.colWidths]
  _colWidths.splice(index, 0, ...new Array(1).fill(100))
  this.updateProps({colWidths: _colWidths})

}

/**
 * 删除表格列
 * @param index - 起始列索引（从0开始）
 * @param count - 要删除的列数量
 */
export function deleteTableCols(this: TableBlockComponent, index: number, count: number) {
  const rows = this.getChildrenBlocks()
  const masterCells = rows.map(row => row.getChildrenBlocks())
  const handledCells = new Set<string>()

  // 要处理的二维范围
  const handleRange = {
    start: [index, index],
    end: [index + count - 1, index + count - 1]
  }

  for (let rowIdx = 0; rowIdx < masterCells.length; rowIdx++) {

    const cells = masterCells[rowIdx]
    for (let colIdx = index; colIdx < index + count; colIdx++) {
      const cell = cells[colIdx]

      if (handledCells.has(cell.id)) continue

      // 当前行涉及到的位置中有原始合并单元格
      if (isSourceMergeCell(cell)) {
        // 处理被它合并过的单元格(隐藏单元格)
        for (let r = 0; r < (cell.props.rowspan || 1); r++) {
          for (let c = 0; c < (cell.props.colspan || 1); c++) {
            const targetCell = masterCells[rowIdx + r][colIdx + c]
            if (targetCell && !handledCells.has(targetCell.id)) {
              handledCells.add(targetCell.id)

              // 如果在二维范围内
              if (rowIdx + r >= handleRange.start[0] && rowIdx + r <= handleRange.end[0] &&
                colIdx + c >= handleRange.start[1] && colIdx + c <= handleRange.end[1]) {

              } else {
                // 恢复隐藏单元格
                targetCell.updateProps({display: null})
              }

            }
          }
        }
      }

      handledCells.add(cell.id)

      // 如果是被合并的单元格
      if (cell.props.display === 'none') {
        // 向左查找主合并单元格
        for (let l = colIdx - 1; l >= 0; l--) {
          const leftCell = cells[l]
          if (leftCell.props.display !== 'none' && leftCell.props.colspan > 1) {

            // 存储涉及到的隐藏单元格，防止重复处理
            for (let r = 0; r < (leftCell.props.rowspan || 1); r++) {
              for (let c = 1; c < (leftCell.props.colspan || 1); c++) {
                const targetCell = masterCells[rowIdx + r][l + c]
                if (targetCell) {
                  handledCells.add(targetCell.id)
                }
              }
            }

            const newSpan = calcNewSpan(l, leftCell.props.colspan!, index, count)
            leftCell.updateProps({
              colspan: newSpan <= 1 ? null : newSpan
            })

            break
          }
        }
      }

    }

    // 删除单元格
    this.doc.crud.deleteBlocks(rows[rowIdx].id, index, count)
  }

}

const calcNewSpan = (start1: number, length1: number, start2: number, length2: number) => {
  const end1 = start1 + length1;
  const end2 = start2 + length2;

  const intersectionStart = Math.max(start1, start2);
  const intersectionEnd = Math.min(end1, end2);

  const intersectionLength = Math.max(0, intersectionEnd - intersectionStart);
  return length1 - intersectionLength;
}

/**
 * 删除表格行
 * @param index - 起始行索引（从0开始）
 * @param count - 要删除的行数量
 */
export function deleteTableRows(this: TableBlockComponent, index: number, count: number) {
  const rows = this.getChildrenBlocks()
  const masterCells = rows.map(row => row.getChildrenBlocks())
  const handledCells = new Set<string>()

  // 要处理的二维范围
  const handleRange = {
    start: [index, index],
    end: [index + count - 1, index + count - 1]
  }
  for (let colIdx = 0; colIdx < masterCells[0].length; colIdx++) {
    for (let rowIdx = index; rowIdx < index + count; rowIdx++) {
      const cell = masterCells[rowIdx][colIdx]
      if (handledCells.has(cell.id)) continue

      // 当前列涉及到的位置中有原始合并单元格
      if (isSourceMergeCell(cell)) {
        // 处理被它合并过的单元格(隐藏单元格)
        for (let r = 0; r < (cell.props.rowspan || 1); r++) {
          for (let c = 0; c < (cell.props.colspan || 1); c++) {
            const targetCell = masterCells[rowIdx + r][colIdx + c]
            if (targetCell && !handledCells.has(targetCell.id)) {
              handledCells.add(targetCell.id)

              // 如果在二维范围内
              if (rowIdx + r >= handleRange.start[0] && rowIdx + r <= handleRange.end[0] &&
                colIdx + c >= handleRange.start[1] && colIdx + c <= handleRange.end[1]) {

              } else {
                // 恢复隐藏单元格
                targetCell.updateProps({display: null})
              }
            }

          }

        }

      }
      handledCells.add(cell.id)

      // 如果是被合并的单元格
      if (cell.props.display === 'none') {
        // 向上查找主合并单元格
        for (let u = rowIdx - 1; u >= 0; u--) {
          const upCell = masterCells[u][colIdx]
          if (upCell.props.display !== 'none' && upCell.props.rowspan > 1) {
            // 存储涉及到的隐藏单元格，防止重复处理
            for (let r = 1; r < (upCell.props.rowspan || 1); r++) {
              for (let c = 0; c < (upCell.props.colspan || 1); c++) {
                const targetCell = masterCells[u + r][colIdx + c]
                if (targetCell) {
                  handledCells.add(targetCell.id)
                }

              }
            }
            const newSpan = calcNewSpan(u, upCell.props.rowspan!, index, count)
            upCell.updateProps({
              rowspan: newSpan <= 1 ? null : newSpan
            })
            break
          }
        }

      }

    }

  }

  // 执行删除行
  this.doc.crud.deleteBlocks(this.id, index, count)
}

// 修复有可能出现的隐藏不一致或缺少单元格问题
export function fixTable(this: TableBlockComponent): void {
  // 立即检查必要的上下文
  if (!this.doc || !this.doc.crud) {
    return;
  }

  try {
    // 安全获取所有行
    const rows = this.getChildrenBlocks() || [];
    
    // 边界情况：如果没有行，直接返回
    if (rows.length === 0) {
      return;
    }
    
    // 安全获取单元格矩阵
    const masterCells: any[][] = [];
    for (const row of rows) {
      const cells = row.getChildrenBlocks() || [];
      masterCells.push(cells);
    }
    
    // 边界情况：如果第一行没有单元格，直接返回
    if (!masterCells[0] || masterCells[0].length === 0) {
      return;
    }
    
    // 用于跟踪已处理的单元格
    const handledCells = new Set<string>();
    
    // 计算最大列数，避免空数组问题
    let maxCols = 0;
    for (const cells of masterCells) {
      if (cells.length > maxCols) {
        maxCols = cells.length;
      }
    }
    
    // 执行事务操作
    this.doc.crud.transact(() => {
      // 修复每一行的列数一致性
      for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
        const row = rows[rowIdx];
        const cells = masterCells[rowIdx] || [];
        
        if (cells.length < maxCols && row.id && this.doc.schemas) {
          for (let i = cells.length; i < maxCols; i++) {
            try {
              // 尝试创建新单元格
              const newCell = this.doc.schemas.createSnapshot('table-cell', []);
              this.doc.crud.insertBlocks(row.id, i, [newCell]);
            } catch (error) {
              // 静默处理错误，避免中断整体流程
              if (this.doc.logger && typeof this.doc.logger.warn === 'function') {
                this.doc.logger.warn('TableBlockComponent', 'fixTable', 'Failed to create cell');
              }
            }
          }
        }
      }

      // 重新获取更新后的单元格矩阵
      const updatedMasterCells: any[][] = [];
      for (const row of rows) {
        const cells = row.getChildrenBlocks() || [];
        updatedMasterCells.push(cells);
      }
      
      // 修复合并单元格引用问题和隐藏状态问题
      for (let rowIdx = 0; rowIdx < updatedMasterCells.length; rowIdx++) {
        const rowCells = updatedMasterCells[rowIdx] || [];
        for (let colIdx = 0; colIdx < rowCells.length; colIdx++) {
          const cell = rowCells[colIdx];
          
          // 跳过无效或已处理的单元格
          if (!cell || !cell.id || handledCells.has(cell.id)) {
            continue;
          }
          
          // 标记为已处理
          handledCells.add(cell.id);
          
          // 检查单元格属性
          const cellProps = cell.props || {};
          
          // 检查是否是源合并单元格（未隐藏且有合并属性）
          if (cellProps.display !== 'none' && (cellProps.rowspan || cellProps.colspan)) {
            // 获取合并属性，确保类型安全
            const rowspan = Number(cellProps.rowspan) || 1;
            const colspan = Number(cellProps.colspan) || 1;
            
            // 处理合并影响的单元格
            for (let r = 0; r < rowspan; r++) {
              for (let c = 0; c < colspan; c++) {
                const targetRowIdx = rowIdx + r;
                const targetColIdx = colIdx + c;
                
                // 检查目标位置有效性
                if (targetRowIdx >= 0 && targetRowIdx < updatedMasterCells.length) {
                  const targetRow = updatedMasterCells[targetRowIdx];
                  if (targetRow && targetColIdx >= 0 && targetColIdx < targetRow.length) {
                    const targetCell = targetRow[targetColIdx];
                    
                    // 跳过源单元格或无效单元格
                    if (!targetCell || targetCell === cell || !targetCell.id) {
                      continue;
                    }
                    
                    // 标记目标单元格为已处理
                    handledCells.add(targetCell.id);
                    
                    // 确保被合并单元格正确隐藏
                    if (targetCell.updateProps && (!targetCell.props || targetCell.props.display !== 'none')) {
                      targetCell.updateProps({ display: 'none' });
                    }
                  }
                }
              }
            }
          }
          // 检查被隐藏的单元格是否有有效源
          else if (cellProps.display === 'none' && cell.updateProps) {
            let hasValidSource = false;
            
            // 向上查找源合并单元格
            for (let r = rowIdx - 1; r >= 0; r--) {
              const upRow = updatedMasterCells[r];
              if (!upRow) break;
              
              const upCell = upRow[colIdx];
              if (upCell && upCell.props && upCell.props.display !== 'none') {
                const upRowspan = Number(upCell.props.rowspan) || 1;
                if (r + upRowspan > rowIdx) {
                  hasValidSource = true;
                  break;
                }
              }
            }
            
            // 向左查找源合并单元格
            if (!hasValidSource) {
              for (let c = colIdx - 1; c >= 0; c--) {
                const leftCell = rowCells[c];
                if (leftCell && leftCell.props && leftCell.props.display !== 'none') {
                  const leftColspan = Number(leftCell.props.colspan) || 1;
                  if (c + leftColspan > colIdx) {
                    hasValidSource = true;
                    break;
                  }
                }
              }
            }
            
            // 如果没有有效源，恢复显示
            if (!hasValidSource) {
              cell.updateProps({ display: null });
            }
          }
        }
      }
      
      // 处理列宽设置
      const currentColWidths = this.props?.colWidths;
      if (Array.isArray(currentColWidths)) {
        const newColWidths = [...currentColWidths];
        
        // 添加或移除列宽以匹配实际列数
        while (newColWidths.length < maxCols) {
          newColWidths.push(100);
        }
        while (newColWidths.length > maxCols) {
          newColWidths.pop();
        }
        
        // 仅在需要时更新
        let needsUpdate = false;
        if (newColWidths.length !== currentColWidths.length) {
          needsUpdate = true;
        } else {
          for (let i = 0; i < newColWidths.length; i++) {
            if (newColWidths[i] !== currentColWidths[i]) {
              needsUpdate = true;
              break;
            }
          }
        }
        
        if (needsUpdate && this.updateProps) {
          this.updateProps({ colWidths: newColWidths });
        }
      } else if (maxCols > 0 && this.updateProps) {
        // 初始化新的列宽数组
        this.updateProps({ colWidths: Array(maxCols).fill(100) });
      }
    });
  } catch (error) {
    // 错误处理
    if (this.doc && this.doc.logger && typeof this.doc.logger.error === 'function') {
      this.doc.logger.error('TableBlockComponent', 'fixTable', 'Failed to fix table');
    }
  }
}


