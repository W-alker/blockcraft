import {Controller, EditableBlock, IKeyEventHandler, sliceDelta, USER_CHANGE_SIGNAL} from "@core";

export const onEnter: IKeyEventHandler = (event: KeyboardEvent, controller: Controller) => {
  event.preventDefault()
  event.stopImmediatePropagation()
  const curRange = controller.getSelection()!
  if (curRange.isAtRoot) return

  const {blockRange: range} = curRange
  const bRef = controller.getFocusingBlockRef()
  if (!bRef) throw new Error('No focusing block')
  const textContent = bRef.getTextContent()
  const {parentId, index} = controller.getBlockPosition(bRef.id)!
  if(parentId !== controller.rootId) return
  const newBlock = controller.createBlock(bRef.flavour, (range.start === 0 || range.end >= textContent.length) ? undefined : sliceDelta(bRef.getTextDelta(), range.end))

  controller.transact(() => {
    if (range.start > 0 && range.end < textContent.length) {
      bRef.applyDelta([{retain: range.start}, {delete: textContent.length - range.start}])
    }
    controller.insertBlocks(range.start === 0 ? index : index + 1, [newBlock], parentId).then(() => {
     range.start > 0 && controller.setSelection(newBlock.id, 'start')
    })
  }, USER_CHANGE_SIGNAL)
}
