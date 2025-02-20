import {USER_CHANGE_SIGNAL} from "../../../yjs";
import {adjustRangeEdges, isEmbedElement, setCursorBefore} from "../../../utils";
import {KeyBindingHandler} from "../index";
import {EditableBlock} from "../../../block-std";

export const onDelete: KeyBindingHandler = function (e) {
  e.preventDefault()

  const curRange = this.controller.selection.getSelection()!
  if (curRange.isAtRoot) {
    const res = this.controller.deleteSelectedBlocks()
    if (!res || res[1] >= this.controller.rootModel.length) return
    const end = this.controller.rootModel[res[1]]
    this.controller.selection.focusTo(end.id, 'start')
    return
  }

  const activeElement = document.activeElement as HTMLElement
  const {blockId, blockRange} = curRange
  const bRef = this.controller.getBlockRef(blockId) as EditableBlock

  // At end of block
  if (blockRange.start === bRef.textLength && blockRange.end === bRef.textLength) {
    const position = this.controller.getBlockPosition(bRef.id)

    // If it's the last block, don't do anything
    if (position.parentId !== this.controller.rootId || position.index >= this.controller.rootModel.length - 1) return

    const nextBlockModel = this.controller.findNextBlockModel(bRef.id)!

    // If next block is not editable, select the next block
    if (!this.controller.isEditable(nextBlockModel)) {
      this.controller.selection.setSelection(this.controller.rootId, position.index + 1, position.index + 2)
      return
    }

    // Merge with next editable block
    const nextBlock = this.controller.getBlockRef(nextBlockModel.id) as EditableBlock
    if (!bRef.textLength) {
      this.controller.deleteBlocks(position.index, 1)
      nextBlock.setSelection(0)
      return;
    }
    this.controller.transact(() => {
      bRef.applyDelta([{retain: bRef.textLength}, ...nextBlock.getTextDelta()], false)
      this.controller.deleteBlockById(nextBlock.id)
    }, USER_CHANGE_SIGNAL)
    return
  }

  const yText = bRef.yText
  const selection = window.getSelection()!
  if (selection.isCollapsed) {

    const {focusNode, focusOffset} = selection

    const deleteNextEle = (nextEle: HTMLElement) => {
      this.controller.transact(() => {
        nextEle.remove()
        yText.delete(blockRange.start, 1)
      }, USER_CHANGE_SIGNAL)
    }

    if (focusNode === activeElement) {
      const nextElement = activeElement.children[focusOffset]

      if (nextElement instanceof HTMLElement && isEmbedElement(nextElement)) {
        return deleteNextEle(nextElement)
      }

      setCursorBefore(nextElement, selection)
    }

    if (!focusNode?.textContent || focusOffset === focusNode.textContent.length) {
      const parentNode = focusNode!.parentElement!
      const nextNode = parentNode === activeElement ? focusNode!.nextSibling : parentNode.nextSibling

      if (nextNode && isEmbedElement(nextNode)) {
        return deleteNextEle(<HTMLElement>nextNode)
      }

      nextNode && setCursorBefore(nextNode, selection)
    }

    this.controller.transact(() => {
      const {focusNode, focusOffset} = selection;

      selection.modify('move', 'forward', 'character')
      const textNode = focusNode as Text
      textNode.deleteData(focusOffset, 1);
      yText.delete(blockRange.start, 1)

      if (!textNode.length) {
        const parentNode = textNode.parentElement!

        if (parentNode === activeElement) {
          textNode.remove()
          return
        }

        const prevNode = parentNode.nextSibling!
        parentNode.remove()
        setCursorBefore(prevNode, selection)
      }

    }, USER_CHANGE_SIGNAL)
    return;
  }

  const deltas = [
    {retain: blockRange.start},
    {delete: blockRange.end - blockRange.start},
  ]
  adjustRangeEdges(bRef.containerEle, selection.getRangeAt(0))
  selection.collapseToEnd()
  bRef.applyDelta(deltas)
}
