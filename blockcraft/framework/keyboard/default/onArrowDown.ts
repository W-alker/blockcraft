import {KeyBindingHandler} from "../index";
import {EditableBlock} from "../../../block-std";

export const onArrowDown: KeyBindingHandler = function (evt, curRange) {
  const focusNext = (index: number) => {
    const nextBlock = this.controller.getBlockRef(this.controller.rootModel[Math.min(this.controller.blockLength - 1, index + 1)].id)
    if (!nextBlock) return

    if (this.controller.isEditableBlock(nextBlock)) {
      nextBlock.setSelection(index < this.controller.blockLength - 1 ? 'start' : 'end')
      return;
    }

    if (index < this.controller.blockLength - 1) {
      this.controller.selection.setSelection(this.controller.rootId, index + 1, index + 2)
      return;
    }

    const np = this.controller.createBlock('paragraph')
    this.controller.insertBlocks(this.controller.blockLength - 1, [np]).then(() => {
      this.controller.selection.setSelection(np.id, 0)
    })
  }

  if (curRange.isAtRoot) {
    evt.preventDefault()
    const {rootRange} = curRange

    if (!this.controller.blockLength) {
      const np = this.controller.createBlock('paragraph')
      this.controller.insertBlocks(0, [np]).then(() => {
        this.controller.selection.setSelection(np.id, 0)
      })
      return
    }

    const index = rootRange ? rootRange.end - 1 : this.controller.blockLength - 1
    const bm = this.controller.rootModel[index]
    if (this.controller.isEditable(bm)) {
      this.controller.selection.setSelection(bm.id, 'end')
      return
    }
    focusNext(index)
    return
  }

  const block = this.controller.getBlockRef(curRange.blockId) as EditableBlock
  if (curRange.blockRange.end === block.textLength && curRange.blockRange.start === curRange.blockRange.end) {
    evt.preventDefault()
    const poss = block.getPosition()
    if (poss.parentId !== this.controller.rootId) return;
    if (poss.index === this.controller.blockLength - 1) return;
    focusNext(poss.index)
  }
}
