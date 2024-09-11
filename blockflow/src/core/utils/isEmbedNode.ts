export const isEmbedElement = (node: Element) => {
  return !!node.getAttribute('bf-embed')
}
