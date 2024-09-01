import {Controller, EditableBlock, IKeyEventHandler, sliceDelta} from "@core";

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
  const newBlock = controller.schemaStore.create(bRef.flavour, (range.start === 0 || range.end >= textContent.length) ? undefined : sliceDelta(bRef.getTextDelta(), range.end))

  controller.transact(() => {
    if (range.start > 0 && range.end < textContent.length) {
      controller.applyDeltaToEditableBlock(bRef.id, [{retain: range.start}, {delete: textContent.length - range.start}])
    }

    controller.insertBlocks(range.start === 0 ? index : index + 1, [newBlock], parentId).then(() => {
      if (range.start > 0)
        controller.setSelection(newBlock.id as EditableBlock, 'start')
    })
  })
}
