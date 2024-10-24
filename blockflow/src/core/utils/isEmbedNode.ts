export const isEmbedElement = (node: Element) => {
  if(!node) return false
  return !!node.getAttribute('bf-embed')
}
