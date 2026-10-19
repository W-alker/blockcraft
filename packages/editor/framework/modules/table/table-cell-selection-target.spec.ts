import {resolveTableCellSelectionTarget} from "./table-cell-selection-target";

describe("resolveTableCellSelectionTarget", () => {
  it("resolves a model rectangle without mounted cell components", () => {
    const doc = createDoc(2, 3);

    const target = resolveTableCellSelectionTarget(doc as any, {
      tableId: "table",
      anchorCellId: "cell-0-1",
      headCellId: "cell-1-2",
    });

    expect(target?.rectangle).toEqual({start: [0, 1], end: [1, 2]});
    expect(target?.physicalCellIds).toEqual([
      ["cell-0-1", "cell-0-2"],
      ["cell-1-1", "cell-1-2"],
    ]);
    expect(target?.visibleCellIds).toEqual([
      "cell-0-1",
      "cell-0-2",
      "cell-1-1",
      "cell-1-2",
    ]);
  });

  it("normalizes hidden endpoints to the merged master and de-duplicates writes", () => {
    const doc = createDoc(2, 2);
    doc.facts["cell-0-0"].props = {rowspan: 2, colspan: 2};
    doc.facts["cell-0-1"].props = {display: "none"};
    doc.facts["cell-1-0"].props = {display: "none"};
    doc.facts["cell-1-1"].props = {display: "none"};

    const target = resolveTableCellSelectionTarget(doc as any, {
      tableId: "table",
      anchorCellId: "cell-1-1",
      headCellId: "cell-0-0",
    });

    expect(target?.anchorCellId).toBe("cell-0-0");
    expect(target?.headCellId).toBe("cell-0-0");
    expect(target?.rectangle).toEqual({start: [0, 0], end: [1, 1]});
    expect(target?.physicalCellIds).toEqual([
      ["cell-0-0", "cell-0-1"],
      ["cell-1-0", "cell-1-1"],
    ]);
    expect(target?.visibleCellIds).toEqual(["cell-0-0"]);
  });

  it("fails closed for stale endpoints and malformed tables", () => {
    const stale = createDoc(1, 2);
    expect(resolveTableCellSelectionTarget(stale as any, {
      tableId: "table",
      anchorCellId: "missing",
      headCellId: "cell-0-1",
    })).toBeNull();

    const malformed = createDoc(2, 2);
    malformed.facts["row-1"].children.pop();
    expect(resolveTableCellSelectionTarget(malformed as any, {
      tableId: "table",
      anchorCellId: "cell-0-0",
      headCellId: "cell-1-0",
    })).toBeNull();
  });
});

function createDoc(rows: number, columns: number) {
  const facts: Record<string, {
    flavour: string;
    props: Record<string, unknown>;
    children: string[];
  }> = {
    table: {
      flavour: "table",
      props: {colWidths: Array.from({length: columns}, () => 100)},
      children: Array.from({length: rows}, (_, row) => `row-${row}`),
    },
  };
  for (let row = 0; row < rows; row++) {
    const rowId = `row-${row}`;
    const cellIds = Array.from({length: columns}, (_, column) => `cell-${row}-${column}`);
    facts[rowId] = {flavour: "table-row", props: {}, children: cellIds};
    for (const cellId of cellIds) {
      facts[cellId] = {flavour: "table-cell", props: {}, children: []};
    }
  }
  return {
    facts,
    model: {
      getFlavour: (id: string) => facts[id]?.flavour,
      getProps: (id: string) => facts[id]?.props,
      getChildrenIds: (id: string) => [...(facts[id]?.children ?? [])],
    },
  };
}
