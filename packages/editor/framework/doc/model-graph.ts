import * as Y from "yjs";
import {
  BlockNodeType,
  DeltaInsert,
  IBlockSnapshot,
  NativeBlockModel,
  YBlock,
  yBlock2Native,
} from "../block-std";
import {BLOCK_POSITION} from "./block-position";
import {Subject} from "rxjs";

export interface IBlockModelStructureChange {
  revision: number;
  reachableAddedIds: readonly string[];
  reachableRemovedIds: readonly string[];
  affectedParentIds: readonly string[];
  /** Always emitted by current runtimes; optional preserves older constructed mocks. */
  readonly affectedRootIds?: readonly string[];
}

export interface IBlockModelTextChange {
  blockIds: readonly string[];
  origin: unknown;
  local: boolean;
  isUndoRedo: boolean;
}

export type BlockModelContentChangeKind = "text" | "props";

export interface IBlockModelContentChange {
  readonly blockIds: readonly string[];
  readonly kinds: readonly BlockModelContentChangeKind[];
  readonly origin: unknown;
  readonly local: boolean;
  readonly isUndoRedo: boolean;
}

/**
 * Yjs-backed, read-only document graph. It never requires mounted components.
 */
export class BlockModelGraph {
  private rootId: string | null = null;
  private readonly parentById = new Map<string, string | null>();
  private readonly childrenById = new Map<string, readonly string[]>();
  private readonly siblingIndexById = new Map<string, number>();
  private readonly deferredProjectionParentIds = new Set<string>();
  private observing = false;
  private _structureRevision = 0;
  readonly structureChange$ = new Subject<IBlockModelStructureChange>();
  readonly contentChange$ = new Subject<IBlockModelContentChange>();
  readonly textChange$ = new Subject<IBlockModelTextChange>();
  private readonly yObserver = (events: Y.YEvent<any>[], transaction: Y.Transaction) => {
    this.reconcileEvents(events);
    this.emitContentChange(events, transaction);
  };

  constructor(private readonly doc: BlockCraft.Doc) {}

  get structureRevision(): number {
    return this._structureRevision;
  }

  build(rootId: string): void {
    this.rootId = rootId;
    this.rebuildIndexes();
    if (!this.observing) {
      this.doc.yBlockMap.observeDeep(this.yObserver);
      this.observing = true;
    }
  }

  destroy(): void {
    if (this.observing) {
      this.doc.yBlockMap.unobserveDeep(this.yObserver);
      this.observing = false;
    }
    this.rootId = null;
    this.parentById.clear();
    this.childrenById.clear();
    this.siblingIndexById.clear();
    this.deferredProjectionParentIds.clear();
    this.structureChange$.complete();
    this.contentChange$.complete();
    this.textChange$.complete();
  }

  /**
   * Synchronize one reachable parent's structural projection before a view is
   * created inside an outer Yjs transaction. Deep observers run only when the
   * outer transaction commits, while Angular component lifecycle hooks may
   * need the inserted block path earlier.
   *
   * @internal Document write pipeline only.
   */
  synchronizeParentBeforeView(parentId: string): void {
    if (
      this.rootId === null ||
      !this.parentById.has(parentId) ||
      !this.doc.yBlockMap.has(parentId)
    ) {
      return;
    }

    const affectedParents = new Set([parentId]);
    const reachableAddedIds = new Set<string>();
    const reachableRemovedIds = new Set<string>();
    const affectedRootIds = new Set<string>();
    const previousRootChildIds = this.directRootChildSet();
    this.addCurrentRootOwners(affectedRootIds, affectedParents);
    const changed = this.reconcileParents(
      affectedParents,
      reachableAddedIds,
      reachableRemovedIds,
    );
    if (changed) {
      this.addCurrentRootOwners(affectedRootIds, affectedParents);
      this.addDirectRootSymmetricDifference(
        affectedRootIds,
        previousRootChildIds,
      );
      this.emitStructureChange(
        reachableAddedIds,
        reachableRemovedIds,
        affectedParents,
        affectedRootIds,
      );
    }
  }

  private rebuildIndexes(): void {
    this.parentById.clear();
    this.childrenById.clear();
    this.siblingIndexById.clear();
    this.deferredProjectionParentIds.clear();
    if (this.rootId !== null) this.indexSubtree(this.rootId, null, new Set());
  }

  exists(blockId: string): boolean {
    return this.parentById.has(blockId) && this.doc.yBlockMap.has(blockId);
  }

  getYBlock(blockId: string): YBlock | undefined {
    return this.exists(blockId) ? this.doc.yBlockMap.get(blockId) : undefined;
  }

  getParentId(blockId: string): string | null {
    return this.parentById.get(blockId) ?? null;
  }

  getChildrenIds(blockId: string): readonly string[] {
    return [...(this.childrenById.get(blockId) ?? [])];
  }

  getPath(blockId: string): readonly string[] | null {
    if (!this.exists(blockId)) return null;

    const path: string[] = [];
    const seen = new Set<string>();
    let current: string | null = blockId;
    while (current !== null && !seen.has(current)) {
      seen.add(current);
      path.push(current);
      current = this.parentById.get(current) ?? null;
    }
    return path.reverse();
  }

  indexInParent(blockId: string): number {
    return this.getParentId(blockId) === null
      ? -1
      : (this.siblingIndexById.get(blockId) ?? -1);
  }

  getPreviousSiblingId(blockId: string): string | null {
    const parentId = this.getParentId(blockId);
    if (parentId === null) return null;
    const siblings = this.childrenById.get(parentId) ?? [];
    const index = this.siblingIndexById.get(blockId) ?? -1;
    return index > 0 ? siblings[index - 1] : null;
  }

  getNextSiblingId(blockId: string): string | null {
    const parentId = this.getParentId(blockId);
    if (parentId === null) return null;
    const siblings = this.childrenById.get(parentId) ?? [];
    const index = this.siblingIndexById.get(blockId) ?? -1;
    return index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null;
  }

  getFlavour(blockId: string): NativeBlockModel["flavour"] | undefined {
    return this.getYBlock(blockId)?.get("flavour");
  }

  getNodeType(blockId: string): BlockNodeType | undefined {
    return this.getYBlock(blockId)?.get("nodeType");
  }

  getProps(blockId: string): Record<string, unknown> | undefined {
    return this.getYBlock(blockId)?.get("props").toJSON();
  }

  getText(blockId: string): string | undefined {
    const yBlock = this.getYBlock(blockId);
    if (!yBlock || yBlock.get("nodeType") !== BlockNodeType.editable) return undefined;
    const children = yBlock.get("children");
    return children instanceof Y.Text ? children.toString() : undefined;
  }

  getTextDeltas(blockId: string): DeltaInsert[] | undefined {
    const yBlock = this.getYBlock(blockId);
    if (!yBlock || yBlock.get("nodeType") !== BlockNodeType.editable) return undefined;
    const children = yBlock.get("children");
    return children instanceof Y.Text ? children.toDelta() as DeltaInsert[] : undefined;
  }

  getTextLength(blockId: string): number {
    const yBlock = this.getYBlock(blockId);
    if (!yBlock || yBlock.get("nodeType") !== BlockNodeType.editable) return 0;
    const children = yBlock.get("children");
    return children instanceof Y.Text ? children.length : 0;
  }

  comparePosition(aId: string, bId: string): BLOCK_POSITION | null {
    const aPath = this.getPath(aId);
    const bPath = this.getPath(bId);
    if (!aPath || !bPath) return null;
    if (aId === bId) return 0 as BLOCK_POSITION;

    let commonLength = 0;
    while (
      commonLength < aPath.length &&
      commonLength < bPath.length &&
      aPath[commonLength] === bPath[commonLength]
    ) {
      commonLength++;
    }

    if (commonLength === aPath.length) {
      return (BLOCK_POSITION.CONTAINS | BLOCK_POSITION.AFTER) as BLOCK_POSITION;
    }
    if (commonLength === bPath.length) {
      return (BLOCK_POSITION.CONTAINED_BY | BLOCK_POSITION.BEFORE) as BLOCK_POSITION;
    }
    if (commonLength === 0) return null;

    const aIndex = this.siblingIndexById.get(aPath[commonLength]) ?? -1;
    const bIndex = this.siblingIndexById.get(bPath[commonLength]) ?? -1;
    if (aIndex === -1 || bIndex === -1) return null;
    return aIndex < bIndex ? BLOCK_POSITION.AFTER : BLOCK_POSITION.BEFORE;
  }

  queryBetween(fromId: string, toId: string, contain = false): readonly string[] {
    const fromPath = this.getPath(fromId);
    const toPath = this.getPath(toId);
    if (!fromPath || !toPath) return [];
    if (fromId === toId) return contain ? [fromId] : [];

    let commonLength = 0;
    while (
      commonLength < fromPath.length &&
      commonLength < toPath.length &&
      fromPath[commonLength] === toPath[commonLength]
    ) {
      commonLength++;
    }
    if (commonLength === 0) return [];

    const commonParentId = fromPath[commonLength - 1];
    const children = this.childrenById.get(commonParentId) ?? [];
    const fromIndex = this.siblingIndexById.get(fromPath[commonLength]) ?? -1;
    const toIndex = this.siblingIndexById.get(toPath[commonLength]) ?? -1;
    if (fromIndex === -1 || toIndex === -1) return [];

    const start = Math.min(fromIndex, toIndex);
    const end = Math.max(fromIndex, toIndex);
    return children.slice(start + (contain ? 0 : 1), end + (contain ? 1 : 0));
  }

  toSnapshot(blockId: string): IBlockSnapshot | null {
    const yBlock = this.getYBlock(blockId);
    if (!yBlock) return null;

    const native = yBlock2Native(yBlock);
    const nodeType = yBlock.get("nodeType");
    if (nodeType === BlockNodeType.editable || nodeType === BlockNodeType.void) {
      return {...native} as unknown as IBlockSnapshot;
    }

    return {
      ...native,
      children: this.getChildrenIds(blockId)
        .map(childId => this.toSnapshot(childId))
        .filter((child): child is IBlockSnapshot => child !== null),
    } as unknown as IBlockSnapshot;
  }

  private reconcileEvents(events: readonly Y.YEvent<any>[]): void {
    if (this.rootId === null) return;

    const affectedParents = new Set<string>();
    const addedTopLevelIds = new Set<string>();
    const reachableAddedIds = new Set<string>();
    const reachableRemovedIds = new Set<string>();
    let rootChanged = false;
    let hasChildrenEvent = false;

    for (const event of events) {
      if (event.path.length === 0) {
        event.changes.keys.forEach((change, blockId) => {
          if (blockId === this.rootId) rootChanged = true;

          if (this.parentById.has(blockId)) {
            affectedParents.add(blockId);
            const oldParentId = this.parentById.get(blockId);
            if (oldParentId !== null && oldParentId !== undefined) {
              affectedParents.add(oldParentId);
            }
          } else if (change.action !== "delete") {
            addedTopLevelIds.add(blockId);
          }
        });
        continue;
      }

      if (
        event.path.length === 1 &&
        event.target instanceof Y.Map &&
        (event.changes.keys.has("children") || event.changes.keys.has("nodeType"))
      ) {
        affectedParents.add(event.path[0] as string);
        hasChildrenEvent = true;
        continue;
      }

      if (event.path[1] === "children" && event.target instanceof Y.Array) {
        affectedParents.add(event.path[0] as string);
        hasChildrenEvent = true;
      }
    }

    // A late-arriving YBlock can satisfy an existing dangling child reference
    // without changing the parent's Y.Array. This is a corruption/merge
    // fallback only; ordinary inserts include a children event and stay local.
    if (addedTopLevelIds.size && !hasChildrenEvent) {
      for (const parentId of this.childrenById.keys()) {
        const rawChildren = this.readRawChildren(parentId);
        if (rawChildren.some(childId => addedTopLevelIds.has(childId))) {
          affectedParents.add(parentId);
        }
      }
    }

    if (!rootChanged && !affectedParents.size) return;

    const affectedRootIds = new Set<string>();
    const previousRootChildIds = this.directRootChildSet();
    this.addCurrentRootOwners(affectedRootIds, affectedParents);

    if (rootChanged) {
      const previousIds = new Set(this.parentById.keys());
      this.rebuildIndexes();
      this.parentById.forEach((_parentId, blockId) => {
        if (!previousIds.has(blockId)) reachableAddedIds.add(blockId);
      });
      previousIds.forEach(blockId => {
        if (!this.parentById.has(blockId)) reachableRemovedIds.add(blockId);
      });
      this.addCurrentRootOwners(affectedRootIds, affectedParents);
      this.addDirectRootSymmetricDifference(
        affectedRootIds,
        previousRootChildIds,
      );
      this.emitStructureChange(
        reachableAddedIds,
        reachableRemovedIds,
        new Set(this.rootId === null ? [] : [this.rootId]),
        affectedRootIds,
      );
      return;
    }

    if (affectedParents.size) {
      const changed = this.reconcileParents(
        affectedParents,
        reachableAddedIds,
        reachableRemovedIds,
      );
      if (changed) {
        this.addCurrentRootOwners(affectedRootIds, affectedParents);
        this.addDirectRootSymmetricDifference(
          affectedRootIds,
          previousRootChildIds,
        );
        this.emitStructureChange(
          reachableAddedIds,
          reachableRemovedIds,
          affectedParents,
          affectedRootIds,
        );
      }
    }
  }

  private emitContentChange(
    events: readonly Y.YEvent<any>[],
    transaction: Y.Transaction,
  ): void {
    const kindsByBlockId = new Map<string, Set<BlockModelContentChangeKind>>();
    const textBlockIds = new Set<string>();
    const record = (blockId: string, kind: BlockModelContentChangeKind) => {
      let kinds = kindsByBlockId.get(blockId);
      if (!kinds) {
        kinds = new Set<BlockModelContentChangeKind>();
        kindsByBlockId.set(blockId, kinds);
      }
      kinds.add(kind);
      if (kind === "text") textBlockIds.add(blockId);
    };

    for (const event of events) {
      if (event.path.length === 0) {
        event.changes.keys.forEach((change, blockId) => {
          if (change.action !== "update") return;
          const previousBlock = change.oldValue;
          const currentBlock = this.doc.yBlockMap.get(blockId);
          if (!(currentBlock instanceof Y.Map)) return;

          if (
            (previousBlock instanceof Y.Map &&
              previousBlock.get("children") instanceof Y.Text) ||
            currentBlock.get("children") instanceof Y.Text
          ) {
            record(blockId, "text");
          }
          record(blockId, "props");
        });
        continue;
      }

      const blockId = event.path[0];
      if (typeof blockId !== "string") continue;

      if (event.path[1] === "children" && event.target instanceof Y.Text) {
        record(blockId, "text");
      }

      if (event.path[1] === "props") {
        record(blockId, "props");
      }

      if (
        event.path.length === 1 &&
        event.target instanceof Y.Map
      ) {
        if (
          event.changes.keys.has("children") &&
          event.target.get("children") instanceof Y.Text
        ) {
          record(blockId, "text");
        }
        if (event.changes.keys.has("props")) {
          record(blockId, "props");
        }
      }
    }

    const reachableBlockIds = [...kindsByBlockId.keys()].filter(blockId =>
      this.exists(blockId),
    );
    const kinds: BlockModelContentChangeKind[] = [];
    if (reachableBlockIds.some(blockId => kindsByBlockId.get(blockId)!.has("text"))) {
      kinds.push("text");
    }
    if (reachableBlockIds.some(blockId => kindsByBlockId.get(blockId)!.has("props"))) {
      kinds.push("props");
    }

    const changeContext = {
      origin: transaction.origin,
      local: transaction.local,
      isUndoRedo: transaction.origin instanceof Y.UndoManager,
    };
    if (reachableBlockIds.length) {
      this.contentChange$.next({
        blockIds: reachableBlockIds,
        kinds,
        ...changeContext,
      });
    }

    const reachableEditableIds = [...textBlockIds].filter(blockId =>
      this.getNodeType(blockId) === BlockNodeType.editable,
    );
    if (!reachableEditableIds.length) return;

    this.textChange$.next({
      blockIds: reachableEditableIds,
      ...changeContext,
    });
  }

  private emitStructureChange(
    reachableAddedIds: ReadonlySet<string>,
    reachableRemovedIds: ReadonlySet<string>,
    affectedParentIds: ReadonlySet<string>,
    affectedRootIds: ReadonlySet<string>,
  ): void {
    this._structureRevision++;
    this.structureChange$.next({
      revision: this._structureRevision,
      reachableAddedIds: [...reachableAddedIds],
      reachableRemovedIds: [...reachableRemovedIds],
      affectedParentIds: [...affectedParentIds],
      affectedRootIds: [...affectedRootIds],
    });
  }

  private rootOwnerFromCurrentIndex(blockId: string): string | null {
    if (this.rootId === null || blockId === this.rootId) return null;
    const path = this.getPath(blockId);
    return path && path[0] === this.rootId ? path[1] ?? null : null;
  }

  private addCurrentRootOwners(
    target: Set<string>,
    blockIds: Iterable<string>,
  ): void {
    for (const blockId of blockIds) {
      const owner = this.rootOwnerFromCurrentIndex(blockId);
      if (owner !== null) target.add(owner);
    }
  }

  private directRootChildSet(): Set<string> {
    return new Set(
      this.rootId === null ? [] : this.childrenById.get(this.rootId) ?? [],
    );
  }

  private addDirectRootSymmetricDifference(
    target: Set<string>,
    previousIds: ReadonlySet<string>,
  ): void {
    const currentIds = this.directRootChildSet();
    previousIds.forEach(blockId => {
      if (!currentIds.has(blockId)) target.add(blockId);
    });
    currentIds.forEach(blockId => {
      if (!previousIds.has(blockId)) target.add(blockId);
    });
  }

  private reconcileParents(
    affectedParents: Set<string>,
    reachableAddedIds: Set<string>,
    reachableRemovedIds: Set<string>,
    allowDeferredRetry = true,
  ): boolean {
    const reachableParents = [...affectedParents].filter(parentId =>
      this.parentById.has(parentId) && this.doc.yBlockMap.has(parentId),
    );
    const previousChildren = new Map<string, readonly string[]>(
      reachableParents.map(parentId => [parentId, this.childrenById.get(parentId) ?? []]),
    );
    const desiredChildren = new Map<string, string[]>();
    const desiredOwner = new Map<string, string>();
    let changed = false;

    reachableParents.sort((a, b) => this.compareIndexedOrder(a, b));
    for (const parentId of reachableParents) {
      const localSeen = new Set<string>();
      const children: string[] = [];
      for (const childId of this.readRawChildren(parentId)) {
        if (localSeen.has(childId)) {
          this.warnInvalidEdge(parentId, childId, "duplicate child reference");
          continue;
        }
        localSeen.add(childId);

        if (!this.doc.yBlockMap.has(childId)) {
          this.warnInvalidEdge(parentId, childId, "missing child block");
          continue;
        }
        if (this.wouldCreateCycle(parentId, childId)) {
          this.warnInvalidEdge(parentId, childId, "cyclic child reference");
          continue;
        }

        const currentOwner = this.parentById.get(childId);
        if (
          currentOwner !== undefined &&
          currentOwner !== null &&
          currentOwner !== parentId &&
          !affectedParents.has(currentOwner)
        ) {
          this.deferredProjectionParentIds.add(parentId);
          this.warnInvalidEdge(parentId, childId, `already owned by ${currentOwner}`);
          continue;
        }
        if (desiredOwner.has(childId)) {
          this.deferredProjectionParentIds.add(parentId);
          this.warnInvalidEdge(parentId, childId, `already claimed by ${desiredOwner.get(childId)}`);
          continue;
        }

        desiredOwner.set(childId, parentId);
        children.push(childId);
      }
      desiredChildren.set(parentId, children);
    }

    // Link additions and moves before pruning removals so a moved subtree is
    // never temporarily interpreted as deleted.
    desiredOwner.forEach((parentId, childId) => {
      if (!this.parentById.has(childId)) {
        if (
          this.indexSubtree(
            childId,
            parentId,
            new Set(),
            reachableAddedIds,
            affectedParents,
            desiredOwner,
          )
        ) {
          changed = true;
        }
      } else if (this.parentById.get(childId) !== parentId) {
        this.parentById.set(childId, parentId);
        changed = true;
      }
    });
    desiredChildren.forEach((children, parentId) => {
      const previous = previousChildren.get(parentId) ?? [];
      if (
        previous.length !== children.length ||
        previous.some((childId, index) => childId !== children[index])
      ) {
        changed = true;
      }
      this.childrenById.set(parentId, children);
    });
    previousChildren.forEach((children, parentId) => {
      children.forEach(childId => {
        // A newly indexed wrapper can take ownership and assign the child's new
        // sibling index before the old parent's cached list is cleaned up.
        // Only clear indices for edges the previous parent still owns.
        if (this.parentById.get(childId) === parentId) {
          this.siblingIndexById.delete(childId);
        }
      });
    });
    desiredChildren.forEach(children => {
      children.forEach((childId, index) => this.siblingIndexById.set(childId, index));
    });

    const removedCandidates = new Set<string>();
    previousChildren.forEach(children => children.forEach(childId => removedCandidates.add(childId)));
    removedCandidates.forEach(childId => {
      if (desiredOwner.has(childId)) return;
      const owner = this.parentById.get(childId);
      if (owner !== undefined && owner !== null && affectedParents.has(owner)) {
        this.unlinkSubtree(childId, reachableRemovedIds);
        changed = true;
      }
    });
    if (allowDeferredRetry && this.deferredProjectionParentIds.size) {
      const retryParents = this.collectDeferredRetryParents();
      if (retryParents.size) {
        retryParents.forEach(parentId => affectedParents.add(parentId));
        if (
          this.reconcileParents(
            retryParents,
            reachableAddedIds,
            reachableRemovedIds,
            false,
          )
        ) {
          changed = true;
        }
        this.pruneResolvedDeferredParents(retryParents);
      }
    }
    if (allowDeferredRetry) {
      const retainedIds = [...reachableAddedIds].filter(blockId =>
        reachableRemovedIds.has(blockId),
      );
      retainedIds.forEach(blockId => {
        reachableAddedIds.delete(blockId);
        reachableRemovedIds.delete(blockId);
      });
    }
    return changed;
  }

  private compareIndexedOrder(aId: string, bId: string): number {
    const aPath = this.getPath(aId);
    const bPath = this.getPath(bId);
    if (!aPath || !bPath) return aId.localeCompare(bId);
    const length = Math.min(aPath.length, bPath.length);
    for (let index = 1; index < length; index++) {
      if (aPath[index] === bPath[index]) continue;
      return (this.siblingIndexById.get(aPath[index]) ?? -1) -
        (this.siblingIndexById.get(bPath[index]) ?? -1);
    }
    return aPath.length - bPath.length;
  }

  private collectDeferredRetryParents(): Set<string> {
    const retryParents = new Set<string>();
    this.pruneResolvedDeferredParents(this.deferredProjectionParentIds, retryParents);
    return retryParents;
  }

  private pruneResolvedDeferredParents(
    parentIds: Iterable<string>,
    retryParents?: Set<string>,
  ): void {
    for (const parentId of [...parentIds]) {
      if (!this.parentById.has(parentId) || !this.doc.yBlockMap.has(parentId)) {
        this.deferredProjectionParentIds.delete(parentId);
        continue;
      }
      const indexedChildren = new Set(this.childrenById.get(parentId) ?? []);
      const missingChildren = this.readRawChildren(parentId).filter(childId =>
        this.doc.yBlockMap.has(childId) && !indexedChildren.has(childId),
      );
      if (!missingChildren.length) {
        this.deferredProjectionParentIds.delete(parentId);
        continue;
      }
      if (
        missingChildren.some(childId =>
          !this.parentById.has(childId) ||
          this.parentById.get(childId) === parentId
        )
      ) {
        retryParents?.add(parentId);
      }
    }
  }

  private wouldCreateCycle(parentId: string, childId: string): boolean {
    let current: string | null = parentId;
    const seen = new Set<string>();
    while (current !== null && !seen.has(current)) {
      if (current === childId) return true;
      seen.add(current);
      current = this.parentById.get(current) ?? null;
    }
    return false;
  }

  private unlinkSubtree(blockId: string, removedIds?: Set<string>): void {
    const stack = [blockId];
    while (stack.length) {
      const current = stack.pop()!;
      removedIds?.add(current);
      const children = this.childrenById.get(current) ?? [];
      // A single transaction can move a descendant to a surviving parent and
      // delete its old ancestor (column creation followed by Undo is the common
      // case). `parentById` is updated before removals, while the old ancestor's
      // cached children list still contains the moved id. Only unlink edges the
      // current node still owns, otherwise the moved subtree is removed from the
      // index even though its new parent's children projection contains it.
      children.forEach(childId => {
        if (this.parentById.get(childId) === current) stack.push(childId);
      });
      this.childrenById.delete(current);
      this.parentById.delete(current);
      this.siblingIndexById.delete(current);
    }
  }

  private readRawChildren(blockId: string): string[] {
    const yBlock = this.doc.yBlockMap.get(blockId);
    if (!yBlock || yBlock.get("nodeType") === BlockNodeType.editable) return [];
    const children = yBlock.get("children");
    return children instanceof Y.Array ? children.toArray() as string[] : [];
  }

  private warnInvalidEdge(parentId: string, childId: string, reason: string): void {
    this.doc.logger.warn(`BlockModelGraph: skip ${parentId} -> ${childId}: ${reason}`);
  }

  private indexSubtree(
    blockId: string,
    parentId: string | null,
    visiting: Set<string>,
    addedIds?: Set<string>,
    transferableOwners?: ReadonlySet<string>,
    claimedOwners?: ReadonlyMap<string, string>,
  ): boolean {
    if (visiting.has(blockId)) {
      this.warnInvalidEdge(parentId ?? blockId, blockId, "cyclic child reference");
      return false;
    }
    if (this.parentById.has(blockId)) {
      const currentOwner = this.parentById.get(blockId);
      if (
        parentId !== null &&
        currentOwner !== undefined &&
        currentOwner !== null &&
        currentOwner !== parentId &&
        transferableOwners?.has(currentOwner) &&
        !claimedOwners?.has(blockId)
      ) {
        if (this.wouldCreateCycle(parentId, blockId)) {
          this.warnInvalidEdge(parentId, blockId, "cyclic child reference");
          return false;
        }
        this.parentById.set(blockId, parentId);
        return true;
      }
      if (parentId !== null) this.deferredProjectionParentIds.add(parentId);
      this.warnInvalidEdge(parentId ?? blockId, blockId, "duplicate child reference");
      return false;
    }
    const yBlock = this.doc.yBlockMap.get(blockId);
    if (!yBlock) {
      this.warnInvalidEdge(parentId ?? blockId, blockId, "missing child block");
      return false;
    }

    visiting.add(blockId);
    this.parentById.set(blockId, parentId);
    addedIds?.add(blockId);

    const childIds: string[] = [];
    const children = yBlock.get("children");
    if (children instanceof Y.Array) {
      for (const childId of children.toArray() as string[]) {
        if (
          this.indexSubtree(
            childId,
            blockId,
            visiting,
            addedIds,
            transferableOwners,
            claimedOwners,
          )
        ) {
          childIds.push(childId);
        }
      }
    }
    this.childrenById.set(blockId, childIds);
    childIds.forEach((childId, index) => this.siblingIndexById.set(childId, index));
    visiting.delete(blockId);
    return true;
  }
}
