import {Controller, EditableBlock, IInlineAttrs} from "@core";
import {replaceSelectionInView} from "@core/utils";

export const formatKeyHandler = (format: IInlineAttrs, e: KeyboardEvent, controller: Controller) => {
  e.preventDefault()
  const range = controller.getCurrentRange()!
  if (range.isAtRoot) return
  const block = controller.getBlockRef(range.blockId) as EditableBlock
  const _r = block.format(format, range.blockRange)!
  replaceSelectionInView(_r)
}
