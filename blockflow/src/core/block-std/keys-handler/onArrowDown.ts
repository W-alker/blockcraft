import {Controller, EditableBlock} from "@core";
import {isCursorAtElEnd} from "@core/utils";

export const onArrowDown = (event: KeyboardEvent, controller: Controller) => {
  const curRange = controller.getCurrentRange()!
  if (curRange.isAtRoot) {
    const {rootRange} = curRange
    const lastBlock = controller.getBlockRef(controller.rootModel[rootRange?.end || controller.rootModel.length - 1].id) as EditableBlock
    controller.focusTo(lastBlock, 'end', 'end')
    return
  }
  const block = controller.getBlockRef(curRange.blockId) as EditableBlock
  if (isCursorAtElEnd(block.containerEle)) {
    const nextEditableBlock = controller.findNextEditableBlock(curRange.blockId)
    if (!nextEditableBlock) return
    event.preventDefault()
    controller.focusTo(nextEditableBlock, 'start', 'start')
  }
}
