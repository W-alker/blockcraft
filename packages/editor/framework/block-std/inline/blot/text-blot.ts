import {BlotType, IFormattedBlot, IScrollBlot, LeafBlot} from "./blot";
import {IInlineNodeAttrs} from "../../types";
import {INLINE_ELEMENT_TAG, INLINE_TEXT_NODE_TAG} from "../const";
import setAttributes from "../setAttributes";

/**
 * TextBlot represents a contiguous run of text with uniform formatting.
 *
 * DOM contract (Phase 1 — matches current InlineManager output):
 * ```
 *   <c-element [attrs]>
 *     <c-text>text content</c-text>
 *   </c-element>
 * ```
 *
 * A TextBlot's `length` equals its text content length.
 */
export class TextBlot extends LeafBlot implements IFormattedBlot {
  readonly type = BlotType.Text

  private _text: string
  attrs: IInlineNodeAttrs | undefined

  constructor(text: string, attrs?: IInlineNodeAttrs) {
    const cElement = document.createElement(INLINE_ELEMENT_TAG)
    const cText = document.createElement(INLINE_TEXT_NODE_TAG)
    cText.textContent = text
    cElement.appendChild(cText)
    if (attrs) setAttributes(cElement, attrs)
    super(cElement)
    this._text = text
    this.attrs = attrs
  }

  private _syncFromDom() {
    const el = (this.domNode as HTMLElement).firstElementChild
    if (el?.firstChild instanceof Text) {
      const domText = el.firstChild.textContent || ''
      if (domText !== this._text) this._text = domText
    }
  }

  get length() {
    this._syncFromDom()
    return this._text.length
  }

  get text() {
    this._syncFromDom()
    return this._text
  }

  get cElement(): HTMLElement {
    return this.domNode as HTMLElement
  }

  get textNode(): Text {
    return (this.domNode as HTMLElement).firstElementChild!.firstChild as Text
  }

  /**
   * Update the text content in-place without recreating DOM.
   */
  updateText(newText: string) {
    this._text = newText
    this.textNode.textContent = newText
  }

  /**
   * Sync internal text state from the DOM text node.
   * Use when external code (e.g. mention plugin) has modified the DOM text node directly.
   */
  syncText() {
    this._text = this.textNode.textContent || ''
  }

  /**
   * Insert text at the given local offset.
   */
  insertAt(offset: number, text: string) {
    this._text = this._text.slice(0, offset) + text + this._text.slice(offset)
    this.textNode.insertData(offset, text)
  }

  /**
   * Delete `count` characters starting at `offset`.
   */
  deleteAt(offset: number, count: number) {
    this._text = this._text.slice(0, offset) + this._text.slice(offset + count)
    this.textNode.deleteData(offset, count)
  }

  /**
   * Split this blot at `offset`, returning a new TextBlot for the right half.
   * This blot retains the left half.
   */
  split(offset: number): TextBlot {
    const rightText = this._text.slice(offset)
    this.deleteAt(offset, rightText.length)
    return new TextBlot(rightText, this.attrs ? {...this.attrs} : undefined)
  }

  /**
   * Update formatting attributes on the DOM element.
   * In delta semantics, null attribute values mean "remove attribute".
   */
  format(attrs: IInlineNodeAttrs) {
    const merged: Record<string, any> = {...(this.attrs || {})}
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined) {
        delete merged[k]
      } else {
        merged[k] = v
      }
    }
    this.attrs = Object.keys(merged).length ? merged as IInlineNodeAttrs : undefined
    setAttributes(this.cElement, attrs)
  }

  /**
   * Try to merge with an adjacent TextBlot that has identical attributes.
   * Returns true if merge succeeded.
   */
  mergeWith(other: TextBlot): boolean {
    if (!this._attrsEqual(other.attrs)) return false
    this.insertAt(this.length, other.text)
    other.detach()
    return true
  }

  private _attrsEqual(otherAttrs: IInlineNodeAttrs | undefined): boolean {
    if (!this.attrs && !otherAttrs) return true
    if (!this.attrs || !otherAttrs) return false
    const entries = Object.entries(this.attrs)
    const otherEntries = Object.entries(otherAttrs)
    if (entries.length !== otherEntries.length) return false
    return entries.every(([k, v]) => (otherAttrs as any)[k] === v)
  }
}
