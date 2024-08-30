import {EditableBlock, IKeyEventHandler, isCursorAtElEnd, onBackspace} from "@core";

export const onDelete: IKeyEventHandler = (e, controller) => {
    e.preventDefault()
    const curRange = controller.getCurrentRange()!
    if (curRange.isAtRoot) {
        onBackspace(e, controller)
        return
    }

    const {blockId, blockRange} = curRange
    if (isCursorAtElEnd(document.activeElement as HTMLElement)) {
        const bRef = controller.getBlockRef(blockId) as EditableBlock
        const position = controller.getBlockPosition(bRef.id)
        if (position.parentId !== controller.rootId || position.index >= controller.rootModel.length - 1) return;
        const nextBlockModel = controller.findNextBlockModel(bRef.id)
        if (nextBlockModel) {
            if (!controller.isEditableBlock(nextBlockModel)) {
                if (!bRef.textLength) {
                    controller.deleteBlocks(position.index, 1)
                }
                controller.selectBlocks(position.index, position.index + 1)
            } else {
                const nextBlock = controller.getBlockRef(nextBlockModel.id) as EditableBlock
                if (!bRef.textLength) {
                    controller.deleteBlockById(bRef.id)
                    controller.focusTo(nextBlock, 'start')
                } else {
                    const deltas = [
                        {retain: bRef.textLength},
                        ...nextBlock.getTextDelta(),
                    ]
                    controller.transact(()=>{
                        controller.deleteBlockById(nextBlock.id)
                        controller.applyDeltaToEditableBlock(bRef, deltas)
                    })
                }
            }
        }
    } else {
        const yText = controller.getEditableBlockYText(blockId)
        const selection = window.getSelection()!
        if (selection.isCollapsed) {
            if (!selection.focusNode!.textContent || selection.focusOffset === selection.focusNode!.textContent.length) {
                const nextNode = selection.focusNode!.parentElement!.nextElementSibling
                !selection.focusNode!.textContent && selection.focusNode!.parentElement?.remove()
                if (nextNode) {
                    selection.setPosition(nextNode.firstChild!, 0)
                }
            }
            (selection.focusNode as Text).deleteData(selection.focusOffset, 1);
            yText.delete(blockRange.start, 1)
        } else {
            const deltas = [
                {retain: blockRange.start},
                {delete: blockRange.end - blockRange.start},
            ]
            controller.applyDeltaToEditableBlock(blockId, deltas)
        }
    }
}
