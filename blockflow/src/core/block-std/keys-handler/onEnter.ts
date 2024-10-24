import {IKeyEventHandler} from "./keyEventBus";
import {Controller} from "../../controller";
import {DeltaOperation} from "../../types";
import {sliceDelta} from "../utils";
import {USER_CHANGE_SIGNAL} from "../../yjs";

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
  if (controller.activeElement?.classList.contains('bf-multi-line')) {
    const deltas: DeltaOperation[] = [
      {retain: range.start},
      {insert: '\n'}
    ]
    if (range.end !== range.start) deltas.splice(1, 0, {delete: range.end - range.start})
    bRef.applyDelta(deltas)
    return
  }
  if (parentId !== controller.rootId) return
  const paramDeltas = (range.start === 0 || range.end >= textContent.length) ? undefined : sliceDelta(bRef.getTextDelta(), range.end)
  const newBlock = controller.createBlock(bRef.flavour, [paramDeltas, bRef.props])

  controller.transact(() => {
    if (range.start > 0 && range.end < textContent.length) {
      bRef.applyDelta([{retain: range.start}, {delete: textContent.length - range.start}])
    }
    controller.insertBlocks(range.start === 0 ? index : index + 1, [newBlock], parentId).then(() => {
      range.start > 0 && controller.setSelection(newBlock.id, 'start')
    })
  }, USER_CHANGE_SIGNAL)
}
