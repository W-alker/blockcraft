import {IKeyEventHandler} from "./keyEventBus";
import {Controller} from "../../controller";
import {EditableBlock} from "../components";

export const onArrowDown: IKeyEventHandler = (e: KeyboardEvent, controller: Controller) => {
  const curRange = controller.selection.getSelection()!


  const focusNext = (index: number) => {
    const nextBlock = controller.getBlockRef(controller.rootModel[Math.min(controller.blockLength - 1, index + 1)].id)
    if (!nextBlock) return

    if (controller.isEditableBlock(nextBlock)) {
      nextBlock.setSelection(index < controller.blockLength - 1 ? 'start' : 'end')
      return;
    }

    if(index < controller.blockLength - 1) {
      controller.selection.setSelection(controller.rootId, index + 1, index + 2)
      return;
    }

    const np = controller.createBlock('paragraph')
    controller.insertBlocks(controller.blockLength - 1, [np]).then(() => {
      controller.selection.setSelection(np.id, 0)
    })
  }

  if (curRange.isAtRoot) {
    e.preventDefault()
    const {rootRange} = curRange

    if (!controller.blockLength) {
      const np = controller.createBlock('paragraph')
      controller.insertBlocks(0, [np]).then(() => {
        controller.selection.setSelection(np.id, 0)
      })
      return
    }

    const index = rootRange ? rootRange.end - 1 : controller.blockLength - 1
    const bm = controller.rootModel[index]
    if (controller.isEditable(bm)) {
      controller.selection.setSelection(bm.id, 'end')
      return
    }
    focusNext(index)
    return
  }

  const block = controller.getBlockRef(curRange.blockId) as EditableBlock
  if (curRange.blockRange.end === block.textLength && curRange.blockRange.start === curRange.blockRange.end) {
    e.preventDefault()
    const poss = block.getPosition()
    if (poss.parentId !== controller.rootId) return;
    if(poss.index === controller.blockLength - 1) return;
    focusNext(poss.index)
  }
}
