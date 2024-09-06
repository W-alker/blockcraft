import {EditableBlock, IKeyEventHandler, USER_INPUT_ORIGIN} from "@core";

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
    const prevBlock = controller.findPrevEditableBlock(bRef.id)
    // no content
    if (!bRef.textLength) {
      if (!prevBlock) return
      controller.deleteBlockById(bRef.id)
      controller.setSelection(prevBlock, 'end')
    } else if (prevBlock) {
      // concat with prev block at the end
      const deltas = [
        {retain: prevBlock.textLength},
        ...bRef.getTextDelta(),
      ]
      controller.transact(() => {
        controller.setSelection(prevBlock, 'end')
        controller.applyDeltaToEditableBlock(prevBlock, deltas)
        controller.deleteBlockById(bRef.id)
      })
    }
    return
  }

  const yText = controller.getEditableBlockYText(blockId)
  const selection = window.getSelection()!
  if (selection.isCollapsed) {
    if (selection.focusOffset === 0) {
      const prevNode = selection.focusNode!.parentElement!.previousSibling;
      // !selection.focusNode!.textContent && selection.focusNode!.parentElement?.remove()
      prevNode && selection.setPosition(prevNode.firstChild!, prevNode.textContent!.length)
    }
    controller.transact(() => {
      const {focusNode, focusOffset} = selection;
      (focusNode as Text).deleteData(focusOffset - 1, 1);
      if (!focusNode!.textContent) {
        const prevNode = focusNode!.parentElement!.previousSibling;
        focusNode!.parentElement?.remove()
        prevNode && selection.setPosition(prevNode.firstChild!, prevNode.textContent!.length)
      }
      yText.delete(blockRange.start - 1, 1)
    }, USER_INPUT_ORIGIN)
    return
  }

  const deltas = [
    {retain: blockRange.start},
    {delete: blockRange.end - blockRange.start},
  ]
  controller.applyDeltaToEditableBlock(bRef, deltas)

}
