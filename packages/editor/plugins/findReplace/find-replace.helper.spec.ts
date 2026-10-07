import {BlockNodeType, DeltaInsert} from "../../framework";
import {FindReplaceHelper} from "./find-replace.helper";
import {Subject} from "rxjs";

describe("FindReplaceHelper virtualized model reads", () => {
  const flushNextTick = async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
    await Promise.resolve();
  };

  const makeModelHarness = () => {
    const textById = new Map<string, DeltaInsert[]>([
      ["p1", [{insert: "first needle"}]],
      ["p2", [{insert: "second needle"}]],
    ]);
    const rootOrder = ["p1", "p2"];
    const mounted = new Map<string, any>();
    const ensureViewMounted = jasmine.createSpy("ensureViewMounted").and.callFake((ids: string[]) => {
      ids.forEach(id => {
        if (mounted.has(id)) return;
        const hostElement = document.createElement("p");
        hostElement.dataset["blockId"] = id;
        spyOn(hostElement, "scrollIntoView");
        document.body.appendChild(hostElement);
        mounted.set(id, {
          id,
          nodeType: BlockNodeType.editable,
          hostElement,
        });
      });
    });
    const scrollToBlock = jasmine.createSpy("scrollToBlock").and.returnValue(Promise.resolve(true));
    const textChange$ = new Subject<any>();
    const structureChange$ = new Subject<any>();
    const viewChange$ = new Subject<any>();
    const readonlyStateChange$ = new Subject<void>();
    const fakeRanges: Array<{fragment: HTMLElement}> = [];
    const createFakeRange = jasmine.createSpy("createFakeRange").and.callFake((selection: any) => {
      const overlay = document.createElement("span");
      const fragment = document.createElement("span");
      spyOn(fragment, "scrollIntoView");
      overlay.appendChild(fragment);
      mounted.get(selection.from.blockId)?.hostElement.appendChild(overlay);
      fakeRanges.push({fragment});
      return {
        fakeSpans: [overlay],
        setColor: jasmine.createSpy("setColor"),
        destroy: jasmine.createSpy("destroy"),
      };
    });
    const applyTextDelta = jasmine.createSpy("applyTextDelta");
    const doc = {
      rootId: "root",
      model: {
        textChange$,
        structureChange$,
        exists: (id: string) => id === "root" || textById.has(id),
        getChildrenIds: (id: string) => id === "root" ? [...rootOrder] : [],
        getNodeType: (id: string) => id === "root" ? BlockNodeType.root : BlockNodeType.editable,
        getTextDeltas: (id: string) => textById.get(id),
      },
      vm: {
        get: (id: string) => {
          const instance = mounted.get(id);
          return instance ? {instance} : undefined;
        },
        isMounted: (id: string) => mounted.has(id),
        getMountedRootChildIds: () => [...mounted.keys()],
      },
      virtualization: {
        enabled: true,
        ensureViewMounted,
        scrollToBlock,
        viewChange$,
      },
      getBlockById: (id: string) => {
        const block = mounted.get(id);
        if (!block) throw new Error(`unmounted block ${id}`);
        return block;
      },
      selection: {createFakeRange},
      readonlyManager: {isReadonly: (_id: string) => false, stateChange$: readonlyStateChange$},
      crud: {
        transact: (fn: () => void) => fn(),
        applyTextDelta,
        replaceText: jasmine.createSpy("replaceText"),
      },
      scrollContainer: null,
    };
    const helper = new FindReplaceHelper(doc as any);

    return {
      helper,
      doc,
      textById,
      rootOrder,
      mounted,
      ensureViewMounted,
      scrollToBlock,
      textChange$,
      structureChange$,
      viewChange$,
      readonlyStateChange$,
      createFakeRange,
      fakeRanges,
      applyTextDelta,
      cleanup: () => mounted.forEach(block => block.hostElement.remove()),
    };
  };

  it("searches the complete model and materializes only the current match", () => {
    const h = makeModelHarness();

    h.helper.findAll("needle");

    expect(h.helper.matchedList.map(match => match.blockId)).toEqual(["p1", "p2"]);
    expect(h.ensureViewMounted).toHaveBeenCalledOnceWith(["p1"]);
    expect(h.mounted.has("p1")).toBeTrue();
    expect(h.mounted.has("p2")).toBeFalse();
    expect(h.createFakeRange).toHaveBeenCalledTimes(1);
    expect(h.scrollToBlock).toHaveBeenCalledOnceWith("p1");
    expect(h.mounted.get("p1").hostElement.scrollIntoView).not.toHaveBeenCalled();
    h.cleanup();
  });

  it("navigates to the next unmounted match through stable block navigation", () => {
    const h = makeModelHarness();
    h.helper.findAll("needle");
    h.ensureViewMounted.calls.reset();
    h.scrollToBlock.calls.reset();

    h.helper.findNext();

    expect(h.helper.matchedList[h.helper.matchIndex].blockId).toBe("p2");
    expect(h.ensureViewMounted).toHaveBeenCalledOnceWith(["p2"]);
    expect(h.scrollToBlock).toHaveBeenCalledOnceWith("p2");
    expect(h.mounted.get("p2").hostElement.scrollIntoView).not.toHaveBeenCalled();
    h.cleanup();
  });

  it("refines virtual block navigation to the active rendered match", async () => {
    const h = makeModelHarness();

    h.helper.findAll("needle");
    await h.scrollToBlock.calls.mostRecent().returnValue;
    await Promise.resolve();

    expect(h.fakeRanges[0].fragment.scrollIntoView).toHaveBeenCalledOnceWith({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    });
    expect(h.mounted.get("p1").hostElement.scrollIntoView).not.toHaveBeenCalled();
    h.cleanup();
  });

  it("moves directly between matches in the same mounted paragraph", async () => {
    const h = makeModelHarness();
    h.textById.set("p1", [{insert: "first needle then needle"}]);
    h.textById.set("p2", [{insert: "second"}]);

    h.helper.findAll("needle");
    await h.scrollToBlock.calls.mostRecent().returnValue;
    await Promise.resolve();
    h.scrollToBlock.calls.reset();

    h.helper.findNext();

    expect(h.helper.matchedList[h.helper.matchIndex].blockId).toBe("p1");
    expect(h.scrollToBlock).not.toHaveBeenCalled();
    expect(h.fakeRanges[1].fragment.scrollIntoView).toHaveBeenCalledOnceWith({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    });
    h.cleanup();
  });

  it("refreshes an unmounted match from model text changes", async () => {
    const h = makeModelHarness();
    h.textById.set("p2", [{insert: "second"}]);
    h.helper.listen();
    h.helper.findAll("needle");
    expect(h.helper.matchedList.map(match => match.blockId)).toEqual(["p1"]);
    h.ensureViewMounted.calls.reset();

    h.textById.set("p2", [{insert: "second needle"}]);
    h.textChange$.next({blockIds: ["p2"]});
    await flushNextTick();

    expect(h.helper.matchedList.map(match => match.blockId)).toEqual(["p1", "p2"]);
    expect(h.ensureViewMounted).not.toHaveBeenCalledWith(["p2"]);
    h.helper.destroy();
    h.cleanup();
  });

  it("replaces all model matches without materializing their views", () => {
    const h = makeModelHarness();
    h.helper.findAll("needle");
    h.ensureViewMounted.calls.reset();

    h.helper.replaceAll("value");

    expect(h.applyTextDelta).toHaveBeenCalledTimes(2);
    expect(h.applyTextDelta.calls.argsFor(0)[0]).toBe("p1");
    expect(h.applyTextDelta.calls.argsFor(1)[0]).toBe("p2");
    expect(h.ensureViewMounted).not.toHaveBeenCalled();
    h.cleanup();
  });

  it("finds formatted text and atomic mention labels in model order", () => {
    const h = makeModelHarness();
    h.textById.set("p1", [
      {insert: "nee"}, {insert: "dle", attributes: {"b:bold": true}},
      {insert: {mention: "needle needle"}},
      {insert: {latex: "needle"}},
      {insert: "needle"},
    ]);
    h.textById.set("p2", [{insert: {mention: "NEEDLE"}}]);
    h.helper.toggleFlag(h.helper.regFlagList[0]);
    h.helper.findAll("needle");

    expect(h.helper.matchedList.map(m => [m.blockId, m.index, m.length, m.replaceable])).toEqual([
      ["p1", 0, 6, true], ["p1", 6, 1, false], ["p1", 8, 6, true], ["p2", 0, 1, false],
    ]);
    expect(h.mounted.has("p2")).toBeFalse();
    h.helper.findNext();
    expect(h.createFakeRange.calls.mostRecent().args[0].from).toEqual({
      blockId: "p1", index: 6, length: 1, type: "text",
    });
    h.helper.replaceOne("value");
    expect(h.doc.crud.replaceText).not.toHaveBeenCalled();
    h.helper.findNext();
    h.helper.replaceOne("value");
    expect(h.doc.crud.replaceText).toHaveBeenCalledOnceWith("p1", 8, 6, "value");
    h.helper.destroy();
    h.cleanup();
  });

  it("reports protected counts and reasons and refreshes them when permissions change", () => {
    const h = makeModelHarness();
    h.textById.set("p1", [{insert: {mention: "needle"}}]);
    h.helper.listen();
    h.helper.findAll("needle");
    expect(h.helper.nonReplaceableCount).toBe(1);
    expect(h.helper.nonReplaceableTooltip).toContain("1 项：Mention 是引用节点");
    expect(h.helper.hasReplaceableMatches).toBeTrue();

    h.doc.readonlyManager.isReadonly = id => id === "p2";
    h.readonlyStateChange$.next();
    expect(h.helper.nonReplaceableCount).toBe(2);
    expect(h.helper.nonReplaceableTooltip).toContain("1 项：所在内容为只读或已锁定");
    expect(h.helper.hasReplaceableMatches).toBeFalse();
    h.helper.findNext();
    h.helper.replaceOne("x");
    h.helper.replaceAll("x");
    expect(h.doc.crud.replaceText).not.toHaveBeenCalled();
    expect(h.applyTextDelta).not.toHaveBeenCalled();

    h.doc.readonlyManager.isReadonly = () => false;
    h.readonlyStateChange$.next();
    expect(h.helper.nonReplaceableCount).toBe(1);
    expect(h.helper.matchedList[1].replaceDisabledReason).toBeUndefined();
    h.helper.clearAll();
    expect(h.helper.nonReplaceableCount).toBe(0);
    expect(h.helper.nonReplaceableTooltip).toBe("");
    h.helper.destroy();
    h.cleanup();
  });

  it("does not match across mention boundaries or interpret regex characters", () => {
    const h = makeModelHarness();
    h.textById.set("p1", [{insert: "before"}, {insert: {mention: "A.B"}}, {insert: "after"}]);
    for (const query of ["beforeA", "Bafter", "A+B", "a.b"]) {
      h.helper.findAll(query);
      expect(h.helper.matchedList).toEqual([]);
    }
    h.helper.findAll("A.B");
    expect(h.helper.matchedList.length).toBe(1);
    expect(h.helper.hasReplaceableMatches).toBeFalse();
    h.helper.replaceAll("x");
    expect(h.applyTextDelta).not.toHaveBeenCalled();
    expect(h.helper.matchedList.length).toBe(1);
    h.helper.destroy();
    h.cleanup();
  });

  it("replaces text around mentions and keeps unchanged mention-only results", () => {
    const h = makeModelHarness();
    h.textById.set("p1", [{insert: "needle"}, {insert: {mention: "needle"}}, {insert: "needle"}]);
    h.textById.set("p2", [{insert: {mention: "needle"}}]);
    h.helper.findAll("needle");
    h.ensureViewMounted.calls.reset();
    h.helper.replaceAll("x");
    expect(h.applyTextDelta).toHaveBeenCalledOnceWith("p1", [
      {delete: 6}, {insert: "x"}, {retain: 1}, {delete: 6}, {insert: "x"},
    ]);
    expect(h.helper.matchedList.map(m => m.blockId)).toEqual(["p2"]);
    expect(h.ensureViewMounted).not.toHaveBeenCalled();
    h.helper.destroy();
    h.cleanup();
  });

  it("protects an embed inserted before the search refresh runs", () => {
    const h = makeModelHarness();
    h.helper.findAll("needle");
    h.textById.set("p1", [{insert: "first "}, {insert: {mention: "needle"}}, {insert: "....."}]);
    h.helper.replaceOne("x");
    expect(h.doc.crud.replaceText).not.toHaveBeenCalled();
    h.helper.replaceAll("");
    expect(h.applyTextDelta).toHaveBeenCalledOnceWith("p2", [{retain: 7}, {delete: 6}]);
    h.helper.destroy();
    h.cleanup();
  });

  it("refreshes changed mention labels without mounting their virtual views", async () => {
    const h = makeModelHarness();
    h.textById.set("p2", [{insert: {mention: "other"}}]);
    h.helper.listen();
    h.helper.findAll("needle");
    h.ensureViewMounted.calls.reset();
    h.textById.set("p2", [{insert: {mention: "needle"}}]);
    h.textChange$.next({blockIds: ["p2"]});
    await flushNextTick();
    expect(h.helper.matchedList.map(m => [m.blockId, m.replaceable])).toEqual([
      ["p1", true], ["p2", false],
    ]);
    expect(h.ensureViewMounted).not.toHaveBeenCalledWith(["p2"]);
    h.helper.destroy();
    h.cleanup();
  });

  it("observes matched blocks when their virtual root window mounts", () => {
    const h = makeModelHarness();
    const observeBlock = spyOn<any>(h.helper, "_observeBlock").and.callThrough();
    h.helper.listen();
    h.helper.findAll("needle");
    observeBlock.calls.reset();

    h.ensureViewMounted(["p2"]);
    h.viewChange$.next({mountedRootIds: ["p2"]});

    expect(observeBlock).toHaveBeenCalledOnceWith(h.mounted.get("p2"));
    h.helper.destroy();
    h.cleanup();
  });

  it("keeps the active model match when structure changes before it", async () => {
    const h = makeModelHarness();
    h.helper.listen();
    h.helper.findAll("needle");
    h.helper.matchIndex = 1;

    h.textById.set("p0", [{insert: "new needle"}]);
    h.rootOrder.unshift("p0");
    h.structureChange$.next({});
    await flushNextTick();

    expect(h.helper.matchedList[h.helper.matchIndex].blockId).toBe("p2");
    h.helper.destroy();
    h.cleanup();
  });
});

describe("FindReplaceHelper stale fake range handling", () => {
  const makeHarness = (createFakeRange: jasmine.Spy) => {
    const hostElement = document.createElement("p");
    hostElement.setAttribute("data-block-id", "p1");
    spyOn(hostElement, "scrollIntoView");
    document.body.appendChild(hostElement);

    const block = {
      id: "p1",
      nodeType: BlockNodeType.editable,
      hostElement,
      childrenIds: [],
      textDeltas: () => [{insert: "aba"}],
    };
    const structureChange$ = new Subject<any>();
    const textChange$ = new Subject<any>();
    const doc = {
      rootId: "root",
      root: {
        childrenIds: ["p1"],
        getChildrenBlocks: () => [block],
      },
      getBlockById: (id: string) => {
        if (id !== "p1") throw new Error(`unknown block ${id}`);
        return block;
      },
      model: {
        structureChange$,
        textChange$,
        exists: (id: string) => id === "root" || id === "p1",
        getChildrenIds: (id: string) => id === "root" ? ["p1"] : [],
        getNodeType: (id: string) => id === "root" ? BlockNodeType.root : BlockNodeType.editable,
        getTextDeltas: (id: string) => id === "p1" ? block.textDeltas() : undefined,
      },
      vm: {
        get: (id: string) => id === "p1" ? {instance: block} : undefined,
      },
      virtualization: {
        enabled: false,
        ensureViewMounted: jasmine.createSpy("ensureViewMounted"),
      },
      selection: {
        createFakeRange,
      },
    };
    const helper = new FindReplaceHelper(doc as any);

    return {helper, block, hostElement};
  };

  it("drops matches whose fake range can no longer be created", () => {
    const createFakeRange = jasmine.createSpy("createFakeRange").and.throwError("stale block");
    const {helper, hostElement} = makeHarness(createFakeRange);

    expect(() => helper.findAll("a")).not.toThrow();

    expect(createFakeRange).toHaveBeenCalledTimes(2);
    expect(helper.matchedList).toEqual([]);
    expect(helper.matchedBlockMap.size).toBe(0);
    expect(hostElement.scrollIntoView).not.toHaveBeenCalled();
    hostElement.remove();
  });

  it("continues to the next match when the current fake range is stale", () => {
    const overlay = document.createElement("span");
    const fragments = Array.from({length: 3}, () => {
      const fragment = document.createElement("span");
      spyOn(fragment, "scrollIntoView");
      overlay.appendChild(fragment);
      return fragment;
    });
    const fakeRange = {
      fakeSpans: [overlay],
      setColor: jasmine.createSpy("setColor"),
      destroy: jasmine.createSpy("destroy"),
    };
    let callCount = 0;
    const createFakeRange = jasmine.createSpy("createFakeRange").and.callFake(() => {
      callCount++;
      if (callCount === 1) throw new Error("stale block");
      return fakeRange;
    });
    const {helper, hostElement} = makeHarness(createFakeRange);
    hostElement.appendChild(overlay);

    expect(() => helper.findAll("a")).not.toThrow();

    expect(helper.matchedList.length).toBe(1);
    expect(helper.matchedBlockMap.get("p1")?.length).toBe(1);
    expect(fakeRange.setColor).toHaveBeenCalledOnceWith({bgColor: "rgba(245, 74, 69, .4)"});
    expect(fragments[1].scrollIntoView).toHaveBeenCalledOnceWith({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    });
    expect(fragments[0].scrollIntoView).not.toHaveBeenCalled();
    expect(fragments[2].scrollIntoView).not.toHaveBeenCalled();
    expect(hostElement.scrollIntoView).not.toHaveBeenCalled();
    hostElement.remove();
  });

  it("does not recreate fake ranges from a pending text update after destroy", async () => {
    const hostElement = document.createElement("p");
    spyOn(hostElement, "scrollIntoView");
    document.body.appendChild(hostElement);

    const fakeRange = {
      setColor: jasmine.createSpy("setColor"),
      destroy: jasmine.createSpy("destroy"),
    };
    const createFakeRange = jasmine.createSpy("createFakeRange").and.returnValue(fakeRange);
    const textChange$ = new Subject<any>();
    const structureChange$ = new Subject<any>();
    const viewChange$ = new Subject<any>();
    const block = {
      id: "p1",
      nodeType: BlockNodeType.editable,
      hostElement,
      parentId: "root",
      childrenIds: [],
      textDeltas: () => [{insert: "aba"}],
    };
    const doc = {
      rootId: "root",
      root: {
        id: "root",
        childrenIds: ["p1"],
        getChildrenBlocks: () => [block],
      },
      getBlockById: (id: string) => {
        if (id !== "p1") throw new Error(`unknown block ${id}`);
        return block;
      },
      model: {
        structureChange$,
        textChange$,
        exists: (id: string) => id === "root" || id === "p1",
        getChildrenIds: (id: string) => id === "root" ? ["p1"] : [],
        getNodeType: (id: string) => id === "root" ? BlockNodeType.root : BlockNodeType.editable,
        getTextDeltas: (id: string) => id === "p1" ? block.textDeltas() : undefined,
      },
      vm: {
        get: (id: string) => id === "p1" ? {instance: block} : undefined,
        isMounted: (id: string) => id === "p1",
        getMountedRootChildIds: () => ["p1"],
      },
      virtualization: {
        enabled: false,
        ensureViewMounted: jasmine.createSpy("ensureViewMounted"),
        viewChange$,
      },
      isEditable: (target: any) => target === block,
      selection: {
        createFakeRange,
      },
    };
    const helper = new FindReplaceHelper(doc as any);
    helper.listen();
    helper.findAll("a");
    createFakeRange.calls.reset();

    textChange$.next({blockIds: ["p1"]});
    helper.destroy();
    await new Promise(resolve => setTimeout(resolve, 0));
    await Promise.resolve();

    expect(createFakeRange).not.toHaveBeenCalled();
    hostElement.remove();
  });

  it("does not replace one match when the matched block became stale", () => {
    const block = {
      id: "p1",
      yText: {
        delete: jasmine.createSpy("delete"),
        insert: jasmine.createSpy("insert"),
      },
    };
    const doc = {
      model: {
        exists: () => false,
        getNodeType: () => undefined,
      },
      vm: {get: () => undefined},
      virtualization: {enabled: true, ensureViewMounted: jasmine.createSpy("ensureViewMounted")},
      getBlockById: jasmine.createSpy("getBlockById").and.throwError("missing"),
      isEditable: jasmine.createSpy("isEditable").and.returnValue(true),
      crud: {
        transact: jasmine.createSpy("transact").and.callFake((fn: () => void) => fn()),
        replaceText: jasmine.createSpy("replaceText"),
      },
      selection: {
        createFakeRange: jasmine.createSpy("createFakeRange"),
      },
    };
    const helper = new FindReplaceHelper(doc as any);
    const match = {
      block: block as any,
      index: 0,
      length: 1,
      fakeRange: null,
    };
    helper.matchedList = [match];
    helper.matchedBlockMap.set("p1", [match]);

    expect(() => helper.replaceOne("x")).not.toThrow();

    expect(doc.crud.transact).not.toHaveBeenCalled();
    expect(block.yText.delete).not.toHaveBeenCalled();
    expect(block.yText.insert).not.toHaveBeenCalled();
    expect(helper.matchedList).toEqual([]);
    expect(helper.matchedBlockMap.size).toBe(0);
  });

  it("does not throw while replacing all when a matched block became stale", () => {
    const block = {
      id: "p1",
      applyDeltaOperations: jasmine.createSpy("applyDeltaOperations"),
    };
    const doc = {
      model: {
        exists: () => false,
        getNodeType: () => undefined,
      },
      vm: {get: () => undefined},
      virtualization: {enabled: true, ensureViewMounted: jasmine.createSpy("ensureViewMounted")},
      getBlockById: jasmine.createSpy("getBlockById").and.throwError("missing"),
      isEditable: jasmine.createSpy("isEditable").and.returnValue(true),
      crud: {
        transact: jasmine.createSpy("transact").and.callFake((fn: () => void) => fn()),
        applyTextDelta: jasmine.createSpy("applyTextDelta"),
      },
    };
    const helper = new FindReplaceHelper(doc as any);
    const match = {
      block: block as any,
      index: 0,
      length: 1,
      fakeRange: null,
    };
    helper.matchedList = [match];
    helper.matchedBlockMap.set("p1", [match]);

    expect(() => helper.replaceAll("x")).not.toThrow();

    expect(doc.crud.transact).toHaveBeenCalled();
    expect(doc.isEditable).not.toHaveBeenCalled();
    expect(block.applyDeltaOperations).not.toHaveBeenCalled();
    expect(helper.matchedList).toEqual([]);
    expect(helper.matchedBlockMap.size).toBe(0);
  });
});
