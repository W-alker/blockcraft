import {
  BlockNodeType,
  DocEventRegister,
  EditableBlockComponent,
} from "../../block-std";
import {BehaviorSubject, skip, take, takeUntil} from "rxjs";
import {closetBlockId, isNativeInputTarget} from "../../utils";
import {SelectionSelectedManager} from "./selected-manager";
import {SelectionKeyboard} from "./selection-keyboard";
import {FakeRange, IFakeRangeConfig} from "./createFakeRange";
import {BlockSelection} from "./blockSelection";
import {
  IBlockInlineRangeJSON,
  IBlockSelectionJSON,
  INormalizedRange,
  ISelectionJSON,
  ISelectionPoint,
  ISelectionPointJSON,
} from "./types";
import {normalizeRange as _normalizeRange, INormalizedEndpoints, endpointsToLegacy, lazyPoint as _lazyPoint} from "./normalize";

@DocEventRegister
export class SelectionManager {

  public readonly selectionChange$ = new BehaviorSubject<BlockSelection | null>(null)

  private selectedManager = new SelectionSelectedManager(this.doc)
  private _keyboard = new SelectionKeyboard(this.doc)
  private _suppressRecalculate = false

  constructor(public readonly doc: BlockCraft.Doc) {
    this.doc.afterInit(this._bindEvents)
  }

  get value() {
    return this.selectionChange$.value
  }

  blur() {
    this._applyState(null)
    document.getSelection()?.removeAllRanges()
  }

  changeObserve() {
    return this.selectionChange$.pipe(takeUntil(this.doc.onDestroy$))
  }

  nextChangeObserve() {
    return this.selectionChange$.pipe(skip(1), take(1), takeUntil(this.doc.onDestroy$))
  }

  afterNextChange(fn: (selection: BlockSelection | null) => void) {
    this.nextChangeObserve().subscribe(fn)
  }

  private _bindEvents = (root: BlockCraft.IBlockComponents['root']) => {
    this.doc.event.customListen(document, 'selectionchange').subscribe(e => {
      if (this._suppressRecalculate) return
      if (this.doc.event.status.isComposing) return
      this.recalculate()
    })
    this.doc.event.customListen<FocusEvent>(root.hostElement, 'focusin').subscribe(event => {
      if (!isNativeInputTarget(event.target)) return
      if (this.value) {
        this.blur()
      }
    })
  }

  // ── Read from DOM (user interaction path) ──

  recalculate(execNext = true, options?: { isComposing?: boolean }): {
    value: BlockSelection | null
    next?: () => void
  } {
    const activeElement = document.activeElement
    if (activeElement && this.doc.root.hostElement.contains(activeElement) && isNativeInputTarget(activeElement)) {
      const next = () => this._applyState(null)
      execNext && next()
      return {value: null, next: execNext ? undefined : next}
    }

    const selection = document.getSelection()
    if (!selection || !selection.rangeCount) {
      const next = () => this._applyState(null)
      execNext && next()
      return {value: null, next: execNext ? undefined : next}
    }

    const range = selection?.getRangeAt(0)
    if (!range ||
      (document.activeElement !== this.doc.root.hostElement && !this.doc.root.hostElement.contains(range.commonAncestorContainer))
    ) {
      const next = () => this._applyState(null)
      execNext && next()
      return {value: null, next: execNext ? undefined : next}
    }

    if (range.startContainer === this.doc.root.hostElement || range.endContainer === this.doc.root.hostElement) {
      selection.modify('move', range.endOffset >= this.doc.root.childrenLength ? 'backward' : 'forward', 'character')
      return this.recalculate()
    }

    try {
      // normalizeRange returns {start, end} in document order.
      // Determine real anchor/head from native Selection direction.
      const endpoints = this._normalizeRange(range, options)
      const isBackward = isSelectionBackward(selection)
      const anchor = isBackward ? endpoints.end : endpoints.start
      const head = isBackward ? endpoints.start : endpoints.end

      // Cross-parent constraint (kept for now)
      if (anchor.blockId !== head.blockId) {
        const anchorParent = anchor.block.parentId
        const headParent = head.block.parentId
        if (anchorParent !== headParent) {
          range.collapse()
          return {value: null, next: () => {}}
        }
      }

      const commonParent = anchor.blockId !== head.blockId
        ? closetBlockId(range.commonAncestorContainer)!
        : anchor.blockId

      const r = this._createBlockSelection(anchor, head, commonParent)
      const next = () => this._applyState(r)
      execNext && next()
      return {value: r, next: execNext ? undefined : next}
    } catch (e) {
      this.doc.logger.warn('normalizeRangeError: ', e)
      const next = () => {}
      execNext && next()
      return {value: null, next: execNext ? undefined : next}
    }
  }

  /**
   * Public API returns legacy INormalizedRange for backward compat.
   * Internally use _normalizeRange() for new anchor/head format.
   */
  normalizeRange(range: StaticRange, options?: { isComposing?: boolean }): INormalizedRange {
    return endpointsToLegacy(this._normalizeRange(range, options))
  }

  private _normalizeRange(range: StaticRange, options?: { isComposing?: boolean }): INormalizedEndpoints {
    return _normalizeRange(range, id => this.doc.getBlockById(id) as any, options)
  }

  // ── Model state management ──

  private _applyState(sel: BlockSelection | null) {
    this.selectionChange$.next(sel)
    this.selectedManager.setSelected(sel)
  }

  private _createBlockSelection(anchor: ISelectionPoint, head: ISelectionPoint, commonParent: string): BlockSelection {
    return new BlockSelection(
      anchor, head, commonParent,
      id => this.doc.getBlockById(id) as any,
      (a, b) => this.doc.compareBlockPosition(a, b),
    )
  }

  // ── DOM Range construction ──

  /**
   * Build a DOM Range from model selection points.
   * Works with both new ISelectionPointJSON and legacy IBlockInlineRangeJSON.
   */
  private _buildDomRange(startPoint: any, endPoint?: any | null): Range {
    const range = document.createRange()
    const fromBlock = this.doc.getBlockById(startPoint.blockId)

    if (startPoint.type === 'text') {
      const fb = fromBlock as EditableBlockComponent
      const startOffset = startPoint.offset ?? startPoint.index ?? 0
      const startNodePos = fb.runtime.mapper.modelPointToDomPoint(fb.containerElement, startOffset)
      range.setStart(startNodePos.node, startNodePos.offset)

      // Collapsed or single-block range
      if (!endPoint || (endPoint.blockId === startPoint.blockId && endPoint.type === 'text')) {
        const endOffset = endPoint
          ? (endPoint.offset ?? (endPoint.index != null ? endPoint.index + (endPoint.length ?? 0) : startOffset))
          : (startPoint.length ? startOffset + startPoint.length : startOffset)
        if (endOffset === startOffset) {
          range.collapse(true)
          return range
        }
        const endNodePos = fb.runtime.mapper.modelPointToDomPoint(fb.containerElement, endOffset)
        range.setEnd(endNodePos.node, endNodePos.offset)
        return range
      }
    }

    if (startPoint.type === 'selected') {
      range.setStart(fromBlock.hostElement, 0)
    }

    if (!endPoint) {
      range.collapse(true)
      return range
    }

    const toBlock = this.doc.getBlockById(endPoint.blockId)
    if (endPoint.type === 'text') {
      const tb = toBlock as EditableBlockComponent
      const endOffset = endPoint.offset ?? ((endPoint.index ?? 0) + (endPoint.length ?? 0))
      const endNodePos = tb.runtime.mapper.modelPointToDomPoint(tb.containerElement, endOffset)
      range.setEnd(endNodePos.node, endNodePos.offset)
      return range
    }

    range.setEnd(toBlock.hostElement, toBlock.hostElement.childElementCount)
    return range
  }

  // ── Public API: programmatic selection ──

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

  /** @deprecated Use setSelection with ISelectionPointJSON */
  setSelection(from: IBlockInlineRangeJSON, to?: IBlockInlineRangeJSON | null): Range
  setSelection(from: ISelectionPoint, to?: ISelectionPoint | null): Range
  setSelection(from: any, to?: any): Range {
    const range = this._buildDomRange(from, to)
    const selection = document.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
    return range
  }

  setCursorAt(block: EditableBlockComponent, index: number) {
    const startNodePos = block.runtime.mapper.modelPointToDomPoint(block.containerElement, index)
    const selection = document.getSelection()!
    selection.setPosition(startNodePos.node, startNodePos.offset)
  }

  extendTo(block: EditableBlockComponent, index: number) {
    const pos = block.runtime.mapper.modelPointToDomPoint(block.containerElement, index)
    document.getSelection()?.extend(pos.node, pos.offset)
  }

  selectOrSetCursorAtBlock(block: string | BlockCraft.BlockComponent, atStart: boolean, scrollIntoView = true) {
    block = typeof block === 'string' ? this.doc.getBlockById(block) : block
    if (this.doc.isEditable(block)) {
      this.setCursorAt(block, atStart ? 0 : block.textLength)
    } else {
      this.selectBlock(block)
    }
    scrollIntoView && this.scrollSelectionIntoView()
  }

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

  /** @deprecated Use replay with ISelectionJSON */
  replay(json: IBlockSelectionJSON | ISelectionJSON | null) {
    if (!json) return
    if ('anchor' in json) {
      // New format
      const range = this._buildDomRange(json.anchor, json.head)
      const selection = document.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)
    } else {
      // Legacy format
      this.setSelection(json.from, json.to)
    }
  }

  createFakeRange(source: Pick<IBlockSelectionJSON, 'from' | 'to'> | BlockSelection | ISelectionJSON, config: IFakeRangeConfig = {}) {
    if (source instanceof BlockSelection) {
      return new FakeRange(this.doc, source, config)
    }
    if ('anchor' in source) {
      // ISelectionJSON → build a BlockSelection
      const sel = this._createBlockSelection(
        _lazyPoint(source.anchor, id => this.doc.getBlockById(id) as any),
        _lazyPoint(source.head, id => this.doc.getBlockById(id) as any),
        source.commonParent
      )
      return new FakeRange(this.doc, sel, config)
    }
    return new FakeRange(this.doc, source, config)
  }

  // ── Geometry queries ──

  private _rangeFromModel(): Range | null {
    const sel = this.value
    if (!sel) return null
    try {
      return this._buildDomRange(pointToLegacy(sel.start), pointToLegacy(sel.end))
    } catch {
      return null
    }
  }

  getSelectionRect(): DOMRect | null {
    const range = this._rangeFromModel()
    if (!range) return null
    return range.getBoundingClientRect()
  }

  getSelectionRects(): DOMRectList | null {
    const range = this._rangeFromModel()
    if (!range) return null
    return range.getClientRects()
  }

  getSelectedText(): string {
    const sel = this.value
    if (!sel) return ''
    const s = sel.start, e = sel.end
    const startBlock = sel.firstBlock, endBlock = sel.lastBlock

    if (sel.isInSameBlock) {
      if (s.type !== 'text') return startBlock.textContent()
      const eOff = e.type === 'text' ? e.offset : (startBlock as any).textLength
      return startBlock.textContent().slice(s.offset, eOff)
    }

    let text = s.type === 'text'
      ? startBlock.textContent().slice(s.offset)
      : startBlock.textContent()
    const betweenBlocks = this.doc.queryBlocksBetween(startBlock, endBlock)
    for (const bid of betweenBlocks) {
      text += '\n' + this.doc.getBlockById(bid).textContent()
    }
    if (e.type === 'text') {
      text += '\n' + endBlock.textContent().slice(0, e.offset)
    } else {
      text += '\n' + endBlock.textContent()
    }
    return text
  }

  scrollSelectionIntoView() {
    const rect = this.getSelectionRect()
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

/**
 * Detect if the native Selection is backward (user dragged right-to-left or bottom-to-top).
 * Range.start is always document-order first, but Selection.anchor may be after focus.
 */
function isSelectionBackward(sel: globalThis.Selection): boolean {
  if (sel.isCollapsed || !sel.anchorNode || !sel.focusNode) return false
  if (sel.anchorNode === sel.focusNode) {
    return sel.anchorOffset > sel.focusOffset
  }
  const cmp = sel.anchorNode.compareDocumentPosition(sel.focusNode)
  return !!(cmp & Node.DOCUMENT_POSITION_PRECEDING)
}

/** Convert new ISelectionPoint to legacy-compatible shape for _buildDomRange */
function pointToLegacy(p: ISelectionPoint): any {
  if (p.type === 'text') {
    return {blockId: p.blockId, type: 'text', offset: p.offset, index: p.offset, length: 0}
  }
  return {blockId: p.blockId, type: 'selected'}
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
export {normalizeRange} from './normalize'
export type {INormalizedEndpoints} from './normalize'
