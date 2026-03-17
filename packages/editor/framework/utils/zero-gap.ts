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
