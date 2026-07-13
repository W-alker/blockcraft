import {BlockNodeType} from "../../block-std";
import {BlockSelection} from "./blockSelection";
import {SelectionSelectedManager} from "./selected-manager";

describe("SelectionSelectedManager", () => {
  it("marks the content blocks for a reversed mixed boundary-to-text selection", () => {
    const rootHost = document.createElement("div");
    const calloutHost = document.createElement("section");
    const p1Host = document.createElement("p");
    rootHost.setAttribute("data-block-id", "root");
    calloutHost.setAttribute("data-block-id", "callout-1");
    p1Host.setAttribute("data-block-id", "p1");
    rootHost.append(calloutHost, p1Host);
    document.body.appendChild(rootHost);

    const root = {
      id: "root",
      nodeType: BlockNodeType.root,
      hostElement: rootHost,
      childrenIds: ["callout-1", "p1"],
      childrenLength: 2,
    };
    const callout = {
      id: "callout-1",
      nodeType: BlockNodeType.block,
      hostElement: calloutHost,
      parentId: "root",
      parentBlock: root,
      childrenIds: [],
      childrenLength: 0,
      getIndexOfParent: () => 0,
    };
    const p1 = {
      id: "p1",
      nodeType: BlockNodeType.editable,
      hostElement: p1Host,
      parentId: "root",
      parentBlock: root,
      textLength: 5,
      getIndexOfParent: () => 1,
    };
    const blocks: Record<string, any> = {root, "callout-1": callout, p1};
    const doc = {
      getBlockById: (id: string) => blocks[id],
      queryBlocksBetween: jasmine.createSpy("queryBlocksBetween").and.returnValue(["callout-1", "p1"]),
    };
    const selection = new BlockSelection(
      {blockId: "p1", type: "text", offset: 3, block: p1} as any,
      {blockId: "root", type: "boundary", index: 0, block: root} as any,
      "root",
      id => blocks[id],
      (a, b) => blocks[a].hostElement.compareDocumentPosition(blocks[b].hostElement),
    );
    const manager = new SelectionSelectedManager(doc as any);

    manager.setSelected(selection as any);

    expect(selection.direction).toBe("backward");
    expect(selection.firstBlock).toBe(callout as any);
    expect(selection.lastBlock).toBe(p1 as any);
    expect(rootHost.classList.contains("selected")).toBeFalse();
    expect(rootHost.classList.contains("focused")).toBeFalse();
    expect(calloutHost.classList.contains("selected")).toBeTrue();
    expect(p1Host.classList.contains("focused")).toBeTrue();
    expect(doc.queryBlocksBetween).toHaveBeenCalledOnceWith(callout, p1, true);

    manager.setSelected(null);

    expect(calloutHost.classList.contains("selected")).toBeFalse();
    expect(p1Host.classList.contains("focused")).toBeFalse();
    rootHost.remove();
  });
});
