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
});
