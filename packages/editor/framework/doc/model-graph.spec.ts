import "../../blocks";
import * as Y from "yjs";
import {
  BlockNodeType,
  IBlockSnapshot,
  NativeBlockModel,
  YBlock,
  native2YBlock,
} from "../block-std";
import {BlockModelGraph} from "./model-graph";

function structuralBlock(
  id: string,
  children: string[],
  nodeType: BlockNodeType.block | BlockNodeType.root = BlockNodeType.block,
  flavour = nodeType === BlockNodeType.root ? "root" : "frame",
): YBlock {
  return native2YBlock({
    id,
    flavour,
    nodeType,
    props: {},
    meta: {},
    children,
  } as NativeBlockModel);
}

function editableBlock(
  id: string,
  text: string,
  props: Record<string, unknown> = {depth: 0},
): YBlock {
  return native2YBlock({
    id,
    flavour: "paragraph",
    nodeType: BlockNodeType.editable,
    props,
    meta: {},
    children: text ? [{insert: text}] : [],
  } as unknown as NativeBlockModel);
}

function voidBlock(id: string): YBlock {
  return native2YBlock({
    id,
    flavour: "divider",
    nodeType: BlockNodeType.void,
    props: {},
    meta: {},
    children: [],
  } as NativeBlockModel);
}

function createHarness() {
  const yDoc = new Y.Doc();
  const yBlockMap = yDoc.getMap<YBlock>("blocks");
  const logger = {warn: jasmine.createSpy("warn")};
  const doc = {yBlockMap, logger} as unknown as BlockCraft.Doc;
  const graph = new BlockModelGraph(doc);

  return {
    yDoc,
    yBlockMap,
    graph,
    logger,
    set(blocks: Record<string, YBlock>) {
      Object.entries(blocks).forEach(([id, block]) => yBlockMap.set(id, block));
    },
  };
}

describe("BlockModelGraph basic reads", () => {
  it("builds a reachable tree without mounted components", () => {
    const h = createHarness();
    h.set({
      root: structuralBlock("root", ["a", "b"], BlockNodeType.root),
      a: structuralBlock("a", ["a1"]),
      a1: editableBlock("a1", "hello", {depth: 2}),
      b: voidBlock("b"),
      orphan: editableBlock("orphan", "detached"),
    });

    h.graph.build("root");

    expect(h.graph.exists("root")).toBeTrue();
    expect(h.graph.exists("a1")).toBeTrue();
    expect(h.graph.exists("orphan")).toBeFalse();
    expect(h.graph.getYBlock("orphan")).toBeUndefined();
    expect(h.graph.getParentId("root")).toBeNull();
    expect(h.graph.getParentId("a")).toBe("root");
    expect(h.graph.getParentId("a1")).toBe("a");
    expect(h.graph.getChildrenIds("root")).toEqual(["a", "b"]);
    expect(h.graph.getChildrenIds("a1")).toEqual([]);
    expect(h.graph.getPath("a1")).toEqual(["root", "a", "a1"]);
    expect(h.graph.indexInParent("b")).toBe(1);
    expect(h.graph.getNextSiblingId("a")).toBe("b");
    expect(h.graph.getPreviousSiblingId("b")).toBe("a");
  });

  it("reads Yjs block data without exposing mutable graph state", () => {
    const h = createHarness();
    h.set({
      root: structuralBlock("root", ["p"], BlockNodeType.root),
      p: editableBlock("p", "hello", {depth: 3}),
    });
    h.graph.build("root");

    const children = h.graph.getChildrenIds("root") as string[];
    children.push("fake");

    expect(h.graph.getChildrenIds("root")).toEqual(["p"]);
    expect(h.graph.getFlavour("p")).toBe("paragraph");
    expect(h.graph.getNodeType("p")).toBe(BlockNodeType.editable);
    expect(h.graph.getProps("p")).toEqual({depth: 3});
    expect(h.graph.getText("p")).toBe("hello");
    expect(h.graph.getTextLength("p")).toBe(5);
  });

  it("returns neutral values for missing or unreachable blocks", () => {
    const h = createHarness();
    h.set({
      root: structuralBlock("root", [], BlockNodeType.root),
      orphan: editableBlock("orphan", "detached"),
    });
    h.graph.build("root");

    expect(h.graph.getParentId("missing")).toBeNull();
    expect(h.graph.getChildrenIds("missing")).toEqual([]);
    expect(h.graph.getPath("missing")).toBeNull();
    expect(h.graph.indexInParent("missing")).toBe(-1);
    expect(h.graph.getNextSiblingId("missing")).toBeNull();
    expect(h.graph.getPreviousSiblingId("missing")).toBeNull();
    expect(h.graph.getFlavour("orphan")).toBeUndefined();
    expect(h.graph.getNodeType("orphan")).toBeUndefined();
    expect(h.graph.getProps("orphan")).toBeUndefined();
    expect(h.graph.getText("orphan")).toBeUndefined();
    expect(h.graph.getTextLength("orphan")).toBe(0);
  });
});

describe("BlockModelGraph structural order", () => {
  function createOrderedHarness() {
    const h = createHarness();
    h.set({
      root: structuralBlock("root", ["a", "b", "c"], BlockNodeType.root),
      a: structuralBlock("a", ["a1"]),
      a1: editableBlock("a1", "one"),
      b: editableBlock("b", "two"),
      c: structuralBlock("c", ["c1"]),
      c1: editableBlock("c1", "three"),
      orphan: editableBlock("orphan", "detached"),
    });
    h.graph.build("root");
    return h;
  }

  it("matches DOM position values for reachable blocks", () => {
    const h = createOrderedHarness();
    const elements = new Map<string, HTMLElement>();
    ["root", "a", "a1", "b", "c", "c1"].forEach(id => {
      const element = document.createElement("div");
      element.dataset["blockId"] = id;
      elements.set(id, element);
    });
    elements.get("a")!.append(elements.get("a1")!);
    elements.get("c")!.append(elements.get("c1")!);
    elements.get("root")!.append(
      elements.get("a")!,
      elements.get("b")!,
      elements.get("c")!,
    );

    const expectParity = (a: string, b: string) => {
      expect(h.graph.comparePosition(a, b)).toBe(
        elements.get(a)!.compareDocumentPosition(elements.get(b)!),
      );
    };

    expectParity("a", "a");
    expectParity("a", "b");
    expectParity("b", "a");
    expectParity("a", "a1");
    expectParity("a1", "a");
    expectParity("a1", "c1");
    expect(h.graph.comparePosition("a", "orphan")).toBeNull();
    expect(h.graph.comparePosition("missing", "b")).toBeNull();
  });

  it("returns the existing closest-common-parent sibling interval", () => {
    const h = createOrderedHarness();

    expect(h.graph.queryBetween("a1", "c1")).toEqual(["b"]);
    expect(h.graph.queryBetween("a1", "c1", true)).toEqual(["a", "b", "c"]);
    expect(h.graph.queryBetween("c1", "a1", true)).toEqual(["a", "b", "c"]);
    expect(h.graph.queryBetween("a1", "a1")).toEqual([]);
    expect(h.graph.queryBetween("a1", "a1", true)).toEqual(["a1"]);
    expect(h.graph.queryBetween("a1", "orphan", true)).toEqual([]);
    expect(h.graph.queryBetween("missing", "c1", true)).toEqual([]);
  });
});

describe("BlockModelGraph snapshots", () => {
  it("serializes the reachable Yjs tree with rich inline deltas", () => {
    const h = createHarness();
    h.set({
      root: structuralBlock("root", ["p", "callout", "divider", "missing"], BlockNodeType.root),
      p: native2YBlock({
        id: "p",
        flavour: "paragraph",
        nodeType: BlockNodeType.editable,
        props: {depth: 1},
        meta: {author: "alice"},
        children: [
          {insert: "hello", attributes: {bold: true}},
          {insert: {mention: "user-1"}},
        ],
      } as unknown as NativeBlockModel),
      callout: native2YBlock({
        id: "callout",
        flavour: "callout",
        nodeType: BlockNodeType.block,
        props: {kind: "box"},
        meta: {collapsed: false},
        children: ["nested"],
      } as unknown as NativeBlockModel),
      nested: editableBlock("nested", "inside"),
      divider: voidBlock("divider"),
      orphan: editableBlock("orphan", "detached"),
    });
    h.graph.build("root");

    const expected: IBlockSnapshot = {
      id: "root",
      flavour: "root",
      nodeType: BlockNodeType.root,
      props: {},
      meta: {},
      children: [
        {
          id: "p",
          flavour: "paragraph",
          nodeType: BlockNodeType.editable,
          props: {depth: 1},
          meta: {author: "alice"},
          children: [
            {insert: "hello", attributes: {bold: true}},
            {insert: {mention: "user-1"}},
          ],
        },
        {
          id: "callout",
          flavour: "callout",
          nodeType: BlockNodeType.block,
          props: {kind: "box"},
          meta: {collapsed: false},
          children: [
            {
              id: "nested",
              flavour: "paragraph",
              nodeType: BlockNodeType.editable,
              props: {depth: 0},
              meta: {},
              children: [{insert: "inside"}],
            },
          ],
        },
        {
          id: "divider",
          flavour: "divider",
          nodeType: BlockNodeType.void,
          props: {},
          meta: {},
          children: [],
        },
      ],
    };

    expect(h.graph.toSnapshot("root")).toEqual(expected);
    expect(h.graph.toSnapshot("orphan")).toBeNull();
    expect(h.graph.toSnapshot("missing")).toBeNull();
    expect(h.yBlockMap.has("missing")).toBeFalse();
    expect(h.yBlockMap.has("orphan")).toBeTrue();
  });
});

describe("BlockModelGraph Yjs synchronization", () => {
  function childrenOf(h: ReturnType<typeof createHarness>, parentId: string): Y.Array<string> {
    return h.yBlockMap.get(parentId)!.get("children") as Y.Array<string>;
  }

  it("indexes an inserted subtree from one Yjs transaction", () => {
    const h = createHarness();
    h.set({root: structuralBlock("root", [], BlockNodeType.root)});
    h.graph.build("root");

    h.yDoc.transact(() => {
      h.yBlockMap.set("a", structuralBlock("a", ["a1"]));
      h.yBlockMap.set("a1", editableBlock("a1", "new"));
      childrenOf(h, "root").insert(0, ["a"]);
    });

    expect(h.graph.getChildrenIds("root")).toEqual(["a"]);
    expect(h.graph.getParentId("a")).toBe("root");
    expect(h.graph.getParentId("a1")).toBe("a");
    expect(h.graph.getText("a1")).toBe("new");
  });

  it("removes a deleted subtree from the reachable graph", () => {
    const h = createHarness();
    h.set({
      root: structuralBlock("root", ["a"], BlockNodeType.root),
      a: structuralBlock("a", ["a1"]),
      a1: editableBlock("a1", "old"),
    });
    h.graph.build("root");

    h.yDoc.transact(() => {
      childrenOf(h, "root").delete(0, 1);
      h.yBlockMap.delete("a");
      h.yBlockMap.delete("a1");
    });

    expect(h.graph.getChildrenIds("root")).toEqual([]);
    expect(h.graph.exists("a")).toBeFalse();
    expect(h.graph.exists("a1")).toBeFalse();
    expect(h.graph.getPath("a1")).toBeNull();
  });

  it("reflects sibling reordering", () => {
    const h = createHarness();
    h.set({
      root: structuralBlock("root", ["a", "b", "c"], BlockNodeType.root),
      a: editableBlock("a", "a"),
      b: editableBlock("b", "b"),
      c: editableBlock("c", "c"),
    });
    h.graph.build("root");

    h.yDoc.transact(() => {
      const children = childrenOf(h, "root");
      children.delete(0, children.length);
      children.insert(0, ["c", "a", "b"]);
    });

    expect(h.graph.getChildrenIds("root")).toEqual(["c", "a", "b"]);
    expect(h.graph.indexInParent("a")).toBe(1);
    expect(h.graph.getNextSiblingId("c")).toBe("a");
  });

  ["target-first", "source-first"].forEach(order => {
    it(`keeps a moved subtree when Yjs reports ${order}`, () => {
      const h = createHarness();
      h.set({
        root: structuralBlock("root", ["p1", "p2"], BlockNodeType.root),
        p1: structuralBlock("p1", ["x"]),
        p2: structuralBlock("p2", []),
        x: structuralBlock("x", ["x1"]),
        x1: editableBlock("x1", "kept"),
      });
      h.graph.build("root");

      h.yDoc.transact(() => {
        if (order === "target-first") {
          childrenOf(h, "p2").insert(0, ["x"]);
          childrenOf(h, "p1").delete(0, 1);
        } else {
          childrenOf(h, "p1").delete(0, 1);
          childrenOf(h, "p2").insert(0, ["x"]);
        }
      });

      expect(h.graph.getChildrenIds("p1")).toEqual([]);
      expect(h.graph.getChildrenIds("p2")).toEqual(["x"]);
      expect(h.graph.getParentId("x")).toBe("p2");
      expect(h.graph.getPath("x1")).toEqual(["root", "p2", "x", "x1"]);
    });
  });

  it("reconciles a reachable YBlock replacement without a parent-array event", () => {
    const h = createHarness();
    h.set({
      root: structuralBlock("root", ["container"], BlockNodeType.root),
      container: structuralBlock("container", ["old"]),
      old: editableBlock("old", "old"),
    });
    h.graph.build("root");

    h.yDoc.transact(() => {
      h.yBlockMap.set("next", editableBlock("next", "next"));
      h.yBlockMap.set("container", structuralBlock("container", ["next"]));
    });

    expect(h.graph.getChildrenIds("container")).toEqual(["next"]);
    expect(h.graph.getParentId("next")).toBe("container");
    expect(h.graph.exists("old")).toBeFalse();
  });

  it("reconciles structural fields replaced on an existing YBlock", () => {
    const h = createHarness();
    h.set({
      root: structuralBlock("root", ["container"], BlockNodeType.root),
      container: structuralBlock("container", ["old"]),
      old: editableBlock("old", "old"),
      next: editableBlock("next", "next"),
    });
    h.graph.build("root");

    const replacement = new Y.Array<string>();
    replacement.insert(0, ["next"]);
    h.yBlockMap.get("container")!.set("children", replacement);

    expect(h.graph.getChildrenIds("container")).toEqual(["next"]);
    expect(h.graph.getParentId("next")).toBe("container");
    expect(h.graph.exists("old")).toBeFalse();
  });

  it("sanitizes missing, cyclic and duplicate child references without writing Yjs", () => {
    const h = createHarness();
    h.set({
      root: structuralBlock("root", ["p1", "missing", "p1", "p2"], BlockNodeType.root),
      p1: structuralBlock("p1", ["x", "x"]),
      p2: structuralBlock("p2", ["x"]),
      x: structuralBlock("x", ["root"]),
    });

    h.graph.build("root");

    expect(h.graph.getChildrenIds("root")).toEqual(["p1", "p2"]);
    expect(h.graph.getChildrenIds("p1")).toEqual(["x"]);
    expect(h.graph.getChildrenIds("p2")).toEqual([]);
    expect(h.graph.getChildrenIds("x")).toEqual([]);
    expect(h.graph.getParentId("x")).toBe("p1");
    expect(childrenOf(h, "root").toArray()).toEqual(["p1", "missing", "p1", "p2"]);
    expect(h.logger.warn).toHaveBeenCalled();
  });

  it("releases its observer and indexes on destroy", () => {
    const h = createHarness();
    h.set({
      root: structuralBlock("root", ["a"], BlockNodeType.root),
      a: editableBlock("a", "a"),
    });
    h.graph.build("root");

    h.graph.destroy();
    h.yDoc.transact(() => {
      h.yBlockMap.set("b", editableBlock("b", "b"));
      childrenOf(h, "root").insert(1, ["b"]);
    });

    expect(h.graph.exists("root")).toBeFalse();
    expect(h.graph.exists("a")).toBeFalse();
    expect(h.graph.exists("b")).toBeFalse();
    expect(h.graph.getChildrenIds("root")).toEqual([]);
  });
});

describe("BlockModelGraph structure changes", () => {
  it("emits one revision with the complete newly reachable subtree", () => {
    const h = createHarness();
    h.set({
      root: structuralBlock("root", [], BlockNodeType.root),
      orphan: structuralBlock("orphan", ["orphan-child"]),
      "orphan-child": editableBlock("orphan-child", "detached"),
    });
    h.graph.build("root");
    const changes: any[] = [];
    h.graph.structureChange$.subscribe(change => changes.push(change));

    h.yDoc.transact(() => {
      const children = h.yBlockMap.get("root")!.get("children") as Y.Array<string>;
      children.insert(0, ["orphan"]);
    });

    expect(h.graph.structureRevision).toBe(1);
    expect(changes).toEqual([{
      revision: 1,
      reachableAddedIds: ["orphan", "orphan-child"],
      reachableRemovedIds: [],
      affectedParentIds: ["root"],
    }]);
  });

  it("emits one structure event for a move without reporting reachability changes", () => {
    const h = createHarness();
    h.set({
      root: structuralBlock("root", ["left", "right"], BlockNodeType.root),
      left: structuralBlock("left", ["branch"]),
      right: structuralBlock("right", []),
      branch: structuralBlock("branch", ["leaf"]),
      leaf: editableBlock("leaf", "kept"),
    });
    h.graph.build("root");
    const changes: any[] = [];
    h.graph.structureChange$.subscribe(change => changes.push(change));

    h.yDoc.transact(() => {
      const left = h.yBlockMap.get("left")!.get("children") as Y.Array<string>;
      const right = h.yBlockMap.get("right")!.get("children") as Y.Array<string>;
      left.delete(0, 1);
      right.insert(0, ["branch"]);
    });

    expect(changes.length).toBe(1);
    expect(changes[0].revision).toBe(1);
    expect(changes[0].reachableAddedIds).toEqual([]);
    expect(changes[0].reachableRemovedIds).toEqual([]);
    expect(changes[0].affectedParentIds).toEqual(
      jasmine.arrayWithExactContents(["left", "right"]),
    );
    expect(h.graph.getPath("leaf")).toEqual(["root", "right", "branch", "leaf"]);
  });

  it("reports the complete subtree when it becomes unreachable but YBlocks remain", () => {
    const h = createHarness();
    h.set({
      root: structuralBlock("root", ["branch"], BlockNodeType.root),
      branch: structuralBlock("branch", ["leaf"]),
      leaf: editableBlock("leaf", "retained"),
    });
    h.graph.build("root");
    let change: any = null;
    h.graph.structureChange$.subscribe(value => change = value);

    const children = h.yBlockMap.get("root")!.get("children") as Y.Array<string>;
    children.delete(0, 1);

    expect(change.reachableAddedIds).toEqual([]);
    expect(change.reachableRemovedIds).toEqual(
      jasmine.arrayWithExactContents(["branch", "leaf"]),
    );
    expect(h.yBlockMap.has("branch")).toBeTrue();
    expect(h.yBlockMap.has("leaf")).toBeTrue();
    expect(h.graph.exists("branch")).toBeFalse();
    expect(h.graph.exists("leaf")).toBeFalse();
  });

  it("stays silent for text, props and meta changes", () => {
    const h = createHarness();
    h.set({
      root: structuralBlock("root", ["p"], BlockNodeType.root),
      p: editableBlock("p", "text"),
    });
    h.graph.build("root");
    const next = jasmine.createSpy("next");
    h.graph.structureChange$.subscribe(next);
    const paragraph = h.yBlockMap.get("p")!;

    h.yDoc.transact(() => {
      (paragraph.get("children") as unknown as Y.Text).insert(4, " updated");
      (paragraph.get("props") as Y.Map<unknown>).set("depth", 2);
      (paragraph.get("meta") as Y.Map<unknown>).set("readonly", true);
    });

    expect(next).not.toHaveBeenCalled();
    expect(h.graph.structureRevision).toBe(0);
  });

  it("completes the structure signal on destroy", () => {
    const h = createHarness();
    h.set({root: structuralBlock("root", [], BlockNodeType.root)});
    h.graph.build("root");
    const complete = jasmine.createSpy("complete");
    h.graph.structureChange$.subscribe({complete});

    h.graph.destroy();

    expect(complete).toHaveBeenCalledTimes(1);
  });
});
