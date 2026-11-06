import {getMountedSelectionCoveredBlockIds} from '../selection/covered-blocks';
import {Subscription} from 'rxjs';
import {ObjectAnimationPlayer} from './animation/player';
import {normalizeObjectAnimation, storeObjectAnimation} from './animation/config';

export {OBJECT_ANIMATION_EFFECTS, normalizeObjectAnimation, storeObjectAnimation} from './animation/config';
export type {ObjectAnimationConfig, ObjectAnimationEffect} from './animation/config';

/** Object presentation boundary: authored props use CRUD; playback is local to this Doc. */
export class BlockObjectAnimationManager {
  private player?: ObjectAnimationPlayer;
  private previewPlayer?: ObjectAnimationPlayer;
  private readonly views = new Map<string, {block: BlockCraft.BlockComponent; sync: () => void; release: () => void}>();
  private readonly subscriptions = new Subscription();
  private destroyed = false;
  private readonly editingLeases = new Set<readonly string[]>();
  private readonly previewIds = new Set<string>();
  private readonly animatedIds = new Set<string>();
  private pointerIds: string[] = [];

  constructor(private readonly doc: BlockCraft.Doc) {
    doc.afterInit(root => {
      if (this.destroyed) return;
      doc.ngZone.runOutsideAngular(() => {
        this.player = new ObjectAnimationPlayer(root.hostElement.ownerDocument);
        for (const view of this.views.values()) view.sync();
        this.subscriptions.add(doc.readonlySwitch$.subscribe(() => {
          this.player?.setEnabled(false);
          this.clearPreview();
          this.pointerIds = [];
          this.syncSuspension();
          this.player?.setEnabled(true);
        }));
        this.subscriptions.add(doc.selection.selectionChange$.subscribe(selection => {
          if (selection) this.clearPreview();
          this.syncSuspension();
        }));
        this.subscriptions.add(doc.model.structureChange$.subscribe(change => {
          for (const id of change.reachableRemovedIds) this.player?.forget(id);
          this.syncSuspension();
        }));
        // Cancel before selection, drag, resize or typing reads geometry.
        const owner = root.hostElement.ownerDocument;
        const interrupt = (event: Event) => {
          if (doc.isReadonly || !(event.target instanceof Node) || !root.hostElement.contains(event.target)) return;
          this.clearPreview();
          if (event.type === 'pointerdown') {
            const element = event.target instanceof Element ? event.target : event.target.parentElement;
            const id = element?.closest('[data-block-id]')?.getAttribute('data-block-id');
            this.pointerIds = id && id !== doc.rootId ? [id] : [];
          }
          this.syncSuspension();
        };
        const releasePointer = () => { this.pointerIds = []; this.syncSuspension(); };
        // Suspend before object plugins read drag/resize geometry; reconcile after their pointer-up work.
        owner.addEventListener('pointerdown', interrupt, true);
        owner.addEventListener('keydown', interrupt, true);
        owner.addEventListener('pointerup', releasePointer);
        owner.addEventListener('pointercancel', releasePointer);
        owner.defaultView?.addEventListener('blur', releasePointer);
        this.subscriptions.add(() => {
          owner.removeEventListener('pointerdown', interrupt, true);
          owner.removeEventListener('keydown', interrupt, true);
          owner.removeEventListener('pointerup', releasePointer);
          owner.removeEventListener('pointercancel', releasePointer);
          owner.defaultView?.removeEventListener('blur', releasePointer);
        });
      });
    });
  }

  supports(blockId: string): boolean {
    const flavour = this.doc.model.getFlavour(blockId);
    return !!flavour && !!this.doc.schemas.get(flavour, false)?.metadata.placement?.modes.includes('absolute');
  }

  getSelectionIds(selection = this.doc.selection.value): string[] {
    if (!selection) return [];
    const ids = this.doc.placement.getAbsoluteObjectSelectionIds(selection) ??
      (selection.isInSameBlock && selection.anchor.type === 'selected' && selection.head.type === 'selected'
        ? [selection.firstBlockId] : []);
    return ids.every(id => this.supports(id)) ? ids : [];
  }

  read(blockId: string) { return normalizeObjectAnimation(this.doc.model.getProps(blockId)?.['animation']); }

  update(blockIds: readonly string[], value: unknown): boolean {
    const ids = [...new Set(blockIds)];
    if (!ids.length || this.doc.isReadonly || ids.some(id => !this.supports(id) || this.doc.readonlyManager.isReadonly(id))) return false;
    const animation = storeObjectAnimation(value);
    if (animation === null && value != null && value !== 'none') return false;
    const updates = ids.filter(id => (this.doc.model.getProps(id)?.['animation'] ?? null) !== animation);
    if (!updates.length) return false;
    this.doc.crud.undoManager.captureUndoItem(() => this.doc.crud.transact(() => {
      for (const id of updates) this.doc.crud.updateBlockProps(id, {animation});
    }));
    return true;
  }

  /** Preview an optional draft without writing props or changing reader playback data. */
  preview(blockIds: readonly string[], draft?: unknown): boolean {
    if (this.doc.isReadonly) return false;
    this.stopPreview();
    let played = false;
    this.doc.ngZone.runOutsideAngular(() => {
      for (const id of new Set(blockIds)) {
        const view = this.views.get(id);
        if (view && this.supports(id) && !this.doc.readonlyManager.isReadonly(id)) {
          const config = normalizeObjectAnimation(draft === undefined ? this.doc.model.getProps(id)?.['animation'] : draft);
          if (!config) continue;
          this.previewIds.add(id);
          this.player?.setSuspended(view.block.hostElement, true);
          this.previewPlayer ??= new ObjectAnimationPlayer(view.block.hostElement.ownerDocument);
          this.previewPlayer.set(view.block.hostElement, id, config);
          const started = this.previewPlayer.preview(view.block.hostElement, () => {
            this.previewIds.delete(id);
            this.syncSuspension();
          });
          if (!started) { this.previewIds.delete(id); this.syncSuspension(); }
          played = started || played;
        }
      }
    });
    return played;
  }

  stop(): void { this.stopPreview(); this.player?.stopAll(); }
  /** Stop temporary previews without stopping saved animations on other objects. */
  stopPreview(): void { this.clearPreview(); this.syncSuspension(); }
  private clearPreview(): void {
    this.previewPlayer?.destroy(); this.previewPlayer = undefined; this.previewIds.clear();
  }

  /** Keep objects static while their toolbar owns focus, including native selection blur. */
  acquireEditingLease(blockIds: readonly string[]): () => void {
    const ids = [...new Set(blockIds)];
    this.editingLeases.add(ids);
    this.syncSuspension();
    return () => { if (this.editingLeases.delete(ids)) this.syncSuspension(); };
  }

  private related(id: string, other: string): boolean {
    return id === other || !!this.doc.model.getPath(id)?.includes(other) || !!this.doc.model.getPath(other)?.includes(id);
  }
  private isSuspended(id: string): boolean {
    if (this.doc.isReadonly) return false;
    if (this.previewIds.has(id) || this.pointerIds.some(other => this.related(id, other))) return true;
    for (const ids of this.editingLeases) if (ids.some(other => this.related(id, other))) return true;
    const selection = this.doc.selection.value;
    if (!selection) return false;
    if (getMountedSelectionCoveredBlockIds(selection, this.doc, [id]).length) return true;
    return [selection.anchor, selection.head].some(point =>
      point.type !== 'gap' && point.type !== 'boundary' && this.related(id, point.blockId));
  }
  private syncSuspension(): void {
    if (this.destroyed) return;
    this.doc.ngZone.runOutsideAngular(() => {
      for (const id of this.animatedIds) {
        const block = this.views.get(id)?.block;
        if (block) this.player?.setSuspended(block.hostElement, this.isSuspended(id));
      }
    });
  }
  get reducedMotion(): boolean { return this.player?.reducedMotion ?? false; }

  /** @internal Only placement-capable views register; no full-document DOM traversal. */
  registerBlockView(block: BlockCraft.BlockComponent): () => void {
    this.views.get(block.id)?.release();
    const subscription = new Subscription();
    const sync = () => {
      const animation = this.doc.model.getProps(block.id)?.['animation'];
      if (block.viewState === 'mounted' && animation) {
        this.animatedIds.add(block.id);
        this.player?.set(block.hostElement, block.id, animation, this.isSuspended(block.id));
      } else {
        this.animatedIds.delete(block.id);
        this.player?.remove(block.hostElement);
      }
    };
    subscription.add(block.onPropsChange.subscribe(changes => {
      if ([...(changes as ReadonlyMap<PropertyKey, unknown>).keys()].some(key => key !== 'animation')) {
        this.previewPlayer?.remove(block.hostElement);
        this.previewIds.delete(block.id);
        if (!this.isSuspended(block.id)) this.player?.stop(block.hostElement);
      }
      sync();
    }));
    subscription.add(block.onDetach$.subscribe(() => {
      this.previewPlayer?.remove(block.hostElement);
      this.player?.remove(block.hostElement);
      this.previewIds.delete(block.id);
      this.animatedIds.delete(block.id);
    }));
    subscription.add(block.onReattach$.subscribe(sync));
    const release = () => {
      subscription.unsubscribe();
      this.previewPlayer?.remove(block.hostElement);
      this.player?.remove(block.hostElement);
      this.previewIds.delete(block.id);
      this.animatedIds.delete(block.id);
      if (this.views.get(block.id)?.block === block) this.views.delete(block.id);
    };
    this.views.set(block.id, {block, sync, release});
    sync();
    return release;
  }

  destroy(): void {
    this.destroyed = true;
    this.clearPreview();
    this.subscriptions.unsubscribe();
    for (const view of [...this.views.values()]) view.release();
    this.player?.destroy();
    this.player = undefined;
    this.editingLeases.clear();
    this.pointerIds = [];
  }
}
