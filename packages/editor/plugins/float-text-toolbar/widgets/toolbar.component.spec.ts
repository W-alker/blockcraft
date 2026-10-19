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

  it("formats picked colors without resampling the native selection", () => {
    const component = new FloatTextToolbarComponent();
    const recalculate = jasmine.createSpy("recalculate");
    const formatText = jasmine.createSpy("formatText");
    component.doc = {selection: {recalculate}} as any;
    component.utils = {formatText} as any;

    component.onColorPicked({type: "color", color: "#123456", group: {} as any});
    component.onColorPicked({type: "backColor", color: "transparent", group: {} as any});

    expect(formatText.calls.allArgs()).toEqual([
      [{"s:color": "#123456"}],
      [{"s:background": null}],
    ]);
    expect(recalculate).not.toHaveBeenCalled();
  });

  it("formats picked backgrounds without resampling the native selection", () => {
    const component = new FloatTextToolbarComponent();
    const recalculate = jasmine.createSpy("recalculate");
    const formatText = jasmine.createSpy("formatText");
    component.doc = {selection: {recalculate}} as any;
    component.utils = {formatText} as any;

    component.onBgGraphPicked("grid");

    expect(formatText).toHaveBeenCalledOnceWith({"a:bg": "grid"});
    expect(recalculate).not.toHaveBeenCalled();
  });
});
