import {BaseBlockComponent, EditableBlockComponent} from "../../block-std";
import {
  IBlockSelectionJSON,
  ISelectionJSON,
  ISelectionPoint,
  ISelectionPointJSON,
} from "./types";

export class BlockSelection {

  constructor(
    readonly anchor: ISelectionPoint,
    readonly head: ISelectionPoint,
    readonly commonParent: string,
    private readonly _getBlockById: (id: string) => BaseBlockComponent<any>,
    private readonly _comparePosition: (a: string, b: string) => number,
  ) {
  }

  // ── Core derived properties ──

  get direction(): 'forward' | 'backward' {
    if (this.anchor.blockId === this.head.blockId) {
      if (this.anchor.type === 'text' && this.head.type === 'text') {
        return this.anchor.offset <= this.head.offset ? 'forward' : 'backward'
      }
      return 'forward'
    }
    const cmp = this._comparePosition(this.anchor.blockId, this.head.blockId)
    return (cmp & Node.DOCUMENT_POSITION_FOLLOWING) ? 'forward' : 'backward'
  }

  get collapsed(): boolean {
    if (this.anchor.blockId === this.head.blockId) {
      // Two gap points with same side -> collapsed
      if (this.anchor.type === 'gap' && this.head.type === 'gap') {
        return this.anchor.side === this.head.side
      }
      // Two text points with same offset -> collapsed
      if (this.anchor.type === 'text' && this.head.type === 'text') {
        return this.anchor.offset === this.head.offset
      }
    }
    return false
  }

  get isInSameBlock(): boolean {
    return this.anchor.blockId === this.head.blockId
  }

  /** Anchor/head ordered by document position (start is before end) */
  get start(): ISelectionPoint {
    return this.direction === 'forward' ? this.anchor : this.head
  }

  get end(): ISelectionPoint {
    return this.direction === 'forward' ? this.head : this.anchor
  }

  get firstBlock(): BaseBlockComponent<any> {
    return this.start.block
  }

  get lastBlock(): BaseBlockComponent<any> {
    return this.end.block
  }

  get isStartOfBlock(): boolean {
    const s = this.start
    return s.type === 'gap' ? s.side === 'before' : (s.type === 'selected' || s.offset === 0)
  }

  get isEndOfBlock(): boolean {
    const e = this.end
    if (e.type === 'gap') return e.side === 'after'
    if (e.type === 'selected') return true
    return (e.block as EditableBlockComponent).textLength === e.offset
  }

  get isAllSelected(): boolean {
    return this.anchor.type === 'selected' && this.head.type === 'selected'
  }

  get isEmpty(): boolean {
    if (!this.isInSameBlock) return false
    if (this.anchor.type !== 'text' || this.head.type !== 'text') return false
    return this.anchor.offset === this.head.offset
  }

  /** @deprecated Use direction instead */
  getDirection() {
    return this.direction
  }

  contains(blockId: string, offset?: number): boolean {
    if (this.isInSameBlock) {
      if (blockId !== this.anchor.blockId) return false
      if (offset === undefined) return true
      const s = this.start, e = this.end
      // gap and selected don't have meaningful offsets; treat as whole-block
      if (s.type !== 'text' || e.type !== 'text') return true
      return offset >= s.offset && offset <= e.offset
    }

    if (blockId === this.start.blockId) {
      if (offset === undefined || this.start.type !== 'text') return true
      return offset >= this.start.offset
    }
    if (blockId === this.end.blockId) {
      if (offset === undefined || this.end.type !== 'text') return true
      return offset <= this.end.offset
    }

    // Check if blockId is between start and end in document order
    const cmpStart = this._comparePosition(this.start.blockId, blockId)
    const cmpEnd = this._comparePosition(blockId, this.end.blockId)
    return !!(cmpStart & Node.DOCUMENT_POSITION_FOLLOWING) && !!(cmpEnd & Node.DOCUMENT_POSITION_FOLLOWING)
  }

  // ── Serialization ──

  toJSON(): ISelectionJSON {
    return this.toSelectionJSON()
  }

  toSelectionJSON(): ISelectionJSON {
    return {
      anchor: pointToJSON(this.anchor),
      head: pointToJSON(this.head),
      commonParent: this.commonParent,
    }
  }

  toLegacyJSON(): IBlockSelectionJSON {
    const s = this.start, e = this.end

    // Gap is collapsed-only — both endpoints are the same gap point. Treat as a
    // whole-block `selected` range (consistent with endpointsToLegacy / undoManger).
    if (s.type === 'gap' || e.type === 'gap') {
      return {
        from: {blockId: s.blockId, type: 'selected'},
        to: null,
        collapsed: true,
        commonParent: this.commonParent,
      }
    }

    const startLen = this.isInSameBlock && s.type === 'text' && e.type === 'text'
      ? e.offset - s.offset
      : (s.type === 'text' ? (s.block as EditableBlockComponent).textLength - s.offset : 0)
    const endLen = e.type === 'text' ? e.offset : 0

    return {
      from: s.type === 'text'
        ? {blockId: s.blockId, type: 'text', index: s.offset, length: startLen}
        : {blockId: s.blockId, type: 'selected'},
      to: this.isInSameBlock ? null
        : (e.type === 'text'
          ? {blockId: e.blockId, type: 'text', index: 0, length: endLen}
          : {blockId: e.blockId, type: 'selected'}),
      collapsed: this.collapsed,
      commonParent: this.commonParent,
    }
  }
}

function pointToJSON(p: ISelectionPoint): ISelectionPointJSON {
  if (p.type === 'gap') {
    return {blockId: p.blockId, type: 'gap', side: p.side}
  }
  return p.type === 'text'
    ? {blockId: p.blockId, type: 'text', offset: p.offset}
    : {blockId: p.blockId, type: 'selected'}
}

function _lazy<T extends { blockId: string }>(
  range: T,
  getBlockById: (id: string) => BaseBlockComponent<any>,
): T & { block: BaseBlockComponent<any> } {
  Object.defineProperty(range, 'block', {
    get: () => getBlockById(range.blockId),
    enumerable: false,
    configurable: true,
  });
  return range as any;
}
