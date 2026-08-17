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
      const nativeBackedRange = this._isNativeBackedRange(selection)
      const nativeFocusedBlockId = nativeBackedRange
        ? this._readSingleTextRangeBlockId(selection)
        : null
      coveredIds.forEach(id => this._collectPresentationBlocks(
        id,
        nativeBackedRange,
        nativeFocusedBlockId,
        nextSelected,
        nextFocused,
        nextEmbedCandidates,
      ))
    }

    this._reconcileClasses(nextSelected, nextFocused)
    this._reconcileEmbedSelection(selection, nextEmbedCandidates)
  }

  /**
   * Generic `.selected` / `.focused` classes are interaction state, not a
   * neutral range fallback: block themes use them to reveal resize handles,
   * tool chrome and opaque host fills. A native-backed range therefore owns
   * its complete visual projection. Only explicit/model-only block
   * selections receive generic block classes. The one exception is a text
   * range wholly inside one editable block: that editing surface keeps its
   * real `.focused` chrome. Inline Embeds keep their narrow atomic fallback
   * through a separate candidate set.
   */
  private _collectPresentationBlocks(
    blockId: string,
    nativeBackedRange: boolean,
    nativeFocusedBlockId: string | null,
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
      if (!nativeBackedRange || block.id === nativeFocusedBlockId) {
        focused.add(editable)
      }
      return
    }
    if (!nativeBackedRange) selected.add(block)
  }

  private _isNativeBackedRange(selection: BlockCraft.Selection): boolean {
    const start = selection.start
    const end = selection.end
    if (!start || !end || selection.collapsed) return false
    if (start.type === 'table-cell' || end.type === 'table-cell') return false
    // A selected↔text (or selected↔boundary/gap) range still owns a real
    // DOM Range between the whole-block edge and the other endpoint. Only a
    // selected↔selected range is the explicit/model-owned block presentation.
    return start.type !== 'selected' || end.type !== 'selected'
  }

  private _readSingleTextRangeBlockId(
    selection: BlockCraft.Selection,
  ): string | null {
    const start = selection.start
    const end = selection.end
    return start?.type === 'text' &&
      end?.type === 'text' &&
      start.blockId === end.blockId
      ? start.blockId
      : null
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
