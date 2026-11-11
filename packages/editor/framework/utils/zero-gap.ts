import {STR_ZERO_WIDTH_SPACE} from "../block-std/inline";

function isElementNode(node: unknown): node is HTMLElement {
  return !!node && typeof (node as Node).nodeType === 'number' && (node as Node).nodeType === 1
}

export function createZeroSpace() {
  const emptyNode = document.createElement('span')
  emptyNode.setAttribute('data-zero-space', 'true')
  emptyNode.innerText = STR_ZERO_WIDTH_SPACE
  return emptyNode
}

export const isZeroSpace = (node: Node | null | undefined) => {
  if (!node) return null
  const ele = isElementNode(node) ? node : node.parentElement
  if (ele?.getAttribute('data-zero-space') === 'true') return ele
  return null
}

/**
 * Build a block gap filler: a contenteditable span containing only a zero-width
 * text node. The text node gives Safari/WebKit a real native caret anchor while
 * keeping the filler out of the document model.
 *
 * Kept editable (`contenteditable=true`) so the filler can serve as a cursor
 * anchor even when the surrounding block is `contenteditable=false` (e.g. while
 * it is the active block-level selection target). The data attributes are kept
 * for selection detection / styling.
 */
export type BlockGapSide = 'before' | 'after'

export function createBlockGapSpace(side: BlockGapSide) {
  const span = document.createElement('span')
  span.setAttribute('data-zero-space', 'true')
  span.setAttribute('data-block-zero-space', 'true')
  span.setAttribute('data-block-gap-side', side)
  // Explicitly editable so the gap can serve as a cursor anchor even when the
  // surrounding block is `contenteditable=false` (e.g. while it is the active
  // block-level selection target).
  span.setAttribute('contenteditable', 'true')
  span.className = 'bc-block-gap'
  span.appendChild(document.createTextNode(STR_ZERO_WIDTH_SPACE))
  return span
}

function getDirectBlockGapSpans(hostElement: HTMLElement): HTMLElement[] {
  return Array.from(hostElement.querySelectorAll(':scope > [data-block-zero-space="true"]'))
    .filter(isElementNode)
}

function getBlockGapTextNode(span: HTMLElement): Text | null {
  const node = span.firstChild
  return node?.nodeType === 3 ? node as Text : null
}

/**
 * Find the leading or trailing block gap filler inside a non-editable block's
 * host element and return a DOM point inside its zero-width text anchor.
 *
 * Returns `null` if the gap span hasn't been mounted yet (e.g. before the
 * `requestAnimationFrame` callback in `BaseBlockComponent.ngAfterViewInit`).
 *
 * A whole-block `selected` range spans leading text offset 0 → trailing text
 * offset `text.length`.
 */
export function getBlockGapAnchor(
  hostElement: HTMLElement,
  side: 'leading' | 'trailing',
): { node: Node; offset: number } | null {
  const gaps = getDirectBlockGapSpans(hostElement)
  const span = side === 'leading' ? gaps[0] : gaps[gaps.length - 1]
  if (!span) return null
  const text = getBlockGapTextNode(span)
  if (text) {
    return {
      node: text,
      offset: side === 'leading' ? 0 : text.length,
    }
  }
  return {
    node: span,
    offset: side === 'leading' ? 0 : span.childNodes.length,
  }
}

/**
 * Find the leading (`'before'`) or trailing (`'after'`) gap filler span for the
 * COLLAPSED gap caret.
 *
 * Returns `null` if the gap span hasn't been mounted yet.
 */
export function getBlockGapCaretSpan(
  hostElement: HTMLElement,
  side: 'before' | 'after',
): HTMLElement | null {
  const gaps = getDirectBlockGapSpans(hostElement)
  return (side === 'before' ? gaps[0] : gaps[gaps.length - 1]) ?? null
}

/**
 * Detect if a node is inside a block's gap filler (leading or trailing).
 *
 * Returns `'before'` if the node is inside the leading (`:first-of-type`) gap span,
 * `'after'` if inside the trailing (`:last-of-type`) gap span, else `null`.
 *
 * Robust to the caret node being the filler span itself or the zero-width text
 * node — uses `.closest` to climb to the owning gap span.
 */
export function resolveBlockGapSide(node: Node): 'before' | 'after' | null {
  const start = isElementNode(node) ? node : node.parentElement
  const span = start?.closest('[data-block-zero-space="true"]')
  if (!isElementNode(span)) return null
  const host = span.parentElement
  if (!host) return null
  // Enumerate the host's direct gap children explicitly. Using `:first-of-type` /
  // `:last-of-type` would let an unrelated sibling span (e.g. a FakeRange
  // `<span class="blockcraft-cursor">` appended to the host) shadow the real
  // trailing gap and resolve to `null`.
  const gaps = getDirectBlockGapSpans(host)
  if (gaps.length === 0) return null
  if (span === gaps[0]) return 'before'
  if (span === gaps[gaps.length - 1]) return 'after'
  return null
}

/** Minimal rect shape — a subset of `DOMRect` for pure geometry helpers. */
export interface IGapRect {
  readonly top: number
  readonly bottom: number
  readonly left: number
  readonly right: number
}

/**
 * Decide which gap side a blank-area click falls on relative to a block's
 * content-box rect.
 *
 * Geometry: a click strictly above the top edge OR strictly left of the left
 * edge resolves to `'before'`; a click strictly below the bottom edge OR
 * strictly right of the right edge resolves to `'after'`. A click inside the
 * content box (no clear side) returns `null` so the caller can fall back to
 * native handling. The `before` checks take precedence over `after`, so a click
 * in the top-right corner counts as `'before'` (it is above the content).
 *
 * Pure function — no DOM access — to keep the click geometry unit-testable.
 */
export function resolveGapSideFromRect(
  rect: IGapRect,
  x: number,
  y: number,
): 'before' | 'after' | null {
  if (y < rect.top || x < rect.left) return 'before'
  if (y > rect.bottom || x > rect.right) return 'after'
  return null
}
