export function closetBlockId(node: Node) {
  return (node instanceof HTMLElement ? node : node.parentElement)?.closest('[data-block-id]')?.getAttribute('data-block-id')
}
