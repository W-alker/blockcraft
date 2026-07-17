import {fakeAsync, tick} from "@angular/core/testing";
import {Subject} from "rxjs";
import {BlockNodeType} from "../../framework";
import {ImgToolbarPlugin} from "./index";

describe("ImgToolbarPlugin lifecycle", () => {
  const makeHarness = () => {
    const rootHost = document.createElement("div");
    const imageHost = document.createElement("div");
    const wrapper = document.createElement("div");
    const img = document.createElement("img");
    imageHost.setAttribute("data-block-id", "img-1");
    imageHost.className = "image-block";
    wrapper.className = "img-wrapper";
    wrapper.appendChild(img);
    imageHost.appendChild(wrapper);
    rootHost.appendChild(imageHost);
    document.body.appendChild(rootHost);

    const selection$ = new Subject<any>();
    const nextSelection$ = new Subject<any>();
    const onDestroy$ = new Subject<void>();
    const readonlyState$ = new Subject<void>();
    const readonlySub = {
      unsubscribe: jasmine.createSpy("unsubscribeReadonly"),
    };
    const imageBlock = {
      id: "img-1",
      flavour: "image",
      nodeType: BlockNodeType.void,
      hostElement: imageHost,
      props: {src: "https://example.com/a.png"},
      childrenLength: 0,
      updateProps: jasmine.createSpy("updateProps"),
      onPropsChange: new Subject<void>(),
      onDestroy$: new Subject<void>(),
    };
    const selectionValue = {current: null as any};
    const imageSelection = {
      isInSameBlock: true,
      anchor: {type: "selected"},
      head: {type: "selected"},
      firstBlock: imageBlock,
      commonParent: "img-1",
    };
    const imageGapSelection = {
      isInSameBlock: true,
      anchor: {type: "gap", side: "after"},
      head: {type: "gap", side: "after"},
      firstBlock: imageBlock,
      commonParent: "img-1",
    };
    const dragState$ = new Subject<string>();
    const dragState = {current: "idle"};
    const toolbarClicks = new Subject<any>();
    const fileService = {
      previewImg: jasmine.createSpy("previewImg"),
      downloadAttachment: jasmine.createSpy("downloadAttachment"),
    };
    const run = jasmine.createSpy("run").and.resolveTo({lastResult: undefined, results: []});
    const selectOrSetCursorAtBlock = jasmine.createSpy("selectOrSetCursorAtBlock");
    const replaceWithSnapshots = jasmine.createSpy("replaceWithSnapshots");
    const chain: any = {replaceWithSnapshots, selectOrSetCursorAtBlock, run};
    replaceWithSnapshots.and.returnValue(chain);
    selectOrSetCursorAtBlock.and.returnValue(chain);
    const doc = {
      isReadonly: false,
      onDestroy$,
      root: {hostElement: rootHost},
      messageService: {
        warn: jasmine.createSpy("warn"),
        success: jasmine.createSpy("success"),
      },
      model: {
        toSnapshot: jasmine.createSpy("toSnapshot"),
      },
      chain: jasmine.createSpy("chain").and.returnValue(chain),
      injector: {
        get: jasmine.createSpy("get").and.returnValue(fileService),
      },
      selection: {
        selectionChange$: selection$,
        get value() {
          return selectionValue.current;
        },
        selectBlock: jasmine.createSpy("selectBlock"),
        afterNextChange: jasmine.createSpy("afterNextChange"),
        nextChangeObserve: jasmine.createSpy("nextChangeObserve").and.returnValue(nextSelection$),
      },
      dragController: {
        state$: dragState$,
        get state() {
          return dragState.current;
        },
        get isDragging() {
          return dragState.current === "dragging" || dragState.current === "dropping";
        },
        startDrag: jasmine.createSpy("startDrag"),
      },
      overlayService: {
        createConnectedOverlay: jasmine.createSpy("createConnectedOverlay").and.returnValue({
          componentRef: {
            setInput: jasmine.createSpy("setInput"),
            instance: {
              cdr: {
                markForCheck: jasmine.createSpy("markForCheck"),
              },
              onItemClicked: toolbarClicks,
            },
          },
          overlayRef: {
            dispose: jasmine.createSpy("dispose"),
            updatePosition: jasmine.createSpy("updatePosition"),
          },
        }),
      },
      subscribeReadonlyChange: jasmine.createSpy("subscribeReadonlyChange").and.returnValue(readonlySub),
      readonlyManager: {
        isReadonly: jasmine.createSpy("isReadonly").and.returnValue(false),
        stateChange$: readonlyState$,
      },
      getBlockById: jasmine.createSpy("getBlockById").and.returnValue(imageBlock),
    };
    const plugin = new ImgToolbarPlugin();
    (plugin as any).doc = doc;

    return {
      plugin,
      doc,
      fileService,
      rootHost,
      wrapper,
      imageHost,
      imageBlock,
      selection$,
      nextSelection$,
      selectionValue,
      imageSelection,
      imageGapSelection,
      readonlySub,
      readonlyState$,
      dragState$,
      dragState,
      toolbarClicks,
      replaceWithSnapshots,
      selectOrSetCursorAtBlock,
      run,
    };
  };

  it("keeps image preview available for a readonly block", () => {
    const {plugin, doc, fileService, rootHost, wrapper} = makeHarness();
    doc.readonlyManager.isReadonly.and.returnValue(true);
    const event = new MouseEvent("dblclick", {bubbles: true});
    Object.defineProperty(event, "target", {value: wrapper});

    expect(plugin.onImageMouseDown({
      getDefaultEvent: () => event,
    } as any)).toBeTrue();
    expect(fileService.previewImg).toHaveBeenCalled();
    rootHost.remove();
  });

  it("selects an image from its own pointerdown path", () => {
    const {plugin, doc, rootHost, wrapper, imageBlock} = makeHarness();
    plugin.init();

    wrapper.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}));

    expect(doc.selection.selectBlock).toHaveBeenCalledWith(imageBlock as any);
    expect(doc.dragController.startDrag).toHaveBeenCalledWith(
      jasmine.any(PointerEvent),
      {kind: "origin-block", blockId: "img-1"},
      {ghostLabel: "图片"},
    );
    plugin.destroy();
    rootHost.remove();
  });

  it("ignores image block whitespace so gap selection can handle it", () => {
    const {plugin, doc, rootHost, imageHost} = makeHarness();
    plugin.init();

    imageHost.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0, pointerId: 1}));

    expect(doc.selection.selectBlock).not.toHaveBeenCalled();
    expect(doc.dragController.startDrag).not.toHaveBeenCalled();
    plugin.destroy();
    rootHost.remove();
  });

  it("confirms image selection after a click that never enters dragging", () => {
    const {plugin, doc, rootHost, wrapper, imageBlock} = makeHarness();
    plugin.init();

    wrapper.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0, pointerId: 1}));
    window.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, pointerId: 1}));

    expect(doc.selection.selectBlock).toHaveBeenCalledTimes(2);
    expect(doc.selection.selectBlock).toHaveBeenCalledWith(imageBlock as any);
    plugin.destroy();
    rootHost.remove();
  });

  it("does not confirm image selection after a real image drag", () => {
    const {plugin, doc, rootHost, wrapper, dragState$, dragState} = makeHarness();
    plugin.init();

    wrapper.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0, pointerId: 1}));
    dragState.current = "dragging";
    dragState$.next("dragging");
    window.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, pointerId: 1}));

    expect(doc.selection.selectBlock).toHaveBeenCalledTimes(1);
    plugin.destroy();
    rootHost.remove();
  });

  it("cancels delayed toolbar open when image selection is cleared", fakeAsync(() => {
    const {plugin, doc, rootHost, selection$, selectionValue, imageSelection} = makeHarness();
    plugin.init();

    selectionValue.current = imageSelection;
    selection$.next(imageSelection);
    tick(50);
    selectionValue.current = null;
    selection$.next(null);
    tick(250);

    expect(doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
    plugin.destroy();
    rootHost.remove();
  }));

  it("opens toolbar for selected image blocks", fakeAsync(() => {
    const {plugin, doc, rootHost, selection$, selectionValue, imageSelection} = makeHarness();
    plugin.init();

    selectionValue.current = imageSelection;
    selection$.next(imageSelection);
    tick(250);

    expect(doc.overlayService.createConnectedOverlay).toHaveBeenCalled();
    plugin.destroy();
    rootHost.remove();
  }));

  it("does not open toolbar for readonly image blocks", fakeAsync(() => {
    const {plugin, doc, rootHost, selection$, selectionValue, imageSelection} = makeHarness();
    doc.readonlyManager.isReadonly.and.returnValue(true);
    plugin.init();

    selectionValue.current = imageSelection;
    selection$.next(imageSelection);
    tick(250);

    expect(doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
    plugin.destroy();
    rootHost.remove();
  }));

  it("does not open the delayed toolbar when the selected image block is stale", fakeAsync(() => {
    const {plugin, doc, rootHost, selection$, selectionValue, imageSelection} = makeHarness();
    plugin.init();

    selectionValue.current = imageSelection;
    selection$.next(imageSelection);
    doc.getBlockById.and.throwError("missing");
    tick(250);

    expect(doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
    plugin.destroy();
    rootHost.remove();
  }));

  it("does not run toolbar actions when the image block becomes stale", fakeAsync(() => {
    const {plugin, doc, rootHost, selection$, selectionValue, imageSelection, imageBlock} = makeHarness();
    plugin.init();

    selectionValue.current = imageSelection;
    selection$.next(imageSelection);
    tick(250);
    const onItemClicked = doc.overlayService.createConnectedOverlay.calls.mostRecent()
      .returnValue.componentRef.instance.onItemClicked as Subject<any>;

    doc.getBlockById.and.throwError("missing");
    onItemClicked.next({name: "align", value: "center"});

    expect(imageBlock.updateProps).not.toHaveBeenCalled();
    plugin.destroy();
    rootHost.remove();
  }));

  it("replaces a live image with an inline-image paragraph and moves the caret to its end", fakeAsync(() => {
    const h = makeHarness();
    h.doc.model.toSnapshot.and.returnValue({
      id: "img-1",
      flavour: "image",
      nodeType: BlockNodeType.block,
      props: {src: "https://example.com/a.png", width: 320, height: 180},
      meta: {},
      children: [],
    });
    h.plugin.init();

    h.selectionValue.current = h.imageSelection;
    h.selection$.next(h.imageSelection);
    tick(250);
    h.toolbarClicks.next({name: "inline"});

    const paragraph = h.replaceWithSnapshots.calls.mostRecent().args[1][0];
    expect(h.replaceWithSnapshots).toHaveBeenCalledOnceWith("img-1", [paragraph]);
    expect(paragraph.children[0]).toEqual({
      insert: {image: "https://example.com/a.png"},
      attributes: {width: 320, height: 180},
    });
    expect(h.selectOrSetCursorAtBlock).toHaveBeenCalledOnceWith(paragraph.id, false);
    expect(h.run).toHaveBeenCalledTimes(1);

    h.plugin.destroy();
    h.rootHost.remove();
  }));

  it("keeps an empty-src image block unchanged", fakeAsync(() => {
    const h = makeHarness();
    h.doc.model.toSnapshot.and.returnValue({
      id: "img-1",
      flavour: "image",
      nodeType: BlockNodeType.block,
      props: {src: ""},
      meta: {},
      children: [],
    });
    h.plugin.init();

    h.selectionValue.current = h.imageSelection;
    h.selection$.next(h.imageSelection);
    tick(250);
    h.toolbarClicks.next({name: "inline"});

    expect(h.replaceWithSnapshots).not.toHaveBeenCalled();
    expect(h.doc.messageService.warn).toHaveBeenCalledOnceWith("图片地址为空，无法转为行内图片");

    h.plugin.destroy();
    h.rootHost.remove();
  }));

  it("ignores readonly state changes while the live selection is stale", () => {
    const {plugin, doc, rootHost, selectionValue, readonlyState$} = makeHarness();
    const staleSelection = {
      anchor: {blockId: "missing", type: "selected"},
      head: {blockId: "missing", type: "selected"},
      commonParent: "missing",
    } as any;
    Object.defineProperty(staleSelection, "firstBlock", {
      get: () => {
        throw new Error("Block not found: missing");
      },
    });
    selectionValue.current = staleSelection;
    plugin.init();

    expect(() => readonlyState$.next()).not.toThrow();

    plugin.destroy();
    rootHost.remove();
  });

  it("does not open toolbar for image gap cursor", fakeAsync(() => {
    const {plugin, doc, rootHost, selection$, selectionValue, imageGapSelection} = makeHarness();
    plugin.init();

    selectionValue.current = imageGapSelection;
    selection$.next(imageGapSelection);
    tick(250);

    expect(doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
    plugin.destroy();
    rootHost.remove();
  }));

  it("tears down document pointer and readonly observers on destroy", fakeAsync(() => {
    const {plugin, doc, rootHost, wrapper, selection$, selectionValue, imageSelection, readonlySub} = makeHarness();
    plugin.init();

    selectionValue.current = imageSelection;
    selection$.next(imageSelection);
    plugin.destroy();
    tick(250);
    wrapper.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}));

    expect(doc.overlayService.createConnectedOverlay).not.toHaveBeenCalled();
    expect(doc.selection.selectBlock).not.toHaveBeenCalled();
    expect(doc.dragController.startDrag).not.toHaveBeenCalled();
    expect(readonlySub.unsubscribe).toHaveBeenCalledTimes(1);
    rootHost.remove();
  }));
});
