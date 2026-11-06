import {SelectionModelResolver} from "./model-resolver";

describe("SelectionModelResolver", () => {
  const children: Record<string, readonly string[]> = {
    root: ["callout", "p2"],
    callout: ["p1"],
    p1: [],
    p2: [],
  };
  const parents: Record<string, string | null> = {
    root: null,
    callout: "root",
    p1: "callout",
    p2: "root",
  };
  const resolver = new SelectionModelResolver({
    exists: blockId => blockId in parents,
    getParentId: blockId => parents[blockId] ?? null,
    getChildrenIds: blockId => children[blockId] ?? [],
    getTextLength: blockId => blockId === "p1" ? 8 : 0,
  });

  it("resolves a nested endpoint to its direct child under a boundary parent", () => {
    expect(resolver.directChildIndexUnder("root", "p1")).toBe(0);
    expect(resolver.directChildIndexUnder("callout", "p1")).toBe(0);
    expect(resolver.directChildIndexUnder("p2", "p1")).toBeNull();
  });

  it("resolves boundary content ids without mounted block components", () => {
    expect(resolver.contentBlockId("root", 0, "start")).toBe("callout");
    expect(resolver.contentBlockId("root", 1, "end")).toBe("callout");
    expect(resolver.contentBlockId("root", 2, "end")).toBe("p2");
  });

  it("reads structural children and text length from the model graph", () => {
    expect(resolver.getChildrenIds("root")).toEqual(["callout", "p2"]);
    expect(resolver.getTextLength("p1")).toBe(8);
  });
});
