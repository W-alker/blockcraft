import {TableModelGrid} from "./table-model-grid";

describe("TableModelGrid", () => {
  it("projects regular physical rows and cells by stable ID", () => {
    const doc = createDoc(tableFacts(2, 3));

    const grid = TableModelGrid.fromDoc(doc as any, "table");

    expect(grid.isValid).toBeTrue();
    expect(grid.rowIds).toEqual(["row-0", "row-1"]);
    expect(grid.rowCount).toBe(2);
    expect(grid.columnCount).toBe(3);
    expect(grid.getPhysicalCellIdAt(1, 2)).toBe("cell-1-2");
    expect(grid.getMasterCellIdAt(1, 2)).toBe("cell-1-2");
    expect(grid.getCellCoordinate("cell-1-2")).toEqual([1, 2]);
    expect(grid.getSpan("cell-1-2")).toEqual({
      start: [1, 2],
      end: [1, 2],
    });
  });

  it("maps hidden coverage cells to their rowspan/colspan master", () => {
    const facts = tableFacts(3, 3);
    facts["cell-0-0"].props = {rowspan: 2, colspan: 2};
    facts["cell-0-1"].props = {display: "none"};
    facts["cell-1-0"].props = {display: "none"};
    facts["cell-1-1"].props = {display: "none"};

    const grid = TableModelGrid.fromDoc(createDoc(facts) as any, "table");

    expect(grid.isValid).toBeTrue();
    expect(grid.getMasterCellIdAt(1, 1)).toBe("cell-0-0");
    expect(grid.getMasterCellId("cell-1-1")).toBe("cell-0-0");
    expect(grid.getSpan("cell-1-1")).toEqual({
      start: [0, 0],
      end: [1, 1],
    });
    expect(grid.getVisibleSourceCellIdAt(1, 1)).toBeNull();
  });

  it("expands a rectangle through overlapping merge closures", () => {
    const facts = tableFacts(4, 3);
    facts["cell-0-0"].props = {rowspan: 2};
    facts["cell-1-0"].props = {display: "none"};
    facts["cell-1-1"].props = {rowspan: 3, colspan: 2};
    for (const id of ["cell-1-2", "cell-2-1", "cell-2-2", "cell-3-1", "cell-3-2"]) {
      facts[id].props = {display: "none"};
    }

    const grid = TableModelGrid.fromDoc(createDoc(facts) as any, "table");

    expect(grid.isValid).toBeTrue();
    expect(grid.adjustSelection([0, 0], [1, 1])).toEqual({
      start: [0, 0],
      end: [3, 2],
    });
    expect(grid.getMasterCellIds({start: [0, 0], end: [3, 2]})).toEqual([
      "cell-0-0",
      "cell-0-1",
      "cell-0-2",
      "cell-1-1",
      "cell-2-0",
      "cell-3-0",
    ]);
  });

  it("keeps physical cell order for snapshot and TSV consumers", () => {
    const facts = tableFacts(2, 3);
    facts["cell-0-0"].props = {colspan: 2};
    facts["cell-0-1"].props = {display: "none"};
    const grid = TableModelGrid.fromDoc(createDoc(facts) as any, "table");

    expect(grid.getPhysicalCellIds({start: [0, 0], end: [1, 1]})).toEqual([
      ["cell-0-0", "cell-0-1"],
      ["cell-1-0", "cell-1-1"],
    ]);
  });

  it("reports malformed structure and merge facts instead of guessing", () => {
    const facts = tableFacts(2, 2);
    facts["table"].children = ["row-0", "paragraph", "row-1"];
    facts["table"].props = {colWidths: [100]};
    facts["row-0"].children = ["cell-0-0"];
    facts["cell-0-0"].props = {rowspan: 0, colspan: Number.NaN};
    facts["cell-1-0"].props = {display: "none"};
    facts["paragraph"] = fact("paragraph");

    const grid = TableModelGrid.fromDoc(createDoc(facts) as any, "table");

    expect(grid.isValid).toBeFalse();
    expect(grid.diagnostics.map(item => item.code)).toEqual(jasmine.arrayContaining([
      "unexpected-table-child",
      "column-width-count-mismatch",
      "ragged-row",
      "missing-physical-cell",
      "invalid-rowspan",
      "invalid-colspan",
      "orphan-hidden-cell",
    ]));
  });

  it("scans a large model without reading cell descendants or text", () => {
    const facts = tableFacts(3000, 4);
    const doc = createDoc(facts);
    const childrenReads = spyOn(doc.model, "getChildrenIds").and.callThrough();
    const propsReads = spyOn(doc.model, "getProps").and.callThrough();
    const textReads = jasmine.createSpy("getTextDeltas");
    (doc.model as any).getTextDeltas = textReads;

    const grid = TableModelGrid.fromDoc(doc as any, "table");

    expect(grid.isValid).toBeTrue();
    expect(grid.rowCount).toBe(3000);
    expect(childrenReads.calls.count()).toBe(3001);
    expect(childrenReads.calls.allArgs().filter(([id]) => `${id}`.startsWith("cell-")).length).toBe(0);
    expect(propsReads.calls.count()).toBe(12001);
    expect(textReads).not.toHaveBeenCalled();
  });
});

interface ModelFact {
  flavour: string;
  props: Record<string, unknown>;
  children: string[];
}

function fact(
  flavour: string,
  props: Record<string, unknown> = {},
  children: string[] = [],
): ModelFact {
  return {flavour, props, children};
}

function tableFacts(rows: number, columns: number): Record<string, ModelFact> {
  const facts: Record<string, ModelFact> = {
    table: fact(
      "table",
      {colWidths: Array.from({length: columns}, () => 100)},
      Array.from({length: rows}, (_, row) => `row-${row}`),
    ),
  };
  for (let row = 0; row < rows; row++) {
    const cellIds = Array.from({length: columns}, (_, column) => `cell-${row}-${column}`);
    facts[`row-${row}`] = fact("table-row", {height: 60}, cellIds);
    for (const cellId of cellIds) facts[cellId] = fact("table-cell");
  }
  return facts;
}

function createDoc(facts: Record<string, ModelFact>) {
  return {
    model: {
      getFlavour: (id: string) => facts[id]?.flavour,
      getProps: (id: string) => facts[id]?.props,
      getChildrenIds: (id: string) => [...(facts[id]?.children ?? [])],
    },
  };
}
