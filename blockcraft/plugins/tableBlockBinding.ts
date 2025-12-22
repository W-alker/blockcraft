import {BindHotKey, DocPlugin, EventListen, IBlockSnapshot} from "../framework";
import {UIEventStateContext} from "../framework";
import {BlockCraftError, ErrorCode} from "../global";

export class TableBlockBinding extends DocPlugin {

  // TODO 可以直接block tree向上查找
  private _getTable(selection: BlockCraft.Selection) {
    const tableId = selection.firstBlock.hostElement.closest('.table-block[data-block-id]')?.getAttribute('data-block-id')
    if (!tableId) {
      throw new BlockCraftError(ErrorCode.EventDispatcherError, `Cannot find table block for selection: ${selection}`)
    }
    return this.doc.getBlockById(tableId) as BlockCraft.IBlockComponents['table']
  }

  @EventListen('copy', {flavour: 'table'})
  handleCopy(context: UIEventStateContext) {
    return this._handleCopyOrCut(context, false)
  }

  @EventListen('cut', {flavour: 'table'})
  handleCut(context: UIEventStateContext) {
    if (this.doc.isReadonly) return
    return this._handleCopyOrCut(context, true)
  }

  // @EventListen('paste', {flavour: 'table'})
  // handlePaste(context: UIEventStateContext) {
  //   if (this.doc.isReadonly) return
  //   const state = context.get('keyboardState')
  //   const {raw: evt, selection} = state
  //   const table = this._getTable(selection)
  // }

  private _handleCopyOrCut(context: UIEventStateContext, isCut: boolean): boolean {
    const selection = this.doc.selection.value
    if (!selection || !selection.from.block.flavour.startsWith('table')) return false
    context.preventDefault()
    context.stopPropagation()
    const table = this._getTable(selection)
    const coordinates = table.getSelectedCoordinates()
    if (!coordinates) return false

    const {start, end} = coordinates
    const matrix = table.getCellsMatrixByCoordinates(start, end)
    const tableSnapshot = this._createTableSnapshot(table, matrix, start, end)
    const legalSnapshot = legalizeTableModels(tableSnapshot, () => this.doc.schemas.createSnapshot('paragraph', []))

    const copyResult = this.doc.clipboard.copyBlocksModel([legalSnapshot]).then(() => {
      this.doc.messageService.success('已复制')
    })
    if (isCut) {
      copyResult.then(() => {
        this.clearCellContent(matrix.flat())
      })
    }

    return true
  }

  private _createTableSnapshot(table: BlockCraft.IBlockComponents['table'], matrix: BlockCraft.IBlockComponents['table-cell'][][], start: number[], end: number[]) {
    const snapshot = table.toSnapshot(false)
    snapshot.children = matrix.map(cells => {
      const row = this.doc.schemas.createSnapshot('table-row', [0])
      row.children = cells.map(cell => cell.toSnapshot())
      return row
    })
    snapshot.props['colWidths'] = table.props['colWidths'].slice(start[1], end[1] + 1)
    return snapshot
  }

  @BindHotKey({key: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'], shiftKey: true}, {flavour: 'table-cell'})
  handleArrow(context: UIEventStateContext) {
    const state = context.get('keyboardState')
    const {raw: evt, selection} = state
    if (!selection || selection.from.block.flavour !== 'table-cell') return false

    const block = this._getTable(selection)
    context.preventDefault()
    this.doc.selection.selectBlock(block)
    return true
  }

  @BindHotKey({key: ['Delete', 'Backspace'], shiftKey: null}, {flavour: 'table'})
  handleDelete(context: UIEventStateContext) {
    if (this.doc.isReadonly) return
    const state = context.get('keyboardState')
    const {raw: evt, selection} = state
    if (!selection.isAllSelected || selection.from.block.flavour !== 'table-cell') return
    const table = this._getTable(selection)
    const coordinates = table.getSelectedCoordinates()
    evt.preventDefault()
    if (!coordinates) {
      return false
    }
    const adjustedSelection = table.confirmSelection(coordinates.start, coordinates.end)
    const cells = table.getCellsMatrixByCoordinates(adjustedSelection.start, adjustedSelection.end).flat(1)
    this.clearCellContent(cells)
    return true
  }

  @BindHotKey({key: ['A', 'a'], shortKey: true}, {flavour: 'table-cell'})
  handleCtrlA(context: UIEventStateContext) {
    if (this.doc.isReadonly) return
    const state = context.get('keyboardState')
    const {raw: evt, selection} = state
    if (!selection.isAllSelected || selection.from.block.flavour !== 'table-cell') return false
    evt.preventDefault()
    const table = this._getTable(selection)
    this.doc.selection.selectBlock(table)
    return true
  }

  clearCellContent(cells: BlockCraft.IBlockComponents['table-cell'][]) {
    this.doc.crud.transact(() => {
      cells.forEach(cell => {
        cell.clearContent()
      })
    })
  }

  destroy(): void {
  }

  init(): void {
  }

}

function legalizeTableModels(snapshot: IBlockSnapshot, fillCb: () => IBlockSnapshot) {
  const rows = snapshot.children as IBlockSnapshot[]
  const masterMatrix = rows.map(row => {
    return (row.children as IBlockSnapshot[])
  })
  const handledCells = new Set<string>()
  // 从左上到右下遍历
  for (let rowIdx = 0; rowIdx < masterMatrix.length; rowIdx++) {
    const cells = masterMatrix[rowIdx]

    for (let colIdx = 0; colIdx < cells.length; colIdx++) {
      const cell = cells[colIdx]
      if (handledCells.has(cell.id)) {
        if (!cell.children.length) {
          cell.children = [fillCb()]
        }
        continue
      }

      // 如果是独立的被合并单元格，恢复
      if (cell.props["display"] === 'none') {
        cell.props = {
          ...cell.props,
          display: null,
          colspan: null,
          rowspan: null
        }
        if (!cell.children.length) {
          cell.children = [fillCb()]
        }
        continue
      }

      // 如果是合并单元格，则重新计算rowspan和colspan
      if (cell.props["colspan"] || cell.props["rowspan"]) {
        // 左上角开始计算
        let rowspan = 1
        let colspan = 1

        const maxColOffset = Math.min(colIdx + <number>(cell.props['colspan'] || 1), cells.length)
        // 先横向比较
        while (colspan + colIdx < maxColOffset) {
          const c = cells[colIdx + colspan]
          if (c.props['display'] === 'none') {
            colspan++
          } else {
            break
          }
        }
        const maxRowOffset = Math.min(rowIdx + <number>(cell.props['rowspan'] || 1), masterMatrix.length - 1)
        // 再纵向比较
        while (rowspan + rowIdx <= maxRowOffset) {
          const row = masterMatrix[rowIdx + rowspan]
          const c = row[colIdx]
          if (c.props['display'] === 'none') {
            rowspan++
          } else {
            break
          }
        }
        // 加入已处理
        for (let i = rowIdx; i < rowIdx + rowspan; i++) {
          for (let j = colIdx; j < colIdx + colspan; j++) {
            handledCells.add(masterMatrix[i][j].id)
          }
        }

        cell.props = {
          ...cell.props,
          colspan: colspan < 2 ? null : colspan,
          rowspan: rowspan < 2 ? null : rowspan
        }
      }

      handledCells.add(cell.id)
    }

  }
  return snapshot

}
