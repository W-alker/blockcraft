import {
  BindHotKey,
  ClipboardDataType,
  DOC_ADAPTER_SERVICE_TOKEN,
  DocPlugin,
  EventListen,
  IBlockSnapshot,
  replaceSnapshotsIdDeeply
} from "../framework";
import {UIEventStateContext} from "../framework";
import {BlockCraftError, ErrorCode} from "../global";
import {parseClipboardSnapshot, parseClipboardSnapshotFromHtml} from "../framework/modules/clipboard/internal-clipboard";
import {
  cloneSnapshot,
  createTableSnapshotFromMatrix,
  getMarkdownClipboardText,
  parseTabularText
} from "../framework/modules/clipboard/paste-utils";

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

  @EventListen('paste', {flavour: 'table'})
  handlePaste(context: UIEventStateContext) {
    if (this.doc.isReadonly) return

    const state = context.get('clipboardState')
    const {selection} = state
    if (!selection) return false

    let table: BlockCraft.IBlockComponents['table']
    try {
      table = this._getTable(selection)
    } catch {
      return false
    }

    if (!this._hasPastedTableData(state)) return false

    const startCoordinate = this._getPasteStartCoordinate(table, selection)
    if (!startCoordinate) return false

    context.preventDefault()
    void this._parsePastedTableSnapshot(state).then(tableSnapshot => {
      if (!tableSnapshot) return
      this._fillTableFromSnapshot(table, tableSnapshot, startCoordinate)
    })
    return true
  }

  private _getPasteStartCoordinate(table: BlockCraft.IBlockComponents['table'], selection: BlockCraft.Selection) {
    const coordinates = table.getSelectedCoordinates()
    if (coordinates) return coordinates.start

    const cellId = selection.firstBlock.hostElement
      .closest('td[data-block-id]')
      ?.getAttribute('data-block-id')
    if (!cellId) return null

    const cell = this.doc.getBlockById(cellId) as BlockCraft.IBlockComponents['table-cell']
    const rowIndex = table.childrenIds.indexOf(cell.parentId!)
    const colIndex = cell.getIndexOfParent()
    if (rowIndex < 0 || colIndex < 0) return null

    return [rowIndex, colIndex]
  }

  private _hasPastedTableData(state: {
    dataTypes: readonly string[]
    getData: (type: ClipboardDataType) => string | null
  }) {
    if (state.dataTypes.includes(ClipboardDataType.BLOCKCRAFT_SNAPSHOT)) {
      const snapshot = parseClipboardSnapshot(state.getData(ClipboardDataType.BLOCKCRAFT_SNAPSHOT))
      if (snapshot && findFirstTableSnapshot(snapshot)) return true
    }

    if (state.dataTypes.includes(ClipboardDataType.HTML)) {
      const htmlString = state.getData(ClipboardDataType.HTML)
      const snapshot = parseClipboardSnapshotFromHtml(htmlString)
      if (snapshot && findFirstTableSnapshot(snapshot)) return true
      if (htmlString && /<table[\s>]/i.test(htmlString)) return true
    }

    const plainText = state.getData(ClipboardDataType.TEXT) || ''
    const markdownText = getMarkdownClipboardText(state) || (plainText && looksLikeMarkdownTable(plainText) ? plainText : null)
    if (markdownText && looksLikeMarkdownTable(markdownText)) return true

    const tabularText = state.getData(ClipboardDataType.TSV) || plainText
    return !!tabularText && !!parseTabularText(tabularText)
  }

  private async _parsePastedTableSnapshot(state: {
    dataTypes: readonly string[]
    getData: (type: ClipboardDataType) => string | null
  }) {
    let rootSnapshot: IBlockSnapshot | null = null

    if (state.dataTypes.includes(ClipboardDataType.BLOCKCRAFT_SNAPSHOT)) {
      rootSnapshot = parseClipboardSnapshot(state.getData(ClipboardDataType.BLOCKCRAFT_SNAPSHOT))
    }

    if (!rootSnapshot && state.dataTypes.includes(ClipboardDataType.HTML)) {
      const htmlString = state.getData(ClipboardDataType.HTML)
      rootSnapshot = parseClipboardSnapshotFromHtml(htmlString)
      if (!rootSnapshot && htmlString) {
        const htmlAdapter = this.doc.injector.get(DOC_ADAPTER_SERVICE_TOKEN)?.getAdapter(ClipboardDataType.HTML)
        if (htmlAdapter) {
          try {
            rootSnapshot = await htmlAdapter.toSnapshot(htmlString)
          } catch (e) {
            this.doc.logger.warn('table html paste parse error', e)
          }
        }
      }
    }

    const plainText = state.getData(ClipboardDataType.TEXT) || ''
    const markdownText = getMarkdownClipboardText(state) || (plainText && looksLikeMarkdownTable(plainText) ? plainText : null)
    if (!rootSnapshot && markdownText) {
      const markdownAdapter = this.doc.injector.get(DOC_ADAPTER_SERVICE_TOKEN)?.getAdapter(ClipboardDataType.MARKDOWN)
      if (markdownAdapter) {
        try {
          rootSnapshot = await markdownAdapter.toSnapshot(markdownText)
        } catch (e) {
          this.doc.logger.warn('table markdown paste parse error', e)
        }
      }
    }

    if (!rootSnapshot) {
      const tabularText = state.getData(ClipboardDataType.TSV) || plainText
      const matrix = tabularText ? parseTabularText(tabularText) : null
      if (matrix) {
        return createTableSnapshotFromMatrix(this.doc, matrix, 0)
      }
    }

    return rootSnapshot ? findFirstTableSnapshot(rootSnapshot) : null
  }

  private _fillTableFromSnapshot(
    table: BlockCraft.IBlockComponents['table'],
    sourceTable: IBlockSnapshot,
    start: number[]
  ) {
    const sourceRows = getPastedTableCellGrid(sourceTable)
    if (!sourceRows.length) return

    this.doc.crud.transact(() => {
      for (let rowOffset = 0; rowOffset < sourceRows.length; rowOffset++) {
        const targetRowIndex = start[0] + rowOffset
        if (targetRowIndex >= table.rowLength) break

        const sourceCells = sourceRows[rowOffset]
        const targetRow = table.getChildrenByIndex(targetRowIndex)

        for (let colOffset = 0; colOffset < sourceCells.length; colOffset++) {
          const sourceCell = sourceCells[colOffset]
          const targetCellId = targetRow.childrenIds[start[1] + colOffset]
          if (!targetCellId) break
          if (!sourceCell) continue

          const targetCell = this.doc.getBlockById(targetCellId) as BlockCraft.IBlockComponents['table-cell']
          if (targetCell.props.display === 'none') continue

          const children = cloneSnapshot(sourceCell.children || []) as IBlockSnapshot[]
          const nextChildren = children.length
            ? children
            : [this.doc.schemas.createSnapshot('paragraph', [])]
          replaceSnapshotsIdDeeply(nextChildren)

          if (targetCell.childrenLength) {
            this.doc.crud.deleteBlocks(targetCell.id, 0, targetCell.childrenLength, true)
          }
          this.doc.crud.insertBlocks(targetCell.id, 0, nextChildren)
        }
      }
    })

    requestAnimationFrame(() => {
      this._restoreCursorInCell(table, start)
    })
  }

  private _restoreCursorInCell(table: BlockCraft.IBlockComponents['table'], coordinate: number[]) {
    try {
      const targetCell = table.getCellByCoordinate(coordinate[0], coordinate[1])
      ;(table as unknown as {_clearSelectionUiState: () => void})._clearSelectionUiState()
      this.doc.selection.setCursorAtBlock(targetCell, false, false)
      this.doc.selection.recalculate()
    } catch (e) {
      this.doc.logger.warn('restoreTablePasteCursor error', e)
      this.doc.selection.recalculate()
    }
  }

  private _handleCopyOrCut(context: UIEventStateContext, isCut: boolean): boolean {
    const selection = this.doc.selection.value
    if (!selection || !selection.firstBlock.flavour.startsWith('table')) return false
    context.preventDefault()
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
    if (!selection || selection.firstBlock.flavour !== 'table-cell') return false

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
    if (!selection.isAllSelected || selection.firstBlock.flavour !== 'table-cell') return
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
    if (!selection.isAllSelected || selection.firstBlock.flavour !== 'table-cell') return false
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

function looksLikeMarkdownTable(text: string) {
  return /(^|\n)\s*\|.+\|\s*\n\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*(\n|$)/.test(text.trim())
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

export function findFirstTableSnapshot(snapshot: IBlockSnapshot): IBlockSnapshot | null {
  if (snapshot.flavour === 'table') return snapshot
  const children = Array.isArray(snapshot.children) ? snapshot.children : []
  for (const child of children) {
    if (!child || typeof child !== 'object' || !('flavour' in child)) continue
    const table = findFirstTableSnapshot(child as IBlockSnapshot)
    if (table) return table
  }
  return null
}

type PastedTableCellGrid = Array<Array<IBlockSnapshot | null>>

function getPastedTableCellGrid(tableSnapshot: IBlockSnapshot): PastedTableCellGrid {
  if (tableSnapshot.flavour !== 'table') return []
  const rows = (tableSnapshot.children || []) as IBlockSnapshot[]
  return rows
    .filter(row => row.flavour === 'table-row')
    .map(row => ((row.children || []) as IBlockSnapshot[])
      .filter(cell => cell.flavour === 'table-cell')
      .map(cell => cell.props['display'] === 'none' ? null : cell))
    .filter(row => row.length > 0)
}

export function getPastedTableCellRows(tableSnapshot: IBlockSnapshot): IBlockSnapshot[][] {
  if (tableSnapshot.flavour !== 'table') return []
  const rows = (tableSnapshot.children || []) as IBlockSnapshot[]
  return rows
    .filter(row => row.flavour === 'table-row')
    .map(row => ((row.children || []) as IBlockSnapshot[])
      .filter(cell => cell.flavour === 'table-cell' && cell.props['display'] !== 'none'))
    .filter(row => row.length > 0)
}
