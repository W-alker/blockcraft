import {BaseBlockComponent, EditableBlockComponent} from "../../block";
import {INLINE_ELEMENT_TAG} from "../../inline";
import {BlockCraftError, ErrorCode} from "../../../global";
import {BehaviorSubject, fromEvent, takeUntil} from "rxjs";
import {BlockNodeType} from "../../types";
import {isBlockGapSpace, isZeroSpace} from "../../utils";
import {KeyboardEventState} from "../../event";

export interface IInlineRange {
  index: number
  length: number
}

export type IBlockRange = ({
  block: EditableBlockComponent<any>
  blockId: string
  type: 'text'
} & IInlineRange) | {
  block: BaseBlockComponent<any>
  blockId: string
  type: 'selected'
}

export interface INormalizedRange {
  from: IBlockRange,
  to: IBlockRange | null,
  collapsed: boolean
}

type IBlockInlineRangeJSON = {
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
}

export class BlockSelection implements INormalizedRange {

  constructor(private readonly normalizedRange: INormalizedRange,
              readonly raw: AbstractRange) {
  }

  get from() {
    return this.normalizedRange.from
  }

  get to() {
    return this.normalizedRange.to
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
      collapsed: this.collapsed
    }))
  }

}

export class SelectionManager {

  public readonly selectionChange$ = new BehaviorSubject<BlockSelection | null>(null)

  private _stack: (IBlockSelectionJSON | null)[] = []

  constructor(public readonly doc: BlockCraft.Doc) {
    this.doc.afterInit(this._bindEvents)
  }

  get value() {
    return this.selectionChange$.value
  }

  private _bindEvents = (root: BlockCraft.IBlockComponents['root']) => {
    fromEvent(document, 'selectionchange').pipe(takeUntil(root.onDestroy$)).subscribe(() => {
      const selection = document.getSelection()
      if (!selection || !this.doc.isActive) {
        this.selectionChange$.next(null)
        return
      }
      const range = selection.getRangeAt(0)
      if (range.startContainer instanceof HTMLElement && range.startContainer.getAttribute('data-node-type') === BlockNodeType.root) {
        selection.modify('move', 'backward', 'character')
        return
      }
      const r = new BlockSelection(this.normalizeRange(range), range)
      this.selectionChange$.next(r)
      this._stack.push(r ? r.toJSON() : null)
      this._setSelected()
    })

    this.doc.event.add('keyDown', context => {
      const state = context.get('keyboardState')
      if (state.composing) return
      this._handlerNoEditable(state)
    })
  }

  private _handlerNoEditable(state: KeyboardEventState) {
    const selection = document.getSelection()!
    const activeNode = selection.focusNode
    const zero = isZeroSpace(activeNode!)
    if (zero) {
      switch (state.raw.key) {
        case 'Backspace':
        case 'ArrowLeft':
          // the block zero space
          if (isBlockGapSpace(zero)) {
            selection.isCollapsed ? selection.setPosition(zero.closest('[data-block-id]')!, 0) : selection.extend(zero.closest('[data-block-id]')!, 0)
            return
          }
          // inline zero space
          if (selection.anchorOffset > 0) {
            selection.modify(selection.type === 'Range' ? 'extend' : 'move', 'backward', 'character')
            return;
          }
          break
        case 'ArrowRight':
        case 'Delete':
          // the block zero space
          if (isBlockGapSpace(zero)) {
            const blockElement = zero.closest('[data-block-id]')!
            selection.isCollapsed ? selection.setPosition(blockElement.lastElementChild, 1) : selection.extend(blockElement.lastElementChild!, 1)
            return
          }
          if (selection.anchorOffset === 0) {
            selection.modify(selection.type === 'Range' ? 'extend' : 'move', 'forward', 'character')
            return;
          }
          break
        case 'ArrowDown':
          if (isBlockGapSpace(zero)) {
            selection.modify(selection.type === 'Range' ? 'extend' : 'move', 'forward', 'line')
            return
          }
          break
        case 'ArrowUp':
          if (isBlockGapSpace(zero)) {
            selection.modify(selection.type === 'Range' ? 'extend' : 'move', 'backward', 'line')
            return
          }
          break
      }
      return
    }

    if (activeNode instanceof HTMLElement && activeNode.getAttribute('data-block-id')) {
      const nodeType = activeNode.getAttribute('data-node-type')
      switch (state.raw.key) {
        case 'Backspace':
        case 'ArrowLeft':
          if (nodeType === BlockNodeType.editable) {
            selection.modify(selection.type === 'Range' ? 'extend' : 'move', 'backward', 'character')
          } else {
            selection.isCollapsed ? selection.setPosition(activeNode, 0) : selection.extend(activeNode, 0)
          }
          break
        case 'ArrowRight':
        case 'Delete':
          if (nodeType === BlockNodeType.editable) {
            selection.modify(selection.type === 'Range' ? 'extend' : 'move', 'forward', 'character')
          } else {
            selection.isCollapsed ? selection.setPosition(activeNode, activeNode.childElementCount) : selection.extend(activeNode, activeNode.childElementCount)
          }
          break
        // case 'ArrowDown':
        //   if (nodeType === BlockNodeType.editable) {
        //     selection.modify(selection.type === 'Range' ? 'extend' : 'move', 'forward', 'line')
        //   } else {
        //     selection.modify(selection.type === 'Range' ? 'extend' : 'move', 'forward', 'line')
        //   }
        //   break
        // case 'ArrowUp':
        //   if (nodeType === BlockNodeType.editable) {
        //     selection.modify(selection.type === 'Range' ? 'extend' : 'move', 'backward', 'line')
        //   } else {
        //     selection.modify(selection.type === 'Range' ? 'extend' : 'move', 'backward', 'line')
        //   }
        //   break
      }
    }
  }

  private _selectedSet = new Set<BaseBlockComponent<any>>()

  private _setSelectedClass(block: BaseBlockComponent<any>) {
    block.hostElement.classList.add('selected')
    this._selectedSet.add(block)
  }

  private _setSelected() {
    this._selectedSet.forEach(v => {
      v.hostElement.classList.remove('selected')
    })
    this._selectedSet.clear()
    if (!this.value) return;

    const {from, to} = this.value!

    from.type === 'selected' && this._setSelectedClass(from.block)

    if (!to) return;
    to.type === 'selected' && this._setSelectedClass(to.block)

    const between = this.doc.queryBlocksBetween(from.block, to.block)
    if (!between?.length) return
    between.forEach(v => {
      const b = this.doc.getBlockById(v)
      if (b.nodeType !== BlockNodeType.editable) {
        this._setSelectedClass(b as any)
      }
    })

  }

  private _searchClosetBlockByNode(node: Node) {
    const editableBlockId = this.doc.closetBlockId(node)
    if (!editableBlockId) {
      throw new BlockCraftError(ErrorCode.SyncInputError, 'Cannot find active block id when user input')
    }
    const block = this.doc.getBlockById(editableBlockId)
    if (!block) {
      throw new BlockCraftError(ErrorCode.SyncInputError, 'Fatal active editable block was found when user input')
    }
    return block as BaseBlockComponent<any>
  }

  transformBy(range: StaticRange): BlockSelection {
    return new BlockSelection(this.normalizeRange(range), range)
  }

  modify(alter: 'move' | 'extend', direction: 'forward' | 'backward', granularity: 'character' | 'block') {
    const curSelection = this.value
    if (!curSelection) return
    const {from, to} = curSelection
    const range = document.getSelection()!.getRangeAt(0)

    const setBefore = (block: BlockCraft.BlockComponent) => {
      if (block instanceof EditableBlockComponent) {
        range.setStart(block.hostElement.firstElementChild!.firstChild!, 0)
      } else {
        range.setStart(block.hostElement, 0)
      }
    }

    const setAfter = (block: BlockCraft.BlockComponent) => {
      if (block instanceof EditableBlockComponent) {
        range.setEndAfter(block.hostElement.lastElementChild!)
      } else {
        range.setEnd(block.hostElement, 1)
      }
    }

    if (granularity === 'block') {

      if (direction === 'forward') {

        const end = to ?? from

        const nextBlock = this.doc.nextSibling(end.block)
        // if next block is null, set after parent
        if (!nextBlock) {
          const parent = end.block.parentBlock
          if (!parent || parent?.nodeType === BlockNodeType.root) return
          setAfter(parent)
        } else {
          setAfter(nextBlock)
        }

        if (alter === 'move') range.collapse(false)

      }

    }
  }

  normalizeRange(range: StaticRange): INormalizedRange {
    const {startContainer, endContainer, startOffset, endOffset, collapsed} = range
    const startBlock = this._searchClosetBlockByNode(startContainer)

    const getInlineOffset = (block: EditableBlockComponent<any>, node: Node, offset: number) => {

      const isHost = node === block.hostElement
      if (isHost) {
        const pos = block.containerElement.compareDocumentPosition(block.hostElement.children[0])
        return pos === Node.DOCUMENT_POSITION_FOLLOWING ? 0 : block.textLength
      }

      // if is element
      const isContainer = node === block.containerElement

      const elements = block.containerElement.querySelectorAll(INLINE_ELEMENT_TAG)
      if (elements.length === 0 || (isContainer && offset === 0)) {
        return 0
      }

      const isCElement = !isContainer && (node instanceof HTMLElement && node.localName === INLINE_ELEMENT_TAG)
      const isGap = !isContainer && isZeroSpace(node)

      // if first zero text
      if (isGap && (node instanceof HTMLElement ? node.parentElement === block.containerElement : node.parentElement!.parentElement === block.containerElement)) {
        return 0
      }

      const cElement = isContainer ? elements[Math.max(0, offset - 2)] : (isCElement ? node : node.parentElement!.closest(INLINE_ELEMENT_TAG)!)

      let pos = 0
      for (let i = 0; i < elements.length; i++) {
        const isEmbed = !(elements[i] as HTMLElement).isContentEditable
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
        return {
          blockId: block.id,
          block: block,
          type: 'text',
          index: getInlineOffset(block, node, offset),
          length: 0
        }
      } else {
        return {
          blockId: block.id,
          block: block,
          type: 'selected'
        }
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

  selectBlock(block: BlockCraft.BlockComponent) {
    const selection = document.getSelection()!
    const range = document.createRange()
    range.setStart(block.hostElement, 0)
    // range.collapse(true)
    range.setEnd(block.hostElement, block.hostElement.childElementCount)
    selection.removeAllRanges()
    selection.addRange(range)
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

  setSelection(...args: Parameters<typeof this._setRange>) {
    const range = this._setRange(...args)
    const selection = document.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
  }

  replay(json: IBlockSelectionJSON) {
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

  toJSON(selection: BlockCraft.Selection) {
  }

}

declare global {
  namespace BlockCraft {
    type Selection = BlockSelection
  }
}
