import {asyncScheduler, Observable, Subject, Subscription, throttleTime} from "rxjs";
import * as Y from "yjs";
import {BlockCraftError, ErrorCode} from "../../global";
import {
  BlockReadonlyBlocker,
  BlockReadonlyError,
  BlockReadonlyOperation,
  BlockReadonlyResolution,
  BlockReadonlyViolation,
  BlockReadonlyViolationTrigger,
  BlockRef,
} from "./block-readonly.types";
import {IMetaChangeEvent} from "./crud";
import {IBlockModelStructureChange} from "./model-graph";
import {ORIGIN_BLOCK_READONLY_CONTROL} from "./origins";

/**
 * Resolves persistent block locks against the model graph.
 *
 * The graph remains the only source of structural truth. This manager stores
 * permission-derived state only, so reachable blocks do not need a mounted
 * Angular component in order to be protected.
 */
export class BlockReadonlyManager {
  private readonly explicitIds = new Set<string>();
  private readonly subtreeLockCount = new Map<string, number>();
  private readonly resolutionCache = new Map<string, BlockReadonlyResolution>();
  private readonly subscriptions = new Subscription();
  private readonly violationSubject = new Subject<BlockReadonlyViolation>();
  private readonly stateChangeSubject = new Subject<void>();

  private initialized = false;
  private systemRepairDepth = 0;
  private permissionRevision = 0;
  private indexedPermissionRevision = -1;
  private indexedStructureRevision = -1;

  readonly violation$: Observable<BlockReadonlyViolation> = this.violationSubject.pipe(
    throttleTime(300, asyncScheduler, {leading: true, trailing: false}),
  );
  readonly stateChange$: Observable<void> = this.stateChangeSubject.asObservable();

  /** Internal transaction scope for deterministic model consistency repair. */
  runSystemRepair<T>(repair: () => T): T {
    this.systemRepairDepth++;
    try {
      return repair();
    } finally {
      this.systemRepairDepth--;
    }
  }

  constructor(private readonly doc: BlockCraft.Doc) {
    // BlockCraftDoc creates this service before its Y block map and root view
    // are ready. Defer every model/Yjs read until the document is initialized.
    this.doc.afterInit(() => this.init());
    this.doc.onDestroy(() => this.destroy());
  }

  isExplicitReadonly(block: BlockRef): boolean {
    const blockId = this.getBlockId(block);
    return this.explicitIds.has(blockId);
  }

  resolve(block: BlockRef): BlockReadonlyResolution {
    // Angular renders the Root component before BlockModelGraph.build(). During
    // that short bootstrap window readonlySwitch$ is deliberately true, so the
    // document policy can be answered without asking an index that is not ready.
    if (!this.initialized && this.doc.isReadonly) {
      return {readonly: true, source: {kind: "document"}};
    }
    const blockId = this.getBlockId(block);
    if (this.doc.isReadonly) {
      return {readonly: true, source: {kind: "document"}};
    }

    const cached = this.resolutionCache.get(blockId);
    if (cached) return cached;

    if (this.explicitIds.has(blockId)) {
      const resolution: BlockReadonlyResolution = {
        readonly: true,
        source: {kind: "self", blockId},
      };
      this.resolutionCache.set(blockId, resolution);
      return resolution;
    }

    const path = this.doc.model.getPath(blockId);
    if (!path) this.throwMissingBlock(blockId);
    for (let index = path.length - 2; index >= 0; index--) {
      const ancestorId = path[index];
      if (this.explicitIds.has(ancestorId)) {
        const resolution: BlockReadonlyResolution = {
          readonly: true,
          source: {kind: "ancestor", blockId: ancestorId},
        };
        this.resolutionCache.set(blockId, resolution);
        return resolution;
      }
    }

    const resolution: BlockReadonlyResolution = {readonly: false, source: null};
    this.resolutionCache.set(blockId, resolution);
    return resolution;
  }

  isReadonly(block: BlockRef): boolean {
    return this.resolve(block).readonly;
  }

  /** Pure selection-level query for toolbar visibility and other read paths. */
  isSelectionReadonly(selection: BlockCraft.Selection): boolean {
    if (this.doc.isReadonly) return true;
    try {
      const start = selection.start;
      const end = selection.end;
      if (!this.doc.model.exists(start.blockId) || !this.doc.model.exists(end.blockId)) {
        return true;
      }

      let blockIds: readonly string[];
      if (
        start.type === "boundary" &&
        end.type === "boundary" &&
        start.blockId === end.blockId
      ) {
        const children = this.doc.model.getChildrenIds(start.blockId);
        const from = Math.min(start.index, end.index);
        const to = Math.max(start.index, end.index);
        if (from < 0 || to > children.length) return true;
        blockIds = children.slice(from, to);
      } else if (selection.isInSameBlock) {
        blockIds = [start.blockId];
      } else {
        blockIds = this.doc.model.queryBetween(start.blockId, end.blockId, true);
        if (!blockIds.length) return true;
      }

      return blockIds.some(blockId => this.isReadonly(blockId));
    } catch {
      // Structure observers run before Input/Undo publishes the replacement
      // selection. Treat that short stale-selection window as non-editable so
      // read-only UI closes without leaking a Block not found exception.
      return true;
    }
  }

  /** Returns whether the block's reachable subtree contains an explicit lock. */
  containsReadonly(block: BlockRef): boolean {
    const blockId = this.getBlockId(block);
    this.ensureSubtreeLockCounts();
    return (this.subtreeLockCount.get(blockId) ?? 0) > 0;
  }

  set(block: BlockRef, readonly: boolean): void {
    const blockId = this.getBlockId(block);
    const yBlock = this.doc.model.getYBlock(blockId);
    if (!yBlock) this.throwMissingBlock(blockId);

    const yMeta = yBlock.get("meta");
    if (!(yMeta instanceof Y.Map)) {
      throw new BlockCraftError(
        ErrorCode.ModelCRUDError,
        `Invalid block metadata: ${blockId}`,
      );
    }

    if (blockId === this.doc.rootId && readonly) {
      this.reject(
        BlockReadonlyOperation.Props,
        [blockId],
        {kind: "self", blockId},
        "api",
      );
    }

    const current = yMeta.get("readonly") === true;
    if (current === readonly) return;

    this.doc.crud.transact(() => {
      if (readonly) yMeta.set("readonly", true);
      else yMeta.delete("readonly");
    }, ORIGIN_BLOCK_READONLY_CONTROL);

    // DocCRUD emits synchronously in a real document. Keeping this idempotent
    // update also makes the manager correct for lightweight/model-only hosts.
    const changed = this.updateExplicit(blockId, readonly && blockId !== this.doc.rootId);
    this.refreshSubtree(blockId);
    if (changed) this.stateChangeSubject.next();
  }

  assertTextWritable(
    block: BlockRef,
    operation: BlockReadonlyOperation,
    trigger: BlockReadonlyViolationTrigger = "api",
  ): void {
    this.assertEffectiveWritable(block, operation, trigger);
  }

  assertPropsWritable(
    block: BlockRef,
    operation: BlockReadonlyOperation,
    trigger: BlockReadonlyViolationTrigger = "api",
  ): void {
    this.assertEffectiveWritable(block, operation, trigger);
  }

  assertInsertable(
    parent: BlockRef,
    operation: BlockReadonlyOperation,
    trigger: BlockReadonlyViolationTrigger = "api",
  ): void {
    this.assertEffectiveWritable(parent, operation, trigger);
  }

  assertRemovable(
    blocks: readonly BlockRef[],
    operation: BlockReadonlyOperation,
    trigger: BlockReadonlyViolationTrigger = "api",
  ): void {
    if (this.systemRepairDepth > 0) return;
    for (const block of blocks) {
      const blockId = this.getBlockId(block);
      const resolution = this.resolve(blockId);
      if (resolution.readonly && resolution.source) {
        this.reject(operation, [blockId], resolution.source, trigger);
      }

      if (!this.containsReadonly(blockId)) continue;
      const descendantId = this.findLockedDescendant(blockId);
      if (descendantId) {
        this.reject(
          operation,
          [blockId],
          {kind: "descendant", blockId: descendantId},
          trigger,
        );
      }
    }
  }

  assertMovable(
    blocks: readonly BlockRef[],
    targetParent: BlockRef,
    operation: BlockReadonlyOperation,
    trigger: BlockReadonlyViolationTrigger = "api",
  ): void {
    this.assertRemovable(blocks, operation, trigger);
    this.assertInsertable(targetParent, operation, trigger);
  }

  /**
   * Guards an entire history item before Yjs pops it from the undo/redo stack.
   * Missing ids are intentionally ignored: replay can restore a previously
   * deleted block, while every still-reachable parent/write target is checked.
   */
  assertUndoRedoWritable(
    blocks: readonly BlockRef[],
    operation: BlockReadonlyOperation.Undo | BlockReadonlyOperation.Redo,
  ): void {
    for (const block of blocks) {
      const blockId = typeof block === "string" ? block : block.id;
      if (!this.doc.model.exists(blockId)) continue;
      this.assertRemovable([blockId], operation, "undo");
    }
  }

  private init(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.scanReachableLocks();
    this.subscriptions.add(
      this.doc.onMetaUpdate$.subscribe(event => this.onMetaUpdate(event)),
    );
    this.subscriptions.add(
      this.doc.model.structureChange$.subscribe(event => this.onStructureChange(event)),
    );
    this.subscriptions.add(
      this.doc.readonlySwitch$.subscribe(() => {
        this.resolutionCache.clear();
        this.refreshSubtree(this.doc.rootId);
        this.stateChangeSubject.next();
      }),
    );
  }

  private destroy(): void {
    this.subscriptions.unsubscribe();
    this.violationSubject.complete();
    this.stateChangeSubject.complete();
    this.explicitIds.clear();
    this.subtreeLockCount.clear();
    this.resolutionCache.clear();
    this.initialized = false;
  }

  private scanReachableLocks(): void {
    const stack = [this.doc.rootId];
    while (stack.length) {
      const blockId = stack.pop()!;
      if (blockId !== this.doc.rootId && this.readExplicit(blockId)) {
        this.explicitIds.add(blockId);
      }
      const children = this.doc.model.getChildrenIds(blockId);
      for (let index = children.length - 1; index >= 0; index--) {
        stack.push(children[index]);
      }
    }
    this.invalidatePermissionState();
  }

  private onMetaUpdate(event: IMetaChangeEvent): void {
    let changed = false;
    const refreshIds = new Set<string>();
    for (const transaction of event.transactions) {
      if (!transaction.changes.has("readonly")) continue;
      const blockId = transaction.blockId;
      if (!this.doc.model.exists(blockId)) continue;
      const readonly = blockId !== this.doc.rootId && this.readExplicit(blockId);
      if (this.setExplicitMembership(blockId, readonly)) changed = true;
      refreshIds.add(blockId);
    }
    if (changed) this.invalidatePermissionState();
    refreshIds.forEach(blockId => this.refreshSubtree(blockId));
    if (refreshIds.size) this.stateChangeSubject.next();
  }

  private onStructureChange(event: IBlockModelStructureChange): void {
    let permissionChanged = false;
    for (const blockId of event.reachableRemovedIds) {
      if (this.explicitIds.delete(blockId)) permissionChanged = true;
    }
    for (const blockId of event.reachableAddedIds) {
      if (
        blockId !== this.doc.rootId &&
        this.readExplicit(blockId) &&
        !this.explicitIds.has(blockId)
      ) {
        this.explicitIds.add(blockId);
        permissionChanged = true;
      }
    }

    // Even a pure move changes inherited resolution and subtree counts.
    if (permissionChanged) this.permissionRevision++;
    this.resolutionCache.clear();
    this.indexedStructureRevision = -1;
    event.affectedParentIds.forEach(blockId => this.refreshSubtree(blockId));
    this.stateChangeSubject.next();
  }

  private readExplicit(blockId: string): boolean {
    const yMeta = this.doc.model.getYBlock(blockId)?.get("meta");
    return yMeta instanceof Y.Map && yMeta.get("readonly") === true;
  }

  private updateExplicit(blockId: string, readonly: boolean): boolean {
    const changed = this.setExplicitMembership(blockId, readonly);
    if (changed) {
      this.invalidatePermissionState();
    }
    return changed;
  }

  private setExplicitMembership(blockId: string, readonly: boolean): boolean {
    if (readonly) {
      if (this.explicitIds.has(blockId)) return false;
      this.explicitIds.add(blockId);
      return true;
    }
    return this.explicitIds.delete(blockId);
  }

  private invalidatePermissionState(): void {
    this.permissionRevision++;
    this.resolutionCache.clear();
    this.indexedPermissionRevision = -1;
  }

  private ensureSubtreeLockCounts(): void {
    if (
      this.indexedPermissionRevision === this.permissionRevision &&
      this.indexedStructureRevision === this.doc.model.structureRevision
    ) {
      return;
    }

    this.subtreeLockCount.clear();
    this.explicitIds.forEach(blockId => {
      const path = this.doc.model.getPath(blockId);
      if (!path) return;
      path.forEach(pathId => {
        this.subtreeLockCount.set(
          pathId,
          (this.subtreeLockCount.get(pathId) ?? 0) + 1,
        );
      });
    });
    this.indexedPermissionRevision = this.permissionRevision;
    this.indexedStructureRevision = this.doc.model.structureRevision;
  }

  private findLockedDescendant(blockId: string): string | null {
    for (const explicitId of this.explicitIds) {
      if (explicitId === blockId) continue;
      const path = this.doc.model.getPath(explicitId);
      if (path?.includes(blockId)) return explicitId;
    }
    return null;
  }

  private assertEffectiveWritable(
    block: BlockRef,
    operation: BlockReadonlyOperation,
    trigger: BlockReadonlyViolationTrigger,
  ): void {
    if (this.systemRepairDepth > 0) return;
    const blockId = this.getBlockId(block);
    const resolution = this.resolve(blockId);
    if (resolution.readonly && resolution.source) {
      this.reject(operation, [blockId], resolution.source, trigger);
    }
  }

  private reject(
    operation: BlockReadonlyOperation,
    blockIds: readonly string[],
    source: BlockReadonlyBlocker,
    trigger: BlockReadonlyViolationTrigger,
  ): never {
    this.violationSubject.next({operation, blockIds, source, trigger});
    throw new BlockReadonlyError({operation, blockIds, source});
  }

  private getBlockId(block: BlockRef): string {
    const blockId = typeof block === "string" ? block : block.id;
    if (!this.doc.model.exists(blockId)) this.throwMissingBlock(blockId);
    return blockId;
  }

  private throwMissingBlock(blockId: string): never {
    throw new BlockCraftError(ErrorCode.ModelCRUDError, `Block not found: ${blockId}`);
  }

  private refreshSubtree(blockId: string): void {
    if (!this.doc.model.exists(blockId)) return;
    const stack = [blockId];
    while (stack.length) {
      const current = stack.pop()!;
      // Avoid resolving unmounted components: DocVM.has is an O(1) presence
      // check and model-only test hosts intentionally do not expose it.
      if (this.doc.vm.has?.(current)) {
        const instance = this.doc.vm.get(current)?.instance as
          | (BlockCraft.BlockComponent & {applyReadonlyViewState?: () => void})
          | undefined;
        instance?.applyReadonlyViewState?.();
      }
      this.doc.model.getChildrenIds(current).forEach(childId => stack.push(childId));
    }
  }
}
