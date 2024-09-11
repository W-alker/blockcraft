import {EditableBlock, IKeyEventHandler, isCursorAtElEnd, isEmbedElement, onBackspace, USER_INPUT_ORIGIN} from "@core";

export const onDelete: IKeyEventHandler = (e, controller) => {
  e.preventDefault()
  const curRange = controller.getSelection()!
  if (curRange.isAtRoot) {
    onBackspace(e, controller)
    return
  }

  const activeElement = document.activeElement as HTMLElement
  const {blockId, blockRange} = curRange
  const bRef = controller.getBlockRef(blockId) as EditableBlock

  if (blockRange.start === bRef.textLength && blockRange.end === bRef.textLength) {
    const position = controller.getBlockPosition(bRef.id)
    if (position.parentId !== controller.rootId || position.index >= controller.rootModel.length - 1) return;
    const nextBlockModel = controller.findNextBlockModel(bRef.id)
    if (!nextBlockModel) return
    if (!controller.isEditableBlock(nextBlockModel)) {
      !bRef.textLength && controller.deleteBlockById(bRef.id)
      controller.setSelection(controller.rootId, position.index, position.index + 1)
      return
    }

    const nextBlock = controller.getBlockRef(nextBlockModel.id) as EditableBlock
    if (!bRef.textLength) {
      controller.deleteBlockById(bRef.id)
      controller.setSelection(nextBlock, 'start')
      return;
    }

    controller.transact(() => {
      controller.deleteBlockById(nextBlock.id)
      controller.applyDeltaToEditableBlock(bRef,
        [{retain: bRef.textLength}, ...nextBlock.getTextDelta()],
        false)
    })
    return;
  }

  const yText = controller.getEditableBlockYText(blockId)
  const selection = window.getSelection()!
  if (selection.isCollapsed) {

    const {focusNode, focusOffset} = selection

    if (focusNode === activeElement) {
      const nextElement = activeElement.children[focusOffset]
      if (nextElement instanceof HTMLElement && isEmbedElement(nextElement)) {
        return controller.transact(() => {
          nextElement.remove()
          yText.delete(blockRange.start, 1)
        })
      }

      selection.setPosition(nextElement.firstChild!, 0)
    }

    if (selection.focusOffset === selection.focusNode!.textContent!.length || !selection.focusNode!.textContent) {
      const nextNode = selection.focusNode!.parentElement!.nextElementSibling
      // !selection.focusNode!.textContent && selection.focusNode!.parentElement?.remove()
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
    }, USER_INPUT_ORIGIN)
    return;
  }

  const deltas = [
    {retain: blockRange.start},
    {delete: blockRange.end - blockRange.start},
  ]
  controller.applyDeltaToEditableBlock(blockId, deltas)
}
