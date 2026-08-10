import { BlockNodeType } from "../../../block-std/types/block.type";
import {
  PageSlotFragment,
  PaginationItem,
  PaginationResult,
} from "../engine";
import {planTableCellFlow} from "../engine/table-cell-flow";
import {setTableCellFlowPlan} from "../engine/table-cell-flow-metadata";
import { ResolvedPaginationGeometry } from "../pagination.types";
import { PaginationGeometryEntry } from "./pagination-geometry-index";
import {
  buildProjectedBlockPlacements,
  PaginatedLayoutProjection,
  ProjectedBlockPlacement,
} from "./paginated-layout-projection";

function placement(
  blockId: string,
  overrides: Partial<ProjectedBlockPlacement> = {},
): ProjectedBlockPlacement {
  return {
    blockId,
    firstPageIndex: 0,
    beforeGap: 0,
    projectedHostHeight: 10,
    internalPageGap: 0,
    fragments: [],
    ...overrides,
  };
}

function entry(
  blockId: string,
  naturalHeight: number,
  overrides: Partial<PaginationGeometryEntry> = {},
): PaginationGeometryEntry {
  return {
    blockId,
    flavour: "paragraph",
    nodeType: BlockNodeType.editable,
    isHeading: false,
    contentRevision: 0,
    measureContextRevision: 0,
    measurementEpoch: 0,
    source: "measured",
    naturalHeight,
    effectiveHeight: naturalHeight,
    ...overrides,
  };
}

function item(
  id: string,
  height: number,
  overrides: Partial<PaginationItem> = {},
): PaginationItem {
  return {
    id,
    height,
    breakable: true,
    keepWithNext: false,
    ...overrides,
  };
}

function geometry(
  overrides: Partial<ResolvedPaginationGeometry> = {},
): ResolvedPaginationGeometry {
  return {
    sheetWidthPx: 800,
    sheetHeightPx: 120,
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    pageGap: 20,
    headerHeight: 0,
    footerHeight: 0,
    geometry: { contentHeight: 100 },
    ...overrides,
  };
}

describe("PaginatedLayoutProjection", () => {
  it("separates structural extent from the projected host top", () => {
    const projection = new PaginatedLayoutProjection();
    projection.update([
      placement("a", {
        beforeGap: 0,
        projectedHostHeight: 80,
        internalPageGap: 0,
      }),
      placement("divider", {
        beforeGap: 0,
        projectedHostHeight: 0,
        internalPageGap: 0,
      }),
      placement("b", {
        beforeGap: 140,
        projectedHostHeight: 60,
        internalPageGap: 0,
      }),
      placement("table", {
        beforeGap: 0,
        projectedHostHeight: 240,
        internalPageGap: 120,
      }),
    ]);

    expect(projection.offsetAt(2)).toBe(80);
    expect(projection.contentOffsetAt(2)).toBe(220);
    expect(projection.extentAt(2)).toBe(200);
    expect(projection.rangeHeight(1, 3)).toBe(560);
    expect(projection.totalHeight).toBe(640);
  });

  it("uses half-open boundaries while skipping zero-height placements", () => {
    const projection = new PaginatedLayoutProjection();
    projection.update([
      placement("a", { projectedHostHeight: 10 }),
      placement("divider", { projectedHostHeight: 0 }),
      placement("b", { projectedHostHeight: 20 }),
    ]);

    expect(projection.indexAtOffset(-1)).toBe(0);
    expect(projection.indexAtOffset(0)).toBe(0);
    expect(projection.indexAtOffset(9.99)).toBe(0);
    expect(projection.indexAtOffset(10)).toBe(2);
    expect(projection.indexAtOffset(30)).toBe(2);
    expect(projection.offsetAt(1)).toBe(10);
    expect(projection.offsetAt(2)).toBe(10);
    expect(projection.contentOffsetAt(3)).toBe(30);
  });

  it("keeps empty projection endpoint queries well-defined", () => {
    const projection = new PaginatedLayoutProjection();
    projection.update([]);

    expect(projection.length).toBe(0);
    expect(projection.totalHeight).toBe(0);
    expect(projection.offsetAt(0)).toBe(0);
    expect(projection.contentOffsetAt(0)).toBe(0);
    expect(projection.indexAtOffset(0)).toBe(-1);
  });

  it("publishes one revision for each successful update", () => {
    const projection = new PaginatedLayoutProjection();
    const revisions: number[] = [];
    projection.change$.subscribe((change) => revisions.push(change.revision));

    projection.update([placement("a")]);
    projection.update([placement("a", { projectedHostHeight: 20 })]);

    expect(revisions).toEqual([1, 2]);
    expect(projection.revision).toBe(2);
  });

  it("does not publish an idempotent projection update", () => {
    const projection = new PaginatedLayoutProjection();
    const revisions: number[] = [];
    const willChangeRevisions: number[] = [];
    projection.change$.subscribe((change) => revisions.push(change.revision));
    projection.willChange$.subscribe((change) =>
      willChangeRevisions.push(change.revision),
    );
    const first = placement("table", {
      beforeGap: 40,
      projectedHostHeight: 120,
      internalPageGap: 60,
      fragments: [{ fromOffset: 0, toOffset: 120 }],
    });

    projection.update([first]);
    projection.update([{
      ...first,
      fragments: first.fragments.map(fragment => ({...fragment})),
    }]);

    expect(revisions).toEqual([1]);
    expect(willChangeRevisions).toEqual([1]);
    expect(projection.revision).toBe(1);
    expect(projection.totalHeight).toBe(220);
  });

  it("can force an idempotent update for an external layout transaction", () => {
    const projection = new PaginatedLayoutProjection();
    const revisions: number[] = [];
    projection.change$.subscribe((change) => revisions.push(change.revision));
    const stablePlacement = placement("a", {projectedHostHeight: 20});

    projection.update([stablePlacement]);
    projection.update([stablePlacement], {force: true});

    expect(revisions).toEqual([1, 2]);
    expect(projection.revision).toBe(2);
  });

  it("publishes willChange before replacing the previous geometry", () => {
    const projection = new PaginatedLayoutProjection();
    projection.update([placement("a", { projectedHostHeight: 10 })]);
    const observations: Array<[number, number]> = [];
    projection.willChange$.subscribe((change) => {
      observations.push([change.revision, projection.totalHeight]);
    });

    projection.update([placement("a", { projectedHostHeight: 30 })]);

    expect(observations).toEqual([[2, 10]]);
    expect(projection.totalHeight).toBe(30);
  });

  it("rejects duplicate, missing, and invalid placement data before mutation", () => {
    const projection = new PaginatedLayoutProjection();
    const revisions: number[] = [];
    projection.change$.subscribe((change) => revisions.push(change.revision));
    projection.update([placement("stable", { projectedHostHeight: 25 })]);

    expect(() =>
      projection.update([placement("dup"), placement("dup")]),
    ).toThrowError(/Duplicate pagination placement id/);
    expect(() =>
      projection.update([placement("", { projectedHostHeight: 30 })]),
    ).toThrowError(/blockId is required/);
    expect(() =>
      projection.update([placement("invalid", { beforeGap: -1 })]),
    ).toThrowError(RangeError);
    expect(() =>
      projection.update([
        placement("zero-fragment", {
          fragments: [{ fromOffset: 10, toOffset: 10 }],
        }),
      ]),
    ).toThrowError(/toOffset must follow fromOffset/);

    expect(projection.revision).toBe(1);
    expect(projection.length).toBe(1);
    expect(projection.totalHeight).toBe(25);
    expect(projection.placementAt(0).blockId).toBe("stable");
    expect(revisions).toEqual([1]);
  });

  it("rejects finite extents whose running total overflows before mutation", () => {
    const projection = new PaginatedLayoutProjection();
    const revisions: number[] = [];
    projection.change$.subscribe((change) => revisions.push(change.revision));
    projection.update([placement("stable", { projectedHostHeight: 25 })]);

    expect(() =>
      projection.update([
        placement("huge-a", { projectedHostHeight: Number.MAX_VALUE }),
        placement("huge-b", { projectedHostHeight: Number.MAX_VALUE }),
      ]),
    ).toThrowError(/total height must be finite/);

    expect(projection.revision).toBe(1);
    expect(projection.totalHeight).toBe(25);
    expect(projection.placementAt(0).blockId).toBe("stable");
    expect(projection.indexAtOffset(25)).toBe(0);
    expect(revisions).toEqual([1]);
  });

  it("owns immutable fragment copies on update and read", () => {
    const projection = new PaginatedLayoutProjection();
    const fragments: PageSlotFragment[] = [{ fromOffset: 0, toOffset: 40 }];
    projection.update([placement("table", { fragments })]);
    fragments[0]!.toOffset = 999;

    const firstRead = projection.placementAt(0);
    expect(firstRead.fragments).toEqual([{ fromOffset: 0, toOffset: 40 }]);
    (firstRead.fragments as PageSlotFragment[])[0]!.toOffset = 888;

    expect(projection.placementAt(0).fragments).toEqual([
      { fromOffset: 0, toOffset: 40 },
    ]);
  });

  it("completes once and ignores updates after disposal", () => {
    const projection = new PaginatedLayoutProjection();
    const complete = jasmine.createSpy("complete");
    projection.change$.subscribe({ complete });
    projection.update([placement("a")]);

    projection.dispose();
    projection.dispose();
    projection.update([placement("b", { projectedHostHeight: 20 })]);

    expect(complete).toHaveBeenCalledTimes(1);
    expect(projection.revision).toBe(1);
    expect(projection.placementAt(0).blockId).toBe("a");
  });
});

describe("buildProjectedBlockPlacements", () => {
  function fixture(): {
    rootIds: string[];
    entries: PaginationGeometryEntry[];
    items: PaginationItem[];
    result: PaginationResult;
  } {
    const rootIds = ["a", "divider", "b", "table"];
    const entries = [
      entry("a", 80),
      entry("divider", 12, {
        flavour: "page-divider",
        nodeType: BlockNodeType.void,
      }),
      entry("b", 60),
      entry("table", 240, {
        flavour: "table",
        nodeType: BlockNodeType.block,
        lockHeight: 200,
        tableRows: [
          { id: "row-0", top: 0, bottom: 80, coveredFromAbove: false },
          { id: "row-1", top: 80, bottom: 160, coveredFromAbove: false },
          { id: "row-2", top: 160, bottom: 240, coveredFromAbove: false },
        ],
      }),
    ];
    const items = [
      item("a", 80),
      item("divider", 0, { manualBreak: true }),
      item("b", 60),
      item("table", 200, { splitOffsets: [80, 160] }),
    ];
    const result: PaginationResult = {
      pages: [
        { index: 0, slots: [{ id: "a" }], usedHeight: 80 },
        { index: 1, slots: [{ id: "b" }], usedHeight: 60 },
        {
          index: 2,
          slots: [{ id: "table", fragment: { fromOffset: 0, toOffset: 80 } }],
          usedHeight: 80,
        },
        {
          index: 3,
          slots: [{ id: "table", fragment: { fromOffset: 80, toOffset: 160 } }],
          usedHeight: 80,
        },
        {
          index: 4,
          slots: [
            { id: "table", fragment: { fromOffset: 160, toOffset: 240 } },
          ],
          usedHeight: 80,
        },
      ],
      byBlock: new Map([
        ["a", { pageIndex: 0 }],
        ["b", { pageIndex: 1 }],
        ["table", { pageIndex: 2 }],
      ]),
    };
    return { rootIds, entries, items, result };
  }

  it("maps block gaps, table gaps, host heights, pages, and fragments", () => {
    const data = fixture();
    const placements = buildProjectedBlockPlacements(
      data.rootIds,
      data.entries,
      data.items,
      data.result,
      geometry(),
    );

    expect(placements).toEqual([
      placement("a", { firstPageIndex: 0, projectedHostHeight: 80 }),
      placement("divider", { firstPageIndex: -1, projectedHostHeight: 0 }),
      placement("b", {
        firstPageIndex: 1,
        beforeGap: 60,
        projectedHostHeight: 60,
      }),
      placement("table", {
        firstPageIndex: 2,
        beforeGap: 80,
        projectedHostHeight: 200,
        internalPageGap: 120,
        fragments: [
          { fromOffset: 0, toOffset: 80 },
          { fromOffset: 80, toOffset: 160 },
          { fromOffset: 160, toOffset: 240 },
        ],
      }),
    ]);
    expect("exact" in placements[0]!).toBeFalse();

    data.result.pages[2]!.slots[0]!.fragment!.toOffset = 999;
    expect(placements[3]!.fragments[0]).toEqual({
      fromOffset: 0,
      toOffset: 80,
    });
  });

  it("matches table continuations within the legacy row tolerance and skips misses", () => {
    const data = fixture();
    data.result.pages[3]!.slots[0]!.fragment!.fromOffset = 81.5;
    data.result.pages[4]!.slots[0]!.fragment!.fromOffset = 165;

    const placements = buildProjectedBlockPlacements(
      data.rootIds,
      data.entries,
      data.items,
      data.result,
      geometry(),
    );

    expect(placements[3]!.internalPageGap).toBe(60);
  });

  it("uses the virtual cell-flow extent so blocks after an oversized cell start on the computed sheet", () => {
    const plan = planTableCellFlow([{
      kind: "cell-flow",
      rowId: "row-0",
      cells: [
        {
          cellId: "left",
          points: [
            {offset: 90, anchor: {kind: "text", blockId: "left-p", offset: 10}},
            {offset: 180, anchor: {kind: "cell-end"}},
          ],
        },
        {
          cellId: "right",
          points: [
            {offset: 60, anchor: {kind: "text", blockId: "right-p", offset: 10}},
            {offset: 150, anchor: {kind: "text", blockId: "right-p", offset: 20}},
            {offset: 240, anchor: {kind: "cell-end"}},
          ],
        },
      ],
    }], 100);
    expect(plan.paginationHeight).toBe(270);

    const result: PaginationResult = {
      pages: [
        {index: 0, slots: [{id: "table", fragment: {fromOffset: 0, toOffset: 90}}], usedHeight: 90},
        {index: 1, slots: [{id: "table", fragment: {fromOffset: 90, toOffset: 180}}], usedHeight: 90},
        {index: 2, slots: [{id: "table", fragment: {fromOffset: 180, toOffset: 270}}], usedHeight: 90},
        {index: 3, slots: [{id: "after"}], usedHeight: 30},
      ],
      byBlock: new Map([
        ["table", {pageIndex: 0}],
        ["after", {pageIndex: 3}],
      ]),
    };
    const tableEntry = entry("table", 240, {
      flavour: "table",
      nodeType: BlockNodeType.block,
      tableRows: [{id: "row-0", top: 0, bottom: 240, coveredFromAbove: false}],
      tableCellFlowPlan: plan,
    });
    const tableItem = item("table", 270, {
      splitOffsets: plan.splitOffsets,
      splitStartsNewPage: true,
    });
    setTableCellFlowPlan(tableItem, plan);
    const placements = buildProjectedBlockPlacements(
      ["table", "after"],
      [
        tableEntry,
        entry("after", 30),
      ],
      [
        tableItem,
        item("after", 30),
      ],
      result,
      geometry(),
    );

    expect(placements).toEqual([
      placement("table", {
        projectedHostHeight: 270,
        internalPageGap: 100,
        fragments: [
          {fromOffset: 0, toOffset: 90},
          {fromOffset: 90, toOffset: 180},
          {fromOffset: 180, toOffset: 270},
        ],
      }),
      placement("after", {
        firstPageIndex: 3,
        beforeGap: 50,
        projectedHostHeight: 30,
      }),
    ]);

    const projection = new PaginatedLayoutProjection();
    projection.update(placements);
    // 三张纸的内容起点分别为 0/140/280；后续块应从第 4 张纸内容顶 420 开始。
    expect(projection.contentOffsetAt(1)).toBe(420);
  });

  it("counts every inline-text continuation gap and keeps the following block on its computed sheet", () => {
    const textEntry = entry("text", 250, {
      splitOffsets: [80, 160],
      inlineBreakPlan: {
        points: [
          {layoutOffset: 80, textOffset: 20},
          {layoutOffset: 160, textOffset: 40},
        ],
      },
    });
    const result: PaginationResult = {
      pages: [
        {
          index: 0,
          slots: [{id: "text", fragment: {fromOffset: 0, toOffset: 80}}],
          usedHeight: 80,
        },
        {
          index: 1,
          slots: [{id: "text", fragment: {fromOffset: 80, toOffset: 160}}],
          usedHeight: 80,
        },
        {
          index: 2,
          slots: [{id: "text", fragment: {fromOffset: 160, toOffset: 250}}],
          usedHeight: 90,
        },
        {index: 3, slots: [{id: "after"}], usedHeight: 30},
      ],
      byBlock: new Map([
        ["text", {pageIndex: 0}],
        ["after", {pageIndex: 3}],
      ]),
    };
    const placements = buildProjectedBlockPlacements(
      ["text", "after"],
      [textEntry, entry("after", 30)],
      [
        item("text", 250, {splitOffsets: [80, 160]}),
        item("after", 30),
      ],
      result,
      geometry(),
    );

    expect(placements).toEqual([
      placement("text", {
        projectedHostHeight: 250,
        internalPageGap: 120,
        fragments: [
          {fromOffset: 0, toOffset: 80},
          {fromOffset: 80, toOffset: 160},
          {fromOffset: 160, toOffset: 250},
        ],
      }),
      placement("after", {
        firstPageIndex: 3,
        beforeGap: 50,
        projectedHostHeight: 30,
      }),
    ]);

    const projection = new PaginatedLayoutProjection();
    projection.update(placements);
    expect(projection.extentAt(0)).toBe(370);
    expect(projection.contentOffsetAt(1)).toBe(420);
  });

  it("rejects duplicate and missing IDs before returning a partial layout", () => {
    const data = fixture();

    expect(() =>
      buildProjectedBlockPlacements(
        ["a", "a"],
        data.entries,
        data.items,
        data.result,
        geometry(),
      ),
    ).toThrowError(/Duplicate pagination root id/);
    expect(() =>
      buildProjectedBlockPlacements(
        data.rootIds,
        [...data.entries, data.entries[0]!],
        data.items,
        data.result,
        geometry(),
      ),
    ).toThrowError(/Duplicate pagination geometry id/);
    expect(() =>
      buildProjectedBlockPlacements(
        data.rootIds,
        data.entries.filter((value) => value.blockId !== "b"),
        data.items,
        data.result,
        geometry(),
      ),
    ).toThrowError(/Missing pagination geometry for b/);
    expect(() =>
      buildProjectedBlockPlacements(
        data.rootIds,
        data.entries,
        data.items.filter((value) => value.id !== "b"),
        data.result,
        geometry(),
      ),
    ).toThrowError(/Missing pagination item for b/);
  });

  it("rejects unknown result slots and missing non-manual result placements", () => {
    const data = fixture();
    data.result.pages[0]!.slots.push({ id: "unknown" });
    expect(() =>
      buildProjectedBlockPlacements(
        data.rootIds,
        data.entries,
        data.items,
        data.result,
        geometry(),
      ),
    ).toThrowError(/unknown root: unknown/);

    const missing = fixture();
    missing.result.pages = missing.result.pages
      .filter((page) => page.slots[0]?.id !== "b")
      .map((page, index) => ({ ...page, index }));
    expect(() =>
      buildProjectedBlockPlacements(
        missing.rootIds,
        missing.entries,
        missing.items,
        missing.result,
        geometry(),
      ),
    ).toThrowError(/Missing pagination result placement for b/);
  });

  it("rejects page index drift before building placements", () => {
    const data = fixture();
    data.result.pages[2]!.index = 9;

    expect(() =>
      buildProjectedBlockPlacements(
        data.rootIds,
        data.entries,
        data.items,
        data.result,
        geometry(),
      ),
    ).toThrowError(/page index mismatch/);
  });

  it("rejects duplicate, reversed, and overlapping fragment sequences", () => {
    const duplicate = fixture();
    duplicate.result.pages[3]!.slots[0]!.fragment = {
      fromOffset: 0,
      toOffset: 80,
    };
    expect(() =>
      buildProjectedBlockPlacements(
        duplicate.rootIds,
        duplicate.entries,
        duplicate.items,
        duplicate.result,
        geometry(),
      ),
    ).toThrowError(/Duplicate pagination fragment/);

    for (const fromOffset of [79, 40]) {
      const invalid = fixture();
      invalid.result.pages[3]!.slots[0]!.fragment!.fromOffset = fromOffset;
      expect(() =>
        buildProjectedBlockPlacements(
          invalid.rootIds,
          invalid.entries,
          invalid.items,
          invalid.result,
          geometry(),
        ),
      ).toThrowError(/ordered and non-overlapping/);
    }
  });

  it("rejects zero-length fragments before continuation gaps can be counted", () => {
    const data = fixture();
    data.result.pages[3]!.slots[0]!.fragment = {
      fromOffset: 80,
      toOffset: 80,
    };
    data.result.pages[4]!.slots[0]!.fragment = {
      fromOffset: 80,
      toOffset: 160,
    };

    expect(() =>
      buildProjectedBlockPlacements(
        data.rootIds,
        data.entries,
        data.items,
        data.result,
        geometry(),
      ),
    ).toThrowError(/toOffset must follow fromOffset/);
  });

  it("rejects whole-slot mixing, duplicate whole slots, and unordered table rows", () => {
    const mixed = fixture();
    mixed.result.pages[3]!.slots[0] = { id: "table" };
    expect(() =>
      buildProjectedBlockPlacements(
        mixed.rootIds,
        mixed.entries,
        mixed.items,
        mixed.result,
        geometry(),
      ),
    ).toThrowError(/whole and fragment slots/);

    const duplicateWhole = fixture();
    duplicateWhole.result.pages[0]!.slots.push({ id: "a" });
    expect(() =>
      buildProjectedBlockPlacements(
        duplicateWhole.rootIds,
        duplicateWhole.entries,
        duplicateWhole.items,
        duplicateWhole.result,
        geometry(),
      ),
    ).toThrowError(/duplicate whole slots/);

    const unorderedRows = fixture();
    const table = unorderedRows.entries.find(
      (value) => value.blockId === "table",
    )!;
    unorderedRows.entries[3] = {
      ...table,
      tableRows: [table.tableRows![1]!, table.tableRows![0]!],
    };
    expect(() =>
      buildProjectedBlockPlacements(
        unorderedRows.rootIds,
        unorderedRows.entries,
        unorderedRows.items,
        unorderedRows.result,
        geometry(),
      ),
    ).toThrowError(/table rows must be ordered/);
  });
});
