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
import {IBlockInlineRangeJSON, IBlockRange, IBlockSelectionJSON, INormalizedRange, SelectionKind} from "./types";

type IDomSelectionBoundary = {
  node: Node
  offset: number
}

type INativeSelectionSnapshot = {
  selection: Selection
  range: Range
  anchor: IDomSelectionBoundary
  focus: IDomSelectionBoundary
  start: IDomSelectionBoundary
  end: IDomSelectionBoundary
  collapsed: boolean
}

const compareDomBoundaries = (
  doc: Document,
  left: IDomSelectionBoundary,
  right: IDomSelectionBoundary
) => {
  const leftRange = doc.createRange()
  leftRange.setStart(left.node, left.offset)
  leftRange.collapse(true)

  const rightRange = doc.createRange()
  rightRange.setStart(right.node, right.offset)
  rightRange.collapse(true)

  return leftRange.compareBoundaryPoints(Range.START_TO_START, rightRange)
}

const getNativeSelectionSnapshot = (doc: Document, selection: Selection): INativeSelectionSnapshot | null => {
  if (!selection.anchorNode || !selection.focusNode || selection.rangeCount === 0) return null

  const anchor = {
    node: selection.anchorNode,
    offset: selection.anchorOffset
  }
  const focus = {
    node: selection.focusNode,
    offset: selection.focusOffset
  }
  const isForward = compareDomBoundaries(doc, anchor, focus) <= 0

  return {
    selection,
    range: selection.getRangeAt(0),
    anchor,
    focus,
    start: isForward ? anchor : focus,
    end: isForward ? focus : anchor,
    collapsed: selection.isCollapsed
  }
}

@DocEventRegister
export class SelectionManager {

  public readonly selectionChange$ = new BehaviorSubject<BlockSelection | null>(null)

  // private _stack: (IBlockSelectionJSON | null)[] = []

  private selectedManager = new SelectionSelectedManager(this.doc)
  private _domSelectionSyncSuspended = 0

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

  get isDomSelectionSyncSuspended() {
    return this._domSelectionSyncSuspended > 0
  }

  private _suspendDomSelectionSync<T>(fn: () => T) {
    this._domSelectionSyncSuspended++
    try {
      return fn()
    } finally {
      queueMicrotask(() => {
        this._domSelectionSyncSuspended = Math.max(0, this._domSelectionSyncSuspended - 1)
      })
    }
  }

  private _bindEvents = (root: BlockCraft.IBlockComponents['root']) => {

    this.doc.event.customListen(document, 'selectionchange').subscribe(e => {
      if (this.doc.event.status.isComposing || this.isDomSelectionSyncSuspended) return
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

  @BindHotKey({key: 'Home', shortKey: null, shiftKey: false})
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

  @BindHotKey({key: 'End', shortKey: null, shiftKey: false})
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

  private _createSelectedRange(block: BaseBlockComponent<any>): IBlockRange {
    return {
      blockId: block.id,
      block,
      type: 'selected'
    }
  }

  private _createTextRange(block: EditableBlockComponent<any>, index: number): IBlockRange {
    return {
      blockId: block.id,
      block,
      type: 'text',
      index: Math.max(0, Math.min(index, block.textLength)),
      length: 0
    }
  }

  private _resolveBoundaryForBlock(block: BaseBlockComponent<any>, edge: 'start' | 'end'): IBlockRange {
    if (block instanceof EditableBlockComponent) {
      return this._createTextRange(block, edge === 'start' ? 0 : block.textLength)
    }

    if (block.nodeType !== BlockNodeType.editable) {
      const child = edge === 'start' ? block.firstChildren : block.lastChildren
      if (child) return this._resolveBoundaryForBlock(child, edge)
    }

    return this._createSelectedRange(block)
  }

  private _resolveContainerBoundary(block: BaseBlockComponent<any>, offset: number, edge: 'start' | 'end'): IBlockRange {
    if (block.nodeType === BlockNodeType.editable || block.childrenLength === 0) {
      return this._createSelectedRange(block)
    }

    const children = block.getChildrenBlocks()
    if (edge === 'start') {
      if (offset <= 0) return this._resolveBoundaryForBlock(children[0], 'start')
      if (offset >= children.length) return this._resolveBoundaryForBlock(children.at(-1)!, 'end')
      return this._resolveBoundaryForBlock(children[offset], 'start')
    }

    if (offset <= 0) return this._resolveBoundaryForBlock(children[0], 'start')
    return this._resolveBoundaryForBlock(children[Math.min(children.length - 1, offset - 1)], 'end')
  }

  private _resolveRootBoundary(offset: number, edge: 'start' | 'end') {
    const root = this.doc.root
    if (!root.childrenLength) {
      throw new BlockCraftError(ErrorCode.SelectionError, 'Cannot resolve selection on empty root')
    }
    const children = root.getChildrenBlocks()
    const index = edge === 'start'
      ? Math.min(children.length - 1, Math.max(0, offset))
      : Math.min(children.length - 1, Math.max(0, offset - 1))
    return this._resolveBoundaryForBlock(children[index], edge)
  }

  private _isWholeBlockHostSelection(block: BaseBlockComponent<any>, range: StaticRange) {
    if (block.nodeType === BlockNodeType.root) return false
    return range.startContainer === block.hostElement
      && range.endContainer === block.hostElement
      && range.startOffset === 0
      && range.endOffset === block.hostElement.childNodes.length
  }

  private _compareBlockRange(left: IBlockRange, right: IBlockRange) {
    if (left.block === right.block) {
      if (left.type === 'selected' || right.type === 'selected') return 0
      return left.index - right.index
    }

    return compareDomBoundaries(this.doc.root.hostElement.ownerDocument, {
      node: left.block.hostElement,
      offset: 0
    }, {
      node: right.block.hostElement,
      offset: 0
    })
  }

  private _resolveSelectionKind(from: IBlockRange, to: IBlockRange | null, collapsed: boolean): SelectionKind {
    const boundaryBlocks = [from.block, to?.block].filter(Boolean) as BlockCraft.BlockComponent[]
    const isTableBoundary = boundaryBlocks.length > 0 && boundaryBlocks.every(block => block.flavour === 'table-cell')

    if (isTableBoundary) return 'table'

    if (!to) {
      if (from.type === 'selected') return 'block'
      return 'text'
    }

    if (from.block === to.block && from.type === 'text' && to.type === 'text') {
      return 'text'
    }

    if (from.type === 'selected' && to.type === 'selected') {
      return 'block'
    }

    return collapsed ? 'text' : 'mixed'
  }

  private _getInlineOffset(
    block: EditableBlockComponent<any>,
    node: Node,
    offset: number,
    options?: { isComposing?: boolean }
  ) {
    if (node === block.hostElement && block.hostElement !== block.containerElement) {
      return offset > 0 ? block.textLength : 0
    }

    const isContainer = node === block.containerElement
    const elements = Array.from(block.containerElement.querySelectorAll(INLINE_ELEMENT_TAG)) as HTMLElement[]
    if (elements.length === 0) {
      return 0
    }

    if (isContainer && offset <= 1) {
      return 0
    }

    const zeroNode = isZeroSpace(node)
    if (zeroNode?.parentElement === block.containerElement) {
      return 0
    }

    const cElement = (() => {
      if (isContainer) {
        const index = Math.min(elements.length - 1, Math.max(0, offset - 2))
        return elements[index]
      }

      if (node instanceof HTMLElement && node.localName === INLINE_ELEMENT_TAG) {
        return node
      }

      return node.parentElement?.closest(INLINE_ELEMENT_TAG) as HTMLElement | null
    })()

    if (!cElement) {
      throw new BlockCraftError(ErrorCode.SelectionError, 'Fatal range position')
    }

    const getElementLength = (element: HTMLElement) => {
      const firstNode = element.firstChild
      const isEmbed = firstNode instanceof HTMLElement && firstNode.contentEditable === 'false'
      if (isEmbed) return 1

      if (options?.isComposing && firstNode instanceof Text) {
        return firstNode.length
      }

      return element.textContent?.length ?? 0
    }

    const getNodeOffset = (targetNode: Node, nodeOffset: number, elementLength: number) => {
      if (targetNode instanceof Text) {
        return Math.max(0, Math.min(nodeOffset, targetNode.length))
      }

      if (!(targetNode instanceof HTMLElement)) {
        return Math.max(0, Math.min(nodeOffset, elementLength))
      }

      if (targetNode === cElement) {
        const firstNode = cElement.firstChild
        const isEmbed = firstNode instanceof HTMLElement && firstNode.contentEditable === 'false'
        if (isEmbed) {
          return nodeOffset > 0 ? 1 : 0
        }
      }

      const boundary = Math.max(0, Math.min(nodeOffset, targetNode.childNodes.length))
      let textOffset = 0
      for (let i = 0; i < boundary; i++) {
        const child = targetNode.childNodes[i]
        if (isZeroSpace(child)) continue
        textOffset += child.textContent?.length ?? 0
      }

      return Math.max(0, Math.min(textOffset, elementLength))
    }

    let pos = 0
    for (let i = 0; i < elements.length; i++) {
      const element = elements[i]
      const elementLength = getElementLength(element)
      if (element === cElement) {
        const isGap = isZeroSpace(node) && node.parentElement?.closest(INLINE_ELEMENT_TAG) === cElement
        if (isGap) {
          return pos + 1
        }
        return pos + (isContainer ? elementLength : getNodeOffset(node, offset, elementLength))
      }
      pos += elementLength
    }

    throw new BlockCraftError(ErrorCode.SelectionError, 'Fatal range position')
  }

  private _normalizeBoundary(
    boundary: IDomSelectionBoundary,
    edge: 'start' | 'end',
    options?: { isComposing?: boolean }
  ): IBlockRange {
    const {node, offset} = boundary
    if (node === this.doc.root.hostElement) {
      return this._resolveRootBoundary(offset, edge)
    }

    const block = this._searchClosetBlockByNode(node)
    if (block instanceof EditableBlockComponent) {
      if (edge === 'end' && node instanceof HTMLElement
        && node.classList.contains('edit-container') && offset === 0
      ) {
        const prev = node.closest('[data-node-type="editable"]')?.previousElementSibling
        if (prev instanceof HTMLElement) {
          const id = prev.getAttribute('data-block-id')
          if (id) {
            return this._resolveBoundaryForBlock(this.doc.getBlockById(id) as BaseBlockComponent<any>, 'end')
          }
        }
      }

      if (node instanceof HTMLElement && node.classList.contains(INLINE_END_BREAK_CLASS)) {
        return this._createTextRange(block, block.textLength)
      }

      return this._createTextRange(block, this._getInlineOffset(block, node, offset, options))
    }

    if (node === block.hostElement && block.childrenLength > 0) {
      return this._resolveContainerBoundary(block, offset, edge)
    }

    return this._createSelectedRange(block)
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
    const snapshot = selection ? getNativeSelectionSnapshot(this.doc.root.hostElement.ownerDocument, selection) : null
    const root = this.doc.root.hostElement
    const isInsideRoot = !!snapshot
      && root.contains(snapshot.anchor.node)
      && root.contains(snapshot.focus.node)

    if (!snapshot || !isInsideRoot) {
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

    try {
      const _nr = this.normalizeRange(snapshot.range, options)
      // if (_nr.to && _nr.to.block.parentId !== _nr.from.block.parentId) {
      //   range.collapse()
      //   return {
      //     value: null,
      //     next: () => {
      //     }
      //   }
      // }

      const r = new BlockSelection(this.doc, _nr, snapshot.range, snapshot.selection)
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
    const startBlock = startContainer === this.doc.root.hostElement
      ? null
      : this._searchClosetBlockByNode(startContainer)
    const endBlock = endContainer === this.doc.root.hostElement
      ? null
      : this._searchClosetBlockByNode(endContainer)

    if (!collapsed && startBlock && startBlock === endBlock
      && this._isWholeBlockHostSelection(startBlock, range)
    ) {
      return {
        kind: 'block',
        from: this._createSelectedRange(startBlock),
        to: null,
        collapsed: false
      }
    }

    let from = this._normalizeBoundary({
      node: startContainer,
      offset: startOffset
    }, 'start', options)

    if (collapsed) {
      return {kind: this._resolveSelectionKind(from, null, true), from, to: null, collapsed: from.type === 'text'}
    }

    let to = this._normalizeBoundary({
      node: endContainer,
      offset: endOffset
    }, 'end', options)

    if (this._compareBlockRange(from, to) > 0) {
      [from, to] = [to, from]
    }

    if (from.block === to.block) {
      if (from.type === 'selected' || to.type === 'selected') {
        return {
          kind: this._resolveSelectionKind(this._createSelectedRange(from.block), null, false),
          from: this._createSelectedRange(from.block),
          to: null,
          collapsed: false
        }
      }

      from.length = Math.max(0, to.index - from.index)
      return {kind: this._resolveSelectionKind(from, null, false), from, to: null, collapsed: false}
    }

    if (from.type === 'text') {
      from.length = from.block.textLength - from.index
    }

    if (to.type === 'text') {
      to.length = to.index
      to.index = 0
    }

    return {kind: this._resolveSelectionKind(from, to, false), from, to, collapsed: false}
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

    range.setEnd(toBlock.hostElement, toBlock.hostElement.childNodes.length)
    return range
  }

  selectBlock(block: BlockCraft.BlockComponent | string) {
    block = typeof block === 'string' ? this.doc.getBlockById(block) : block

    const selection = document.getSelection()!
    const range = document.createRange()

    if (block.nodeType === 'root') {
      range.setStart(block.firstChildren!.hostElement, 0)
      range.setEnd(block.lastChildren!.hostElement, block.lastChildren!.hostElement.childNodes.length)
    } else {
      range.setStart(block.hostElement, 0)
      range.setEnd(block.hostElement, block.hostElement.childNodes.length)
    }

    this._suspendDomSelectionSync(() => {
      selection.removeAllRanges()
      selection.addRange(range)
    })
    this.recalculate()
  }

  setSelection(...args: Parameters<typeof this._setRange>) {
    const range = this._setRange(...args)
    const selection = document.getSelection()!
    this._suspendDomSelectionSync(() => {
      selection.removeAllRanges()
      selection.addRange(range)
    })
    this.recalculate()
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
    this._suspendDomSelectionSync(() => {
      selection.setPosition(startNodePos.node, startNodePos.offset)
    })
    this.recalculate()
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

  createFakeRange(json: Pick<IBlockSelectionJSON, 'from' | 'to'> & { selectedBlockIds?: string[] }, config: IFakeRangeConfig = {}) {
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
