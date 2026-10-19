import {fakeAsync, flushMicrotasks} from "@angular/core/testing";
import {MentionPlugin} from "./index";

describe("MentionPlugin async cursor restore", () => {
  let originalScheduler: unknown;

  const createPlugin = (block: any) => {
    const plugin = new MentionPlugin({panel: null as any});
    const doc = {
      vm: {
        get: jasmine.createSpy("get").and.returnValue(block),
      },
      getBlockById: jasmine.createSpy("getBlockById").and.returnValue(block),
      selection: {
        setCursorAt: jasmine.createSpy("setCursorAt"),
      },
    };
    (plugin as any).doc = doc;
    return {plugin, doc};
  };

  beforeEach(() => {
    originalScheduler = (window as any).scheduler;
    (window as any).scheduler = {
      yield: jasmine.createSpy("yield").and.returnValue(Promise.resolve()),
    };
  });

  afterEach(() => {
    if (originalScheduler === undefined) {
      delete (window as any).scheduler;
    } else {
      (window as any).scheduler = originalScheduler;
    }
  });

  it("restores the cursor when the mention block is still alive", fakeAsync(() => {
    const block = {id: "p1"};
    const {plugin, doc} = createPlugin(block);

    (plugin as any)._setCursorAtWhenBlockAlive(block, 2);
    flushMicrotasks();

    expect(doc.selection.setCursorAt).toHaveBeenCalledOnceWith(block, 2);
  }));

  it("skips cursor restore when the mention block was deleted", fakeAsync(() => {
    const block = {id: "p1"};
    const {plugin, doc} = createPlugin(block);
    doc.vm.get.and.returnValue(undefined);

    (plugin as any)._setCursorAtWhenBlockAlive(block, 2);
    flushMicrotasks();

    expect(doc.selection.setCursorAt).not.toHaveBeenCalled();
  }));
});

describe("MentionPlugin selection liveness", () => {
  it("measures the trigger by model range across a Revision c-element boundary", () => {
    const rect = new DOMRect(20, 30, 8, 18);
    const modelRangeToClientRects = jasmine.createSpy("modelRangeToClientRects")
      .and.returnValue([rect]);
    const findBlotByOffset = jasmine.createSpy("findBlotByOffset");
    const plugin = new MentionPlugin({panel: jasmine.createSpy("panel")});
    const block = {
      runtime: {modelRangeToClientRects, findBlotByOffset},
    };

    expect((plugin as any)._getCharRect(block, 4)).toBe(rect);
    expect(modelRangeToClientRects).toHaveBeenCalledOnceWith(4, 5);
    expect(findBlotByOffset).not.toHaveBeenCalled();
  });

  it("opens after an atomic inline embed such as a date", () => {
    const block = {
      id: "p1",
      plainTextOnly: false,
      textDeltas: jasmine.createSpy("textDeltas").and.returnValue([
        {insert: {date: "2026-08-17T18:00"}},
      ]),
    };
    const selection = {
      anchor: {blockId: "p1", type: "text", offset: 1},
      head: {blockId: "p1", type: "text", offset: 1},
      start: {blockId: "p1", type: "text", offset: 1},
      end: {blockId: "p1", type: "text", offset: 1},
      commonParent: "root",
      collapsed: true,
      firstBlock: block,
      lastBlock: block,
    };
    const plugin = new MentionPlugin({panel: jasmine.createSpy("panel")});
    const doc = {
      model: {exists: jasmine.createSpy("exists").and.returnValue(true)},
      isReadonly: false,
      selection: {value: selection},
    };
    (plugin as any).doc = doc;
    spyOn(plugin, "openAt").and.returnValue(true);
    const preventDefault = jasmine.createSpy("preventDefault");

    expect(plugin.onBindingInput({
      getDefaultEvent: () => ({
        data: "@",
        isComposing: false,
        preventDefault,
      }),
    } as any)).toBeTrue();

    expect(preventDefault).toHaveBeenCalled();
    expect(plugin.openAt).toHaveBeenCalledOnceWith(block as any, 1);
  });

  it("does not open a mention session from a stale text cursor", () => {
    const block = {
      id: "p1",
      plainTextOnly: false,
      textDeltas: jasmine.createSpy("textDeltas").and.returnValue([{insert: ""}]),
      yText: {
        insert: jasmine.createSpy("insert"),
      },
    };
    const selection = {
      anchor: {blockId: "p1", type: "text", offset: 0},
      head: {blockId: "p1", type: "text", offset: 0},
      start: {blockId: "p1", type: "text", offset: 0},
      end: {blockId: "p1", type: "text", offset: 0},
      commonParent: "root",
      collapsed: true,
      firstBlock: block,
      lastBlock: block,
    };
    const panel = jasmine.createSpy("panel");
    const plugin = new MentionPlugin({panel});
    const doc = {
      getBlockById: jasmine.createSpy("getBlockById").and.throwError("missing"),
      selection: {
        value: selection,
        setSelection: jasmine.createSpy("setSelection"),
      },
      crud: {
        transact: jasmine.createSpy("transact"),
      },
    };
    (plugin as any).doc = doc;
    const preventDefault = jasmine.createSpy("preventDefault");

    plugin.onBindingInput({
      getDefaultEvent: () => ({
        data: "@",
        isComposing: false,
        preventDefault,
      }),
    } as any);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(doc.crud.transact).not.toHaveBeenCalled();
    expect(doc.selection.setSelection).not.toHaveBeenCalled();
    expect(panel).not.toHaveBeenCalled();
  });

  it("atomically replaces a slash query when opened from another command surface", () => {
    const block = {
      id: "p1",
      textLength: 12,
      plainTextOnly: false,
      applyDeltaOperations: jasmine.createSpy("applyDeltaOperations"),
    };
    const panel = jasmine.createSpy("panel");
    const plugin = new MentionPlugin({panel});
    const doc = {
      vm: {get: jasmine.createSpy("get").and.returnValue(block)},
      getBlockById: jasmine.createSpy("getBlockById").and.returnValue(block),
      isReadonly: false,
      selection: {setSelection: jasmine.createSpy("setSelection")},
    };
    (plugin as any).doc = doc;
    spyOn<any>(plugin, "_openSession");

    expect(plugin.openAt(block as any, 3, 6)).toBeTrue();

    expect(block.applyDeltaOperations).toHaveBeenCalledOnceWith([
      {retain: 3},
      {delete: 6},
      {insert: "@"},
    ]);
    expect(doc.selection.setSelection).toHaveBeenCalledOnceWith({
      blockId: "p1",
      type: "text",
      index: 4,
      length: 0,
    });
    expect((plugin as any)._openSession).toHaveBeenCalledOnceWith(block, 3);
  });
});
