import {Controller, EditableBlock, IKeyEventHandler} from "@core";
import {isCursorAtElEnd} from "@core/utils";

export const onArrowDown: IKeyEventHandler = (e: KeyboardEvent, controller: Controller) => {
  const curRange = controller.getCurrentRange()!
  if (curRange.isAtRoot) {
    e.preventDefault()
    const {rootRange} = curRange
    const lastBlock = rootRange ? controller.getBlockRef(controller.rootModel[rootRange.end].id) : controller.getBlockRef(controller.lastBlock.id)
    if (!lastBlock) return
    if (!controller.isEditableBlock(lastBlock)) {
      const nextEditableBlock = controller.findNextEditableBlock(lastBlock.id)
      if (!nextEditableBlock) return
      controller.focusTo(nextEditableBlock, 'end')
    } else {
      controller.focusTo(lastBlock as EditableBlock, 'end')
    }
    return
  }
  const block = controller.getBlockRef(curRange.blockId) as EditableBlock
  if (isCursorAtElEnd(block.containerEle)) {
    const nextEditableBlock = controller.findNextEditableBlock(curRange.blockId)
    if (!nextEditableBlock) return
    e.preventDefault()
    controller.focusTo(nextEditableBlock, 'start')
  }
}
