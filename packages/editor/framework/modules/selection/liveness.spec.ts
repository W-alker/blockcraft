import {BlockSelection} from "./blockSelection";
import {hasLiveSelectionEndpoints, isSelectionAlive} from "./liveness";

describe("isSelectionAlive", () => {
  const makeDoc = (blocks: Record<string, any>, between: string[] = []) => ({
    getBlockById: jasmine.createSpy("getBlockById").and.callFake((id: string) => {
      if (!blocks[id]) throw new Error(`missing ${id}`);
      return blocks[id];
    }),
    queryBlocksBetween: jasmine.createSpy("queryBlocksBetween").and.returnValue(between),
  });

  it("validates all table-cell selection endpoints and the owning table", () => {
    const table = {id: "table-1"};
    const cell1 = {id: "cell-1"};
    const cell2 = {id: "cell-2"};
    const blocks: Record<string, any> = {
      "table-1": table,
      "cell-1": cell1,
      "cell-2": cell2,
    };
    const selection = new BlockSelection(
      {blockId: "cell-1", type: "table-cell", tableId: "table-1", block: cell1} as any,
      {blockId: "cell-2", type: "table-cell", tableId: "table-1", block: cell2} as any,
      "table-1",
      id => blocks[id],
      () => 0,
    );

    expect(isSelectionAlive(selection, makeDoc(blocks) as any)).toBeTrue();

    delete blocks["cell-2"];
    expect(isSelectionAlive(selection, makeDoc(blocks) as any)).toBeFalse();
  });

  it("validates boundary-selected child ids", () => {
    const callout = {
      id: "callout-1",
      childrenIds: ["p1", "p2"],
      childrenLength: 2,
    };
    const p1 = {id: "p1", parentId: "callout-1", parentBlock: callout, getIndexOfParent: () => 0};
    const p2 = {id: "p2", parentId: "callout-1", parentBlock: callout, getIndexOfParent: () => 1};
    const blocks: Record<string, any> = {
      "callout-1": callout,
      p1,
      p2,
    };
    const selection = new BlockSelection(
      {blockId: "callout-1", type: "boundary", index: 0, block: callout} as any,
      {blockId: "callout-1", type: "boundary", index: 2, block: callout} as any,
      "callout-1",
      id => blocks[id],
      () => 0,
    );

    expect(isSelectionAlive(selection, makeDoc(blocks) as any)).toBeTrue();

    delete blocks["p2"];
    expect(isSelectionAlive(selection, makeDoc(blocks) as any)).toBeFalse();
  });

  it("keeps a gap cursor alive only while its block exists", () => {
    const divider = {id: "divider-1"};
    const blocks: Record<string, any> = {"divider-1": divider};
    const selection = new BlockSelection(
      {blockId: "divider-1", type: "gap", side: "after", block: divider} as any,
      {blockId: "divider-1", type: "gap", side: "after", block: divider} as any,
      "root",
      id => blocks[id],
      () => 0,
    );

    expect(isSelectionAlive(selection, makeDoc({root: {id: "root"}, ...blocks}) as any)).toBeTrue();

    delete blocks["divider-1"];
    expect(isSelectionAlive(selection, makeDoc({root: {id: "root"}, ...blocks}) as any)).toBeFalse();
  });

  it("checks queried middle blocks for cross-block selections", () => {
    const root = {id: "root"};
    const p1 = {id: "p1", parentId: "root", parentBlock: root};
    const p2 = {id: "p2", parentId: "root", parentBlock: root};
    const middle = {id: "middle", parentId: "root", parentBlock: root};
    const blocks: Record<string, any> = {root, p1, p2, middle};
    const doc = makeDoc(blocks, ["middle"]);
    const selection = new BlockSelection(
      {blockId: "p1", type: "text", offset: 1, block: p1} as any,
      {blockId: "p2", type: "text", offset: 2, block: p2} as any,
      "root",
      id => blocks[id],
      (a, b) => blocks[a].id.localeCompare(blocks[b].id),
    );

    expect(isSelectionAlive(selection, doc as any)).toBeTrue();

    delete blocks["middle"];
    expect(hasLiveSelectionEndpoints(selection, makeDoc(blocks, ["middle"]) as any)).toBeTrue();
    expect(isSelectionAlive(selection, makeDoc(blocks, ["middle"]) as any)).toBeFalse();
  });

  it("checks endpoint ids without resolving direction or covered blocks", () => {
    const root = {id: "root"};
    const p1 = {id: "p1"};
    const p2 = {id: "p2"};
    const blocks: Record<string, any> = {root, p1, p2};
    const comparePosition = jasmine.createSpy("comparePosition");
    const selection = new BlockSelection(
      {blockId: "p1", type: "text", offset: 1, block: p1} as any,
      {blockId: "p2", type: "text", offset: 2, block: p2} as any,
      "root",
      id => blocks[id],
      comparePosition,
    );

    expect(hasLiveSelectionEndpoints(selection, makeDoc(blocks) as any)).toBeTrue();
    expect(comparePosition).not.toHaveBeenCalled();

    delete blocks["p2"];
    expect(hasLiveSelectionEndpoints(selection, makeDoc(blocks) as any)).toBeFalse();
  });
});
