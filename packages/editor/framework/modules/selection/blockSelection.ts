import {BaseBlockComponent, EditableBlockComponent} from "../../block-std";
import {
  IBlockInlineRangeJSON,
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
    return this._comparePointOrder(this.anchor, this.head) <= 0 ? 'forward' : 'backward'
  }

  get collapsed(): boolean {
    if (this.anchor.blockId === this.head.blockId) {
      if (this.anchor.type === 'table-cell' && this.head.type === 'table-cell') {
        return this.anchor.tableId === this.head.tableId
      }
      if (this.anchor.type === 'boundary' && this.head.type === 'boundary') {
        return this.anchor.index === this.head.index
      }
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
    if (this.anchor.type === 'table-cell' && this.head.type === 'table-cell') {
      return this.anchor.blockId === this.head.blockId && this.anchor.tableId === this.head.tableId
    }
    if (this.anchor.type === 'boundary' && this.head.type === 'boundary') {
      return this.anchor.blockId === this.head.blockId && this.anchor.index === this.head.index
    }
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
    return this._contentBlockForPoint(this.start, 'start')
  }

  get lastBlock(): BaseBlockComponent<any> {
    return this._contentBlockForPoint(this.end, 'end')
  }

  get isStartOfBlock(): boolean {
    const s = this.start
    if (s.type === 'table-cell') return true
    if (s.type === 'boundary') return s.index === 0
    if (s.type === 'gap') return s.side === 'before'
    if (isWholeBlockPoint(s)) return true
    return s.offset === 0
  }

  get isEndOfBlock(): boolean {
    const e = this.end
    if (e.type === 'table-cell') return true
    if (e.type === 'boundary') return e.index === e.block.childrenLength
    if (e.type === 'gap') return e.side === 'after'
    if (isWholeBlockPoint(e)) return true
    return (e.block as EditableBlockComponent).textLength === e.offset
  }

  get isAllSelected(): boolean {
    return isWholeBlockPoint(this.anchor) && isWholeBlockPoint(this.head)
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
    const boundaryIds = this.getBoundarySelectedChildIds()
    if (boundaryIds) {
      if (blockId === this.start.blockId) return offset === undefined
      const s = this.start
      const e = this.end
      if (s.type !== 'boundary' || e.type !== 'boundary') return false
      const directIndex = this._directChildIndexUnder(this.start.blockId, this._getBlockById(blockId))
      return directIndex !== null && directIndex >= s.index && directIndex < e.index
    }

    if (this.isInSameBlock) {
      if (blockId !== this.anchor.blockId) return false
      if (offset === undefined) return true
      const s = this.start, e = this.end
      // Non-text points do not have meaningful offsets; treat as whole-block.
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

  getBoundarySelectedChildIds(): string[] | null {
    const s = this.start
    const e = this.end
    if (s.type !== 'boundary' || e.type !== 'boundary') return null
    if (s.blockId !== e.blockId) return null
    if (s.index === e.index) return []
    const from = Math.max(0, Math.min(s.index, e.index))
    const to = Math.min(s.block.childrenLength, Math.max(s.index, e.index))
    return s.block.childrenIds.slice(from, to)
  }

  getTableCellSelection(): { tableId: string; anchorCellId: string; headCellId: string } | null {
    if (this.anchor.type !== 'table-cell' || this.head.type !== 'table-cell') return null
    if (this.anchor.tableId !== this.head.tableId) return null
    return {
      tableId: this.anchor.tableId,
      anchorCellId: this.anchor.blockId,
      headCellId: this.head.blockId,
    }
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

    if (shouldDegradeToLegacySelectedRange(s, e)) {
      return {
        from: legacySelectedPoint(s),
        to: this.collapsed ? null : legacySelectedPoint(e),
        collapsed: this.collapsed,
        commonParent: this.commonParent,
      }
    }

    // Gap is collapsed-only — both endpoints are the same gap point. Treat as a
    // whole-block `selected` range (consistent with endpointsToLegacy / undoManger).
    if (s.type === 'gap' || e.type === 'gap') {
      return {
        from: legacySelectedPoint(s),
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
        : legacySelectedPoint(s),
      to: this.isInSameBlock ? null
        : (e.type === 'text'
          ? {blockId: e.blockId, type: 'text', index: 0, length: endLen}
          : legacySelectedPoint(e)),
      collapsed: this.collapsed,
      commonParent: this.commonParent,
    }
  }

  private _comparePointOrder(a: ISelectionPoint, b: ISelectionPoint): number {
    if (a.blockId === b.blockId) {
      if (a.type === 'text' && b.type === 'text') return a.offset - b.offset
      if (a.type === 'boundary' && b.type === 'boundary') return a.index - b.index
      return 0
    }

    if (a.type === 'boundary') {
      const directIndex = this._directChildIndexUnder(a.blockId, b.block)
      if (directIndex !== null) return a.index <= directIndex ? -1 : 1
    }
    if (b.type === 'boundary') {
      const directIndex = this._directChildIndexUnder(b.blockId, a.block)
      if (directIndex !== null) return directIndex < b.index ? -1 : 1
    }

    const cmp = this._comparePosition(a.blockId, b.blockId)
    if (cmp & Node.DOCUMENT_POSITION_FOLLOWING) return -1
    if (cmp & Node.DOCUMENT_POSITION_PRECEDING) return 1
    return 0
  }

  private _directChildIndexUnder(parentId: string, block: BaseBlockComponent<any>): number | null {
    let current: BaseBlockComponent<any> | null = block
    while (current && current.parentId && current.parentId !== parentId) {
      current = current.parentBlock as BaseBlockComponent<any> | null
    }
    if (!current || current.parentId !== parentId) return null
    return current.getIndexOfParent()
  }

  private _contentBlockForPoint(point: ISelectionPoint, side: 'start' | 'end'): BaseBlockComponent<any> {
    if (point.type !== 'boundary') return point.block
    const ids = point.block.childrenIds
    if (!ids.length) return point.block
    const index = side === 'start'
      ? Math.min(point.index, ids.length - 1)
      : Math.max(0, point.index - 1)
    return this._getBlockById(ids[index])
  }
}

function pointToJSON(p: ISelectionPoint): ISelectionPointJSON {
  if (p.type === 'gap') {
    return {blockId: p.blockId, type: 'gap', side: p.side}
  }
  if (p.type === 'boundary') {
    return {blockId: p.blockId, type: 'boundary', index: p.index}
  }
  if (p.type === 'table-cell') {
    return {blockId: p.blockId, type: 'table-cell', tableId: p.tableId}
  }
  return p.type === 'text'
    ? {blockId: p.blockId, type: 'text', offset: p.offset}
    : legacySelectedPoint(p)
}

function isWholeBlockPoint(
  point: ISelectionPoint,
): point is Extract<ISelectionPoint, { type: 'selected' }> {
  return point.type === 'selected'
}

function shouldDegradeToLegacySelectedRange(
  start: ISelectionPoint,
  end: ISelectionPoint,
): boolean {
  return start.type === 'boundary' ||
    end.type === 'boundary' ||
    start.type === 'table-cell' ||
    end.type === 'table-cell'
}

function legacySelectedPoint(
  point: Pick<ISelectionPoint, 'blockId'>,
): IBlockInlineRangeJSON {
  return {blockId: point.blockId, type: 'selected'}
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
