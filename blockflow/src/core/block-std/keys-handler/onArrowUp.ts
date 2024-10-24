import {IKeyEventHandler} from "./keyEventBus";
import {Controller} from "../../controller";
import {EditableBlock} from "../components";
import {isCursorAtElStart} from "../../utils";


export const onArrowUp: IKeyEventHandler = (e: KeyboardEvent, controller: Controller) => {
    const curRange = controller.getSelection()!
    if (curRange.isAtRoot) {
        e.preventDefault()
        const {rootRange} = curRange
        const firstBlock = rootRange ? controller.getBlockRef(controller.rootModel[rootRange.start].id) : controller.getBlockRef(controller.rootModel[0].id)
        if (!firstBlock) return
        if (!controller.isEditableBlock(firstBlock)) {
            const prevEditableBlock = controller.findPrevEditableBlock(firstBlock.id)
            if (!prevEditableBlock) return
            controller.setSelection(prevEditableBlock, 'start')
        } else {
            controller.setSelection(firstBlock as EditableBlock, 'start')
        }
        return
    }

    const block = controller.getBlockRef(curRange.blockId) as EditableBlock
    if (isCursorAtElStart(block.containerEle)) {
        const prevEditableBlock = controller.findPrevEditableBlock(curRange.blockId)
        if (!prevEditableBlock) return
        e.preventDefault()
        controller.setSelection(prevEditableBlock, 'end')
    }
}
