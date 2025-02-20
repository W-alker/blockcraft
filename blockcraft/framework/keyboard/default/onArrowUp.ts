import {KeyBindingHandler} from "../index";

export const onArrowUp: KeyBindingHandler = function (evt, curRange) {
  const focusPrev = (index: number) => {
    const prevBlock = this.controller.getBlockRef(this.controller.rootModel[Math.max(0, index - 1)].id)
    if (!prevBlock) return

    if (this.controller.isEditableBlock(prevBlock)) {
      prevBlock.setSelection(index > 0 ? 'end' : 0)
      return;
    }

    if (index > 0) {
      this.controller.selection.setSelection(this.controller.rootId, index - 1, index)
      return;
    }

    const np = this.controller.createBlock('paragraph')
    this.controller.insertBlocks(0, [np]).then(() => {
      this.controller.selection.setSelection(np.id, 0)
    })
  }

  if (curRange.isAtRoot) {
    evt.preventDefault()
    const {rootRange} = curRange

    if (!this.controller.rootModel.length) {
      const np = this.controller.createBlock('paragraph')
      this.controller.insertBlocks(0, [np]).then(() => {
        this.controller.selection.setSelection(np.id, 0)
      })
      return
    }

    const index = rootRange ? rootRange.start : 0
    const bm = this.controller.rootModel[index]
    if (this.controller.isEditable(bm)) {
      this.controller.selection.setSelection(bm.id, 0)
      return
    }
    focusPrev(index)
    return
  }

  if (curRange.blockRange.start === curRange.blockRange.end && curRange.blockRange.start === 0) {
    evt.preventDefault()
    const bRef = this.controller.getFocusingBlockRef()!
    const poss = bRef.getPosition()
    if (poss.parentId !== this.controller.rootId) return;
    if (poss.index === 0) return;
    focusPrev(poss.index)
  }
}
