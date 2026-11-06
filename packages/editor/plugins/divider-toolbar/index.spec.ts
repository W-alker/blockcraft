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

  const attachOpenToolbar = (plugin: DividerExtensionPlugin, dividerBlock: any) => {
    const overlayElement = document.createElement("div");
    overlayElement.setAttribute("data-divider-toolbar-test", "true");
    const input = document.createElement("input");
    overlayElement.appendChild(input);
    document.body.appendChild(overlayElement);
    const dispose = jasmine.createSpy("dispose");
    dividerBlock.hostElement.classList.add("divider-toolbar-active");
    (plugin as any)._activeBlock = dividerBlock;
    (plugin as any)._toolbarRef = {overlayElement, dispose};
    input.focus();
    return {overlayElement, input, dispose};
  };

  afterEach(() => {
    document.querySelectorAll("[data-divider-toolbar-test]").forEach(element => element.remove());
    document.querySelectorAll("[data-divider-color-picker-test]").forEach(element => element.remove());
  });

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
    const leadingGap = createBlockGapSpace('before');
    const content = document.createElement("div");
    const trailingGap = createBlockGapSpace('after');
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

  it("closes an open toolbar when a non-divider selection arrives while the overlay owns focus", () => {
    const {plugin, selection$, dividerBlock, hostElement} = makeHarness();
    const {overlayElement, dispose} = attachOpenToolbar(plugin, dividerBlock);
    plugin.init();
    const paragraph = {id: "paragraph-1", flavour: "paragraph"};
    const textSelection = {
      anchor: {blockId: paragraph.id, type: "text", offset: 0},
      head: {blockId: paragraph.id, type: "text", offset: 0},
      commonParent: paragraph.id,
      isInSameBlock: true,
      firstBlock: paragraph,
      lastBlock: paragraph,
    };

    selection$.next(textSelection);

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(hostElement.classList.contains("divider-toolbar-active")).toBeFalse();
    overlayElement.remove();
    plugin.destroy();
  });

  it("keeps an open toolbar for a null editor selection while the overlay owns focus", () => {
    const {plugin, selection$, dividerBlock, hostElement} = makeHarness();
    const {overlayElement, dispose} = attachOpenToolbar(plugin, dividerBlock);
    plugin.init();

    selection$.next(null);

    expect(dispose).not.toHaveBeenCalled();
    expect(hostElement.classList.contains("divider-toolbar-active")).toBeTrue();
    plugin.destroy();
    overlayElement.remove();
  });

  it("keeps the toolbar while its open CSES color palette owns focus", () => {
    const {plugin, selection$, dividerBlock, hostElement} = makeHarness();
    const {overlayElement, dispose} = attachOpenToolbar(plugin, dividerBlock);
    const colorPicker = document.createElement("cs-color-picker");
    colorPicker.classList.add("cs-color-picker-open");
    overlayElement.appendChild(colorPicker);
    const palettePane = document.createElement("div");
    palettePane.className = "cs-color-picker-overlay-pane";
    palettePane.setAttribute("data-divider-color-picker-test", "true");
    const palette = document.createElement("section");
    palette.className = "cs-color-picker-panel";
    const swatch = document.createElement("button");
    palette.appendChild(swatch);
    palettePane.appendChild(palette);
    document.body.appendChild(palettePane);
    swatch.focus();
    plugin.init();

    selection$.next(null);

    expect(dispose).not.toHaveBeenCalled();
    expect(hostElement.classList.contains("divider-toolbar-active")).toBeTrue();
    plugin.destroy();
    overlayElement.remove();
    palettePane.remove();
  });

  it("does not retain the toolbar for an unrelated CSES color palette", () => {
    const {plugin, selection$, dividerBlock, hostElement} = makeHarness();
    const {overlayElement, dispose} = attachOpenToolbar(plugin, dividerBlock);
    const palettePane = document.createElement("div");
    palettePane.className = "cs-color-picker-overlay-pane";
    palettePane.setAttribute("data-divider-color-picker-test", "true");
    const palette = document.createElement("section");
    palette.className = "cs-color-picker-panel";
    const swatch = document.createElement("button");
    palette.appendChild(swatch);
    palettePane.appendChild(palette);
    document.body.appendChild(palettePane);
    swatch.focus();
    plugin.init();

    selection$.next(null);

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(hostElement.classList.contains("divider-toolbar-active")).toBeFalse();
    overlayElement.remove();
    palettePane.remove();
    plugin.destroy();
  });

  it("keeps an open toolbar for the active divider selection while the overlay owns focus", () => {
    const {plugin, selection$, dividerBlock, dividerSelection, hostElement} = makeHarness();
    const {overlayElement, dispose} = attachOpenToolbar(plugin, dividerBlock);
    plugin.init();

    selection$.next(dividerSelection);

    expect(dispose).not.toHaveBeenCalled();
    expect(hostElement.classList.contains("divider-toolbar-active")).toBeTrue();
    plugin.destroy();
    overlayElement.remove();
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
