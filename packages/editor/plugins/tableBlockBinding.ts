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
import {parseClipboardSnapshot, parseClipboardSnapshotFromHtml} from "../framework/modules/clipboard/internal-clipboard";
import {
  cloneSnapshot,
  createTableSnapshotFromMatrix,
  getMarkdownClipboardText,
  parseTabularText
} from "../framework/modules/clipboard/paste-utils";

export class TableBlockBinding extends DocPlugin {
  override name = 'table-block-binding'

  private _isTableProtected(table: BlockCraft.IBlockComponents['table']): boolean {
    const manager = this.doc.readonlyManager
    return !!manager && (manager.isReadonly(table) || manager.containsReadonly(table))
  }

  private _getLiveTableFromSelection(selection: BlockCraft.Selection): BlockCraft.IBlockComponents['table'] | null {
    try {
      const firstBlock = this._getSafeSelectionFirstBlock(selection)
      const tableId = firstBlock?.hostElement
        ?.closest('.table-block[data-block-id]')
        ?.getAttribute('data-block-id')
      if (!tableId) return null
      const table = this._getLiveBlockById<BlockCraft.IBlockComponents['table']>(tableId)
      return table?.flavour === 'table' ? table : null
    } catch {
      return null
    }
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

    const table = this._getLiveTableFromSelection(selection)
    if (!table) return false
    if (this._isTableProtected(table)) {
      context.preventDefault()
      return true
    }

    if (!this._hasPastedTableData(state)) return false

    const startCoordinate = this._getPasteStartCoordinate(table, selection)
    if (!startCoordinate) return false

    context.preventDefault()
    void this._parsePastedTableSnapshot(state).then(tableSnapshot => {
      if (!tableSnapshot) return
      const liveTable = this._resolveParsedTablePasteTarget(table, selection, startCoordinate)
      if (!liveTable) return
      if (this._isTableProtected(liveTable)) return
      this._fillTableFromSnapshot(liveTable, tableSnapshot, startCoordinate)
    })
    return true
  }

  private _getLiveBlockById<T extends BlockCraft.BlockComponent = BlockCraft.BlockComponent>(id: string): T | null {
    try {
      return (this.doc.getBlockById(id) as T | null) ?? null
    } catch {
      return null
    }
  }

  private _getSafeSelectionFirstBlock(selection: BlockCraft.Selection | null | undefined): BlockCraft.BlockComponent | null {
    if (!selection) return null
    try {
      return selection.firstBlock ?? null
    } catch {
      return null
    }
  }

  private _isLiveTableCell(block: unknown): block is BlockCraft.IBlockComponents['table-cell'] {
    return !!block
      && (block as BlockCraft.BlockComponent).flavour === 'table-cell'
      && typeof (block as BlockCraft.IBlockComponents['table-cell']).getIndexOfParent === 'function'
  }

  private _resolveParsedTablePasteTarget(
    table: BlockCraft.IBlockComponents['table'],
    selection: BlockCraft.Selection,
    startCoordinate: number[],
  ): BlockCraft.IBlockComponents['table'] | null {
    const liveTable = this._getLiveBlockById<BlockCraft.IBlockComponents['table']>(table.id)
    if (!liveTable || liveTable.flavour !== 'table') {
      this.doc.logger.warn('table paste target selection is stale, abort')
      return null
    }

    const tableCellSelection = typeof selection.getTableCellSelection === 'function'
      ? selection.getTableCellSelection()
      : null
    if (tableCellSelection) {
      if (tableCellSelection.tableId !== liveTable.id || !this._getTableCellSelectionCoordinates(liveTable, selection)) {
        this.doc.logger.warn('table paste target selection is stale, abort')
        return null
      }
    } else {
      try {
        const firstBlock = this._getSafeSelectionFirstBlock(selection)
        if (!firstBlock || (firstBlock.id && !this._getLiveBlockById(firstBlock.id))) {
          this.doc.logger.warn('table paste target selection is stale, abort')
          return null
        }
      } catch {
        this.doc.logger.warn('table paste target selection is stale, abort')
        return null
      }
    }

    const targetCell = liveTable.getCellByCoordinate(startCoordinate[0], startCoordinate[1])
    if (!targetCell || !this._getLiveBlockById(targetCell.id)) {
      this.doc.logger.warn('table paste target cell is stale, abort')
      return null
    }

    return liveTable
  }

  private _getPasteStartCoordinate(table: BlockCraft.IBlockComponents['table'], selection: BlockCraft.Selection) {
    const tableCellCoordinates = this._getTableCellSelectionCoordinates(table, selection)
    if (tableCellCoordinates) return tableCellCoordinates.start
    if (this._hasTableCellSelection(selection)) return null

    const coordinates = table.getSelectedCoordinates()
    if (coordinates) return coordinates.start
    const firstBlock = this._getSafeSelectionFirstBlock(selection)
    if (!firstBlock) return null
    if (firstBlock.id && !this._getLiveBlockById(firstBlock.id)) return null

    const cellId = firstBlock.hostElement
      .closest('td[data-block-id]')
      ?.getAttribute('data-block-id')
    if (!cellId) return null

    const cell = this._getLiveBlockById<BlockCraft.IBlockComponents['table-cell']>(cellId)
    if (!this._isLiveTableCell(cell)) return null

    const rowIndex = table.childrenIds.indexOf(cell.parentId!)
    const colIndex = cell.getIndexOfParent()
    if (rowIndex < 0 || colIndex < 0) return null

    return [rowIndex, colIndex]
  }

  private _getTableCellSelectionEndpoints(
    table: BlockCraft.IBlockComponents['table'],
    selection: BlockCraft.Selection,
  ) {
    const tableCellSelection = typeof selection.getTableCellSelection === 'function'
      ? selection.getTableCellSelection()
      : null
    if (!tableCellSelection || tableCellSelection.tableId !== table.id) return null

    let anchorCell: BlockCraft.IBlockComponents['table-cell'] | null
    let headCell: BlockCraft.IBlockComponents['table-cell'] | null
    try {
      anchorCell = this._getLiveBlockById<BlockCraft.IBlockComponents['table-cell']>(tableCellSelection.anchorCellId)
      headCell = this._getLiveBlockById<BlockCraft.IBlockComponents['table-cell']>(tableCellSelection.headCellId)
    } catch {
      return null
    }
    if (!this._isLiveTableCell(anchorCell) || !this._isLiveTableCell(headCell)) return null

    let anchor: {rowIdx: number; colIdx: number}
    let head: {rowIdx: number; colIdx: number}
    try {
      anchor = {
        rowIdx: table.childrenIds.indexOf(anchorCell.parentId!),
        colIdx: anchorCell.getIndexOfParent(),
      }
      head = {
        rowIdx: table.childrenIds.indexOf(headCell.parentId!),
        colIdx: headCell.getIndexOfParent(),
      }
    } catch {
      return null
    }
    if (anchor.rowIdx < 0 || anchor.colIdx < 0 || head.rowIdx < 0 || head.colIdx < 0) return null

    return {anchorCell, headCell, anchor, head}
  }

  private _getTableCellSelectionCoordinates(
    table: BlockCraft.IBlockComponents['table'],
    selection: BlockCraft.Selection,
  ) {
    const endpoints = this._getTableCellSelectionEndpoints(table, selection)
    if (!endpoints) return null

    return table.confirmSelection(
      [Math.min(endpoints.anchor.rowIdx, endpoints.head.rowIdx), Math.min(endpoints.anchor.colIdx, endpoints.head.colIdx)],
      [Math.max(endpoints.anchor.rowIdx, endpoints.head.rowIdx), Math.max(endpoints.anchor.colIdx, endpoints.head.colIdx)],
    )
  }

  private _hasTableCellSelection(selection: BlockCraft.Selection | null | undefined): boolean {
    return !!selection && typeof selection.getTableCellSelection === 'function' && !!selection.getTableCellSelection()
  }

  private _findNextVisibleCell(
    table: BlockCraft.IBlockComponents['table'],
    rowIdx: number,
    colIdx: number,
    rowDelta: number,
    colDelta: number,
  ): BlockCraft.IBlockComponents['table-cell'] | null {
    let nextRow = rowIdx + rowDelta
    let nextCol = colIdx + colDelta
    while (
      nextRow >= 0 &&
      nextRow < table.rowLength &&
      nextCol >= 0 &&
      nextCol < table.colLength
    ) {
      const cell = table.getCellByCoordinate(nextRow, nextCol)
      if (cell && cell.props?.display !== 'none') return cell
      nextRow += rowDelta
      nextCol += colDelta
    }
    return null
  }

  private _findNextTabCell(
    table: BlockCraft.IBlockComponents['table'],
    rowIdx: number,
    colIdx: number,
    backward: boolean,
  ): BlockCraft.IBlockComponents['table-cell'] | null {
    let nextRow = rowIdx
    let nextCol = colIdx
    while (true) {
      if (backward) {
        nextCol--
        if (nextCol < 0) {
          nextRow--
          nextCol = table.colLength - 1
        }
      } else {
        nextCol++
        if (nextCol >= table.colLength) {
          nextRow++
          nextCol = 0
        }
      }
      if (nextRow < 0 || nextRow >= table.rowLength) return null
      const cell = table.getCellByCoordinate(nextRow, nextCol)
      if (cell && cell.props?.display !== 'none') return cell
    }
  }

  private _moveTableCellSelection(
    table: BlockCraft.IBlockComponents['table'],
    selection: BlockCraft.Selection,
    key: string,
    extend: boolean,
  ): boolean {
    const endpoints = this._getTableCellSelectionEndpoints(table, selection)
    if (!endpoints) return false

    const direction = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    }[key] as [number, number] | undefined
    if (!direction) return false

    const nextCell = this._findNextVisibleCell(
      table,
      endpoints.head.rowIdx,
      endpoints.head.colIdx,
      direction[0],
      direction[1],
    )
    if (!nextCell) return true

    this.doc.selection.setTableCellSelection(
      table,
      extend ? endpoints.anchorCell : nextCell,
      nextCell,
      true,
    )
    return true
  }

  private _moveTableCellSelectionByTab(
    table: BlockCraft.IBlockComponents['table'],
    selection: BlockCraft.Selection,
    backward: boolean,
  ): boolean {
    const endpoints = this._getTableCellSelectionEndpoints(table, selection)
    if (!endpoints) return false

    const nextCell = this._findNextTabCell(
      table,
      endpoints.head.rowIdx,
      endpoints.head.colIdx,
      backward,
    )
    if (!nextCell) return true

    this.doc.selection.setTableCellSelection(
      table,
      nextCell,
      nextCell,
      true,
    )
    return true
  }

  private _restoreCursorAtTableCellAnchor(selection: BlockCraft.Selection): boolean {
    const table = this._getLiveTableFromSelection(selection)
    if (!table) return false
    const endpoints = this._getTableCellSelectionEndpoints(table, selection)
    if (!endpoints) return false
    this.doc.selection.setCursorAtBlock(endpoints.anchorCell, false, false)
    return true
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
        if (!targetRow) continue

        for (let colOffset = 0; colOffset < sourceCells.length; colOffset++) {
          const sourceCell = sourceCells[colOffset]
          const targetCellId = targetRow.childrenIds[start[1] + colOffset]
          if (!targetCellId) break
          if (!sourceCell) continue

          const targetCell = this._getLiveBlockById<BlockCraft.IBlockComponents['table-cell']>(targetCellId)
          if (!this._isLiveTableCell(targetCell)) continue
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
      const liveTable = this._getLiveBlockById<BlockCraft.IBlockComponents['table']>(table.id)
      if (!liveTable || liveTable.flavour !== 'table') return
      const targetCell = liveTable.getCellByCoordinate(coordinate[0], coordinate[1])
      if (!targetCell || !this._getLiveBlockById(targetCell.id)) return
      this.doc.selection.setCursorAtBlock(targetCell, false, false)
    } catch (e) {
      this.doc.logger.warn('restoreTablePasteCursor error', e)
    }
  }

  private _handleCopyOrCut(context: UIEventStateContext, isCut: boolean): boolean {
    const selection = this.doc.selection.value
    const firstBlock = this._getSafeSelectionFirstBlock(selection)
    if (!selection || !firstBlock || !firstBlock.flavour.startsWith('table')) return false
    if (selection.isAllSelected && firstBlock.flavour === 'table') return false

    const table = this._getLiveTableFromSelection(selection)
    if (!table) return false
    if (isCut && this._isTableProtected(table)) {
      context.preventDefault()
      return true
    }

    const tableCellCoordinates = this._getTableCellSelectionCoordinates(table, selection)
    if (this._hasTableCellSelection(selection) && !tableCellCoordinates) return false

    const coordinates = tableCellCoordinates || table.getSelectedCoordinates()
    if (!coordinates) return false

    context.preventDefault()
    const {start, end} = coordinates
    const matrix = table.getCellsMatrixByCoordinates(start, end)
    const tableSnapshot = this._createTableSnapshot(table, matrix, start, end)
    const legalSnapshot = legalizeTableModels(tableSnapshot, () => this.doc.schemas.createSnapshot('paragraph', []))

    void this.doc.clipboard.copyBlocksModel([legalSnapshot]).then(() => {
      this.doc.messageService.success('已复制')
      if (isCut && !this._isTableProtected(table)) {
        this.clearCellContent(matrix.flat())
      }
    }).catch(e => {
      this.doc.logger.warn(isCut ? 'table cut failed' : 'table copy failed', e)
    })

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

  @BindHotKey({
    key: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
    shiftKey: null,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
  }, {flavour: 'table-cell'})
  handleArrow(context: UIEventStateContext) {
    const state = context.get('keyboardState')
    const {raw: evt, selection} = state
    const firstBlock = this._getSafeSelectionFirstBlock(selection)
    if (!this._hasTableCellSelection(selection) || firstBlock?.flavour !== 'table-cell') return false

    const table = this._getLiveTableFromSelection(selection)
    if (!table) return false
    if (!this._getTableCellSelectionEndpoints(table, selection)) return false
    context.preventDefault()
    if (this._moveTableCellSelection(table, selection, evt.key, evt.shiftKey)) return true
    return true
  }

  @BindHotKey({
    key: 'Tab',
    shiftKey: null,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
  }, {flavour: 'table-cell'})
  handleTab(context: UIEventStateContext) {
    const state = context.get('keyboardState')
    const {raw: evt, selection} = state
    const firstBlock = this._getSafeSelectionFirstBlock(selection)
    if (!this._hasTableCellSelection(selection) || firstBlock?.flavour !== 'table-cell') return false

    const table = this._getLiveTableFromSelection(selection)
    if (!table) return false
    if (!this._getTableCellSelectionEndpoints(table, selection)) return false
    context.preventDefault()
    this._moveTableCellSelectionByTab(table, selection, !!evt.shiftKey)
    return true
  }

  @BindHotKey({key: ['Delete', 'Backspace'], shiftKey: null}, {flavour: 'table'})
  handleDelete(context: UIEventStateContext) {
    if (this.doc.isReadonly) return
    const state = context.get('keyboardState')
    const {raw: evt, selection} = state
    if (!selection) return false
    const firstBlock = this._getSafeSelectionFirstBlock(selection)
    if (!firstBlock) return false
    if (selection.isAllSelected && firstBlock.flavour === 'table') return false

    const table = this._getLiveTableFromSelection(selection)
    if (!table) return false
    if (this._isTableProtected(table)) {
      evt.preventDefault()
      return true
    }

    const tableCellCoordinates = this._getTableCellSelectionCoordinates(table, selection)
    if (this._hasTableCellSelection(selection) && !tableCellCoordinates) return false

    const explicitCoordinates = tableCellCoordinates || table.getExplicitSelectedCoordinates()
    const coordinates = explicitCoordinates || (
      selection.isAllSelected && firstBlock.flavour === 'table-cell'
        ? table.getSelectedCoordinates()
        : null
    )
    if (!coordinates) {
      return false
    }

    evt.preventDefault()
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
    if (!selection) return false
    const firstBlock = this._getSafeSelectionFirstBlock(selection)
    if (!firstBlock) return false
    if (!this._hasTableCellSelection(selection) && !(selection.isAllSelected && firstBlock.flavour === 'table-cell')) return false
    const table = this._getLiveTableFromSelection(selection)
    if (!table) return false
    if (this._hasTableCellSelection(selection) && !this._getTableCellSelectionEndpoints(table, selection)) return false
    evt.preventDefault()
    this.doc.selection.selectBlock(table)
    return true
  }

  @BindHotKey({key: 'Escape'}, {flavour: 'table-cell'})
  handleEscape(context: UIEventStateContext) {
    const state = context.get('keyboardState')
    const {selection} = state
    const firstBlock = this._getSafeSelectionFirstBlock(selection)
    if (!this._hasTableCellSelection(selection) || firstBlock?.flavour !== 'table-cell') return false
    const restored = this._restoreCursorAtTableCellAnchor(selection)
    if (!restored) return false
    context.preventDefault()
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
