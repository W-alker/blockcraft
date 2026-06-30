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
import {closetBlockId, isZeroSpace, resolveBlockGapSide} from "../../utils";
import {searchEditableDescendant} from "./index";
import {ITextSelectionPoint} from "./types";

@DocEventRegister
export class SelectionKeyboard {
  constructor(public readonly doc: BlockCraft.Doc) {}

  @BindHotKey({key: ['ArrowUp', "ArrowDown"], shiftKey: false})
  private _handlerUpOrDown(ctx: UIEventStateContext) {
    const state = ctx.get('keyboardState')
    const sel = state.selection
    const {isAllSelected, collapsed, isStartOfBlock, isEndOfBlock} = sel
    const isBack = state.raw.key === 'ArrowUp'

    if (!isAllSelected) {
      // Collapsed caret crossing into a void/container sibling lands on the
      // NEAR-side gap (gap-before when moving down into it, gap-after when
      // moving up). A plain text→text crossing falls through to the browser
      // (no goal-column tracking — that is deferred to P5).
      if (collapsed && sel.start.type === 'text') {
        if ((isBack && isStartOfBlock) || (!isBack && isEndOfBlock)) {
          const sibling = isBack ? this.doc.prevSibling(sel.firstBlock) : this.doc.nextSibling(sel.firstBlock)
          if (sibling && (sibling.nodeType === BlockNodeType.void || sibling.nodeType === BlockNodeType.block)) {
            ctx.preventDefault()
            this.doc.selection.setGapCursor(sibling, isBack ? 'after' : 'before')
            this.doc.selection.scrollSelectionIntoView()
            return true
          }
        }
      } else if (collapsed && sel.start.type === 'gap') {
        // Up/Down stepping out of a gap caret: move to the adjacent sibling and
        // land on its near-side gap (void/container) or text edge (editable).
        ctx.preventDefault()
        this._stepOutOfGap(sel.firstBlock, sel.start.side, isBack)
        return true
      }
      return
    }
    ctx.preventDefault()

    const docSelection = document.getSelection()!
    const focusBlockId = closetBlockId(docSelection.focusNode!)!
    const focusBlock = this.doc.getBlockById(focusBlockId)

    // head is the focus endpoint
    const headBlock = sel.head.block

    const focusSibling = () => {
      const opBlock = isBack ? this.doc.prevSibling(focusBlock) : this.doc.nextSibling(focusBlock)
      if (!opBlock) return false
      // Up/Down landing on a void OR container sibling lands on its near-side
      // gap, not a whole-block `selected` (gap is the collapsed caret;
      // `selected` is the shift-extension / whole-block state, left unchanged
      // here).
      if (opBlock.nodeType === BlockNodeType.void || opBlock.nodeType === BlockNodeType.block) {
        this.doc.selection.setGapCursor(opBlock, isBack ? 'after' : 'before')
      } else {
        this.doc.selection.selectOrSetCursorAtBlock(opBlock, !isBack)
      }
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
        this.doc.selection.setCursorAtBlock(focusBlock, isBack)
      }
    }
    return true
  }

  @BindHotKey({key: ['ArrowLeft', "ArrowRight"], shiftKey: false})
  private _handlerLeftOrRight(ctx: UIEventStateContext) {
    const handled = this._handleLeftRightArrow(ctx)
    if (handled) {
      // Suppress the native caret move; we have repositioned the selection
      // ourselves (stopPropagation alone does not preventDefault).
      ctx.preventDefault()
      return true
    }
    return
  }

  /**
   * Left/Right cross-block gap navigation state machine.
   *
   * Stops, left→right:
   *   …text-end │ gap-before(void) │ gap-after(void) │ text-start…
   *   …text-end │ gap-before(container) │ <descendants…> │ gap-after(container) │ text-start…
   *
   * Returns `true` (consuming the event) when it programmatically moves the
   * caret; returns `undefined` to let the browser handle in-block movement.
   *
   * NOTE (cross-browser): we intercept and reposition the collapsed caret
   * explicitly because the gap span carries a single ZWS — native arrow keys
   * would drift the caret within the span without changing the model gap side.
   */
  private _handleLeftRightArrow(ctx: UIEventStateContext): true | undefined {
    const state = ctx.get('keyboardState')
    const sel = state.selection
    const {isAllSelected, collapsed} = sel
    const isLeft = state.raw.key === 'ArrowLeft'

    // Whole-block `selected` (e.g. after Esc on a void) is not gap-collapsed —
    // leave it to the browser / other handlers (shift-extension is unchanged).
    if (isAllSelected) return

    if (collapsed && sel.start.type === 'text') {
      const block = sel.firstBlock as EditableBlockComponent
      const atStart = isLeft && sel.start.offset === 0
      const atEnd = !isLeft && sel.start.offset === block.textLength
      if (atStart || atEnd) {
        return this._enterSiblingOrExitParent(block, isLeft)
      }
      return
    }

    if (collapsed && sel.start.type === 'gap') {
      return this._moveFromGap(sel.firstBlock, sel.start.side, isLeft)
    }

    return
  }

  /**
   * From a text edge, move into the adjacent sibling. If there is no sibling and
   * the parent is a container block, exit the container by landing on the
   * parent's far-side gap (so the next arrow press leaves the container).
   */
  private _enterSiblingOrExitParent(block: BlockCraft.BlockComponent, isLeft: boolean): true | undefined {
    const sibling = isLeft ? this.doc.prevSibling(block) : this.doc.nextSibling(block)
    if (sibling) {
      this._enterBlockFromSide(sibling, isLeft)
      return true
    }
    // No sibling: bubble up to exit an enclosing container block.
    const parent = block.parentBlock
    if (parent && parent.nodeType === BlockNodeType.block) {
      this.doc.selection.setGapCursor(parent, isLeft ? 'before' : 'after')
      this.doc.selection.scrollSelectionIntoView()
      return true
    }
    return
  }

  /**
   * Enter `block` arriving from the given direction. `isLeft` true means the
   * caret is travelling right→left (ArrowLeft), so it enters at the block's
   * trailing edge; false means left→right, entering at the leading edge.
   *  - void:      near-side gap (gap-before when entering from the left)
   *  - container: near-side gap first (then a subsequent arrow steps inside)
   *  - editable:  text edge
   */
  private _enterBlockFromSide(block: BlockCraft.BlockComponent, isLeft: boolean) {
    if (block.nodeType === BlockNodeType.void || block.nodeType === BlockNodeType.block) {
      this.doc.selection.setGapCursor(block, isLeft ? 'after' : 'before')
    } else if (this.doc.isEditable(block)) {
      this.doc.selection.selectOrSetCursorAtBlock(block, !isLeft)
    } else {
      const editable = searchEditableDescendant(block, !isLeft)
      if (editable) {
        this.doc.selection.selectOrSetCursorAtBlock(editable, !isLeft)
      } else {
        this.doc.selection.setGapCursor(block, isLeft ? 'after' : 'before')
      }
    }
    this.doc.selection.scrollSelectionIntoView()
  }

  /** Left/Right movement when the caret currently sits on a gap point. */
  private _moveFromGap(gapBlock: BlockCraft.BlockComponent, side: 'before' | 'after', isLeft: boolean): true | undefined {
    // Moving toward the block's interior (Right at gap-before / Left at gap-after).
    const movingInward = isLeft ? side === 'after' : side === 'before'

    if (movingInward) {
      if (gapBlock.nodeType === BlockNodeType.void) {
        // Void: step across to the opposite gap side (two-stop block).
        this.doc.selection.setGapCursor(gapBlock, isLeft ? 'before' : 'after')
        this.doc.selection.scrollSelectionIntoView()
        return true
      }
      if (gapBlock.nodeType === BlockNodeType.block) {
        // Container: enter the first/last editable descendant; if none, step to
        // the opposite gap side so the block still has two reachable stops.
        const editable = searchEditableDescendant(gapBlock, !isLeft)
        if (editable) {
          this.doc.selection.selectOrSetCursorAtBlock(editable, !isLeft)
        } else {
          this.doc.selection.setGapCursor(gapBlock, isLeft ? 'before' : 'after')
        }
        this.doc.selection.scrollSelectionIntoView()
        return true
      }
    }

    // Moving away from the block: leave for the adjacent sibling (or exit parent).
    return this._enterSiblingOrExitParent(gapBlock, isLeft)
  }

  /** Up/Down stepping out of a gap caret onto the adjacent sibling. */
  private _stepOutOfGap(gapBlock: BlockCraft.BlockComponent, side: 'before' | 'after', isBack: boolean) {
    // For void/container the two gap stops also act as Up/Down stops: pressing
    // Down at gap-before steps to gap-after within the same block, and vice versa.
    const steppingInward = isBack ? side === 'after' : side === 'before'
    if (steppingInward && (gapBlock.nodeType === BlockNodeType.void || gapBlock.nodeType === BlockNodeType.block)) {
      this.doc.selection.setGapCursor(gapBlock, isBack ? 'before' : 'after')
      this.doc.selection.scrollSelectionIntoView()
      return
    }
    const res = this._enterSiblingOrExitParent(gapBlock, isBack)
    if (!res) {
      // No adjacent target: keep the caret on the current gap stop.
      this.doc.selection.setGapCursor(gapBlock, side)
    }
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
      // Block-level gap caret (leading/trailing block gap span): cross-block
      // arrow navigation is owned by the gap-aware @BindHotKey handlers above,
      // which run first and consume the event. Bail out here so the two paths
      // never fight. Non-block zero-spaces (e.g. inline embed boundaries) still
      // use the native char-step fallback below.
      if (resolveBlockGapSide(activeNode!) !== null) return
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
