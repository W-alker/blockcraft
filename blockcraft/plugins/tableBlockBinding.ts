import {BindHotKey, DocPlugin, EventListen, IBlockSnapshot} from "../framework";
import {UIEventStateContext} from "../framework";
import {BlockCraftError, ErrorCode} from "../global";
import {ClipboardDataType} from "../framework/modules/clipboard";
import {TableCellBlockComponent} from "../blocks/table-block/table-cell.block";
import {replaceSnapshotsIdDeeply} from "../framework/utils";

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
  async handlePaste(context: UIEventStateContext) {
    if (this.doc.isReadonly) return false
    const state = context.get('clipboardState')
    const {selection} = state
    if (!selection || selection.kind !== 'table') return false

    const table = this._getTable(selection)
    const coordinates = table.getSelectedCoordinates()
    if (!coordinates) return false

    context.preventDefault()

    if (state.dataTypes.includes(ClipboardDataType.HTML)) {
      const htmlString = state.getData(ClipboardDataType.HTML)
      const htmlAdapter = this.doc.clipboard.adapter?.getAdapter(ClipboardDataType.HTML)
      if (htmlAdapter && htmlString) {
        try {
          const rootSnapshot = await htmlAdapter.toSnapshot(htmlString)
          const snapshotMatrix = rootSnapshot ? this._extractTableCellSnapshots(rootSnapshot) : null
          if (snapshotMatrix?.length) {
            const lastFocusedBlockId = this._applyCellSnapshotMatrix(
              table.getCellsMatrixByCoordinates(coordinates.start, coordinates.end),
              snapshotMatrix
            )
            if (lastFocusedBlockId) {
              this.doc.selection.setCursorAtBlock(lastFocusedBlockId, false)
            }
            return true
          }
        } catch (e) {
          this.doc.logger.warn('table html paste error', e)
        }
      }
    }

    const text = state.getData(ClipboardDataType.TEXT)
    if (!text) return false

    const rows = text.replace(/\r\n/g, '\n').replace(/\n$/g, '').split('\n').map(row => row.split('\t'))
    const matrix = table.getCellsMatrixByCoordinates(coordinates.start, coordinates.end)
    let lastParagraphId: string | null = null

    matrix.forEach((cells, rowIndex) => {
      const rowData = rows[rowIndex]
      if (!rowData) return
      cells.forEach((cell, colIndex) => {
        const value = rowData[colIndex]
        if (value === undefined) return
        lastParagraphId = this._replaceCellContent(cell, value)
      })
    })

    if (lastParagraphId) {
      this.doc.selection.setCursorAtBlock(lastParagraphId, false)
    }

    return true
  }

  private _handleCopyOrCut(context: UIEventStateContext, isCut: boolean): boolean {
    const selection = this.doc.selection.value
    if (!selection || selection.kind !== 'table') return false
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
    if (!selection || selection.kind !== 'table') return false

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
    if (selection.kind !== 'table' || !selection.isAllSelected) return
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
    if (selection.kind !== 'table' || !selection.isAllSelected) return false
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

  private _replaceCellContent(cell: TableCellBlockComponent, text: string) {
    const paragraph = this.doc.schemas.createSnapshot('paragraph', [text ? [{insert: text}] : []])
    const firstChild = cell.firstChildren
    if (!firstChild) {
      this.doc.crud.insertBlocks(cell.id, 0, [paragraph])
      return paragraph.id
    }

    this.doc.crud.replaceWithSnapshots(firstChild.id, [paragraph])
    if (cell.childrenLength > 1) {
      this.doc.crud.deleteBlocks(cell.id, 1, cell.childrenLength - 1)
    }
    return paragraph.id
  }

  private _replaceCellSnapshots(cell: TableCellBlockComponent, snapshots: IBlockSnapshot[]) {
    const clonedSnapshots = JSON.parse(JSON.stringify(
      snapshots.length ? snapshots : [this.doc.schemas.createSnapshot('paragraph', [])]
    )) as IBlockSnapshot[]
    replaceSnapshotsIdDeeply(clonedSnapshots)

    const firstChild = cell.firstChildren
    if (!firstChild) {
      this.doc.crud.insertBlocks(cell.id, 0, clonedSnapshots)
      return clonedSnapshots[clonedSnapshots.length - 1].id
    }

    this.doc.crud.replaceWithSnapshots(firstChild.id, clonedSnapshots)
    if (cell.childrenLength > clonedSnapshots.length) {
      this.doc.crud.deleteBlocks(cell.id, clonedSnapshots.length, cell.childrenLength - clonedSnapshots.length)
    }
    return clonedSnapshots[clonedSnapshots.length - 1].id
  }

  private _extractTableCellSnapshots(rootSnapshot: IBlockSnapshot) {
    const tableSnapshot = (() => {
      if (rootSnapshot.flavour === 'table') return rootSnapshot
      if (rootSnapshot.nodeType !== 'root') return null
      return (rootSnapshot.children as IBlockSnapshot[]).find(child => child.flavour === 'table') || null
    })()

    if (!tableSnapshot || tableSnapshot.flavour !== 'table') return null

    return (tableSnapshot.children as IBlockSnapshot[])
      .filter(row => row.flavour === 'table-row')
      .map(row => (row.children as IBlockSnapshot[])
        .filter(cell => cell.flavour === 'table-cell')
        .map(cell => cell.children as IBlockSnapshot[]))
  }

  private _applyCellSnapshotMatrix(
    targetMatrix: BlockCraft.IBlockComponents['table-cell'][][],
    snapshotMatrix: IBlockSnapshot[][][]
  ) {
    let lastFocusedBlockId: string | null = null
    targetMatrix.forEach((cells, rowIndex) => {
      const rowSnapshots = snapshotMatrix[rowIndex]
      if (!rowSnapshots) return
      cells.forEach((cell, colIndex) => {
        const snapshots = rowSnapshots[colIndex]
        if (!snapshots) return
        lastFocusedBlockId = this._replaceCellSnapshots(cell, snapshots)
      })
    })
    return lastFocusedBlockId
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
