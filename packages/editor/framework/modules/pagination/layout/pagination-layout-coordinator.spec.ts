import { BlockNodeType } from "../../../block-std/types/block.type";
import { PageDividerBlockSchema } from "../../../../blocks/page-divider-block";
import {
  IBlockModelContentChange,
  IBlockModelStructureChange,
} from "../../../doc/model-graph";
import {
  PaginationConfig,
  ResolvedPaginationGeometry,
} from "../pagination.types";
import { PaginationGeometryMeasurement } from "./pagination-geometry-index";
import { PaginationLayoutCoordinator } from "./pagination-layout-coordinator";
import {buildPaginationItems} from '../view/item-builder';
import {planTableCellFlow} from '../engine/table-cell-flow';
import {
  getTableCellFlowPlan,
  setTableCellFlowPlan,
} from '../engine/table-cell-flow-metadata';

interface ModelFact {
  readonly flavour: string;
  readonly nodeType: BlockNodeType;
  readonly props?: Record<string, unknown>;
  readonly path: readonly string[];
  readonly children?: readonly string[];
  readonly deltas?: readonly {
    readonly insert: string | Readonly<Record<string, unknown>>;
    readonly attributes?: Readonly<Record<string, unknown>>;
  }[];
}

class ModelHarness {
  rootIds: string[];
  readonly reads = {
    children: 0,
    flavour: 0,
    nodeType: 0,
    props: 0,
  };

  constructor(
    rootIds: readonly string[],
    private readonly facts: ReadonlyMap<string, ModelFact>,
  ) {
    this.rootIds = [...rootIds];
  }

  getChildrenIds(blockId: string): readonly string[] {
    this.reads.children++;
    return blockId === "root"
      ? [...this.rootIds]
      : [...(this.facts.get(blockId)?.children ?? [])];
  }

  getParentId(blockId: string): string | null {
    const path = this.facts.get(blockId)?.path;
    return path && path.length > 1 ? path.at(-2) ?? null : null;
  }

  getPath(blockId: string): readonly string[] | null {
    return this.facts.get(blockId)?.path ?? null;
  }

  getFlavour(blockId: string): string | undefined {
    this.reads.flavour++;
    return this.facts.get(blockId)?.flavour;
  }

  getNodeType(blockId: string): BlockNodeType | undefined {
    this.reads.nodeType++;
    return this.facts.get(blockId)?.nodeType;
  }

  getProps(blockId: string): Record<string, unknown> | undefined {
    this.reads.props++;
    const props = this.facts.get(blockId)?.props;
    return props ? { ...props } : undefined;
  }

  getTextDeltas(blockId: string): ModelFact['deltas'] {
    return this.facts.get(blockId)?.deltas ?? [];
  }
}

function fact(blockId: string, overrides: Partial<ModelFact> = {}): ModelFact {
  return {
    flavour: "paragraph",
    nodeType: BlockNodeType.editable,
    props: {},
    path: ["root", blockId],
    children: [],
    ...overrides,
  };
}

function createHarness(
  rootIds: readonly string[],
  facts: ReadonlyMap<string, ModelFact>,
  estimatedHeights: Readonly<Record<string, number>> = {},
): { doc: BlockCraft.Doc; model: ModelHarness } {
  const model = new ModelHarness(rootIds, facts);
  const doc = {
    rootId: "root",
    model,
    config: { virtualization: { estimatedHeights } },
    schemas: {
      get: (flavour: string) => {
        if (flavour === PageDividerBlockSchema.flavour) {
          return PageDividerBlockSchema;
        }
        if (flavour === "code") {
          return {metadata: {plainTextOnly: true}};
        }
        return null;
      },
    },
    get vm(): never {
      throw new Error("Coordinator must not read doc.vm");
    },
    getBlockById(): never {
      throw new Error("Coordinator must not read mounted blocks");
    },
  } as unknown as BlockCraft.Doc;
  return { doc, model };
}

function measurement(
  id: string,
  naturalHeight: number,
  overrides: Partial<PaginationGeometryMeasurement> = {},
): PaginationGeometryMeasurement {
  return {
    id,
    flavour: "paragraph",
    nodeType: BlockNodeType.editable,
    isHeading: false,
    naturalHeight,
    height: naturalHeight,
    ...overrides,
  };
}

function contentChange(
  blockIds: readonly string[],
  kinds: IBlockModelContentChange['kinds'] = ["text", "props"],
): IBlockModelContentChange {
  return {
    blockIds,
    kinds,
    origin: null,
    local: true,
    isUndoRedo: false,
  };
}

function structureChange(
  affectedRootIds: readonly string[],
  affectedParentIds: readonly string[] = [],
): IBlockModelStructureChange {
  return {
    revision: 1,
    reachableAddedIds: [],
    reachableRemovedIds: [],
    affectedParentIds,
    affectedRootIds,
  };
}

function config(overrides: PaginationConfig = {}): PaginationConfig {
  return { pageGap: 20, ...overrides };
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

describe("PaginationLayoutCoordinator", () => {
  it("keeps sparse width-only fit pagination identical to the legacy measured path", () => {
    const facts = new Map<string, ModelFact>([
      ["wide", fact("wide", {
        flavour: "bookmark",
        nodeType: BlockNodeType.void,
      })],
      ["body", fact("body")],
    ]);
    const {doc} = createHarness(["wide", "body"], facts);
    const coordinator = new PaginationLayoutCoordinator(doc);
    coordinator.syncRootOrder();
    const wide = measurement("wide", 80, {
      flavour: "bookmark",
      nodeType: BlockNodeType.void,
      height: 40,
      fitScale: 0.5,
    });
    const body = measurement("body", 60);
    coordinator.applyMeasured([wide, body], coordinator.geometryRevision, 0);

    const sparse = coordinator.compute(config(), geometry());
    const legacy = buildPaginationItems([
      {
        id: wide.id,
        flavour: wide.flavour,
        nodeType: wide.nodeType,
        isHeading: wide.isHeading,
        height: wide.height,
        fitScale: wide.fitScale,
      },
      {
        id: body.id,
        flavour: body.flavour,
        nodeType: body.nodeType,
        isHeading: body.isHeading,
        height: body.height,
      },
    ]);

    expect(sparse.entries[0]).toEqual(jasmine.objectContaining({
      naturalHeight: 80,
      effectiveHeight: 40,
      fitScale: 0.5,
    }));
    const paginationFields = ({
      id,
      height,
      fitScale,
      breakable,
      keepWithNext,
    }: (typeof sparse.items)[number]) => ({
      id,
      height,
      fitScale,
      breakable,
      keepWithNext,
    });
    expect(sparse.items.map(paginationFields)).toEqual(legacy.map(paginationFields));
    expect(sparse.result.pages.length).toBe(1);
  });

  it("seeds responsive object height from wr/ar without mounting the block", () => {
    const facts = new Map<string, ModelFact>([
      [
        "image",
        fact("image", {
          flavour: "image",
          nodeType: BlockNodeType.block,
          props: {wr: 50, ar: 2},
        }),
      ],
    ]);
    const {doc} = createHarness(["image"], facts);
    (doc as any).schemas = {
      get: () => ({
        metadata: {
          objectSizing: {defaultWr: 100, defaultAr: 4 / 3},
        },
      }),
    };
    let resolvedHeight = 200;
    (doc as any).objectSizing = {
      resolve: () => ({
        width: resolvedHeight * 2,
        height: resolvedHeight,
        wr: 50,
        ar: 2,
        source: "ratio",
        exact: true,
      }),
    };

    const coordinator = new PaginationLayoutCoordinator(doc);
    const state = coordinator.compute(config(), geometry());

    expect(state.entries[0]).toEqual(jasmine.objectContaining({
      blockId: "image",
      naturalHeight: 200,
      source: "estimated",
    }));

    coordinator.applyMeasured(
      [{
        id: "image",
        flavour: "image",
        nodeType: BlockNodeType.block,
        isHeading: false,
        naturalHeight: 210,
        height: 105,
        fitScale: 0.5,
      }],
      coordinator.geometryRevision,
      0,
    );
    resolvedHeight = 250;
    coordinator.refreshObjectSizingEstimates();
    const resizedState = coordinator.compute(config(), geometry());
    expect(resizedState.entries[0]).toEqual(jasmine.objectContaining({
      naturalHeight: 250,
      effectiveHeight: 250,
      source: "estimated",
    }));
    expect(resizedState.entries[0].fitScale).toBeUndefined();
    expect(resizedState.entries[0].lockHeight).toBeUndefined();
    expect(resizedState.items[0].height).toBe(250);
  });

  it("maps nested content changes to one direct-root geometry record", () => {
    const facts = new Map<string, ModelFact>([
      [
        "callout",
        fact("callout", {
          flavour: "callout",
          nodeType: BlockNodeType.block,
        }),
      ],
      [
        "paragraph",
        fact("paragraph", {
          path: ["root", "callout", "paragraph"],
        }),
      ],
    ]);
    const {doc, model} = createHarness(["callout"], facts);
    const coordinator = new PaginationLayoutCoordinator(doc);
    coordinator.syncRootOrder();
    coordinator.applyMeasured(
      [
        measurement("callout", 80, {
          flavour: "callout",
          nodeType: BlockNodeType.block,
        }),
      ],
      coordinator.geometryRevision,
      0,
    );
    model.reads.flavour = 0;
    model.reads.nodeType = 0;
    model.reads.props = 0;

    facts.set("paragraph", fact("paragraph", {
      path: ["root", "callout", "paragraph"],
      props: {heading: 1},
    }));
    coordinator.applyContentChange(
      contentChange(["paragraph", "paragraph"], ["props"]),
    );
    expect(model.reads.props).toBe(0);
    expect(model.reads.nodeType).toBe(1);
    expect(coordinator.applyMeasured(
      [measurement("callout", 80, {
        flavour: "callout",
        nodeType: BlockNodeType.block,
        isHeading: false,
      })],
      coordinator.geometryRevision,
      0,
    ).accepted).toBeTrue();
    const state = coordinator.compute(config(), geometry());

    expect(state.entries).toEqual([
      jasmine.objectContaining({
        blockId: "callout",
        contentRevision: 1,
        isHeading: false,
        source: "measured",
        naturalHeight: 80,
      }),
    ]);
  });

  it("does not rescan table rows for cell text and ignores legacy row height props", () => {
    const rowIds = Array.from({length: 5}, (_, index) => `row-${index}`);
    const facts = new Map<string, ModelFact>([
      ["table", fact("table", {
        flavour: "table",
        nodeType: BlockNodeType.block,
        children: rowIds,
      })],
      ...rowIds.map((rowId, index) => [rowId, fact(rowId, {
        flavour: "table-row",
        nodeType: BlockNodeType.block,
        props: {height: 60},
        path: ["root", "table", rowId],
        children: index === 0 ? ["paragraph"] : [],
      })] as const),
      ["paragraph", fact("paragraph", {
        path: ["root", "table", "row-0", "paragraph"],
      })],
    ]);
    const {doc, model} = createHarness(["table"], facts, {table: 240});
    const coordinator = new PaginationLayoutCoordinator(doc);
    coordinator.syncRootOrder();
    expect(coordinator.compute(config(), geometry()).entries[0].naturalHeight)
      .toBe(300);
    model.reads.children = 0;

    coordinator.applyContentChange(contentChange(["paragraph"], ["text"]));
    expect(model.reads.children).toBe(0);
    expect(coordinator.compute(config(), geometry()).entries[0].naturalHeight)
      .toBe(300);

    facts.set("row-0", fact("row-0", {
      flavour: "table-row",
      nodeType: BlockNodeType.block,
      props: {height: 100},
      path: ["root", "table", "row-0"],
      children: ["paragraph"],
    }));
    coordinator.applyContentChange(contentChange(["row-0"], ["props"]));
    expect(model.reads.children).toBeGreaterThan(0);
    expect(coordinator.compute(config(), geometry()).entries[0].naturalHeight)
      .toBe(300);
  });

  it("reuses geometry for root reorders and invalidates both nested move owners", () => {
    const facts = new Map<string, ModelFact>([
      [
        "left",
        fact("left", { flavour: "callout", nodeType: BlockNodeType.block }),
      ],
      [
        "right",
        fact("right", { flavour: "callout", nodeType: BlockNodeType.block }),
      ],
      ["leaf", fact("leaf", { path: ["root", "right", "leaf"] })],
    ]);
    const { doc, model } = createHarness(["left", "right"], facts);
    const coordinator = new PaginationLayoutCoordinator(doc);
    coordinator.syncRootOrder();
    coordinator.applyMeasured(
      [
        measurement("left", 60, {
          flavour: "callout",
          nodeType: BlockNodeType.block,
        }),
        measurement("right", 70, {
          flavour: "callout",
          nodeType: BlockNodeType.block,
        }),
      ],
      coordinator.geometryRevision,
      0,
    );

    model.rootIds = ["right", "left"];
    coordinator.applyStructureChange(structureChange([], ["root"]));
    let state = coordinator.compute(config(), geometry());
    expect(state.rootIds).toEqual(["right", "left"]);
    expect(
      state.entries.map((entry) => [
        entry.blockId,
        entry.naturalHeight,
        entry.source,
      ]),
    ).toEqual([
      ["right", 70, "measured"],
      ["left", 60, "measured"],
    ]);

    coordinator.applyStructureChange(
      structureChange(["left", "right", "left"], ["left", "right"]),
    );
    state = coordinator.compute(config(), geometry());
    expect(
      state.entries.map((entry) => [
        entry.blockId,
        entry.contentRevision,
        entry.source,
      ]),
    ).toEqual([
      ["right", 1, "estimated"],
      ["left", 1, "estimated"],
    ]);
  });

  it("invalidates natural geometry for width, page height, widow/orphan, theme and font but not page gap", () => {
    const facts = new Map<string, ModelFact>([["a", fact("a")]]);
    const { doc } = createHarness(["a"], facts);
    const coordinator = new PaginationLayoutCoordinator(doc);
    coordinator.updateMeasureContext({
      contentWidth: 720,
      contentHeight: 100,
      widowOrphanLines: 2,
      theme: "light",
      fontEpoch: 0,
      rendererRevision: 0,
    });
    coordinator.syncRootOrder();
    coordinator.applyMeasured(
      [measurement("a", 40)],
      coordinator.geometryRevision,
      0,
    );

    const initial = coordinator.compute(config(), geometry());
    const changedGap = coordinator.compute(
      config({ pageGap: 80 }),
      geometry({
        pageGap: 80,
      }),
    );
    expect(changedGap.geometryRevision).toBe(initial.geometryRevision);
    expect(changedGap.exact).toBeTrue();

    let previousRevision = changedGap.geometryRevision;
    for (const context of [
      {
        contentWidth: 720, contentHeight: 80, widowOrphanLines: 2,
        theme: "light", fontEpoch: 0, rendererRevision: 0,
      },
      {
        contentWidth: 720, contentHeight: 80, widowOrphanLines: 3,
        theme: "light", fontEpoch: 0, rendererRevision: 0,
      },
      {
        contentWidth: 640, contentHeight: 80, widowOrphanLines: 3,
        theme: "light", fontEpoch: 0, rendererRevision: 0,
      },
      {
        contentWidth: 640, contentHeight: 80, widowOrphanLines: 3,
        theme: "dark", fontEpoch: 0, rendererRevision: 0,
      },
      {
        contentWidth: 640, contentHeight: 80, widowOrphanLines: 3,
        theme: "dark", fontEpoch: 1, rendererRevision: 0,
      },
    ]) {
      coordinator.updateMeasureContext(context);
      const state = coordinator.compute(config(), geometry());
      expect(state.geometryRevision).toBe(previousRevision + 1);
      expect(state.exact).toBeFalse();
      previousRevision = state.geometryRevision;
    }
  });

  it("computes pure paginated state from model order without mounted views or DOM", () => {
    const facts = new Map<string, ModelFact>([
      ["heading", fact("heading", { props: { heading: 2 } })],
      ["body", fact("body")],
    ]);
    const { doc } = createHarness(["heading", "body"], facts);
    const coordinator = new PaginationLayoutCoordinator(doc);
    coordinator.syncRootOrder();
    coordinator.applyMeasured(
      [
        measurement("heading", 30, { isHeading: true }),
        measurement("body", 90),
      ],
      coordinator.geometryRevision,
      0,
    );

    const state = coordinator.compute(config(), geometry());

    expect(state.exact).toBeTrue();
    expect(state.rootIds).toEqual(["heading", "body"]);
    expect(state.items.map((item) => item.id)).toEqual(["heading", "body"]);
    expect(state.result.pages.length).toBe(2);
    expect(state.placements.map((placement) => placement.blockId)).toEqual([
      "heading",
      "body",
    ]);
    expect(state.projection.revision).toBe(1);
    expect(state.projection.length).toBe(2);
  });

  it("refreshes root semantics before measuring heading prop changes", () => {
    const facts = new Map<string, ModelFact>([
      ["paragraph", fact("paragraph")],
    ]);
    const {doc, model} = createHarness(["paragraph"], facts);
    const coordinator = new PaginationLayoutCoordinator(doc);
    coordinator.syncRootOrder();
    coordinator.applyMeasured(
      [measurement("paragraph", 32)],
      coordinator.geometryRevision,
      0,
    );
    coordinator.compute(config(), geometry());

    for (const [heading, naturalHeight] of [
      [1, 48],
      [2, 40],
      [undefined, 32],
    ] as const) {
      facts.set("paragraph", fact("paragraph", {
        props: heading == null ? {} : {heading},
      }));
      model.reads.props = 0;
      coordinator.applyContentChange(
        contentChange(["paragraph"], ["props"]),
      );
      expect(model.reads.props).toBe(1);

      const isHeading = heading != null;
      const applied = coordinator.applyMeasured(
        [measurement("paragraph", naturalHeight, {isHeading})],
        coordinator.geometryRevision,
        0,
      );
      const state = coordinator.compute(config(), geometry());

      expect(applied.accepted).toBeTrue();
      expect(state.entries[0]).toEqual(jasmine.objectContaining({
        blockId: "paragraph",
        isHeading,
        naturalHeight,
        source: "measured",
      }));
      expect(state.exact).toBeTrue();
    }
  });

  it("ignores retained heading props on plain-text editable roots", () => {
    const facts = new Map<string, ModelFact>([
      ["code", fact("code", {
        flavour: "code",
        props: {heading: 1},
      })],
    ]);
    const {doc} = createHarness(["code"], facts);
    const coordinator = new PaginationLayoutCoordinator(doc);
    coordinator.syncRootOrder();

    expect(coordinator.compute(config(), geometry()).entries[0].isHeading)
      .toBeFalse();
    expect(coordinator.applyMeasured(
      [measurement("code", 160, {
        flavour: "code",
        isHeading: false,
        height: 100,
        lockHeight: 100,
      })],
      coordinator.geometryRevision,
      0,
    ).accepted).toBeTrue();
  });

  it("publishes offscreen heading semantics before its first measurement", () => {
    const facts = new Map<string, ModelFact>([
      ["mounted", fact("mounted")],
      ["offscreen", fact("offscreen")],
    ]);
    const {doc} = createHarness(["mounted", "offscreen"], facts);
    const coordinator = new PaginationLayoutCoordinator(doc);
    coordinator.syncRootOrder();
    coordinator.applyMeasured(
      [measurement("mounted", 32)],
      coordinator.geometryRevision,
      0,
    );
    coordinator.compute(config(), geometry());

    facts.set("offscreen", fact("offscreen", {props: {heading: 1}}));
    coordinator.applyContentChange(
      contentChange(["offscreen"], ["props"]),
    );

    const estimated = coordinator.compute(config(), geometry());
    expect(estimated.entries.find(entry => entry.blockId === "offscreen"))
      .toEqual(jasmine.objectContaining({
        isHeading: true,
        source: "estimated",
      }));

    const applied = coordinator.applyMeasured(
      [measurement("offscreen", 48, {isHeading: true})],
      coordinator.geometryRevision,
      0,
    );
    const measured = coordinator.compute(config(), geometry());

    expect(applied.accepted).toBeTrue();
    expect(measured.entries.find(entry => entry.blockId === "offscreen"))
      .toEqual(jasmine.objectContaining({
        isHeading: true,
        naturalHeight: 48,
        source: "measured",
      }));
  });

  it("replaces a stale offscreen inline-image height when estimation falls back", () => {
    const facts = new Map<string, ModelFact>([
      ["paragraph", fact("paragraph", {
        deltas: [{
          insert: {image: "image.png"},
          attributes: {width: 320, height: 240},
        }],
      })],
    ]);
    const {doc} = createHarness(["paragraph"], facts, {paragraph: 48});
    const coordinator = new PaginationLayoutCoordinator(doc);

    const initial = coordinator.compute(config(), geometry());
    expect(initial.entries[0]).toEqual(jasmine.objectContaining({
      naturalHeight: 240,
      source: "estimated",
    }));
    expect(coordinator.applyMeasured(
      [measurement("paragraph", 260, {splitOffsets: [120]})],
      coordinator.geometryRevision,
      0,
    ).accepted).toBeTrue();

    facts.set("paragraph", fact("paragraph"));
    coordinator.applyContentChange(contentChange(["paragraph"], ["text"]));
    const fallback = coordinator.compute(config(), geometry());

    expect(fallback.entries[0]).toEqual(jasmine.objectContaining({
      naturalHeight: 48,
      effectiveHeight: 48,
      source: "estimated",
    }));
    expect(fallback.entries[0].splitOffsets).toBeUndefined();
    expect(fallback.items[0].height).toBe(48);
    expect(fallback.exact).toBeFalse();
  });

  it("preserves a fresh DOM measurement across routine model-driven compute seeds", () => {
    const facts = new Map<string, ModelFact>([
      ["paragraph", fact("paragraph", {
        deltas: [{
          insert: {image: "image.png"},
          attributes: {width: 320, height: 240},
        }],
      })],
    ]);
    const {doc} = createHarness(["paragraph"], facts, {paragraph: 48});
    const coordinator = new PaginationLayoutCoordinator(doc);
    coordinator.compute(config(), geometry());
    expect(coordinator.applyMeasured(
      [measurement("paragraph", 260)],
      coordinator.geometryRevision,
      0,
    ).accepted).toBeTrue();
    const measuredRevision = coordinator.geometryRevision;

    const state = coordinator.compute(config(), geometry());

    expect(state.entries[0]).toEqual(jasmine.objectContaining({
      naturalHeight: 260,
      effectiveHeight: 260,
      source: "measured",
    }));
    expect(state.exact).toBeTrue();
    expect(coordinator.geometryRevision).toBe(measuredRevision);
  });

  it("retains measured ordinary text height across fallback-only dirtiness", () => {
    const facts = new Map<string, ModelFact>([
      ["paragraph", fact("paragraph", {deltas: [{insert: "body"}]})],
    ]);
    const {doc} = createHarness(["paragraph"], facts, {paragraph: 48});
    const coordinator = new PaginationLayoutCoordinator(doc);
    coordinator.syncRootOrder();
    coordinator.applyMeasured(
      [measurement("paragraph", 120)],
      coordinator.geometryRevision,
      0,
    );

    facts.set("paragraph", fact("paragraph", {
      deltas: [{insert: "body changed"}],
    }));
    coordinator.applyContentChange(contentChange(["paragraph"], ["text"]));
    const state = coordinator.compute(config(), geometry());

    expect(state.entries[0]).toEqual(jasmine.objectContaining({
      naturalHeight: 120,
      source: "estimated",
    }));
    expect(state.exact).toBeFalse();
  });

  it("replaces stale measured table flow after an offscreen structure change", () => {
    const facts = new Map<string, ModelFact>([
      ["table", fact("table", {
        flavour: "table",
        nodeType: BlockNodeType.block,
        children: ["row-1", "row-2"],
      })],
      ["row-1", fact("row-1", {
        flavour: "table-row",
        nodeType: BlockNodeType.block,
        path: ["root", "table", "row-1"],
      })],
      ["row-2", fact("row-2", {
        flavour: "table-row",
        nodeType: BlockNodeType.block,
        path: ["root", "table", "row-2"],
      })],
      ["row-3", fact("row-3", {
        flavour: "table-row",
        nodeType: BlockNodeType.block,
        path: ["root", "table", "row-3"],
      })],
    ]);
    const {doc} = createHarness(["table"], facts);
    const coordinator = new PaginationLayoutCoordinator(doc);
    coordinator.syncRootOrder();
    const measured = measurement("table", 300, {
      flavour: "table",
      nodeType: BlockNodeType.block,
      splitOffsets: [80],
      preferredSplitOffsets: [80],
      tableRows: [{
        id: "row-1",
        top: 0,
        bottom: 80,
        coveredFromAbove: false,
      }],
    });
    setTableCellFlowPlan(measured, planTableCellFlow([{
      kind: "atomic",
      rowId: "row-1",
      height: 80,
    }], 100));
    coordinator.applyMeasured(
      [measured],
      coordinator.geometryRevision,
      0,
    );
    expect(coordinator.compute(config(), geometry()).items[0].height).toBe(80);

    facts.set("table", fact("table", {
      flavour: "table",
      nodeType: BlockNodeType.block,
      children: ["row-1", "row-2", "row-3"],
    }));
    coordinator.applyStructureChange(structureChange(["table"], ["table"]));
    const state = coordinator.compute(config(), geometry());

    expect(state.entries[0]).toEqual(jasmine.objectContaining({
      naturalHeight: 180,
      effectiveHeight: 180,
      source: "estimated",
    }));
    expect(state.entries[0].splitOffsets).toBeUndefined();
    expect(state.entries[0].preferredSplitOffsets).toBeUndefined();
    expect(state.entries[0].tableRows).toBeUndefined();
    expect(state.entries[0].tableCellFlowPlan).toBeUndefined();
    expect(state.items[0].height).toBe(180);
    expect(getTableCellFlowPlan(state.items[0])).toBeUndefined();
  });

  it("seeds estimates from model facts and marks new roots inexact", () => {
    const facts = new Map<string, ModelFact>([
      [
        "divider",
        fact("divider", {
          flavour: "page-divider",
          nodeType: BlockNodeType.void,
        }),
      ],
      [
        "known",
        fact("known", { flavour: "callout", nodeType: BlockNodeType.block }),
      ],
      ["fallback", fact("fallback")],
    ]);
    const { doc } = createHarness(["divider", "known", "fallback"], facts, {
      callout: 72,
    });
    const coordinator = new PaginationLayoutCoordinator(doc);

    const state = coordinator.compute(config(), geometry());

    expect(state.exact).toBeFalse();
    expect(
      state.entries.map((entry) => [entry.blockId, entry.naturalHeight]),
    ).toEqual([
      ["divider", 0],
      ["known", 72],
      ["fallback", 48],
    ]);
    expect(state.placements[0]).toEqual(
      jasmine.objectContaining({
        blockId: "divider",
        firstPageIndex: -1,
        projectedHostHeight: 0,
      }),
    );
  });

  it("refreshes model order during compute even without an explicit sync call", () => {
    const facts = new Map<string, ModelFact>([
      ["a", fact("a")],
      ["b", fact("b")],
    ]);
    const { doc, model } = createHarness(["a", "b"], facts);
    const coordinator = new PaginationLayoutCoordinator(doc);
    coordinator.compute(config(), geometry());

    model.rootIds = ["b", "a"];
    const state = coordinator.compute(config(), geometry());

    expect(state.rootIds).toEqual(["b", "a"]);
    expect(state.items.map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("consumes one prepared root snapshot before refreshing model facts again", () => {
    const facts = new Map<string, ModelFact>([
      ["a", fact("a")],
      ["b", fact("b")],
    ]);
    const { doc, model } = createHarness(["a", "b"], facts);
    const coordinator = new PaginationLayoutCoordinator(doc);

    coordinator.syncRootOrder();
    const prepared = coordinator.compute(config(), geometry());
    expect(prepared.rootIds).toEqual(["a", "b"]);
    expect(model.reads).toEqual({
      children: 1,
      flavour: 2,
      nodeType: 2,
      props: 2,
    });

    model.rootIds = ["b", "a"];
    const refreshed = coordinator.compute(config(), geometry());
    expect(refreshed.rootIds).toEqual(["b", "a"]);
    expect(model.reads).toEqual({
      children: 2,
      flavour: 4,
      nodeType: 4,
      props: 4,
    });
  });

  it("returns isolated layout data that cannot pollute later computations", () => {
    const facts = new Map<string, ModelFact>([["a", fact("a")]]);
    const { doc } = createHarness(["a"], facts);
    const coordinator = new PaginationLayoutCoordinator(doc);
    coordinator.syncRootOrder();
    coordinator.applyMeasured(
      [measurement("a", 40, {
        splitOffsets: [20],
        inlineBreakPlan: {
          points: [{layoutOffset: 20, textOffset: 8}],
        },
      })],
      coordinator.geometryRevision,
      0,
    );
    const first = coordinator.compute(config(), geometry());

    (first.rootIds as string[])[0] = "mutated";
    (first.entries[0] as { naturalHeight: number }).naturalHeight = 999;
    first.items[0]!.height = 999;
    first.items[0]!.splitOffsets![0] = 999;
    (first.entries[0].inlineBreakPlan!.points as unknown as Array<{textOffset: number}>)[0]!
      .textOffset = 999;
    first.result.pages[0]!.slots[0]!.id = "mutated";
    first.result.byBlock.clear();
    (first.placements[0] as { beforeGap: number }).beforeGap = 999;

    const second = coordinator.compute(config(), geometry());
    expect(second.projection).toBe(first.projection);
    expect(second.rootIds).toEqual(["a"]);
    expect(second.entries[0].naturalHeight).toBe(40);
    expect(second.items[0].height).toBe(40);
    expect(second.items[0].splitOffsets).toEqual([20]);
    expect(second.entries[0].inlineBreakPlan).toEqual({
      points: [{layoutOffset: 20, textOffset: 8}],
    });
    expect(second.result.pages[0].slots[0].id).toBe("a");
    expect(second.result.byBlock.has("a")).toBeTrue();
    expect(second.placements[0].beforeGap).not.toBe(999);
  });

  it("rejects stale content and measure-context tickets without restoring exactness", () => {
    const facts = new Map<string, ModelFact>([["a", fact("a")]]);
    const { doc } = createHarness(["a"], facts);
    const coordinator = new PaginationLayoutCoordinator(doc);
    coordinator.syncRootOrder();

    const contentTicket = coordinator.geometryRevision;
    coordinator.applyContentChange(contentChange(["a"]));
    expect(
      coordinator.applyMeasured([measurement("a", 40)], contentTicket, 0),
    ).toEqual({accepted: false, changed: false, changedRootIds: []});
    expect(coordinator.compute(config(), geometry()).exact).toBeFalse();

    expect(
      coordinator.applyMeasured(
        [measurement("a", 40)],
        coordinator.geometryRevision,
        0,
      ),
    ).toEqual({accepted: true, changed: true, changedRootIds: ['a']});
    expect(coordinator.compute(config(), geometry()).exact).toBeTrue();

    const contextTicket = coordinator.geometryRevision;
    coordinator.updateMeasureContext({
      contentWidth: 640,
      contentHeight: 100,
      widowOrphanLines: 2,
      theme: "dark",
      fontEpoch: 1,
      rendererRevision: 0,
    });
    expect(
      coordinator.applyMeasured([measurement("a", 50)], contextTicket, 0),
    ).toEqual({accepted: false, changed: false, changedRootIds: []});
    expect(coordinator.compute(config(), geometry()).exact).toBeFalse();

    expect(
      coordinator.applyMeasured(
        [measurement("a", 50)],
        coordinator.geometryRevision,
        0,
      ),
    ).toEqual({accepted: true, changed: true, changedRootIds: ['a']});
    const refreshed = coordinator.compute(config(), geometry());
    expect(refreshed.exact).toBeTrue();
    expect(refreshed.entries[0].naturalHeight).toBe(50);
  });

  it("accepts a current idempotent measurement ticket without changing geometry revision", () => {
    const facts = new Map<string, ModelFact>([["a", fact("a")]]);
    const { doc } = createHarness(["a"], facts);
    const coordinator = new PaginationLayoutCoordinator(doc);
    coordinator.syncRootOrder();
    coordinator.setRequiredMeasurementEpoch(1);

    expect(
      coordinator.applyMeasured(
        [measurement("a", 40)],
        coordinator.geometryRevision,
        1,
      ),
    ).toEqual({accepted: true, changed: true, changedRootIds: ['a']});
    const measuredRevision = coordinator.geometryRevision;

    coordinator.setRequiredMeasurementEpoch(2);
    expect(coordinator.geometryRevision).toBe(measuredRevision);
    expect(coordinator.compute(config(), geometry()).exact).toBeFalse();
    expect(
      coordinator.applyMeasured(
        [measurement("a", 40)],
        coordinator.geometryRevision,
        1,
      ),
    ).toEqual({accepted: false, changed: false, changedRootIds: []});

    expect(
      coordinator.applyMeasured(
        [measurement("a", 40)],
        coordinator.geometryRevision,
        2,
      ),
    ).toEqual({accepted: true, changed: false, changedRootIds: []});
    expect(coordinator.geometryRevision).toBe(measuredRevision);
    expect(coordinator.compute(config(), geometry()).exact).toBeTrue();
  });

  it("disposes the owned projection and index idempotently", () => {
    const facts = new Map<string, ModelFact>([["a", fact("a")]]);
    const { doc } = createHarness(["a"], facts);
    const coordinator = new PaginationLayoutCoordinator(doc);
    const state = coordinator.compute(config(), geometry());
    let completed = 0;
    state.projection.change$.subscribe({ complete: () => completed++ });

    coordinator.dispose();
    coordinator.dispose();
    coordinator.syncRootOrder();
    coordinator.applyContentChange(contentChange(["a"]));

    expect(completed).toBe(1);
    expect(() => coordinator.compute(config(), geometry())).toThrowError(
      /has been disposed/,
    );
  });
});
