import * as Y from 'yjs';
import type {DeltaInsert} from '../../model';
import type {BlockSelection} from '../selection/blockSelection';
import {getCommonAttributesFromDeltas, sliceDelta} from '../../../global/utils/delta';
import {normalizeParagraphTextDefaults} from '../../block-std/typography/paragraph-style';

type TextPoint = {blockId: string; index: number};
type TypingFormat = {
  blockId: string;
  position: Y.RelativePosition;
  attrs: NonNullable<DeltaInsert['attributes']>;
  explicit: boolean;
};

const TYPING_FORMAT = Symbol('typing-format');

/** Input-owned, local editing state; actual text formatting remains in Y.Text. */
export class TypingFormatState {
  private current: TypingFormat | null = null;
  private historyRestore: TypingFormat | null | undefined;
  private selectedRange = false;
  private edited = false;
  private refreshFromText = false;
  private editDepth = 0;

  constructor(private readonly doc: BlockCraft.Doc) {
    const selectionSubscription = doc.selection?.selectionChange$?.subscribe(selection => this.sync(selection));
    doc.onDestroy?.(() => {
      selectionSubscription?.unsubscribe();
      this.clear();
      this.historyRestore = undefined;
    });
    doc.afterInit?.(() => this.bindHistory());
  }

  private text(blockId: string): Y.Text | null {
    if (this.doc.isPlainTextBlock?.(blockId)) return null;
    const children = this.doc.model?.getYBlock(blockId)?.get('children');
    return children instanceof Y.Text ? children : null;
  }

  private resolve(format: TypingFormat | null): TextPoint | null {
    if (!format) return null;
    const text = this.text(format.blockId);
    if (!text) return null;
    const point = Y.createAbsolutePositionFromRelativePosition(format.position, this.doc.yDoc);
    return point?.type === text ? {blockId: format.blockId, index: point.index} : null;
  }

  set(attrs: DeltaInsert['attributes'], point: TextPoint, explicit = false): void {
    const text = this.text(point.blockId);
    if (!text || point.index < 0 || point.index > text.length) {
      this.clear();
      return;
    }
    this.current = {
      blockId: point.blockId,
      position: Y.createRelativePositionFromTypeIndex(text, point.index),
      attrs: {...attrs},
      explicit,
    };
    this.selectedRange = false;
    this.edited = false;
    this.refreshFromText = false;
  }

  get(point: TextPoint, allowNearby = false): DeltaInsert['attributes'] | undefined {
    if (this.refreshFromText) return undefined;
    const currentPoint = this.resolve(this.current);
    if (!currentPoint) {
      this.clear();
      return undefined;
    }
    if (currentPoint.blockId !== point.blockId) return undefined;
    if (!this.current!.explicit && this.text(point.blockId)?.length === 0) {
      this.current = {...this.current!, attrs: this.emptyDefaults(point.blockId)};
    }
    return Math.abs(currentPoint.index - point.index) <= (allowNearby ? 1 : 0)
      ? {...this.current!.attrs}
      : undefined;
  }

  get active(): boolean {
    return !this.refreshFromText && this.resolve(this.current) !== null;
  }

  getForBlock(blockId: string): DeltaInsert['attributes'] | undefined {
    const point = this.resolve(this.current);
    return point?.blockId === blockId ? this.get(point) : undefined;
  }

  private emptyDefaults(blockId: string): NonNullable<DeltaInsert['attributes']> {
    return normalizeParagraphTextDefaults(this.doc.model?.getProps?.(blockId)?.['textDefaults']);
  }

  clear(): void {
    this.current = null;
    this.selectedRange = false;
    this.edited = false;
    this.refreshFromText = false;
  }

  runEdit<T>(callback: () => T): T {
    this.editDepth++;
    try {
      return callback();
    } finally {
      this.editDepth--;
    }
  }

  private sync(selection: BlockSelection | null): void {
    if (!selection || selection.start.type !== 'text' || selection.end.type !== 'text' || !selection.isInSameBlock) {
      this.clear();
      return;
    }
    const point = {blockId: selection.start.blockId, index: selection.start.offset};
    const text = this.text(point.blockId);
    if (!text) {
      this.clear();
      return;
    }
    if (this.historyRestore !== undefined) {
      const restored = this.resolve(this.historyRestore);
      if (selection.collapsed && restored?.blockId === point.blockId && restored.index === point.index) {
        this.current = this.historyRestore;
      } else {
        this.clear();
      }
      this.historyRestore = undefined;
    }
    // A relative caret follows local/remote inserts and deletes. The same caret
    // retains its format even when its last formatted character disappears.
    const continuesEdit = !this.selectedRange || this.edited || this.editDepth > 0;
    const retained = selection.collapsed && continuesEdit ? this.get(point) : undefined;
    if (retained !== undefined) {
      // Rebase after an edit so the anchor does not keep referring to a deleted
      // character when the text becomes empty and later receives remote input.
      if (this.edited || this.selectedRange) this.set(retained, point, this.current?.explicit);
      return;
    }

    const deltas = text.toDelta() as DeltaInsert[];
    let attrs: DeltaInsert['attributes'];
    if (selection.collapsed) {
      const index = point.index > 0 ? point.index - 1 : 0;
      attrs = text.length === 0 ? this.emptyDefaults(point.blockId) : sliceDelta(deltas, index, index + 1)[0]?.attributes;
    } else {
      attrs = getCommonAttributesFromDeltas(sliceDelta(deltas, point.index, selection.end.offset));
    }
    this.set(attrs, point);
    this.selectedRange = !selection.collapsed;
  }

  private bindHistory(): void {
    const undo = this.doc.crud.undoManager;
    const changed = (transaction: Y.Transaction) => {
      const text = this.current && this.text(this.current.blockId);
      if (text && transaction.changed.has(text as Y.AbstractType<any>)) {
        this.edited = !transaction.local || this.editDepth > 0;
        this.refreshFromText = transaction.local && this.editDepth === 0;
      }
    };
    let before: TypingFormat | null = null;
    let historyOrigin: TypingFormat | null = null;
    const historySubscription = undo.undoRedoing$.subscribe(active => {
      historyOrigin = active ? this.current : null;
    });
    const capture = () => {
      before = undo.undoRedoing$.value ? historyOrigin : this.current;
    };
    const added: Parameters<typeof undo.on>[1] = event => {
      if (!event.stackItem.meta.has(TYPING_FORMAT)) event.stackItem.meta.set(TYPING_FORMAT, before);
    };
    const popped: Parameters<typeof undo.on>[1] = event => {
      this.clear();
      this.historyRestore = event.stackItem.meta.get(TYPING_FORMAT) ?? null;
    };
    this.doc.yDoc.on('beforeTransaction', capture);
    this.doc.yDoc.on('afterTransaction', changed);
    undo.on('stack-item-added', added);
    undo.on('stack-item-popped', popped);
    this.doc.onDestroy(() => {
      historySubscription.unsubscribe();
      this.doc.yDoc.off('beforeTransaction', capture);
      this.doc.yDoc.off('afterTransaction', changed);
      undo.off('stack-item-added', added);
      undo.off('stack-item-popped', popped);
    });
  }
}
