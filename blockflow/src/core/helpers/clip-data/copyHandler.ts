import {Controller, EditableBlock, sliceDelta, ClipDataWriter, IBlockModel} from "@core";

/**
 * @param controller the controller instance
 * @param cut need to delete the selected content after copy
 */
export const copyHandler = async (controller: Controller, cut = false) => {
  const curRange = controller.getSelection()
  if (!curRange) return Promise.reject()
  if (!curRange.isAtRoot) {

    const {blockRange: range, blockId} = curRange
    if (range.start === range.end) return Promise.reject()

    const bRef = controller.getBlockRef(blockId) as EditableBlock
    const deltaConcat = sliceDelta(bRef.getTextDelta(), range.start, range.end)

    return ClipDataWriter.writeDeltaToClipboard(deltaConcat).then(() => {
      cut && controller.transact(() => {
        const deltas = [{retain: range.start}, {delete: range.end - range.start}]
        controller.applyDeltaToEditableBlock(blockId, deltas)
      })
    })
  }

  const {rootRange} = curRange
  if (!rootRange) return Promise.reject()
  const blocks = controller.docManager.rootModel.slice(rootRange.start, rootRange.end + 1)
    // .rootYModel.slice(rootRange.start, rootRange.end + 1).map((yBlock) => yBlock.toJSON()) as IBlockModel[]
  return ClipDataWriter.writeModelToClipboard(blocks).then(() => {
    console.log('copy success', blocks)
    cut && controller.transact(() => {
      controller.deleteBlocks(rootRange.start, rootRange.end - rootRange.start + 1)
    })
  }).catch((e) => {
    console.error('copy failed', e)
  })
}
