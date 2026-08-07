import "../../blocks";
import * as Y from "yjs";
import {
  BlockNodeType,
  IBlockSnapshot,
  NativeBlockModel,
  YBlock,
  native2YBlock,
} from "../block-std";
import {
  BlockModelGraph,
  IBlockModelContentChange,
  IBlockModelStructureChange,
} from "./model-graph";

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

  it("preserves the root CSS background shorthand in document snapshots", () => {
    const h = createHarness();
    const background = '#f7f7f7 url("https://cdn.example.com/bg.png") center / cover no-repeat';
    const root = native2YBlock({
      id: "root",
      flavour: "root",
      nodeType: BlockNodeType.root,
      props: {background},
      meta: {},
      children: [],
    } as NativeBlockModel);
    h.set({root});
    h.graph.build("root");

    expect(h.graph.getProps("root")?.["background"]).toBe(background);
    expect(h.graph.toSnapshot("root")?.props["background"]).toBe(background);
  });

  it("reads rich text deltas without a mounted block component", () => {
    const h = createHarness();
    h.set({
      root: structuralBlock("root", ["p"], BlockNodeType.root),
      p: native2YBlock({
        id: "p",
        flavour: "paragraph",
        nodeType: BlockNodeType.editable,
        props: {},
        meta: {},
        children: [
          {insert: "hello", attributes: {bold: true}},
          {insert: {mention: "user-1"}},
        ],
      } as unknown as NativeBlockModel),
    });
    h.graph.build("root");

    expect(h.graph.getTextDeltas("p")).toEqual([
      {insert: "hello", attributes: {bold: true}},
      {insert: {mention: "user-1"}},
    ]);
    expect(h.graph.getTextDeltas("root")).toBeUndefined();
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

  it("synchronizes an inserted subtree before view creation without duplicating the commit event", () => {
    const h = createHarness();
    h.set({root: structuralBlock("root", [], BlockNodeType.root)});
    h.graph.build("root");
    const changes: any[] = [];
    h.graph.structureChange$.subscribe(change => changes.push(change));

    h.yDoc.transact(() => {
      h.yBlockMap.set("a", structuralBlock("a", ["a1"]));
      h.yBlockMap.set("a1", editableBlock("a1", "new"));
      childrenOf(h, "root").insert(0, ["a"]);

      h.graph.synchronizeParentBeforeView("root");

      expect(h.graph.getPath("a1")).toEqual(["root", "a", "a1"]);
      expect(changes.length).toBe(1);
    });

    expect(changes).toEqual([{
      revision: 1,
      reachableAddedIds: ["a", "a1"],
      reachableRemovedIds: [],
      affectedParentIds: ["root"],
      affectedRootIds: ["a"],
    }]);
  });

  it("synchronizes nested structure root impact before view creation", () => {
    const h = createHarness();
    h.set({
      root: structuralBlock("root", ["unit"], BlockNodeType.root),
      unit: structuralBlock("unit", ["container"]),
      container: structuralBlock("container", []),
    });
    h.graph.build("root");
    const changes: IBlockModelStructureChange[] = [];
    h.graph.structureChange$.subscribe(change => changes.push(change));

    h.yDoc.transact(() => {
      h.yBlockMap.set("leaf", editableBlock("leaf", "new"));
      childrenOf(h, "container").insert(0, ["leaf"]);

      h.graph.synchronizeParentBeforeView("container");

      expect(h.graph.getPath("leaf")).toEqual([
        "root",
        "unit",
        "container",
        "leaf",
      ]);
      expect(changes.length).toBe(1);
    });

    expect(changes).toEqual([{
      revision: 1,
      reachableAddedIds: ["leaf"],
      reachableRemovedIds: [],
      affectedParentIds: ["container"],
      affectedRootIds: ["unit"],
    }]);
  });

  it("emits model text changes for reachable blocks without mounted views", () => {
    const h = createHarness();
    h.set({
      root: structuralBlock("root", ["p"], BlockNodeType.root),
      p: editableBlock("p", "old"),
    });
    h.graph.build("root");
    const changes: any[] = [];
    h.graph.textChange$.subscribe(change => changes.push(change));

    h.yDoc.transact(() => {
      const text = h.yBlockMap.get("p")!.get("children") as unknown as Y.Text;
      text.delete(0, text.length);
      text.insert(0, "new");
    }, "remote-search-update");

    expect(changes).toEqual([jasmine.objectContaining({
      blockIds: ["p"],
      origin: "remote-search-update",
      local: true,
    })]);
  });

  it("marks text changes applied from another Y.Doc as remote", () => {
    const h = createHarness();
    h.set({
      root: structuralBlock("root", ["p"], BlockNodeType.root),
      p: editableBlock("p", "old"),
    });
    h.graph.build("root");
    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(h.yDoc));
    let update: Uint8Array | null = null;
    remote.on("update", value => update = value);
    const remoteText = remote.getMap<YBlock>("blocks").get("p")!.get("children") as unknown as Y.Text;
    remoteText.insert(remoteText.length, " remote");
    const changes: any[] = [];
    h.graph.textChange$.subscribe(change => changes.push(change));

    Y.applyUpdate(h.yDoc, update!);

    expect(h.graph.getText("p")).toBe("old remote");
    expect(changes).toEqual([jasmine.objectContaining({
      blockIds: ["p"],
      local: false,
    })]);
    remote.destroy();
  });

  it("coalesces text and props into one model content event without mounted views", () => {
    const h = createHarness();
    h.set({
      root: structuralBlock("root", ["p"], BlockNodeType.root),
      p: editableBlock("p", "old"),
    });
    h.graph.build("root");
    const changes: IBlockModelContentChange[] = [];
    h.graph.contentChange$.subscribe(change => changes.push(change));

    h.yDoc.transact(() => {
      const block = h.yBlockMap.get("p")!;
      (block.get("children") as unknown as Y.Text).insert(3, " text");
      (block.get("props") as Y.Map<unknown>).set("depth", 2);
    }, "combined-content");

    expect(changes).toEqual([{
      blockIds: ["p"],
      kinds: ["text", "props"],
      origin: "combined-content",
      local: true,
      isUndoRedo: false,
    }]);
  });

  it("treats inline attributes and nested props as content changes", () => {
    const h = createHarness();
    h.set({
      root: structuralBlock("root", ["p"], BlockNodeType.root),
      p: editableBlock("p", "old"),
    });
    h.graph.build("root");
    const block = h.yBlockMap.get("p")!;
    const props = block.get("props") as Y.Map<unknown>;
    const appearance = new Y.Map<unknown>();
    props.set("appearance", appearance);
    const changes: IBlockModelContentChange[] = [];
    h.graph.contentChange$.subscribe(change => changes.push(change));

    h.yDoc.transact(() => {
      (block.get("children") as unknown as Y.Text).format(0, 3, {bold: true});
      appearance.set("tone", "accent");
    }, "nested-content");

    expect(changes).toEqual([{
      blockIds: ["p"],
      kinds: ["text", "props"],
      origin: "nested-content",
      local: true,
      isUndoRedo: false,
    }]);
  });

  it("recognizes children and props replacements on a reachable block", () => {
    const h = createHarness();
    h.set({
      root: structuralBlock("root", ["p"], BlockNodeType.root),
      p: editableBlock("p", "old"),
    });
    h.graph.build("root");
    const changes: IBlockModelContentChange[] = [];
    h.graph.contentChange$.subscribe(change => changes.push(change));

    h.yDoc.transact(() => {
      const replacementText = new Y.Text("replacement");
      const replacementProps = new Y.Map<unknown>();
      replacementProps.set("depth", 4);
      const block = h.yBlockMap.get("p")!;
      block.set("children", replacementText);
      block.set("props", replacementProps);
    }, "replace-content");

    expect(changes).toEqual([{
      blockIds: ["p"],
      kinds: ["text", "props"],
      origin: "replace-content",
      local: true,
      isUndoRedo: false,
    }]);
  });

  it("broadcasts a reachable whole YBlock replacement as content", () => {
    const h = createHarness();
    h.set({
      root: structuralBlock("root", ["p"], BlockNodeType.root),
      p: editableBlock("p", "old"),
    });
    h.graph.build("root");
    const contentChanges: IBlockModelContentChange[] = [];
    const textChanges: any[] = [];
    h.graph.contentChange$.subscribe(change => contentChanges.push(change));
    h.graph.textChange$.subscribe(change => textChanges.push(change));

    h.yBlockMap.set("p", editableBlock("p", "replacement", {depth: 4}));

    expect(contentChanges).toEqual([{
      blockIds: ["p"],
      kinds: ["text", "props"],
      origin: null,
      local: true,
      isUndoRedo: false,
    }]);
    expect(textChanges).toEqual([{
      blockIds: ["p"],
      origin: null,
      local: true,
      isUndoRedo: false,
    }]);
  });

  it("does not report newly reachable blocks as content changes", () => {
    const h = createHarness();
    h.set({root: structuralBlock("root", [], BlockNodeType.root)});
    h.graph.build("root");
    const contentNext = jasmine.createSpy("contentNext");
    h.graph.contentChange$.subscribe(contentNext);

    h.yDoc.transact(() => {
      h.yBlockMap.set("p", editableBlock("p", "new"));
      childrenOf(h, "root").insert(0, ["p"]);
    });

    expect(h.graph.exists("p")).toBeTrue();
    expect(contentNext).not.toHaveBeenCalled();
  });

  it("does not snapshot root children for a content-only transaction", () => {
    const h = createHarness();
    h.set({
      root: structuralBlock("root", ["p"], BlockNodeType.root),
      p: editableBlock("p", "old"),
    });
    h.graph.build("root");
    const directRootChildSet = spyOn(
      h.graph as unknown as {directRootChildSet(): Set<string>},
      "directRootChildSet",
    ).and.callThrough();

    (h.yBlockMap.get("p")!.get("children") as unknown as Y.Text)
      .insert(3, " updated");

    expect(directRootChildSet).not.toHaveBeenCalled();
  });

  it("does not treat meta-only writes as model content changes", () => {
    const h = createHarness();
    h.set({
      root: structuralBlock("root", ["p"], BlockNodeType.root),
      p: editableBlock("p", "old"),
    });
    h.graph.build("root");
    const contentNext = jasmine.createSpy("contentNext");
    const textNext = jasmine.createSpy("textNext");
    h.graph.contentChange$.subscribe(contentNext);
    h.graph.textChange$.subscribe(textNext);

    (h.yBlockMap.get("p")!.get("meta") as Y.Map<unknown>)
      .set("lock", "user-1");

    expect(contentNext).not.toHaveBeenCalled();
    expect(textNext).not.toHaveBeenCalled();
  });

  it("marks props changes applied from another Y.Doc as remote", () => {
    const h = createHarness();
    h.set({
      root: structuralBlock("root", ["p"], BlockNodeType.root),
      p: editableBlock("p", "old"),
    });
    h.graph.build("root");
    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(h.yDoc));
    let update: Uint8Array | null = null;
    remote.on("update", value => update = value);
    const remoteProps = remote.getMap<YBlock>("blocks").get("p")!
      .get("props") as Y.Map<unknown>;
    remoteProps.set("depth", 7);
    const changes: IBlockModelContentChange[] = [];
    h.graph.contentChange$.subscribe(change => changes.push(change));

    Y.applyUpdate(h.yDoc, update!);

    expect(changes).toEqual([{
      blockIds: ["p"],
      kinds: ["props"],
      origin: null,
      local: false,
      isUndoRedo: false,
    }]);
    remote.destroy();
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
    const changes: IBlockModelStructureChange[] = [];
    h.graph.structureChange$.subscribe(change => changes.push(change));

    h.yDoc.transact(() => {
      const children = childrenOf(h, "root");
      children.delete(0, children.length);
      children.insert(0, ["c", "a", "b"]);
    });

    expect(h.graph.getChildrenIds("root")).toEqual(["c", "a", "b"]);
    expect(h.graph.indexInParent("a")).toBe(1);
    expect(h.graph.getNextSiblingId("c")).toBe("a");
    expect(changes).toEqual([{
      revision: 1,
      reachableAddedIds: [],
      reachableRemovedIds: [],
      affectedParentIds: ["root"],
      affectedRootIds: [],
    }]);
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

  it("keeps descendants restored by undo when their temporary ancestor is deleted", () => {
    const h = createHarness();
    h.set({
      root: structuralBlock("root", ["source", "target"], BlockNodeType.root),
      source: editableBlock("source", "source"),
      target: editableBlock("target", "target"),
    });
    h.graph.build("root");
    const undoManager = new Y.UndoManager(h.yBlockMap);

    h.yDoc.transact(() => {
      h.yBlockMap.set("columns", structuralBlock("columns", ["left", "right"]));
      h.yBlockMap.set("left", structuralBlock("left", []));
      h.yBlockMap.set("right", structuralBlock("right", []));
      childrenOf(h, "root").insert(1, ["columns"]);
    });
    h.yDoc.transact(() => {
      const rootChildren = childrenOf(h, "root");
      rootChildren.delete(2, 1);
      rootChildren.delete(0, 1);
      childrenOf(h, "left").insert(0, ["source"]);
      childrenOf(h, "right").insert(0, ["target"]);
    });

    expect(h.graph.getChildrenIds("root")).toEqual(["columns"]);
    expect(h.graph.getPath("source")).toEqual(["root", "columns", "left", "source"]);

    undoManager.undo();

    expect(h.graph.getChildrenIds("root")).toEqual(["source", "target"]);
    expect(h.graph.exists("source")).toBeTrue();
    expect(h.graph.exists("target")).toBeTrue();
    expect(h.graph.getParentId("source")).toBe("root");
    expect(h.graph.getParentId("target")).toBe("root");
    expect(h.graph.getPath("source")).toEqual(["root", "source"]);
    expect(h.graph.getPath("target")).toEqual(["root", "target"]);
    expect(h.graph.exists("columns")).toBeFalse();
    expect(h.graph.exists("left")).toBeFalse();
    expect(h.graph.exists("right")).toBeFalse();

    undoManager.destroy();
  });

  it("indexes existing siblings moved into a wrapper created in the same transaction", () => {
    const h = createHarness();
    h.set({
      root: structuralBlock("root", ["a", "b", "c"], BlockNodeType.root),
      a: editableBlock("a", "a"),
      b: editableBlock("b", "b"),
      c: editableBlock("c", "c"),
    });
    h.graph.build("root");
    const undoManager = new Y.UndoManager(h.yBlockMap);

    h.yDoc.transact(() => {
      h.yBlockMap.set("wrapper", structuralBlock("wrapper", ["a", "b"]));
      const rootChildren = childrenOf(h, "root");
      rootChildren.delete(0, 2);
      rootChildren.insert(0, ["wrapper"]);
    });

    expect(h.graph.getChildrenIds("root")).toEqual(["wrapper", "c"]);
    expect(h.graph.getChildrenIds("wrapper")).toEqual(["a", "b"]);
    expect(h.graph.getPath("a")).toEqual(["root", "wrapper", "a"]);
    expect(h.graph.getPath("b")).toEqual(["root", "wrapper", "b"]);

    undoManager.undo();

    expect(h.graph.getChildrenIds("root")).toEqual(["a", "b", "c"]);
    expect(h.graph.exists("wrapper")).toBeFalse();
    expect(h.graph.getPath("a")).toEqual(["root", "a"]);
    expect(h.graph.getPath("b")).toEqual(["root", "b"]);

    undoManager.destroy();
  });

  it("does not let a new wrapper steal a child still claimed by its old parent", () => {
    const h = createHarness();
    h.set({
      root: structuralBlock("root", ["a"], BlockNodeType.root),
      a: editableBlock("a", "a"),
    });
    h.graph.build("root");

    h.yDoc.transact(() => {
      h.yBlockMap.set("wrapper", structuralBlock("wrapper", ["a"]));
      childrenOf(h, "root").insert(1, ["wrapper"]);
    });

    expect(h.graph.getChildrenIds("root")).toEqual(["a", "wrapper"]);
    expect(h.graph.getChildrenIds("wrapper")).toEqual([]);
    expect(h.graph.getParentId("a")).toBe("root");
    expect(h.graph.getPath("a")).toEqual(["root", "a"]);
    expect(h.logger.warn).toHaveBeenCalledWith(
      "BlockModelGraph: skip wrapper -> a: duplicate child reference",
    );
  });

  it("reprojects a skipped edge after its old owner becomes unreachable", () => {
    const h = createHarness();
    h.set({
      root: structuralBlock("root", ["winner", "old-ancestor"], BlockNodeType.root),
      winner: structuralBlock("winner", []),
      "old-ancestor": structuralBlock("old-ancestor", ["old-owner"]),
      "old-owner": structuralBlock("old-owner", ["leaf"]),
      leaf: editableBlock("leaf", "leaf"),
    });
    h.graph.build("root");
    let change: any;
    h.graph.structureChange$.subscribe(value => change = value);

    childrenOf(h, "winner").insert(0, ["leaf"]);

    expect(h.graph.getChildrenIds("winner")).toEqual([]);
    expect(h.graph.getPath("leaf")).toEqual([
      "root",
      "old-ancestor",
      "old-owner",
      "leaf",
    ]);

    childrenOf(h, "root").delete(1, 1);

    expect(h.graph.getChildrenIds("root")).toEqual(["winner"]);
    expect(h.graph.getChildrenIds("winner")).toEqual(["leaf"]);
    expect(h.graph.getPath("leaf")).toEqual(["root", "winner", "leaf"]);
    expect(h.graph.exists("old-ancestor")).toBeFalse();
    expect(h.graph.exists("old-owner")).toBeFalse();
    expect(change.reachableAddedIds).toEqual([]);
    expect(change.reachableRemovedIds).toEqual(["old-ancestor", "old-owner"]);
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
      affectedRootIds: ["orphan"],
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
    expect(changes[0].affectedRootIds).toEqual(
      jasmine.arrayWithExactContents(["left", "right"]),
    );
    expect(h.graph.getPath("leaf")).toEqual(["root", "right", "branch", "leaf"]);
  });

  it("reports the previous root owner when a nested branch is deleted", () => {
    const h = createHarness();
    h.set({
      root: structuralBlock("root", ["unit"], BlockNodeType.root),
      unit: structuralBlock("unit", ["container"]),
      container: structuralBlock("container", ["branch"]),
      branch: editableBlock("branch", "retained"),
    });
    h.graph.build("root");
    const changes: IBlockModelStructureChange[] = [];
    h.graph.structureChange$.subscribe(value => changes.push(value));

    (h.yBlockMap.get("container")!.get("children") as Y.Array<string>)
      .delete(0, 1);

    expect(changes[0].reachableRemovedIds).toEqual(["branch"]);
    expect(changes[0].affectedRootIds).toEqual(["unit"]);
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
    expect(change.affectedRootIds).toEqual(["branch"]);
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
      (paragraph.get("meta") as Y.Map<unknown>).set("lock", "user-1");
    });

    expect(next).not.toHaveBeenCalled();
    expect(h.graph.structureRevision).toBe(0);
  });

  it("completes every model signal exactly once on destroy", () => {
    const h = createHarness();
    h.set({root: structuralBlock("root", [], BlockNodeType.root)});
    h.graph.build("root");
    const structureComplete = jasmine.createSpy("structureComplete");
    const contentComplete = jasmine.createSpy("contentComplete");
    const textComplete = jasmine.createSpy("textComplete");
    h.graph.structureChange$.subscribe({complete: structureComplete});
    h.graph.contentChange$.subscribe({complete: contentComplete});
    h.graph.textChange$.subscribe({complete: textComplete});

    h.graph.destroy();
    h.graph.destroy();

    expect(structureComplete).toHaveBeenCalledTimes(1);
    expect(contentComplete).toHaveBeenCalledTimes(1);
    expect(textComplete).toHaveBeenCalledTimes(1);
  });
});

describe("BlockModelGraph nested structure stress", () => {
  interface OracleNode {
    id: string;
    parentId: string | null;
    children: string[];
    path: string[];
    nodeType: BlockNodeType;
  }

  class SeededRandom {
    constructor(private state: number) {}

    next(): number {
      this.state |= 0;
      this.state = (this.state + 0x6D2B79F5) | 0;
      let value = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
      value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    }

    int(max: number): number {
      return max <= 1 ? 0 : Math.floor(this.next() * max);
    }

    pick<T>(items: readonly T[]): T {
      return items[this.int(items.length)];
    }
  }

  function yChildren(
    h: ReturnType<typeof createHarness>,
    parentId: string,
  ): Y.Array<string> {
    const children = h.yBlockMap.get(parentId)?.get("children");
    if (!(children instanceof Y.Array)) {
      throw new Error(`Missing structural block: ${parentId}`);
    }
    return children;
  }

  function readOracle(
    h: ReturnType<typeof createHarness>,
    rootId = "root",
  ): Map<string, OracleNode> {
    const nodes = new Map<string, OracleNode>();
    const visit = (id: string, parentId: string | null, path: string[]) => {
      if (nodes.has(id)) throw new Error(`Duplicate or cyclic Yjs child: ${id}`);
      const block = h.yBlockMap.get(id);
      if (!block) throw new Error(`Dangling Yjs child: ${id}`);
      const nodeType = block.get("nodeType");
      const childrenValue = block.get("children");
      const children = childrenValue instanceof Y.Array
        ? childrenValue.toArray()
        : [];
      const nextPath = [...path, id];
      nodes.set(id, {id, parentId, children, path: nextPath, nodeType});
      children.forEach(childId => visit(childId, id, nextPath));
    };
    visit(rootId, null, []);
    return nodes;
  }

  function assertGraphMatchesYjs(
    h: ReturnType<typeof createHarness>,
    context: string,
  ): void {
    const oracle = readOracle(h);
    const allIds = [...h.yBlockMap.keys()].sort();
    const expected = allIds.map(id => {
      const node = oracle.get(id);
      return node
        ? {
            id,
            exists: true,
            parentId: node.parentId,
            children: node.children,
            path: node.path,
            index: node.parentId === null
              ? -1
              : oracle.get(node.parentId)!.children.indexOf(id),
          }
        : {
            id,
            exists: false,
            parentId: null,
            children: [],
            path: null,
            index: -1,
          };
    });
    const actual = allIds.map(id => ({
      id,
      exists: h.graph.exists(id),
      parentId: h.graph.getParentId(id),
      children: [...h.graph.getChildrenIds(id)],
      path: h.graph.getPath(id),
      index: h.graph.indexInParent(id),
    }));

    const mismatchIndex = actual.findIndex((value, index) =>
      JSON.stringify(value) !== JSON.stringify(expected[index])
    );
    if (mismatchIndex >= 0) {
      throw new Error(
        `${context}, block=${allIds[mismatchIndex]}\n` +
        `expected=${JSON.stringify(expected[mismatchIndex])}\n` +
        `actual=${JSON.stringify(actual[mismatchIndex])}`,
      );
    }
  }

  function isDescendant(
    oracle: ReadonlyMap<string, OracleNode>,
    candidateId: string,
    ancestorId: string,
  ): boolean {
    let current: string | null = candidateId;
    while (current !== null) {
      if (current === ancestorId) return true;
      current = oracle.get(current)?.parentId ?? null;
    }
    return false;
  }

  function descendantsOf(
    oracle: ReadonlyMap<string, OracleNode>,
    blockId: string,
  ): string[] {
    const result: string[] = [];
    const visit = (id: string) => {
      oracle.get(id)?.children.forEach(visit);
      result.push(id);
    };
    visit(blockId);
    return result;
  }

  function runNestedStress(seed: number, operationCount = 360): void {
    const h = createHarness();
    h.set({
      root: structuralBlock("root", ["left", "right", "p8", "p9"], BlockNodeType.root),
      left: structuralBlock("left", ["p0", "nested", "p3"]),
      nested: structuralBlock("nested", ["p1", "p2"]),
      right: structuralBlock("right", ["p4", "p5", "p6", "p7"]),
      ...Object.fromEntries(
        Array.from({length: 10}, (_, index) => [
          `p${index}`,
          editableBlock(`p${index}`, `paragraph:${index}`),
        ]),
      ),
    });
    h.graph.build("root");
    const undoManager = new Y.UndoManager(h.yBlockMap, {captureTimeout: 0});
    const random = new SeededRandom(seed);
    let nextId = 0;
    const operationTrace: string[] = [];

    const transact = (fn: () => void) => {
      undoManager.stopCapturing();
      h.yDoc.transact(fn);
    };

    const insertLeaf = (oracle: ReadonlyMap<string, OracleNode>) => {
      const containers = [...oracle.values()]
        .filter(node => node.nodeType !== BlockNodeType.editable && node.nodeType !== BlockNodeType.void);
      if (!containers.length || oracle.size >= 80) return false;
      const parent = random.pick(containers);
      const id = `leaf-${seed}-${nextId++}`;
      transact(() => {
        h.yBlockMap.set(id, editableBlock(id, id));
        const children = yChildren(h, parent.id);
        children.insert(random.int(children.length + 1), [id]);
      });
      return true;
    };

    const moveSubtree = (oracle: ReadonlyMap<string, OracleNode>) => {
      const movable = [...oracle.values()].filter(node => node.parentId !== null);
      if (!movable.length) return false;
      const block = random.pick(movable);
      const targets = [...oracle.values()].filter(node =>
        node.nodeType !== BlockNodeType.editable &&
        node.nodeType !== BlockNodeType.void &&
        node.id !== block.parentId &&
        !isDescendant(oracle, node.id, block.id),
      );
      if (!targets.length) return false;
      const target = random.pick(targets);
      const sourceChildren = yChildren(h, block.parentId!);
      const sourceIndex = sourceChildren.toArray().indexOf(block.id);
      if (sourceIndex < 0) return false;
      transact(() => {
        sourceChildren.delete(sourceIndex, 1);
        const targetChildren = yChildren(h, target.id);
        targetChildren.insert(random.int(targetChildren.length + 1), [block.id]);
      });
      return true;
    };

    const wrapSiblings = (oracle: ReadonlyMap<string, OracleNode>) => {
      const parents = [...oracle.values()].filter(node =>
        node.nodeType !== BlockNodeType.editable &&
        node.nodeType !== BlockNodeType.void &&
        node.children.length > 0,
      );
      if (!parents.length || oracle.size >= 80) return false;
      const parent = random.pick(parents);
      const start = random.int(parent.children.length);
      const count = 1 + random.int(Math.min(3, parent.children.length - start));
      const moved = parent.children.slice(start, start + count);
      const id = `container-${seed}-${nextId++}`;
      transact(() => {
        h.yBlockMap.set(id, structuralBlock(id, moved));
        const children = yChildren(h, parent.id);
        children.delete(start, count);
        children.insert(start, [id]);
      });
      return true;
    };

    const unwrapContainer = (oracle: ReadonlyMap<string, OracleNode>) => {
      const containers = [...oracle.values()].filter(node =>
        node.parentId !== null &&
        node.nodeType !== BlockNodeType.editable &&
        node.nodeType !== BlockNodeType.void,
      );
      if (!containers.length) return false;
      const container = random.pick(containers);
      const parentChildren = yChildren(h, container.parentId!);
      const index = parentChildren.toArray().indexOf(container.id);
      if (index < 0) return false;
      transact(() => {
        parentChildren.delete(index, 1);
        if (container.children.length) {
          parentChildren.insert(index, container.children);
        }
        h.yBlockMap.delete(container.id);
      });
      return true;
    };

    const deleteLeaf = (oracle: ReadonlyMap<string, OracleNode>) => {
      const leaves = [...oracle.values()].filter(node =>
        node.parentId !== null &&
        node.nodeType === BlockNodeType.editable &&
        oracle.size > 12,
      );
      if (!leaves.length) return false;
      const leaf = random.pick(leaves);
      const parentChildren = yChildren(h, leaf.parentId!);
      const index = parentChildren.toArray().indexOf(leaf.id);
      if (index < 0) return false;
      transact(() => {
        parentChildren.delete(index, 1);
        h.yBlockMap.delete(leaf.id);
      });
      return true;
    };

    const deleteSubtree = (oracle: ReadonlyMap<string, OracleNode>) => {
      const candidates = [...oracle.values()].filter(node =>
        node.parentId !== null &&
        node.nodeType !== BlockNodeType.editable &&
        node.nodeType !== BlockNodeType.void &&
        oracle.size - descendantsOf(oracle, node.id).length >= 10,
      );
      if (!candidates.length) return false;
      const block = random.pick(candidates);
      const parentChildren = yChildren(h, block.parentId!);
      const index = parentChildren.toArray().indexOf(block.id);
      if (index < 0) return false;
      const subtree = descendantsOf(oracle, block.id);
      transact(() => {
        parentChildren.delete(index, 1);
        subtree.forEach(id => h.yBlockMap.delete(id));
      });
      return true;
    };

    try {
      assertGraphMatchesYjs(h, `seed=${seed}, step=initial`);
      for (let step = 0; step < operationCount; step++) {
        const oracle = readOracle(h);
        const roll = random.next();
        let operation: string;
        if (roll < 0.18) {
          operation = `wrap:${wrapSiblings(oracle)}`;
        } else if (roll < 0.32) {
          operation = `unwrap:${unwrapContainer(oracle)}`;
        } else if (roll < 0.53) {
          operation = `move:${moveSubtree(oracle)}`;
        } else if (roll < 0.64) {
          operation = `insert:${insertLeaf(oracle)}`;
        } else if (roll < 0.73) {
          operation = `delete-leaf:${deleteLeaf(oracle)}`;
        } else if (roll < 0.80) {
          operation = `delete-subtree:${deleteSubtree(oracle)}`;
        } else if (roll < 0.93) {
          undoManager.undo();
          operation = "undo";
        } else {
          undoManager.redo();
          operation = "redo";
        }
        operationTrace.push(`${step}:${operation}`);
        assertGraphMatchesYjs(
          h,
          `seed=${seed}, step=${step}, trace=${operationTrace.slice(-8).join(" > ")}`,
        );
      }
      expect(h.logger.warn).withContext(`seed=${seed} warnings`).not.toHaveBeenCalled();
    } finally {
      undoManager.destroy();
      h.graph.destroy();
      h.yDoc.destroy();
    }
  }

  for (const seed of [0xC011AB1E, 0x51EC710, 0xB10C6A7]) {
    it(`keeps graph indexes aligned through nested structural churn (seed ${seed})`, () => {
      runNestedStress(seed);
    });
  }
});
