import {IBlockSelectionJSON} from "./index";
import {EditableBlockComponent} from "../../block-std";
import {BlockCraftError, ErrorCode} from "../../../global";

export interface IFakeRangeConfig {
  bgColor?: string,
  borderColor?: string,
  minCursorWidth?: number
}

export class FakeRange {

  private _fakeSpans: HTMLElement[] = []

  constructor(private readonly doc: BlockCraft.Doc, private readonly json: IBlockSelectionJSON, private readonly config: IFakeRangeConfig = {}) {
    const {from, to} = json
    const fromBlock = this.doc.getBlockById(from.blockId)
    this._fakeSpans.push(from.type === 'selected' ? this._createBlockFakeSpan(fromBlock) : this._createTextFakeSpan(fromBlock, from.index, from.length))
    if (!to) return this
    const toBlock = this.doc.getBlockById(to.blockId)
    if (to.type === 'text') {
      to.length > 0 && this._fakeSpans.push(this._createTextFakeSpan(toBlock, to.index, to.length))
    } else {
      this._fakeSpans.push(this._createBlockFakeSpan(toBlock))
    }
    const between = this.doc.queryBlocksBetween(from.blockId, to.blockId)
    between.forEach(id => {
      const block = this.doc.getBlockById(id)
      this._fakeSpans.push(
        // this.doc.isEditable(block) ?
        // this._createTextFakeSpan(block, 0, block.textLength) :
        this._createBlockFakeSpan(block)
      )
    })
  }

  get fakeSpans() {
    return this._fakeSpans
  }

  private _createBlockFakeSpan(block: BlockCraft.BlockComponent) {
    const span = document.createElement('span');
    span.classList.add('blockcraft-cursor')
    span.style.position = 'unset'
    const child = document.createElement('span');
    child.style.cssText = `
        background: ${this.config.bgColor || 'var(--bc-select-background-color)'};
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
    const range = block.hostElement.ownerDocument.createRange()
    const startNodePos = this.doc.inlineManager.queryNodePositionInlineByOffset((block as EditableBlockComponent).containerElement, index)
    range.setStart(startNodePos.node, startNodePos.offset)
    if (!length) {
      range.collapse()
    } else {
      const endNodePos = this.doc.inlineManager.queryNodePositionInlineByOffset((block as EditableBlockComponent).containerElement, index + length)
      range.setEnd(endNodePos.node, endNodePos.offset)
    }

    const wrapRect = block.hostElement.getBoundingClientRect()
    const span = document.createElement('span');
    span.classList.add('blockcraft-cursor')
    const _rRects = range.getClientRects();

    const createPart = (rect: DOMRect) => {
      const span = document.createElement('span');
      span.style.cssText = `
        background: ${this.config.bgColor || 'var(--bc-select-background-color)'};
        left: ${rect.left - wrapRect.left}px;
        top: ${rect.top - wrapRect.top}px;
        width: ${Math.max(rect.width, this.config.minCursorWidth || 2)}px;
        height: ${rect.height}px;
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

    block.hostElement.appendChild(span)
    return span
  }

  destroy() {
    this._fakeSpans.forEach(span => {
      span.remove()
    })
    this._fakeSpans = []
  }

}

