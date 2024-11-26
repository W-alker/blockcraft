import {IKeyEventHandler} from "./keyEventBus";
import {EditableBlock} from "../components";
import {USER_CHANGE_SIGNAL} from "../../yjs";
import {isEmbedElement} from "../../utils";

export const onDelete: IKeyEventHandler = (e, controller) => {
  e.preventDefault()
  const curRange = controller.selection.getSelection()!
  if (curRange.isAtRoot) {
    controller.deleteSelectedBlocks()
    return
  }

  const activeElement = document.activeElement as HTMLElement
  const {blockId, blockRange} = curRange
  const bRef = controller.getBlockRef(blockId) as EditableBlock

  if (blockRange.start === bRef.textLength && blockRange.end === bRef.textLength) {
    const position = controller.getBlockPosition(bRef.id)

    if (position.parentId !== controller.rootId || position.index >= controller.rootModel.length - 1) return

    const nextBlockModel = controller.findNextBlockModel(bRef.id)!

    if (!controller.isEditable(nextBlockModel)) {
      return controller.transact(() => {
        !bRef.textLength && controller.deleteBlockById(bRef.id)
        controller.selection.setSelection(controller.rootId, position.index, position.index + 1)
      }, USER_CHANGE_SIGNAL)
    }

    const nextBlock = controller.getBlockRef(nextBlockModel.id) as EditableBlock
    if (!bRef.textLength) {
      controller.deleteBlockById(bRef.id)
      bRef.setSelection('start')
      return;
    }

    return controller.transact(() => {
      bRef.applyDelta([{retain: bRef.textLength}, ...nextBlock.getTextDelta()], false)
      controller.deleteBlockById(nextBlock.id)
    }, USER_CHANGE_SIGNAL)
  }

  const yText = bRef.yText
  const selection = window.getSelection()!
  if (selection.isCollapsed) {
    const {focusNode, focusOffset} = selection

    const deleteNextEle = (nextEle: HTMLElement) => {
      controller.transact(() => {
        nextEle.remove()
        yText.delete(blockRange.start, 1)
      }, USER_CHANGE_SIGNAL)
    }

    if (focusNode === activeElement) {
      const nextElement = activeElement.children[focusOffset]
      if (nextElement instanceof HTMLElement && isEmbedElement(nextElement)) {
        return deleteNextEle(nextElement)
      }
      nextElement && selection.setPosition(nextElement.firstChild!, 0)
    }

    if (selection.focusOffset === selection.focusNode!.textContent!.length || !selection.focusNode!.textContent) {
      const nextNode = selection.focusNode!.parentElement!.nextElementSibling
      if(nextNode && isEmbedElement(nextNode)) {
        return deleteNextEle(<HTMLElement>nextNode)
      }
      nextNode && selection.setPosition(nextNode.firstChild!, 0)
    }

    controller.transact(() => {
      const {focusNode, focusOffset} = selection;
      (focusNode as Text).deleteData(selection.focusOffset, 1);
      if (!focusNode!.textContent) {
        const nextNode = focusNode!.parentElement!.nextElementSibling
        focusNode!.parentElement?.remove()
        nextNode && selection.setPosition(nextNode.firstChild!, 0)
      }
      yText.delete(blockRange.start, 1)
    }, USER_CHANGE_SIGNAL)
    return;
  }

  const deltas = [
    {retain: blockRange.start},
    {delete: blockRange.end - blockRange.start},
  ]
  bRef.applyDelta(deltas)
}
