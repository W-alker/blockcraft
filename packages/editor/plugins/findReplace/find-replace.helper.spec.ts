import {BlockNodeType} from "../../framework";
import {FindReplaceHelper} from "./find-replace.helper";
import {Subject} from "rxjs";

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
    const doc = {
      root: {
        childrenIds: ["p1"],
        getChildrenBlocks: () => [block],
      },
      getBlockById: (id: string) => {
        if (id !== "p1") throw new Error(`unknown block ${id}`);
        return block;
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
    const onTextUpdate$ = new Subject<any>();
    const block = {
      id: "p1",
      nodeType: BlockNodeType.editable,
      hostElement,
      parentId: "root",
      childrenIds: [],
      textDeltas: () => [{insert: "aba"}],
    };
    const doc = {
      root: {
        id: "root",
        childrenIds: ["p1"],
        getChildrenBlocks: () => [block],
      },
      getBlockById: (id: string) => {
        if (id !== "p1") throw new Error(`unknown block ${id}`);
        return block;
      },
      isEditable: (target: any) => target === block,
      onChildrenUpdate$: new Subject<any>(),
      onTextUpdate$,
      selection: {
        createFakeRange,
      },
    };
    const helper = new FindReplaceHelper(doc as any);
    helper.listen();
    helper.findAll("a");
    createFakeRange.calls.reset();

    onTextUpdate$.next({transactions: [{block}]});
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
      getBlockById: jasmine.createSpy("getBlockById").and.throwError("missing"),
      isEditable: jasmine.createSpy("isEditable").and.returnValue(true),
      crud: {
        transact: jasmine.createSpy("transact").and.callFake((fn: () => void) => fn()),
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
      getBlockById: jasmine.createSpy("getBlockById").and.throwError("missing"),
      isEditable: jasmine.createSpy("isEditable").and.returnValue(true),
      crud: {
        transact: jasmine.createSpy("transact").and.callFake((fn: () => void) => fn()),
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
