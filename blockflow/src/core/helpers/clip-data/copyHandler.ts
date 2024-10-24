import {Controller} from "../../controller";
import {EditableBlock, sliceDelta} from "../../block-std";
import {ClipDataWriter} from "./writeClipData";

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
      if (cut) {
        const deltas = [{retain: range.start}, {delete: range.end - range.start}]
        bRef.applyDelta(deltas)
      }
    })
  }

  const {rootRange} = curRange
  if (!rootRange) return Promise.reject()
  const blocks = controller.rootModel.slice(rootRange.start, rootRange.end + 1).map((block) => block.toJSON())
  // .rootYModel.slice(rootRange.start, rootRange.end + 1).map((yBlock) => yBlock.toJSON()) as IBlockModel[]
  return ClipDataWriter.writeModelToClipboard(blocks).then(() => {
    cut && controller.deleteSelectedBlocks()
  }).catch((e) => {
    console.error('copy failed', e)
  })
}
