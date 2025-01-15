import {IKeyEventHandler} from "./keyEventBus";
import {EditableBlock} from "../components";
import {USER_CHANGE_SIGNAL} from "../../yjs";
import {adjustRangeEdges, isEmbedElement, setCursorBefore} from "../../utils";

export const onDelete: IKeyEventHandler = (e, controller) => {

  const curRange = controller.selection.getSelection()!
  if (curRange.isAtRoot) {
    e.preventDefault()

    const res = controller.deleteSelectedBlocks()
    if (!res || res[1] >= controller.rootModel.length) return
    const end = controller.rootModel[res[1]]
    controller.selection.focusTo(end.id, 'start')
    return
  }

  const activeElement = document.activeElement as HTMLElement
  const {blockId, blockRange} = curRange
  const bRef = controller.getBlockRef(blockId) as EditableBlock

  // At end of block
  if (blockRange.start === bRef.textLength && blockRange.end === bRef.textLength) {
    e.preventDefault()

    const position = controller.getBlockPosition(bRef.id)

    // If it's the last block, don't do anything
    if (position.parentId !== controller.rootId || position.index >= controller.rootModel.length - 1) return

    const nextBlockModel = controller.findNextBlockModel(bRef.id)!

    // If next block is not editable, select the next block
    if (!controller.isEditable(nextBlockModel)) {
      controller.selection.setSelection(controller.rootId, position.index + 1, position.index + 2)
      return
    }

    // Merge with next editable block
    const nextBlock = controller.getBlockRef(nextBlockModel.id) as EditableBlock
    if (!bRef.textLength) {
      controller.deleteBlocks(position.index, 1)
      nextBlock.setSelection(0)
      return;
    }
    controller.transact(() => {
      bRef.applyDelta([{retain: bRef.textLength}, ...nextBlock.getTextDelta()], false)
      controller.deleteBlockById(nextBlock.id)
    }, USER_CHANGE_SIGNAL)
    return
  }

  // const yText = bRef.yText
  // const selection = window.getSelection()!
  // if (selection.isCollapsed) {
  //
  //   const {focusNode, focusOffset} = selection
  //
  //   const deleteNextEle = (nextEle: HTMLElement) => {
  //     controller.transact(() => {
  //       nextEle.remove()
  //       yText.delete(blockRange.start, 1)
  //     }, USER_CHANGE_SIGNAL)
  //   }
  //
  //   if (focusNode === activeElement) {
  //     const nextElement = activeElement.children[focusOffset]
  //
  //     if (nextElement instanceof HTMLElement && isEmbedElement(nextElement)) {
  //       return deleteNextEle(nextElement)
  //     }
  //
  //     setCursorBefore(nextElement, selection)
  //   }
  //
  //   if (!focusNode?.textContent || focusOffset === focusNode.textContent.length) {
  //     const parentNode = focusNode!.parentElement!
  //     const nextNode = parentNode === activeElement ? focusNode!.nextSibling : parentNode.nextSibling
  //
  //     if (nextNode && isEmbedElement(nextNode)) {
  //       return deleteNextEle(<HTMLElement>nextNode)
  //     }
  //
  //     nextNode && setCursorBefore(nextNode, selection)
  //   }
  //
  //   controller.transact(() => {
  //     const {focusNode, focusOffset} = selection;
  //
  //     selection.modify('move', 'forward', 'character')
  //     const textNode = focusNode as Text
  //     textNode.deleteData(focusOffset, 1);
  //     yText.delete(blockRange.start, 1)
  //
  //     if (!textNode.length) {
  //       const parentNode = textNode.parentElement!
  //
  //       if (parentNode === activeElement) {
  //         textNode.remove()
  //         return
  //       }
  //
  //       const prevNode = parentNode.nextSibling!
  //       parentNode.remove()
  //       setCursorBefore(prevNode, selection)
  //     }
  //
  //   }, USER_CHANGE_SIGNAL)
  //   return;
  // }
  //
  // const deltas = [
  //   {retain: blockRange.start},
  //   {delete: blockRange.end - blockRange.start},
  // ]
  // adjustRangeEdges(bRef.containerEle, selection.getRangeAt(0))
  // selection.collapseToEnd()
  // bRef.applyDelta(deltas)
}
