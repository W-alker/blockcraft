import {IKeyEventHandler} from "./keyEventBus";
import {Controller} from "../../controller";
import {DeltaOperation} from "../../types";
import {sliceDelta} from "../utils";
import {USER_CHANGE_SIGNAL} from "../../yjs";

export const onEnter: IKeyEventHandler = (event: KeyboardEvent, controller: Controller) => {
  event.preventDefault()
  event.stopImmediatePropagation()
  const curRange = controller.selection.getSelection()
  if(!curRange) return;
  if (curRange.isAtRoot) {
    controller.deleteSelectedBlocks()
    const newBlock = controller.createBlock('paragraph')
    controller.insertBlocks(curRange.rootRange!.start , [newBlock]).then(() => {
      controller.selection.setSelection(newBlock.id, 'start')
    })
    return
  }

  const {blockRange: range} = curRange
  const bRef = controller.getFocusingBlockRef()
  if (!bRef) throw new Error('No focusing block')

  const textContent = bRef.getTextContent()
  const {parentId, index} = bRef.getPosition()

  if (bRef.containerEle.classList.contains('bf-multi-line') && !event.ctrlKey && !event.metaKey) {
    const isAtEnd = range.start === textContent.length && textContent.at(-1) !== '\n'
    const deltas: DeltaOperation[] = [
      {retain: range.start},
      {insert: isAtEnd ? '\n\u200B' : '\n'}
    ]
    if (range.end !== range.start) deltas.splice(1, 0, {delete: range.end - range.start})
    bRef.applyDelta(deltas, false)
    window.getSelection()?.modify('move', 'forward', 'character')
    return
  }

  if (parentId !== controller.rootId) return
  const isEmpty = !textContent.trim()
  const isAtCenter = range.start > 0 && range.end < textContent.length

  const paramDeltas = isAtCenter ? sliceDelta(bRef.getTextDelta(), range.end) : undefined
  const newBlock = controller.createBlock((isEmpty || event.ctrlKey || event.metaKey) ? 'paragraph' : bRef.flavour, [paramDeltas, bRef.props])

  controller.transact(() => {
    if (isAtCenter) {
      bRef.applyDelta([{retain: range.start}, {delete: textContent.length - range.start + 1}])
    }
    controller.insertBlocks(range.start === 0 && !isEmpty ? index : index + 1, [newBlock]).then(() => {
      (range.start > 0 || isEmpty) && controller.selection.setSelection(newBlock.id, 'start')
    })
  }, USER_CHANGE_SIGNAL)
}
