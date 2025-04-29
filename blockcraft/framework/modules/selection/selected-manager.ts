import {BaseBlockComponent, BlockNodeType, EditableBlockComponent} from "../../block-std";

export class SelectionSelectedManager {

  constructor(private doc: BlockCraft.Doc) {
  }

  private _selectedSet = new Set<BaseBlockComponent<any>>()
  private _focusedSet = new Set<EditableBlockComponent<any>>()

  private _setSelectedClass(block: BaseBlockComponent<any>) {
    block.hostElement.classList.add('selected')
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

    const {from, to, isAllSelected} = selection

    // 控制不可输入
    isAllSelected ? this.doc.root.hostElement.classList.add('all-selected') : this.doc.root.hostElement.classList.remove('all-selected')

    this._setClass(from.block)

    if (!to) return;
    this._setClass(to.block)

    // const between = this.doc.queryBlocksThroughPathDeeply(from.block, to.block)
    // if (!between?.length) return
    // between.forEach(through => {
    //   through.group.forEach(v => {
    //     const b = this.doc.getBlockById(v)
    //     if (b.nodeType !== BlockNodeType.editable) {
    //       this._setSelectedClass(b as any)
    //     }
    //   })
    // })
    const between = this.doc.queryBlocksBetween(from.block, to.block)
    if (!between?.length) return
    between.forEach(v => {
      const b = this.doc.getBlockById(v)
      this._setClass(<any>b)
    })
  }
}
