import {BindHotKey, DocPlugin, EventListen, ORIGIN_SKIP_SYNC} from "../framework";
import {UIEventStateContext} from "../framework";
import {BlockCraftError, ErrorCode} from "../global";

export class TableBlockBinding extends DocPlugin {

  // TODO 可以直接block tree向上查找
  private _getTable(selection: BlockCraft.Selection) {
    const tableId = selection.firstBlock.hostElement.closest('.table-block')?.getAttribute('data-block-id')
    if (!tableId) {
      throw new BlockCraftError(ErrorCode.EventDispatcherError, `Cannot find table block for selection: ${selection}`)
    }
    return this.doc.getBlockById(tableId) as BlockCraft.IBlockComponents['table']
  }

  @EventListen('copy', { flavour: 'table' })
  handleCopy(context: UIEventStateContext) {
    return this._handleCopyOrCut(false)
  }

  @EventListen('cut', { flavour: 'table' })
  handleCut(context: UIEventStateContext) {
    if(this.doc.isReadonly) return
    return this._handleCopyOrCut(true)
  }

  private _handleCopyOrCut(isCut: boolean): boolean {
    const selection = this.doc.selection.value
    if (!selection || !selection.from.block.flavour.startsWith('table')) return false

    const table = this._getTable(selection)
    const coordinates = table.getSelectedCellsCoordinates()
    if (!coordinates) return false

    const { start, end } = coordinates
    const matrix = table.getMatrixByCoordinates(start, end)
    const tableSnapshot = this._createTableSnapshot(table, matrix, start, end)

    const copyResult = this.doc.clipboard.copyBlocksModel([tableSnapshot]).then(() => {
      this.doc.messageService.success('复制成功')
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
    if (!selection || !selection.from.block.flavour.startsWith('table-cell')) return false

    const block = this._getTable(selection)
    // 是否有选择块
    if (!block.selectedCellSet.size) return
    if (state.raw.shiftKey) {
      evt.preventDefault()
      return true
    }
    return
  }

  @BindHotKey({key: ['Delete', 'Backspace'], shiftKey: null}, {flavour: 'table'})
  handleDelete(context: UIEventStateContext) {
    if (this.doc.isReadonly) return
    const state = context.get('keyboardState')
    const {raw: evt, selection} = state
    if (!selection.isAllSelected || !selection.from.block.flavour.startsWith('table')) return
    const table = this._getTable(selection)
    evt.preventDefault()
    const selectedCells = table.getSelectedCells()
    this.clearCellContent(selectedCells)
    return true
  }

  @BindHotKey({key: ['A', 'a'], ctrlKey: null}, {flavour: 'table-cell'})
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
