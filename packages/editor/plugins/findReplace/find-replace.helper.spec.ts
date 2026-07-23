import {BlockNodeType} from "../../framework";
import {FindReplaceHelper} from "./find-replace.helper";
import {Subject} from "rxjs";

describe("FindReplaceHelper virtualized model reads", () => {
  const flushNextTick = async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
    await Promise.resolve();
  };

  const makeModelHarness = () => {
    const textById = new Map([
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
    const createFakeRange = jasmine.createSpy("createFakeRange").and.returnValue({
      setColor: jasmine.createSpy("setColor"),
      destroy: jasmine.createSpy("destroy"),
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
      readonlyManager: {isReadonly: () => false},
      crud: {
        transact: (fn: () => void) => fn(),
        applyTextDelta,
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
      createFakeRange,
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
    const fakeRange = {
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

    expect(() => helper.findAll("a")).not.toThrow();

    expect(helper.matchedList.length).toBe(1);
    expect(helper.matchedBlockMap.get("p1")?.length).toBe(1);
    expect(fakeRange.setColor).toHaveBeenCalledOnceWith({bgColor: "rgba(245, 74, 69, .4)"});
    expect(hostElement.scrollIntoView).toHaveBeenCalledTimes(1);
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
