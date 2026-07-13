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
    const doc = {
      isReadonly: false,
      onDestroy$,
      root: {hostElement: rootHost},
      injector: {
        get: jasmine.createSpy("get").and.returnValue({
          previewImg: jasmine.createSpy("previewImg"),
          downloadAttachment: jasmine.createSpy("downloadAttachment"),
        }),
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
              onItemClicked: new Subject<any>(),
            },
          },
          overlayRef: {
            dispose: jasmine.createSpy("dispose"),
            updatePosition: jasmine.createSpy("updatePosition"),
          },
        }),
      },
      subscribeReadonlyChange: jasmine.createSpy("subscribeReadonlyChange").and.returnValue(readonlySub),
      getBlockById: jasmine.createSpy("getBlockById").and.returnValue(imageBlock),
    };
    const plugin = new ImgToolbarPlugin();
    (plugin as any).doc = doc;

    return {plugin, doc, rootHost, wrapper, imageHost, imageBlock, selection$, nextSelection$, selectionValue, imageSelection, imageGapSelection, readonlySub, dragState$, dragState};
  };

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
