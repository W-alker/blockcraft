export const isEmbedElement = (node: Node) => {
  if(!node || !(node instanceof HTMLElement)) return false
  return !node.isContentEditable
}
