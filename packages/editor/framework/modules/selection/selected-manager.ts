import {BaseBlockComponent, BlockNodeType, EditableBlockComponent} from "../../block-std";

export class SelectionSelectedManager {

  constructor(private doc: BlockCraft.Doc) {
  }

  private _selectedSet = new Set<BaseBlockComponent<any>>()
  private _focusedSet = new Set<EditableBlockComponent<any>>()

  private _setSelectedClass(block: BaseBlockComponent<any>) {
    block.hostElement.classList.add('selected')
    // `contenteditable=false` is only safe on `void` blocks (image, divider, ...)
    // where it locks down a leaf that has no editable descendants — the gap-zero
    // spans (`createBlockGapSpace`) re-open `contenteditable=true` so the native
    // Range cursor can still anchor and `keydown` / `beforeinput` keep firing.
    //
    // Container blocks (`nodeType === 'block'`: callout / columns / column /
    // table / table-cell / frame) MUST NOT receive `contenteditable=false`,
    // because the attribute is inherited and would silently freeze the entire
    // descendant subtree. If the cleanup path (`_clearAllClass` via the next
    // `setSelected`) is skipped — e.g. a resize / drag-out / mouseup lands
    // outside root and no `selectionchange` fires — the container stays
    // contenteditable=false and the whole document becomes uneditable.
    // if (block.nodeType === BlockNodeType.void) {
    //   block.hostElement.setAttribute('contenteditable', 'false')
    // }
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
      // Symmetric with `_setSelectedClass`: only void blocks ever receive
      // `contenteditable=false` here, so only void blocks should have it
      // cleared. Calling `removeAttribute('contenteditable')` on a container
      // is a no-op, but on `root` it would strip the `contenteditable="true"`
      // installed by `RootBlockComponent` and freeze the entire editor.
      // if (v.nodeType === BlockNodeType.void) {
      //   v.hostElement.removeAttribute('contenteditable')
      // }
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

    // Gap cursor: collapsed selection on a gap point. The native range sits in
    // the `<br>` filler span (`createBlockGapSpace`) and the BROWSER paints the
    // real native caret on that line — no extra fake-bar rendering needed here.
    if (selection.collapsed && selection.start.type === 'gap') {
      return
    }

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
