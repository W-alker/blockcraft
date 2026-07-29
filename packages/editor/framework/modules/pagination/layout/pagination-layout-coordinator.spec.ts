import { BlockNodeType } from "../../../block-std/types/block.type";
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

interface ModelFact {
  readonly flavour: string;
  readonly nodeType: BlockNodeType;
  readonly props?: Record<string, unknown>;
  readonly path: readonly string[];
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
    return blockId === "root" ? [...this.rootIds] : [];
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
}

function fact(blockId: string, overrides: Partial<ModelFact> = {}): ModelFact {
  return {
    flavour: "paragraph",
    nodeType: BlockNodeType.editable,
    props: {},
    path: ["root", blockId],
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

function contentChange(blockIds: readonly string[]): IBlockModelContentChange {
  return {
    blockIds,
    kinds: ["text", "props"],
    origin: null,
    local: true,
    isUndoRedo: false,
  };
}

function structureChange(
  affectedRootIds: readonly string[],
): IBlockModelStructureChange {
  return {
    revision: 1,
    reachableAddedIds: [],
    reachableRemovedIds: [],
    affectedParentIds: [],
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
    const { doc } = createHarness(["callout"], facts);
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
    );

    coordinator.applyContentChange(contentChange(["paragraph", "paragraph"]));
    const state = coordinator.compute(config(), geometry());

    expect(state.entries).toEqual([
      jasmine.objectContaining({
        blockId: "callout",
        contentRevision: 1,
        source: "estimated",
        naturalHeight: 80,
      }),
    ]);
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
    );

    model.rootIds = ["right", "left"];
    coordinator.applyStructureChange(structureChange([]));
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
      structureChange(["left", "right", "left"]),
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

  it("invalidates natural geometry for width, theme and font but not page height or page gap", () => {
    const facts = new Map<string, ModelFact>([["a", fact("a")]]);
    const { doc } = createHarness(["a"], facts);
    const coordinator = new PaginationLayoutCoordinator(doc);
    coordinator.updateMeasureContext({
      contentWidth: 720,
      theme: "light",
      fontEpoch: 0,
      rendererRevision: 0,
    });
    coordinator.syncRootOrder();
    coordinator.applyMeasured(
      [measurement("a", 40)],
      coordinator.geometryRevision,
    );

    const initial = coordinator.compute(config(), geometry());
    const changedPages = coordinator.compute(
      config({ pageGap: 80, pageSize: { width: 800, height: 300 } }),
      geometry({
        sheetHeightPx: 300,
        pageGap: 80,
        geometry: { contentHeight: 280 },
      }),
    );
    expect(changedPages.geometryRevision).toBe(initial.geometryRevision);
    expect(changedPages.exact).toBeTrue();

    let previousRevision = changedPages.geometryRevision;
    for (const context of [
      { contentWidth: 640, theme: "light", fontEpoch: 0, rendererRevision: 0 },
      { contentWidth: 640, theme: "dark", fontEpoch: 0, rendererRevision: 0 },
      { contentWidth: 640, theme: "dark", fontEpoch: 1, rendererRevision: 0 },
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
      [measurement("a", 40, { splitOffsets: [20] })],
      coordinator.geometryRevision,
    );
    const first = coordinator.compute(config(), geometry());

    (first.rootIds as string[])[0] = "mutated";
    (first.entries[0] as { naturalHeight: number }).naturalHeight = 999;
    first.items[0]!.height = 999;
    first.items[0]!.splitOffsets![0] = 999;
    first.result.pages[0]!.slots[0]!.id = "mutated";
    first.result.byBlock.clear();
    (first.placements[0] as { beforeGap: number }).beforeGap = 999;

    const second = coordinator.compute(config(), geometry());
    expect(second.projection).toBe(first.projection);
    expect(second.rootIds).toEqual(["a"]);
    expect(second.entries[0].naturalHeight).toBe(40);
    expect(second.items[0].height).toBe(40);
    expect(second.items[0].splitOffsets).toEqual([20]);
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
      coordinator.applyMeasured([measurement("a", 40)], contentTicket),
    ).toBeFalse();
    expect(coordinator.compute(config(), geometry()).exact).toBeFalse();

    expect(
      coordinator.applyMeasured(
        [measurement("a", 40)],
        coordinator.geometryRevision,
      ),
    ).toBeTrue();
    expect(coordinator.compute(config(), geometry()).exact).toBeTrue();

    const contextTicket = coordinator.geometryRevision;
    coordinator.updateMeasureContext({
      contentWidth: 640,
      theme: "dark",
      fontEpoch: 1,
      rendererRevision: 0,
    });
    expect(
      coordinator.applyMeasured([measurement("a", 50)], contextTicket),
    ).toBeFalse();
    expect(coordinator.compute(config(), geometry()).exact).toBeFalse();

    expect(
      coordinator.applyMeasured(
        [measurement("a", 50)],
        coordinator.geometryRevision,
      ),
    ).toBeTrue();
    const refreshed = coordinator.compute(config(), geometry());
    expect(refreshed.exact).toBeTrue();
    expect(refreshed.entries[0].naturalHeight).toBe(50);
  });

  it("accepts a current idempotent measurement ticket without changing geometry revision", () => {
    const facts = new Map<string, ModelFact>([["a", fact("a")]]);
    const { doc } = createHarness(["a"], facts);
    const coordinator = new PaginationLayoutCoordinator(doc);
    coordinator.syncRootOrder();

    expect(
      coordinator.applyMeasured(
        [measurement("a", 40)],
        coordinator.geometryRevision,
      ),
    ).toBeTrue();
    const measuredRevision = coordinator.geometryRevision;

    expect(
      coordinator.applyMeasured(
        [measurement("a", 40)],
        coordinator.geometryRevision,
      ),
    ).toBeTrue();
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
