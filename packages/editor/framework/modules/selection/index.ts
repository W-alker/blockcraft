import {
  BlockNodeType,
  DocEventRegister,
  EditableBlockComponent,
} from "../../block-std";
import {BehaviorSubject, skip, take, takeUntil} from "rxjs";
import {SelectionSelectedManager} from "./selected-manager";
import {SelectionKeyboard} from "./selection-keyboard";
import {FakeRange, IFakeRangeConfig} from "./createFakeRange";
import {BlockSelection} from "./blockSelection";
import {IBlockInlineRangeJSON, IBlockSelectionJSON, INormalizedRange} from "./types";
import {normalizeRange as _normalizeRange} from "./normalize";

@DocEventRegister
export class SelectionManager {

  public readonly selectionChange$ = new BehaviorSubject<BlockSelection | null>(null)

  private selectedManager = new SelectionSelectedManager(this.doc)
  private _keyboard = new SelectionKeyboard(this.doc)

  constructor(public readonly doc: BlockCraft.Doc) {
    this.doc.afterInit(this._bindEvents)
  }

  get value() {
    return this.selectionChange$.value
  }

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
    this.nextChangeObserve().subscribe(fn)
  }

  private _bindEvents = (root: BlockCraft.IBlockComponents['root']) => {
    this.doc.event.customListen(document, 'selectionchange').subscribe(e => {
      if (this.doc.event.status.isComposing) return
      this.recalculate()
    })
  }

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
    return _normalizeRange(range, id => this.doc.getBlockById(id) as any, options)
  }

  private _setRange(from: IBlockInlineRangeJSON, to: IBlockInlineRangeJSON | null = null) {
    const fromBlock = this.doc.getBlockById(from.blockId)
    const range = document.createRange()
    if (from.type === 'text') {
      const fb = fromBlock as EditableBlockComponent
      const startNodePos = fb.runtime.mapper.modelPointToDomPoint(fb.containerElement, from.index)
      range.setStart(startNodePos.node, startNodePos.offset)
      if (from.length === 0) {
        range.collapse(true)
        return range
      }

      if (!to) {
        const endNodePos = fb.runtime.mapper.modelPointToDomPoint(fb.containerElement, from.index + from.length)
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
      const tb = toBlock as EditableBlockComponent
      const endNodePos = tb.runtime.mapper.modelPointToDomPoint(tb.containerElement, to.index + to.length)
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
    const startNodePos = block.runtime.mapper.modelPointToDomPoint(block.containerElement, index)
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
export {normalizeRange} from './normalize'
