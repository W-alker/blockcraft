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
import {ITextSelectionPoint} from "./types";

@DocEventRegister
export class SelectionKeyboard {
  constructor(public readonly doc: BlockCraft.Doc) {}

  @BindHotKey({key: ['ArrowUp', "ArrowDown", 'ArrowLeft', 'ArrowRight'], shiftKey: false})
  private _handlerUpOrDown(ctx: UIEventStateContext) {
    const state = ctx.get('keyboardState')
    const sel = state.selection
    const {isAllSelected, collapsed, isStartOfBlock, isEndOfBlock} = sel

    if (!isAllSelected) {
      if (collapsed && sel.start.type === 'text') {
        const isBack = state.raw.key === 'ArrowUp' || state.raw.key === 'ArrowLeft'
        if ((isBack && isStartOfBlock) || (!isBack && isEndOfBlock)) {
          const sibling = isBack ? this.doc.prevSibling(sel.firstBlock) : this.doc.nextSibling(sel.firstBlock)
          if (sibling && sibling.nodeType === BlockNodeType.void) {
            ctx.preventDefault()
            this.doc.selection.selectOrSetCursorAtBlock(sibling, !isBack)
            this.doc.selection.scrollSelectionIntoView()
            return true
          }
        }
      }
      return
    }
    ctx.preventDefault()

    const docSelection = document.getSelection()!
    const focusBlockId = closetBlockId(docSelection.focusNode!)!
    const focusBlock = this.doc.getBlockById(focusBlockId)

    // head is the focus endpoint
    const headBlock = sel.head.block
    const isBackward = state.raw.key === "ArrowUp" || state.raw.key === "ArrowLeft"

    const focusSibling = () => {
      const opBlock = isBackward ? this.doc.prevSibling(focusBlock) : this.doc.nextSibling(focusBlock)
      if (!opBlock) return false
      this.doc.selection.selectOrSetCursorAtBlock(opBlock, !isBackward)
      this.doc.selection.scrollSelectionIntoView()
      return true
    }

    if (headBlock.nodeType === BlockNodeType.void) {
      focusSibling()
      return true
    }

    if (headBlock.nodeType === BlockNodeType.block) {
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
    const sel = state.selection
    const docSelection = document.getSelection()!

    const focusBlockId = closetBlockId(docSelection.focusNode!)
    if (!focusBlockId) {
      ctx.preventDefault()
      return true
    }

    const isBackward = state.raw.key === "ArrowLeft"

    // Single block, not at boundary — let browser handle
    if (sel.isInSameBlock && ((isBackward && !sel.isStartOfBlock) || (!isBackward && !sel.isEndOfBlock))) {
      return true
    }

    // head (focus) has room to extend within its block — let browser handle
    const head = sel.head
    if (head.type === 'text') {
      if (isBackward && head.offset > 0) return true
      if (!isBackward && head.offset < (head.block as EditableBlockComponent).textLength) return true
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
    const {raw: evt, selection: sel} = state
    evt.preventDefault()
    evt.stopPropagation()
    const common = this.doc.getBlockById(sel.commonParent)
    if (this.doc.isEditable(common)) {
      if (sel.start.type !== 'text') return
      if (sel.isInSameBlock && sel.start.offset === 0 && (sel.end as ITextSelectionPoint).offset === common.textLength) {
        this.doc.selection.selectAllChildren(common.parentBlock!)
      } else {
        this.doc.selection.selectAllChildren(common)
        this.doc.messageService.info(`连续按下${IS_MAC ? '⌘' : 'ctrl'} + A以选中全文`)
      }
      return true
    }
    if (sel.start.blockId === common.id && sel.start.block.flavour !== 'root') {
      this.doc.selection.selectAllChildren(common.parentBlock!)
      return true
    }

    this.doc.selection.selectAllChildren(sel.commonParent)
    return true
  }

  @BindHotKey({key: 'Home', shortKey: null, shiftKey: false})
  handleHome(context: UIEventStateContext) {
    const state = context.get('keyboardState')
    const sel = state.selection
    if (!sel.collapsed || sel.start.type !== 'text') return
    context.preventDefault()

    const block = sel.firstBlock as EditableBlockComponent
    const offset = sel.start.offset

    if (block.plainTextOnly) {
      const index = block.textContent().slice(0, offset).lastIndexOf(STR_LINE_BREAK)
      if (index === -1) block.setInlineRange(0)
      else block.setInlineRange(index + 1)
      return true
    }

    block.setInlineRange(0)
    return true
  }

  @BindHotKey({key: 'End', shortKey: null, shiftKey: false})
  handleEnd(context: UIEventStateContext) {
    const state = context.get('keyboardState')
    const sel = state.selection
    if (!sel.collapsed || sel.start.type !== 'text') return
    context.preventDefault()

    const block = sel.firstBlock as EditableBlockComponent
    const offset = sel.start.offset

    if (block.plainTextOnly) {
      const linBreakIndex = block.textContent().slice(offset, block.textLength).indexOf(STR_LINE_BREAK)
      if (linBreakIndex === -1) block.setInlineRange(block.textLength)
      else block.setInlineRange(offset + linBreakIndex)
      return true
    }

    block.setInlineRange(block.textLength)
    return true
  }

  @BindHotKey({key: 'Escape'})
  private _handleEscape(ctx: UIEventStateContext) {
    const state = ctx.get('keyboardState')
    const sel = state.selection
    if (sel.collapsed) return
    if (sel.start.type !== 'text' && sel.isInSameBlock) return
    ctx.preventDefault()

    const isForward = sel.direction === 'forward'
    if (sel.isInSameBlock && sel.start.type === 'text') {
      // Collapse to the end the user was extending toward
      const index = isForward ? (sel.end as ITextSelectionPoint).offset : sel.start.offset
      ;(sel.firstBlock as EditableBlockComponent).setInlineRange(index)
    } else {
      const block = isForward ? sel.lastBlock : sel.firstBlock
      this.doc.selection.selectOrSetCursorAtBlock(block, !isForward)
    }
    return true
  }

  @BindHotKey({key: 'Home', shortKey: null, shiftKey: true})
  handleShiftHome(context: UIEventStateContext) {
    const state = context.get('keyboardState')
    const sel = state.selection
    if (sel.start.type !== 'text' || !sel.isInSameBlock) return
    context.preventDefault()

    const block = sel.firstBlock as EditableBlockComponent

    if (block.plainTextOnly) {
      // head IS the focus — use it directly
      const focusOffset = sel.head.type === 'text' ? sel.head.offset : 0
      const lineStart = block.textContent().slice(0, focusOffset).lastIndexOf(STR_LINE_BREAK)
      this.doc.selection.extendTo(block, lineStart === -1 ? 0 : lineStart + 1)
      return true
    }

    this.doc.selection.extendTo(block, 0)
    return true
  }

  @BindHotKey({key: 'End', shortKey: null, shiftKey: true})
  handleShiftEnd(context: UIEventStateContext) {
    const state = context.get('keyboardState')
    const sel = state.selection
    if (sel.start.type !== 'text' || !sel.isInSameBlock) return
    context.preventDefault()

    const block = sel.firstBlock as EditableBlockComponent

    if (block.plainTextOnly) {
      const focusOffset = sel.head.type === 'text' ? sel.head.offset : 0
      const lineEnd = block.textContent().indexOf(STR_LINE_BREAK, focusOffset)
      this.doc.selection.extendTo(block, lineEnd === -1 ? block.textLength : lineEnd)
      return true
    }

    this.doc.selection.extendTo(block, block.textLength)
    return true
  }

  @EventListen('keyDown')
  private _handlerNoEditable(ctx: UIEventStateContext) {
    const state = ctx.get('keyboardState')
    const selection = document.getSelection()!
    if (state.composing || !selection.isCollapsed) return;

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
