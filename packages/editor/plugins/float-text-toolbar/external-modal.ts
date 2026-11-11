/** An editor embedded in a modal can still use its own selection toolbar. */
export function isExternalModalOpen(doc: BlockCraft.Doc): boolean {
  const editor = doc.scrollContainer;
  const ownerDocument = editor?.ownerDocument ?? document;
  return Array.from(ownerDocument.querySelectorAll('[aria-modal="true"]'))
    .some(modal => !editor || !modal.contains(editor));
}
