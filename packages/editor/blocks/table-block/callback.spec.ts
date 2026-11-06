import {Subject} from "rxjs";
import {addTableCol, addTableRow} from "./callback";

describe("table model-first structure commands", () => {
  it("inserts a row from the cached model grid and expands a crossing rowspan once", () => {
    const harness = createHarness(3, 3);
    harness.facts["cell-0-0"].props = {rowspan: 2, colspan: 2};
    harness.facts["cell-0-1"].props = {display: "none"};
    harness.facts["cell-1-0"].props = {display: "none"};
    harness.facts["cell-1-1"].props = {display: "none"};

    addTableRow.call(harness.table as any, 1);

    expect(harness.table.getChildrenBlocks).not.toHaveBeenCalled();
    expect(harness.doc.crud.transact).toHaveBeenCalledTimes(1);
    expect(harness.doc.crud.updateBlockProps).toHaveBeenCalledOnceWith(
      "cell-0-0",
      {rowspan: 3},
    );
    const [parentId, index, snapshots] =
      harness.doc.crud.insertBlockSnapshots.calls.mostRecent().args;
    expect(parentId).toBe("table");
    expect(index).toBe(1);
    expect(snapshots[0].children.map((cell: any) => cell.props.display)).toEqual([
      "none",
      "none",
      undefined,
    ]);
  });

  it("inserts a column by stable row IDs and expands a crossing colspan once", () => {
    const harness = createHarness(200, 3);
    harness.facts["cell-0-0"].props = {rowspan: 200, colspan: 2};
    harness.facts["cell-0-1"].props = {display: "none"};
    for (let row = 1; row < 200; row++) {
      harness.facts[`cell-${row}-0`].props = {display: "none"};
      harness.facts[`cell-${row}-1`].props = {display: "none"};
    }

    addTableCol.call(harness.table as any, 1);

    expect(harness.table.getChildrenBlocks).not.toHaveBeenCalled();
    expect(harness.doc.crud.transact).toHaveBeenCalledTimes(1);
    expect(harness.doc.crud.updateBlockProps.calls.allArgs().filter(
      ([id, props]: [string, Record<string, unknown>]) =>
        id === "cell-0-0" && props["colspan"] === 3,
    ).length).toBe(1);
    const rowInsertions = harness.doc.crud.insertBlockSnapshots.calls.allArgs();
    expect(rowInsertions.length).toBe(200);
    expect(rowInsertions.every((args: any[], row: number) =>
      args[0] === `row-${row}`
      && args[1] === 1
      && args[2][0].props.display === "none",
    )).toBeTrue();
    expect(harness.doc.crud.updateBlockProps).toHaveBeenCalledWith("table", {
      colWidths: [100, 100, 100, 100],
    });
  });

  it("keeps model-first insertion when an unrelated legacy hidden cell is orphaned", () => {
    const harness = createHarness(4, 3);
    harness.facts["cell-3-2"].props = {display: "none"};

    addTableCol.call(harness.table as any, 1);

    expect(harness.table.getChildrenBlocks).not.toHaveBeenCalled();
    expect(harness.doc.crud.insertBlockSnapshots).toHaveBeenCalledTimes(4);
  });
});

interface ModelFact {
  flavour: string;
  props: Record<string, any>;
  children: string[];
  parentId: string | null;
}

function createHarness(rowCount: number, columnCount: number) {
  const facts: Record<string, ModelFact> = {};
  const rowIds = Array.from({length: rowCount}, (_, row) => `row-${row}`);
  facts["table"] = {
    flavour: "table",
    props: {colWidths: Array.from({length: columnCount}, () => 100)},
    children: rowIds,
    parentId: null,
  };
  rowIds.forEach((rowId, row) => {
    const cellIds = Array.from(
      {length: columnCount},
      (_, column) => `cell-${row}-${column}`,
    );
    facts[rowId] = {
      flavour: "table-row",
      props: {},
      children: cellIds,
      parentId: "table",
    };
    cellIds.forEach(cellId => {
      facts[cellId] = {
        flavour: "table-cell",
        props: {},
        children: [],
        parentId: rowId,
      };
    });
  });

  const contentChange$ = new Subject<any>();
  const structureChange$ = new Subject<any>();
  const onDestroy$ = new Subject<void>();
  let snapshotIndex = 0;
  const createSnapshot = jasmine.createSpy("createSnapshot")
    .and.callFake((flavour: string, args: any[]) => {
      const snapshot: any = {
        id: `snapshot-${snapshotIndex++}`,
        flavour,
        props: {},
        meta: {},
        children: [],
      };
      if (flavour === "table-row") {
        snapshot.children = Array.from(
          {length: Number(args?.[0] ?? 0)},
          () => ({
            id: `snapshot-${snapshotIndex++}`,
            flavour: "table-cell",
            props: {},
            meta: {},
            children: [],
          }),
        );
      }
      return snapshot;
    });
  const doc: any = {
    model: {
      contentChange$,
      structureChange$,
      getFlavour: (id: string) => facts[id]?.flavour,
      getProps: (id: string) => facts[id]?.props,
      getChildrenIds: (id: string) => [...(facts[id]?.children ?? [])],
      getParentId: (id: string) => facts[id]?.parentId ?? null,
    },
    onDestroy$,
    crud: {
      transact: jasmine.createSpy("transact")
        .and.callFake((callback: () => void) => callback()),
      updateBlockProps: jasmine.createSpy("updateBlockProps"),
      insertBlockSnapshots: jasmine.createSpy("insertBlockSnapshots")
        .and.returnValue([]),
    },
    schemas: {createSnapshot},
  };
  const table = {
    id: "table",
    doc,
    getChildrenBlocks: jasmine.createSpy("getChildrenBlocks"),
  };
  return {doc, table, facts, onDestroy$};
}
