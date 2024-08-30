import {Controller, EditableBlock, IInlineAttrs} from "@core";

export const formatKeyHandler = (format: IInlineAttrs, e: KeyboardEvent, controller: Controller) => {
  e.preventDefault()
  const range = controller.getCurrentRange()!
  if (range.isAtRoot) return
  const block = controller.getBlockRef(range.blockId) as EditableBlock
  block.format(format, range.blockRange, true)
}
