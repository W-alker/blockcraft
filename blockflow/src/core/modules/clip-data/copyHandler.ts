import {Controller, EditableBlock, sliceDelta} from "@core";
import {writeDeltaToClipboard, writeModelToClipboard} from "@core/modules/clip-data/writeClipData";

export const copyHandler = async (controller: Controller, cut = false) => {
  const curRange = controller.getCurrentRange()
  if (!curRange) return Promise.reject()
  if (!curRange.isAtRoot) {
    const {blockRange: range, blockId} = curRange
    if (range.start === range.end) return Promise.reject()

    const bRef = controller.getBlockRef(blockId) as EditableBlock
    const delta = sliceDelta(bRef.yText.toDelta(), range.start, range.end)
    return writeDeltaToClipboard(delta).then(() => {
      console.log('copy success')
      cut && controller.transact(() => {
        const bRef = controller.getBlockRef(blockId) as EditableBlock
        bRef.yText.delete(range.start, range.end - range.start + 1)
        bRef.applyDeltaToView([{retain: range.start}, {delete: range.end - range.start + 1}])
      })
    })
  }

  const {rootRange} = curRange
  if (!rootRange) return Promise.reject()
  const blocks = controller.rootModel.slice(rootRange.start, rootRange.end + 1)
  return writeModelToClipboard(blocks).then(() => {
    cut && controller.transact(() => {
      controller.deleteBlocks(rootRange.start, rootRange.end - rootRange.start + 1)
    })
  }).catch((e) => {
    console.error('copy failed', e)
  })
}
