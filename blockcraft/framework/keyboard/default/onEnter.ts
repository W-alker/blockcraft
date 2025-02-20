import {DeltaOperation} from "../../../types";
import {USER_CHANGE_SIGNAL} from "../../../yjs";
import {KeyBindingHandler} from "../index";
import {sliceDelta} from "../../../block-std";

export const onEnter: KeyBindingHandler = function (event: KeyboardEvent, curRange) {
  event.preventDefault()
  event.stopPropagation()
  if (!curRange) return;
  if (curRange.isAtRoot) {

    if (!curRange.rootRange) {

      if (!this.controller.blockLength) {
        const np = this.controller.createBlock('paragraph')
        this.controller.insertBlocks(0, [np]).then(() => {
          this.controller.selection.setSelection(np.id, 0)
        })
      }

      return
    }

    const newBlock = this.controller.createBlock('paragraph')
    this.controller.insertBlocks(curRange.rootRange!.start + 1, [newBlock]).then(() => {
      this.controller.selection.setSelection(newBlock.id, 'start')
    })
    return
  }

  const {blockRange: range} = curRange
  const bRef = this.controller.getFocusingBlockRef()
  if (!bRef) throw new Error('No focusing block')

  const textContent = bRef.getTextContent()
  const {parentId, index} = bRef.getPosition()

  if (bRef.containerEle.classList.contains('bf-multi-line') && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
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

  if (parentId !== this.controller.rootId) return
  const textLength = bRef.textLength
  const isEmpty = !textLength
  const isAtCenter = range.start > 0 && range.end < textLength

  const paramDeltas = isAtCenter ? sliceDelta(bRef.getTextDelta(), range.end) : undefined
  const newBlock = this.controller.createBlock((isEmpty || event.ctrlKey || event.metaKey || event.shiftKey) ? 'paragraph' : bRef.flavour, [paramDeltas, bRef.props])

  this.controller.transact(() => {
    if (isAtCenter) {
      bRef.applyDelta([{retain: range.start}, {delete: textLength - range.start}])
    }
    this.controller.insertBlocks(range.start === 0 && !isEmpty ? index : index + 1, [newBlock]).then(() => {
      (range.start > 0 || isEmpty) && this.controller.selection.setSelection(newBlock.id, 'start')
    })
  }, USER_CHANGE_SIGNAL)
}
