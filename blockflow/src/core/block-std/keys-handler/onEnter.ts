import {Controller, EditableBlock, sliceDelta} from "@core";
import {getRange, setRange} from "@core/utils";

export const onEnter = (event: KeyboardEvent, controller: Controller) => {
  event.preventDefault()
  // event.stopImmediatePropagation()
  const curRange = controller.getCurrentRange()!
  if (curRange.isAtRoot) return

  const {blockRange: range} = curRange
  const bRef = controller.getFocusingBlockRef()
  if (!bRef) throw new Error('No focusing block')
  const textContent = bRef.getTextContent()
  // const {parentId, index} = controller.getBlockPosition(bRef.id)!
  //
  // const deltas = JSON.parse(JSON.stringify(bRef.yText.toDelta()))
  // console.log('onEnter', deltas)
  // const newBlock = controller.createBlock(bRef.flavour, (range.start === 0 || range.end >= textContent.length) ? undefined : sliceDelta(deltas, range.end))
  //
  // controller.transact(() => {
  //   if (range.start > 0 && range.end < textContent.length) {
  //     bRef.applyDeltaToView([{retain: range.start}, {delete: textContent.length - range.start}])
  //     bRef.yText.delete(range.start, bRef.yText.length - range.start)
  //   }
  //
  //   controller.insertBlocks(range.start === 0 ? index : index + 1, [newBlock], parentId).then(() => {
  //     if (range.start > 0)
  //       controller.focusTo(controller.getBlockRef(newBlock.id) as EditableBlock, 'start', 'start')
  //   })
  // })
}
