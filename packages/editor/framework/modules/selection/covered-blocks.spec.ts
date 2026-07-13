import {getSelectionCoveredBlockIds} from "./covered-blocks";

describe("getSelectionCoveredBlockIds", () => {
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
