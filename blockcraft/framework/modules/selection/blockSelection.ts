import {closetBlockId} from "../../utils";
import {IBlockSelectionJSON, INormalizedRange} from "./types";

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

  get isEmpty() {
    const isFromEmpty = this.from.type === 'text' ? this.from.length === 0 : false
    if (!this.to) return isFromEmpty
    if(!isFromEmpty || this.to.block.hostElement.previousElementSibling !== this.from.block.hostElement) return false
    return this.to.type === 'selected' ? false : (this.to.index === 0 && this.to.length === 0)
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
