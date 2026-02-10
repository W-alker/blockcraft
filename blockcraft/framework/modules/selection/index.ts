import {
  BaseBlockComponent,
  BindHotKey,
  BlockNodeType,
  DocEventRegister,
  EditableBlockComponent,
  EventListen,
  INLINE_ELEMENT_TAG,
  INLINE_END_BREAK_CLASS, STR_LINE_BREAK,
  UIEventStateContext
} from "../../block-std";
import {BlockCraftError, ErrorCode, IS_MAC, performanceTest} from "../../../global";
import {BehaviorSubject, skip, take, takeUntil} from "rxjs";
import {closetBlockId, isZeroSpace} from "../../utils";
import {SelectionSelectedManager} from "./selected-manager";
import {FakeRange, IFakeRangeConfig} from "./createFakeRange";
import {BlockSelection} from "./blockSelection";
import {IBlockInlineRangeJSON, IBlockRange, IBlockSelectionJSON, INormalizedRange} from "./types";

@DocEventRegister
export class SelectionManager {

  public readonly selectionChange$ = new BehaviorSubject<BlockSelection | null>(null)

  // private _stack: (IBlockSelectionJSON | null)[] = []

  private selectedManager = new SelectionSelectedManager(this.doc)

  constructor(public readonly doc: BlockCraft.Doc) {
    this.doc.afterInit(this._bindEvents)
  }

  get value() {
    return this.selectionChange$.value
  }

  // get current() {
  //   return this._stack[this._stack.length - 1]
  // }
  //
  // get previous() {
  //   return this._stack[this._stack.length - 2]
  // }

  blur() {
    document.getSelection()?.removeAllRanges()
  }

  changeObserve() {
    return this.selectionChange$.pipe(takeUntil(this.doc.onDestroy$))
  }

  nextChangeObserve() {
    return this.selectionChange$.pipe(skip(1), take(1), takeUntil(this.doc.onDestroy$))
  }

  /**
   * 一般用于手动触发变化后对下一次的selectionChange变化后触发事件（框架内部事件执行后）
   * @param fn
   */
  afterNextChange(fn: (selection: BlockSelection | null) => void) {
    this.nextChangeObserve().subscribe(v => {
      // nextTick().then(() => {
      fn(v)
      // })
    })
  }

  private _bindEvents = (root: BlockCraft.IBlockComponents['root']) => {

    this.doc.event.customListen(document, 'selectionchange').subscribe(e => {
      if (this.doc.event.status.isComposing) return
      // this.doc.event.run('selectionChange', UIEventStateContext.from(new UIEventState(e), new EventSourceState({
      //   event: e,
      //   sourceType: EventScopeSourceType.Selection
      // })))
      this.recalculate()
    })
  }

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
      this.selectOrSetCursorAtBlock(opBlock, !isBackward)
      this.scrollSelectionIntoView()
      return true
    }

    if (opObj.block.nodeType === BlockNodeType.void) {
      focusSibling()
      return true
    }

    if (opObj.block.nodeType === BlockNodeType.block) {
      const res = focusSibling()
      if (!res) {
        this.setCursorAtBlock(focusBlock, isBackward)
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
      const nodeAndOffset = this.doc.inlineManager.queryNodePositionInlineByOffset(block.containerElement, isStart ? 0 : block.textLength)
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
        // 选中父级, 一定是非editable块
        docSelection.setBaseAndExtent(
          parent.hostElement, isBackward ? 0 : parent.hostElement.childElementCount,
          parent.hostElement, isBackward ? parent.hostElement.childElementCount : 0
        )
      }
      return true
    }

    this.doc.isEditable(opBlock)
      ? extendStartOrEnd(opBlock, isBackward) : docSelection.extend(opBlock.hostElement, isBackward ? 0 : opBlock.hostElement.childElementCount)
    this.scrollSelectionIntoView()
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
      // ctx.preventDefault()
      // docSelection.modify('extend', isBackward ? 'left' : 'right', 'character')
      return true
    }

    const opBlock = isBackward ? this.doc.prevSibling(focusBlockId) : this.doc.nextSibling(focusBlockId)
    if (!opBlock) {
      ctx.preventDefault()
      const parent = this.doc.getBlockById(focusBlockId).parentBlock
      if (parent && parent.nodeType !== BlockNodeType.root) {
        // 选中父级, 一定是非editable块
        docSelection.setBaseAndExtent(
          parent.hostElement, isBackward ? parent.hostElement.childElementCount : 0,
          parent.hostElement, isBackward ? 0 : parent.hostElement.childElementCount
        )
      }
      return true
    }

    ctx.preventDefault()

    const extendStartOrEnd = (block: EditableBlockComponent, isStart: boolean) => {
      const nodeAndOffset = this.doc.inlineManager.queryNodePositionInlineByOffset(block.containerElement, isStart ? 0 : block.textLength)
      docSelection.extend(nodeAndOffset.node, nodeAndOffset.offset)
    }

    this.doc.isEditable(opBlock)
      ? extendStartOrEnd(opBlock, !isBackward) : docSelection.extend(opBlock.hostElement, isBackward ? 0 : opBlock.hostElement.childElementCount)
    this.scrollSelectionIntoView()
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
        this.selectAllChildren(common.parentBlock!)
      } else {
        this.selectAllChildren(common)
        this.doc.messageService.info(`连续按下${IS_MAC ? '⌘' : 'ctrl'} + A以选中全文`)
      }
      return true
    }
    if (selection.from.blockId === common.id && selection.from.block.flavour !== 'root') {
      this.selectAllChildren(common.parentBlock!)
      return true
    }

    this.selectAllChildren(selection.commonParent)
    return true
  }

  @BindHotKey({key: 'Home', shortKey: null})
  handleHome(context: UIEventStateContext) {
    const state = context.get('keyboardState')
    const {selection} = state
    if (!selection.collapsed || selection.from.type !== 'text') return
    context.preventDefault()

    // 如果是plainTextOnly
    if (selection.from.block.plainTextOnly) {
      // 找到前一个\n
      const index = selection.from.block.textContent().slice(0, selection.from.index).lastIndexOf(STR_LINE_BREAK)
      if (index === -1) selection.from.block.setInlineRange(0)
      else selection.from.block.setInlineRange(index + 1)
      return true
    }
    selection.from.block.setInlineRange(0)
    return true
  }

  @BindHotKey({key: 'End', shortKey: null})
  handleEnd(context: UIEventStateContext) {
    const state = context.get('keyboardState')
    const {selection} = state
    if (!selection.collapsed || selection.from.type !== 'text') return
    context.preventDefault()

    // 如果是plainTextOnly
    if (selection.from.block.plainTextOnly) {
      // 找到后一个\n
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
          // the block zero space
          // if (isBlockGapSpace(zero)) {
          //   selection.isCollapsed ? selection.setPosition(zero.closest('[data-block-id]')!, 0) : selection.extend(zero.closest('[data-block-id]')!, 0)
          //   return
          // }
          // inline zero space
          if (selection.anchorOffset > 0) {
            selection.modify(selection.type === 'Range' ? 'extend' : 'move', 'backward', 'character')
            return;
          }
          break
        case 'ArrowRight':
        case 'Delete':
          // the block zero space
          // if (isBlockGapSpace(zero)) {
          //   const blockElement = zero.closest('[data-block-id]')!
          //   selection.isCollapsed ? selection.setPosition(blockElement.lastElementChild, 1) : selection.extend(blockElement.lastElementChild!, 1)
          //   return
          // }
          if (selection.anchorOffset === 0) {
            selection.modify(selection.type === 'Range' ? 'extend' : 'move', 'forward', 'character')
            return;
          }
          break
        case 'ArrowDown':
          // if (isBlockGapSpace(zero)) {
          //   const blockElement = zero.closest('[data-block-id]')!
          //   selection.isCollapsed ? selection.setPosition(blockElement.lastElementChild, 1) : selection.extend(blockElement.lastElementChild!, 1)
          //   return
          // }
          break
        case 'ArrowUp':
          // if (isBlockGapSpace(zero)) {
          //   selection.isCollapsed ? selection.setPosition(zero.closest('[data-block-id]')!, 0) : selection.extend(zero.closest('[data-block-id]')!, 0)
          //   return
          // }
          break
      }
      return
    }

    // if (activeNode instanceof HTMLElement && activeNode.getAttribute('data-block-id')) {
    //   const nodeType = activeNode.getAttribute('data-node-type')
    //   switch (state.raw.key) {
    //     case 'ArrowUp':
    //     case 'Backspace':
    //     case 'ArrowLeft':
    //       if (nodeType === BlockNodeType.editable) {
    //         selection.modify(selection.type === 'Range' ? 'extend' : 'move', 'backward', 'character')
    //       } else {
    //         selection.isCollapsed ? selection.setPosition(activeNode, 0) : selection.extend(activeNode, 0)
    //       }
    //       break
    //     case 'ArrowDown':
    //     case 'ArrowRight':
    //     case 'Delete':
    //       if (nodeType === BlockNodeType.editable) {
    //         selection.modify(selection.type === 'Range' ? 'extend' : 'move', 'forward', 'line')
    //       } else {
    //         selection.isCollapsed ? selection.setPosition(activeNode, activeNode.childElementCount) : selection.extend(activeNode, activeNode.childElementCount)
    //       }
    //       break
    //   }
    // }
  }

  private _searchClosetBlockByNode(node: Node) {
    const id = closetBlockId(node)
    if (!id) {
      throw new BlockCraftError(ErrorCode.SelectionError, `Cannot find active block by node: ${node}`)
    }
    const block = this.doc.getBlockById(id)
    return block as BaseBlockComponent<any>
  }

  private _prevRange: Range | null = null

  /**
   * 对于行内delta操作后，可能需要重新计算当前范围
   * @param execNext 是否立即执行发送事件
   * @param options
   */
  recalculate(execNext = true, options?: { isComposing?: boolean }): {
    value: BlockSelection | null
    next?: () => void
  } {
    const selection = document.getSelection()
    if (!selection || !selection.rangeCount) {
      const next = () => {
        this.selectionChange$.next(null)
        this.selectedManager.setSelected(null)
      }

      execNext && next()
      return {
        value: null,
        next: execNext ? undefined : next
      }
    }

    const range = selection?.getRangeAt(0)
    if (!range ||
      (document.activeElement !== this.doc.root.hostElement && !this.doc.root.hostElement.contains(range.commonAncestorContainer))
    ) {
      const next = () => {
        this.selectionChange$.next(null)
        this.selectedManager.setSelected(null)
      }

      execNext && next()
      return {
        value: null,
        next: execNext ? undefined : next
      }
    }

    // 如果选区在根元素上，则移动选择并重新计算。这种情况多发生于删除选中元素的情况
    if (range.startContainer === this.doc.root.hostElement || range.endContainer === this.doc.root.hostElement) {
      selection.modify('move', range.endOffset >= this.doc.root.childrenLength ? 'backward' : 'forward', 'character')
      return this.recalculate()
    }

    try {
      const _nr = this.normalizeRange(range, options)
      if (_nr.to && _nr.to.block.parentId !== _nr.from.block.parentId) {
        range.collapse()
        return {
          value: null,
          next: () => {
          }
        }
      }

      const r = new BlockSelection(this.doc, _nr, range, selection)
      const next = () => {
        this.selectionChange$.next(r)
        this.selectedManager.setSelected(r)
      }

      execNext && next()
      return {
        value: r,
        next: execNext ? undefined : next
      }
    } catch (e) {
      this.doc.logger.warn('normalizeRangeError: ', e)
      const next = () => {
      }
      execNext && next()
      return {
        value: null,
        next: execNext ? undefined : next
      }
    }
  }

  normalizeRange(range: StaticRange, options?: { isComposing?: boolean }): INormalizedRange {
    const {startContainer, endContainer, startOffset, endOffset, collapsed} = range
    const startBlock = this._searchClosetBlockByNode(startContainer)

    const getInlineOffset = (block: EditableBlockComponent<any>, node: Node, offset: number) => {

      if (node === block.hostElement && block.hostElement !== block.containerElement) {
        return offset > 0 ? block.textLength : 0
      }

      // if is element
      const isContainer = node === block.containerElement

      const elements = block.containerElement.querySelectorAll(INLINE_ELEMENT_TAG)
      if (elements.length === 0 || (isContainer && offset === 0)) {
        return 0
      }

      const isCElement = !isContainer && (node instanceof HTMLElement && node.localName === INLINE_ELEMENT_TAG)
      const zeroNode = isZeroSpace(node)
      const isGap = !isContainer && !!zeroNode

      // if zero text at end
      if (isGap && zeroNode?.parentElement === block.containerElement) {
        return 0
      }

      const cElement = isContainer ? elements[Math.max(0, offset - 2)] : (isCElement ? node : node.parentElement!.closest(INLINE_ELEMENT_TAG)!)

      let pos = 0
      for (let i = 0; i < elements.length; i++) {
        const firstChild = elements[i].firstElementChild
        const isEmbed = !(firstChild instanceof HTMLElement ? firstChild.contentEditable !== 'false' : (options?.isComposing ? firstChild instanceof Text : false))
        const elementLength = isEmbed ? 1 : elements[i].textContent!.length
        if (elements[i] === cElement) {
          return pos + (isGap ? 1 : (isContainer ? elementLength : offset))
        }
        pos += elementLength
      }

      throw new BlockCraftError(ErrorCode.SelectionError, 'Fatal range position')
    }

    const getBlockRange = (block: BaseBlockComponent<any>, node: Node, offset: number): IBlockRange => {
      if (block instanceof EditableBlockComponent) {
        if (node instanceof HTMLElement && node.classList.contains(INLINE_END_BREAK_CLASS)) {
          return {
            blockId: block.id,
            block: block,
            type: 'text',
            index: block.textLength,
            length: 0
          }
        }

        return {
          blockId: block.id,
          block: block,
          type: 'text',
          index: getInlineOffset(block, node, offset),
          length: 0
        }
      }

      // if (offset === 0) {
      //   const prevBlock = this.doc.prevSibling(block) as BaseBlockComponent<any>
      //   if (prevBlock) {
      //     if (prevBlock instanceof EditableBlockComponent) {
      //       return {
      //         blockId: prevBlock.id,
      //         block: prevBlock,
      //         type: 'text',
      //         index: prevBlock.textLength,
      //         length: 0
      //       }
      //     }
      //
      //     return {
      //       blockId: prevBlock.id,
      //       block: prevBlock,
      //       type: 'selected'
      //     }
      //   }
      // }

      return {
        blockId: block.id,
        block: block,
        type: 'selected'
      }
    }

    let from = getBlockRange(startBlock, startContainer, startOffset)

    if (collapsed) {
      return {from, to: null, collapsed: from.type === 'text'}
    }

    let endBlock = startContainer === endContainer ? startBlock : this._searchClosetBlockByNode(endContainer)

    if (startBlock === endBlock && from.type === 'selected') {
      return {from, to: null, collapsed: false}
    }

    let to: any
    if (endContainer instanceof HTMLElement && endContainer.classList.contains('edit-container') && endOffset === 0) {
      const prev = endContainer.closest('[data-node-type="editable"]')?.previousElementSibling
      if (prev && prev instanceof HTMLElement) {
        const id = prev.getAttribute('data-block-id')
        if (id) {
          endBlock = this.doc.getBlockById(id)! as BaseBlockComponent<any>
          if (endBlock.nodeType === 'editable') {
            to = {
              blockId: id,
              block: endBlock,
              type: 'text',
              index: (endBlock as EditableBlockComponent).textLength,
              length: 0
            }
          } else {
            to = {
              blockId: id,
              block: endBlock,
              type: 'selected'
            }
          }
        }
      }
    }
    to ??= getBlockRange(endBlock, endContainer, endOffset)

    if (from.type === 'text') {

      if (endBlock === startBlock && to.type === 'text') {
        from.length = to.index - from.index
        return {from, to: null, collapsed: false}
      }

      from.length = from.block.textLength - from.index
    }

    if (to.type === 'text') {
      to.length = to.index
      to.index = 0
    }

    // 是否不同级（可能是子可编辑元素鼠标选中向外滑动）
    // if (from.block.parentId !== to.block.parentId) {
    // 找到同级
    // const path1 = from.block.getPath()
    // const path2 = to.block.getPath()
    // let i = 0
    // while (path1[i] === path2[i]) i++
    //
    // const path1Ancestor = path1[i]
    // const path2Ancestor = path2[i]
    // if(path1Ancestor !== from.blockId) {
    //   from = {
    //     blockId: path1Ancestor,
    //     // @ts-expect-error
    //     block: this.doc.getBlockById(path1Ancestor),
    //     type: 'selected'
    //   }
    // }
    // if(path2Ancestor !== to.blockId) {
    //   to = {
    //     blockId: path2Ancestor,
    //     // @ts-expect-error
    //     block: this.doc.getBlockById(path2Ancestor),
    //     type: 'selected'
    //   }
    // }
    // }
    return {from, to, collapsed: false}
  }

  private _setRange(from: IBlockInlineRangeJSON, to: IBlockInlineRangeJSON | null = null) {
    const fromBlock = this.doc.getBlockById(from.blockId)
    const range = document.createRange()
    if (from.type === 'text') {
      const startNodePos = this.doc.inlineManager.queryNodePositionInlineByOffset((fromBlock as EditableBlockComponent).containerElement, from.index)
      range.setStart(startNodePos.node, startNodePos.offset)
      if (from.length === 0) {
        range.collapse(true)
        return range
      }

      if (!to) {
        const endNodePos = this.doc.inlineManager.queryNodePositionInlineByOffset((fromBlock as EditableBlockComponent).containerElement, from.index + from.length)
        range.setEnd(endNodePos.node, endNodePos.offset)
        return range
      }
    }

    if (from.type === 'selected') {
      range.setStart(fromBlock.hostElement, 0)
    }

    if (!to) {
      range.collapse(true)
      return range
    }

    const toBlock = this.doc.getBlockById(to.blockId)
    if (to.type === 'text') {
      const endNodePos = this.doc.inlineManager.queryNodePositionInlineByOffset((toBlock as EditableBlockComponent).containerElement, to.index + to.length)
      range.setEnd(endNodePos.node, endNodePos.offset)
      return range
    }

    range.setEnd(toBlock.hostElement, toBlock.hostElement.childElementCount)
    return range
  }

  selectBlock(block: BlockCraft.BlockComponent | string) {
    block = typeof block === 'string' ? this.doc.getBlockById(block) : block

    const selection = document.getSelection()!
    const range = document.createRange()

    if (block.nodeType === 'root') {
      range.setStart(block.firstChildren!.hostElement, 0)
      range.setEnd(block.lastChildren!.hostElement, block.lastChildren!.hostElement.childElementCount)
    } else {
      range.setStart(block.hostElement, 0)
      range.setEnd(block.hostElement, block.hostElement.childElementCount)
    }

    selection.removeAllRanges()
    selection.addRange(range)
  }

  setSelection(...args: Parameters<typeof this._setRange>) {
    const range = this._setRange(...args)
    const selection = document.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
    return range
  }

  /**
   * set cursor at the position of the editable block
   * @param block the block to set cursor at
   * @param index the index of the cursor
   */
  setCursorAt(block: EditableBlockComponent, index: number) {
    const startNodePos = this.doc.inlineManager.queryNodePositionInlineByOffset(block.containerElement, index)
    const selection = document.getSelection()!
    selection.setPosition(startNodePos.node, startNodePos.offset)
  }

  /**
   * 1. If the block is editable, set the cursor at the start or end of the block. \
   * 2. If the block is not editable, select the block.
   * @param block
   * @param atStart
   * @param scrollIntoView
   */
  selectOrSetCursorAtBlock(block: string | BlockCraft.BlockComponent, atStart: boolean, scrollIntoView = true) {
    block = typeof block === 'string' ? this.doc.getBlockById(block) : block
    if (this.doc.isEditable(block)) {
      this.setCursorAt(block, atStart ? 0 : block.textLength)
    } else {
      this.selectBlock(block)
    }
    scrollIntoView && this.scrollSelectionIntoView()
  }

  /**
   * 1. If the block is editable, set the cursor at the start or end of the block. \
   * 2. If the block is void, select the block.\
   * 3. If the block has children, try to find an editable descendant and set the cursor at the start or end of it. If no editable descendant is found, select the block.
   * @param block
   * @param atStart
   * @param scrollIntoView
   */
  setCursorAtBlock(block: string | BlockCraft.BlockComponent, atStart: boolean, scrollIntoView = true) {
    block = typeof block === 'string' ? this.doc.getBlockById(block) : block
    if (this.doc.isEditable(block)) {
      this.setCursorAt(block, atStart ? 0 : block.textLength)
    } else if (block.nodeType === BlockNodeType.void) {
      this.selectBlock(block)
    } else {
      const children = searchEditableDescendant(block, atStart)
      if (!children) this.selectBlock(block)
      else this.selectOrSetCursorAtBlock(children, atStart)
    }
    scrollIntoView && this.scrollSelectionIntoView()
  }

  selectAllChildren(block: string | BlockCraft.BlockComponent) {
    block = typeof block === 'string' ? this.doc.getBlockById(block) : block
    if (this.doc.isEditable(block)) {
      this.setSelection({
        blockId: block.id,
        type: 'text',
        index: 0,
        length: block.textLength
      })
    } else {
      this.selectBlock(block)
    }
  }

  replay(json: IBlockSelectionJSON | null) {
    if (!json) return
    this.setSelection(json.from, json.to)
  }

  createFakeRange(json: Pick<IBlockSelectionJSON, 'from' | 'to'>, config: IFakeRangeConfig = {}) {
    return new FakeRange(this.doc, json, config)
  }

  scrollSelectionIntoView() {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return

    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    if (!rect || rect.height === 0) return

    const container = this.doc.scrollContainer!
    const cRect = container.getBoundingClientRect()
    const padding = 24

    if (rect.bottom > cRect.bottom) {
      container.scrollTop += rect.bottom - cRect.bottom + padding
    } else if (rect.top < cRect.top) {
      container.scrollTop -= cRect.top - rect.top + padding
    }

  }
}

const searchEditableDescendant = (block: BlockCraft.BlockComponent, isStart: boolean): EditableBlockComponent | null => {
  if (block.nodeType === BlockNodeType.editable) return <EditableBlockComponent>block
  const child = isStart ? block.firstChildren : block.lastChildren
  if (!child || child.nodeType === BlockNodeType.void) return null
  return searchEditableDescendant(child, isStart)
}

declare global {
  namespace BlockCraft {
    type Selection = BlockSelection
  }
}

export * from './types'
export * from './createFakeRange'
export * from './blockSelection'
