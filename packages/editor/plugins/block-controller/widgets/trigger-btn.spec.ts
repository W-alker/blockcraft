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
});
