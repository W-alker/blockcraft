import {BaseBlockComponent, BlockNodeType, EditableBlockComponent} from "../../block-std";
import {
  getMountedSelectionCoveredBlockIds,
  getSelectionCoveredBlockIds,
} from "./covered-blocks";

export class SelectionSelectedManager {

  constructor(private doc: BlockCraft.Doc) {
  }

  private _selectedSet = new Set<BaseBlockComponent<any>>()
  private _focusedSet = new Set<EditableBlockComponent<any>>()

  private _addSelectedClass(block: BaseBlockComponent<any>) {
    block.hostElement.classList.add('selected')
  }

  private _addFocusedClass(block: EditableBlockComponent<any>) {
    block.hostElement.classList.add('focused')
  }

  private _reconcileClasses(
    nextSelected: Set<BaseBlockComponent<any>>,
    nextFocused: Set<EditableBlockComponent<any>>,
  ) {
    this._selectedSet.forEach(block => {
      if (!nextSelected.has(block)) block.hostElement.classList.remove('selected')
    })
    this._focusedSet.forEach(block => {
      if (!nextFocused.has(block)) block.hostElement.classList.remove('focused')
    })
    nextSelected.forEach(block => {
      if (!this._selectedSet.has(block)) this._addSelectedClass(block)
    })
    nextFocused.forEach(block => {
      if (!this._focusedSet.has(block)) this._addFocusedClass(block)
    })
    this._selectedSet = nextSelected
    this._focusedSet = nextFocused
  }

  setSelected(
    selection: BlockCraft.Selection | null,
    mountedRootIds?: readonly string[],
  ) {
    const nextSelected = new Set<BaseBlockComponent<any>>()
    const nextFocused = new Set<EditableBlockComponent<any>>()

    if (selection) {
      const coveredIds = mountedRootIds
        ? getMountedSelectionCoveredBlockIds(
          selection,
          this.doc,
          this._collectMountedBlockIds(mountedRootIds),
        )
        : getSelectionCoveredBlockIds(selection, this.doc)
      coveredIds.forEach(id => {
        let block: BaseBlockComponent<any>
        try {
          block = this.doc.getBlockById(id) as BaseBlockComponent<any>
        } catch {
          return
        }
        if (block.nodeType === BlockNodeType.editable) {
          nextFocused.add(block as EditableBlockComponent<any>)
        } else {
          nextSelected.add(block)
        }
      })
    }

    this._reconcileClasses(nextSelected, nextFocused)
  }

  private _collectMountedBlockIds(rootIds: readonly string[]): string[] {
    const ids: string[] = []
    const stack = [...rootIds].reverse()
    const visited = new Set<string>()
    while (stack.length) {
      const blockId = stack.pop()!
      if (visited.has(blockId)) continue
      visited.add(blockId)
      if (!this.doc.vm.isMounted(blockId)) continue
      ids.push(blockId)
      const children = this.doc.model.getChildrenIds(blockId)
      for (let index = children.length - 1; index >= 0; index--) {
        stack.push(children[index])
      }
    }
    return ids
  }
}
