import type {IBlockSnapshot} from '../../block-std/types/block.type';

/** @internal Explicit user insertion only; never focus from block lifecycle/upload completion. */
export function focusAfterImageInsertion(
  doc: BlockCraft.Doc,
  block: Pick<IBlockSnapshot, 'id' | 'flavour'>,
): boolean {
  if (block.flavour !== 'image') return false;
  // SelectionManager falls back to object selection when placement has no gap.
  doc.selection.setGapCursor(block.id, 'after', true);
  doc.crud.undoManager.stopCapturing();
  return true;
}
