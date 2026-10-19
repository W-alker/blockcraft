import {fakeAsync, tick} from "@angular/core/testing";
import {Subject} from "rxjs";
import {EmbedFrameExtensionPlugin} from "./index";

describe("EmbedFrameExtensionPlugin delayed toolbar", () => {
  const makeHarness = () => {
    const selection$ = new Subject<any>();
    const selectionValue = {current: null as any};
    const frameBlock = {
      id: "embed-1",
      flavour: "customembed",
      onDestroy$: new Subject<void>(),
    };
    const frameSelection = {
      isInSameBlock: true,
      anchor: {type: "selected"},
      head: {type: "selected"},
      firstBlock: frameBlock,
    };
    const frameGapSelection = {
      isInSameBlock: true,
      anchor: {type: "gap", side: "after"},
      head: {type: "gap", side: "after"},
      firstBlock: frameBlock,
    };
    const doc = {
      selection: {
        selectionChange$: selection$,
        get value() {
          return selectionValue.current;
        },
      },
      getBlockById: jasmine.createSpy("getBlockById").and.returnValue(frameBlock),
      overlayService: {
        createConnectedOverlay: jasmine.createSpy("createConnectedOverlay").and.returnValue({
          componentRef: {
            setInput: jasmine.createSpy("setInput"),
          },
          overlayRef: {
            dispose: jasmine.createSpy("dispose"),
          },
        }),
      },
    };
    const plugin = new EmbedFrameExtensionPlugin();
    (plugin as any).doc = doc;
    return {plugin, doc, selection$, selectionValue, frameSelection, frameGapSelection};
  };

  it("cancels delayed toolbar open when selection is cleared", fakeAsync(() => {
    const {plugin, doc, selection$, selectionValue, frameSelection} = makeHarness();
    plugin.init();

    selectionValue.current = frameSelection;
    selection$.next(frameSelection);
    tick(50);
    selectionValue.current = null;
    selection$.next(null);
    tick(250);

    expect(doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
    plugin.destroy();
  }));

  it("opens toolbar for selected embed blocks", fakeAsync(() => {
    const {plugin, doc, selection$, selectionValue, frameSelection} = makeHarness();
    plugin.init();

    selectionValue.current = frameSelection;
    selection$.next(frameSelection);
    tick(250);

    expect(doc.overlayService.createConnectedOverlay).toHaveBeenCalled();
    plugin.destroy();
  }));

  it("does not open when the captured embed block is stale", fakeAsync(() => {
    const {plugin, doc, selection$, selectionValue, frameSelection} = makeHarness();
    plugin.init();

    selectionValue.current = frameSelection;
    selection$.next(frameSelection);
    doc.getBlockById.and.returnValue({...frameSelection.firstBlock});
    tick(250);

    expect(doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
    plugin.destroy();
  }));

  it("cancels delayed toolbar open on destroy", fakeAsync(() => {
    const {plugin, doc, selection$, selectionValue, frameSelection} = makeHarness();
    plugin.init();

    selectionValue.current = frameSelection;
    selection$.next(frameSelection);
    plugin.destroy();
    tick(250);

    expect(doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
  }));

  it("does not open toolbar for embed gap cursor", fakeAsync(() => {
    const {plugin, doc, selection$, selectionValue, frameGapSelection} = makeHarness();
    plugin.init();

    selectionValue.current = frameGapSelection;
    selection$.next(frameGapSelection);
    tick(250);

    expect(doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
    plugin.destroy();
  }));
});
