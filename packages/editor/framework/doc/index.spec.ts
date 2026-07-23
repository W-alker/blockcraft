import {BlockCraftDoc} from "./index";
import {fakeAsync, tick} from "@angular/core/testing";
import * as Y from "yjs";
import {BlockNodeType, NativeBlockModel, YBlock, native2YBlock} from "../block-std";
import {BehaviorSubject, Subject, Subscription} from "rxjs";

describe("BlockCraftDoc initialization state", () => {
  it("publishes configured readonly state before afterInit observers run", fakeAsync(() => {
    const rootDestroy$ = new Subject<void>();
    const readonlySwitch$ = new BehaviorSubject(true);
    let readonlySeenAfterInit: boolean | undefined;
    const root = {
      id: "root",
      hostElement: document.createElement("div"),
      onDestroy$: rootDestroy$,
    };
    const doc = Object.setPrototypeOf({
      _root: null,
      _scrollContainer: null,
      config: {readonly: false, theme: "light"},
      readonlySwitch$,
      afterInit$: new BehaviorSubject<any>(null),
      afterInitFnStack: new Set([
        () => { readonlySeenAfterInit = readonlySwitch$.value; },
      ]),
      _plugins: [],
      onDestroy$: new Subject<void>(),
      vm: {clear: jasmine.createSpy("clear")},
      event: {bindHotkey: jasmine.createSpy("bindHotkey")},
      crud: {
        undoManager: {
          undo: jasmine.createSpy("undo"),
          redo: jasmine.createSpy("redo"),
        },
      },
      virtualization: {init: jasmine.createSpy("init")},
      toggleTheme: jasmine.createSpy("toggleTheme"),
    }, BlockCraftDoc.prototype);

    (BlockCraftDoc.prototype as any)._initEditor.call(doc, root);

    expect(readonlySeenAfterInit).toBeFalse();
    expect(readonlySwitch$.value).toBeFalse();
    tick();
  }));
});

describe("BlockCraftDoc readonly violation feedback", () => {
  it("warns for user actions, ignores API calls and throttles repeated feedback", fakeAsync(() => {
    const violation$ = new Subject<{trigger: string}>();
    const subscriptions = new Subscription();
    const warn = jasmine.createSpy("warn");
    const doc = {
      readonlyManager: {violation$},
      messageService: {warn},
      _subscriptions: subscriptions,
    };

    (BlockCraftDoc.prototype as any)._bindReadonlyViolationFeedback.call(doc);

    violation$.next({trigger: "input"});
    violation$.next({trigger: "clipboard"});
    violation$.next({trigger: "drag"});
    expect(warn).toHaveBeenCalledOnceWith("内容已锁定，无法修改");

    tick(1_000);
    violation$.next({trigger: "undo"});
    expect(warn).toHaveBeenCalledTimes(2);

    tick(1_000);
    violation$.next({trigger: "api"});
    expect(warn).toHaveBeenCalledTimes(2);

    subscriptions.unsubscribe();
    violation$.next({trigger: "menu"});
    expect(warn).toHaveBeenCalledTimes(2);
  }));
});

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

  it("materializes the full snapshot model but creates only root view when virtualization is enabled", () => {
    const yDoc = new Y.Doc();
    const yBlockMap = yDoc.getMap<YBlock>("blocks");
    const snapshot = {
      ...rootSnapshot,
      children: [{
        id: "paragraph-1",
        flavour: "paragraph",
        nodeType: BlockNodeType.editable,
        props: {},
        meta: {},
        children: [{insert: "hello"}],
      }],
    } as any;
    const nativeElement = document.createElement("div");
    const rootRef = {instance: {id: "root"}, location: {nativeElement}};
    const calls: string[] = [];
    const doc = {
      _root: null,
      virtualization: {enabled: true},
      yBlockMap,
      vm: {
        createRootOnlyByYBlock: jasmine.createSpy("createRootOnlyByYBlock").and.callFake((yRoot: YBlock) => {
          calls.push(`create-root:${yRoot.get("id")}`);
          return rootRef;
        }),
        createComponentBySnapshot: jasmine.createSpy("createComponentBySnapshot"),
      },
      model: {
        build: jasmine.createSpy("build").and.callFake((rootId: string) => {
          calls.push(`build-model:${rootId}:${yBlockMap.size}`);
        }),
      },
      _initEditor: jasmine.createSpy("_initEditor"),
    };
    const container = document.createElement("div");

    BlockCraftDoc.prototype.initBySnapshot.call(doc, snapshot, container);

    expect(doc.vm.createComponentBySnapshot).not.toHaveBeenCalled();
    expect(doc.vm.createRootOnlyByYBlock).toHaveBeenCalledOnceWith(yBlockMap.get("root"));
    expect(yBlockMap.size).toBe(2);
    expect(yBlockMap.get("root")?.get("children").toArray()).toEqual(["paragraph-1"]);
    expect((yBlockMap.get("paragraph-1")?.get("children") as unknown as Y.Text).toDelta()).toEqual([{insert: "hello"}]);
    expect(calls).toEqual(["create-root:root", "build-model:root:2"]);
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

  it("uses root-only component creation when virtualization is enabled", () => {
    const yDoc = new Y.Doc();
    const yRoot = native2YBlock({
      id: "root",
      flavour: "root",
      nodeType: BlockNodeType.root,
      props: {},
      meta: {},
      children: [],
    } as NativeBlockModel);
    yDoc.getMap<YBlock>("blocks").set("root", yRoot);
    const nativeElement = document.createElement("div");
    const rootRef = {instance: {id: "root"}, location: {nativeElement}};
    const doc = {
      _root: null,
      virtualization: {enabled: true},
      vm: {
        createRootOnlyByYBlock: jasmine.createSpy("createRootOnlyByYBlock").and.returnValue(rootRef),
        createComponentByYBlocks: jasmine.createSpy("createComponentByYBlocks"),
      },
      crud: {pruneChildRefs: jasmine.createSpy("pruneChildRefs")},
      model: {build: jasmine.createSpy("build")},
      _initEditor: jasmine.createSpy("_initEditor"),
    };
    const container = document.createElement("div");

    BlockCraftDoc.prototype.initByYBlock.call(doc, yRoot, container);

    expect(doc.vm.createRootOnlyByYBlock).toHaveBeenCalledOnceWith(yRoot);
    expect(doc.vm.createComponentByYBlocks).not.toHaveBeenCalled();
    expect(doc.model.build).toHaveBeenCalledOnceWith("root");
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

  it("mounts an adjacent virtual view before resolving its component", () => {
    const next = {id: "next"};
    let mounted = false;
    const doc = asDoc({
      model: {
        exists: jasmine.createSpy("exists").and.returnValue(true),
        getNextSiblingId: jasmine.createSpy("getNextSiblingId").and.returnValue("next"),
      },
      virtualization: {
        ensureViewMounted: jasmine.createSpy("ensureViewMounted").and.callFake(() => {
          mounted = true;
        }),
      },
      getBlockById: jasmine.createSpy("getBlockById").and.callFake(() => {
        if (!mounted) throw new Error("view is not mounted");
        return next;
      }),
    });

    expect(BlockCraftDoc.prototype.nextSibling.call(doc, "offscreen")).toBe(next as any);
    expect(doc.virtualization.ensureViewMounted).toHaveBeenCalledOnceWith(["next"]);
    expect(doc.getBlockById).toHaveBeenCalledOnceWith("next");
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
