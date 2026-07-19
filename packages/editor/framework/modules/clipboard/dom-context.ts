export function getClipboardOwnerDocument(doc: BlockCraft.Doc): Document {
  try {
    return doc.root?.hostElement.ownerDocument ?? document
  } catch {
    return document
  }
}

export function getClipboardNavigator(doc: BlockCraft.Doc): Navigator {
  return getClipboardOwnerDocument(doc).defaultView?.navigator ?? navigator
}
