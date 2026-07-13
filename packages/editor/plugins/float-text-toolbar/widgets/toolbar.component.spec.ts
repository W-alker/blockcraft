import {FloatTextToolbarComponent} from "./toolbar.component";

describe("FloatTextToolbarComponent selection replay", () => {
  const selectionJSON = {
    anchor: {blockId: "p1", type: "text", offset: 0},
    head: {blockId: "p1", type: "text", offset: 1},
    commonParent: "root",
  };

  it("does not replay a saved selection after destroy", () => {
    const component = new FloatTextToolbarComponent();
    const doc = {
      selection: {
        value: null,
        replay: jasmine.createSpy("replay"),
      },
    };
    component.doc = doc as any;
    component.ngOnDestroy();

    const result = (component as any).replaySelection(selectionJSON);

    expect(result).toBeNull();
    expect(doc.selection.replay).not.toHaveBeenCalled();
  });

  it("reports replay failure when the restored selection is cleared as stale", () => {
    const component = new FloatTextToolbarComponent();
    const doc = {
      selection: {
        value: null,
        replay: jasmine.createSpy("replay"),
      },
    };
    component.doc = doc as any;

    const result = (component as any).replaySelection(selectionJSON);

    expect(result).toBeNull();
    expect(doc.selection.replay).toHaveBeenCalledWith(selectionJSON);
  });

  it("returns the restored live selection after replay", () => {
    const component = new FloatTextToolbarComponent();
    const block = {id: "p1"};
    const selection = {
      anchor: {blockId: "p1", type: "text", offset: 0},
      head: {blockId: "p1", type: "text", offset: 1},
      start: {blockId: "p1", type: "text", offset: 0},
      end: {blockId: "p1", type: "text", offset: 1},
      commonParent: "p1",
      firstBlock: block,
      lastBlock: block,
    };
    const doc = {
      getBlockById: jasmine.createSpy("getBlockById").and.returnValue(block),
      selection: {
        value: selection,
        replay: jasmine.createSpy("replay"),
      },
    };
    component.doc = doc as any;

    const result = (component as any).replaySelection(selectionJSON);

    expect(result).toBe(selection as any);
    expect(doc.selection.replay).toHaveBeenCalledWith(selectionJSON);
  });

  it("returns null when replay restores a selection with missing blocks", () => {
    const component = new FloatTextToolbarComponent();
    const block = {id: "p1"};
    const selection = {
      anchor: {blockId: "p1", type: "text", offset: 0},
      head: {blockId: "p1", type: "text", offset: 1},
      start: {blockId: "p1", type: "text", offset: 0},
      end: {blockId: "p1", type: "text", offset: 1},
      commonParent: "p1",
      firstBlock: block,
      lastBlock: block,
    };
    const doc = {
      getBlockById: jasmine.createSpy("getBlockById").and.throwError("missing"),
      selection: {
        value: selection,
        replay: jasmine.createSpy("replay"),
      },
    };
    component.doc = doc as any;

    const result = (component as any).replaySelection(selectionJSON);

    expect(result).toBeNull();
    expect(doc.selection.replay).toHaveBeenCalledWith(selectionJSON);
  });
});
