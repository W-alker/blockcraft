import {BlockSelection} from "../selection";
import {ISelectionPoint} from "../selection/types";
import {
  planSelectionEdit,
  SelectionEditReader,
} from "./selection-edit-plan";

interface TestNode {
  parentId: string | null
  childrenIds: string[]
  textLength?: number
}

describe("SelectionEditPlanner", () => {
  const nodes: Record<string, TestNode> = {
    root: {parentId: null, childrenIds: ["p1", "callout", "p2", "void"]},
    p1: {parentId: "root", childrenIds: [], textLength: 5},
    callout: {parentId: "root", childrenIds: ["c1", "c2", "c3"]},
    c1: {parentId: "callout", childrenIds: [], textLength: 4},
    c2: {parentId: "callout", childrenIds: [], textLength: 6},
    c3: {parentId: "callout", childrenIds: [], textLength: 3},
    p2: {parentId: "root", childrenIds: [], textLength: 7},
    void: {parentId: "root", childrenIds: []},
    table: {parentId: "root", childrenIds: ["cell-1", "cell-2"]},
    "cell-1": {parentId: "table", childrenIds: []},
    "cell-2": {parentId: "table", childrenIds: []},
  };

  const reader: SelectionEditReader = {
    getParentId: id => Object.prototype.hasOwnProperty.call(nodes, id)
      ? nodes[id].parentId
      : undefined,
    getChildrenIds: id => nodes[id]?.childrenIds ?? null,
    getTextLength: id => nodes[id]?.textLength ?? null,
  };

  function point(
    blockId: string,
    type: ISelectionPoint["type"],
    value?: number | string,
  ): ISelectionPoint {
    if (type === "text") {
      return {blockId, type, offset: value as number, block: {} as any};
    }
    if (type === "boundary") {
      return {blockId, type, index: value as number, block: {} as any};
    }
    if (type === "gap") {
      return {blockId, type, side: value as "before" | "after", block: {} as any};
    }
    if (type === "table-cell") {
      return {blockId, type, tableId: value as string, block: {} as any};
    }
    return {blockId, type, block: {} as any};
  }

  function selection(
    anchor: ISelectionPoint,
    head: ISelectionPoint,
    order: "forward" | "backward" = "forward",
  ) {
    return new BlockSelection(
      anchor,
      head,
      "root",
      () => ({} as any),
      () => order === "forward"
        ? Node.DOCUMENT_POSITION_FOLLOWING
        : Node.DOCUMENT_POSITION_PRECEDING,
    );
  }

  it("plans collapsed and same-block text with half-open offsets", () => {
    expect(planSelectionEdit(
      selection(point("p1", "text", 2), point("p1", "text", 2)),
      reader,
    )).toEqual({kind: "text-cursor", blockId: "p1", offset: 2});

    expect(planSelectionEdit(
      selection(point("p1", "text", 1), point("p1", "text", 4)),
      reader,
    )).toEqual({
      kind: "range",
      start: {kind: "text", blockId: "p1", from: 1, to: 4},
      end: null,
      insertAt: {blockId: "p1", offset: 1},
      stabilizeAt: null,
      tailMode: "merge",
    });
  });

  it("plans cross-block text once with an explicit tail policy", () => {
    expect(planSelectionEdit(
      selection(point("p1", "text", 2), point("p2", "text", 3)),
      reader,
      {tailMode: "preserve"},
    )).toEqual({
      kind: "range",
      start: {kind: "text", blockId: "p1", from: 2, to: 5},
      end: {kind: "text", blockId: "p2", from: 0, to: 3},
      insertAt: {blockId: "p1", offset: 2},
      stabilizeAt: {blockId: "p1", offset: 2},
      tailMode: "preserve",
    });
  });

  it("uses document-ordered endpoints for a backward selection", () => {
    const backward = new BlockSelection(
      point("p2", "text", 3),
      point("p1", "text", 2),
      "root",
      () => ({} as any),
      () => Node.DOCUMENT_POSITION_PRECEDING,
    );

    expect(planSelectionEdit(backward, reader)).toEqual(jasmine.objectContaining({
      kind: "range",
      start: {kind: "text", blockId: "p1", from: 2, to: 5},
      end: {kind: "text", blockId: "p2", from: 0, to: 3},
      insertAt: {blockId: "p1", offset: 2},
    }));
  });

  it("keeps mixed whole-block and text edges explicit", () => {
    expect(planSelectionEdit(
      selection(point("void", "selected"), point("p2", "text", 3), "backward"),
      reader,
    )).toEqual({
      kind: "range",
      start: {kind: "text", blockId: "p2", from: 3, to: 7},
      end: {kind: "block", blockId: "void"},
      insertAt: {blockId: "p2", offset: 3},
      stabilizeAt: {blockId: "p2", offset: 3},
      tailMode: "merge",
    });

    expect(planSelectionEdit(
      selection(point("p1", "selected"), point("p2", "selected")),
      reader,
    )).toEqual({kind: "block-range", startBlockId: "p1", endBlockId: "p2"});
  });

  it("plans same-container and collapsed boundary ranges", () => {
    expect(planSelectionEdit({
      start: point("callout", "boundary", 1),
      end: point("callout", "boundary", 3),
    }, reader)).toEqual({kind: "boundary", hostId: "callout", fromIndex: 1, toIndex: 3});

    expect(planSelectionEdit({
      start: point("callout", "boundary", 2),
      end: point("callout", "boundary", 2),
    }, reader)).toEqual({kind: "boundary", hostId: "callout", fromIndex: 2, toIndex: 2});
  });

  it("lowers mixed boundary/text to model block and text edges", () => {
    expect(planSelectionEdit({
      start: point("callout", "boundary", 1),
      end: point("c2", "text", 3),
    }, reader)).toEqual({
      kind: "range",
      start: {kind: "text", blockId: "c2", from: 0, to: 3},
      end: null,
      insertAt: {blockId: "c2", offset: 0},
      stabilizeAt: null,
      tailMode: "merge",
    });

    expect(planSelectionEdit({
      start: point("callout", "boundary", 0),
      end: point("c2", "text", 3),
    }, reader)).toEqual({
      kind: "range",
      start: {kind: "block", blockId: "c1"},
      end: {kind: "text", blockId: "c2", from: 0, to: 3},
      insertAt: {blockId: "c2", offset: 0},
      stabilizeAt: {blockId: "c2", offset: 0},
      tailMode: "merge",
    });

    expect(planSelectionEdit({
      start: point("c2", "text", 2),
      end: point("callout", "boundary", 2),
    }, reader)).toEqual({
      kind: "range",
      start: {kind: "text", blockId: "c2", from: 2, to: 6},
      end: null,
      insertAt: {blockId: "c2", offset: 2},
      stabilizeAt: null,
      tailMode: "merge",
    });

    expect(planSelectionEdit({
      start: point("c2", "text", 2),
      end: point("callout", "boundary", 3),
    }, reader)).toEqual({
      kind: "range",
      start: {kind: "text", blockId: "c2", from: 2, to: 6},
      end: {kind: "block", blockId: "c3"},
      insertAt: {blockId: "c2", offset: 2},
      stabilizeAt: {blockId: "c2", offset: 2},
      tailMode: "merge",
    });
  });

  it("retains gap and table-cell model intent", () => {
    expect(planSelectionEdit({
      start: point("void", "gap", "after"),
      end: point("void", "gap", "after"),
    }, reader)).toEqual({kind: "gap", blockId: "void", side: "after"});

    const tableSelection = selection(
      point("cell-1", "table-cell", "table"),
      point("cell-2", "table-cell", "table"),
    );
    expect(planSelectionEdit(tableSelection, reader)).toEqual({
      kind: "table-cell",
      tableId: "table",
      anchorCellId: "cell-1",
      headCellId: "cell-2",
    });
  });

  it("fails closed for stale, invalid, or unsupported structural endpoints", () => {
    expect(planSelectionEdit({
      start: point("missing", "text", 0),
      end: point("missing", "text", 1),
    }, reader)).toEqual({kind: "unsupported", reason: "stale-model"});

    expect(planSelectionEdit({
      start: point("callout", "boundary", 3),
      end: point("c2", "text", 1),
    }, reader)).toEqual({kind: "unsupported", reason: "invalid-boundary-range"});

    expect(planSelectionEdit({
      start: point("void", "gap", "before"),
      end: point("p2", "text", 1),
    }, reader)).toEqual({kind: "unsupported", reason: "unsupported-endpoints"});
  });
});
