import {STR_ZERO_WIDTH_SPACE} from "../block-std/inline";

export function createZeroSpace() {
  const emptyNode = document.createElement('span')
  emptyNode.setAttribute('data-zero-space', 'true')
  emptyNode.innerText = STR_ZERO_WIDTH_SPACE
  return emptyNode
}

export const isZeroSpace = (node: Node) => {
  let ele = node instanceof HTMLElement ? node : node.parentElement
  if (ele?.getAttribute('data-zero-space') === 'true') return ele
  return null
}

/**
 * Build a block gap filler: a `<span>` containing a real `<br>`. The browser
 * renders its NATIVE caret on that line box (above the card for the leading
 * filler, below for the trailing). This replaces the old zero-width-space + fake
 * CSS bar approach with a real, drift-free, natively-blinking caret — the way
 * Yuque renders gap cursors with `<span class="ne-i-filler"><br></span>`.
 *
 * Kept editable (`contenteditable=true`) so the filler can serve as a cursor
 * anchor even when the surrounding block is `contenteditable=false` (e.g. while
 * it is the active block-level selection target). The data attributes are kept
 * for selection detection / styling.
 */
export function createBlockGapSpace() {
  const span = document.createElement('span')
  span.setAttribute('data-zero-space', 'true')
  span.setAttribute('data-block-zero-space', 'true')
  // Explicitly editable so the gap can serve as a cursor anchor even when the
  // surrounding block is `contenteditable=false` (e.g. while it is the active
  // block-level selection target).
  span.setAttribute('contenteditable', 'true')
  span.className = 'bc-block-gap'
  span.appendChild(document.createElement('br'))
  return span
}

/**
 * Find the leading or trailing block gap filler inside a non-editable block's
 * host element and return a DOM point ON the filler span itself.
 *
 * Returns `null` if the gap span hasn't been mounted yet (e.g. before the
 * `requestAnimationFrame` callback in `BaseBlockComponent.ngAfterViewInit`).
 *
 * With the `<br>` filler there is no ZWS text node to anchor in, so the anchor
 * is the filler SPAN: `leading` returns `(span, 0)` — the natural start of a
 * block-level selection — and `trailing` returns `(span, 1)` — past the `<br>`,
 * the natural end. A whole-block `selected` range therefore spans
 * leading-start → trailing-end.
 */
export function getBlockGapAnchor(
  hostElement: HTMLElement,
  side: 'leading' | 'trailing',
): { node: Node; offset: number } | null {
  const selector = '[data-block-zero-space="true"]'
  const span = side === 'leading'
    ? hostElement.querySelector(`:scope > ${selector}:first-of-type`)
    : hostElement.querySelector(`:scope > ${selector}:last-of-type`)
  if (!(span instanceof HTMLElement)) return null
  return {
    node: span,
    offset: side === 'leading' ? 0 : 1,
  }
}

/**
 * Find the leading (`'before'`) or trailing (`'after'`) gap filler span for the
 * COLLAPSED gap caret. The caret is always placed at offset 0 of this span — i.e.
 * before the `<br>` — so the browser paints the native caret on the filler line.
 *
 * Returns `null` if the gap span hasn't been mounted yet.
 */
export function getBlockGapCaretSpan(
  hostElement: HTMLElement,
  side: 'before' | 'after',
): HTMLElement | null {
  const selector = '[data-block-zero-space="true"]'
  const span = side === 'before'
    ? hostElement.querySelector(`:scope > ${selector}:first-of-type`)
    : hostElement.querySelector(`:scope > ${selector}:last-of-type`)
  return span instanceof HTMLElement ? span : null
}

/**
 * Detect if a node is inside a block's gap filler (leading or trailing).
 *
 * Returns `'before'` if the node is inside the leading (`:first-of-type`) gap span,
 * `'after'` if inside the trailing (`:last-of-type`) gap span, else `null`.
 *
 * Robust to the caret node being the filler span itself, the inner `<br>`, or a
 * text node — uses `.closest` to climb to the owning gap span.
 */
export function resolveBlockGapSide(node: Node): 'before' | 'after' | null {
  const start = node instanceof HTMLElement ? node : node.parentElement
  const span = start?.closest('[data-block-zero-space="true"]')
  if (!(span instanceof HTMLElement)) return null
  const host = span.parentElement
  if (!host) return null
  // Enumerate the host's direct gap children explicitly. Using `:first-of-type` /
  // `:last-of-type` would let an unrelated sibling span (e.g. a FakeRange
  // `<span class="blockcraft-cursor">` appended to the host) shadow the real
  // trailing gap and resolve to `null`.
  const gaps = host.querySelectorAll(':scope > [data-block-zero-space="true"]')
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
