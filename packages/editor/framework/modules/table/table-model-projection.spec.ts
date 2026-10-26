import {Subject} from "rxjs";
import {getTableModelProjection} from "./table-model-projection";

describe("getTableModelProjection", () => {
  it("keeps the cached grid for text and row-height changes", () => {
    const harness = createHarness();
    const first = getTableModelProjection(harness.doc as any, "table");

    harness.contentChange$.next(contentChange(["cell-0-0"], ["text"]));
    expect(getTableModelProjection(harness.doc as any, "table")).toBe(first);

    harness.facts["row-0"].props = {height: 120};
    harness.contentChange$.next(contentChange(["row-0"], ["props"]));
    expect(getTableModelProjection(harness.doc as any, "table")).toBe(first);

    harness.destroy$.next();
  });

  it("rebuilds after table geometry or row structure changes", () => {
    const harness = createHarness();
    const first = getTableModelProjection(harness.doc as any, "table");

    harness.facts["cell-0-0"].props = {colspan: 2};
    harness.facts["cell-0-1"].props = {display: "none"};
    harness.contentChange$.next(contentChange(["cell-0-0", "cell-0-1"], ["props"]));
    const afterCellProps = getTableModelProjection(harness.doc as any, "table");
    expect(afterCellProps).not.toBe(first);
    expect(afterCellProps.grid.getMasterCellId("cell-0-1")).toBe("cell-0-0");

    harness.facts["row-0"].children.reverse();
    harness.structureChange$.next(structureChange(["row-0"]));
    const afterRowStructure = getTableModelProjection(harness.doc as any, "table");
    expect(afterRowStructure).not.toBe(afterCellProps);
    expect(afterRowStructure.grid.getPhysicalCellIdAt(0, 0)).toBe("cell-0-1");

    harness.destroy$.next();
  });

  it("evicts a removed table and releases the document store on destroy", () => {
    const harness = createHarness();
    const first = getTableModelProjection(harness.doc as any, "table");

    delete harness.facts["table"];
    harness.structureChange$.next(structureChange([], ["table"]));
    const removed = getTableModelProjection(harness.doc as any, "table");
    expect(removed).not.toBe(first);
    expect(removed.grid.isValid).toBeFalse();

    harness.destroy$.next();
    const afterDestroy = getTableModelProjection(harness.doc as any, "table");
    expect(afterDestroy).not.toBe(removed);
  });
});

interface Fact {
  flavour: string;
  props: Record<string, unknown>;
  children: string[];
  parentId: string | null;
}

function createHarness() {
  const contentChange$ = new Subject<any>();
  const structureChange$ = new Subject<any>();
  const destroy$ = new Subject<void>();
  const facts: Record<string, Fact> = {
    table: {
      flavour: "table",
      props: {colWidths: [100, 100]},
      children: ["row-0"],
      parentId: null,
    },
    "row-0": {
      flavour: "table-row",
      props: {height: 60},
      children: ["cell-0-0", "cell-0-1"],
      parentId: "table",
    },
    "cell-0-0": {
      flavour: "table-cell",
      props: {},
      children: [],
      parentId: "row-0",
    },
    "cell-0-1": {
      flavour: "table-cell",
      props: {},
      children: [],
      parentId: "row-0",
    },
  };
  const doc = {
    model: {
      contentChange$,
      structureChange$,
      getFlavour: (id: string) => facts[id]?.flavour,
      getProps: (id: string) => facts[id]?.props,
      getChildrenIds: (id: string) => [...(facts[id]?.children ?? [])],
      getParentId: (id: string) => facts[id]?.parentId ?? null,
    },
    onDestroy$: destroy$,
  };
  return {doc, facts, contentChange$, structureChange$, destroy$};
}

function contentChange(blockIds: string[], kinds: Array<"text" | "props">) {
  return {
    blockIds,
    kinds,
    origin: null,
    local: true,
    isUndoRedo: false,
  };
}

function structureChange(
  affectedParentIds: string[],
  reachableRemovedIds: string[] = [],
) {
  return {
    revision: 1,
    reachableAddedIds: [],
    reachableRemovedIds,
    affectedParentIds,
  };
}
