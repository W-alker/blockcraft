import {CodeInlineEditorBinding} from "./codeEditorBinding";

describe("CodeInlineEditorBinding selection liveness", () => {
  const makeStaleTextSelection = (block: any) => ({
    anchor: {blockId: block.id, type: "text", offset: 0},
    head: {blockId: block.id, type: "text", offset: 0},
    start: {blockId: block.id, type: "text", offset: 0},
    end: {blockId: block.id, type: "text", offset: 0},
    commonParent: "root",
    isInSameBlock: true,
    firstBlock: block,
    lastBlock: block,
  });

  const makeHarness = () => {
    const block = {
      id: "code-1",
      flavour: "code",
      props: {},
      textLength: 4,
      textContent: jasmine.createSpy("textContent").and.returnValue("code"),
      deleteText: jasmine.createSpy("deleteText"),
      applyDeltaOperations: jasmine.createSpy("applyDeltaOperations"),
      insertText: jasmine.createSpy("insertText"),
      setInlineRange: jasmine.createSpy("setInlineRange"),
    };
    const selection = makeStaleTextSelection(block);
    const doc = {
      isReadonly: false,
      getBlockById: jasmine.createSpy("getBlockById").and.throwError("missing"),
      selection: {
        recalculate: jasmine.createSpy("recalculate"),
      },
    };
    const context = {
      preventDefault: jasmine.createSpy("preventDefault"),
      get: (name: string) => {
        if (name === "keyboardState") {
          return {
            selection,
            raw: {shiftKey: false},
          };
        }
        throw new Error(`Unexpected state ${name}`);
      },
    };
    const plugin = new CodeInlineEditorBinding();
    (plugin as any).doc = doc;
    return {plugin, doc, block, context};
  };

  it("does not handle Enter when the code selection points at a removed block", () => {
    const {plugin, block, context} = makeHarness();

    const handled = plugin.handleEnterKey(context as any);

    expect(handled).toBeFalse();
    expect(context.preventDefault).not.toHaveBeenCalled();
    expect(block.textContent).not.toHaveBeenCalled();
    expect(block.applyDeltaOperations).not.toHaveBeenCalled();
  });

  it("does not handle Tab when the code selection points at a removed block", () => {
    const {plugin, block, context} = makeHarness();

    const handled = plugin.handleTabKey(context as any);

    expect(handled).toBeFalse();
    expect(context.preventDefault).not.toHaveBeenCalled();
    expect(block.insertText).not.toHaveBeenCalled();
    expect(block.applyDeltaOperations).not.toHaveBeenCalled();
  });

  it("consumes Tab without writing when the code block is readonly", () => {
    const {plugin, doc, block, context} = makeHarness();
    doc.getBlockById.and.returnValue(block);
    (doc as any).readonlyManager = {
      isReadonly: jasmine.createSpy("isReadonly").and.returnValue(true),
    };

    const handled = plugin.handleTabKey(context as any);

    expect(handled).toBeTrue();
    expect(context.preventDefault).toHaveBeenCalled();
    expect(block.insertText).not.toHaveBeenCalled();
    expect(block.applyDeltaOperations).not.toHaveBeenCalled();
  });

  it("keeps multiline Tab selection model-owned after applying deltas", () => {
    const block = {
      id: "code-1",
      flavour: "code",
      props: {},
      textLength: 3,
      textContent: jasmine.createSpy("textContent").and.returnValue("a\nb"),
      applyDeltaOperations: jasmine.createSpy("applyDeltaOperations"),
    };
    const selection = {
      anchor: {blockId: block.id, type: "text", offset: 0},
      head: {blockId: block.id, type: "text", offset: 3},
      start: {blockId: block.id, type: "text", offset: 0},
      end: {blockId: block.id, type: "text", offset: 3},
      commonParent: block.id,
      isInSameBlock: true,
      collapsed: false,
      firstBlock: block,
      lastBlock: block,
    };
    const doc = {
      isReadonly: false,
      getBlockById: jasmine.createSpy("getBlockById").and.returnValue(block),
      selection: {
        recalculate: jasmine.createSpy("recalculate"),
      },
    };
    const context = {
      preventDefault: jasmine.createSpy("preventDefault"),
      get: (name: string) => {
        if (name === "keyboardState") {
          return {
            selection,
            raw: {shiftKey: false},
          };
        }
        throw new Error(`Unexpected state ${name}`);
      },
    };
    const plugin = new CodeInlineEditorBinding();
    (plugin as any).doc = doc;

    const handled = plugin.handleTabKey(context as any);

    expect(handled).toBeTrue();
    expect(context.preventDefault).toHaveBeenCalled();
    expect(block.applyDeltaOperations).toHaveBeenCalledOnceWith([
      {retain: 0},
      {insert: "\t"},
      {retain: 2},
      {insert: "\t"},
    ]);
    expect(doc.selection.recalculate).not.toHaveBeenCalled();
  });
});
