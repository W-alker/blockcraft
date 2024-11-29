import {IKeyEventHandler} from "./keyEventBus";
import {Controller} from "../../controller";
import {EditableBlock} from "../components";

export const onArrowUp: IKeyEventHandler = (e: KeyboardEvent, controller: Controller) => {
  const curRange = controller.selection.getSelection()!
  if (curRange.isAtRoot) {
    e.preventDefault()
    const {rootRange} = curRange
    const firstBlock = rootRange ? controller.getBlockRef(controller.rootModel[rootRange.start].id) : controller.getBlockRef(controller.rootModel[0].id)
    if (!firstBlock) return
    if (!controller.isEditableBlock(firstBlock)) {
      const prevEditableBlock = controller.findPrevEditableBlock(firstBlock.id)
      if (!prevEditableBlock) return
      prevEditableBlock.setSelection(0)
    } else {
      (firstBlock as EditableBlock).setSelection(0)
    }
    return
  }

  if (curRange.blockRange.start === curRange.blockRange.end && curRange.blockRange.start === 0) {
    const prevEditableBlock = controller.findPrevEditableBlock(curRange.blockId)
    if (!prevEditableBlock) return
    e.preventDefault()
    prevEditableBlock.setSelection('end')
  }
}
