import {fakeAsync, tick} from "@angular/core/testing";
import {Subject} from "rxjs";
import {createBlockGapSpace} from "../../framework";
import {DividerExtensionPlugin} from "./index";

describe("DividerExtensionPlugin delayed toolbar", () => {
  const makeHarness = () => {
    const selection$ = new Subject<any>();
    const selectionValue = {current: null as any};
    const hostElement = document.createElement("div");
    hostElement.setAttribute("data-block-id", "divider-1");
    const dividerBlock = {
      id: "divider-1",
      flavour: "divider",
      hostElement,
      onDestroy$: new Subject<void>(),
    };
    const dividerSelection = {
      anchor: {type: "selected"},
      head: {type: "selected"},
      isInSameBlock: true,
      firstBlock: dividerBlock,
    };
    const doc = {
      selection: {
        selectionChange$: selection$,
        selectBlock: jasmine.createSpy("selectBlock"),
        get value() {
          return selectionValue.current;
        },
      },
      getBlockById: jasmine.createSpy("getBlockById").and.returnValue(dividerBlock),
      overlayService: {
        createConnectedOverlay: jasmine.createSpy("createConnectedOverlay"),
      },
    };
    const plugin = new DividerExtensionPlugin();
    (plugin as any).doc = doc;
    return {plugin, doc, selection$, selectionValue, hostElement, dividerBlock, dividerSelection};
  };

  it("selects the divider itself on primary mouseDown", () => {
    const {plugin, doc, hostElement, dividerBlock} = makeHarness();
    const content = document.createElement("div");
    content.setAttribute("contenteditable", "false");
    hostElement.appendChild(content);
    const preventDefault = jasmine.createSpy("preventDefault");

    (plugin as any)._handleDividerMouseDown({
      getDefaultEvent: () => ({
        button: 0,
        target: content,
        defaultPrevented: false,
        preventDefault,
      }),
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(doc.selection.selectBlock).toHaveBeenCalledWith(dividerBlock as any);
  });

  it("does not select the divider on secondary mouseDown", () => {
    const {plugin, doc, hostElement} = makeHarness();
    const preventDefault = jasmine.createSpy("preventDefault");

    (plugin as any)._handleDividerMouseDown({
      getDefaultEvent: () => ({
        button: 2,
        target: hostElement,
        defaultPrevented: false,
        preventDefault,
      }),
    });

    expect(preventDefault).not.toHaveBeenCalled();
    expect(doc.selection.selectBlock).not.toHaveBeenCalled();
  });

  it("lets divider gap anchors fall through to the gap cursor path", () => {
    const {plugin, doc, hostElement} = makeHarness();
    const leadingGap = createBlockGapSpace();
    const content = document.createElement("div");
    const trailingGap = createBlockGapSpace();
    hostElement.append(leadingGap, content, trailingGap);
    const preventDefault = jasmine.createSpy("preventDefault");

    (plugin as any)._handleDividerMouseDown({
      getDefaultEvent: () => ({
        button: 0,
        target: trailingGap.firstChild,
        defaultPrevented: false,
        preventDefault,
      }),
    });

    expect(preventDefault).not.toHaveBeenCalled();
    expect(doc.selection.selectBlock).not.toHaveBeenCalled();
  });

  it("rechecks the current selection before opening", fakeAsync(() => {
    const {plugin, doc, selection$, selectionValue, dividerSelection} = makeHarness();
    plugin.init();

    selectionValue.current = dividerSelection;
    selection$.next(dividerSelection);
    selectionValue.current = null;
    tick(250);

    expect(doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
    plugin.destroy();
  }));

  it("does not open for a mixed divider selection endpoint", fakeAsync(() => {
    const {plugin, doc, selection$, selectionValue, dividerSelection} = makeHarness();
    plugin.init();
    const mixedSelection = {
      ...dividerSelection,
      head: {type: "boundary"},
    };

    selectionValue.current = mixedSelection;
    selection$.next(mixedSelection);
    tick(250);

    expect(doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
    plugin.destroy();
  }));

  it("does not open when the captured divider block is stale", fakeAsync(() => {
    const {plugin, doc, selection$, selectionValue, dividerSelection} = makeHarness();
    plugin.init();

    selectionValue.current = dividerSelection;
    selection$.next(dividerSelection);
    doc.getBlockById.and.returnValue({...dividerSelection.firstBlock});
    tick(250);

    expect(doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
    plugin.destroy();
  }));

  it("cancels delayed toolbar open on destroy", fakeAsync(() => {
    const {plugin, doc, selection$, selectionValue, dividerSelection} = makeHarness();
    plugin.init();

    selectionValue.current = dividerSelection;
    selection$.next(dividerSelection);
    plugin.destroy();
    tick(250);

    expect(doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
  }));
});
