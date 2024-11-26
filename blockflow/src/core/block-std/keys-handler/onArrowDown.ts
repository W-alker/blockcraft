import {IKeyEventHandler} from "./keyEventBus";
import {Controller} from "../../controller";
import {EditableBlock} from "../components";

export const onArrowDown: IKeyEventHandler = (e: KeyboardEvent, controller: Controller) => {
  const curRange = controller.selection.getSelection()!
  if (curRange.isAtRoot) {
    e.preventDefault()
    const {rootRange} = curRange
    const lastBlock = rootRange ? controller.getBlockRef(controller.rootModel[rootRange.end - 1].id) : controller.getBlockRef(controller.lastBlock.id)
    if (!lastBlock) return
    if (!controller.isEditableBlock(lastBlock)) {
      const nextEditableBlock = controller.findNextEditableBlock(lastBlock.id)
      if (!nextEditableBlock) return
      nextEditableBlock.setSelection('end')
    } else {
      (lastBlock as EditableBlock).setSelection('end')
    }
    return
  }
  const block = controller.getBlockRef(curRange.blockId) as EditableBlock
  if (curRange.blockRange.end === block.textLength && curRange.blockRange.start === curRange.blockRange.end) {
    const nextEditableBlock = controller.findNextEditableBlock(curRange.blockId)
    if (!nextEditableBlock) return
    e.preventDefault()
    nextEditableBlock.setSelection('start')
  }
}
