import {IBlockSelectionJSON} from "./types";
import {EditableBlockComponent} from "../../block-std";
import {BlockCraftError, ErrorCode} from "../../../global";
import {BlockSelection} from "./blockSelection";
import {getBlockGapCaretSpan} from "../../utils/zero-gap";

export interface IFakeRangeConfig {
  bgColor?: string,
  minCursorWidth?: number
}

const overlayContainingBlockState = new WeakMap<HTMLElement, {
  count: number,
  previousPosition: string
}>()

export class FakeRange {

  private _fakeSpans: HTMLElement[] = []
  private _styleTargets: HTMLElement[] = []
  private _styleCleanups: (() => void)[] = []

  constructor(
    private readonly doc: BlockCraft.Doc,
    source: Pick<IBlockSelectionJSON, 'from' | 'to'> | BlockSelection | null,
    private readonly config: IFakeRangeConfig = {}
  ) {
    if (source instanceof BlockSelection) {
      this._buildFromSelection(source)
    } else if (source) {
      this._buildFromLegacyJSON(source)
    }
  }

  private _buildFromSelection(sel: BlockSelection) {
    if (this._buildFromTableCellSelection(sel)) return

    const boundaryChildIds = sel.getBoundarySelectedChildIds()
    if (boundaryChildIds) {
      boundaryChildIds.forEach(id => {
        const block = this._resolveBlock(id)
        if (block) this._fakeSpans.push(this._createBlockFakeSpan(block))
      })
      return
    }

    const s = sel.start, e = sel.end
    const startBlockId = sel.firstBlockId
    const endBlockId = sel.lastBlockId
    const startBlock = this._resolveBlock(startBlockId)
    if (
      sel.collapsed &&
      s.type === 'gap' &&
      e.type === 'gap'
    ) {
      if (startBlock) {
        this._fakeSpans.push(this._createGapFakeSpan(startBlock, s.side))
      }
      return
    }
    if (startBlock) {
      this._fakeSpans.push(
        // Non-collapsed gap endpoints and selected points cover the endpoint block.
        s.type !== 'text'
          ? this._createBlockFakeSpan(startBlock)
          : this._createTextFakeSpan(startBlock, s.offset, sel.isInSameBlock ? (e.type === 'text' ? e.offset - s.offset : 0) : (startBlock as EditableBlockComponent).textLength - s.offset)
      )
    }
    if (sel.isInSameBlock) return

    const endBlock = this._resolveBlock(endBlockId)
    if (endBlock) {
      if (e.type === 'text') {
        e.offset > 0 && this._fakeSpans.push(this._createTextFakeSpan(endBlock, 0, e.offset))
      } else {
        this._fakeSpans.push(this._createBlockFakeSpan(endBlock))
      }
    }
    this._selectedIntermediateBlockIds(
      sel,
      startBlockId,
      endBlockId,
      startBlock,
      endBlock,
    ).forEach(id => {
      const block = this._resolveBlock(id)
      if (block) this._fakeSpans.push(this._createBlockFakeSpan(block))
    })
  }

  private _buildFromLegacyJSON(json: Pick<IBlockSelectionJSON, 'from' | 'to'>) {
    const {from, to} = json
    const fromBlock = this._resolveBlock(from.blockId)
    // gap and selected legacy variants have no index/length → whole-block fake span
    if (fromBlock) {
      this._fakeSpans.push(from.type !== 'text' ? this._createBlockFakeSpan(fromBlock) : this._createTextFakeSpan(fromBlock, from.index, from.length))
    }
    if (!to) return
    const toBlock = this._resolveBlock(to.blockId)
    if (toBlock) {
      if (to.type === 'text') {
        to.length > 0 && this._fakeSpans.push(this._createTextFakeSpan(toBlock, to.index, to.length))
      } else {
        this._fakeSpans.push(this._createBlockFakeSpan(toBlock))
      }
    }
    this._legacyIntermediateBlockIds(
      from.blockId,
      to.blockId,
      fromBlock,
      toBlock,
    ).forEach(id => {
      const block = this._resolveBlock(id)
      if (block) this._fakeSpans.push(this._createBlockFakeSpan(block))
    })
  }

  private _isSparseView(): boolean {
    return this.doc.virtualization?.enabled === true
  }

  private _resolveBlock(blockId: string): BlockCraft.BlockComponent | null {
    if (this._isSparseView() && !this.doc.vm.isMounted(blockId)) return null
    try {
      return this.doc.getBlockById(blockId)
    } catch (error) {
      if (this._isSparseView()) return null
      throw error
    }
  }

  private _rootUnitId(blockId: string): string | null {
    const path = this.doc.model.getPath(blockId)
    if (!path || path[0] !== this.doc.rootId) return null
    return path[1] ?? (blockId === this.doc.rootId ? this.doc.rootId : null)
  }

  private _selectedIntermediateBlockIds(
    selection: BlockSelection,
    startBlockId: string,
    endBlockId: string,
    startBlock: BlockCraft.BlockComponent | null,
    endBlock: BlockCraft.BlockComponent | null,
  ): readonly string[] {
    if (!this._isSparseView()) {
      return this.doc.queryBlocksBetween(startBlock!, endBlock!)
    }

    const startRootId = this._rootUnitId(startBlockId)
    const endRootId = this._rootUnitId(endBlockId)
    if (!startRootId || !endRootId) return []
    if (startRootId === endRootId) {
      if (!startBlock || !endBlock) return []
      return this.doc.queryBlocksBetween(startBlockId, endBlockId)
    }

    return this.doc.vm.getMountedRootChildIds().filter(rootId => {
      if (rootId === startRootId || rootId === endRootId) return false
      try {
        return selection.contains(rootId)
      } catch {
        return false
      }
    })
  }

  private _legacyIntermediateBlockIds(
    startBlockId: string,
    endBlockId: string,
    startBlock: BlockCraft.BlockComponent | null,
    endBlock: BlockCraft.BlockComponent | null,
  ): readonly string[] {
    if (!this._isSparseView()) {
      return this.doc.queryBlocksBetween(startBlock!, endBlock!)
    }

    const startRootId = this._rootUnitId(startBlockId)
    const endRootId = this._rootUnitId(endBlockId)
    if (!startRootId || !endRootId) return []
    if (startRootId === endRootId) {
      if (!startBlock || !endBlock) return []
      return this.doc.queryBlocksBetween(startBlockId, endBlockId)
    }

    return this.doc.vm.getMountedRootChildIds().filter(rootId => {
      if (rootId === startRootId || rootId === endRootId) return false
      const afterStart = this.doc.model.comparePosition(startBlockId, rootId)
      const beforeEnd = this.doc.model.comparePosition(rootId, endBlockId)
      return afterStart !== null && beforeEnd !== null &&
        !!(afterStart & Node.DOCUMENT_POSITION_FOLLOWING) &&
        !!(beforeEnd & Node.DOCUMENT_POSITION_FOLLOWING)
    })
  }

  private _buildFromTableCellSelection(sel: BlockSelection): boolean {
    const tableCellSelection = sel.getTableCellSelection()
    if (!tableCellSelection) return false

    try {
      const anchorCell = this.doc.getBlockById(tableCellSelection.anchorCellId) as BlockCraft.IBlockComponents['table-cell']
      if (anchorCell.props?.display !== 'none') {
        this._applyTableCellFakeStyle(anchorCell)
        this._fakeSpans.push(this._createDetachedFakeSpan(anchorCell.hostElement.ownerDocument))
      }
    } catch {
      // The selection points may have been deleted by collaboration. Treat it
      // as handled so callers do not fall back to endpoint-only block spans.
    }
    return true
  }

  get fakeSpans() {
    return this._fakeSpans
  }

  get hasLostRenderedSpans() {
    return this._fakeSpans.some(span =>
      span.getAttribute('data-fake-range-detached') !== 'true' &&
      !span.isConnected
    )
  }

  setColor(options: { bgColor?: string, borderColor?: string }) {
    this._fakeSpans.forEach(span => {
      options.bgColor && span.style.setProperty('--bgColor', options.bgColor)
    })
    this._styleTargets.forEach(target => {
      options.bgColor && target.style.setProperty('--bgColor', options.bgColor)
    })
  }

  private _createBlockFakeSpan(block: BlockCraft.BlockComponent) {
    if (this.doc.isEditable(block)) {
      return this._createTextFakeSpan(block, 0, block.textLength)
    }
    this._ensureOverlayContainingBlock(block.hostElement)
    const ownerDocument = block.hostElement.ownerDocument
    const span = ownerDocument.createElement('span');
    span.classList.add('blockcraft-cursor')
    span.style.cssText = `
      position: absolute;
      display: block;
      inset: 0;
      box-sizing: border-box;
      z-index: 100;
      pointer-events: none;
      --bgColor: ${this.config.bgColor || 'var(--bc-select-background-color)'};
    `
    const child = ownerDocument.createElement('span');
    child.style.cssText = `
      position: absolute;
      display: block;
      left: 0;
      top: 0;
      bottom: 0;
      right: 0;
      box-sizing: border-box;
      border: 0;
      background-color: transparent;
      box-shadow: inset 0 0 0 2px var(--bgColor);
    `
    span.appendChild(child)
    block.hostElement.appendChild(span)
    return span
  }

  private _createGapFakeSpan(
    block: BlockCraft.BlockComponent,
    side: 'before' | 'after',
  ) {
    const host = block.hostElement
    const ownerDocument = host.ownerDocument
    this._ensureOverlayContainingBlock(host)

    const hostRect = host.getBoundingClientRect()
    const gap = getBlockGapCaretSpan(host, side)
    const gapRect = gap?.getBoundingClientRect()
    const computedStyle = ownerDocument.defaultView?.getComputedStyle.bind(ownerDocument.defaultView) ?? getComputedStyle
    const computed = gap ? computedStyle(gap) : computedStyle(host)
    const parsedHeight = Number.parseFloat(computed.height)
    const fallbackHeight = Number.parseFloat(computed.lineHeight)
    const height = Math.max(
      gapRect?.height || 0,
      Number.isFinite(parsedHeight) ? parsedHeight : 0,
      Number.isFinite(fallbackHeight) ? fallbackHeight : 0,
      16,
    )
    const left = gapRect
      ? gapRect.left - hostRect.left
      : side === 'before' ? -2 : Math.max(0, hostRect.width - 1)
    const top = gapRect
      ? gapRect.top - hostRect.top
      : side === 'before' ? 0 : Math.max(0, hostRect.height - height)

    const span = ownerDocument.createElement('span')
    span.classList.add('blockcraft-cursor', 'blockcraft-cursor--gap')
    span.setAttribute('data-fake-range-kind', 'gap')
    span.setAttribute('data-gap-side', side)
    span.style.cssText = `
      position: absolute;
      display: block;
      inset: 0;
      z-index: 100;
      pointer-events: none;
      overflow: visible;
      --bgColor: ${this.config.bgColor || 'var(--bc-select-background-color)'};
    `

    const child = ownerDocument.createElement('span')
    child.style.cssText = `
      position: absolute;
      display: block;
      width: ${Math.max(this.config.minCursorWidth || 2, 2)}px;
      height: ${height}px;
      left: ${left}px;
      top: ${top}px;
      box-sizing: border-box;
      border: 0;
      background-color: var(--bgColor);
      box-shadow: none;
    `
    span.appendChild(child)
    host.appendChild(span)
    return span
  }

  private _ensureOverlayContainingBlock(target: HTMLElement) {
    const existing = overlayContainingBlockState.get(target)
    if (existing) {
      existing.count++
      this._styleCleanups.push(() => this._releaseOverlayContainingBlock(target, existing))
      return
    }
    const computedStyle = target.ownerDocument.defaultView?.getComputedStyle(target) ?? getComputedStyle(target)
    if (computedStyle.position !== 'static') return
    const previousPosition = target.style.position
    target.style.position = 'relative'
    const state = {
      count: 1,
      previousPosition,
    }
    overlayContainingBlockState.set(target, state)
    this._styleCleanups.push(() => this._releaseOverlayContainingBlock(target, state))
  }

  private _releaseOverlayContainingBlock(
    target: HTMLElement,
    state: { count: number, previousPosition: string }
  ) {
    state.count--
    if (state.count > 0) return
    target.style.position = state.previousPosition
    overlayContainingBlockState.delete(target)
  }

  private _createDetachedFakeSpan(ownerDocument: Document) {
    const span = ownerDocument.createElement('span');
    span.classList.add('blockcraft-cursor')
    span.setAttribute('data-fake-range-detached', 'true')
    const child = ownerDocument.createElement('span');
    span.appendChild(child)
    return span
  }

  private _applyTableCellFakeStyle(cell: BlockCraft.IBlockComponents['table-cell']) {
    const target = cell.hostElement
    const previousOutlineWidth = target.style.outlineWidth
    const previousOutlineStyle = target.style.outlineStyle
    const previousOutlineColor = target.style.outlineColor
    const previousOutlineOffset = target.style.outlineOffset
    const previousBgColor = target.style.getPropertyValue('--bgColor')
    const previousBgColorPriority = target.style.getPropertyPriority('--bgColor')

    target.style.setProperty('--bgColor', this.config.bgColor || 'var(--bc-select-background-color)')
    target.style.outlineWidth = '2px'
    target.style.outlineStyle = 'solid'
    target.style.outlineColor = 'var(--bgColor)'
    target.style.outlineOffset = '-2px'

    this._styleTargets.push(target)
    this._styleCleanups.push(() => {
      target.style.outlineWidth = previousOutlineWidth
      target.style.outlineStyle = previousOutlineStyle
      target.style.outlineColor = previousOutlineColor
      target.style.outlineOffset = previousOutlineOffset
      if (previousBgColor) {
        target.style.setProperty('--bgColor', previousBgColor, previousBgColorPriority)
      } else {
        target.style.removeProperty('--bgColor')
      }
    })
  }

  private _createTextFakeSpan(block: BlockCraft.BlockComponent, index: number, length: number) {
    if (!this.doc.isEditable(block)) {
      throw new BlockCraftError(ErrorCode.SelectionError, `Set fake range: Block ${block.id} is not editable`)
    }
    const eb = block as EditableBlockComponent
    const container = eb.containerElement
    const range = length
      ? eb.runtime.mapper.modelRangeToDomRange(container, index, index + length)
      : eb.runtime.mapper.modelRangeToDomRange(container, index)

    const wrapper = block.containerElement
    const ownerDocument = wrapper.ownerDocument
    const wrapRect = wrapper.getBoundingClientRect()
    const span = ownerDocument.createElement('span');
    span.classList.add('blockcraft-cursor')
    span.style.setProperty('--bgColor', this.config.bgColor || 'var(--bc-select-background-color)')
    const _rRects = range.getClientRects();

    const createPart = (rect: DOMRect) => {
      const span = ownerDocument.createElement('span');
      span.style.cssText = `
        width: ${Math.max(rect.width, this.config.minCursorWidth || 2)}px;
        height: ${rect.height}px;
        left: ${rect.left - wrapRect.left}px;
        top: ${rect.top - wrapRect.top}px;
      `
      return span
    }

    const isContain = (rect1: DOMRect, rect2: DOMRect) => {
      return rect1.left <= rect2.left && rect1.right >= rect2.right && rect1.top <= rect2.top && rect1.bottom >= rect2.bottom
    }

    if (_rRects.length === 1) {
      span.appendChild(createPart(_rRects[0]))
    } else {
      let prevRect = null
      for (let i = 0; i < _rRects.length; i++) {
        const rect = _rRects[i];
        if (rect.width < 2 || (prevRect && isContain(prevRect, rect))) continue
        span.appendChild(createPart(rect))
        prevRect = rect
      }
    }

    wrapper.appendChild(span)
    return span
  }

  destroy() {
    this._fakeSpans.forEach(span => {
      span.remove()
    })
    this._styleCleanups.forEach(cleanup => cleanup())
    this._fakeSpans = []
    this._styleTargets = []
    this._styleCleanups = []
  }

}
