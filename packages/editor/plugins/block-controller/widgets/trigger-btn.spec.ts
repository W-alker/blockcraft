import {ChangeDetectorRef, ElementRef} from "@angular/core";
import {BlockNodeType} from "../../../framework";
import {BlockSelection} from "../../../framework/modules/selection/blockSelection";
import {TriggerBtn} from "./trigger-btn";

describe("TriggerBtn multi-selection state", () => {
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
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>("ChangeDetectorRef", ["markForCheck", "detectChanges"]);
    const host = new ElementRef(document.createElement("div"));
    const component = new TriggerBtn(cdr, host);
    const doc = {
      selection: {value: null as BlockSelection | null},
      queryBlocksBetween,
    };
    component.doc = doc as any;

    return {component, doc, p1, p2, outside, rootHost, selection, queryBlocksBetween};
  };

  it("does not treat a boundary range covering one block as multi-selection", () => {
    const {component, doc, p1, rootHost, selection, queryBlocksBetween} = makeHarness();
    doc.selection.value = selection(0, 1);
    (component as any)._activeBlock = p1;

    expect((component as any).computeIsMultiSelection()).toBeFalse();
    expect(queryBlocksBetween).not.toHaveBeenCalled();
    rootHost.remove();
  });

  it("treats a boundary range covering multiple blocks as multi-selection", () => {
    const {component, doc, p1, rootHost, selection, queryBlocksBetween} = makeHarness();
    doc.selection.value = selection(0, 2);
    (component as any)._activeBlock = p1;

    expect((component as any).computeIsMultiSelection()).toBeTrue();
    expect(queryBlocksBetween).not.toHaveBeenCalled();
    rootHost.remove();
  });

  it("keeps a block outside the selected range in single-block mode", () => {
    const {component, doc, outside, rootHost, selection} = makeHarness();
    doc.selection.value = selection(0, 2);
    (component as any)._activeBlock = outside;

    expect((component as any).computeIsMultiSelection()).toBeFalse();
    rootHost.remove();
  });

  it("does not resolve neighbouring ids for a collapsed boundary cursor", () => {
    const {component, doc, rootHost, selection, queryBlocksBetween} = makeHarness();
    doc.selection.value = selection(1, 1);

    expect((component as any).getSelectedBlockIds()).toEqual([]);
    expect(queryBlocksBetween).not.toHaveBeenCalled();
    rootHost.remove();
  });

  it("cuts the block that was active when the async copy started", async () => {
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>("ChangeDetectorRef", ["markForCheck", "detectChanges"]);
    const component = new TriggerBtn(cdr, new ElementRef(document.createElement("div")));
    const p1 = {
      id: "p1",
      toSnapshot: jasmine.createSpy("toSnapshot").and.returnValue({id: "p1"}),
    };
    const p2 = {
      id: "p2",
      toSnapshot: jasmine.createSpy("toSnapshot").and.returnValue({id: "p2"}),
    };
    let resolveCopy!: () => void;
    const copyPromise = new Promise<void>(resolve => {
      resolveCopy = resolve;
    });
    const chain = {
      deleteById: jasmine.createSpy("deleteById").and.callFake(() => chain),
      animationFrame: jasmine.createSpy("animationFrame").and.callFake(() => chain),
      recalculateSelection: jasmine.createSpy("recalculateSelection").and.callFake(() => chain),
      tap: jasmine.createSpy("tap").and.callFake(() => chain),
      run: jasmine.createSpy("run"),
    };
    component.doc = {
      getBlockById: jasmine.createSpy("getBlockById").and.callFake((id: string) => ({p1, p2} as Record<string, any>)[id]),
      clipboard: {
        copyBlocksModel: jasmine.createSpy("copyBlocksModel").and.returnValue(copyPromise),
      },
      chain: jasmine.createSpy("chain").and.returnValue(chain),
      messageService: {
        success: jasmine.createSpy("success"),
      },
    } as any;
    (component as any)._activeBlock = p1;

    component.handleToolItemClick({name: "cut"} as any);
    (component as any)._activeBlock = p2;
    resolveCopy();
    await copyPromise;
    await Promise.resolve();

    expect(chain.deleteById).toHaveBeenCalledOnceWith("p1");
    expect(chain.deleteById).not.toHaveBeenCalledWith("p2");
  });

  it("does not cut a block deleted before the async copy resolves", async () => {
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>("ChangeDetectorRef", ["markForCheck", "detectChanges"]);
    const component = new TriggerBtn(cdr, new ElementRef(document.createElement("div")));
    const p1 = {
      id: "p1",
      toSnapshot: jasmine.createSpy("toSnapshot").and.returnValue({id: "p1"}),
    };
    let resolveCopy!: () => void;
    const copyPromise = new Promise<void>(resolve => {
      resolveCopy = resolve;
    });
    const chain = {
      deleteById: jasmine.createSpy("deleteById").and.callFake(() => chain),
      animationFrame: jasmine.createSpy("animationFrame").and.callFake(() => chain),
      recalculateSelection: jasmine.createSpy("recalculateSelection").and.callFake(() => chain),
      tap: jasmine.createSpy("tap").and.callFake(() => chain),
      run: jasmine.createSpy("run"),
    };
    const getBlockById = jasmine.createSpy("getBlockById").and.returnValue(p1);
    component.doc = {
      getBlockById,
      clipboard: {
        copyBlocksModel: jasmine.createSpy("copyBlocksModel").and.returnValue(copyPromise),
      },
      chain: jasmine.createSpy("chain").and.returnValue(chain),
      messageService: {
        success: jasmine.createSpy("success"),
      },
    } as any;
    (component as any)._activeBlock = p1;

    component.handleToolItemClick({name: "cut"} as any);
    getBlockById.and.throwError("missing");
    resolveCopy();
    await copyPromise;
    await Promise.resolve();

    expect(chain.deleteById).not.toHaveBeenCalled();
  });

  it("does not call custom tool handlers with a stale active block", () => {
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>("ChangeDetectorRef", ["markForCheck", "detectChanges"]);
    const component = new TriggerBtn(cdr, new ElementRef(document.createElement("div")));
    const p1 = {id: "p1"};
    const customToolHandler = jasmine.createSpy("customToolHandler");
    component.doc = {
      getBlockById: jasmine.createSpy("getBlockById").and.throwError("missing"),
    } as any;
    component.customToolHandler = customToolHandler;
    (component as any)._activeBlock = p1;

    component.handleToolItemClick({name: "custom"} as any);

    expect(customToolHandler).not.toHaveBeenCalled();
  });

  it("does not call block menu action handlers with a stale active block", () => {
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>("ChangeDetectorRef", ["markForCheck", "detectChanges"]);
    const component = new TriggerBtn(cdr, new ElementRef(document.createElement("div")));
    const p1 = {id: "p1"};
    const blockMenuActionHandler = jasmine.createSpy("blockMenuActionHandler");
    component.doc = {
      getBlockById: jasmine.createSpy("getBlockById").and.throwError("missing"),
    } as any;
    component.blockMenuActionHandler = blockMenuActionHandler;
    (component as any)._activeBlock = p1;

    component.handleMenuAction({
      item: {type: "simple", name: "custom", label: "Custom"} as any,
      source: "simple",
      path: [],
    });

    expect(blockMenuActionHandler).not.toHaveBeenCalled();
  });

  it("copies a virtualized multi-block selection from the model graph", async () => {
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>("ChangeDetectorRef", ["markForCheck", "detectChanges"]);
    const component = new TriggerBtn(cdr, new ElementRef(document.createElement("div")));
    const activeBlock = {id: "p1", isReadonly: false};
    const snapshots = [
      {id: "p1", flavour: "paragraph"},
      {id: "p2", flavour: "paragraph"},
      {id: "p3", flavour: "paragraph"},
    ];
    const getBlockById = jasmine.createSpy("getBlockById").and.callFake((id: string) => {
      if (id === activeBlock.id) return activeBlock;
      throw new Error(`view not mounted: ${id}`);
    });
    component.doc = {
      model: {
        exists: jasmine.createSpy("exists").and.returnValue(true),
        toSnapshot: jasmine.createSpy("toSnapshot").and.callFake((id: string) =>
          snapshots.find(snapshot => snapshot.id === id) ?? null
        ),
      },
      getBlockById,
      clipboard: {
        copyBlocksModel: jasmine.createSpy("copyBlocksModel").and.returnValue(Promise.resolve()),
      },
      messageService: {
        success: jasmine.createSpy("success"),
      },
    } as any;
    (component as any)._activeBlock = activeBlock;
    (component as any)._isMultiSelection = true;
    spyOn<any>(component, "resolveMultiActionIds").and.returnValue(["p1", "p2", "p3"]);

    component.handleToolItemClick({name: "copy"} as any);
    await Promise.resolve();

    expect(component.doc.clipboard.copyBlocksModel).toHaveBeenCalledOnceWith(snapshots as any);
    expect(component.doc.model.toSnapshot).toHaveBeenCalledTimes(3);
    expect(getBlockById).not.toHaveBeenCalledWith("p2");
    expect(getBlockById).not.toHaveBeenCalledWith("p3");
  });
});

describe("TriggerBtn block readonly menu", () => {
  const makeHarness = (state: {explicit?: boolean; ancestor?: boolean; descendant?: boolean} = {}) => {
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>("ChangeDetectorRef", ["markForCheck", "detectChanges"]);
    const component = new TriggerBtn(cdr, new ElementRef(document.createElement("div")));
    const snapshot = {
      id: "p1",
      flavour: "paragraph",
      nodeType: BlockNodeType.editable,
      meta: {},
      props: {depth: 0},
      children: [],
    } as any;
    const block = {
      id: "p1",
      flavour: "paragraph",
      nodeType: BlockNodeType.editable,
      props: {depth: 0},
      parentId: "root",
      parentBlock: {id: "root", flavour: "root"},
      toSnapshot: jasmine.createSpy("toSnapshot").and.returnValue(snapshot),
    };
    const resolution = () => state.explicit
      ? {readonly: true, source: {kind: "self", blockId: "p1"}}
      : state.ancestor
        ? {readonly: true, source: {kind: "ancestor", blockId: "parent"}}
        : {readonly: false, source: null};
    const readonlyManager = {
      resolve: jasmine.createSpy("resolve").and.callFake(resolution),
      isReadonly: jasmine.createSpy("isReadonly").and.callFake(() => resolution().readonly),
      isExplicitReadonly: jasmine.createSpy("isExplicitReadonly").and.callFake(() => !!state.explicit),
      containsReadonly: jasmine.createSpy("containsReadonly").and.callFake(() => !!state.descendant),
    };
    component.doc = {
      selection: {value: null},
      readonlyManager,
      getBlockById: jasmine.createSpy("getBlockById").and.returnValue(block),
      setBlockReadonly: jasmine.createSpy("setBlockReadonly"),
      clipboard: {
        copyBlocksModel: jasmine.createSpy("copyBlocksModel").and.returnValue(Promise.resolve()),
      },
      messageService: {
        success: jasmine.createSpy("success"),
      },
    } as any;
    (component as any)._activeBlock = block;
    (component as any).isEmpty = false;
    (component as any).refreshMenuData();
    return {component, block, snapshot, state, readonlyManager};
  };

  const findPrimary = (component: TriggerBtn, name: string) =>
    ((component as any).primaryToolMenuItems as any[]).find(item => item.name === name);

  it("notifies the owner when the trigger closes", () => {
    const {component} = makeHarness();
    const closed = jasmine.createSpy("closed");
    const closePanel = jasmine.createSpy("closePanel");
    (component as any).menuTrigger = {closePanel};
    (component as any).closed.subscribe(closed);

    component.close();

    expect(closePanel).toHaveBeenCalledTimes(1);
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it("shows enabled unlock for a self lock and disabled lock for an inherited lock", () => {
    const self = makeHarness({explicit: true});
    expect(findPrimary(self.component, "block-readonly")).toEqual(jasmine.objectContaining({
      checked: true,
      disabled: false,
    }));

    const inherited = makeHarness({ancestor: true});
    expect(findPrimary(inherited.component, "block-readonly")).toEqual(jasmine.objectContaining({
      checked: true,
      disabled: true,
      desc: "由上级内容块锁定",
    }));
  });

  it("lets a self+ancestor locked block remove its own marker", () => {
    const {component, block, state} = makeHarness({explicit: true, ancestor: true});
    const item = findPrimary(component, "block-readonly");

    component.handleMenuAction({item, source: "switch", checked: false, path: []});

    expect(component.doc.setBlockReadonly).toHaveBeenCalledWith(block as any, false);
    state.explicit = false;
  });

  it("keeps copy and lock controls, and applies readonlyBehavior to custom actions", () => {
    const {component} = makeHarness({explicit: true});
    component.blockMenuResolver = () => [{
      key: "custom",
      items: [
        {type: "simple", name: "inspect", label: "Inspect", readonlyBehavior: "allow"},
        {type: "simple", name: "rename", label: "Rename"},
        {type: "simple", name: "secret", label: "Secret", readonlyBehavior: "hide"},
      ],
    }];

    (component as any).refreshMenuData();

    expect(((component as any).primaryToolMenuItems as any[]).map(item => item.name))
      .toEqual(["copy", "block-readonly"]);
    const customItems = ((component as any).blockMenuSections[0].items as any[]);
    expect(customItems.map(item => item.name)).toEqual(["inspect", "rename"]);
    expect(customItems.find(item => item.name === "inspect").disabled).toBeFalsy();
    expect(customItems.find(item => item.name === "rename").disabled).toBeTrue();
  });

  it("copies a protected block through the block menu", async () => {
    const {component, block, snapshot} = makeHarness({explicit: true});
    const copyItem = findPrimary(component, "copy");

    component.handleMenuAction({item: copyItem, source: "simple", path: []});
    await Promise.resolve();

    expect(component.doc.clipboard.copyBlocksModel).toHaveBeenCalledOnceWith([snapshot]);
    expect(block.toSnapshot).toHaveBeenCalledTimes(1);
    expect(component.doc.messageService.success).toHaveBeenCalledOnceWith("已复制");
  });

  it("hides cut/delete for an unlocked ancestor containing a locked descendant", () => {
    const {component} = makeHarness({descendant: true});

    expect(((component as any).primaryToolMenuItems as any[]).map(item => item.name))
      .toEqual(["copy", "block-readonly"]);
  });

  it("closes instead of resolving readonly state for a stale active block", () => {
    const {component, readonlyManager} = makeHarness();
    (component.doc as any).model = {exists: () => false};
    readonlyManager.resolve.and.throwError("Block not found: p1");

    expect(() => (component as any).refreshMenuData()).not.toThrow();
    expect(component.activeBlock).toBeNull();
    expect((component as any).primaryToolMenuItems).toEqual([]);
  });
});
