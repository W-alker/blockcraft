import { BlockNodeType } from "../../../block-std/types/block.type";
import { PaginationResult } from "../engine";
import { ResolvedPaginationGeometry } from "../pagination.types";
import { StablePaginationLayout } from "../view/stable-pagination-layout";
import {
  PaginationGeometryEntry,
  PaginationGeometryMeasurement,
} from "./pagination-geometry-index";
import { PaginationLayoutState } from "./pagination-layout-coordinator";
import { PaginatedLayoutProjection } from "./paginated-layout-projection";
import {
  comparePaginationShadow,
  PaginationShadowMismatch,
  shadowMismatchSignature,
} from "./pagination-shadow-comparator";

function geometry(): ResolvedPaginationGeometry {
  return {
    sheetWidthPx: 800,
    sheetHeightPx: 120,
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    pageGap: 20,
    headerHeight: 0,
    footerHeight: 0,
    geometry: { contentHeight: 100 },
  };
}

function result(pages: PaginationResult["pages"]): PaginationResult {
  return {
    pages,
    byBlock: new Map(),
  };
}

function stableLayout(
  paginationResult: PaginationResult,
  revision = 1,
): StablePaginationLayout {
  return {
    revision,
    config: {},
    geometry: geometry(),
    items: [],
    result: paginationResult,
  };
}

function shadowLayout(
  paginationResult: PaginationResult,
  entries: readonly PaginationGeometryEntry[] = [],
  revision = 1,
): PaginationLayoutState {
  return {
    revision,
    exact: true,
    geometryRevision: 1,
    rootIds: [],
    entries,
    items: [],
    result: paginationResult,
    placements: [],
    projection: new PaginatedLayoutProjection(),
  };
}

function tableMeasurement(
  rows: NonNullable<PaginationGeometryMeasurement["tableRows"]>,
): PaginationGeometryMeasurement {
  return {
    id: "table",
    flavour: "table",
    nodeType: BlockNodeType.block,
    isHeading: false,
    naturalHeight: 100,
    height: 100,
    tableRows: rows,
  };
}

function tableEntry(
  rows: NonNullable<PaginationGeometryEntry["tableRows"]>,
): PaginationGeometryEntry {
  return {
    blockId: "table",
    flavour: "table",
    nodeType: BlockNodeType.block,
    isHeading: false,
    contentRevision: 0,
    measureContextRevision: 0,
    source: "measured",
    naturalHeight: 100,
    effectiveHeight: 100,
    tableRows: rows,
  };
}

function recursivePlainValue(value: unknown): boolean {
  if (value == null || ["string", "number", "boolean"].includes(typeof value)) {
    return true;
  }
  if (Array.isArray(value)) return value.every(recursivePlainValue);
  if (Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Object.values(value as Record<string, unknown>).every(
    recursivePlainValue,
  );
}

describe("pagination shadow comparator", () => {
  it("returns no mismatch for equal pages, slots, gaps, and independently-derived table breaks", () => {
    const paginationResult = result([
      { index: 0, usedHeight: 80, slots: [{ id: "a" }] },
      {
        index: 1,
        usedHeight: 50,
        slots: [{ id: "table", fragment: { fromOffset: 0, toOffset: 50 } }],
      },
      {
        index: 2,
        usedHeight: 50,
        slots: [{ id: "table", fragment: { fromOffset: 50, toOffset: 100 } }],
      },
    ]);
    const rows = [
      { id: "r1", top: 0, bottom: 50, coveredFromAbove: false },
      { id: "r2", top: 50, bottom: 100, coveredFromAbove: false },
    ];

    expect(
      comparePaginationShadow(
        stableLayout(paginationResult),
        [tableMeasurement(rows)],
        shadowLayout(paginationResult, [tableEntry(rows)]),
      ),
    ).toEqual([]);
  });

  it("reports fragment changes with stable page and slot coordinates", () => {
    const legacy = result([
      {
        index: 0,
        usedHeight: 40,
        slots: [{ id: "text", fragment: { fromOffset: 0, toOffset: 40 } }],
      },
    ]);
    const shadow = result([
      {
        index: 0,
        usedHeight: 40,
        slots: [{ id: "text", fragment: { fromOffset: 0, toOffset: 42 } }],
      },
    ]);

    expect(
      comparePaginationShadow(stableLayout(legacy), [], shadowLayout(shadow)),
    ).toContain(
      jasmine.objectContaining({
        kind: "slot-fragment",
        path: "pages[0].slots[0].fragment",
        legacy: { fromOffset: 0, toOffset: 40 },
        shadow: { fromOffset: 0, toOffset: 42 },
      }),
    );
  });

  it("reports page count, used height, and slot ids in deterministic order", () => {
    const legacy = result([
      {
        index: 0,
        usedHeight: 40,
        slots: [{ id: "legacy" }],
      },
    ]);
    const shadow = result([
      { index: 0, usedHeight: 50, slots: [{ id: "shadow" }] },
      { index: 1, usedHeight: 10, slots: [{ id: "extra" }] },
    ]);

    expect(
      comparePaginationShadow(
        stableLayout(legacy),
        [],
        shadowLayout(shadow),
      ).slice(0, 3),
    ).toEqual([
      {
        kind: "page-count",
        path: "pages.length",
        legacy: 1,
        shadow: 2,
      },
      {
        kind: "used-height",
        path: "pages[0].usedHeight",
        legacy: 40,
        shadow: 50,
      },
      {
        kind: "slot",
        path: "pages[0].slots[0].id",
        legacy: "legacy",
        shadow: "shadow",
      },
    ]);
  });

  it("normalizes page-first block gaps from each result", () => {
    const legacy = result([
      { index: 0, usedHeight: 80, slots: [{ id: "a" }] },
      { index: 1, usedHeight: 20, slots: [{ id: "b" }] },
    ]);
    const shadow = result([
      { index: 0, usedHeight: 70, slots: [{ id: "a" }] },
      { index: 1, usedHeight: 20, slots: [{ id: "b" }] },
    ]);

    expect(
      comparePaginationShadow(stableLayout(legacy), [], shadowLayout(shadow)),
    ).toContain(
      jasmine.objectContaining({
        kind: "block-gap",
        path: 'blockGaps["b"]',
        legacy: 60,
        shadow: 70,
      }),
    );
  });

  it("uses legacy measurements and shadow entries independently for table row and gap diagnostics", () => {
    const legacy = result([
      {
        index: 0,
        usedHeight: 70,
        slots: [{ id: "table", fragment: { fromOffset: 0, toOffset: 50 } }],
      },
      {
        index: 1,
        usedHeight: 50,
        slots: [{ id: "table", fragment: { fromOffset: 50, toOffset: 100 } }],
      },
    ]);
    const shadow = result([
      {
        index: 0,
        usedHeight: 60,
        slots: [{ id: "table", fragment: { fromOffset: 0, toOffset: 50 } }],
      },
      {
        index: 1,
        usedHeight: 50,
        slots: [{ id: "table", fragment: { fromOffset: 50, toOffset: 100 } }],
      },
    ]);
    const legacyRows = [
      { id: "legacy-r1", top: 0, bottom: 50, coveredFromAbove: false },
      { id: "legacy-r2", top: 50, bottom: 100, coveredFromAbove: false },
    ];
    const shadowRows = [
      { id: "shadow-r1", top: 0, bottom: 50, coveredFromAbove: false },
      { id: "shadow-r2", top: 50, bottom: 100, coveredFromAbove: false },
    ];

    const mismatches = comparePaginationShadow(
      stableLayout(legacy),
      [tableMeasurement(legacyRows)],
      shadowLayout(shadow, [tableEntry(shadowRows)]),
    );

    expect(mismatches).toContain(
      jasmine.objectContaining({
        kind: "table-break",
        path: 'tableBreaks["table"][0].beforeRowId',
        legacy: "legacy-r2",
        shadow: "shadow-r2",
      }),
    );
    expect(mismatches).toContain(
      jasmine.objectContaining({
        kind: "table-break",
        path: 'tableBreaks["table"][0].gap',
        legacy: 70,
        shadow: 80,
      }),
    );
  });

  it("applies 0.01px tolerance to all compared numeric fields", () => {
    const legacy = result([
      {
        index: 0,
        usedHeight: 40,
        slots: [{ id: "text", fragment: { fromOffset: 0, toOffset: 40 } }],
      },
    ]);
    const shadow = result([
      {
        index: 0,
        usedHeight: 40.009,
        slots: [
          { id: "text", fragment: { fromOffset: 0.009, toOffset: 40.009 } },
        ],
      },
    ]);

    expect(
      comparePaginationShadow(stableLayout(legacy), [], shadowLayout(shadow)),
    ).toEqual([]);
  });

  it("caps deterministic plain-data diagnostics and excludes layout revisions from signatures", () => {
    const legacyPages: PaginationResult["pages"] = [];
    const shadowPages: PaginationResult["pages"] = [];
    for (let index = 0; index < 30; index++) {
      legacyPages.push({
        index,
        usedHeight: 10,
        slots: [{ id: `legacy-${index}` }],
      });
      shadowPages.push({
        index,
        usedHeight: 20,
        slots: [{ id: `shadow-${index}` }],
      });
    }

    const first = comparePaginationShadow(
      stableLayout(result(legacyPages), 1),
      [],
      shadowLayout(result(shadowPages), [], 2),
    );
    const second = comparePaginationShadow(
      stableLayout(result(legacyPages), 999),
      [],
      shadowLayout(result(shadowPages), [], 1000),
    );

    expect(first.length).toBe(20);
    expect(second).toEqual(first);
    expect(
      first.every(
        (mismatch) =>
          recursivePlainValue(mismatch.legacy) &&
          recursivePlainValue(mismatch.shadow),
      ),
    ).toBeTrue();
    expect(shadowMismatchSignature(first)).toBe(
      shadowMismatchSignature(second),
    );
    expect(shadowMismatchSignature(first)).not.toContain("revision");

    const reordered: PaginationShadowMismatch[] = [...first].reverse();
    expect(shadowMismatchSignature(reordered)).not.toBe(
      shadowMismatchSignature(first),
    );
  });
});
