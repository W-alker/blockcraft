import {performanceTest} from "../../decorators";
import {EditableBlockComponent} from "../../block";
import {INLINE_ELEMENT_TAG, INLINE_EMBED_GAP_TAG, INLINE_EMBED_NODE_TAG} from "../../inline";
import {BlockCraftError, ErrorCode} from "../../../global";
import {fromEvent, Subject, Subscription} from "rxjs";

interface IInlineRange {
  index: number
  length: number
}

interface IBlockInlineRange extends IInlineRange {
  blockId: string
  block: EditableBlockComponent
}

interface INormalizedRange {
  from: IBlockInlineRange,
  to: IBlockInlineRange | null,
  collapsed: boolean
}

type IBlockInlineRangeJSON = Omit<IBlockInlineRange, 'block'>

interface IBlockCraftSelection {
  from: IBlockInlineRangeJSON,
  to: IBlockInlineRangeJSON | null
  collapsed: boolean
}

export class Selection {
  constructor(private readonly normalizedRange: INormalizedRange) {
  }

  get from() {
    return this.normalizedRange.from
  }

  get to() {
    return this.normalizedRange.to
  }

  get isCollapsed() {
    return this.normalizedRange.collapsed
  }

  get isInSameBlock() {
    return !this.normalizedRange.to
  }

  toJSON(): IBlockCraftSelection {
    return {
      collapsed: this.isCollapsed,
      from: {
        blockId: this.from.blockId,
        index: this.from.index,
        length: this.from.length
      },
      to: this.to ? {
        blockId: this.to.blockId,
        index: this.to.index,
        length: this.to.length
      } : null
    }
  }
}

export class SelectionManager {

  public readonly selectionChange$ = new Subject<Selection | null>()
  private _subscribes: Subscription[] = []

  constructor(public readonly doc: BlockCraft.Doc) {
    this.doc.afterInit(this._bindEvents)
    this.doc.onDestroy(() => {
      this._subscribes.forEach(s => s.unsubscribe())
    })
  }

  private _bindEvents = (root: BlockCraft.IBlockComponents['root']) => {
    this._subscribes.push(fromEvent(document, 'selectionchange').subscribe(() => {
      this.selectionChange$.next(this.getSelection())
    }))
  }

  private _closetBlockId(node: Node) {
    return (node instanceof HTMLElement ? node : node.parentElement)?.closest('[data-block-id]')?.getAttribute('data-block-id')
  }

  private _searchEditableBlockByNode(node: Node) {
    const editableBlockId = this._closetBlockId(node)
    if (!editableBlockId) {
      throw new BlockCraftError(ErrorCode.SyncInputError, 'Cannot find active block id when user input')
    }
    const block = this.doc.getBlockById(editableBlockId)
    if (!block || !(block instanceof EditableBlockComponent)) {
      throw new BlockCraftError(ErrorCode.SyncInputError, 'Fatal active editable block was found when user input')
    }
    return block
  }

  getSelection() {
    const selection = document.getSelection()
    if (!selection || !this.doc.isActive) return null
    return new Selection(this.normalizeRange(selection.getRangeAt(0)))
  }

  @performanceTest()
  normalizeRange(range: StaticRange): INormalizedRange {
    const {startContainer, endContainer, startOffset, endOffset, collapsed} = range
    const startBlock = this._searchEditableBlockByNode(startContainer)

    const getPosition = (block: EditableBlockComponent, node: Node, offset: number) => {

      // if is element
      const isContainer = node === block.hostElement

      const elements = block.hostElement.querySelectorAll(INLINE_ELEMENT_TAG)
      if (elements.length === 0 || (isContainer && offset === 0)) {
        return 0
      }

      const isCElement = !isContainer && (node instanceof HTMLElement && node.localName === INLINE_ELEMENT_TAG)
      const isGap = !isContainer && (node instanceof HTMLElement ? node.localName === INLINE_EMBED_GAP_TAG : node.parentElement!.localName === INLINE_EMBED_GAP_TAG)

      // if first zero text
      if (isGap && (node instanceof HTMLElement ? node.parentElement === block.hostElement : node.parentElement!.parentElement === block.hostElement)) {
        return 0
      }

      const cElement = isContainer ? elements[offset - 1] : (isCElement ? node : node.parentElement!.closest(INLINE_ELEMENT_TAG)!)

      let pos = 0
      for (let i = 0; i < elements.length; i++) {
        const isEmbed = elements[i].firstElementChild!.localName === INLINE_EMBED_NODE_TAG
        if (elements[i] === cElement) {
          return pos + (isGap ? 1 : offset)
        }
        pos += isEmbed ? 1 : elements[i].textContent!.length
      }

      throw new BlockCraftError(ErrorCode.InlineEditorError, 'Fatal range position')
    }

    const startPos = getPosition(startBlock, startContainer, startOffset)
    const from = {
      blockId: startBlock.id,
      block: startBlock,
      length: 0,
      index: startPos
    }

    if (collapsed) {
      return {
        from,
        to: null,
        collapsed: true
      }
    }

    const endBlock = this._searchEditableBlockByNode(endContainer)
    const endPos = getPosition(endBlock, endContainer, endOffset)

    if (endBlock === startBlock) {
      from.length = endPos - startPos
      return {
        from,
        to: null,
        collapsed: false
      }
    }

    from.length = startBlock.textLength - startPos
    return {
      from,
      to: {
        blockId: endBlock.id,
        block: endBlock,
        index: 0,
        length: endPos,
      },
      collapsed: false
    }

  }

}
