import {fakeAsync, tick} from "@angular/core/testing";
import {Subject} from "rxjs";
import {CalloutToolbarPlugin} from "./index";

describe("CalloutToolbarPlugin delayed toolbar", () => {
  const makeHarness = (containerFlavour: "callout" | "render-unit" = "callout") => {
    const selection$ = new Subject<any>();
    const readonlyStateChange$ = new Subject<void>();
    const selectionValue = {current: null as any};
    const calloutBlock = {
      id: `${containerFlavour}-1`,
      flavour: containerFlavour,
      hostElement: document.createElement("div"),
      onDestroy$: new Subject<void>(),
    };
    const textBlock = {
      id: "text-1",
      flavour: "text",
      parentBlock: calloutBlock,
    };
    const calloutSelection = {
      isInSameBlock: true,
      start: {type: "text"},
      end: {type: "text"},
      firstBlock: textBlock,
    };
    const calloutBoundarySelection = {
      isInSameBlock: true,
      start: {type: "boundary", index: 0},
      end: {type: "boundary", index: 1},
      firstBlock: textBlock,
    };
    const wholeRegionSelection = {
      isInSameBlock: true,
      start: {type: "selected"},
      end: {type: "selected"},
      firstBlock: calloutBlock,
    };
    const doc = {
      isReadonly: false,
      selection: {
        selectionChange$: selection$,
        get value() {
          return selectionValue.current;
        },
      },
      getBlockById: jasmine.createSpy("getBlockById").and.returnValue(calloutBlock),
      readonlyManager: {
        stateChange$: readonlyStateChange$,
        isReadonly: jasmine.createSpy("isReadonly").and.returnValue(false),
      },
      overlayService: {
        createConnectedOverlay: jasmine.createSpy("createConnectedOverlay").and.returnValue({
          componentRef: {
            setInput: jasmine.createSpy("setInput"),
          },
          overlayRef: {
            dispose: jasmine.createSpy("dispose"),
            updatePosition: jasmine.createSpy("updatePosition"),
          },
        }),
      },
    };
    const plugin = new CalloutToolbarPlugin();
    (plugin as any).doc = doc;
    return {
      plugin,
      doc,
      selection$,
      readonlyStateChange$,
      selectionValue,
      calloutBlock,
      calloutSelection,
      calloutBoundarySelection,
      wholeRegionSelection,
    };
  };

  it("cancels delayed toolbar open when selection is cleared", fakeAsync(() => {
    const {plugin, doc, selection$, selectionValue, calloutSelection} = makeHarness();
    plugin.init();

    selectionValue.current = calloutSelection;
    selection$.next(calloutSelection);
    tick(50);
    selectionValue.current = null;
    selection$.next(null);
    tick(250);

    expect(doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
    plugin.destroy();
  }));

  it("rechecks the current selection before opening", fakeAsync(() => {
    const {plugin, doc, selection$, selectionValue, calloutSelection} = makeHarness();
    plugin.init();

    selectionValue.current = calloutSelection;
    selection$.next(calloutSelection);
    selectionValue.current = null;
    tick(250);

    expect(doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
    plugin.destroy();
  }));

  it("opens toolbar for text selections inside callout blocks", fakeAsync(() => {
    const {plugin, doc, selection$, selectionValue, calloutSelection} = makeHarness();
    plugin.init();

    selectionValue.current = calloutSelection;
    selection$.next(calloutSelection);
    tick(250);

    expect(doc.overlayService.createConnectedOverlay).toHaveBeenCalled();
    plugin.destroy();
  }));

  it("reuses the toolbar for text selections inside render-unit blocks", fakeAsync(() => {
    const {plugin, doc, selection$, selectionValue, calloutSelection} = makeHarness("render-unit");
    plugin.init();

    selectionValue.current = calloutSelection;
    selection$.next(calloutSelection);
    tick(250);

    expect(doc.overlayService.createConnectedOverlay).toHaveBeenCalled();
    const {componentRef} = doc.overlayService.createConnectedOverlay.calls.mostRecent().returnValue;
    expect(componentRef.setInput).toHaveBeenCalledWith(
      "containerBlock",
      calloutSelection.firstBlock.parentBlock,
    );
    plugin.destroy();
  }));

  it("opens for a whole-block render-unit selection so an empty region remains configurable", fakeAsync(() => {
    const {
      plugin,
      doc,
      selection$,
      selectionValue,
      wholeRegionSelection,
    } = makeHarness("render-unit");
    plugin.init();

    selectionValue.current = wholeRegionSelection;
    selection$.next(wholeRegionSelection);
    tick(250);

    expect(doc.overlayService.createConnectedOverlay).toHaveBeenCalled();
    plugin.destroy();
  }));

  it("does not open when the captured callout block is stale", fakeAsync(() => {
    const {plugin, doc, selection$, selectionValue, calloutSelection} = makeHarness();
    plugin.init();

    selectionValue.current = calloutSelection;
    selection$.next(calloutSelection);
    doc.getBlockById.and.returnValue({...calloutSelection.firstBlock.parentBlock});
    tick(250);

    expect(doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
    plugin.destroy();
  }));

  it("cancels delayed toolbar open on destroy", fakeAsync(() => {
    const {plugin, doc, selection$, selectionValue, calloutSelection} = makeHarness();
    plugin.init();

    selectionValue.current = calloutSelection;
    selection$.next(calloutSelection);
    plugin.destroy();
    tick(250);

    expect(doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
  }));

  it("does not open toolbar for non-text callout selections", fakeAsync(() => {
    const {plugin, doc, selection$, selectionValue, calloutBoundarySelection} = makeHarness();
    plugin.init();

    selectionValue.current = calloutBoundarySelection;
    selection$.next(calloutBoundarySelection);
    tick(250);

    expect(doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
    plugin.destroy();
  }));

  it("closes the toolbar before querying readonly state for a removed callout block", fakeAsync(() => {
    const {
      plugin,
      doc,
      selection$,
      readonlyStateChange$,
      selectionValue,
      calloutSelection,
    } = makeHarness();
    plugin.init();

    selectionValue.current = calloutSelection;
    selection$.next(calloutSelection);
    tick(250);
    const {overlayRef} = doc.overlayService.createConnectedOverlay.calls.mostRecent().returnValue;

    doc.readonlyManager.isReadonly.calls.reset();
    doc.getBlockById.and.throwError("Block not found: callout-1");
    doc.readonlyManager.isReadonly.and.throwError(
      new Error("readonly lookup received a removed block"),
    );

    expect(() => readonlyStateChange$.next()).not.toThrow();
    expect(doc.readonlyManager.isReadonly).not.toHaveBeenCalled();
    expect(overlayRef.dispose).toHaveBeenCalled();
    plugin.destroy();
  }));
});
