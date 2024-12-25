import {IKeyEventHandler} from "./keyEventBus";
import {Controller} from "../../controller";

export const onArrowUp: IKeyEventHandler = (e: KeyboardEvent, controller: Controller) => {
  const curRange = controller.selection.getSelection()!

  const focusPrev = (index: number) => {
    const prevBlock = controller.getBlockRef(controller.rootModel[Math.max(0, index - 1)].id)
    if (!prevBlock) return

    if (controller.isEditableBlock(prevBlock)) {
      prevBlock.setSelection(index > 0 ? 'end' : 0)
      return;
    }

    if (index > 0) {
      controller.selection.setSelection(controller.rootId, index - 1, index)
      return;
    }

    const np = controller.createBlock('paragraph')
    controller.insertBlocks(0, [np]).then(() => {
      controller.selection.setSelection(np.id, 0)
    })
  }

  if (curRange.isAtRoot) {
    e.preventDefault()
    const {rootRange} = curRange

    if (!controller.rootModel.length) {
      const np = controller.createBlock('paragraph')
      controller.insertBlocks(0, [np]).then(() => {
        controller.selection.setSelection(np.id, 0)
      })
      return
    }

    const index = rootRange ? rootRange.start : 0
    const bm = controller.rootModel[index]
    if (controller.isEditable(bm)) {
      controller.selection.setSelection(bm.id, 0)
      return
    }
    focusPrev(index)
    return
  }

  if (curRange.blockRange.start === curRange.blockRange.end && curRange.blockRange.start === 0) {
    e.preventDefault()
    const bRef = controller.getFocusingBlockRef()!
    const poss = bRef.getPosition()
    if (poss.parentId !== controller.rootId) return;
    if (poss.index === 0) return;
    focusPrev(poss.index)
  }
}
