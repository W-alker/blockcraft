import {BindHotKey, DocPlugin, EventListen, ORIGIN_SKIP_SYNC} from "../framework";
import {UIEventStateContext} from "../framework";
import {BlockCraftError, ErrorCode} from "../global";

export class TableBlockBinding extends DocPlugin {

  private _getTable(selection: BlockCraft.Selection) {
    const tableId = selection.firstBlock.hostElement.closest('.table-block')?.getAttribute('data-block-id')
    if (!tableId) {
      throw new BlockCraftError(ErrorCode.EventDispatcherError, `Cannot find table block for selection: ${selection}`)
    }
    return this.doc.getBlockById(tableId) as BlockCraft.IBlockComponents['table']
  }

  @EventListen('copy', {flavour: 'table'})
  handleCopy(context: UIEventStateContext) {
    const selection = this.doc.selection.value!
    const table = this._getTable(selection)
    const coordinates = table.getSelectedCellsCoordinates()
    if(!coordinates) return
    const {start, end} = coordinates
    const matrix = table.getMatrixByCoordinates(start, end)
    const tableSnapshot = table.toSnapshot(false)
    tableSnapshot.children = Array.from(matrix).map(cells => {
      const row = this.doc.schemas.createSnapshot('table-row', [0])
      row.children = cells.map(cell => cell.toSnapshot())
      return row
    })
    tableSnapshot.props['colWidths'] = table.props['colWidths'].slice(start[1], end[1] + 1)
    this.doc.clipboard.copyBlocksModel([tableSnapshot])
  }

  @BindHotKey({key: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'], shiftKey: null}, {flavour: 'table'})
  handleArrow(context: UIEventStateContext) {
    const state = context.get('keyboardState')
    const {raw: evt, selection} = state
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
    if (!selection.isAllSelected) return
    if (selection.from.block.flavour === 'table') return false
    const table = this._getTable(selection)
    evt.preventDefault()
    const selectedCells = table.getSelectedCells()
    this.clearCellContent(selectedCells)
    return true
  }

  clearCellContent(cells: BlockCraft.IBlockComponents['table-cell'][]) {
    // this.doc.crud.transact(() => {
      cells.forEach(cell => {
        cell.clearContent()
      })
    // }, ORIGIN_SKIP_SYNC)
  }

  destroy(): void {
  }

  init(): void {
  }

}
