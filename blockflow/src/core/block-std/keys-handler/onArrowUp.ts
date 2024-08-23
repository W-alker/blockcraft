import {Controller, EditableBlock} from "@core";
import {isCursorAtElStart} from "@core/utils";

export const onArrowUp = (e: KeyboardEvent, controller: Controller) => {
  const curRange = controller.getCurrentRange()!
  if (curRange.isAtRoot) {
    const {rootRange} = curRange
    const lastBlock = controller.getBlockRef(controller.rootModel[rootRange?.start || 0].id) as EditableBlock
    controller.focusTo(lastBlock, 'start', 'start')
    return
  }

  const block = controller.getBlockRef(curRange.blockId) as EditableBlock
  if (isCursorAtElStart(block.containerEle)) {
    const prevEditableBlock = controller.findPrevEditableBlock(curRange.blockId)
    if (!prevEditableBlock) return
    e.preventDefault()
    controller.focusTo(prevEditableBlock, 'end', 'end')
  }
}
