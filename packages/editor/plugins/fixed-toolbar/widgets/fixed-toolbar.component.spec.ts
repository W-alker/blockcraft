import {ChangeDetectorRef} from "@angular/core";
import {BcOverlayTriggerDirective} from "../../../components";
import {BlockNodeType} from "../../../framework";
import {BlockSelection} from "../../../framework/modules/selection/blockSelection";
import {FixedTextToolbarComponent} from "./fixed-toolbar.component";

describe("FixedTextToolbarComponent boundary selections", () => {
  const makeHarness = () => {
    const rootHost = document.createElement("div");
    const p1Host = document.createElement("p");
    const p2Host = document.createElement("p");
    rootHost.append(p1Host, p2Host);
    document.body.appendChild(rootHost);

    const root = {
      id: "root",
      flavour: "root",
      nodeType: BlockNodeType.root,
      hostElement: rootHost,
      childrenIds: ["p1", "p2"],
      childrenLength: 2,
    };
    const makeBlock = (id: string, hostElement: HTMLElement, index: number) => ({
      id,
      flavour: "paragraph",
      nodeType: BlockNodeType.editable,
      hostElement,
      parentId: "root",
      parentBlock: root,
      props: {},
      plainTextOnly: false,
      textLength: 1,
      getIndexOfParent: () => index,
    });
    const p1 = makeBlock("p1", p1Host, 0);
    const p2 = makeBlock("p2", p2Host, 1);
    const blocks: Record<string, any> = {root, p1, p2};
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
    const getBlockById = (id: string) => blocks[id];
    const doc = {
      getBlockById,
      isEditable: (block: {nodeType: BlockNodeType}) => block.nodeType === BlockNodeType.editable,
      queryBlocksBetween,
    };
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>("ChangeDetectorRef", ["markForCheck"]);
    const component = new FixedTextToolbarComponent(cdr);
    component.doc = doc as any;
    const selection = (from: number, to: number) => new BlockSelection(
      {blockId: "root", type: "boundary", index: from, block: root} as any,
      {blockId: "root", type: "boundary", index: to, block: root} as any,
      "root",
      getBlockById,
      (a, b) => blocks[a].hostElement.compareDocumentPosition(blocks[b].hostElement),
    );

    return {component, p1, p2, rootHost, selection, queryBlocksBetween};
  };

  it("does not treat a collapsed boundary cursor as a transformable block range", () => {
    const {component, rootHost, selection, queryBlocksBetween} = makeHarness();
    const boundaryCursor = selection(1, 1);

    expect((component as any).canTransformSelection(boundaryCursor)).toBeFalse();
    expect(queryBlocksBetween).not.toHaveBeenCalled();
    rootHost.remove();
  });

  it("treats a boundary range covering one block as transformable", () => {
    const {component, rootHost, selection, queryBlocksBetween} = makeHarness();
    const boundaryRange = selection(0, 1);

    expect((component as any).canTransformSelection(boundaryRange)).toBeTrue();
    expect(queryBlocksBetween).not.toHaveBeenCalled();
    rootHost.remove();
  });

  it("resolves the exact child ids for a multi-block boundary range", () => {
    const {component, p1, p2, rootHost, selection} = makeHarness();
    const boundaryRange = selection(0, 2);

    expect((component as any).getSelectedBlockIds(boundaryRange)).toEqual([p1.id, p2.id]);
    rootHost.remove();
  });
});

describe("FixedTextToolbarComponent block insertion placement", () => {
  const makeHarness = () => {
    const rootHost = document.createElement("div");
    const beforeHost = document.createElement("p");
    const tableHost = document.createElement("div");
    const cellHost = document.createElement("td");
    const columnsHost = document.createElement("div");
    const columnHost = document.createElement("div");
    const columnParagraphHost = document.createElement("p");
    rootHost.append(beforeHost, tableHost, columnsHost);
    tableHost.appendChild(cellHost);
    columnsHost.appendChild(columnHost);
    columnHost.appendChild(columnParagraphHost);
    document.body.appendChild(rootHost);

    const root = {
      id: "root",
      flavour: "root",
      nodeType: BlockNodeType.root,
      hostElement: rootHost,
      childrenIds: ["p1", "table-1", "columns-1"],
      childrenLength: 3,
    };
    const paragraph = {
      id: "p1",
      flavour: "paragraph",
      nodeType: BlockNodeType.editable,
      hostElement: beforeHost,
      parentId: "root",
      parentBlock: root,
      props: {},
      plainTextOnly: false,
      textLength: 1,
      getIndexOfParent: () => 0,
    };
    const table = {
      id: "table-1",
      flavour: "table",
      nodeType: BlockNodeType.block,
      hostElement: tableHost,
      parentId: "root",
      parentBlock: root,
      childrenIds: ["row-1"],
      childrenLength: 1,
      getIndexOfParent: () => 1,
    };
    const cell = {
      id: "cell-1",
      flavour: "table-cell",
      nodeType: BlockNodeType.block,
      hostElement: cellHost,
      parentId: "row-1",
      parentBlock: null,
      childrenIds: [],
      childrenLength: 0,
      getIndexOfParent: () => 0,
    };
    const columns = {
      id: "columns-1",
      flavour: "columns",
      nodeType: BlockNodeType.block,
      hostElement: columnsHost,
      parentId: "root",
      parentBlock: root,
      childrenIds: ["column-1"],
      childrenLength: 1,
      getIndexOfParent: () => 2,
    };
    const column = {
      id: "column-1",
      flavour: "column",
      nodeType: BlockNodeType.block,
      hostElement: columnHost,
      parentId: "columns-1",
      parentBlock: columns,
      childrenIds: ["p-col"],
      childrenLength: 1,
      getIndexOfParent: () => 0,
    };
    const columnParagraph = {
      id: "p-col",
      flavour: "paragraph",
      nodeType: BlockNodeType.editable,
      hostElement: columnParagraphHost,
      parentId: "column-1",
      parentBlock: column,
      props: {},
      plainTextOnly: false,
      textLength: 1,
      getIndexOfParent: () => 0,
    };
    const blocks: Record<string, any> = {
      root,
      p1: paragraph,
      "table-1": table,
      "cell-1": cell,
      "columns-1": columns,
      "column-1": column,
      "p-col": columnParagraph,
    };
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>("ChangeDetectorRef", ["markForCheck"]);
    const component = new FixedTextToolbarComponent(cdr);
    let currentSelection: BlockCraft.Selection | null = null;
    const tableSnapshot = {
      id: "new-table",
      flavour: "table",
      nodeType: BlockNodeType.block,
      props: {},
      meta: {},
      children: [],
    };
    const chain = {
      insertBeforeSnapshots: jasmine.createSpy("insertBeforeSnapshots").and.returnValue(null),
      insertAfterSnapshots: jasmine.createSpy("insertAfterSnapshots").and.returnValue(null),
      insertSnapshots: jasmine.createSpy("insertSnapshots").and.returnValue(null),
      run: jasmine.createSpy("run").and.resolveTo(undefined),
    };
    chain.insertBeforeSnapshots.and.returnValue(chain);
    chain.insertAfterSnapshots.and.returnValue(chain);
    chain.insertSnapshots.and.returnValue(chain);
    component.doc = {
      schemas: {
        isValidChildren: jasmine.createSpy("isValidChildren").and.callFake((_flavour: string, parentFlavour: string) => parentFlavour === "root"),
        createSnapshot: jasmine.createSpy("createSnapshot").and.returnValue(tableSnapshot),
      },
      getBlockById: (id: string) => blocks[id],
      isEditable: (block: {nodeType: BlockNodeType}) => block.nodeType === BlockNodeType.editable,
      queryBlocksBetween: jasmine.createSpy("queryBlocksBetween").and.callFake((
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
      }),
      chain: jasmine.createSpy("chain").and.returnValue(chain),
      selection: {
        get value() {
          return currentSelection;
        },
        replay: jasmine.createSpy("replay"),
        setCursorAtBlock: jasmine.createSpy("setCursorAtBlock"),
        selectOrSetCursorAtBlock: jasmine.createSpy("selectOrSetCursorAtBlock"),
      },
    } as any;

    const selection = (anchor: any, head = anchor) => new BlockSelection(
      anchor,
      head,
      "root",
      id => blocks[id],
      (a, b) => blocks[a].hostElement.compareDocumentPosition(blocks[b].hostElement),
    );
    const setSelection = (next: BlockCraft.Selection | null) => {
      currentSelection = next;
    };

    return {
      component,
      rootHost,
      root,
      paragraph,
      table,
      cell,
      columns,
      columnParagraph,
      selection,
      setSelection,
      chain,
      tableSnapshot,
    };
  };

  it("inserts before the block for a leading gap cursor", async () => {
    const {component, rootHost, table, selection, chain, tableSnapshot} = makeHarness();
    const gapBeforeTable = selection(
      {blockId: "table-1", type: "gap", side: "before", block: table} as any,
    );

    const inserted = await (component as any).insertTable(2, 2, gapBeforeTable);

    expect(inserted).toBe(tableSnapshot);
    expect(chain.insertBeforeSnapshots).toHaveBeenCalledOnceWith(table, [tableSnapshot]);
    expect(chain.insertAfterSnapshots).not.toHaveBeenCalled();
    expect(chain.insertSnapshots).not.toHaveBeenCalled();
    rootHost.remove();
  });

  it("inserts at the structural index for a collapsed boundary cursor", async () => {
    const {component, rootHost, root, selection, chain, tableSnapshot} = makeHarness();
    const boundaryCursor = selection(
      {blockId: "root", type: "boundary", index: 1, block: root} as any,
    );

    const inserted = await (component as any).insertTable(2, 2, boundaryCursor);

    expect(inserted).toBe(tableSnapshot);
    expect(chain.insertSnapshots).toHaveBeenCalledOnceWith("root", 1, [tableSnapshot]);
    expect(chain.insertBeforeSnapshots).not.toHaveBeenCalled();
    expect(chain.insertAfterSnapshots).not.toHaveBeenCalled();
    rootHost.remove();
  });

  it("disables generic block insertion for model table-cell selections", () => {
    const {component, rootHost, cell, selection} = makeHarness();
    const tableCellSelection = selection(
      {blockId: "cell-1", type: "table-cell", tableId: "table-1", block: cell} as any,
    );

    expect((component as any).canInsertBlock("image", tableCellSelection)).toBeFalse();
    rootHost.remove();
  });

  it("disables the column picker for model table-cell selections", () => {
    const {component, rootHost, cell, selection} = makeHarness();
    const tableCellSelection = selection(
      {blockId: "cell-1", type: "table-cell", tableId: "table-1", block: cell} as any,
    );

    expect((component as any).canUseColumnPicker(tableCellSelection)).toBeFalse();
    rootHost.remove();
  });

  it("does not run the columns command for a stale table-cell selection", async () => {
    const {component, rootHost, cell, selection, setSelection} = makeHarness();
    const tableCellSelection = selection(
      {blockId: "cell-1", type: "table-cell", tableId: "table-1", block: cell} as any,
    );
    setSelection(tableCellSelection);
    component.selectionJSON = tableCellSelection.toJSON();
    const insertColumns = spyOn<any>(component, "insertColumns").and.resolveTo({});
    const trigger = jasmine.createSpyObj<BcOverlayTriggerDirective>("BcOverlayTriggerDirective", ["closePanel"]);

    await (component as any).insertColumnsBlock({count: 2}, trigger);

    expect(trigger.closePanel).toHaveBeenCalled();
    expect(insertColumns).not.toHaveBeenCalled();
    rootHost.remove();
  });

  it("disables the column picker for a collapsed boundary cursor", () => {
    const {component, rootHost, root, selection} = makeHarness();
    const boundaryCursor = selection(
      {blockId: "root", type: "boundary", index: 1, block: root} as any,
    );

    expect((component as any).canUseColumnPicker(boundaryCursor)).toBeFalse();
    rootHost.remove();
  });

  it("enables the column picker for a boundary range covering an editable block", () => {
    const {component, rootHost, root, selection} = makeHarness();
    const boundaryRange = selection(
      {blockId: "root", type: "boundary", index: 0, block: root} as any,
      {blockId: "root", type: "boundary", index: 1, block: root} as any,
    );

    expect((component as any).canUseColumnPicker(boundaryRange)).toBeTrue();
    rootHost.remove();
  });

  it("enables the column picker from a text cursor inside an existing columns block", () => {
    const {component, rootHost, columnParagraph, selection} = makeHarness();
    const textCursor = selection(
      {blockId: "p-col", type: "text", offset: 0, block: columnParagraph} as any,
    );

    expect((component as any).canUseColumnPicker(textCursor)).toBeTrue();
    rootHost.remove();
  });
});

describe("FixedTextToolbarComponent link pad", () => {
  it("does not replay a saved selection after destroy", () => {
    const replay = jasmine.createSpy("replay");
    const doc = {
      selection: {
        value: null,
        replay,
      },
    };
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>("ChangeDetectorRef", ["markForCheck"]);
    const component = new FixedTextToolbarComponent(cdr);
    component.doc = doc as any;
    component.ngOnDestroy();

    const result = (component as any).replaySelection({
      anchor: {blockId: "p1", type: "text", offset: 0},
      head: {blockId: "p1", type: "text", offset: 1},
      commonParent: "root",
    });

    expect(result).toBeFalse();
    expect(replay).not.toHaveBeenCalled();
  });

  it("reports replay failure when the restored selection is cleared as stale", () => {
    const replay = jasmine.createSpy("replay");
    const doc = {
      selection: {
        value: null,
        replay,
      },
    };
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>("ChangeDetectorRef", ["markForCheck"]);
    const component = new FixedTextToolbarComponent(cdr);
    component.doc = doc as any;

    const result = (component as any).replaySelection({
      anchor: {blockId: "deleted", type: "text", offset: 0},
      head: {blockId: "deleted", type: "text", offset: 1},
      commonParent: "root",
    });

    expect(result).toBeFalse();
    expect(replay).toHaveBeenCalled();
  });

  it("reports replay failure when the restored selection points at missing blocks", () => {
    const hostElement = document.createElement("p");
    document.body.appendChild(hostElement);
    const block = {
      id: "deleted",
      flavour: "paragraph",
      nodeType: BlockNodeType.editable,
      hostElement,
    };
    const selection = new BlockSelection(
      {blockId: "deleted", type: "text", offset: 0, block} as any,
      {blockId: "deleted", type: "text", offset: 1, block} as any,
      "root",
      () => block as any,
      () => 0,
    );
    const replay = jasmine.createSpy("replay");
    const doc = {
      getBlockById: jasmine.createSpy("getBlockById").and.throwError("missing"),
      selection: {
        value: selection,
        replay,
      },
    };
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>("ChangeDetectorRef", ["markForCheck"]);
    const component = new FixedTextToolbarComponent(cdr);
    component.doc = doc as any;

    const result = (component as any).replaySelection(selection.toJSON());

    expect(result).toBeFalse();
    expect(replay).toHaveBeenCalled();
    hostElement.remove();
  });

  it("does not create a fake range when the text selection has no DOM rect", () => {
    const hostElement = document.createElement("p");
    document.body.appendChild(hostElement);

    const block = {
      id: "p1",
      flavour: "paragraph",
      nodeType: BlockNodeType.editable,
      hostElement,
      props: {},
      plainTextOnly: false,
      textLength: 5,
    };
    const blocks: Record<string, any> = {p1: block};
    const selection = new BlockSelection(
      {blockId: "p1", type: "text", offset: 0, block} as any,
      {blockId: "p1", type: "text", offset: 2, block} as any,
      "root",
      id => blocks[id],
      () => 0,
    );
    const selectionJSON = selection.toJSON();
    const getSelectionRect = jasmine.createSpy("getSelectionRect").and.returnValue(null);
    const createFakeRange = jasmine.createSpy("createFakeRange");
    const replay = jasmine.createSpy("replay");
    const doc = {
      selection: {
        get value() {
          return selection;
        },
        replay,
        getSelectionRect,
        createFakeRange,
      },
    };
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>("ChangeDetectorRef", ["markForCheck"]);
    const component = new FixedTextToolbarComponent(cdr);
    component.doc = doc as any;
    component.selectionJSON = selectionJSON;
    component.hasTextSelection = true;

    (component as any).openLinkPad();

    expect(replay).toHaveBeenCalledOnceWith(selectionJSON);
    expect(getSelectionRect).toHaveBeenCalled();
    expect(createFakeRange).not.toHaveBeenCalled();
    hostElement.remove();
  });
});

describe("FixedTextToolbarComponent model-owned commands", () => {
  it("syncs toolbar state after a command without resampling the native selection", () => {
    const selection = {anchor: {blockId: "p1"}} as any;
    const recalculate = jasmine.createSpy("recalculate");
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>("ChangeDetectorRef", ["markForCheck"]);
    const component = new FixedTextToolbarComponent(cdr);
    component.doc = {
      selection: {
        value: selection,
        recalculate,
      },
    } as any;
    spyOn<any>(component, "restoreSelection");
    spyOn<any>(component, "canFormatTextSelection").and.returnValue(true);
    const syncToolbarState = spyOn<any>(component, "syncToolbarState");
    const run = jasmine.createSpy("run");

    (component as any).runWithSelection(run);

    expect(run).toHaveBeenCalled();
    expect(recalculate).not.toHaveBeenCalled();
    expect(syncToolbarState).toHaveBeenCalledOnceWith(selection);
    expect(cdr.markForCheck).toHaveBeenCalled();
  });

  it("syncs a columns command without resampling the native selection", async () => {
    const selection = {anchor: {blockId: "p1"}} as any;
    const recalculate = jasmine.createSpy("recalculate");
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>("ChangeDetectorRef", ["markForCheck"]);
    const component = new FixedTextToolbarComponent(cdr);
    component.selectionJSON = {} as any;
    component.doc = {
      selection: {
        value: selection,
        recalculate,
      },
    } as any;
    spyOn<any>(component, "restoreSelection");
    spyOn<any>(component, "isLiveSelection").and.returnValue(true);
    spyOn<any>(component, "canUseColumnPicker").and.returnValue(true);
    spyOn<any>(component, "insertColumns").and.resolveTo({id: "columns-1"});
    const syncToolbarState = spyOn<any>(component, "syncToolbarState");
    const trigger = jasmine.createSpyObj<BcOverlayTriggerDirective>("BcOverlayTriggerDirective", ["closePanel"]);

    await (component as any).insertColumnsBlock({count: 2}, trigger);

    expect(trigger.closePanel).toHaveBeenCalled();
    expect(recalculate).not.toHaveBeenCalled();
    expect(syncToolbarState).toHaveBeenCalledOnceWith(selection);
    expect(cdr.markForCheck).toHaveBeenCalled();
  });

  it("re-resolves selection ancestry after shrinking columns", () => {
    const setSelection = jasmine.createSpy("setSelection");
    const setCursorAtBlock = jasmine.createSpy("setCursorAtBlock");
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>("ChangeDetectorRef", ["markForCheck"]);
    const component = new FixedTextToolbarComponent(cdr);
    const selection = {
      anchor: {blockId: "p1", type: "text", offset: 1},
      head: {blockId: "p2", type: "text", offset: 2},
    } as any;
    component.doc = {
      selection: {setSelection, setCursorAtBlock},
    } as any;

    (component as any).restoreSelectionAfterColumnShrink(selection, "column-keep");

    expect(setSelection).toHaveBeenCalledOnceWith(selection.anchor, selection.head);
    expect(setCursorAtBlock).not.toHaveBeenCalled();
  });

  it("falls back to the last retained column when a shrunk endpoint was deleted", () => {
    const setSelection = jasmine.createSpy("setSelection").and.throwError("missing endpoint");
    const setCursorAtBlock = jasmine.createSpy("setCursorAtBlock");
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>("ChangeDetectorRef", ["markForCheck"]);
    const component = new FixedTextToolbarComponent(cdr);
    const selection = {
      anchor: {blockId: "deleted", type: "text", offset: 0},
      head: {blockId: "deleted", type: "text", offset: 0},
    } as any;
    component.doc = {
      selection: {setSelection, setCursorAtBlock},
    } as any;

    (component as any).restoreSelectionAfterColumnShrink(selection, "column-keep");

    expect(setCursorAtBlock).toHaveBeenCalledOnceWith("column-keep", true);
  });
});

describe("FixedTextToolbarComponent extension actions", () => {
  const makeTextSelection = (id = "p1", offset = 0) => {
    const hostElement = document.createElement("p");
    document.body.appendChild(hostElement);
    const block = {
      id,
      flavour: "paragraph",
      nodeType: BlockNodeType.editable,
      hostElement,
      props: {},
      plainTextOnly: false,
      textLength: 5,
    };
    const blocks: Record<string, any> = {[id]: block};
    const selection = new BlockSelection(
      {blockId: id, type: "text", offset, block} as any,
      {blockId: id, type: "text", offset, block} as any,
      "root",
      blockId => blocks[blockId],
      () => 0,
    );
    return {block, hostElement, selection};
  };

  it("emits the live replayed selection instead of the saved snapshot", () => {
    const {hostElement, selection} = makeTextSelection("p1", 2);
    let currentSelection: BlockCraft.Selection | null = null;
    const replay = jasmine.createSpy("replay").and.callFake(() => {
      currentSelection = selection;
    });
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>("ChangeDetectorRef", ["markForCheck"]);
    const component = new FixedTextToolbarComponent(cdr);
    component.doc = {
      selection: {
        get value() {
          return currentSelection;
        },
        replay,
      },
    } as any;
    component.selectionJSON = {
      anchor: {blockId: "stale", type: "text", offset: 0},
      head: {blockId: "stale", type: "text", offset: 0},
      commonParent: "root",
    };
    const emitted: any[] = [];
    component.extensionAction.subscribe(ctx => emitted.push(ctx));

    (component as any).onExtensionAction({key: "custom", icon: "bc_test", title: "Custom"});

    expect(replay).toHaveBeenCalledOnceWith(component.selectionJSON);
    expect(emitted.length).toBe(1);
    expect(emitted[0].selection).toEqual(selection.toJSON());
    hostElement.remove();
  });

  it("emits null selection when replay clears a stale saved selection", () => {
    let currentSelection: BlockCraft.Selection | null = null;
    const replay = jasmine.createSpy("replay");
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>("ChangeDetectorRef", ["markForCheck"]);
    const component = new FixedTextToolbarComponent(cdr);
    component.doc = {
      selection: {
        get value() {
          return currentSelection;
        },
        replay,
      },
    } as any;
    component.selectionJSON = {
      anchor: {blockId: "deleted", type: "text", offset: 0},
      head: {blockId: "deleted", type: "text", offset: 0},
      commonParent: "root",
    };
    const emitted: any[] = [];
    component.extensionAction.subscribe(ctx => emitted.push(ctx));

    (component as any).onExtensionAction({key: "custom", icon: "bc_test", title: "Custom"});

    expect(replay).toHaveBeenCalled();
    expect(emitted.length).toBe(1);
    expect(emitted[0].selection).toBeNull();
    expect(component.selectionJSON).toBeNull();
  });

  it("does not emit disabled or readonly extension actions", () => {
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>("ChangeDetectorRef", ["markForCheck"]);
    const component = new FixedTextToolbarComponent(cdr);
    component.doc = {selection: {value: null, replay: jasmine.createSpy("replay")}} as any;
    const emit = spyOn(component.extensionAction, "emit");

    (component as any).onExtensionAction({
      key: "disabled",
      icon: "bc_test",
      title: "Disabled",
      disabled: true,
    });
    component.readonly = true;
    (component as any).onExtensionAction({key: "readonly", icon: "bc_test", title: "Readonly"});

    expect(emit).not.toHaveBeenCalled();
  });
});
