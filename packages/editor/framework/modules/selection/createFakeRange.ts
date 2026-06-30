import {IBlockSelectionJSON} from "./types";
import {EditableBlockComponent} from "../../block-std";
import {BlockCraftError, ErrorCode} from "../../../global";
import {BlockSelection} from "./blockSelection";

export interface IFakeRangeConfig {
  bgColor?: string,
  minCursorWidth?: number
}

export class FakeRange {

  private _fakeSpans: HTMLElement[] = []

  constructor(
    private readonly doc: BlockCraft.Doc,
    source: Pick<IBlockSelectionJSON, 'from' | 'to'> | BlockSelection,
    private readonly config: IFakeRangeConfig = {}
  ) {
    if (source instanceof BlockSelection) {
      this._buildFromSelection(source)
    } else {
      this._buildFromLegacyJSON(source)
    }
  }

  private _buildFromSelection(sel: BlockSelection) {
    const s = sel.start, e = sel.end
    const startBlock = this.doc.getBlockById(s.blockId)
    this._fakeSpans.push(
      // gap and selected have no meaningful offset → render a whole-block fake span
      s.type !== 'text'
        ? this._createBlockFakeSpan(startBlock)
        : this._createTextFakeSpan(startBlock, s.offset, sel.isInSameBlock ? (e.type === 'text' ? e.offset - s.offset : 0) : (startBlock as EditableBlockComponent).textLength - s.offset)
    )
    if (sel.isInSameBlock) return

    const endBlock = this.doc.getBlockById(e.blockId)
    if (e.type === 'text') {
      e.offset > 0 && this._fakeSpans.push(this._createTextFakeSpan(endBlock, 0, e.offset))
    } else {
      this._fakeSpans.push(this._createBlockFakeSpan(endBlock))
    }
    const between = this.doc.queryBlocksBetween(s.blockId, e.blockId)
    between.forEach(id => {
      this._fakeSpans.push(this._createBlockFakeSpan(this.doc.getBlockById(id)))
    })
  }

  private _buildFromLegacyJSON(json: Pick<IBlockSelectionJSON, 'from' | 'to'>) {
    const {from, to} = json
    const fromBlock = this.doc.getBlockById(from.blockId)
    // gap and selected legacy variants have no index/length → whole-block fake span
    this._fakeSpans.push(from.type !== 'text' ? this._createBlockFakeSpan(fromBlock) : this._createTextFakeSpan(fromBlock, from.index, from.length))
    if (!to) return
    const toBlock = this.doc.getBlockById(to.blockId)
    if (to.type === 'text') {
      to.length > 0 && this._fakeSpans.push(this._createTextFakeSpan(toBlock, to.index, to.length))
    } else {
      this._fakeSpans.push(this._createBlockFakeSpan(toBlock))
    }
    const between = this.doc.queryBlocksBetween(from.blockId, to.blockId)
    between.forEach(id => {
      this._fakeSpans.push(this._createBlockFakeSpan(this.doc.getBlockById(id)))
    })
  }

  get fakeSpans() {
    return this._fakeSpans
  }

  setColor(options: { bgColor?: string, borderColor?: string }) {
    this._fakeSpans.forEach(span => {
      options.bgColor && span.style.setProperty('--bgColor', options.bgColor)
    })
  }

  private _createBlockFakeSpan(block: BlockCraft.BlockComponent) {
    if (this.doc.isEditable(block)) {
      return this._createTextFakeSpan(block, 0, block.textLength)
    }
    const span = document.createElement('span');
    span.classList.add('blockcraft-cursor')
    span.style.cssText = `
    position: unset;
    --bgColor: ${this.config.bgColor || 'var(--bc-select-background-color)'};
    `
    const child = document.createElement('span');
    child.style.cssText = `
        left: 0;
        top: 0;
        bottom: 0;
        right: 0;
    `
    span.appendChild(child)
    block.hostElement.appendChild(span)
    return span
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
    const wrapRect = wrapper.getBoundingClientRect()
    const span = document.createElement('span');
    span.classList.add('blockcraft-cursor')
    span.style.setProperty('--bgColor', this.config.bgColor || 'var(--bc-select-background-color)')
    const _rRects = range.getClientRects();

    const createPart = (rect: DOMRect) => {
      const span = document.createElement('span');
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
    this._fakeSpans = []
  }

}
