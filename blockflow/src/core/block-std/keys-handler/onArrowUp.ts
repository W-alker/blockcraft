import {Controller, EditableBlock, IKeyEventHandler} from "@core";
import {isCursorAtElStart} from "@core/utils";

export const onArrowUp: IKeyEventHandler = (e: KeyboardEvent, controller: Controller) => {
    const curRange = controller.getCurrentRange()!
    if (curRange.isAtRoot) {
        e.preventDefault()
        const {rootRange} = curRange
        const firstBlock = rootRange ? controller.getBlockRef(controller.rootModel[rootRange.start].id) : controller.getBlockRef(controller.rootModel[0].id)
        if (!firstBlock) return
        if (!controller.isEditableBlock(firstBlock)) {
            const prevEditableBlock = controller.findPrevEditableBlock(firstBlock.id)
            if (!prevEditableBlock) return
            controller.focusTo(prevEditableBlock, 'start')
        } else {
            controller.focusTo(firstBlock as EditableBlock, 'start')
        }
        return
    }

    const block = controller.getBlockRef(curRange.blockId) as EditableBlock
    if (isCursorAtElStart(block.containerEle)) {
        const prevEditableBlock = controller.findPrevEditableBlock(curRange.blockId)
        if (!prevEditableBlock) return
        e.preventDefault()
        controller.focusTo(prevEditableBlock, 'end')
    }
}
