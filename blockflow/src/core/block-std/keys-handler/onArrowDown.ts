import {IKeyEventHandler} from "./keyEventBus";
import {Controller} from "../../controller";
import {EditableBlock} from "../components";
import {isCursorAtElEnd} from "../../utils";


export const onArrowDown: IKeyEventHandler = (e: KeyboardEvent, controller: Controller) => {
  const curRange = controller.getSelection()!
  if (curRange.isAtRoot) {
    e.preventDefault()
    const {rootRange} = curRange
    const lastBlock = rootRange ? controller.getBlockRef(controller.rootModel[rootRange.end].id) : controller.getBlockRef(controller.lastBlock.id)
    if (!lastBlock) return
    if (!controller.isEditableBlock(lastBlock)) {
      const nextEditableBlock = controller.findNextEditableBlock(lastBlock.id)
      if (!nextEditableBlock) return
      controller.setSelection(nextEditableBlock, 'end')
    } else {
      controller.setSelection(lastBlock as EditableBlock, 'end')
    }
    return
  }
  const block = controller.getBlockRef(curRange.blockId) as EditableBlock
  if (isCursorAtElEnd(block.containerEle)) {
    const nextEditableBlock = controller.findNextEditableBlock(curRange.blockId)
    if (!nextEditableBlock) return
    e.preventDefault()
    controller.setSelection(nextEditableBlock, 'start')
  }
}
