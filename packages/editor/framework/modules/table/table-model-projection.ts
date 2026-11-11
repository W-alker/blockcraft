import {take, takeUntil} from "rxjs";
import type {
  IBlockModelContentChange,
  IBlockModelStructureChange,
} from "../../doc/model-graph";
import {
  TableModelGrid,
} from "./table-model-grid";

export interface TableModelProjection {
  readonly grid: TableModelGrid;
}

const stores = new WeakMap<BlockCraft.Doc, TableModelProjectionStore>();

/**
 * Returns a lazily rebuilt, transaction-invalidated table model snapshot.
 * Minimal test/compatibility documents without lifecycle streams are rebuilt
 * on demand and are deliberately not cached.
 */
export function getTableModelProjection(
  doc: BlockCraft.Doc,
  tableId: string,
): TableModelProjection {
  if (!isCacheableDocument(doc)) {
    return {grid: TableModelGrid.fromDoc(doc, tableId)};
  }
  let store = stores.get(doc);
  if (!store) {
    store = new TableModelProjectionStore(doc);
    stores.set(doc, store);
  }
  return store.get(tableId);
}

function isCacheableDocument(
  doc: BlockCraft.Doc,
): boolean {
  return typeof (doc.model as any)?.contentChange$?.pipe === "function" &&
    typeof (doc.model as any)?.structureChange$?.pipe === "function" &&
    typeof (doc.model as any)?.getParentId === "function" &&
    typeof (doc as any).onDestroy$?.pipe === "function";
}

class TableModelProjectionStore {
  private readonly cache = new Map<string, TableModelProjection>();
  private readonly dirtyTableIds = new Set<string>();

  constructor(private readonly doc: BlockCraft.Doc) {
    doc.model.contentChange$
      .pipe(takeUntil(doc.onDestroy$))
      .subscribe(change => this.invalidateContent(change));
    doc.model.structureChange$
      .pipe(takeUntil(doc.onDestroy$))
      .subscribe(change => this.invalidateStructure(change));
    doc.onDestroy$.pipe(take(1)).subscribe(() => {
      this.cache.clear();
      this.dirtyTableIds.clear();
      stores.delete(doc);
    });
  }

  get(tableId: string): TableModelProjection {
    const cached = this.cache.get(tableId);
    if (cached && !this.dirtyTableIds.has(tableId)) return cached;
    const projection = {grid: TableModelGrid.fromDoc(this.doc, tableId)};
    this.cache.set(tableId, projection);
    this.dirtyTableIds.delete(tableId);
    return projection;
  }

  private invalidateContent(change: IBlockModelContentChange): void {
    if (!change.kinds.includes("props")) return;
    for (const blockId of change.blockIds) {
      const flavour = this.doc.model.getFlavour(blockId);
      if (flavour === "table") {
        this.dirtyTableIds.add(blockId);
      } else if (flavour === "table-cell") {
        const tableId = this.findOwningTableId(blockId);
        if (tableId) this.dirtyTableIds.add(tableId);
      }
    }
  }

  private invalidateStructure(change: IBlockModelStructureChange): void {
    for (const removedId of change.reachableRemovedIds) {
      if (!this.cache.has(removedId)) continue;
      this.cache.delete(removedId);
      this.dirtyTableIds.delete(removedId);
    }
    for (const parentId of change.affectedParentIds) {
      const flavour = this.doc.model.getFlavour(parentId);
      if (flavour !== "table" && flavour !== "table-row") continue;
      const tableId = flavour === "table"
        ? parentId
        : this.findOwningTableId(parentId);
      if (tableId) this.dirtyTableIds.add(tableId);
    }
  }

  private findOwningTableId(blockId: string): string | null {
    const seen = new Set<string>();
    let currentId: string | null = blockId;
    while (currentId && !seen.has(currentId)) {
      seen.add(currentId);
      if (this.doc.model.getFlavour(currentId) === "table") return currentId;
      currentId = this.doc.model.getParentId(currentId);
    }
    return null;
  }
}
