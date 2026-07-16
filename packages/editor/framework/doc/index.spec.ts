import {BlockCraftDoc} from "./index";
import * as Y from "yjs";
import {BlockNodeType, NativeBlockModel, YBlock, native2YBlock} from "../block-std";

describe("BlockCraftDoc position contract", () => {
  function component(id: string, hostElement: HTMLElement) {
    return {id, hostElement} as any;
  }

  it("matches compareDocumentPosition for same, sibling and nested blocks", () => {
    const root = document.createElement("div");
    const first = document.createElement("div");
    const nested = document.createElement("div");
    const second = document.createElement("div");
    first.append(nested);
    root.append(first, second);

    const elements: Record<string, HTMLElement> = {first, nested, second};
    const doc = Object.setPrototypeOf({
      model: {
        comparePosition: (aId: string, bId: string) =>
          elements[aId].compareDocumentPosition(elements[bId]),
      },
    }, BlockCraftDoc.prototype);

    const compare = (aId: string, bId: string) =>
      BlockCraftDoc.prototype.compareBlockPosition.call(
        doc,
        component(aId, elements[aId]),
        component(bId, elements[bId]),
      );

    expect(compare("first", "first")).toBe(first.compareDocumentPosition(first));
    expect(compare("first", "second")).toBe(first.compareDocumentPosition(second));
    expect(compare("second", "first")).toBe(second.compareDocumentPosition(first));
    expect(compare("first", "nested")).toBe(first.compareDocumentPosition(nested));
    expect(compare("nested", "first")).toBe(nested.compareDocumentPosition(first));
  });
});

describe("BlockCraftDoc model graph lifecycle", () => {
  const rootSnapshot = {
    id: "root",
    flavour: "root",
    nodeType: BlockNodeType.root,
    props: {},
    meta: {},
    children: [],
  } as any;

  it("builds the model after snapshot YBlocks and before editor initialization", () => {
    const calls: string[] = [];
    const nativeElement = document.createElement("div");
    const doc = {
      _root: null,
      yBlockMap: {
        set: () => calls.push("set-yblock"),
      },
      vm: {
        createComponentBySnapshot: (_snapshot: unknown, onCreate: (ref: any) => void) => {
          onCreate({instance: {id: "root", yBlock: {}}});
          return {instance: {id: "root"}, location: {nativeElement}};
        },
      },
      model: {
        build: (rootId: string) => calls.push(`build-model:${rootId}`),
      },
      _initEditor: () => calls.push("init-editor"),
    };
    const container = document.createElement("div");

    BlockCraftDoc.prototype.initBySnapshot.call(doc, rootSnapshot, container);

    expect(calls).toEqual(["set-yblock", "build-model:root", "init-editor"]);
    expect(container.firstElementChild).toBe(nativeElement);
  });

  it("builds the model after dangling YBlock references are pruned", () => {
    const yDoc = new Y.Doc();
    const yBlockMap = yDoc.getMap<YBlock>("blocks");
    const yRoot = native2YBlock({
      id: "root",
      flavour: "root",
      nodeType: BlockNodeType.root,
      props: {},
      meta: {},
      children: [],
    } as NativeBlockModel);
    yBlockMap.set("root", yRoot);
    const calls: string[] = [];
    const nativeElement = document.createElement("div");
    const rootRef = {instance: {id: "root"}, location: {nativeElement}};
    const doc = {
      _root: null,
      vm: {
        createComponentByYBlocks: (
          _blocks: unknown,
          onMissing: (parentId: string, childId: string) => void,
        ) => {
          onMissing("root", "missing");
          return {root: rootRef};
        },
      },
      crud: {
        pruneChildRefs: () => calls.push("prune"),
      },
      model: {
        build: (rootId: string) => calls.push(`build-model:${rootId}`),
      },
      _initEditor: () => calls.push("init-editor"),
    };
    const container = document.createElement("div");

    BlockCraftDoc.prototype.initByYBlock.call(doc, yRoot, container);

    expect(calls).toEqual(["prune", "build-model:root", "init-editor"]);
    expect(container.firstElementChild).toBe(nativeElement);
  });
});

describe("BlockCraftDoc model-backed reads", () => {
  function asDoc<T extends object>(doc: T): T {
    return Object.setPrototypeOf(doc, BlockCraftDoc.prototype);
  }

  it("gets an unmounted block path without resolving a component", () => {
    const doc = asDoc({
      model: {
        exists: jasmine.createSpy("exists").and.returnValue(true),
        getPath: jasmine.createSpy("getPath").and.returnValue(["root", "offscreen"]),
      },
      getBlockById: jasmine.createSpy("getBlockById").and.throwError("component lookup is forbidden"),
      queryAncestor: BlockCraftDoc.prototype.queryAncestor,
    });

    const path = BlockCraftDoc.prototype.getBlockPath.call(doc, "offscreen");

    expect(path).toEqual(["root", "offscreen"]);
    expect(doc.model.getPath).toHaveBeenCalledOnceWith("offscreen");
    expect(doc.getBlockById).not.toHaveBeenCalled();
  });

  it("reads sibling ids from the model for an unmounted block", () => {
    const doc = asDoc({
      model: {
        exists: jasmine.createSpy("exists").and.returnValue(true),
        getParentId: jasmine.createSpy("getParentId").and.returnValue("root"),
        getChildrenIds: jasmine.createSpy("getChildrenIds").and.returnValue(["a", "offscreen", "b"]),
      },
      getBlockById: jasmine.createSpy("getBlockById").and.throwError("component lookup is forbidden"),
    });

    const siblings = BlockCraftDoc.prototype.getBlockSiblingIds.call(doc, "offscreen");

    expect(siblings).toEqual(["a", "offscreen", "b"]);
    expect(doc.getBlockById).not.toHaveBeenCalled();
  });

  it("resolves sibling components only at the mounted API boundary", () => {
    const previous = {id: "previous"};
    const next = {id: "next"};
    const doc = asDoc({
      model: {
        exists: jasmine.createSpy("exists").and.returnValue(true),
        getPreviousSiblingId: jasmine.createSpy("getPreviousSiblingId").and.returnValue("previous"),
        getNextSiblingId: jasmine.createSpy("getNextSiblingId").and.returnValue("next"),
      },
      getBlockById: jasmine.createSpy("getBlockById").and.callFake((id: string) => {
        if (id === "previous") return previous;
        if (id === "next") return next;
        throw new Error(`unexpected component lookup: ${id}`);
      }),
    });

    expect(BlockCraftDoc.prototype.prevSibling.call(doc, "offscreen")).toBe(previous as any);
    expect(BlockCraftDoc.prototype.nextSibling.call(doc, "offscreen")).toBe(next as any);
    expect(doc.getBlockById).toHaveBeenCalledTimes(2);
  });

  it("delegates position and interval calculations to the model", () => {
    const doc = asDoc({
      model: {
        exists: jasmine.createSpy("exists").and.returnValue(true),
        comparePosition: jasmine.createSpy("comparePosition").and.returnValue(4),
        queryBetween: jasmine.createSpy("queryBetween").and.returnValue(["middle"]),
      },
      getBlockById: jasmine.createSpy("getBlockById").and.throwError("component lookup is forbidden"),
    });

    expect(BlockCraftDoc.prototype.compareBlockPosition.call(doc, "from", "to")).toBe(4);
    expect(BlockCraftDoc.prototype.queryBlocksBetween.call(doc, "from", "to", true)).toEqual(["middle"]);
    expect(doc.model.comparePosition).toHaveBeenCalledOnceWith("from", "to");
    expect(doc.model.queryBetween).toHaveBeenCalledOnceWith("from", "to", true);
    expect(doc.getBlockById).not.toHaveBeenCalled();
  });

  it("exports the model snapshot and preserves the undefined fallback", () => {
    const snapshot = {id: "root"};
    const doc = asDoc({
      rootId: "root",
      model: {
        toSnapshot: jasmine.createSpy("toSnapshot").and.returnValues(snapshot, null),
      },
      vm: {
        get: jasmine.createSpy("get").and.throwError("component lookup is forbidden"),
      },
    });

    expect(BlockCraftDoc.prototype.exportSnapshot.call(doc)).toBe(snapshot as any);
    expect(BlockCraftDoc.prototype.exportSnapshot.call(doc)).toBeUndefined();
    expect(doc.model.toSnapshot).toHaveBeenCalledTimes(2);
    expect(doc.vm.get).not.toHaveBeenCalled();
  });
});

describe("BlockCraftDoc path queries", () => {
  function block(id: string, parentId: string | null, childrenIds: string[] = []) {
    return {
      id,
      parentId,
      childrenIds,
    } as any;
  }

  function createDoc(blocks: Record<string, any>) {
    return {
      getBlockById: (id: string) => blocks[id],
      getBlockPath: (target: any) => {
        const result: string[] = [];
        let current = typeof target === "string" ? blocks[target] : target;
        while (current) {
          result.unshift(current.id);
          current = current.parentId ? blocks[current.parentId] : null;
        }
        return result;
      },
    };
  }

  function expectSegment(
    through: ReturnType<BlockCraftDoc["queryBlocksThroughPathDeeply"]>,
    parent: string,
    index: number,
    group: string[],
  ) {
    expect(through).toContain(jasmine.objectContaining({
      parent,
      index,
      length: group.length,
      group,
    }));
  }

  function expectSegmentsHaveConsistentLength(
    through: ReturnType<BlockCraftDoc["queryBlocksThroughPathDeeply"]>,
  ) {
    through.forEach(segment => {
      expect(segment.length).toBe(segment.group.length);
      expect(segment.length).toBeGreaterThanOrEqual(0);
    });
  }

  it("includes nested siblings on both endpoints and the middle ancestor group", () => {
    const root = block("root", null, ["columns-1"]);
    const columns = block("columns-1", "root", ["column-1", "column-2", "column-3"]);
    const column1 = block("column-1", "columns-1", ["start-p", "after-start-a", "after-start-b"]);
    const column2 = block("column-2", "columns-1", ["middle-p"]);
    const column3 = block("column-3", "columns-1", ["before-end-a", "before-end-b", "end-p"]);
    const startParagraph = block("start-p", "column-1");
    const afterStartA = block("after-start-a", "column-1");
    const afterStartB = block("after-start-b", "column-1");
    const middleParagraph = block("middle-p", "column-2");
    const beforeEndA = block("before-end-a", "column-3");
    const beforeEndB = block("before-end-b", "column-3");
    const endParagraph = block("end-p", "column-3");
    const blocks: Record<string, any> = {
      root,
      "columns-1": columns,
      "column-1": column1,
      "column-2": column2,
      "column-3": column3,
      "start-p": startParagraph,
      "after-start-a": afterStartA,
      "after-start-b": afterStartB,
      "middle-p": middleParagraph,
      "before-end-a": beforeEndA,
      "before-end-b": beforeEndB,
      "end-p": endParagraph,
    };
    const doc = createDoc(blocks);

    const through = BlockCraftDoc.prototype.queryBlocksThroughPathDeeply.call(
      doc,
      startParagraph,
      endParagraph,
    );

    expectSegmentsHaveConsistentLength(through);
    expectSegment(through, "column-1", 1, ["after-start-a", "after-start-b"]);
    expectSegment(through, "column-3", 0, ["before-end-a", "before-end-b"]);
    expectSegment(through, "columns-1", 1, ["column-2"]);
  });

  it("keeps adjacent endpoint paths as empty non-negative segments", () => {
    const root = block("root", null, ["columns-1"]);
    const columns = block("columns-1", "root", ["column-1", "column-2"]);
    const column1 = block("column-1", "columns-1", ["start-p"]);
    const column2 = block("column-2", "columns-1", ["end-p"]);
    const startParagraph = block("start-p", "column-1");
    const endParagraph = block("end-p", "column-2");
    const blocks: Record<string, any> = {
      root,
      "columns-1": columns,
      "column-1": column1,
      "column-2": column2,
      "start-p": startParagraph,
      "end-p": endParagraph,
    };
    const doc = createDoc(blocks);

    const through = BlockCraftDoc.prototype.queryBlocksThroughPathDeeply.call(
      doc,
      startParagraph,
      endParagraph,
    );

    expectSegmentsHaveConsistentLength(through);
    expectSegment(through, "columns-1", 1, []);
  });
});
