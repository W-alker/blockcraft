import {BlockNodeType} from '../block-std';
import {getSelectionCoveredBlockIds} from '../modules/selection/covered-blocks';
import {resolveTableCellSelectionTarget} from '../modules/table/table-cell-selection-target';

/** Table rectangles use model-owned master cells, including merged-cell closure. */
export function getSelectionFormatRootIds(
  selection: BlockCraft.Selection,
  doc: BlockCraft.Doc,
): string[] {
  const tableSelection = selection.getTableCellSelection?.();
  if (tableSelection) {
    return [...(resolveTableCellSelectionTarget(doc, tableSelection)?.visibleCellIds ?? [])];
  }
  return getSelectionCoveredBlockIds(selection, doc);
}

export function isSelectedContainer(selection: BlockCraft.Selection, doc: BlockCraft.Doc): boolean {
  if (selection.start.type !== 'selected' || selection.end.type !== 'selected' ||
      selection.start.blockId !== selection.end.blockId) return false;
  const id = selection.start.blockId;
  try {
    return doc.model?.exists(id)
      ? doc.model.getNodeType(id) === BlockNodeType.block
      : doc.getBlockById(id)?.nodeType === BlockNodeType.block;
  } catch {
    return false;
  }
}

/** Expand covered containers to their leaf blocks for text/paragraph commands. */
export function getSelectionFormatBlockIds(
  selection: BlockCraft.Selection,
  doc: BlockCraft.Doc,
): string[] {
  const roots = getSelectionFormatRootIds(selection, doc);
  const result: string[] = [];
  const visited = new Set<string>();
  const stack = [...roots].reverse();
  while (stack.length) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const inModel = doc.model?.exists(id);
    let block: BlockCraft.BlockComponent | null = null;
    if (!inModel) {
      try {
        block = doc.getBlockById(id);
      } catch {
        continue;
      }
    }
    const nodeType = inModel ? doc.model.getNodeType(id) : block?.nodeType;
    if (nodeType === BlockNodeType.block) {
      const children = inModel ? doc.model.getChildrenIds(id) : block?.childrenIds ?? [];
      for (let index = children.length - 1; index >= 0; index--) {
        stack.push(children[index]);
      }
    } else if (nodeType !== undefined) {
      result.push(id);
    }
  }
  return result;
}
