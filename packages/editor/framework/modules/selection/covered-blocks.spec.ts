import {getSelectionCoveredBlockIds} from "./covered-blocks";

describe("getSelectionCoveredBlockIds", () => {
  const setSelectionScope = <T extends Record<string, any>>(block: T, selectionScope: string): T & {doc: any} => {
    return Object.assign(block, {
      doc: {
        schemas: {
          get: () => ({
            metadata: {
              selectionScope,
            },
          }),
        },
      },
    });
  }

  const makeDoc = () => ({
    queryBlocksBetween: jasmine.createSpy("queryBlocksBetween").and.returnValue(["p1", "p2"]),
  });

  it("uses boundary child ids without querying the doc", () => {
    const doc = makeDoc();
    const selection = {
      getBoundarySelectedChildIds: () => ["p1", "p2"],
      firstBlock: {id: "p1"},
      lastBlock: {id: "p2"},
    } as any;

    expect(getSelectionCoveredBlockIds(selection, doc as any)).toEqual(["p1", "p2"]);
    expect(doc.queryBlocksBetween).not.toHaveBeenCalled();
  });

  it("keeps collapsed boundary cursors empty", () => {
    const doc = makeDoc();
    const selection = {
      getBoundarySelectedChildIds: () => [],
      firstBlock: {id: "p1"},
      lastBlock: {id: "p2"},
    } as any;

    expect(getSelectionCoveredBlockIds(selection, doc as any)).toEqual([]);
    expect(doc.queryBlocksBetween).not.toHaveBeenCalled();
  });

  it("falls back to an inclusive block query for non-boundary selections", () => {
    const doc = makeDoc();
    const selection = {
      getBoundarySelectedChildIds: () => null,
      isInSameBlock: false,
      firstBlock: {id: "p1"},
      lastBlock: {id: "p2"},
    } as any;

    expect(getSelectionCoveredBlockIds(selection, doc as any)).toEqual(["p1", "p2"]);
    expect(doc.queryBlocksBetween).toHaveBeenCalledOnceWith(selection.firstBlock, selection.lastBlock, true);
  });

  it("keeps cross-column text selections from marking column containers as covered", () => {
    const doc = {
      getBlockById: jasmine.createSpy("getBlockById").and.callFake((id: string) => ({
        id,
        flavour: id === "columns-1" ? "columns" : "paragraph",
        doc: id === "columns-1"
          ? setSelectionScope({id, flavour: "columns"}, "columns").doc
          : undefined,
      })),
      queryBlocksBetween: jasmine.createSpy("queryBlocksBetween").and.returnValue(["column-1", "column-2"]),
    };
    const selection = {
      getBoundarySelectedChildIds: () => null,
      getTableCellSelection: () => null,
      collapsed: false,
      commonParent: "columns-1",
      start: {blockId: "p-left", type: "text", offset: 2},
      end: {blockId: "p-right", type: "text", offset: 4},
      isInSameBlock: false,
      firstBlock: {id: "p-left"},
      lastBlock: {id: "p-right"},
    } as any;

    expect(getSelectionCoveredBlockIds(selection, doc as any)).toEqual(["p-left", "p-right"]);
    expect(doc.queryBlocksBetween).not.toHaveBeenCalled();
  });

  it("uses deep path coverage for document-level text ranges", () => {
    const doc = {
      getBlockById: jasmine.createSpy("getBlockById").and.callFake((id: string) => ({
        id,
        flavour: id === "root" ? "root" : "paragraph",
        doc: id === "root"
          ? setSelectionScope({id, flavour: "root"}, "document").doc
          : undefined,
      })),
      queryBlocksThroughPathDeeply: jasmine.createSpy("queryBlocksThroughPathDeeply").and.returnValue([
        {group: ["callout-1"]},
      ]),
      queryBlocksBetween: jasmine.createSpy("queryBlocksBetween").and.returnValue(["p1", "callout-1", "p2"]),
    };
    const selection = {
      getBoundarySelectedChildIds: () => null,
      getTableCellSelection: () => null,
      collapsed: false,
      commonParent: "root",
      start: {blockId: "p1", type: "text", offset: 2},
      end: {blockId: "p2", type: "text", offset: 4},
      isInSameBlock: false,
      firstBlock: {id: "p1"},
      lastBlock: {id: "p2"},
    } as any;

    expect(getSelectionCoveredBlockIds(selection, doc as any)).toEqual(["p1", "callout-1", "p2"]);
    expect(doc.queryBlocksThroughPathDeeply).toHaveBeenCalledOnceWith(selection.firstBlock, selection.lastBlock);
    expect(doc.queryBlocksBetween).not.toHaveBeenCalled();
  });

  it("does not mark an endpoint ancestor container as covered for transparent text ranges", () => {
    const doc = {
      getBlockById: jasmine.createSpy("getBlockById").and.callFake((id: string) => ({
        id,
        flavour: id === "root" ? "root" : "paragraph",
        doc: id === "root"
          ? setSelectionScope({id, flavour: "root"}, "document").doc
          : undefined,
      })),
      queryBlocksThroughPathDeeply: jasmine.createSpy("queryBlocksThroughPathDeeply").and.returnValue([
        {group: ["callout-inner-tail"]},
      ]),
      queryBlocksBetween: jasmine.createSpy("queryBlocksBetween").and.returnValue(["callout-1", "p-after"]),
    };
    const selection = {
      getBoundarySelectedChildIds: () => null,
      getTableCellSelection: () => null,
      collapsed: false,
      commonParent: "root",
      start: {blockId: "callout-p", type: "text", offset: 2},
      end: {blockId: "p-after", type: "text", offset: 4},
      isInSameBlock: false,
      firstBlock: {id: "callout-p"},
      lastBlock: {id: "p-after"},
    } as any;

    expect(getSelectionCoveredBlockIds(selection, doc as any)).toEqual([
      "callout-p",
      "callout-inner-tail",
      "p-after",
    ]);
    expect(doc.queryBlocksThroughPathDeeply).toHaveBeenCalledOnceWith(selection.firstBlock, selection.lastBlock);
    expect(doc.queryBlocksBetween).not.toHaveBeenCalled();
  });

  it("falls back to the generic covered-block path without deep path support", () => {
    const doc = {
      getBlockById: jasmine.createSpy("getBlockById").and.callFake((id: string) => ({
        id,
        flavour: id === "root" ? "root" : "paragraph",
        doc: id === "root"
          ? setSelectionScope({id, flavour: "root"}, "document").doc
          : undefined,
      })),
      queryBlocksBetween: jasmine.createSpy("queryBlocksBetween").and.returnValue(["p1", "callout-1", "p2"]),
    };
    const selection = {
      getBoundarySelectedChildIds: () => null,
      getTableCellSelection: () => null,
      collapsed: false,
      commonParent: "root",
      start: {blockId: "p1", type: "text", offset: 2},
      end: {blockId: "p2", type: "text", offset: 4},
      isInSameBlock: false,
      firstBlock: {id: "p1"},
      lastBlock: {id: "p2"},
    } as any;

    expect(getSelectionCoveredBlockIds(selection, doc as any)).toEqual(["p1", "callout-1", "p2"]);
    expect(doc.queryBlocksBetween).toHaveBeenCalledOnceWith(selection.firstBlock, selection.lastBlock, true);
  });

  it("keeps cross-table-cell text selections from marking row containers as covered", () => {
    const table = setSelectionScope({id: "table-1", flavour: "table"}, "table");
    const row = {id: "row-1", flavour: "table-row", parentId: "table-1", parentBlock: table};
    const blocks: Record<string, any> = {
      "table-1": table,
      "row-1": row,
    };
    const doc = {
      getBlockById: jasmine.createSpy("getBlockById").and.callFake((id: string) => blocks[id] ?? {id, flavour: "paragraph"}),
      queryBlocksBetween: jasmine.createSpy("queryBlocksBetween").and.returnValue(["row-1"]),
    };
    const selection = {
      getBoundarySelectedChildIds: () => null,
      getTableCellSelection: () => null,
      collapsed: false,
      commonParent: "row-1",
      start: {blockId: "cell-1-p", type: "text", offset: 0},
      end: {blockId: "cell-3-p", type: "text", offset: 2},
      isInSameBlock: false,
      firstBlock: {id: "cell-1-p"},
      lastBlock: {id: "cell-3-p"},
    } as any;

    expect(getSelectionCoveredBlockIds(selection, doc as any)).toEqual(["cell-1-p", "cell-3-p"]);
    expect(doc.queryBlocksBetween).not.toHaveBeenCalled();
  });

  it("keeps cross-row table text selections from marking the table container as covered", () => {
    const doc = {
      getBlockById: jasmine.createSpy("getBlockById").and.callFake((id: string) => ({
        id,
        flavour: id === "table-1" ? "table" : "paragraph",
        doc: id === "table-1"
          ? setSelectionScope({id, flavour: "table"}, "table").doc
          : undefined,
      })),
      queryBlocksBetween: jasmine.createSpy("queryBlocksBetween").and.returnValue(["table-1"]),
    };
    const selection = {
      getBoundarySelectedChildIds: () => null,
      getTableCellSelection: () => null,
      collapsed: false,
      commonParent: "table-1",
      start: {blockId: "row-1-cell-p", type: "text", offset: 0},
      end: {blockId: "row-2-cell-p", type: "text", offset: 2},
      isInSameBlock: false,
      firstBlock: {id: "row-1-cell-p"},
      lastBlock: {id: "row-2-cell-p"},
    } as any;

    expect(getSelectionCoveredBlockIds(selection, doc as any)).toEqual(["row-1-cell-p", "row-2-cell-p"]);
    expect(doc.queryBlocksBetween).not.toHaveBeenCalled();
  });

  it("returns the current block for same-block selections without querying the doc", () => {
    const doc = makeDoc();
    const selection = {
      getBoundarySelectedChildIds: () => null,
      isInSameBlock: true,
      firstBlock: {id: "p1"},
      lastBlock: {id: "p1"},
    } as any;

    expect(getSelectionCoveredBlockIds(selection, doc as any)).toEqual(["p1"]);
    expect(doc.queryBlocksBetween).not.toHaveBeenCalled();
  });

  it("keeps table-cell selections out of generic covered block queries", () => {
    const doc = makeDoc();
    const selection = {
      getBoundarySelectedChildIds: () => null,
      getTableCellSelection: () => ({
        tableId: "table-1",
        anchorCellId: "cell-1",
        headCellId: "cell-4",
      }),
      isInSameBlock: false,
      firstBlock: {id: "cell-1"},
      lastBlock: {id: "cell-4"},
    } as any;

    expect(getSelectionCoveredBlockIds(selection, doc as any)).toEqual([]);
    expect(doc.queryBlocksBetween).not.toHaveBeenCalled();
  });

  it("treats a gap cursor as no covered blocks", () => {
    const doc = makeDoc();
    const selection = {
      getBoundarySelectedChildIds: () => null,
      getTableCellSelection: () => null,
      collapsed: true,
      start: {blockId: "table-1", type: "gap", side: "after"},
      isInSameBlock: true,
      firstBlock: {id: "table-1"},
      lastBlock: {id: "table-1"},
    } as any;

    expect(getSelectionCoveredBlockIds(selection, doc as any)).toEqual([]);
    expect(doc.queryBlocksBetween).not.toHaveBeenCalled();
  });

  it("falls back for light selection mocks without boundary helpers", () => {
    const doc = makeDoc();
    const selection = {
      firstBlock: {id: "p1"},
      lastBlock: {id: "p2"},
    } as any;

    expect(getSelectionCoveredBlockIds(selection, doc as any)).toEqual(["p1", "p2"]);
    expect(doc.queryBlocksBetween).toHaveBeenCalledOnceWith(selection.firstBlock, selection.lastBlock, true);
  });

  it("returns no covered blocks when a stale selection cannot resolve block refs", () => {
    const doc = makeDoc();
    const selection = {
      getBoundarySelectedChildIds: () => null,
      isInSameBlock: true,
      get firstBlock() {
        throw new Error("Block not found");
      },
    } as any;

    expect(getSelectionCoveredBlockIds(selection, doc as any)).toEqual([]);
    expect(doc.queryBlocksBetween).not.toHaveBeenCalled();
  });
});
