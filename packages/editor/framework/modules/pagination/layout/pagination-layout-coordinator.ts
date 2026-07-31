import { BlockNodeType } from "../../../block-std/types/block.type";
import {
  IBlockModelContentChange,
  IBlockModelStructureChange,
} from "../../../doc/model-graph";
import { paginate, PaginationItem, PaginationResult } from "../engine";
import {
  PaginationConfig,
  ResolvedPaginationGeometry,
} from "../pagination.types";
import { BlockMeta, buildPaginationItems } from "../view/item-builder";
import {
  PaginationGeometryEntry,
  PaginationGeometryIndex,
  PaginationGeometryMeasurement,
  PaginationGeometrySeed,
  PaginationMeasureContext,
} from "./pagination-geometry-index";
import {
  buildProjectedBlockPlacements,
  PaginatedLayoutProjection,
  ProjectedBlockPlacement,
} from "./paginated-layout-projection";
import {
  estimateModelBlockHeight,
  estimateModelBlockHeightDetails,
  modelHeightEstimateAffectedByContentChange,
} from "../../virtualization/model-height-estimator";

const DEFAULT_ESTIMATED_HEIGHT = 48;

export interface PaginationLayoutState {
  readonly revision: number;
  readonly exact: boolean;
  readonly geometryRevision: number;
  readonly rootIds: readonly string[];
  readonly entries: readonly PaginationGeometryEntry[];
  readonly items: readonly PaginationItem[];
  readonly result: PaginationResult;
  readonly placements: readonly ProjectedBlockPlacement[];
  /** Coordinator-owned live query handle; all preceding fields are isolated snapshots. */
  readonly projection: PaginatedLayoutProjection;
}

interface RootSnapshot {
  readonly rootIds: readonly string[];
  readonly seeds: readonly PaginationGeometrySeed[];
}

function entryToMeta(entry: PaginationGeometryEntry): BlockMeta {
  return {
    id: entry.blockId,
    flavour: entry.flavour,
    nodeType: entry.nodeType,
    isHeading: entry.isHeading,
    height: entry.lockHeight ?? entry.naturalHeight,
    splitOffsets: entry.splitOffsets ? [...entry.splitOffsets] : undefined,
    preferredSplitOffsets: entry.preferredSplitOffsets
      ? [...entry.preferredSplitOffsets]
      : undefined,
    lockHeight: entry.lockHeight,
    repeatHeaderHeight: entry.repeatHeaderHeight,
  };
}

function cloneItem(item: PaginationItem): PaginationItem {
  return {
    ...item,
    splitOffsets: item.splitOffsets ? [...item.splitOffsets] : undefined,
    preferredSplitOffsets: item.preferredSplitOffsets
      ? [...item.preferredSplitOffsets]
      : undefined,
  };
}

function cloneResult(result: PaginationResult): PaginationResult {
  return {
    pages: result.pages.map((page) => ({
      ...page,
      slots: page.slots.map((slot) => ({
        ...slot,
        fragment: slot.fragment ? { ...slot.fragment } : undefined,
      })),
    })),
    byBlock: new Map(
      [...result.byBlock].map(([blockId, placement]) => [
        blockId,
        { ...placement },
      ]),
    ),
  };
}

function clonePlacement(
  placement: ProjectedBlockPlacement,
): ProjectedBlockPlacement {
  return {
    ...placement,
    fragments: placement.fragments.map((fragment) => ({ ...fragment })),
  };
}

export class PaginationLayoutCoordinator {
  private readonly geometryIndex = new PaginationGeometryIndex();
  private readonly layoutProjection = new PaginatedLayoutProjection();
  private preparedRootSnapshot: RootSnapshot | null = null;
  private revisionValue = 0;
  private disposed = false;

  constructor(private readonly doc: BlockCraft.Doc) {}

  get geometryRevision(): number {
    return this.geometryIndex.revision;
  }

  syncRootOrder(): void {
    if (this.disposed) return;
    const snapshot = this.readRootSnapshot();
    this.syncSnapshot(snapshot);
    this.preparedRootSnapshot = snapshot;
  }

  applyContentChange(change: IBlockModelContentChange): void {
    if (this.disposed) return;
    const rootIds = new Set<string>();
    for (const blockId of change.blockIds) {
      const path = this.doc.model.getPath(blockId);
      if (path?.[0] === this.doc.rootId && path[1]) rootIds.add(path[1]);
    }
    const affectedRootIds = [...rootIds];
    this.geometryIndex.markContentDirty(affectedRootIds);
    this.refreshObjectSizingEstimates(affectedRootIds.filter(blockId =>
      modelHeightEstimateAffectedByContentChange(this.doc, blockId, change),
    ));
  }

  applyStructureChange(change: IBlockModelStructureChange): void {
    if (this.disposed) return;
    this.syncRootOrder();
    this.geometryIndex.markContentDirty(change.affectedRootIds ?? []);
  }

  updateMeasureContext(context: PaginationMeasureContext): void {
    if (this.disposed) return;
    this.geometryIndex.setMeasureContext(context);
  }

  refreshObjectSizingEstimates(rootIds?: readonly string[]): void {
    if (this.disposed) return;
    const candidates =
      rootIds ?? this.doc.model.getChildrenIds(this.doc.rootId);
    const estimates = candidates.flatMap(blockId => {
      const estimate = estimateModelBlockHeightDetails(this.doc, blockId, {
        estimatedHeights:
          this.doc.config.virtualization?.estimatedHeights ?? {},
        defaultHeight: DEFAULT_ESTIMATED_HEIGHT,
      });
      if (!estimate.modelDriven) return [];
      return [{
        blockId,
        height: estimate.height,
      }];
    });
    this.geometryIndex.applyEstimatedHeights(estimates);
  }

  applyMeasured(
    measurements: readonly PaginationGeometryMeasurement[],
    expectedGeometryRevision: number,
  ): boolean {
    if (
      this.disposed ||
      expectedGeometryRevision !== this.geometryIndex.revision
    ) {
      return false;
    }
    this.geometryIndex.applyMeasured(measurements);
    return true;
  }

  compute(
    config: PaginationConfig,
    geometry: ResolvedPaginationGeometry,
  ): PaginationLayoutState {
    if (this.disposed) {
      throw new Error("PaginationLayoutCoordinator has been disposed");
    }

    // Phase B keeps policy in buildPaginationItems; the config becomes relevant
    // when later phases add background measurement and exact-layout controls.
    void config;

    const preparedSnapshot = this.preparedRootSnapshot;
    this.preparedRootSnapshot = null;
    const snapshot = preparedSnapshot ?? this.readRootSnapshot();
    if (!preparedSnapshot) this.syncSnapshot(snapshot);
    const rootIds = [...snapshot.rootIds];
    const entries = this.geometryIndex.entriesFor(rootIds);
    if (entries.length !== rootIds.length) {
      throw new Error("Pagination geometry index is missing a root entry");
    }

    const items = buildPaginationItems(entries.map(entryToMeta));
    const result = paginate(items, geometry.geometry);
    const placements = buildProjectedBlockPlacements(
      rootIds,
      entries,
      items,
      result,
      geometry,
    );
    this.layoutProjection.update(placements);

    return {
      revision: ++this.revisionValue,
      exact: entries.every((entry) => entry.source === "measured"),
      geometryRevision: this.geometryIndex.revision,
      rootIds: [...rootIds],
      entries: entries.map((entry) => ({
        ...entry,
        splitOffsets: entry.splitOffsets ? [...entry.splitOffsets] : undefined,
        preferredSplitOffsets: entry.preferredSplitOffsets
          ? [...entry.preferredSplitOffsets]
          : undefined,
        tableRows: entry.tableRows?.map((row) => ({ ...row })),
      })),
      items: items.map(cloneItem),
      result: cloneResult(result),
      placements: placements.map(clonePlacement),
      projection: this.layoutProjection,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.preparedRootSnapshot = null;
    this.geometryIndex.clear();
    this.layoutProjection.dispose();
  }

  private readRootSnapshot(): RootSnapshot {
    const rootIds = [...this.doc.model.getChildrenIds(this.doc.rootId)];
    return {
      rootIds,
      seeds: rootIds.map((blockId) => this.seedFromModel(blockId)),
    };
  }

  private seedFromModel(blockId: string): PaginationGeometrySeed {
    const flavour = this.doc.model.getFlavour(blockId) ?? "unknown";
    const nodeType = this.doc.model.getNodeType(blockId) ?? BlockNodeType.void;
    const props = this.doc.model.getProps(blockId);
    return {
      blockId,
      flavour,
      nodeType,
      isHeading: nodeType === BlockNodeType.editable && !!props?.["heading"],
      estimatedHeight: this.resolveEstimatedHeight(blockId, {
        flavour,
        nodeType,
        props,
      }),
    };
  }

  private resolveEstimatedHeight(
    blockId: string,
    rootFacts?: {
      flavour: string;
      nodeType: BlockNodeType;
      props?: Record<string, unknown>;
    },
  ): number {
    const configured =
      this.doc.config.virtualization?.estimatedHeights ?? {};
    return estimateModelBlockHeight(this.doc, blockId, {
      estimatedHeights: configured,
      defaultHeight: DEFAULT_ESTIMATED_HEIGHT,
      rootFacts,
    });
  }

  private syncSnapshot(snapshot: RootSnapshot): void {
    this.geometryIndex.syncRootOrder(snapshot.seeds);
  }
}
