import {fakeAsync, tick} from "@angular/core/testing";
import {Subject} from "rxjs";
import {BookmarkBlockExtensionPlugin} from "./index";

describe("BookmarkBlockExtensionPlugin delayed toolbar", () => {
  const makeHarness = () => {
    const selection$ = new Subject<any>();
    const selectionValue = {current: null as any};
    const bookmarkBlock = {
      id: "bookmark-1",
      flavour: "bookmark",
      onDestroy$: new Subject<void>(),
    };
    const bookmarkSelection = {
      isInSameBlock: true,
      anchor: {type: "selected"},
      head: {type: "selected"},
      firstBlock: bookmarkBlock,
    };
    const bookmarkGapSelection = {
      isInSameBlock: true,
      anchor: {type: "gap", side: "after"},
      head: {type: "gap", side: "after"},
      firstBlock: bookmarkBlock,
    };
    const doc = {
      selection: {
        selectionChange$: selection$,
        get value() {
          return selectionValue.current;
        },
      },
      getBlockById: jasmine.createSpy("getBlockById").and.returnValue(bookmarkBlock),
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
    const plugin = new BookmarkBlockExtensionPlugin();
    (plugin as any).doc = doc;
    return {plugin, doc, selection$, selectionValue, bookmarkSelection, bookmarkGapSelection};
  };

  it("cancels delayed toolbar open when selection is cleared", fakeAsync(() => {
    const {plugin, doc, selection$, selectionValue, bookmarkSelection} = makeHarness();
    plugin.init();

    selectionValue.current = bookmarkSelection;
    selection$.next(bookmarkSelection);
    tick(50);
    selectionValue.current = null;
    selection$.next(null);
    tick(250);

    expect(doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
    plugin.destroy();
  }));

  it("opens toolbar for selected bookmark blocks", fakeAsync(() => {
    const {plugin, doc, selection$, selectionValue, bookmarkSelection} = makeHarness();
    plugin.init();

    selectionValue.current = bookmarkSelection;
    selection$.next(bookmarkSelection);
    tick(250);

    expect(doc.overlayService.createConnectedOverlay).toHaveBeenCalled();
    plugin.destroy();
  }));

  it("does not open when the captured bookmark block is stale", fakeAsync(() => {
    const {plugin, doc, selection$, selectionValue, bookmarkSelection} = makeHarness();
    plugin.init();

    selectionValue.current = bookmarkSelection;
    selection$.next(bookmarkSelection);
    doc.getBlockById.and.returnValue({...bookmarkSelection.firstBlock});
    tick(250);

    expect(doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
    plugin.destroy();
  }));

  it("cancels delayed toolbar open on destroy", fakeAsync(() => {
    const {plugin, doc, selection$, selectionValue, bookmarkSelection} = makeHarness();
    plugin.init();

    selectionValue.current = bookmarkSelection;
    selection$.next(bookmarkSelection);
    plugin.destroy();
    tick(250);

    expect(doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
  }));

  it("does not open toolbar for bookmark gap cursor", fakeAsync(() => {
    const {plugin, doc, selection$, selectionValue, bookmarkGapSelection} = makeHarness();
    plugin.init();

    selectionValue.current = bookmarkGapSelection;
    selection$.next(bookmarkGapSelection);
    tick(250);

    expect(doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
    plugin.destroy();
  }));
});
