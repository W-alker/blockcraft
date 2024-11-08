export const isEmbedElement = (node: Element) => {
  if(!node || !(node instanceof HTMLElement)) return false
  return !node.isContentEditable
}
