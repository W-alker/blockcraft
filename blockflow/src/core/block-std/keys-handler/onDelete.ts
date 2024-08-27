import {EditableBlock, IKeyEventHandler, isCursorAtElEnd, onBackspace} from "@core";

export const onDelete: IKeyEventHandler = (e, controller) => {
    const curRange = controller.getCurrentRange()!
    if (curRange.isAtRoot) {
        onBackspace(e, controller)
        return
    }

    // const {blockId, blockRange} = curRange
    // if (isCursorAtElEnd(document.activeElement as HTMLElement)) {
    //     e.preventDefault()
    //     const bRef = controller.getBlockRef(blockId) as EditableBlock
    //     const position = controller.getBlockPosition(bRef.id)
    //     if (position.parentId !== controller.rootId || position.index >= controller.rootModel.length - 1) return;
    //     const nextBlock = controller.getBlockRef(controller.rootModel[position.index + 1].id) as EditableBlock
    //     if (nextBlock) {
    //         const deltas = [
    //             {retain: bRef.yText.length},
    //             ...nextBlock.yText.toDelta(),
    //         ]
    //         bRef.yText.applyDelta(deltas)
    //         bRef.applyDeltaToView(deltas, true)
    //         controller.deleteBlockById(nextBlock.id)
    //     }
    // }
}
