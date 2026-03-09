import {getCommonPath} from "../../utils";
import {IBlockSelectionJSON, INormalizedRange} from "./types";

const compareDomBoundaries = (
  doc: Document,
  left: { node: Node, offset: number },
  right: { node: Node, offset: number }
) => {
  const leftRange = doc.createRange()
  leftRange.setStart(left.node, left.offset)
  leftRange.collapse(true)

  const rightRange = doc.createRange()
  rightRange.setStart(right.node, right.offset)
  rightRange.collapse(true)

  return leftRange.compareBoundaryPoints(Range.START_TO_START, rightRange)
}

const getNativeSelectionDirection = (doc: Document, selection: Selection) => {
  if (!selection.anchorNode || !selection.focusNode) return 'forward' as const
  return compareDomBoundaries(doc, {
    node: selection.anchorNode,
    offset: selection.anchorOffset
  }, {
    node: selection.focusNode,
    offset: selection.focusOffset
  }) <= 0 ? 'forward' : 'backward'
}

export class BlockSelection implements INormalizedRange {

  constructor(private _doc: BlockCraft.Doc,
              private readonly normalizedRange: INormalizedRange,
              readonly raw: Range,
              private selection: Selection) {
    this._commonParent = this._resolveCommonParent()
    this._selectedBlocks = this._collectSelectedBlocks()
    this._selectedBlockIds = this._selectedBlocks.map(block => block.id)
  }

  private readonly _commonParent: string
  private readonly _selectedBlocks: BlockCraft.BlockComponent[]
  private readonly _selectedBlockIds: string[]

  private _resolveCommonParent() {
    if (this.isInSameBlock) return this.from.blockId
    const commonPath = getCommonPath(this.from.block.getPath(), this.lastBlock.getPath())
    return commonPath.at(-1) || this.from.blockId
  }

  get commonParent() {
    return this._commonParent
  }

  get kind() {
    return this.normalizedRange.kind
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

  get blocks() {
    return this._selectedBlocks
  }

  get selectedBlockIds() {
    return this._selectedBlockIds
  }

  get isTextSelection() {
    return this.kind === 'text'
  }

  get isBlockSelection() {
    return this.kind === 'block'
  }

  get isMixedSelection() {
    return this.kind === 'mixed'
  }

  get isTableSelection() {
    return this.kind === 'table'
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

  get isEmpty() {
    const isFromEmpty = this.from.type === 'text' ? this.from.length === 0 : false
    if (!this.to) return isFromEmpty
    if(!isFromEmpty || this.to.block.hostElement.previousElementSibling !== this.from.block.hostElement) return false
    return this.to.type === 'selected' ? false : (this.to.index === 0 && this.to.length === 0)
  }

  getDirection() {
    const doc = this.raw.startContainer.ownerDocument || this.raw.endContainer.ownerDocument
    if (!doc) return 'forward'
    return getNativeSelectionDirection(doc, this.selection)
  }

  private _compareBlocksInDocumentOrder(left: BlockCraft.BlockComponent, right: BlockCraft.BlockComponent) {
    if (left === right) return 0
    const position = left.hostElement.compareDocumentPosition(right.hostElement)
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1
    if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1
    return 0
  }

  private _collectSelectedBlocks() {
    if (!this.to) return [this.from.block]
    const uniqueBlocks = new Map<string, BlockCraft.BlockComponent>()
    uniqueBlocks.set(this.from.blockId, this.from.block)
    uniqueBlocks.set(this.to.blockId, this.to.block)
    this._doc.queryBlocksThroughPathDeeply(this.from.block, this.to.block).forEach(through => {
      through.group.forEach(id => {
        uniqueBlocks.set(id, this._doc.getBlockById(id))
      })
    })
    return [...uniqueBlocks.values()].sort((left, right) => this._compareBlocksInDocumentOrder(left, right))
  }

  toJSON(): IBlockSelectionJSON {
    return JSON.parse(JSON.stringify({
      kind: this.kind,
      from: {
        ...this.from,
        block: undefined
      },
      to: this.to ? {
        ...this.to,
        block: undefined
      } : null,
      collapsed: this.collapsed,
      commonParent: this.commonParent,
      selectedBlockIds: this.selectedBlockIds
    }))
  }
}
