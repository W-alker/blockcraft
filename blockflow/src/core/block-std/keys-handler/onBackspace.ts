import {EditableBlock, IKeyEventHandler} from "@core";

export const onBackspace: IKeyEventHandler = (e, controller) => {
  const curRange= controller.getCurrentRange()!
  if (curRange.isAtRoot) {
    const selectedBlocksRange = controller.selectedBlocksRange
    if (selectedBlocksRange) {
      e.preventDefault()
      const {start, end} = selectedBlocksRange
      controller.transact(() => {
        controller.deleteBlocks(start, end - start + 1)
      })
    }
    return
  }

  const {blockId, blockRange } = curRange
  if (blockRange.start === 0 && blockRange.end === 0) {
    e.preventDefault()
    const bRef = controller.getBlockRef(blockId) as EditableBlock
    const prevBlock = controller.findPrevEditableBlock(bRef.id)
    if (prevBlock) {
      const deltas = [
        {retain: prevBlock.yText.length},
        ...bRef.yText.toDelta(),
      ]
      prevBlock.yText.applyDelta(deltas)
      prevBlock.applyDeltaToView(deltas, true)
      controller.deleteBlockById(bRef.id)
    }
  }

}
