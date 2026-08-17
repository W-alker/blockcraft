import {
  BaseBlockComponent,
  BlotType,
  BlockNodeType,
  EditableBlockComponent,
  EmbedBlot,
} from "../../block-std";
import {
  getMountedSelectionCoveredBlockIds,
  getSelectionCoveredBlockIds,
} from "./covered-blocks";

export class SelectionSelectedManager {

  constructor(private doc: BlockCraft.Doc) {
  }

  private _selectedSet = new Set<BaseBlockComponent<any>>()
  private _focusedSet = new Set<EditableBlockComponent<any>>()
  private _selectedEmbedSet = new Set<HTMLElement>()

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

  private _reconcileEmbedSelection(
    selection: BlockCraft.Selection | null,
    editableBlocks: Set<EditableBlockComponent<any>>,
  ) {
    const nextSelected = new Set<HTMLElement>()

    if (
      selection &&
      !selection.collapsed &&
      typeof selection.contains === 'function'
    ) {
      editableBlocks.forEach(block => {
        const scrollBlot = block.runtime?.scrollBlot
        if (!scrollBlot) return

        for (const leaf of scrollBlot.leaves) {
          if (leaf.type !== BlotType.Embed) continue
          const embed = leaf as EmbedBlot
          const offset = scrollBlot.offsetOf(embed)
          if (offset < 0) continue
          try {
            if (
              selection.contains(block.id, offset) &&
              selection.contains(block.id, offset + embed.length)
            ) {
              nextSelected.add(embed.cElement)
            }
          } catch {
            // A concurrent view replacement can invalidate this presentation
            // pass. The next model selection or mounted-window update retries.
          }
        }
      })
    }

    this._selectedEmbedSet.forEach(element => {
      if (!nextSelected.has(element)) {
        element.classList.remove('bc-inline-embed--selected')
      }
    })
    nextSelected.forEach(element => {
      if (!this._selectedEmbedSet.has(element)) {
        element.classList.add('bc-inline-embed--selected')
      }
    })
    this._selectedEmbedSet = nextSelected
  }

  setSelected(
    selection: BlockCraft.Selection | null,
    mountedRootIds?: readonly string[],
  ) {
    const nextSelected = new Set<BaseBlockComponent<any>>()
    const nextFocused = new Set<EditableBlockComponent<any>>()
    const nextEmbedCandidates = new Set<EditableBlockComponent<any>>()

    if (selection) {
      const mountedBlockIds = mountedRootIds
        ? this._collectMountedBlockIds(mountedRootIds)
        : undefined
      const coveredIds = mountedRootIds
        ? getMountedSelectionCoveredBlockIds(
          selection,
          this.doc,
          mountedBlockIds!,
        )
        : getSelectionCoveredBlockIds(selection, this.doc)
      coveredIds.forEach(id => this._collectPresentationBlocks(
        id,
        nextSelected,
        nextFocused,
        nextEmbedCandidates,
      ))
    }

    this._reconcileClasses(nextSelected, nextFocused)
    this._reconcileEmbedSelection(selection, nextEmbedCandidates)
  }

  private _collectPresentationBlocks(
    blockId: string,
    selected: Set<BaseBlockComponent<any>>,
    focused: Set<EditableBlockComponent<any>>,
    embedCandidates: Set<EditableBlockComponent<any>>,
  ): void {
    let block: BaseBlockComponent<any>
    try {
      block = this.doc.getBlockById(blockId) as BaseBlockComponent<any>
    } catch {
      return
    }

    if (block.nodeType === BlockNodeType.editable) {
      const editable = block as EditableBlockComponent<any>
      embedCandidates.add(editable)
      focused.add(editable)
      return
    }
    selected.add(block)
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
