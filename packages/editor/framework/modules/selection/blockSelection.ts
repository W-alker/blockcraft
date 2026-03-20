import {IBlockSelectionJSON, INormalizedRange} from "./types";

export class BlockSelection implements INormalizedRange {

  constructor(private readonly normalizedRange: INormalizedRange,
              private readonly _commonParent: string,
              private readonly _direction: 'forward' | 'backward') {
  }

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
    if (!isFromEmpty) return false
    return this.to.type === 'text' ? (this.to.index === 0 && this.to.length === 0) : false
  }

  getDirection() {
    return this._direction
  }

  toJSON(): IBlockSelectionJSON {
    return {
      from: {...this.from},
      to: this.to ? {...this.to} : null,
      collapsed: this.collapsed,
      commonParent: this.commonParent
    } as IBlockSelectionJSON
  }
}
