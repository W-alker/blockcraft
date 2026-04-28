import {BaseBlockComponent, BlockNodeType, EditableBlockComponent} from "../../block-std";

export class SelectionSelectedManager {

  constructor(private doc: BlockCraft.Doc) {
  }

  private _selectedSet = new Set<BaseBlockComponent<any>>()
  private _focusedSet = new Set<EditableBlockComponent<any>>()

  private _setSelectedClass(block: BaseBlockComponent<any>) {
    block.hostElement.classList.add('selected')
    // Switch the block to non-editable at the DOM level. Together with the
    // explicit `contenteditable=true` on gap-zero spaces (`createBlockGapSpace`),
    // this prevents stray text edits while still allowing the native Range
    // cursor to anchor on the gap span — which keeps `keydown` bubbling and
    // `beforeinput` firing for Backspace/Delete/printable replacements.
    block.hostElement.setAttribute('contenteditable', 'false')
    this._selectedSet.add(block)
  }

  private _setFocusedClass(block: EditableBlockComponent<any>) {
    block.hostElement.classList.add('focused')
    this._focusedSet.add(block)
  }

  private _setClass(block: BaseBlockComponent<any>) {
    block.nodeType === BlockNodeType.editable ? this._setFocusedClass(block as any) : this._setSelectedClass(block)
  }

  private _clearAllClass() {
    this._selectedSet.forEach(v => {
      v.hostElement.classList.remove('selected')
      v.hostElement.removeAttribute('contenteditable')
    })
    this._focusedSet.forEach(v => {
      v.hostElement.classList.remove('focused')
    })
    this._selectedSet.clear()
    this._focusedSet.clear()
  }

  setSelected(selection: BlockCraft.Selection | null) {
    this._clearAllClass()
    if (!selection) return;

    const {isAllSelected, isInSameBlock} = selection

    isAllSelected ? this.doc.root.hostElement.classList.add('all-selected') : this.doc.root.hostElement.classList.remove('all-selected')

    if (isInSameBlock) {
      this._setClass(selection.firstBlock)
      return;
    }

    // Cross-block: mark start, end, and all between
    this._setClass(selection.firstBlock)
    this._setClass(selection.lastBlock)
    const between = this.doc.queryBlocksBetween(selection.firstBlock, selection.lastBlock, false)
    if (!between?.length) return
    between.forEach(v => {
      const b = this.doc.getBlockById(v)
      this._setClass(<any>b)
    })
  }
}
