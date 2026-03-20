import {
  BindHotKey,
  BlockNodeType,
  DocEventRegister,
  EditableBlockComponent,
  EventListen,
  STR_LINE_BREAK,
  UIEventStateContext
} from "../../block-std";
import {IS_MAC} from "../../../global";
import {closetBlockId, isZeroSpace} from "../../utils";

@DocEventRegister
export class SelectionKeyboard {
  constructor(public readonly doc: BlockCraft.Doc) {}

  @BindHotKey({key: ['ArrowUp', "ArrowDown", 'ArrowLeft', 'ArrowRight'], shiftKey: false})
  private _handlerUpOrDown(ctx: UIEventStateContext) {
    const state = ctx.get('keyboardState')
    const {isAllSelected, to, from} = state.selection

    if (!isAllSelected) return
    ctx.preventDefault()

    const docSelection = document.getSelection()!
    const focusBlockId = closetBlockId(docSelection.focusNode!)!
    const focusBlock = this.doc.getBlockById(focusBlockId)

    const opObj = from.block === focusBlock ? from : to!
    const isBackward = state.raw.key === "ArrowUp" || state.raw.key === "ArrowLeft"

    const focusSibling = () => {
      const opBlock = isBackward ? this.doc.prevSibling(focusBlock) : this.doc.nextSibling(focusBlock)
      if (!opBlock) return false
      this.doc.selection.selectOrSetCursorAtBlock(opBlock, !isBackward)
      this.doc.selection.scrollSelectionIntoView()
      return true
    }

    if (opObj.block.nodeType === BlockNodeType.void) {
      focusSibling()
      return true
    }

    if (opObj.block.nodeType === BlockNodeType.block) {
      const res = focusSibling()
      if (!res) {
        this.doc.selection.setCursorAtBlock(focusBlock, isBackward)
      }
    }
    return true
  }

  @BindHotKey({key: ['ArrowUp', "ArrowDown"], shiftKey: true})
  private _handleShiftUpOrDown(ctx: UIEventStateContext) {
    ctx.preventDefault()
    const state = ctx.get('keyboardState')
    const docSelection = document.getSelection()!
    const focusBlockId = closetBlockId(docSelection.focusNode!)
    if (!focusBlockId) {
      return true
    }

    const isBackward = state.raw.key === "ArrowUp"

    const focusBlock = this.doc.getBlockById(focusBlockId)

    const extendStartOrEnd = (block: EditableBlockComponent, isStart: boolean) => {
      const nodeAndOffset = block.runtime.mapper.modelPointToDomPoint(block.containerElement, isStart ? 0 : block.textLength)
      docSelection.extend(nodeAndOffset.node, nodeAndOffset.offset)
    }

    if (docSelection.isCollapsed && this.doc.isEditable(focusBlock) &&
      (isBackward ? !state.selection.isStartOfBlock : !state.selection.isEndOfBlock)
    ) {
      extendStartOrEnd(focusBlock, isBackward)
      return true
    }

    const opBlock = isBackward ? this.doc.prevSibling(focusBlockId) : this.doc.nextSibling(focusBlockId)
    if (!opBlock) {
      const parent = this.doc.getBlockById(focusBlockId).parentBlock
      if (parent && parent.nodeType !== BlockNodeType.root) {
        docSelection.setBaseAndExtent(
          parent.hostElement, isBackward ? 0 : parent.hostElement.childElementCount,
          parent.hostElement, isBackward ? parent.hostElement.childElementCount : 0
        )
      }
      return true
    }

    this.doc.isEditable(opBlock)
      ? extendStartOrEnd(opBlock, isBackward) : docSelection.extend(opBlock.hostElement, isBackward ? 0 : opBlock.hostElement.childElementCount)
    this.doc.selection.scrollSelectionIntoView()
    return true
  }

  @BindHotKey({key: ['ArrowLeft', "ArrowRight"], shiftKey: true})
  private _handleShiftLeftOrRight(ctx: UIEventStateContext) {
    const state = ctx.get('keyboardState')
    const {to, from, isStartOfBlock, isEndOfBlock} = state.selection
    const docSelection = document.getSelection()!

    const focusBlockId = closetBlockId(docSelection.focusNode!)
    if (!focusBlockId) {
      ctx.preventDefault()
      return true
    }

    const isBackward = state.raw.key === "ArrowLeft"

    if (!to && ((isBackward && !isStartOfBlock) || (!isBackward && !isEndOfBlock))
    ) {
      return true
    }

    const focusBlock = this.doc.getBlockById(focusBlockId)
    const opObj = from.block === focusBlock ? from : to!

    if (
      (isBackward && (opObj.type === 'selected' ? false : (opObj.index > 0))) ||
      (!isBackward && (opObj.type === 'selected' ? false : (opObj.index + opObj.length < opObj.block.textLength)))
    ) {
      return true
    }

    const opBlock = isBackward ? this.doc.prevSibling(focusBlockId) : this.doc.nextSibling(focusBlockId)
    if (!opBlock) {
      ctx.preventDefault()
      const parent = this.doc.getBlockById(focusBlockId).parentBlock
      if (parent && parent.nodeType !== BlockNodeType.root) {
        docSelection.setBaseAndExtent(
          parent.hostElement, isBackward ? parent.hostElement.childElementCount : 0,
          parent.hostElement, isBackward ? 0 : parent.hostElement.childElementCount
        )
      }
      return true
    }

    ctx.preventDefault()

    const extendStartOrEnd = (block: EditableBlockComponent, isStart: boolean) => {
      const nodeAndOffset = block.runtime.mapper.modelPointToDomPoint(block.containerElement, isStart ? 0 : block.textLength)
      docSelection.extend(nodeAndOffset.node, nodeAndOffset.offset)
    }

    this.doc.isEditable(opBlock)
      ? extendStartOrEnd(opBlock, !isBackward) : docSelection.extend(opBlock.hostElement, isBackward ? 0 : opBlock.hostElement.childElementCount)
    this.doc.selection.scrollSelectionIntoView()
    return true
  }

  @BindHotKey({key: ['a', 'A'], shortKey: true})
  handleCtrlA(context: UIEventStateContext) {
    const state = context.get('keyboardState')
    const {raw: evt, selection} = state
    evt.preventDefault()
    evt.stopPropagation()
    const common = this.doc.getBlockById(selection.commonParent)
    if (this.doc.isEditable(common)) {
      if (selection.from.type !== 'text') return
      if (selection.from.index === 0 && selection.from.length === common.textLength) {
        this.doc.selection.selectAllChildren(common.parentBlock!)
      } else {
        this.doc.selection.selectAllChildren(common)
        this.doc.messageService.info(`连续按下${IS_MAC ? '⌘' : 'ctrl'} + A以选中全文`)
      }
      return true
    }
    if (selection.from.blockId === common.id && selection.from.block.flavour !== 'root') {
      this.doc.selection.selectAllChildren(common.parentBlock!)
      return true
    }

    this.doc.selection.selectAllChildren(selection.commonParent)
    return true
  }

  @BindHotKey({key: 'Home', shortKey: null, shiftKey: false})
  handleHome(context: UIEventStateContext) {
    const state = context.get('keyboardState')
    const {selection} = state
    if (!selection.collapsed || selection.from.type !== 'text') return
    context.preventDefault()

    if (selection.from.block.plainTextOnly) {
      const index = selection.from.block.textContent().slice(0, selection.from.index).lastIndexOf(STR_LINE_BREAK)
      if (index === -1) selection.from.block.setInlineRange(0)
      else selection.from.block.setInlineRange(index + 1)
      return true
    }

    selection.from.block.setInlineRange(0)
    return true
  }

  @BindHotKey({key: 'End', shortKey: null, shiftKey: false})
  handleEnd(context: UIEventStateContext) {
    const state = context.get('keyboardState')
    const {selection} = state
    if (!selection.collapsed || selection.from.type !== 'text') return
    context.preventDefault()

    if (selection.from.block.plainTextOnly) {
      const {index: fromIndex, block} = selection.from
      const linBreakIndex = block.textContent().slice(fromIndex, block.textLength).indexOf(STR_LINE_BREAK)
      if (linBreakIndex === -1) block.setInlineRange(block.textLength)
      else block.setInlineRange(fromIndex + linBreakIndex)
      return true
    }

    selection.from.block.setInlineRange(selection.from.block.textLength)
    return true
  }

  @EventListen('keyDown')
  private _handlerNoEditable(ctx: UIEventStateContext) {
    const state = ctx.get('keyboardState')
    if (state.composing || !state.selection.raw.collapsed) return;

    const selection = document.getSelection()!
    const activeNode = selection.focusNode
    const zero = isZeroSpace(activeNode!)
    if (zero) {
      switch (state.raw.key) {
        case 'Backspace':
        case 'ArrowLeft':
          if (selection.anchorOffset > 0) {
            selection.modify(selection.type === 'Range' ? 'extend' : 'move', 'backward', 'character')
            return;
          }
          break
        case 'ArrowRight':
        case 'Delete':
          if (selection.anchorOffset === 0) {
            selection.modify(selection.type === 'Range' ? 'extend' : 'move', 'forward', 'character')
            return;
          }
          break
        case 'ArrowDown':
          break
        case 'ArrowUp':
          break
      }
      return
    }
  }
}
