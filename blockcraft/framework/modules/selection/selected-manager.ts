import {BaseBlockComponent, BlockNodeType} from "../../block-std";

export class SelectionSelectedManager {

  constructor(private doc: BlockCraft.Doc) {
  }

  private _selectedSet = new Set<BaseBlockComponent<any>>()

  private _setSelectedClass(block: BaseBlockComponent<any>) {
    block.hostElement.classList.add('selected')
    this._selectedSet.add(block)
  }

  private _clearAllSelected() {
    this._selectedSet.forEach(v => {
      v.hostElement.classList.remove('selected')
    })
    this._selectedSet.clear()
  }

  setSelected(selection: BlockCraft.Selection | null) {
    this._clearAllSelected()
    if (!selection) return;

    const {from, to, isAllSelected} = selection

    // 控制不可输入
    isAllSelected ? this.doc.root.hostElement.classList.add('all-selected') : this.doc.root.hostElement.classList.remove('all-selected')

    from.type === 'selected' && this._setSelectedClass(from.block)

    if (!to) return;
    to.type === 'selected' && this._setSelectedClass(to.block)

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
      if (b.nodeType !== BlockNodeType.editable) {
        this._setSelectedClass(b as any)
      }
    })
  }
}
