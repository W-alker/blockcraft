import { Subject } from "rxjs";
import { HeightMap } from "../../virtualization/height-map";
import {
  VerticalLayoutChange,
  VerticalLayoutProjection,
} from "../../virtualization/layout-projection";
import { PageSlotFragment, PaginationItem, PaginationResult } from "../engine";
import { ResolvedPaginationGeometry } from "../pagination.types";
import { computeBlockGaps } from "../view/sheet-layout";
import { PaginationGeometryEntry } from "./pagination-geometry-index";

const ROW_MATCH_TOLERANCE = 2;

export interface ProjectedBlockPlacement {
  readonly blockId: string;
  readonly firstPageIndex: number;
  readonly beforeGap: number;
  readonly projectedHostHeight: number;
  readonly internalPageGap: number;
  readonly fragments: readonly PageSlotFragment[];
}

interface FragmentContinuation {
  readonly fromOffset: number;
  readonly gap: number;
}

function assertNonNegativeFinite(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${field} must be a finite non-negative number`);
  }
}

function assertPlacement(placement: ProjectedBlockPlacement): void {
  if (!placement.blockId) {
    throw new Error("Pagination placement blockId is required");
  }
  if (
    !Number.isInteger(placement.firstPageIndex) ||
    placement.firstPageIndex < -1
  ) {
    throw new RangeError(`Invalid firstPageIndex for ${placement.blockId}`);
  }
  assertNonNegativeFinite(
    placement.beforeGap,
    `beforeGap for ${placement.blockId}`,
  );
  assertNonNegativeFinite(
    placement.projectedHostHeight,
    `projectedHostHeight for ${placement.blockId}`,
  );
  assertNonNegativeFinite(
    placement.internalPageGap,
    `internalPageGap for ${placement.blockId}`,
  );
  placement.fragments.forEach((fragment, index) => {
    assertNonNegativeFinite(
      fragment.fromOffset,
      `fragments[${index}].fromOffset for ${placement.blockId}`,
    );
    assertNonNegativeFinite(
      fragment.toOffset,
      `fragments[${index}].toOffset for ${placement.blockId}`,
    );
    if (fragment.toOffset <= fragment.fromOffset) {
      throw new RangeError(
        `fragments[${index}].toOffset must follow fromOffset for ${placement.blockId}`,
      );
    }
  });
}

function clonePlacement(
  placement: ProjectedBlockPlacement,
): ProjectedBlockPlacement {
  return {
    ...placement,
    fragments: placement.fragments.map((fragment) => ({ ...fragment })),
  };
}

function placementsEqual(
  left: readonly ProjectedBlockPlacement[],
  right: readonly ProjectedBlockPlacement[],
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  return left.every((placement, index) => {
    const other = right[index];
    return !!other
      && placement.blockId === other.blockId
      && placement.firstPageIndex === other.firstPageIndex
      && placement.beforeGap === other.beforeGap
      && placement.projectedHostHeight === other.projectedHostHeight
      && placement.internalPageGap === other.internalPageGap
      && placement.fragments.length === other.fragments.length
      && placement.fragments.every((fragment, fragmentIndex) => {
        const otherFragment = other.fragments[fragmentIndex];
        return !!otherFragment
          && fragment.fromOffset === otherFragment.fromOffset
          && fragment.toOffset === otherFragment.toOffset;
      });
  });
}

function uniqueMap<T>(
  values: readonly T[],
  idOf: (value: T) => string,
  label: string,
): Map<string, T> {
  const result = new Map<string, T>();
  for (const value of values) {
    const id = idOf(value);
    if (!id) throw new Error(`${label} id is required`);
    if (result.has(id)) throw new Error(`Duplicate ${label} id: ${id}`);
    result.set(id, value);
  }
  return result;
}

function sumTablePageGaps(
  entry: PaginationGeometryEntry,
  continuations: readonly FragmentContinuation[] | undefined,
): number {
  if (!continuations?.length) return 0;

  // 超高单元格的 fragment offset 属于规划器生成的“虚拟内容流”，不会与
  // 自然 tableRows.top 重合。此时每个续页 gap 都已经由真实 PaginationResult
  // 算出，必须全量计入根投影；否则稀疏分页会仍用表格自然高度定位后续块，
  // 使表格下方内容逐页向上漂移。
  if (entry.tableCellFlowPlan) {
    return continuations.reduce((total, continuation) => total + continuation.gap, 0);
  }

  const rows = entry.tableRows;
  if (!rows?.length) return 0;

  let previousTop = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    if (row.top < previousTop) {
      throw new Error(
        `Pagination table rows must be ordered for ${entry.blockId}`,
      );
    }
    previousTop = row.top;
  }

  let total = 0;
  let rowIndex = 0;
  let previousOffset = Number.NEGATIVE_INFINITY;
  for (const continuation of continuations) {
    if (continuation.fromOffset < previousOffset) {
      throw new Error(
        `Pagination table continuations must be ordered for ${entry.blockId}`,
      );
    }
    previousOffset = continuation.fromOffset;
    while (
      rowIndex < rows.length &&
      rows[rowIndex]!.top < continuation.fromOffset - ROW_MATCH_TOLERANCE
    ) {
      rowIndex++;
    }
    const row = rows[rowIndex];
    if (
      row &&
      Math.abs(row.top - continuation.fromOffset) <= ROW_MATCH_TOLERANCE
    ) {
      total += continuation.gap;
    }
  }
  return total;
}

function sumFragmentPageGaps(
  continuations: readonly FragmentContinuation[] | undefined,
): number {
  return continuations?.reduce(
    (total, continuation) => total + continuation.gap,
    0,
  ) ?? 0;
}

export function buildProjectedBlockPlacements(
  rootIds: readonly string[],
  entries: readonly PaginationGeometryEntry[],
  items: readonly PaginationItem[],
  result: PaginationResult,
  geometry: ResolvedPaginationGeometry,
): readonly ProjectedBlockPlacement[] {
  assertNonNegativeFinite(geometry.sheetHeightPx, "sheetHeightPx");
  assertNonNegativeFinite(geometry.pageGap, "pageGap");

  const rootById = uniqueMap(rootIds, (id) => id, "pagination root");
  const entryById = uniqueMap(
    entries,
    (entry) => entry.blockId,
    "pagination geometry",
  );
  const itemById = uniqueMap(items, (item) => item.id, "pagination item");

  for (const rootId of rootIds) {
    if (!entryById.has(rootId))
      throw new Error(`Missing pagination geometry for ${rootId}`);
    if (!itemById.has(rootId))
      throw new Error(`Missing pagination item for ${rootId}`);
  }

  const firstPageById = new Map<string, number>();
  const fragmentsById = new Map<string, PageSlotFragment[]>();
  const fragmentContinuations = new Map<string, FragmentContinuation[]>();
  const slotKindById = new Map<string, "whole" | "fragment">();
  const lastFragmentById = new Map<string, PageSlotFragment>();
  for (let pageIndex = 0; pageIndex < result.pages.length; pageIndex++) {
    const page = result.pages[pageIndex]!;
    if (page.index !== pageIndex) {
      throw new Error(
        `Pagination page index mismatch: expected ${pageIndex}, received ${page.index}`,
      );
    }
    assertNonNegativeFinite(
      page.usedHeight,
      `usedHeight for page ${pageIndex}`,
    );
    for (const slot of page.slots) {
      if (!rootById.has(slot.id)) {
        throw new Error(
          `Pagination result references unknown root: ${slot.id}`,
        );
      }
      if (!firstPageById.has(slot.id)) firstPageById.set(slot.id, page.index);
      if (slot.fragment) {
        if (slotKindById.get(slot.id) === "whole") {
          throw new Error(
            `Pagination result mixes whole and fragment slots for ${slot.id}`,
          );
        }
        assertNonNegativeFinite(
          slot.fragment.fromOffset,
          `fragment.fromOffset for ${slot.id}`,
        );
        assertNonNegativeFinite(
          slot.fragment.toOffset,
          `fragment.toOffset for ${slot.id}`,
        );
        if (slot.fragment.toOffset <= slot.fragment.fromOffset) {
          throw new RangeError(
            `fragment.toOffset must follow fromOffset for ${slot.id}`,
          );
        }
        const previous = lastFragmentById.get(slot.id);
        if (
          previous &&
          slot.fragment.fromOffset === previous.fromOffset &&
          slot.fragment.toOffset === previous.toOffset
        ) {
          throw new Error(`Duplicate pagination fragment for ${slot.id}`);
        }
        if (previous && slot.fragment.fromOffset < previous.toOffset) {
          throw new Error(
            `Pagination fragments must be ordered and non-overlapping for ${slot.id}`,
          );
        }
        slotKindById.set(slot.id, "fragment");
        lastFragmentById.set(slot.id, { ...slot.fragment });
        const fragments = fragmentsById.get(slot.id) ?? [];
        fragments.push({ ...slot.fragment });
        fragmentsById.set(slot.id, fragments);
      } else {
        if (slotKindById.has(slot.id)) {
          const reason =
            slotKindById.get(slot.id) === "whole"
              ? "duplicate whole slots"
              : "whole and fragment slots";
          throw new Error(`Pagination result mixes ${reason} for ${slot.id}`);
        }
        slotKindById.set(slot.id, "whole");
      }
    }

    if (pageIndex === 0) continue;
    const first = page.slots[0];
    if (!first?.fragment || first.fragment.fromOffset <= 0) continue;
    const gap =
      geometry.sheetHeightPx +
      geometry.pageGap -
      result.pages[pageIndex - 1]!.usedHeight;
    if (gap <= 0) continue;
    const continuations = fragmentContinuations.get(first.id) ?? [];
    continuations.push({ fromOffset: first.fragment.fromOffset, gap });
    fragmentContinuations.set(first.id, continuations);
  }

  const blockGaps = computeBlockGaps(
    result,
    geometry.sheetHeightPx,
    geometry.pageGap,
  );
  const placements: ProjectedBlockPlacement[] = [];
  for (const rootId of rootIds) {
    const entry = entryById.get(rootId)!;
    const item = itemById.get(rootId)!;
    const isManualBreak =
      item.manualBreak === true || entry.flavour === "page-divider";
    const firstPageIndex = isManualBreak ? -1 : firstPageById.get(rootId);
    if (firstPageIndex == null) {
      throw new Error(`Missing pagination result placement for ${rootId}`);
    }

    placements.push({
      blockId: rootId,
      firstPageIndex,
      beforeGap: blockGaps.get(rootId) ?? 0,
      projectedHostHeight: isManualBreak
        ? 0
        : (
          entry.lockHeight
          ?? entry.tableCellFlowPlan?.paginationHeight
          ?? entry.naturalHeight
        ),
      internalPageGap:
        entry.flavour === "table"
          ? sumTablePageGaps(entry, fragmentContinuations.get(rootId))
          : entry.inlineBreakPlan
            ? sumFragmentPageGaps(fragmentContinuations.get(rootId))
            : 0,
      fragments:
        fragmentsById.get(rootId)?.map((fragment) => ({ ...fragment })) ?? [],
    });
  }
  return placements;
}

export class PaginatedLayoutProjection implements VerticalLayoutProjection {
  private readonly extents = new HeightMap();
  private readonly changes = new Subject<VerticalLayoutChange>();
  private readonly willChanges = new Subject<VerticalLayoutChange>();
  private beforeGaps = new Float64Array(0);
  private placements: readonly ProjectedBlockPlacement[] = [];
  private blockIdsValue: readonly string[] = [];
  private revisionValue = 0;
  private disposed = false;

  readonly change$ = this.changes.asObservable();
  readonly willChange$ = this.willChanges.asObservable();

  get revision(): number {
    return this.revisionValue;
  }

  get length(): number {
    return this.extents.length;
  }

  get totalHeight(): number {
    return this.extents.totalHeight;
  }

  get blockIds(): readonly string[] {
    return this.blockIdsValue;
  }

  update(
    placements: readonly ProjectedBlockPlacement[],
    options: {readonly force?: boolean} = {},
  ): void {
    if (this.disposed) return;

    const seen = new Set<string>();
    const nextPlacements: ProjectedBlockPlacement[] = [];
    const nextBeforeGaps = new Float64Array(placements.length);
    const nextExtents: number[] = [];
    let runningTotal = 0;
    placements.forEach((placement, index) => {
      assertPlacement(placement);
      if (seen.has(placement.blockId)) {
        throw new Error(
          `Duplicate pagination placement id: ${placement.blockId}`,
        );
      }
      seen.add(placement.blockId);
      const copy = clonePlacement(placement);
      nextPlacements.push(copy);
      nextBeforeGaps[index] = copy.beforeGap;
      const extent =
        copy.beforeGap + copy.projectedHostHeight + copy.internalPageGap;
      assertNonNegativeFinite(extent, `projected extent for ${copy.blockId}`);
      runningTotal += extent;
      if (!Number.isFinite(runningTotal)) {
        throw new RangeError(
          "Projected pagination total height must be finite",
        );
      }
      nextExtents.push(extent);
    });

    // Sparse pagination recomputes when the mounted virtual window changes.
    // Once the newly mounted roots have already contributed the same measured
    // geometry, publishing another projection revision is not only wasted work:
    // it opens a scroll-anchor transaction with no layout change. Safari can
    // deliver the corresponding scroll event after the restore frame, causing
    // that stale anchor to pull the viewport back on every scroll attempt.
    if (
      !options.force
      && this.revisionValue > 0
      && placementsEqual(this.placements, nextPlacements)
    ) {
      return;
    }

    const revision = this.revisionValue + 1;
    this.willChanges.next({ revision });
    this.extents.bulkInit(nextExtents);
    this.beforeGaps = nextBeforeGaps;
    this.placements = nextPlacements;
    this.blockIdsValue = nextPlacements.map((placement) => placement.blockId);
    this.revisionValue = revision;
    this.changes.next({ revision });
  }

  offsetAt(index: number): number {
    return this.extents.getOffset(index);
  }

  contentOffsetAt(index: number): number {
    const offset = this.extents.getOffset(index);
    return index === this.extents.length
      ? offset
      : offset + this.beforeGaps[index]!;
  }

  extentAt(index: number): number {
    return this.extents.get(index);
  }

  rangeHeight(start: number, end: number): number {
    return this.extents.getRangeHeight(start, end);
  }

  indexAtOffset(offset: number): number {
    return this.extents.findIndexByOffset(offset);
  }

  placementAt(index: number): ProjectedBlockPlacement {
    this.extents.get(index);
    return clonePlacement(this.placements[index]!);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.willChanges.complete();
    this.changes.complete();
  }
}
