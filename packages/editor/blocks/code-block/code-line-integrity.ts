import {BlotType, type IBlot} from '../../framework/block-std/inline/blot/blot'
import {EmbedBlot} from '../../framework/block-std/inline/blot/embed-blot'
import {ScrollBlot} from '../../framework/block-std/inline/blot/scroll-blot'
import {TextBlot} from '../../framework/block-std/inline/blot/text-blot'
import {
  INLINE_ELEMENT_TAG,
  INLINE_END_BREAK_CLASS,
  INLINE_TEXT_NODE_TAG,
  STR_ZERO_WIDTH_SPACE,
} from '../../framework/block-std/inline/const'
import setAttributes from '../../framework/block-std/inline/setAttributes'
import type {IInlineNodeAttrs} from '../../framework/model/inline'

type AttributeProjection = ReadonlyArray<readonly [string, string]>
const EMPTY_ATTRIBUTES: AttributeProjection = []
const GAP_ATTRIBUTES: AttributeProjection = [['data-zero-space', 'true']]
const BREAK_ATTRIBUTES: AttributeProjection = [['class', INLINE_END_BREAK_CLASS]]
const ATTRIBUTE_CACHE_LIMIT = 512

/** @internal Code-only reconciliation of browser-mutated canonical rows. */
export class CodeLineIntegrity {
  private _attributeCache = new Map<string, AttributeProjection>()
  private _scratch: HTMLElement | undefined

  clear(): void {
    this._attributeCache.clear()
    this._scratch = undefined
  }

  /** The returned predicate is a snapshot: discard it after any DOM mutation. */
  inspect(
    scroll: ScrollBlot,
    container: HTMLElement,
  ): (blots: (TextBlot | EmbedBlot)[]) => boolean {
    const owned = new Map<Node, IBlot>(scroll.children.map(blot => [blot.domNode, blot]))
    const gap = scroll.leadingGapNode
    const checkedRows = new Map<HTMLElement, boolean>()
    const checkRow = (row: HTMLElement): boolean => {
      const cached = checkedRows.get(row)
      if (cached !== undefined) return cached
      let healthy = row.parentNode === container && scroll.isCanonicalLineContainer(row)
      if (healthy) {
        for (const node of Array.from(row.childNodes)) {
          if (node === gap) continue
          const blot = owned.get(node)
          if (!blot || blot.parent !== scroll ||
            (blot instanceof TextBlot && !this._isTextIntact(blot)) ||
            (blot instanceof EmbedBlot && !this._attributesMatch(blot.cElement, blot.attrs))) {
            healthy = false
            break
          }
        }
      }
      checkedRows.set(row, healthy)
      return healthy
    }
    return blots => {
      if (scroll.domNode !== container) return false
      for (const blot of blots) {
        const row = blot.domNode.parentElement
        if (owned.get(blot.domNode) !== blot || !row || !checkRow(row)) return false
      }
      return true
    }
  }

  /** Run after canonical mutation has moved managed nodes out of native wrappers. */
  repair(scroll: ScrollBlot, container: HTMLElement): void {
    if (scroll.domNode !== container) return
    const gap = scroll.leadingGapNode
    const firstLine = container.firstElementChild
    // The gap is not a Blot child, so canonical leaf-order checks cannot detect
    // its native removal or relocation when a cancelled composition changes no text.
    if (gap && (!firstLine || !scroll.isCanonicalLineContainer(firstLine) || firstLine.firstChild !== gap)) {
      scroll.restoreCanonicalDomOrder()
    }
    const owned = new Set<Node>(scroll.children.map(blot => blot.domNode))
    if (gap) owned.add(gap)
    // A malformed/native wrapper must never take a managed leaf with it, even
    // if a caller has not restored the canonical topology yet.
    const protectedNodes = new Set(owned)
    for (const node of owned) {
      let parent = node.parentNode
      while (parent && parent !== container && !protectedNodes.has(parent)) {
        protectedNodes.add(parent)
        parent = parent.parentNode
      }
    }
    for (const row of Array.from(container.childNodes)) {
      if (scroll.isCanonicalLineContainer(row)) {
        for (const child of Array.from(row.childNodes)) {
          if (!protectedNodes.has(child)) row.removeChild(child)
        }
      } else if (!protectedNodes.has(row)) {
        container.removeChild(row)
      }
    }
    if (gap) {
      this._restoreAttributes(gap, GAP_ATTRIBUTES)
      const text = Array.from(gap.childNodes).find(node => node.nodeType === 3) as Text | undefined
      const anchor = text ?? container.ownerDocument.createTextNode(STR_ZERO_WIDTH_SPACE)
      if (anchor.data !== STR_ZERO_WIDTH_SPACE) anchor.data = STR_ZERO_WIDTH_SPACE
      this._restoreSingleChild(gap, anchor, protectedNodes)
    }
    for (const blot of scroll.children) {
      if (blot.type !== BlotType.Break) continue
      const element = blot.domNode as HTMLElement
      this._restoreAttributes(element, BREAK_ATTRIBUTES)
      const existing = Array.from(element.children).find(child => child.localName === 'br')
      const br = existing ?? container.ownerDocument.createElement('br')
      this._restoreAttributes(br, EMPTY_ATTRIBUTES)
      for (const child of Array.from(br.childNodes)) {
        if (!protectedNodes.has(child)) br.removeChild(child)
      }
      this._restoreSingleChild(element, br, protectedNodes)
    }
  }

  private _isTextIntact(blot: TextBlot): boolean {
    const element = blot.cElement
    const textElement = element.firstChild
    if (element.localName !== INLINE_ELEMENT_TAG || element.childNodes.length !== 1 ||
      textElement?.nodeType !== 1) return false
    const cText = textElement as HTMLElement
    const text = cText.firstChild
    return cText.localName === INLINE_TEXT_NODE_TAG && cText.attributes.length === 0 &&
      cText.childNodes.length === 1 && text?.nodeType === 3 &&
      (text as Text).data === blot.text && this._attributesMatch(element, blot.attrs)
  }

  private _attributesMatch(element: HTMLElement, attrs: IInlineNodeAttrs | undefined): boolean {
    const expected = this._expectedAttributes(attrs, element.ownerDocument)
    return element.attributes.length === expected.length &&
      expected.every(([name, value]) => element.getAttribute(name) === value)
  }

  private _expectedAttributes(attrs: IInlineNodeAttrs | undefined, document: Document): AttributeProjection {
    if (!attrs) return EMPTY_ATTRIBUTES
    if (this._scratch?.ownerDocument !== document) {
      this._scratch = document.createElement(INLINE_ELEMENT_TAG)
      this._attributeCache.clear()
    }
    // Entry order is retained: aliases targeting the same CSS property can
    // legitimately depend on the original setAttributes application order.
    const key = JSON.stringify(Object.entries(attrs))
    const cached = this._attributeCache.get(key)
    if (cached) return cached
    const scratch = this._scratch!
    for (const name of scratch.getAttributeNames()) scratch.removeAttribute(name)
    setAttributes(scratch, attrs)
    const expected = Array.from(scratch.attributes, attr => [attr.name, attr.value] as const)
    if (this._attributeCache.size >= ATTRIBUTE_CACHE_LIMIT) this._attributeCache.clear()
    this._attributeCache.set(key, expected)
    return expected
  }

  private _restoreAttributes(element: Element, expected: AttributeProjection): void {
    const names = new Set(expected.map(([name]) => name))
    for (const name of element.getAttributeNames()) {
      if (!names.has(name)) element.removeAttribute(name)
    }
    for (const [name, value] of expected) {
      if (element.getAttribute(name) !== value) element.setAttribute(name, value)
    }
  }

  private _restoreSingleChild(parent: Node, expected: Node, protectedNodes: Set<Node>): void {
    for (const child of Array.from(parent.childNodes)) {
      if (child !== expected && !protectedNodes.has(child)) parent.removeChild(child)
    }
    if (parent.firstChild !== expected) parent.insertBefore(expected, parent.firstChild)
  }
}
