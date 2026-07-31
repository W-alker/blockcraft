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
      firstBlockId: imageBlock.id,
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
    const placementState$ = new Subject<string>();
    const placementDragState = {current: "idle"};
    const placementMode = {current: "relative" as "relative" | "absolute"};
    let objectLayoutAdapter: any;
    const toolbarClicks = new Subject<any>();
    const fileService = {
      previewImg: jasmine.createSpy("previewImg"),
      downloadAttachment: jasmine.createSpy("downloadAttachment"),
      isLocalObjectURL: jasmine.createSpy("isLocalObjectURL")
        .and.callFake((url: string) => url.startsWith("__blockcraft_local__:")),
    };
    const run = jasmine.createSpy("run").and.resolveTo({lastResult: undefined, results: []});
    const nextTick = jasmine.createSpy("nextTick");
    const selectOrSetCursorAtBlock = jasmine.createSpy("selectOrSetCursorAtBlock");
    const replaceWithSnapshots = jasmine.createSpy("replaceWithSnapshots");
    const crudTransact = jasmine.createSpy("crudTransact")
      .and.callFake((executor: () => unknown) => executor());
    let doc: any;
    const transact = jasmine.createSpy("transact").and.callFake((executor: (doc: any) => unknown) => {
      executor(doc);
      return chain;
    });
    const chain: any = {transact, nextTick, selectOrSetCursorAtBlock, run};
    nextTick.and.returnValue(chain);
    selectOrSetCursorAtBlock.and.returnValue(chain);
    doc = {
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
      crud: {
        transact: crudTransact,
        replaceWithSnapshots,
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
        blur: jasmine.createSpy("blur"),
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
      placement: {
        state$: placementState$,
        get state() {
          return placementDragState.current;
        },
        get isDragging() {
          return placementDragState.current === "dragging";
        },
        getState: jasmine.createSpy("getPlacementState").and.callFake(() => ({
          mode: placementMode.current,
          x: 0,
          y: 0,
          layer: "over",
        })),
        startDrag: jasmine.createSpy("startPlacementDrag"),
        registerObjectLayoutAdapter: jasmine.createSpy("registerObjectLayoutAdapter")
          .and.callFake((_flavour: string, adapter: any) => {
            objectLayoutAdapter = adapter;
            return () => {
              if (objectLayoutAdapter === adapter) objectLayoutAdapter = undefined;
            };
          }),
        getObjectLayout: jasmine.createSpy("getObjectLayout").and.callFake(() =>
          placementMode.current === "relative" ? "top-bottom" : "over"),
        setObjectLayout: jasmine.createSpy("setObjectLayout")
          .and.callFake((block: any, layout: string) => {
            if (layout === "inline") {
              return objectLayoutAdapter?.toInline({doc, block}) ?? false;
            }
            placementMode.current =
              layout === "top-bottom" ? "relative" : "absolute";
            return true;
          }),
        setMode: jasmine.createSpy("setPlacementMode").and.returnValue(true),
        setLayer: jasmine.createSpy("setPlacementLayer").and.returnValue(true),
        canMoveForward: jasmine.createSpy("canMoveForward").and.returnValue(true),
        canMoveBackward: jasmine.createSpy("canMoveBackward").and.returnValue(true),
        moveForward: jasmine.createSpy("moveForward").and.returnValue(true),
        moveBackward: jasmine.createSpy("moveBackward").and.returnValue(true),
        resolveFlowAnchor: jasmine.createSpy("resolveFlowAnchor").and.returnValue({
          parentId: "root",
          anchorBlockId: "paragraph-1",
          side: "after",
        }),
        reanchorToFlow: jasmine.createSpy("reanchorToFlow").and.returnValue(true),
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
      placementState$,
      placementDragState,
      placementMode,
      toolbarClicks,
      transact,
      crudTransact,
      nextTick,
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

  it("opens preview when an editable selected image receives the double click", () => {
    const {
      plugin,
      fileService,
      rootHost,
      imageHost,
    } = makeHarness();
    const img = imageHost.querySelector("img")!;
    imageHost.classList.add("selected");
    const event = new MouseEvent("dblclick", {bubbles: true});
    Object.defineProperty(event, "target", {value: img});

    expect(plugin.onImageMouseDown({
      getDefaultEvent: () => event,
    } as any)).toBeTrue();
    expect(fileService.previewImg).toHaveBeenCalledOnceWith({el: img});
    rootHost.remove();
  });

  it("opens preview for an absolute image without depending on the wrapper target", () => {
    const {
      plugin,
      fileService,
      rootHost,
      imageHost,
      placementMode,
    } = makeHarness();
    placementMode.current = "absolute";
    const img = imageHost.querySelector("img")!;
    const event = new MouseEvent("dblclick", {bubbles: true});
    Object.defineProperty(event, "target", {value: img});

    expect(plugin.onImageMouseDown({
      getDefaultEvent: () => event,
    } as any)).toBeTrue();
    expect(fileService.previewImg).toHaveBeenCalledOnceWith({el: img});
    rootHost.remove();
  });

  it("does not preview from resize and resource action controls", () => {
    const {plugin, fileService, rootHost, wrapper} = makeHarness();
    const resizer = document.createElement("block-resizer");
    const resourcePlaceholder = document.createElement("div");
    const retry = document.createElement("button");
    resourcePlaceholder.className = "bc-resource-placeholder";
    resourcePlaceholder.append(retry);
    wrapper.append(resizer, resourcePlaceholder);

    for (const target of [resizer, retry]) {
      const event = new MouseEvent("dblclick", {bubbles: true});
      Object.defineProperty(event, "target", {value: target});
      expect(plugin.onImageMouseDown({
        getDefaultEvent: () => event,
      } as any)).toBeUndefined();
    }

    expect(fileService.previewImg).not.toHaveBeenCalled();
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

  it("free-drags an absolute image instead of reordering it", () => {
    const {plugin, doc, rootHost, wrapper, imageBlock, placementMode} = makeHarness();
    placementMode.current = "absolute";
    plugin.init();

    wrapper.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0}));

    expect(doc.selection.selectBlock).toHaveBeenCalledWith(imageBlock as any);
    expect(doc.placement.startDrag).toHaveBeenCalledWith(
      jasmine.any(PointerEvent),
      imageBlock as any,
    );
    expect(doc.dragController.startDrag).not.toHaveBeenCalled();
    plugin.destroy();
    rootHost.remove();
  });

  it("re-publishes an already-selected image when its toolbar was closed", () => {
    const {
      plugin,
      doc,
      rootHost,
      wrapper,
      imageBlock,
      imageSelection,
      selectionValue,
      placementMode,
    } = makeHarness();
    placementMode.current = "absolute";
    selectionValue.current = imageSelection;
    plugin.init();

    wrapper.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
    }));

    expect(doc.selection.blur).toHaveBeenCalledTimes(1);
    expect(doc.selection.selectBlock).toHaveBeenCalledWith(imageBlock as any);
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

  it("confirms an absolute image selection when the pointer never starts dragging", () => {
    const {plugin, doc, rootHost, wrapper, imageBlock, placementMode} = makeHarness();
    placementMode.current = "absolute";
    plugin.init();

    wrapper.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0, pointerId: 1}));
    window.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, pointerId: 1}));

    expect(doc.selection.selectBlock).toHaveBeenCalledTimes(2);
    expect(doc.selection.selectBlock).toHaveBeenCalledWith(imageBlock as any);
    plugin.destroy();
    rootHost.remove();
  });

  it("does not reconfirm an absolute image selection after free dragging", () => {
    const {
      plugin,
      doc,
      rootHost,
      wrapper,
      placementMode,
      placementDragState,
      placementState$,
    } = makeHarness();
    placementMode.current = "absolute";
    plugin.init();

    wrapper.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, button: 0, pointerId: 1}));
    placementDragState.current = "dragging";
    placementState$.next("dragging");
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

  it("switches image layout through the document manager", fakeAsync(() => {
    const h = makeHarness();
    h.plugin.init();

    h.selectionValue.current = h.imageSelection;
    h.selection$.next(h.imageSelection);
    tick(250);
    h.toolbarClicks.next({name: "object-layout", value: "over"});

    expect(h.doc.placement.setObjectLayout).toHaveBeenCalledOnceWith(
      h.imageBlock as any,
      "over",
    );
    h.plugin.destroy();
    h.rootHost.remove();
  }));

  it("switches a floating image layout through the document manager", fakeAsync(() => {
    const h = makeHarness();
    h.placementMode.current = "absolute";
    h.plugin.init();

    h.selectionValue.current = h.imageSelection;
    h.selection$.next(h.imageSelection);
    tick(250);
    h.toolbarClicks.next({name: "object-layout", value: "under"});

    expect(h.doc.placement.setObjectLayout).toHaveBeenCalledWith(
      h.imageBlock as any,
      "under",
    );
    expect(h.doc.placement.setObjectLayout).toHaveBeenCalledTimes(1);
    h.plugin.destroy();
    h.rootHost.remove();
  }));

  it("moves a floating image one stack step through the document manager", fakeAsync(() => {
    const h = makeHarness();
    h.placementMode.current = "absolute";
    h.plugin.init();

    h.selectionValue.current = h.imageSelection;
    h.selection$.next(h.imageSelection);
    tick(250);
    h.toolbarClicks.next({name: "move-forward"});
    h.toolbarClicks.next({name: "move-backward"});

    expect(h.doc.placement.moveForward).toHaveBeenCalledOnceWith(
      h.imageBlock as any,
    );
    expect(h.doc.placement.moveBackward).toHaveBeenCalledOnceWith(
      h.imageBlock as any,
    );
    expect(h.imageBlock.updateProps).not.toHaveBeenCalled();
    h.plugin.destroy();
    h.rootHost.remove();
  }));

  it("ignores a disabled stack toolbar item", fakeAsync(() => {
    const h = makeHarness();
    h.placementMode.current = "absolute";
    h.plugin.init();

    h.selectionValue.current = h.imageSelection;
    h.selection$.next(h.imageSelection);
    tick(250);
    h.toolbarClicks.next({name: "move-forward", disabled: true});

    expect(h.doc.placement.moveForward).not.toHaveBeenCalled();
    h.plugin.destroy();
    h.rootHost.remove();
  }));

  it("replaces a relative image in place without reanchoring it", fakeAsync(() => {
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
    h.toolbarClicks.next({name: "object-layout", value: "inline"});

    const paragraph = h.replaceWithSnapshots.calls.mostRecent().args[1][0];
    expect(h.doc.placement.resolveFlowAnchor).not.toHaveBeenCalled();
    expect(h.doc.placement.reanchorToFlow).not.toHaveBeenCalled();
    expect(h.crudTransact).toHaveBeenCalledTimes(1);
    expect(h.replaceWithSnapshots).toHaveBeenCalledOnceWith("img-1", [paragraph]);
    expect(paragraph.children[0]).toEqual({
      insert: {image: "https://example.com/a.png"},
      attributes: {width: 320, height: 180},
    });
    expect(h.nextTick).toHaveBeenCalledTimes(1);
    expect(h.selectOrSetCursorAtBlock).toHaveBeenCalledOnceWith(paragraph.id, false);
    expect(h.run).toHaveBeenCalledTimes(1);

    h.plugin.destroy();
    h.rootHost.remove();
  }));

  it("reanchors an absolute image before replacing it with an inline paragraph", fakeAsync(() => {
    const h = makeHarness();
    h.placementMode.current = "absolute";
    h.doc.model.toSnapshot.and.returnValue({
      id: "img-1",
      flavour: "image",
      nodeType: BlockNodeType.block,
      props: {
        src: "https://example.com/a.png",
        placement: {mode: "absolute", x: 24, y: 32},
      },
      meta: {},
      children: [],
    });
    h.plugin.init();

    h.selectionValue.current = h.imageSelection;
    h.selection$.next(h.imageSelection);
    tick(250);
    h.toolbarClicks.next({name: "object-layout", value: "inline"});

    expect(h.doc.placement.resolveFlowAnchor).toHaveBeenCalledOnceWith(h.imageBlock);
    expect(h.doc.placement.reanchorToFlow).toHaveBeenCalledOnceWith(
      h.imageBlock,
      {
        parentId: "root",
        anchorBlockId: "paragraph-1",
        side: "after",
      },
    );
    expect(h.replaceWithSnapshots).toHaveBeenCalledTimes(1);
    expect(h.selectOrSetCursorAtBlock).toHaveBeenCalledTimes(1);

    h.plugin.destroy();
    h.rootHost.remove();
  }));

  it("keeps an absolute image when it cannot be reanchored", fakeAsync(() => {
    const h = makeHarness();
    h.placementMode.current = "absolute";
    h.doc.placement.reanchorToFlow.and.returnValue(false);
    h.doc.model.toSnapshot.and.returnValue({
      id: "img-1",
      flavour: "image",
      nodeType: BlockNodeType.block,
      props: {
        src: "https://example.com/a.png",
        placement: {mode: "absolute", x: 24, y: 32},
      },
      meta: {},
      children: [],
    });
    h.plugin.init();

    h.selectionValue.current = h.imageSelection;
    h.selection$.next(h.imageSelection);
    tick(250);
    h.toolbarClicks.next({name: "object-layout", value: "inline"});

    expect(h.replaceWithSnapshots).not.toHaveBeenCalled();
    expect(h.selectOrSetCursorAtBlock).not.toHaveBeenCalled();
    expect(h.doc.messageService.warn).toHaveBeenCalledOnceWith(
      "图片无法回到正文位置，未转换为嵌入型",
    );

    h.plugin.destroy();
    h.rootHost.remove();
  }));

  it("waits for a local image upload before converting it to inline", fakeAsync(() => {
    const h = makeHarness();
    const localSrc = "__blockcraft_local__:blob:test";
    h.imageBlock.props.src = localSrc;
    h.doc.model.toSnapshot.and.callFake(() => ({
      id: "img-1",
      flavour: "image",
      nodeType: BlockNodeType.block,
      props: {src: h.imageBlock.props.src, width: 320, height: 180},
      meta: {},
      children: [],
    }));
    h.plugin.init();

    h.selectionValue.current = h.imageSelection;
    h.selection$.next(h.imageSelection);
    tick(250);
    h.toolbarClicks.next({name: "object-layout", value: "inline"});

    expect(h.replaceWithSnapshots).not.toHaveBeenCalled();
    expect(h.doc.messageService.warn).toHaveBeenCalledOnceWith(
      "图片正在上传，完成后将自动转为嵌入型",
    );

    h.imageBlock.props.src = "https://example.com/uploaded.png";
    h.imageBlock.onPropsChange.next();

    const paragraph = h.replaceWithSnapshots.calls.mostRecent().args[1][0];
    expect(h.replaceWithSnapshots).toHaveBeenCalledTimes(1);
    expect(paragraph.children[0].insert).toEqual({
      image: "https://example.com/uploaded.png",
    });

    h.plugin.destroy();
    h.rootHost.remove();
  }));

  it("keeps the image block when a deferred inline conversion upload fails", fakeAsync(() => {
    const h = makeHarness();
    h.imageBlock.props.src = "__blockcraft_local__:blob:test";
    h.doc.model.toSnapshot.and.callFake(() => ({
      id: "img-1",
      flavour: "image",
      nodeType: BlockNodeType.block,
      props: {src: h.imageBlock.props.src},
      meta: {},
      children: [],
    }));
    h.plugin.init();

    h.selectionValue.current = h.imageSelection;
    h.selection$.next(h.imageSelection);
    tick(250);
    h.toolbarClicks.next({name: "object-layout", value: "inline"});

    h.imageBlock.props.src = "";
    h.imageBlock.onPropsChange.next();

    expect(h.replaceWithSnapshots).not.toHaveBeenCalled();
    expect(h.doc.messageService.warn).toHaveBeenCalledWith(
      "图片上传失败，未转换为嵌入型",
    );

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
    h.toolbarClicks.next({name: "object-layout", value: "inline"});

    expect(h.replaceWithSnapshots).not.toHaveBeenCalled();
    expect(h.doc.messageService.warn).toHaveBeenCalledOnceWith("图片地址为空，无法转换为嵌入型");

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
