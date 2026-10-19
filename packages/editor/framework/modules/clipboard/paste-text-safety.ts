import {BlockNodeType, type DeltaInsert} from '../../model';
import type {IBlockSnapshot} from '../../block-std/types/block.type';

// Match the message display rule, but normalize only incoming paste content.
const stackedMarks = /\p{M}{9,}/gu;

export function sanitizePasteText(text: string): string {
  return text.replace(stackedMarks, '');
}

/** Keep formatting while recognizing mark runs spanning adjacent text inserts. */
export function sanitizePasteDeltas(deltas: DeltaInsert[]): DeltaInsert[] {
  const result: DeltaInsert[] = [];
  let changed = false;
  let index = 0;
  while (index < deltas.length) {
    if (typeof deltas[index].insert !== 'string') {
      result.push(deltas[index++]);
      continue;
    }
    const start = index;
    const parts: string[] = [];
    while (index < deltas.length && typeof deltas[index].insert === 'string') {
      parts.push(deltas[index++].insert as string);
    }
    const ranges = Array.from(parts.join('').matchAll(stackedMarks), match => ({
      start: match.index!, end: match.index! + match[0].length
    }));
    if (!ranges.length) {
      for (let i = start; i < index; i++) result.push(deltas[i]);
      continue;
    }
    changed = true;
    let offset = 0;
    let rangeIndex = 0;
    for (let i = start; i < index; i++) {
      const delta = deltas[i];
      const text = delta.insert as string;
      const end = offset + text.length;
      const kept: string[] = [];
      let cursor = offset;
      while (rangeIndex < ranges.length && ranges[rangeIndex].start < end) {
        const range = ranges[rangeIndex];
        kept.push(text.slice(cursor - offset, Math.max(cursor, range.start) - offset));
        cursor = Math.min(end, range.end);
        if (range.end > end) break;
        rangeIndex++;
      }
      kept.push(text.slice(cursor - offset));
      const insert = kept.join('');
      if (insert === text) result.push(delta);
      else if (insert) result.push({...delta, insert});
      offset = end;
    }
  }
  return changed ? result : deltas;
}

/** Parsed paste snapshots are owned by the clipboard path, before any Yjs write. */
export function sanitizePasteSnapshot(snapshot: IBlockSnapshot): void {
  const pending = [snapshot];
  while (pending.length) {
    const block = pending.pop()!;
    if (block.nodeType === BlockNodeType.editable) {
      block.children = sanitizePasteDeltas(block.children);
    } else if (block.nodeType === BlockNodeType.root || block.nodeType === BlockNodeType.block) {
      for (const child of block.children) pending.push(child);
    }
  }
}
