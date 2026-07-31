import {asyncScheduler, Observable, Subject, Subscription, throttleTime} from "rxjs";
import * as Y from "yjs";
import {BlockCraftError, ErrorCode} from "../../global";
import {
  BlockLockKind,
  BlockLockError,
  BlockLockErrorReason,
  BlockReadonlyBlocker,
  BlockReadonlyError,
  BlockReadonlyOperation,
  BlockReadonlyResolution,
  BlockReadonlyViolation,
  BlockReadonlyViolationTrigger,
  BlockRef,
  SetBlockReadonlyOptions,
} from "./block-readonly.types";
import {IMetaChangeEvent} from "./crud";
import {IBlockModelStructureChange} from "./model-graph";
import {ORIGIN_BLOCK_READONLY_CONTROL} from "./origins";

function normalizeUserId(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

interface ExplicitBlockLock {
  userId: string;
  kind: BlockLockKind;
}

function normalizeLockKind(value: unknown): BlockLockKind {
  return value === "template" ? "template" : "user";
}

function explicitLocksEqual(
  left: ExplicitBlockLock | null | undefined,
  right: ExplicitBlockLock | null | undefined,
): boolean {
  return left?.userId === right?.userId && left?.kind === right?.kind;
}

/**
 * Resolves persistent block locks against the model graph.
 *
 * The graph remains the only source of structural truth. This manager stores
 * permission-derived state only, so reachable blocks do not need a mounted
 * Angular component in order to be protected.
 */
export class BlockReadonlyManager {
  private readonly explicitLocks = new Map<string, ExplicitBlockLock>();
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
  private structureStateChangeQueued = false;
  private readonly configuredCurrentUserId: string | null;
  private readonly configuredDefaultLockKind: BlockLockKind;

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
    this.configuredCurrentUserId = normalizeUserId(doc.config.currentUserId);
    this.configuredDefaultLockKind = normalizeLockKind(
      doc.config.defaultBlockLockKind,
    );
    // BlockCraftDoc creates this service before its Y block map and root view
    // are ready. Defer every model/Yjs read until the document is initialized.
    this.doc.afterInit(() => this.init());
    this.doc.onDestroy(() => this.destroy());
  }

  isExplicitReadonly(block: BlockRef): boolean {
    const blockId = this.getBlockId(block);
    return this.explicitLocks.has(blockId);
  }

  getExplicitLockUserId(block: BlockRef): string | null {
    const blockId = this.getBlockId(block);
    return this.explicitLocks.get(blockId)?.userId ?? null;
  }

  canUnlock(block: BlockRef): boolean {
    const blockId = this.getBlockId(block);
    const lock = this.explicitLocks.get(blockId);
    if (!lock) return false;
    const currentUserId = this.currentUserId;
    if (!currentUserId) return false;
    return this.canUnlockWith(blockId, lock, currentUserId);
  }

  canLock(block: BlockRef): boolean {
    const blockId = this.getBlockId(block);
    if (blockId === this.doc.rootId || !this.currentUserId) return false;
    const lock = this.explicitLocks.get(blockId);
    if (lock) return false;
    return this.findNearestAncestorLock(blockId) === null;
  }

  resolve(block: BlockRef): BlockReadonlyResolution {
    // Angular renders the Root component before BlockModelGraph.build(). During
    // that short bootstrap window readonlySwitch$ is deliberately true, so the
    // document policy can be answered without asking an index that is not ready.
    if (!this.initialized && this.doc.isReadonly) {
      return {
        readonly: true,
        source: {kind: "document"},
        lockUserId: null,
        lockKind: null,
      };
    }
    const blockId = this.getBlockId(block);
    if (this.doc.isReadonly) {
      return {
        readonly: true,
        source: {kind: "document"},
        lockUserId: null,
        lockKind: null,
      };
    }

    const cached = this.resolutionCache.get(blockId);
    if (cached) return cached;

    const explicitLock = this.explicitLocks.get(blockId);
    if (explicitLock) {
      const resolution: BlockReadonlyResolution = {
        readonly: true,
        source: {kind: "self", blockId},
        lockUserId: explicitLock.userId,
        lockKind: explicitLock.kind,
      };
      this.resolutionCache.set(blockId, resolution);
      return resolution;
    }

    const path = this.doc.model.getPath(blockId);
    if (!path) this.throwMissingBlock(blockId);
    for (let index = path.length - 2; index >= 0; index--) {
      const ancestorId = path[index];
      const lock = this.explicitLocks.get(ancestorId);
      if (lock) {
        const resolution: BlockReadonlyResolution = {
          readonly: true,
          source: {kind: "ancestor", blockId: ancestorId},
          lockUserId: lock.userId,
          lockKind: lock.kind,
        };
        this.resolutionCache.set(blockId, resolution);
        return resolution;
      }
    }

    const resolution: BlockReadonlyResolution = {
      readonly: false,
      source: null,
      lockUserId: null,
      lockKind: null,
    };
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

  set(
    block: BlockRef,
    readonly: boolean,
    options: SetBlockReadonlyOptions = {},
  ): void {
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

    const persistedLock = this.readLock(yMeta);
    if (readonly) {
      if (blockId === this.doc.rootId) {
        this.rejectLock(BlockReadonlyOperation.Lock, "root", blockId);
      }

      const currentUserId = this.requireCurrentUserId(
        BlockReadonlyOperation.Lock,
        blockId,
      );
      const requestedLock: ExplicitBlockLock = {
        userId: currentUserId,
        kind: options.kind
          ? normalizeLockKind(options.kind)
          : this.configuredDefaultLockKind,
      };
      if (explicitLocksEqual(persistedLock, requestedLock)) return;
      if (persistedLock) {
        this.rejectLock(
          BlockReadonlyOperation.Lock,
          "owned-by-other",
          blockId,
          persistedLock.userId,
        );
      }

      const inherited = this.findNearestAncestorLock(blockId);
      if (inherited) {
        this.rejectLock(
          BlockReadonlyOperation.Lock,
          "inherited",
          blockId,
          inherited.lock.userId,
          {kind: "ancestor", blockId: inherited.blockId},
        );
      }

      this.doc.crud.transact(() => {
        yMeta.set("lock", currentUserId);
        if (requestedLock.kind === "template") {
          yMeta.set("lockKind", "template");
        } else {
          yMeta.delete("lockKind");
        }
      }, ORIGIN_BLOCK_READONLY_CONTROL);

      const changed = this.updateExplicit(blockId, requestedLock);
      this.refreshSubtree(blockId);
      if (changed) this.stateChangeSubject.next();
      return;
    }

    if (!persistedLock) {
      const inherited = this.findNearestAncestorLock(blockId);
      if (inherited) {
        this.rejectLock(
          BlockReadonlyOperation.Unlock,
          "inherited",
          blockId,
          inherited.lock.userId,
          {kind: "ancestor", blockId: inherited.blockId},
        );
      }
      if (yMeta.has("lockKind")) {
        this.doc.crud.transact(() => {
          yMeta.delete("lockKind");
        }, ORIGIN_BLOCK_READONLY_CONTROL);
      }
      return;
    }

    const currentUserId = this.requireCurrentUserId(
      BlockReadonlyOperation.Unlock,
      blockId,
      persistedLock.userId,
    );
    if (!this.canUnlockWith(blockId, persistedLock, currentUserId)) {
      this.rejectLock(
        BlockReadonlyOperation.Unlock,
        "unauthorized",
        blockId,
        persistedLock.userId,
        {kind: "self", blockId},
      );
    }

    this.doc.crud.transact(() => {
      yMeta.delete("lock");
      yMeta.delete("lockKind");
    }, ORIGIN_BLOCK_READONLY_CONTROL);

    // DocCRUD emits synchronously in a real document. Keeping this idempotent
    // update also makes the manager correct for lightweight/model-only hosts.
    const changed = this.updateExplicit(blockId, null);
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
    this.explicitLocks.clear();
    this.subtreeLockCount.clear();
    this.resolutionCache.clear();
    this.initialized = false;
  }

  private scanReachableLocks(): void {
    const stack = [this.doc.rootId];
    while (stack.length) {
      const blockId = stack.pop()!;
      const lock = blockId === this.doc.rootId
        ? null
        : this.readExplicit(blockId);
      if (lock) {
        this.explicitLocks.set(blockId, lock);
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
      if (
        !transaction.changes.has("lock")
        && !transaction.changes.has("lockKind")
      ) {
        continue;
      }
      const blockId = transaction.blockId;
      if (!this.doc.model.exists(blockId)) continue;
      const lock = blockId === this.doc.rootId
        ? null
        : this.readExplicit(blockId);
      if (this.setExplicitMembership(blockId, lock)) changed = true;
      refreshIds.add(blockId);
    }
    if (changed) this.invalidatePermissionState();
    refreshIds.forEach(blockId => this.refreshSubtree(blockId));
    if (refreshIds.size) this.stateChangeSubject.next();
  }

  private onStructureChange(event: IBlockModelStructureChange): void {
    let permissionChanged = false;
    for (const blockId of event.reachableRemovedIds) {
      if (this.explicitLocks.delete(blockId)) permissionChanged = true;
    }
    for (const blockId of event.reachableAddedIds) {
      const lock = blockId === this.doc.rootId
        ? null
        : this.readExplicit(blockId);
      if (lock && !explicitLocksEqual(this.explicitLocks.get(blockId), lock)) {
        this.explicitLocks.set(blockId, lock);
        permissionChanged = true;
      }
    }

    // Even a pure move changes inherited resolution and subtree counts.
    if (permissionChanged) this.permissionRevision++;
    this.resolutionCache.clear();
    this.indexedStructureRevision = -1;
    event.affectedParentIds.forEach(blockId => this.refreshSubtree(blockId));
    this.scheduleStructureStateChange();
  }

  private scheduleStructureStateChange(): void {
    if (this.structureStateChangeQueued) return;
    this.structureStateChangeQueued = true;
    Promise.resolve().then(() => {
      this.structureStateChangeQueued = false;
      if (!this.initialized) return;
      this.stateChangeSubject.next();
    });
  }

  private readExplicit(blockId: string): ExplicitBlockLock | null {
    const yMeta = this.doc.model.getYBlock(blockId)?.get("meta");
    return yMeta instanceof Y.Map
      ? this.readLock(yMeta)
      : null;
  }

  private updateExplicit(blockId: string, lock: ExplicitBlockLock | null): boolean {
    const changed = this.setExplicitMembership(blockId, lock);
    if (changed) {
      this.invalidatePermissionState();
    }
    return changed;
  }

  private setExplicitMembership(
    blockId: string,
    lock: ExplicitBlockLock | null,
  ): boolean {
    if (lock) {
      if (explicitLocksEqual(this.explicitLocks.get(blockId), lock)) return false;
      this.explicitLocks.set(blockId, lock);
      return true;
    }
    return this.explicitLocks.delete(blockId);
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
    this.explicitLocks.forEach((_lock, blockId) => {
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
    for (const explicitId of this.explicitLocks.keys()) {
      if (explicitId === blockId) continue;
      const path = this.doc.model.getPath(explicitId);
      if (path?.includes(blockId)) return explicitId;
    }
    return null;
  }

  private findNearestAncestorLock(
    blockId: string,
  ): {blockId: string; lock: ExplicitBlockLock} | null {
    const path = this.doc.model.getPath(blockId);
    if (!path) this.throwMissingBlock(blockId);
    for (let index = path.length - 2; index >= 0; index--) {
      const ancestorId = path[index];
      const lock = this.explicitLocks.get(ancestorId);
      if (lock) return {blockId: ancestorId, lock};
    }
    return null;
  }

  get currentUserId(): string | null {
    return this.configuredCurrentUserId;
  }

  private requireCurrentUserId(
    operation: BlockReadonlyOperation.Lock | BlockReadonlyOperation.Unlock,
    blockId: string,
    lockUserId?: string | null,
  ): string {
    const currentUserId = this.currentUserId;
    if (currentUserId) return currentUserId;
    return this.rejectLock(
      operation,
      "missing-user",
      blockId,
      lockUserId,
    );
  }

  private canUnlockWith(
    blockId: string,
    lock: ExplicitBlockLock,
    currentUserId: string,
  ): boolean {
    if (lock.kind === "user" && lock.userId === currentUserId) return true;
    const policy = this.doc.config.canUnlockBlock;
    if (!policy) return false;
    try {
      return policy({
        blockId,
        lockUserId: lock.userId,
        lockKind: lock.kind,
        currentUserId,
      }) === true;
    } catch (error) {
      this.doc.logger.warn("Block unlock policy failed; denying access", error);
      return false;
    }
  }

  private readLockUserId(value: unknown): string | null {
    return normalizeUserId(value);
  }

  private readLock(yMeta: Y.Map<unknown>): ExplicitBlockLock | null {
    const userId = this.readLockUserId(yMeta.get("lock"));
    if (!userId) return null;
    return {
      userId,
      kind: normalizeLockKind(yMeta.get("lockKind")),
    };
  }

  private rejectLock(
    operation: BlockReadonlyOperation.Lock | BlockReadonlyOperation.Unlock,
    reason: BlockLockErrorReason,
    blockId: string,
    lockUserId?: string | null,
    source?: BlockReadonlyResolution["source"],
  ): never {
    throw new BlockLockError({
      operation,
      reason,
      blockId,
      lockUserId,
      source,
    });
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
