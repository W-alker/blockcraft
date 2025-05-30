import {
  BaseBlockComponent,
  EditableBlockComponent,
  BlockNodeType,
  UIEventStateContext,
  BindHotKey,
  DocEventRegister,
  EventListen,
  INLINE_ELEMENT_TAG, INLINE_END_BREAK_CLASS
} from "../../block-std";
import {BlockCraftError, ErrorCode, nextTick, performanceTest} from "../../../global";
import {BehaviorSubject, skip, take, takeUntil} from "rxjs";
import {closetBlockId, isZeroSpace} from "../../utils";
import {SelectionSelectedManager} from "./selected-manager";
import {FakeRange, IFakeRangeConfig} from "./createFakeRange";

export interface IInlineRange {
  index: number
  length: number
}

/**
 * {@link IBlockTextRange} 的 JSON 格式\
 * {@link IBlockSelectedRange} 的 JSON 格式
 */
export type IBlockRange = IBlockTextRange | IBlockSelectedRange

export interface IBlockTextRange extends IInlineRange {
  block: EditableBlockComponent<any>
  blockId: string
  type: 'text'
}

export interface IBlockSelectedRange {
  block: BaseBlockComponent<any>
  blockId: string
  type: 'selected'
}

export interface INormalizedRange {
  from: IBlockRange,
  to: IBlockRange | null,
  collapsed: boolean
}

export type IBlockInlineRangeJSON = {
  index: number,
  length: number,
  blockId: string,
  type: 'text'
} | {
  blockId: string,
  type: 'selected'
}

export interface IBlockSelectionJSON {
  from: IBlockInlineRangeJSON,
  to: IBlockInlineRangeJSON | null
  collapsed: boolean
  commonParent: string
}

export class BlockSelection implements INormalizedRange {

  constructor(private _doc: BlockCraft.Doc,
              private readonly normalizedRange: INormalizedRange,
              readonly raw: Range,
              private selection: Selection) {
    this._commonParent = this.isInSameBlock ? this.from.blockId : closetBlockId(raw.commonAncestorContainer)!
  }

  private readonly _commonParent: string

  get commonParent() {
    return this._commonParent
  }

  get from() {
    return this.normalizedRange.from
  }

  get to() {
    return this.normalizedRange.to
  }

  get firstBlock() {
    return this.from.block
  }

  get lastBlock() {
    return this.to?.block || this.from.block
  }

  get collapsed() {
    return this.normalizedRange.collapsed
  }

  get isInSameBlock() {
    return !this.to
  }

  get isStartOfBlock() {
    return this.from.type === 'selected' ? true : this.from.index === 0
  }

  get isAllSelected() {
    return this.from.type === 'selected' ? (this.to ? this.to.type === 'selected' : true) : false
  }

  get isEndOfBlock() {
    if (this.to) {
      return this.to.type === 'selected' ? true : (this.to.index + this.to.length) >= this.to.block.textLength
    }
    return this.from.type === 'text' ? (this.from.index + this.from.length) === this.from.block.textLength : true
  }

  getDirection() {
    if (this.selection.anchorNode === this.selection.focusNode) {
      return this.raw.startOffset < this.raw.endOffset ? 'forward' : 'backward'
    }
    const position = this.selection.anchorNode!.compareDocumentPosition(this.selection.focusNode!)
    return position === Node.DOCUMENT_POSITION_PRECEDING ? 'backward' : 'forward'
  }

  toJSON(): IBlockSelectionJSON {
    return JSON.parse(JSON.stringify({
      from: {
        ...this.from,
        block: undefined
      },
      to: this.to ? {
        ...this.to,
        block: undefined
      } : null,
      collapsed: this.collapsed,
      commonParent: this.commonParent
    }))
  }
}

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
      nextTick().then(() => {
        fn(v)
      })
    })
  }

  // private _stopCalculate = false
  private _bindEvents = (root: BlockCraft.IBlockComponents['root']) => {
    // this.doc.event.customListen(document, 'selectstart').subscribe(e => {
    //   this._stopCalculate = true
    //   this.recalculate()
    // })
    //
    // this.doc.event.customListen<PointerEvent>(document, 'pointerup').subscribe(e => {
    //   if (e.pointerType === 'mouse' && this._stopCalculate) {
    //     this._stopCalculate = false
    //     this.recalculate()
    //   }
    // })

    // this.doc.event.customListen(this.doc.root.hostElement, 'blur').subscribe(() => {
    //   this._stopCalculate = false
    //   this.recalculate()
    // })

    this.doc.event.customListen(document, 'selectionchange').subscribe(() => {
      if (
        // this._stopCalculate ||
        this.doc.event.isComposing) return
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
      opBlock.hostElement.scrollIntoView({block: 'nearest', behavior: 'smooth'})
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
    opBlock.hostElement.scrollIntoView({block: 'nearest', behavior: 'smooth'})
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
      // 解除第一次多选时的selectstart导致的副作用
      // nextTick().then(() => {
      //   this._stopCalculate = false
      // })
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
    opBlock.hostElement.scrollIntoView({block: 'nearest', behavior: 'smooth'})
    return true
  }

  @BindHotKey({key: ['a', 'A'], shortKey: true})
  handleCtrlA(context: UIEventStateContext) {
    const state = context.get('keyboardState')
    const {raw: evt, selection} = state
    evt.preventDefault()
    const common = this.doc.getBlockById(selection.commonParent)
    if (this.doc.isEditable(common)) {
      if (selection.from.type !== 'text') return
      if (selection.from.index === 0 && selection.from.length === common.textLength) {
        this.doc.selection.selectAllChildren(common.parentBlock!)
      } else {
        this.doc.selection.selectAllChildren(common)
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

  /**
   * 对于行内delta操作后，可能需要重新计算当前范围
   */
  recalculate() {
    const selection = document.getSelection()
    if (!selection || !selection.rangeCount) {
      this.selectionChange$.next(null)
      this.selectedManager.setSelected(null)
      return
    }

    const range = selection.getRangeAt(0)
    if (document.activeElement !== this.doc.root.hostElement && !this.doc.root.hostElement.contains(range.commonAncestorContainer)) {
      this.selectionChange$.next(null)
      this.selectedManager.setSelected(null)
      return
    }

    if (range.startContainer === this.doc.root.hostElement || range.endContainer === this.doc.root.hostElement) {
      this.selectionChange$.next(null)
      this.selectedManager.setSelected(null)
      return
    }

    try {
      const r = new BlockSelection(this.doc, this.normalizeRange(range), range, selection)
      this.selectionChange$.next(r)
      this.selectedManager.setSelected(this.value)
    } catch (e) {
      this.doc.logger.warn('normalizeRangeError: ', e)
    }

  }

  normalizeRange(range: StaticRange): INormalizedRange {
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
      if (isGap && zeroNode.parentElement === block.containerElement) {
        return 0
      }

      const cElement = isContainer ? elements[Math.max(0, offset - 2)] : (isCElement ? node : node.parentElement!.closest(INLINE_ELEMENT_TAG)!)

      let pos = 0
      for (let i = 0; i < elements.length; i++) {
        const isEmbed = !(elements[i].firstElementChild as HTMLElement).isContentEditable
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

    const from = getBlockRange(startBlock, startContainer, startOffset)

    if (collapsed) {
      return {from, to: null, collapsed: from.type === 'text'}
    }

    const endBlock = this._searchClosetBlockByNode(endContainer)

    if (startBlock === endBlock && from.type === 'selected') {
      return {from, to: null, collapsed: false}
    }

    const to = getBlockRange(endBlock, endContainer, endOffset)

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
   */
  selectOrSetCursorAtBlock(block: string | BlockCraft.BlockComponent, atStart: boolean) {
    block = typeof block === 'string' ? this.doc.getBlockById(block) : block
    if (this.doc.isEditable(block)) {
      this.setCursorAt(block, atStart ? 0 : block.textLength)
      return
    }
    this.selectBlock(block)
    block.hostElement.scrollIntoView({behavior: 'smooth', block: 'nearest'})
  }

  /**
   * 1. If the block is editable, set the cursor at the start or end of the block. \
   * 2. If the block is void, select the block.\
   * 3. If the block has children, try to find an editable descendant and set the cursor at the start or end of it. If no editable descendant is found, select the block.
   * @param block
   * @param atStart
   */
  setCursorAtBlock(block: string | BlockCraft.BlockComponent, atStart: boolean) {
    block = typeof block === 'string' ? this.doc.getBlockById(block) : block
    if (this.doc.isEditable(block)) {
      this.setCursorAt(block, atStart ? 0 : block.textLength)
      return
    }

    if (block.nodeType === BlockNodeType.void) {
      this.selectBlock(block)
      return
    }

    const searchEditableDescendant = (block: BlockCraft.BlockComponent, isStart: boolean): EditableBlockComponent | null => {
      if (this.doc.isEditable(block)) return block
      const child = atStart ? block.firstChildren : block.lastChildren
      if (!child || child.nodeType === BlockNodeType.void) return null
      return searchEditableDescendant(child, isStart)
    }

    const children = searchEditableDescendant(block, atStart)
    if (!children) {
      this.selectBlock(block)
      return
    }
    this.selectOrSetCursorAtBlock(children, atStart)
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

  toString(selection: BlockCraft.Selection) {
    let text = ''
    if (selection.collapsed) return text
    if (selection.from.type === 'text') {
      text = selection.from.block.textContent().slice(selection.from.index, selection.from.index + selection.from.length)
    }
    if (!selection.to) {
      return text
    }

    const between = this.doc.queryBlocksBetween(selection.from.block, selection.to.block)
    between.forEach(block => {
      text += this.doc.getBlockById(block).textContent()
    })
    if (selection.to.type === 'text') {
      text += selection.to.block.textContent().slice(0, selection.to.index)
    }
    return text
  }

  @performanceTest()
  createFakeRange(json: IBlockSelectionJSON, config: IFakeRangeConfig = {}) {
    return new FakeRange(this.doc, json, config)
  }

}

declare global {
  namespace BlockCraft {
    type Selection = BlockSelection
  }
}

export * from './createFakeRange'
