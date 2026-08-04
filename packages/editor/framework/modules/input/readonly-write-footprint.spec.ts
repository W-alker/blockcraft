import {SelectionEditPlan, SelectionEditReader} from "./selection-edit-plan";
import {buildReadonlyWriteFootprint} from "./readonly-write-footprint";

function createReader(): SelectionEditReader {
  const children: Record<string, readonly string[]> = {
    root: ["start", "middle", "end", "host", "table"],
    host: ["b1", "b2", "b3"],
    table: ["row1", "row2"],
    row1: ["c11", "c12"],
    row2: ["c21", "c22"],
    c11: ["p11"],
    c12: ["p12"],
    c21: ["p21"],
    c22: ["p22"],
  };
  const parents = new Map<string, string | null>([["root", null]]);
  Object.entries(children).forEach(([parent, ids]) => {
    if (!parents.has(parent)) parents.set(parent, "root");
    ids.forEach(id => parents.set(id, parent));
  });
  return {
    getParentId: id => parents.get(id),
    getChildrenIds: id => children[id] ?? [],
    getTextLength: () => 10,
  };
}

describe("readonly write footprint", () => {
  const reader = createReader();

  it("maps a text cursor to one text write", () => {
    expect(buildReadonlyWriteFootprint({
      kind: "text-cursor",
      blockId: "start",
      offset: 2,
    }, reader)).toEqual({
      textBlockIds: ["start"],
      removableRootIds: [],
      insertParentIds: [],
    });
  });

  it("includes covered blocks and the surviving merge tail for a range", () => {
    const plan: SelectionEditPlan = {
      kind: "range",
      start: {kind: "text", blockId: "start", from: 2, to: 10},
      end: {kind: "text", blockId: "end", from: 0, to: 3},
      insertAt: {blockId: "start", offset: 2},
      stabilizeAt: {blockId: "start", offset: 2},
      tailMode: "merge",
    };

    expect(buildReadonlyWriteFootprint(plan, reader)).toEqual({
      textBlockIds: ["start", "end"],
      removableRootIds: ["middle", "end"],
      insertParentIds: [],
    });
  });

  it("covers an inclusive whole-block range", () => {
    expect(buildReadonlyWriteFootprint({
      kind: "block-range",
      startBlockId: "start",
      endBlockId: "end",
    }, reader).removableRootIds).toEqual(["start", "middle", "end"]);
  });

  it("uses the parent container and adjacent block for a gap plan", () => {
    expect(buildReadonlyWriteFootprint({
      kind: "gap",
      blockId: "middle",
      side: "after",
    }, reader)).toEqual({
      textBlockIds: [],
      removableRootIds: ["middle"],
      insertParentIds: ["root"],
    });
  });

  it("maps a boundary range to the selected children and host", () => {
    expect(buildReadonlyWriteFootprint({
      kind: "boundary",
      hostId: "host",
      fromIndex: 1,
      toIndex: 3,
    }, reader)).toEqual({
      textBlockIds: [],
      removableRootIds: ["b2", "b3"],
      insertParentIds: ["host"],
    });
  });

  it("maps a table rectangle to each cell container and existing content", () => {
    expect(buildReadonlyWriteFootprint({
      kind: "table-cell",
      tableId: "table",
      anchorCellId: "c11",
      headCellId: "c22",
    }, reader)).toEqual({
      textBlockIds: [],
      removableRootIds: ["p11", "p12", "p21", "p22"],
      insertParentIds: ["c11", "c12", "c21", "c22"],
    });
  });

  it("uses a model-resolved merged-cell target set when available", () => {
    const resolveTableCellIds = jasmine.createSpy("resolveTableCellIds")
      .and.returnValue(["c11", "c22"]);

    expect(buildReadonlyWriteFootprint({
      kind: "table-cell",
      tableId: "table",
      anchorCellId: "c11",
      headCellId: "c22",
    }, {...reader, resolveTableCellIds})).toEqual({
      textBlockIds: [],
      removableRootIds: ["p11", "p22"],
      insertParentIds: ["c11", "c22"],
    });
    expect(resolveTableCellIds).toHaveBeenCalledOnceWith("table", "c11", "c22");
  });

  it("returns an empty footprint for unsupported plans", () => {
    expect(buildReadonlyWriteFootprint({kind: "unsupported", reason: "stale"}, reader))
      .toEqual({textBlockIds: [], removableRootIds: [], insertParentIds: []});
  });
});
