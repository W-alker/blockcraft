import { BlockNodeType } from "../../../block-std/types/block.type";
import {
  IBlockModelContentChange,
  IBlockModelStructureChange,
} from "../../../doc/model-graph";
import {
  paginate,
  PaginationItem,
  PaginationResult,
} from "../engine";
import {cloneTableCellFlowPlan} from "../engine/table-cell-flow";
import {
  copyTableCellFlowPlan,
  setTableCellFlowPlan,
} from "../engine/table-cell-flow-metadata";
import {
  PaginationConfig,
  ResolvedPaginationGeometry,
} from "../pagination.types";
import { BlockMeta, buildPaginationItems } from "../view/item-builder";
import {cloneInlinePaginationBreakPlan} from '../view/inline-break-plan';
import {
  PaginationGeometryEntry,
  PaginationGeometryIndex,
  PaginationGeometryMeasurement,
  PaginationGeometrySeed,
  PaginationMeasureContext,
} from "./pagination-geometry-index";
import {isPaginationHeading} from './pagination-heading';
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

/** @internal Result of applying one DOM-measurement ticket. */
export interface PaginationMeasurementApplyResult {
  /** False means the geometry changed after the caller captured its ticket. */
  readonly accepted: boolean;
  /** True only when the accepted batch changed stored pagination geometry. */
  readonly changed: boolean;
}

interface RootSnapshot {
  readonly rootIds: readonly string[];
  readonly seeds: readonly PaginationGeometrySeed[];
}

type PaginationGeometrySemantics = Omit<
  PaginationGeometrySeed,
  'estimatedHeight'
>;

function entryToMeta(entry: PaginationGeometryEntry): BlockMeta {
  // 只有完整 DOM 测量能确认流式图片/视频的媒体主体；稀疏布局不得从
  // lockHeight/flavour 猜测 fitScale，否则会把固定坐标对象误当成可缩放块。
  const fitScale = entry.fitScale
  const meta: BlockMeta = {
    id: entry.blockId,
    flavour: entry.flavour,
    nodeType: entry.nodeType,
    isHeading: entry.isHeading,
    height: entry.tableCellFlowPlan?.paginationHeight
      ?? (entry.lockHeight != null && fitScale == null
        ? entry.lockHeight
        : entry.effectiveHeight),
    splitOffsets: entry.splitOffsets ? [...entry.splitOffsets] : undefined,
    inlineBreakPlan: cloneInlinePaginationBreakPlan(entry.inlineBreakPlan),
    preferredSplitOffsets: entry.preferredSplitOffsets
      ? [...entry.preferredSplitOffsets]
      : undefined,
    lockHeight: entry.lockHeight,
    fitScale,
    repeatHeaderHeight: entry.repeatHeaderHeight,
  };
  if (entry.trailingSpacing != null) meta.trailingSpacing = entry.trailingSpacing;
  setTableCellFlowPlan(
    meta,
    entry.tableCellFlowPlan
      ? cloneTableCellFlowPlan(entry.tableCellFlowPlan)
      : undefined,
  );
  return meta;
}

function cloneItem(item: PaginationItem): PaginationItem {
  const clone: PaginationItem = {
    ...item,
    splitOffsets: item.splitOffsets ? [...item.splitOffsets] : undefined,
    preferredSplitOffsets: item.preferredSplitOffsets
      ? [...item.preferredSplitOffsets]
      : undefined,
  };
  copyTableCellFlowPlan(item, clone, cloneTableCellFlowPlan);
  return clone;
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
  private requiredMeasurementEpoch = 0;
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
    const semanticRootIds = new Set<string>();
    for (const blockId of change.blockIds) {
      const path = this.doc.model.getPath(blockId);
      const rootId = path?.[0] === this.doc.rootId ? path[1] : undefined;
      if (!rootId) continue;
      rootIds.add(rootId);
      if (change.kinds.includes("props") && blockId === rootId) {
        semanticRootIds.add(rootId);
      }
    }
    const affectedRootIds = [...rootIds];
    this.geometryIndex.markContentDirty(affectedRootIds);
    if (semanticRootIds.size) {
      this.geometryIndex.syncRootSemantics(
        [...semanticRootIds].map(blockId => this.semanticsFromModel(blockId)),
      );
    }
    this.refreshObjectSizingEstimates(affectedRootIds.filter(blockId =>
      modelHeightEstimateAffectedByContentChange(this.doc, blockId, change),
    ));
  }

  applyStructureChange(change: IBlockModelStructureChange): void {
    if (this.disposed) return;
    const affectedRootIds = change.affectedRootIds
      ?? this.doc.model.getChildrenIds(this.doc.rootId);
    const estimateRootIds = this.structureEstimateRootIds(
      change,
      affectedRootIds,
    );
    const estimateRootIdSet = new Set(estimateRootIds);
    this.geometryIndex.markStructureDirty(estimateRootIds);
    this.geometryIndex.markContentDirty(
      affectedRootIds.filter(blockId => !estimateRootIdSet.has(blockId)),
    );
    this.syncRootOrder();
  }

  updateMeasureContext(context: PaginationMeasureContext): void {
    if (this.disposed) return;
    this.geometryIndex.setMeasureContext(context);
  }

  /**
   * @internal Sets the natural-DOM freshness required for an exact snapshot.
   * This deliberately does not mutate geometry revision.
   */
  setRequiredMeasurementEpoch(epoch: number): void {
    if (this.disposed) return;
    if (!Number.isFinite(epoch) || epoch < 0) {
      throw new RangeError('measurementEpoch must be a finite non-negative number');
    }
    this.requiredMeasurementEpoch = epoch;
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
        layoutMode: 'paginated',
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
    measurementEpoch: number,
  ): PaginationMeasurementApplyResult {
    if (
      this.disposed ||
      expectedGeometryRevision !== this.geometryIndex.revision ||
      measurementEpoch !== this.requiredMeasurementEpoch
    ) {
      return {accepted: false, changed: false};
    }
    return {
      accepted: true,
      changed: this.geometryIndex.applyMeasured(measurements, measurementEpoch),
    };
  }

  compute(
    config: PaginationConfig,
    geometry: ResolvedPaginationGeometry,
    options: {readonly forceProjectionUpdate?: boolean} = {},
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
    this.layoutProjection.update(placements, {
      force: options.forceProjectionUpdate,
    });

    return {
      revision: ++this.revisionValue,
      exact: entries.every((entry) =>
        entry.source === "measured"
        && entry.measurementEpoch === this.requiredMeasurementEpoch
      ),
      geometryRevision: this.geometryIndex.revision,
      rootIds: [...rootIds],
      entries: entries.map((entry) => ({
        ...entry,
        splitOffsets: entry.splitOffsets ? [...entry.splitOffsets] : undefined,
        inlineBreakPlan: cloneInlinePaginationBreakPlan(entry.inlineBreakPlan),
        preferredSplitOffsets: entry.preferredSplitOffsets
          ? [...entry.preferredSplitOffsets]
          : undefined,
        tableRows: entry.tableRows?.map((row) => ({ ...row })),
        tableCellFlowPlan: entry.tableCellFlowPlan
          ? cloneTableCellFlowPlan(entry.tableCellFlowPlan)
          : undefined,
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
      isHeading: this.isHeading(flavour, nodeType, props?.["heading"]),
      estimatedHeight: this.resolveEstimatedHeight(blockId, {
        flavour,
        nodeType,
        props,
      }),
    };
  }

  private semanticsFromModel(blockId: string): PaginationGeometrySemantics {
    const flavour = this.doc.model.getFlavour(blockId) ?? "unknown";
    const nodeType = this.doc.model.getNodeType(blockId) ?? BlockNodeType.void;
    const heading = nodeType === BlockNodeType.editable
      ? this.doc.model.getProps(blockId)?.["heading"]
      : undefined;
    return {
      blockId,
      flavour,
      nodeType,
      isHeading: this.isHeading(flavour, nodeType, heading),
    };
  }

  private isHeading(
    flavour: string,
    nodeType: BlockNodeType,
    heading: unknown,
  ): boolean {
    return isPaginationHeading({
      nodeType,
      heading,
      plainTextOnly:
        this.doc.schemas?.get(flavour, false)?.metadata.plainTextOnly === true,
    });
  }

  private structureEstimateRootIds(
    change: IBlockModelStructureChange,
    affectedRootIds: readonly string[],
  ): readonly string[] {
    const parentIds = change.affectedParentIds ?? [];
    if (!parentIds.length) return affectedRootIds;

    const rootIds = new Set<string>();
    for (const parentId of parentIds) {
      // Direct-root insertion, deletion or reordering changes the root list but
      // not the surviving roots' own extent.
      if (parentId === this.doc.rootId) continue;
      const path = this.doc.model.getPath(parentId);
      const rootId = path?.[0] === this.doc.rootId ? path[1] : undefined;
      // A removed parent can no longer be resolved after ModelGraph publishes.
      // In that uncommon case, refresh the producer-provided affected roots.
      if (!rootId) return affectedRootIds;
      rootIds.add(rootId);
    }
    return [...rootIds];
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
      layoutMode: 'paginated',
      rootFacts,
    });
  }

  private syncSnapshot(snapshot: RootSnapshot): void {
    this.geometryIndex.syncRootOrder(snapshot.seeds);
  }
}
