import {fakeAsync, tick} from "@angular/core/testing";
import {Subject} from "rxjs";
import {BlockNodeType} from "../../framework";
import {BlockSelection} from "../../framework/modules/selection/blockSelection";
import {BlockControllerPlugin} from "./index";

describe("BlockControllerPlugin selection range handling", () => {
  const makeHarness = () => {
    const rootHost = document.createElement("div");
    const p1Host = document.createElement("p");
    const p2Host = document.createElement("p");
    const outsideHost = document.createElement("p");
    rootHost.append(p1Host, p2Host, outsideHost);
    document.body.appendChild(rootHost);

    const root = {
      id: "root",
      flavour: "root",
      nodeType: BlockNodeType.root,
      hostElement: rootHost,
      childrenIds: ["p1", "p2", "outside"],
      childrenLength: 3,
    };
    const makeBlock = (id: string, hostElement: HTMLElement, index: number) => ({
      id,
      flavour: "paragraph",
      nodeType: BlockNodeType.editable,
      hostElement,
      parentId: "root",
      parentBlock: root,
      props: {depth: 0},
      textLength: 1,
      getIndexOfParent: () => index,
    });
    const p1 = makeBlock("p1", p1Host, 0);
    const p2 = makeBlock("p2", p2Host, 1);
    const outside = makeBlock("outside", outsideHost, 2);
    const blocks: Record<string, any> = {root, p1, p2, outside};
    const queryBlocksBetween = jasmine.createSpy("queryBlocksBetween").and.callFake((
      from: {id: string},
      to: {id: string},
      contain = false,
    ) => {
      const fromIndex = root.childrenIds.indexOf(from.id);
      const toIndex = root.childrenIds.indexOf(to.id);
      return root.childrenIds.slice(
        Math.min(fromIndex, toIndex) + (contain ? 0 : 1),
        Math.max(fromIndex, toIndex) + (contain ? 1 : 0),
      );
    });
    const selection = (from: number, to: number) => new BlockSelection(
      {blockId: "root", type: "boundary", index: from, block: root} as any,
      {blockId: "root", type: "boundary", index: to, block: root} as any,
      "root",
      id => blocks[id],
      (a, b) => blocks[a].hostElement.compareDocumentPosition(blocks[b].hostElement),
    );
    const doc = {
      selection: {value: null as BlockSelection | null},
      queryBlocksBetween,
      getBlockById: (id: string) => blocks[id],
    };
    const plugin = new BlockControllerPlugin();
    (plugin as any).doc = doc;

    return {plugin, doc, p1, p2, outside, rootHost, selection, queryBlocksBetween};
  };

  it("does not resolve an active range block for a boundary range covering one block", () => {
    const {plugin, rootHost, selection, queryBlocksBetween} = makeHarness();
    const sel = selection(0, 1);

    expect((plugin as any).resolveSelectionActiveBlock(sel)).toBeNull();
    expect(queryBlocksBetween).not.toHaveBeenCalled();
    rootHost.remove();
  });

  it("resolves the first selected block for a boundary range covering multiple blocks", () => {
    const {plugin, p1, rootHost, selection, queryBlocksBetween} = makeHarness();
    const sel = selection(0, 2);

    expect((plugin as any).resolveSelectionActiveBlock(sel)).toBe(p1);
    expect(queryBlocksBetween).not.toHaveBeenCalled();
    rootHost.remove();
  });

  it("does not activate a whole-block selected absolute block", () => {
    const {plugin, doc, p1, rootHost} = makeHarness();
    (doc as any).placement = {
      getState: jasmine.createSpy("getState").and.returnValue({
        mode: "absolute",
        x: 0,
        y: 0,
        layer: "under",
      }),
    };
    const selected = new BlockSelection(
      {blockId: p1.id, type: "selected", block: p1} as any,
      {blockId: p1.id, type: "selected", block: p1} as any,
      "root",
      id => ({root: p1.parentBlock, [p1.id]: p1} as Record<string, any>)[id],
      () => 0,
    );

    expect((plugin as any).resolveSelectionActiveBlock(selected)).toBeNull();
    rootHost.remove();
  });

  it("exposes and handles the Word-like object layouts", () => {
    const {plugin, doc, p1, rootHost} = makeHarness();
    const setObjectLayout = jasmine.createSpy("setObjectLayout").and.returnValue(true);
    (doc as any).placement = {
      supportsObjectLayout: jasmine.createSpy("supportsObjectLayout")
        .and.callFake((_block: any, layout: string) => layout !== "inline"),
      getObjectLayout: jasmine.createSpy("getObjectLayout").and.returnValue("over"),
      setObjectLayout,
    };
    const ctx = {activeBlock: p1} as any;

    const sections = (plugin as any).resolvePlacementMenu(ctx);
    const layoutMenu = sections[0].items.find(
      (item: {name: string}) => item.name === "block-object-layout",
    );
    expect(layoutMenu.items.map((item: {label: string}) => item.label))
      .toEqual(["上下型", "衬于文字下方", "浮于文字上方"]);
    expect(layoutMenu.items.map((item: {icon: string}) => item.icon))
      .toEqual(["bc_fuwenben-shangxia", "bc_cengji-xia", "bc_cengji-shang"]);
    expect(layoutMenu.items[2].active).toBeTrue();

    expect((plugin as any).handlePlacementMenuAction({
      item: {name: "block-object-layout-under"},
    }, ctx)).toBeTrue();
    expect(setObjectLayout).toHaveBeenCalledOnceWith(p1, "under");

    expect((plugin as any).handlePlacementMenuAction({
      item: {name: "block-object-layout-over"},
    }, ctx)).toBeTrue();
    expect(setObjectLayout).toHaveBeenCalledWith(p1, "over");
    rootHost.remove();
  });

  it("ignores stale selection range blocks that were deleted", () => {
    const {plugin, rootHost, selection, queryBlocksBetween} = makeHarness();
    const sel = selection(0, 2);
    (plugin as any).doc.getBlockById = jasmine.createSpy("getBlockById").and.throwError("missing");

    expect((plugin as any).resolveSelectionActiveBlock(sel)).toBeNull();
    expect(queryBlocksBetween).not.toHaveBeenCalled();
    rootHost.remove();
  });

  it("keeps drag data single-block for a boundary range covering one block", () => {
    const {plugin, doc, p1, rootHost, selection} = makeHarness();
    doc.selection.value = selection(0, 1);

    expect((plugin as any).resolveDragData(p1)).toEqual({kind: "origin-block", blockId: "p1"});
    rootHost.remove();
  });

  it("uses multi-block drag data only when the active block is inside a multi-block range", () => {
    const {plugin, doc, p1, outside, rootHost, selection} = makeHarness();
    doc.selection.value = selection(0, 2);

    expect((plugin as any).resolveDragData(p1)).toEqual({kind: "origin-blocks", blockIds: ["p1", "p2"]});
    expect((plugin as any).resolveDragData(outside)).toEqual({kind: "origin-block", blockId: "outside"});
    rootHost.remove();
  });

  it("tears down selection and hover observers on destroy", fakeAsync(() => {
    const rootHost = document.createElement("div");
    const p1Host = document.createElement("p");
    const triggerHost = document.createElement("button");
    rootHost.append(p1Host);
    document.body.appendChild(rootHost);
    p1Host.setAttribute("data-block-id", "p1");
    p1Host.contentEditable = "true";

    const root = {
      id: "root",
      flavour: "root",
      nodeType: BlockNodeType.root,
      hostElement: rootHost,
      childrenIds: ["p1"],
      childrenLength: 1,
    };
    const p1 = {
      id: "p1",
      flavour: "paragraph",
      nodeType: BlockNodeType.editable,
      hostElement: p1Host,
      parentId: "root",
      parentBlock: root,
      props: {depth: 0},
      getIndexOfParent: () => 0,
    };
    const selection$ = new Subject<BlockSelection | null>();
    const onDestroy$ = new Subject<void>();
    const readonlySub = {
      unsubscribe: jasmine.createSpy("unsubscribeReadonly"),
    };
    const cpr = {
      location: {nativeElement: triggerHost},
      instance: {
        closed: new Subject<void>(),
        menuDisabled: false,
        cdr: {detectChanges: jasmine.createSpy("detectChanges")},
      },
      setInput: jasmine.createSpy("setInput"),
      destroy: jasmine.createSpy("destroy"),
    };
    const vcr = {
      createComponent: jasmine.createSpy("createComponent").and.returnValue(cpr),
    };
    const doc = {
      isReadonly: false,
      onDestroy$,
      injector: {get: jasmine.createSpy("get").and.returnValue(vcr)},
      root,
      schemas: {
        get: jasmine.createSpy("get").and.returnValue({metadata: {isLeaf: false}}),
      },
      selection: {
        value: null,
        selectionChange$: selection$,
      },
      dragController: {
        state$: new Subject<string>(),
        startDrag: jasmine.createSpy("startDrag"),
      },
      subscribeReadonlyChange: jasmine.createSpy("subscribeReadonlyChange").and.returnValue(readonlySub),
      getBlockById: jasmine.createSpy("getBlockById").and.returnValue(p1),
      queryBlocksBetween: jasmine.createSpy("queryBlocksBetween").and.returnValue([]),
    };
    const plugin = new BlockControllerPlugin();
    (plugin as any).doc = doc;
    const selection = new BlockSelection(
      {blockId: "root", type: "boundary", index: 0, block: root} as any,
      {blockId: "root", type: "boundary", index: 1, block: root} as any,
      "root",
      id => ({root, p1} as Record<string, any>)[id],
      () => 0,
    );

    plugin.init();
    const callsAfterInit = cpr.setInput.calls.count();
    plugin.destroy();

    selection$.next(selection);
    p1Host.dispatchEvent(new MouseEvent("mouseover", {bubbles: true}));
    tick(1);

    expect(cpr.setInput.calls.count()).toBe(callsAfterInit);
    expect(readonlySub.unsubscribe).toHaveBeenCalledTimes(1);
    expect(cpr.destroy).toHaveBeenCalledTimes(1);
    rootHost.remove();
  }));

  it("does not activate a hover block deleted before the hover timer fires", fakeAsync(() => {
    const rootHost = document.createElement("div");
    const p1Host = document.createElement("p");
    const triggerHost = document.createElement("button");
    rootHost.append(p1Host);
    document.body.appendChild(rootHost);
    p1Host.setAttribute("data-block-id", "p1");
    p1Host.contentEditable = "true";

    const root = {
      id: "root",
      flavour: "root",
      nodeType: BlockNodeType.root,
      hostElement: rootHost,
      childrenIds: ["p1"],
      childrenLength: 1,
    };
    const p1 = {
      id: "p1",
      flavour: "paragraph",
      nodeType: BlockNodeType.editable,
      hostElement: p1Host,
      parentId: "root",
      parentBlock: root,
      props: {depth: 0},
      getIndexOfParent: () => 0,
    };
    const cpr = {
      location: {nativeElement: triggerHost},
      instance: {
        closed: new Subject<void>(),
        menuDisabled: false,
        cdr: {detectChanges: jasmine.createSpy("detectChanges")},
      },
      setInput: jasmine.createSpy("setInput"),
      destroy: jasmine.createSpy("destroy"),
    };
    const vcr = {
      createComponent: jasmine.createSpy("createComponent").and.returnValue(cpr),
    };
    const doc = {
      isReadonly: false,
      onDestroy$: new Subject<void>(),
      injector: {get: jasmine.createSpy("get").and.returnValue(vcr)},
      root,
      schemas: {
        get: jasmine.createSpy("get").and.returnValue({metadata: {isLeaf: false}}),
      },
      selection: {
        value: null,
        selectionChange$: new Subject<BlockSelection | null>(),
      },
      dragController: {
        state$: new Subject<string>(),
        startDrag: jasmine.createSpy("startDrag"),
      },
      subscribeReadonlyChange: jasmine.createSpy("subscribeReadonlyChange").and.returnValue({
        unsubscribe: jasmine.createSpy("unsubscribeReadonly"),
      }),
      getBlockById: jasmine.createSpy("getBlockById").and.returnValue(p1),
      queryBlocksBetween: jasmine.createSpy("queryBlocksBetween").and.returnValue([]),
    };
    const plugin = new BlockControllerPlugin();
    (plugin as any).doc = doc;

    plugin.init();
    p1Host.dispatchEvent(new MouseEvent("mouseover", {bubbles: true}));
    doc.getBlockById.and.throwError("missing");
    tick(1);

    expect(cpr.setInput).not.toHaveBeenCalledWith("activeBlock", p1);
    plugin.destroy();
    rootHost.remove();
  }));

  it("clears a stale active block on selection changes", () => {
    const rootHost = document.createElement("div");
    const p1Host = document.createElement("p");
    const triggerHost = document.createElement("button");
    rootHost.append(p1Host);
    document.body.appendChild(rootHost);

    const root = {
      id: "root",
      flavour: "root",
      nodeType: BlockNodeType.root,
      hostElement: rootHost,
      childrenIds: ["p1"],
      childrenLength: 1,
    };
    const p1 = {
      id: "p1",
      flavour: "paragraph",
      nodeType: BlockNodeType.editable,
      hostElement: p1Host,
      parentId: "root",
      parentBlock: root,
      props: {depth: 0},
      getIndexOfParent: () => 0,
    };
    const selection$ = new Subject<BlockSelection | null>();
    const cpr = {
      location: {nativeElement: triggerHost},
      instance: {
        closed: new Subject<void>(),
        menuDisabled: false,
        cdr: {detectChanges: jasmine.createSpy("detectChanges")},
      },
      setInput: jasmine.createSpy("setInput"),
      destroy: jasmine.createSpy("destroy"),
    };
    const doc = {
      isReadonly: false,
      onDestroy$: new Subject<void>(),
      injector: {get: jasmine.createSpy("get").and.returnValue({
        createComponent: jasmine.createSpy("createComponent").and.returnValue(cpr),
      })},
      root,
      schemas: {
        get: jasmine.createSpy("get").and.returnValue({metadata: {isLeaf: false}}),
      },
      selection: {
        value: null,
        selectionChange$: selection$,
      },
      dragController: {
        state$: new Subject<string>(),
        startDrag: jasmine.createSpy("startDrag"),
      },
      subscribeReadonlyChange: jasmine.createSpy("subscribeReadonlyChange").and.returnValue({
        unsubscribe: jasmine.createSpy("unsubscribeReadonly"),
      }),
      getBlockById: jasmine.createSpy("getBlockById").and.returnValue(p1),
      queryBlocksBetween: jasmine.createSpy("queryBlocksBetween").and.returnValue([]),
    };
    const plugin = new BlockControllerPlugin();
    (plugin as any).doc = doc;
    plugin.init();
    (plugin as any)._activeBlock = p1;

    doc.getBlockById.and.throwError("missing");
    selection$.next(null);

    expect(cpr.setInput).toHaveBeenCalledWith("activeBlock", null);
    plugin.destroy();
    rootHost.remove();
  });

  it("does not start dragging when the active block became stale or protected", () => {
    const rootHost = document.createElement("div");
    const p1Host = document.createElement("p");
    const triggerHost = document.createElement("button");
    rootHost.append(p1Host);
    document.body.appendChild(rootHost);

    const root = {
      id: "root",
      flavour: "root",
      nodeType: BlockNodeType.root,
      hostElement: rootHost,
      childrenIds: ["p1"],
      childrenLength: 1,
    };
    const p1 = {
      id: "p1",
      flavour: "paragraph",
      nodeType: BlockNodeType.editable,
      hostElement: p1Host,
      parentId: "root",
      parentBlock: root,
      props: {depth: 0},
      getIndexOfParent: () => 0,
    };
    const cpr = {
      location: {nativeElement: triggerHost},
      instance: {
        closed: new Subject<void>(),
        menuDisabled: false,
        cdr: {detectChanges: jasmine.createSpy("detectChanges")},
      },
      setInput: jasmine.createSpy("setInput"),
      destroy: jasmine.createSpy("destroy"),
    };
    const doc = {
      isReadonly: false,
      onDestroy$: new Subject<void>(),
      injector: {get: jasmine.createSpy("get").and.returnValue({
        createComponent: jasmine.createSpy("createComponent").and.returnValue(cpr),
      })},
      root,
      schemas: {
        get: jasmine.createSpy("get").and.returnValue({metadata: {isLeaf: false}}),
      },
      selection: {
        value: null,
        selectionChange$: new Subject<BlockSelection | null>(),
      },
      dragController: {
        state$: new Subject<string>(),
        startDrag: jasmine.createSpy("startDrag"),
      },
      subscribeReadonlyChange: jasmine.createSpy("subscribeReadonlyChange").and.returnValue({
        unsubscribe: jasmine.createSpy("unsubscribeReadonly"),
      }),
      getBlockById: jasmine.createSpy("getBlockById").and.returnValue(p1),
      queryBlocksBetween: jasmine.createSpy("queryBlocksBetween").and.returnValue([]),
    };
    const plugin = new BlockControllerPlugin();
    (plugin as any).doc = doc;
    plugin.init();
    (plugin as any)._activeBlock = p1;

    doc.getBlockById.and.returnValue({...p1});
    triggerHost.dispatchEvent(new PointerEvent("pointerdown", {button: 0, bubbles: true}));

    expect(doc.dragController.startDrag).not.toHaveBeenCalled();
    expect(cpr.setInput).toHaveBeenCalledWith("activeBlock", null);

    doc.getBlockById.and.returnValue(p1);
    (doc as any).readonlyManager = {
      isReadonly: jasmine.createSpy("isReadonly").and.returnValue(true),
      containsReadonly: jasmine.createSpy("containsReadonly").and.returnValue(false),
    };
    (plugin as any)._activeBlock = p1;
    triggerHost.dispatchEvent(new PointerEvent("pointerdown", {button: 0, bubbles: true}));

    expect(doc.dragController.startDrag).not.toHaveBeenCalled();
    plugin.destroy();
    rootHost.remove();
  });

  it("reactivates the same hovered block after the trigger closes itself", fakeAsync(() => {
    const rootHost = document.createElement("div");
    const p1Host = document.createElement("p");
    const triggerHost = document.createElement("button");
    rootHost.appendChild(p1Host);
    document.body.appendChild(rootHost);
    p1Host.setAttribute("data-block-id", "p1");
    p1Host.contentEditable = "true";

    const root = {
      id: "root",
      flavour: "root",
      nodeType: BlockNodeType.root,
      hostElement: rootHost,
      childrenIds: ["p1"],
      childrenLength: 1,
    };
    const p1 = {
      id: "p1",
      flavour: "paragraph",
      nodeType: BlockNodeType.editable,
      hostElement: p1Host,
      parentId: "root",
      parentBlock: root,
      props: {depth: 0},
      getIndexOfParent: () => 0,
    };
    const closed = new Subject<void>();
    const cpr = {
      location: {nativeElement: triggerHost},
      instance: {
        closed,
        menuDisabled: false,
        cdr: {detectChanges: jasmine.createSpy("detectChanges")},
      },
      setInput: jasmine.createSpy("setInput"),
      destroy: jasmine.createSpy("destroy"),
    };
    const doc = {
      isReadonly: false,
      onDestroy$: new Subject<void>(),
      injector: {get: jasmine.createSpy("get").and.returnValue({
        createComponent: jasmine.createSpy("createComponent").and.returnValue(cpr),
      })},
      root,
      schemas: {
        get: jasmine.createSpy("get").and.returnValue({metadata: {isLeaf: false}}),
      },
      selection: {
        value: null,
        selectionChange$: new Subject<BlockSelection | null>(),
      },
      dragController: {
        state$: new Subject<string>(),
        startDrag: jasmine.createSpy("startDrag"),
      },
      subscribeReadonlyChange: jasmine.createSpy("subscribeReadonlyChange").and.returnValue({
        unsubscribe: jasmine.createSpy("unsubscribeReadonly"),
      }),
      getBlockById: jasmine.createSpy("getBlockById").and.returnValue(p1),
      queryBlocksBetween: jasmine.createSpy("queryBlocksBetween").and.returnValue([]),
    };
    const plugin = new BlockControllerPlugin();
    (plugin as any).doc = doc;
    plugin.init();

    p1Host.dispatchEvent(new MouseEvent("mouseover", {bubbles: true}));
    tick(1);
    expect((plugin as any)._activeBlock).toBe(p1);

    closed.next();
    expect((plugin as any)._activeBlock).toBeNull();
    expect(cpr.setInput).toHaveBeenCalledWith("activeBlock", null);

    cpr.setInput.calls.reset();
    p1Host.dispatchEvent(new MouseEvent("mouseover", {bubbles: true}));
    tick(1);
    expect(cpr.setInput).toHaveBeenCalledWith("activeBlock", p1);

    plugin.destroy();
    rootHost.remove();
  }));
});
