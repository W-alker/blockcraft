import {BlockNodeType, EditableBlockComponent} from "../../block-std";

export type SelectionRestorePreference = "next" | "previous";

export function focusBlockSelectionEdge(
  doc: BlockCraft.Doc,
  block: BlockCraft.BlockComponent,
  atStart: boolean,
): boolean {
  try {
    if (doc.isEditable(block)) {
      const offset = atStart ? 0 : (block as EditableBlockComponent).textLength;
      doc.selection.replay({
        anchor: {blockId: block.id, type: "text", offset},
        head: {blockId: block.id, type: "text", offset},
        commonParent: block.id,
      });
      return true;
    }

    if (block.nodeType === BlockNodeType.void || block.nodeType === BlockNodeType.block) {
      doc.selection.setGapCursor(block, atStart ? "before" : "after");
      return true;
    }

    doc.selection.selectBlock(block);
    return true;
  } catch {
    return false;
  }
}

export function restoreSelectionAfterBlockDelete(
  doc: BlockCraft.Doc,
  parent: BlockCraft.BlockComponent | null | undefined,
  deletedIndex: number,
  prevBlock: BlockCraft.BlockComponent | null | undefined,
  nextBlock: BlockCraft.BlockComponent | null | undefined,
  preference: SelectionRestorePreference = "next",
): void {
  if (preference === "previous") {
    if (prevBlock && focusBlockSelectionEdge(doc, prevBlock, false)) return;
    if (nextBlock && focusBlockSelectionEdge(doc, nextBlock, true)) return;
  } else {
    if (nextBlock && focusBlockSelectionEdge(doc, nextBlock, true)) return;
    if (prevBlock && focusBlockSelectionEdge(doc, prevBlock, false)) return;
  }

  const fallback = childAt(doc, parent, deletedIndex);
  if (fallback && focusBlockSelectionEdge(doc, fallback, true)) return;

  doc.selection.blur();
}

export function moveGapCaretAway(
  doc: BlockCraft.Doc,
  selection: BlockCraft.Selection,
  side: "before" | "after",
): boolean {
  if (
    !selection.collapsed ||
    selection.start.type !== "gap" ||
    selection.start.side !== side
  ) {
    return false;
  }

  const block = selection.start.block;
  const sibling = side === "before"
    ? doc.prevSibling(block)
    : doc.nextSibling(block);

  if (sibling) {
    focusBlockSelectionEdge(doc, sibling, side === "after");
  }
  return true;
}

function childAt(
  doc: BlockCraft.Doc,
  parent: BlockCraft.BlockComponent | null | undefined,
  preferredIndex: number,
): BlockCraft.BlockComponent | null {
  if (!parent?.childrenLength) return null;
  const index = Math.max(0, Math.min(preferredIndex, parent.childrenLength - 1));
  const childId = parent.childrenIds?.[index];
  if (!childId) return null;

  try {
    return doc.getBlockById(childId) ?? null;
  } catch {
    return null;
  }
}
