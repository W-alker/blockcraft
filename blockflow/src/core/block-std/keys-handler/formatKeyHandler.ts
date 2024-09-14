import {Controller, EditableBlock, IInlineAttrs, USER_CHANGE_SIGNAL} from "@core";

export const formatKeyHandler = (format: IInlineAttrs, e: KeyboardEvent, controller: Controller) => {
  e.preventDefault()
  const range = controller.getSelection()!
  if (range.isAtRoot) return
  const block = controller.getBlockRef(range.blockId) as EditableBlock
  // block.format(format, range.blockRange, true)
  const {start, end} = range.blockRange
  const deltas = [
    {
      retain: start,
    },
    {
      retain: end - start,
      attributes: format
    }
  ]
  block.applyDelta(deltas)
}
