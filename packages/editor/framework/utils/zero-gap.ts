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

export function createBlockGapSpace() {
  const emptyNode = createZeroSpace()
  emptyNode.setAttribute('data-block-zero-space', 'true')
  return emptyNode
}

/**
 * Find the leading or trailing block gap space inside a non-editable block's
 * host element and return a DOM point inside its zero-width text node.
 *
 * Returns `null` if the gap span hasn't been mounted yet (e.g. before the
 * `requestAnimationFrame` callback in `BaseBlockComponent.ngAfterViewInit`).
 *
 * `leading` returns `(textNode, 0)` — Safari treats this as "before the ZWS",
 * which is the natural start of a block-level selection.
 * `trailing` returns `(textNode, 1)` — past the ZWS character, the natural end.
 */
export function getBlockGapAnchor(
  hostElement: HTMLElement,
  side: 'leading' | 'trailing',
): { node: Text; offset: number } | null {
  const selector = '[data-block-zero-space="true"]'
  const span = side === 'leading'
    ? hostElement.querySelector(`:scope > ${selector}:first-of-type`)
    : hostElement.querySelector(`:scope > ${selector}:last-of-type`)
  const textNode = span?.firstChild
  if (!(textNode instanceof Text)) return null
  return {
    node: textNode,
    offset: side === 'leading' ? 0 : textNode.length,
  }
}

export const isBlockGapSpace = (node: Node | null | undefined): HTMLElement | null => {
  if (!node) return null
  const ele = node instanceof HTMLElement ? node : node.parentElement
  if (ele?.getAttribute('data-block-zero-space') === 'true') return ele
  return null
}
