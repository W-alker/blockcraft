import {Subscription} from 'rxjs';
import type {IInlineNodeAttrs} from '../../../framework/model';
import type {ISelectionJSON} from '../../../framework/modules/selection/types';
import {
  captureRelativeSelectionBookmark,
  resolveRelativeSelectionBookmark,
  sameSelectionJSON,
} from '../../../framework/modules/selection/relative-bookmark';

/** Internal ownership of a selection while a toolbar input temporarily owns focus. */
export class ToolbarSelectionSession {
  private readonly subscriptions = new Subscription();
  private readonly bookmark;
  private fake?: {destroy(): void};
  private pending?: IInlineNodeAttrs;
  private frame: number | null = null;
  private replaying = false;
  private disposed = false;
  private readonly view: Window;

  constructor(
    private readonly doc: BlockCraft.Doc,
    source: ISelectionJSON,
    private readonly onInvalidate: () => void,
  ) {
    this.view = doc.root.hostElement.ownerDocument.defaultView!;
    this.bookmark = captureRelativeSelectionBookmark(source as any, doc);
    this.capturePending();
    this.subscriptions.add(doc.selection.changeObserve().subscribe(selection => {
      if (this.replaying || !selection) return;
      const saved = this.resolve();
      const live = selection.toJSON();
      // Native focus restoration may reverse anchor/head without changing the range.
      // It is still the saved selection, not a new editing target.
      if (sameSelectionJSON(live, saved) || saved && sameSelectionJSON(live, {
        ...saved, anchor: saved.head, head: saved.anchor,
      })) return;
      this.invalidate();
    }));
    this.subscriptions.add(doc.model.contentChange$.subscribe(() => this.schedulePaint()));
    this.subscriptions.add(doc.model.structureChange$.subscribe(() => this.schedulePaint()));
    this.subscriptions.add(doc.virtualization?.viewChange$?.subscribe(() => this.schedulePaint()));
    this.subscriptions.add(doc.onDestroy$.subscribe(() => this.invalidate()));
    this.subscriptions.add(doc.readonlySwitch$.subscribe(readonly => {
      if (readonly) this.invalidate();
    }));
    const observer = new MutationObserver(() => {
      if (!doc.root.hostElement.isConnected) this.invalidate();
    });
    observer.observe(doc.root.hostElement.ownerDocument, {childList: true, subtree: true});
    this.subscriptions.add(() => observer.disconnect());
    this.paint();
  }

  resolve(): ISelectionJSON | null {
    return !this.disposed && this.bookmark && this.doc.root.hostElement.isConnected
      ? resolveRelativeSelectionBookmark(this.bookmark, this.doc) : null;
  }

  restore(): boolean {
    const saved = this.resolve();
    if (!saved || this.doc.isReadonly) return false;
    this.replaying = true;
    try {
      this.doc.selection.replay(saved);
      const live = this.doc.selection.value;
      if (!live) return false;
      if (this.pending && live.collapsed && live.start.type === 'text') {
        this.doc.inputManger.setNextInsertAttrs(this.pending, {blockId: live.start.blockId, index: live.start.offset});
      }
      return true;
    } catch {
      return false;
    } finally {
      this.replaying = false;
    }
  }

  run(apply: () => void): boolean {
    if (!this.restore()) return false;
    this.replaying = true;
    try {
      apply();
      this.capturePending();
      this.schedulePaint();
      return true;
    } finally {
      this.replaying = false;
    }
  }

  finish(restore: boolean): ISelectionJSON | null {
    const saved = restore && this.restore() ? this.doc.selection.value?.toJSON() ?? null : null;
    this.dispose();
    return saved;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.frame !== null) this.view.cancelAnimationFrame(this.frame);
    this.frame = null;
    this.subscriptions.unsubscribe();
    this.fake?.destroy();
    this.fake = undefined;
  }

  private invalidate(): void {
    if (this.disposed) return;
    this.dispose();
    this.onInvalidate();
  }

  private capturePending(): void {
    const selection = this.doc.selection.value;
    this.pending = selection?.collapsed && selection.start.type === 'text'
      ? this.doc.inputManger.peekNextInsertAttrs({blockId: selection.start.blockId, index: selection.start.offset}) ?? undefined
      : undefined;
  }

  private schedulePaint(): void {
    if (this.disposed || this.frame !== null) return;
    this.frame = this.view.requestAnimationFrame(() => {
      this.frame = null;
      this.paint();
    });
  }

  private paint(): void {
    this.fake?.destroy();
    this.fake = undefined;
    const saved = this.resolve();
    if (!saved) {
      this.invalidate();
      return;
    }
    // FakeRange is a bounded projection of mounted views; it does not pin the document.
    try {
      this.fake = this.doc.selection.createFakeRange(saved);
    } catch {
      // The view may be remounting; the next view change retries this projection.
    }
  }
}
