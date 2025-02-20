import {BindingKeyObject, KeyBindingHandler} from "./index";

const onArrowUp: KeyBindingHandler<'block'> = function (evt, curSelection) {
  const {start, end, group, groupId} = curSelection
  evt.preventDefault()
  if (group === 'root') {
    if (!this.controller.rootBlockLength) {
      this.controller.insertEmptyBlock(0)
      return
    }

    const bm = this.controller.rootModel[Math.max(0, start)]
    this.controller.selection.focusTo(bm.id, 0)
    return
  }

  const block = this.controller.getBlockRef(groupId)!
  this.controller.selection.focusPrevEditableBlock(block)
}

const onArrowDown: KeyBindingHandler<'block'> = function (evt, curSelection) {
  const {start, end, group, groupId} = curSelection
  evt.preventDefault()
  if (group === 'root') {
    if (!this.controller.rootBlockLength) {
      this.controller.insertEmptyBlock(0)
      return
    }

    const bm = this.controller.rootModel[Math.min(this.controller.rootBlockLength - 1, start)]
    this.controller.selection.focusTo(bm.id, 'end')
  }
}

export const BLOCK_BINDINGS: BindingKeyObject<'block'>[] = [
  {
    trigger: {key: 'ArrowUp'},
    context: {selectionType: 'block'},
    handler: onArrowUp
  },
  {
    trigger: {key: 'ArrowLeft'},
    context: {selectionType: 'block'},
    handler: onArrowUp
  },
  {
    trigger: {key: 'ArrowRight'},
    context: {selectionType: 'block'},
    handler: onArrowDown
  },
  {
    trigger: {key: 'ArrowDown'},
    context: {selectionType: 'block'},
    handler: onArrowDown
  },
  {
    trigger: {key: 'Enter'},
    context: {selectionType: 'block'},
    handler: function (evt, curSelection) {
      const {start, end, group, groupId} = curSelection
      evt.preventDefault()
      if (group === 'root') {
        if (!this.controller.rootBlockLength) {
          this.controller.insertEmptyBlock(0)
          return
        }

        this.controller.insertEmptyBlock(Math.min(this.controller.rootBlockLength - 1, start + 1), groupId)
      }
    }
  },
  {
    trigger: {key: 'Backspace'},
    context: {selectionType: 'block'},
    handler: function (evt, curSelection) {
      evt.preventDefault()
      const {start, end, group, groupId} = curSelection
      if (group === 'root') {
        this.controller.deleteBlocks(start, end - start, groupId)

        if (!this.controller.rootBlockLength) {
          this.controller.insertEmptyBlock(0)
          return
        }
        const index = Math.max(0, start - 1)
        const bm = this.controller.rootModel[index]
        this.controller.selection.focusTo(bm.id, 'end')
      }
    }
  },
  {
    trigger: {key: 'Delete'},
    context: {selectionType: 'block'},
    handler: function (evt, curSelection) {
      evt.preventDefault()
      const {start, end, group, groupId} = curSelection
      if (group === 'root') {
        this.controller.deleteBlocks(start, end - start, groupId)

        if (!this.controller.rootBlockLength) {
          this.controller.insertEmptyBlock(0)
          return
        }
        const index = Math.min(this.controller.rootBlockLength, end + 1)
        const bm = this.controller.rootModel[index]
        this.controller.selection.focusTo(bm.id, 'end')
      }
    }
  },
  {
    trigger: {key: 'Tab'},
    context: {selectionType: 'block'},
    handler: function (evt, curSelection) {

    }
  }
]
