import {IKeyEventHandler} from "./keyEventBus";
import {EditableBlock} from "../components";
import {USER_CHANGE_SIGNAL} from "../../yjs";
import {isEmbedElement} from "../../utils";

export const onBackspace: IKeyEventHandler = (e, controller) => {
  e.preventDefault()

  const curRange = controller.getSelection()!
  if (curRange.isAtRoot) {
    controller.deleteSelectedBlocks()
    return
  }

  const {blockId, blockRange} = curRange
  const bRef = controller.getBlockRef(blockId) as EditableBlock

  if (blockRange.start === 0 && blockRange.end === 0) {

    if (bRef.flavour !== 'paragraph') {
      const pBlock = controller.createBlock('paragraph', [bRef.getTextDelta(), bRef.props])
      controller.replaceWith(bRef.id, pBlock).then(() => {
        controller.setSelection(pBlock.id, 'start')
      })
      return;
    }

    if (bRef.props.indent > 0) {
      bRef.setProp('indent', bRef.props.indent - 1)
      return
    }

    const prevBlock = controller.findPrevEditableBlock(bRef.id)
    if (!prevBlock) return
    const deltas = bRef.textLength ? [{retain: prevBlock.textLength}, ...bRef.getTextDelta()] : []
    controller.transact(() => {
      prevBlock.setSelection('end')
      deltas.length && prevBlock.applyDelta(deltas, false)
      controller.deleteBlockById(bRef.id)
    }, USER_CHANGE_SIGNAL)
    return
  }

  const activeElement = bRef.containerEle
  const yText = bRef.yText
  const selection = window.getSelection()!

  if (selection.isCollapsed) {
    const {focusNode, focusOffset} = selection

    if (focusNode === activeElement) {
      const prevElement = activeElement.children[focusOffset - 1]

      if (prevElement instanceof HTMLElement && isEmbedElement(prevElement)) {
        const beforeEle = prevElement.previousElementSibling
        controller.transact(() => {
          prevElement.remove()
          yText.delete(blockRange.start - 1, 1)
          beforeEle && !isEmbedElement(beforeEle as Element) && selection.setPosition(beforeEle.lastChild!, beforeEle.textContent!.length)
        }, USER_CHANGE_SIGNAL)
        return
      }

      selection.setPosition(prevElement.lastChild!, prevElement.textContent!.length)
    }

    if (focusOffset === 0) {
      const prevNode = focusNode!.parentElement!.previousSibling;
      prevNode && selection.setPosition(prevNode.firstChild!, prevNode.textContent!.length)
    }

    controller.transact(() => {
      const {focusNode, focusOffset} = selection;
      (focusNode as Text).deleteData(focusOffset - 1, 1);
      if (!focusNode!.textContent) {
        const prevNode = focusNode!.parentElement!.previousSibling
        focusNode!.parentElement?.remove()
        prevNode && !isEmbedElement(prevNode as Element) && selection.setPosition(prevNode.firstChild!, prevNode.textContent!.length)
      }
      yText.delete(blockRange.start - 1, 1)
    }, USER_CHANGE_SIGNAL)
    return
  }

  const deltas = [
    {retain: blockRange.start},
    {delete: blockRange.end - blockRange.start},
  ]
  bRef.applyDelta(deltas)
}
