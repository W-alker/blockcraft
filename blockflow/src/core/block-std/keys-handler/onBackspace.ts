import {IKeyEventHandler} from "./keyEventBus";
import {EditableBlock} from "../components";
import {USER_CHANGE_SIGNAL} from "../../yjs";
import {adjustRangeEdges, isEmbedElement, setCursorAfter} from "../../utils";

export const onBackspace: IKeyEventHandler = (e, controller) => {
  e.preventDefault()

  const curRange = controller.selection.getSelection()!
  if (curRange.isAtRoot) {
    const res = controller.deleteSelectedBlocks()
    if (!res || res[0] === 0) return
    // 聚焦上一个块
    const prev = controller.rootModel[res[0] - 1]
    controller.selection.focusTo(prev.id, 'end')
    return
  }

  const {blockId, blockRange} = curRange
  const bRef = controller.getBlockRef(blockId) as EditableBlock

  if (blockRange.start === 0 && blockRange.end === 0) {

    // transform to paragraph
    if (bRef.flavour !== 'paragraph') {
      const pBlock = controller.createBlock('paragraph', [bRef.getTextDelta(), bRef.props])
      controller.replaceWith(bRef.id, [pBlock]).then(() => {
        controller.selection.setSelection(pBlock.id, 'start')
      })
      return;
    }

    // decrement indent
    if (bRef.props.indent > 0) {
      bRef.setProp('indent', bRef.props.indent - 1)
      return
    }

    const position = bRef.getPosition()
    if (position.parentId !== controller.rootId || position.index === 0) return
    const prevBlock = controller.getBlockRef(controller.rootModel[position.index - 1].id)
    if (!prevBlock) throw new Error(`Can not find prev block`)

    if (!controller.isEditableBlock(prevBlock)) {
      if(!bRef.textLength) {
        controller.deleteBlocks(position.index, 1)
      }
      controller.selection.setSelection(controller.rootId, position.index - 1, position.index)
      return
    }

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

    // delete prev element and focus to prev node before it
    const deletePrevEle = (prevEle: Element) => {
      controller.transact(() => {
        prevEle.remove()
        yText.delete(blockRange.start - 1, 1)
      }, USER_CHANGE_SIGNAL)
    }

    if (focusNode === activeElement) {
      const prevNode = activeElement.childNodes[focusOffset - 1]

      // if prev element is embed element, delete it
      if (prevNode instanceof Element && isEmbedElement(prevNode)) {
        return deletePrevEle(prevNode)
      }

      // if prev element is not embed element, focus to it end
      setCursorAfter(prevNode, selection)
    }

    // if focusNode is text node
    if (focusOffset === 0) {
      const parentNode = focusNode!.parentElement!
      const prevNode = parentNode === activeElement ? focusNode!.previousSibling! : parentNode.previousSibling!

      if (isEmbedElement(prevNode)) {
        return deletePrevEle(<HTMLElement>prevNode)
      }

      setCursorAfter(prevNode, selection)
    }

    // default, handle it as text node
    controller.transact(() => {
      // TODO bug
      const {focusNode, focusOffset} = selection;

      selection.modify('move', 'backward', 'character')
      const textNode = focusNode as Text
      textNode.deleteData(focusOffset - 1, 1);
      yText.delete(blockRange.start - 1, 1)

      if (textNode.length === 0) {
        const parentNode = textNode.parentElement!
        if (parentNode === activeElement) {
          textNode.remove()
          return
        }
        // const prevNode = parentNode.previousSibling!
        // parentNode.remove()
        // setCursorAfter(prevNode, selection)
      }

    }, USER_CHANGE_SIGNAL)

    return
  }

  const deltas = [
    {retain: blockRange.start},
    {delete: blockRange.end - blockRange.start},
  ]
  adjustRangeEdges(bRef.containerEle, selection.getRangeAt(0))
  selection.collapseToStart()
  bRef.applyDelta(deltas, false)
}



