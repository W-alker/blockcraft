import {BaseBlockComponent, BindHotKey, DocPlugin, EventListen, EventNames, ORIGIN_SKIP_SYNC} from "../framework";
import {UIEventStateContext} from "../framework/event/base";
import {TableBlockComponent} from "../blocks/table-block/table.block";
import {BlockCraftError, ErrorCode} from "../global";
import {performanceTest} from "../framework/decorators";

export class TableBlockBinding extends DocPlugin {

  private _getTable(selection: BlockCraft.Selection) {
    const tableId = selection.firstBlock.hostElement.closest('.table-block')?.getAttribute('data-block-id')
    if (!tableId) {
      throw new BlockCraftError(ErrorCode.EventDispatcherError, `Cannot find table block for selection: ${selection}`)
    }
    return this.doc.getBlockById(tableId) as TableBlockComponent
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
    const state = context.get('keyboardState')
    const {raw: evt, selection} = state
    if (!selection.isAllSelected) return

    evt.preventDefault()
    const table = this._getTable(selection)
    // 是否有选择块
    if (table.selectedCellSet.size) {
      this.clearCellContent(Array.from(table.selectedCellSet))
      return true
    }

    const block = this.doc.getBlockById(selection.commonParent)
    if (block.flavour === 'table-cell') {
      this.clearCellContent([block])
      return true
    }

    const {firstBlock, lastBlock} = selection

    if (block.flavour === 'table-row') {
      const childrenIds = block.childrenIds
      const start = childrenIds.indexOf(firstBlock.id)
      const end = childrenIds.indexOf(lastBlock.id)
      this.clearCellContent(childrenIds.slice(start, end + 1).map(id => this.doc.getBlockById(id) as BaseBlockComponent))
      return true
    }

    if (block.flavour === 'table') {
      const childrenIds = block.childrenIds
      const start = childrenIds.indexOf(firstBlock.id)
      const end = childrenIds.indexOf(lastBlock.id)
      // 删除行
      this.doc.crud.deleteBlocks(block.id, start, end + 1 - start)
    }

    return true
  }

  clearCellContent(cells: BlockCraft.BlockComponent[]) {
    this.doc.crud.transact(() => {
      cells.forEach(cell => {
        if (!cell.textContent()) return
        const np = this.doc.schemas.createSnapshot('paragraph', [])
        this.doc.crud.deleteBlocks(cell.id, 0, cell.childrenLength)
        this.doc.crud.insertBlocks(cell.id, 0, [np])
      })
    }, ORIGIN_SKIP_SYNC)
  }

  // @EventListen(EventNames.contextMenu, {flavour: 'table'})
  // handleContextMenu(context: UIEventStateContext) {
  //   const evt = context.get('defaultState').event as PointerEvent
  //   console.log('handleContextMenu', evt)
  //
  //   const selection = this.doc.selection.value!
  //   const table = this._getTable(selection)
  //   if (!table.selectedCellSet.size) return
  // }

}
