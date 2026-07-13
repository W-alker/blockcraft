import {fakeAsync, tick} from "@angular/core/testing";
import {Subject} from "rxjs";
import {BlockNodeType} from "../../framework";
import {FloatTextToolbarPlugin} from "./rich-text-toolbar";
import {TextMarkerPlugin} from "./text-marker-toolbar";
import {isFloatTextToolbarSelection} from "./selection";

describe("float text toolbar selection guard", () => {
  const makeTextSelection = () => {
    const hostElement = document.createElement("div");
    hostElement.getBoundingClientRect = () => ({
      left: 10,
      right: 110,
      top: 20,
      bottom: 40,
      width: 100,
      height: 20,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    } as DOMRect);
    const block = {
      id: "p1",
      flavour: "paragraph",
      nodeType: BlockNodeType.editable,
      props: {},
      hostElement,
      textLength: 5,
      textDeltas: () => [{insert: "hello"}],
    };
    return {
      collapsed: false,
      isAllSelected: false,
      isEmpty: false,
      isInSameBlock: true,
      start: {blockId: "p1", type: "text", offset: 0, block},
      end: {blockId: "p1", type: "text", offset: 2, block},
      firstBlock: block,
      lastBlock: block,
      getDirection: () => "forward",
    } as any;
  };

  const makeTableCellSelection = () => ({
    collapsed: false,
    isAllSelected: false,
    isEmpty: false,
    isInSameBlock: false,
    start: {blockId: "cell-1", type: "table-cell", tableId: "table-1"},
    end: {blockId: "cell-4", type: "table-cell", tableId: "table-1"},
    firstBlock: {id: "cell-1", flavour: "table-cell"},
    lastBlock: {id: "cell-4", flavour: "table-cell"},
    getTableCellSelection: () => ({
      tableId: "table-1",
      anchorCellId: "cell-1",
      headCellId: "cell-4",
    }),
  } as any);

  const makeBoundarySelection = () => ({
    collapsed: false,
    isAllSelected: false,
    isEmpty: false,
    isInSameBlock: false,
    start: {blockId: "callout-1", type: "boundary", index: 0},
    end: {blockId: "callout-1", type: "boundary", index: 2},
    firstBlock: {id: "p1", flavour: "paragraph"},
    lastBlock: {id: "p2", flavour: "paragraph"},
  } as any);

  const makeGapSelection = () => ({
    collapsed: true,
    isAllSelected: false,
    isEmpty: false,
    isInSameBlock: true,
    start: {blockId: "table-1", type: "gap", side: "after"},
    end: {blockId: "table-1", type: "gap", side: "after"},
    firstBlock: {id: "table-1", flavour: "table"},
    lastBlock: {id: "table-1", flavour: "table"},
  } as any);

  const makeDoc = (selectionValue: any, selectionRects: DOMRect[] | null = [{
    left: 12,
    right: 80,
    top: 24,
    bottom: 38,
    width: 68,
    height: 14,
    x: 12,
    y: 24,
    toJSON: () => ({}),
  } as DOMRect]) => {
    const selection$ = new Subject<any>();
    const nextSelection$ = new Subject<any>();
    const dragState$ = new Subject<string>();
    const removeEvent = jasmine.createSpy("removeEvent");
    const readonlySub = {
      unsubscribe: jasmine.createSpy("unsubscribeReadonly"),
    };
    const overlayRef = {
      dispose: jasmine.createSpy("dispose"),
    };
    const componentRef = {
      setInput: jasmine.createSpy("setInput"),
      instance: {
        onExtraItemClick: new Subject<any>(),
      },
      changeDetectorRef: {
        markForCheck: jasmine.createSpy("markForCheck"),
      },
    };
    const getSelectionRects = jasmine.createSpy("getSelectionRects").and.returnValue(selectionRects);
    const scrollContainer = document.createElement("div");
    scrollContainer.getBoundingClientRect = () => ({
      left: 0,
      right: 500,
      top: 0,
      bottom: 500,
      width: 500,
      height: 500,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    const doc = {
      isReadonly: false,
      onDestroy$: new Subject<void>(),
      dragController: {state$: dragState$},
      scrollContainer,
      selection: {
        get value() {
          return selectionValue.current;
        },
        changeObserve: () => selection$,
        nextChangeObserve: () => nextSelection$,
        getSelectionRects,
      },
      overlayService: {
        createConnectedOverlay: jasmine.createSpy("createConnectedOverlay")
          .and.returnValue({componentRef, overlayRef}),
      },
      event: {
        add: jasmine.createSpy("add").and.returnValue(removeEvent),
      },
      subscribeReadonlyChange: jasmine.createSpy("subscribeReadonlyChange").and.returnValue(readonlySub),
      queryBlocksBetween: jasmine.createSpy("queryBlocksBetween")
        .and.callFake(() => [selectionValue.current.firstBlock.id]),
      getBlockById: jasmine.createSpy("getBlockById")
        .and.callFake(() => selectionValue.current.firstBlock),
      isEditable: jasmine.createSpy("isEditable").and.returnValue(true),
    };
    return {doc, selection$, dragState$, overlayRef, getSelectionRects, removeEvent, readonlySub};
  };

  it("accepts only real text-range selections", () => {
    expect(isFloatTextToolbarSelection(makeTextSelection())).toBeTrue();
    expect(isFloatTextToolbarSelection(makeTableCellSelection())).toBeFalse();
    expect(isFloatTextToolbarSelection(makeBoundarySelection())).toBeFalse();
    expect(isFloatTextToolbarSelection(makeGapSelection())).toBeFalse();
  });

  it("does not open rich text toolbar for table-cell selections", fakeAsync(() => {
    const selectionValue = {current: makeTableCellSelection()};
    const {doc, selection$, getSelectionRects} = makeDoc(selectionValue);
    const plugin = new FloatTextToolbarPlugin();
    (plugin as any).doc = doc;

    plugin.init();
    selection$.next(selectionValue.current);
    tick(351);

    expect(doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
    expect(getSelectionRects).not.toHaveBeenCalled();
    plugin.destroy();
  }));

  it("closes an existing rich text toolbar when selection becomes table-cell", fakeAsync(() => {
    const selectionValue = {current: makeTableCellSelection()};
    const {doc, selection$, overlayRef, getSelectionRects} = makeDoc(selectionValue);
    const plugin = new FloatTextToolbarPlugin();
    (plugin as any).doc = doc;
    (plugin as any).toolbarOvr = overlayRef;

    plugin.init();
    selection$.next(selectionValue.current);
    tick(351);

    expect(overlayRef.dispose).toHaveBeenCalled();
    expect(doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
    expect(getSelectionRects).not.toHaveBeenCalled();
    plugin.destroy();
  }));

  it("still opens rich text toolbar for text-range selections", fakeAsync(() => {
    const selectionValue = {current: makeTextSelection()};
    const {doc, selection$, getSelectionRects} = makeDoc(selectionValue);
    const plugin = new FloatTextToolbarPlugin();
    (plugin as any).doc = doc;

    plugin.init();
    selection$.next(selectionValue.current);
    tick(351);

    expect(doc.overlayService.createConnectedOverlay).toHaveBeenCalled();
    expect(getSelectionRects).toHaveBeenCalled();
    plugin.destroy();
  }));

  it("does not open rich text toolbar when a text selection has no DOM rect", fakeAsync(() => {
    const selectionValue = {current: makeTextSelection()};
    const {doc, selection$, getSelectionRects} = makeDoc(selectionValue, null);
    const plugin = new FloatTextToolbarPlugin();
    (plugin as any).doc = doc;

    plugin.init();
    selection$.next(selectionValue.current);
    tick(351);

    expect(doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
    expect(getSelectionRects).toHaveBeenCalled();
    plugin.destroy();
  }));

  it("does not open rich text toolbar for stale text selections", fakeAsync(() => {
    const selectionValue = {current: makeTextSelection()};
    const {doc, selection$, getSelectionRects} = makeDoc(selectionValue);
    doc.getBlockById.and.throwError("missing");
    const visible = jasmine.createSpy("visible").and.returnValue(true);
    const plugin = new FloatTextToolbarPlugin({
      extraItems: [{name: "x", value: true, visible}],
    });
    (plugin as any).doc = doc;

    plugin.init();
    selection$.next(selectionValue.current);
    tick(351);

    expect(doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
    expect(getSelectionRects).not.toHaveBeenCalled();
    expect(visible).not.toHaveBeenCalled();
    plugin.destroy();
  }));

  it("tears down rich text toolbar observers on destroy", fakeAsync(() => {
    const selectionValue = {current: makeTextSelection()};
    const {doc, selection$, dragState$, overlayRef, getSelectionRects} = makeDoc(selectionValue);
    const plugin = new FloatTextToolbarPlugin();
    (plugin as any).doc = doc;

    plugin.init();
    plugin.destroy();

    selection$.next(selectionValue.current);
    tick(351);
    expect(doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
    expect(getSelectionRects).not.toHaveBeenCalled();

    (plugin as any).toolbarOvr = overlayRef;
    dragState$.next("dragging");
    expect(overlayRef.dispose).not.toHaveBeenCalled();
  }));

  it("does not open marker toolbar for table-cell selections", () => {
    const selectionValue = {current: makeTableCellSelection()};
    const {doc, getSelectionRects} = makeDoc(selectionValue);
    const plugin = new TextMarkerPlugin(["paragraph"]);
    (plugin as any).doc = doc;

    plugin.init();
    plugin.onSelectEnd();

    expect(doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
    expect(getSelectionRects).not.toHaveBeenCalled();
    plugin.destroy();
  });

  it("does not open marker toolbar for stale text selections", () => {
    const selectionValue = {current: makeTextSelection()};
    const {doc, getSelectionRects} = makeDoc(selectionValue);
    doc.getBlockById.and.throwError("missing");
    const plugin = new TextMarkerPlugin(["paragraph"]);
    (plugin as any).doc = doc;

    plugin.init();
    plugin.onSelectEnd();

    expect(doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
    expect(getSelectionRects).not.toHaveBeenCalled();
    plugin.destroy();
  });

  it("tears down marker toolbar event and readonly observers on destroy", () => {
    const selectionValue = {current: makeTextSelection()};
    const {doc, removeEvent, readonlySub} = makeDoc(selectionValue);
    const plugin = new TextMarkerPlugin(["paragraph"]);
    (plugin as any).doc = doc;

    plugin.init();
    plugin.destroy();

    expect(removeEvent).toHaveBeenCalledTimes(1);
    expect(readonlySub.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
