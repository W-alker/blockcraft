import { ChangeDetectorRef } from "@angular/core";
import { BcOverlayTriggerDirective } from "../../../components";
import { BlockNodeType } from "../../../framework";
import { BlockSelection } from "../../../framework/modules/selection/blockSelection";
import { getWordArtPreset } from "../../../blocks/word-art-block";
import { getTextBoxPreset } from "../../../blocks/text-box-block";
import {
  SHAPE_CATEGORIES,
  SHAPE_DEFINITIONS,
} from "../../../blocks/shape-block";
import { FixedTextToolbarComponent } from "./fixed-toolbar.component";

describe("FixedTextToolbarComponent responsive layout", () => {
  const makeComponent = () => {
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>("ChangeDetectorRef", [
      "markForCheck",
    ]);
    return new FixedTextToolbarComponent(cdr);
  };

  it("uses container-width breakpoints instead of viewport breakpoints", () => {
    const component = makeComponent();

    expect((component as any).resolveToolbarLayout(1480)).toBe("wide");
    expect((component as any).resolveToolbarLayout(1479)).toBe("balanced");
    expect((component as any).resolveToolbarLayout(960)).toBe("balanced");
    expect((component as any).resolveToolbarLayout(719)).toBe("compact");
  });
});

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
    const makeBlock = (
      id: string,
      hostElement: HTMLElement,
      index: number,
    ) => ({
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
    const blocks: Record<string, any> = { root, p1, p2 };
    const queryBlocksBetween = jasmine
      .createSpy("queryBlocksBetween")
      .and.callFake(
        (from: { id: string }, to: { id: string }, contain = false) => {
          const fromIndex = root.childrenIds.indexOf(from.id);
          const toIndex = root.childrenIds.indexOf(to.id);
          return root.childrenIds.slice(
            Math.min(fromIndex, toIndex) + (contain ? 0 : 1),
            Math.max(fromIndex, toIndex) + (contain ? 1 : 0),
          );
        },
      );
    const getBlockById = (id: string) => blocks[id];
    const doc = {
      getBlockById,
      isEditable: (block: { nodeType: BlockNodeType }) =>
        block.nodeType === BlockNodeType.editable,
      queryBlocksBetween,
    };
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>("ChangeDetectorRef", [
      "markForCheck",
    ]);
    const component = new FixedTextToolbarComponent(cdr);
    component.doc = doc as any;
    const selection = (from: number, to: number) =>
      new BlockSelection(
        { blockId: "root", type: "boundary", index: from, block: root } as any,
        { blockId: "root", type: "boundary", index: to, block: root } as any,
        "root",
        getBlockById,
        (a, b) =>
          blocks[a].hostElement.compareDocumentPosition(blocks[b].hostElement),
      );

    return { component, p1, p2, rootHost, selection, queryBlocksBetween };
  };

  it("does not treat a collapsed boundary cursor as a transformable block range", () => {
    const { component, rootHost, selection, queryBlocksBetween } =
      makeHarness();
    const boundaryCursor = selection(1, 1);

    expect(
      (component as any).canTransformSelection(boundaryCursor),
    ).toBeFalse();
    expect(queryBlocksBetween).not.toHaveBeenCalled();
    rootHost.remove();
  });

  it("treats a boundary range covering one block as transformable", () => {
    const { component, rootHost, selection, queryBlocksBetween } =
      makeHarness();
    const boundaryRange = selection(0, 1);

    expect((component as any).canTransformSelection(boundaryRange)).toBeTrue();
    expect(queryBlocksBetween).not.toHaveBeenCalled();
    rootHost.remove();
  });

  it("resolves the exact child ids for a multi-block boundary range", () => {
    const { component, p1, p2, rootHost, selection } = makeHarness();
    const boundaryRange = selection(0, 2);

    expect((component as any).getSelectedBlockIds(boundaryRange)).toEqual([
      p1.id,
      p2.id,
    ]);
    rootHost.remove();
  });

  it("enables line height when a mixed block range contains one editable text block", () => {
    const { component, p2, rootHost, selection } = makeHarness();
    p2.nodeType = BlockNodeType.void;
    const mixedRange = selection(0, 2);

    expect((component as any).canTransformSelection(mixedRange)).toBeFalse();
    expect(
      (component as any).canSetLineHeightForSelection(mixedRange),
    ).toBeTrue();
    rootHost.remove();
  });

  it("disables line height when a block range has no editable text block", () => {
    const { component, p1, p2, rootHost, selection } = makeHarness();
    p1.nodeType = BlockNodeType.void;
    p2.nodeType = BlockNodeType.block;
    const nonEditableRange = selection(0, 2);

    expect(
      (component as any).canSetLineHeightForSelection(nonEditableRange),
    ).toBeFalse();
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
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>("ChangeDetectorRef", [
      "markForCheck",
    ]);
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
    const shapeSnapshot = {
      id: "new-shape",
      flavour: "shape",
      nodeType: BlockNodeType.block,
      props: { shapeType: "diamond" },
      meta: {},
      children: [],
    };
    const wordArtSnapshot = {
      id: "new-word-art",
      flavour: "word-art",
      nodeType: BlockNodeType.editable,
      props: {},
      meta: {},
      children: [{ insert: "艺术字" }],
    };
    const textBoxSnapshot = {
      id: "new-text-box",
      flavour: "text-box",
      nodeType: BlockNodeType.block,
      props: {},
      meta: {},
      children: [],
    };
    const enterEditing = jasmine.createSpy("enterEditing");
    const textBoxEnterEditing = jasmine.createSpy("textBoxEnterEditing");
    const wordArtBlock = {
      id: wordArtSnapshot.id,
      flavour: "word-art",
      enterEditing,
    };
    const textBoxBlock = {
      id: textBoxSnapshot.id,
      flavour: "text-box",
      enterEditing: textBoxEnterEditing,
    };
    const createSnapshot = jasmine
      .createSpy("createSnapshot")
      .and.callFake((flavour: string, _args?: unknown[]) =>
        flavour === "shape"
          ? shapeSnapshot
          : flavour === "text-box"
            ? textBoxSnapshot
            : flavour === "word-art"
              ? wordArtSnapshot
              : tableSnapshot,
      );
    const chain = {
      insertBeforeSnapshots: jasmine
        .createSpy("insertBeforeSnapshots")
        .and.returnValue(null),
      insertAfterSnapshots: jasmine
        .createSpy("insertAfterSnapshots")
        .and.returnValue(null),
      insertSnapshots: jasmine
        .createSpy("insertSnapshots")
        .and.returnValue(null),
      run: jasmine.createSpy("run").and.resolveTo(undefined),
    };
    chain.insertBeforeSnapshots.and.returnValue(chain);
    chain.insertAfterSnapshots.and.returnValue(chain);
    chain.insertSnapshots.and.returnValue(chain);
    const insertAbsoluteSnapshot = jasmine
      .createSpy("insertAbsoluteSnapshot")
      .and.callFake((snapshot: { id: string }) => snapshot.id);
    component.doc = {
      schemas: {
        has: jasmine.createSpy("has").and.returnValue(true),
        get: jasmine.createSpy("get").and.callFake((flavour: string) => ({
          flavour,
          metadata: {
            label:
              flavour === "shape"
                ? "形状"
                : flavour === "text-box"
                  ? "文本框"
                  : "表格",
          },
        })),
        isValidChildren: jasmine
          .createSpy("isValidChildren")
          .and.callFake(
            (_flavour: string, parentFlavour: string) =>
              parentFlavour === "root",
          ),
        createSnapshot,
      },
      getBlockById: (id: string) =>
        id === wordArtSnapshot.id
          ? wordArtBlock
          : id === textBoxSnapshot.id
            ? textBoxBlock
            : blocks[id],
      navigateToBlock: jasmine.createSpy("navigateToBlock").and.resolveTo(true),
      canInsertChild: jasmine.createSpy("canInsertChild").and.returnValue(true),
      isEditable: (block: { nodeType: BlockNodeType }) =>
        block.nodeType === BlockNodeType.editable,
      queryBlocksBetween: jasmine
        .createSpy("queryBlocksBetween")
        .and.callFake(
          (from: { id: string }, to: { id: string }, contain = false) => {
            const fromIndex = root.childrenIds.indexOf(from.id);
            const toIndex = root.childrenIds.indexOf(to.id);
            return root.childrenIds.slice(
              Math.min(fromIndex, toIndex) + (contain ? 0 : 1),
              Math.max(fromIndex, toIndex) + (contain ? 1 : 0),
            );
          },
        ),
      chain: jasmine.createSpy("chain").and.returnValue(chain),
      placement: { insertAbsoluteSnapshot },
      messageService: { warn: jasmine.createSpy("warn") },
      selection: {
        get value() {
          return currentSelection;
        },
        replay: jasmine.createSpy("replay"),
        setCursorAtBlock: jasmine.createSpy("setCursorAtBlock"),
        selectOrSetCursorAtBlock: jasmine.createSpy("selectOrSetCursorAtBlock"),
        getSelectionRect: jasmine
          .createSpy("getSelectionRect")
          .and.returnValue(new DOMRect(120, 80, 0, 24)),
      },
    } as any;

    const selection = (anchor: any, head = anchor) =>
      new BlockSelection(
        anchor,
        head,
        "root",
        (id) => blocks[id],
        (a, b) =>
          blocks[a].hostElement.compareDocumentPosition(blocks[b].hostElement),
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
      shapeSnapshot,
      wordArtSnapshot,
      textBoxSnapshot,
      wordArtBlock,
      enterEditing,
      textBoxEnterEditing,
      createSnapshot,
      insertAbsoluteSnapshot,
    };
  };

  it("inserts before the block for a leading gap cursor", async () => {
    const { component, rootHost, table, selection, chain, tableSnapshot } =
      makeHarness();
    const gapBeforeTable = selection({
      blockId: "table-1",
      type: "gap",
      side: "before",
      block: table,
    } as any);

    const inserted = await (component as any).insertTable(2, 2, gapBeforeTable);

    expect(inserted).toBe(tableSnapshot);
    expect(chain.insertBeforeSnapshots).toHaveBeenCalledOnceWith(table, [
      tableSnapshot,
    ]);
    expect(chain.insertAfterSnapshots).not.toHaveBeenCalled();
    expect(chain.insertSnapshots).not.toHaveBeenCalled();
    rootHost.remove();
  });

  it("inserts at the structural index for a collapsed boundary cursor", async () => {
    const { component, rootHost, root, selection, chain, tableSnapshot } =
      makeHarness();
    const boundaryCursor = selection({
      blockId: "root",
      type: "boundary",
      index: 1,
      block: root,
    } as any);

    const inserted = await (component as any).insertTable(2, 2, boundaryCursor);

    expect(inserted).toBe(tableSnapshot);
    expect(chain.insertSnapshots).toHaveBeenCalledOnceWith("root", 1, [
      tableSnapshot,
    ]);
    expect(chain.insertBeforeSnapshots).not.toHaveBeenCalled();
    expect(chain.insertAfterSnapshots).not.toHaveBeenCalled();
    rootHost.remove();
  });

  it("arms shape drawing without an editor selection and commits only after release", async () => {
    const {
      component,
      rootHost,
      shapeSnapshot,
      createSnapshot,
      insertAbsoluteSnapshot,
    } = makeHarness();
    spyOn<any>(component, "syncToolbarState");
    let drawRequest: any;
    spyOn<any>(component, "armObjectDrawing").and.callFake((request: any) => {
      drawRequest = request;
      return true;
    });
    const trigger = jasmine.createSpyObj<BcOverlayTriggerDirective>(
      "BcOverlayTriggerDirective",
      ["closePanel"],
    );

    await (component as any).insertShape("diamond", trigger);

    expect(trigger.closePanel).toHaveBeenCalled();
    expect(drawRequest.defaultWidth).toBe(180);
    expect(drawRequest.defaultHeight).toBe(100);
    expect(createSnapshot).not.toHaveBeenCalled();
    expect(insertAbsoluteSnapshot).not.toHaveBeenCalled();

    const anchorRect = new DOMRect(120, 80, 480, 280);
    await drawRequest.commit({ anchorRect, width: 240, height: 140 });

    expect(createSnapshot).toHaveBeenCalledOnceWith("shape", ["diamond"]);
    expect(insertAbsoluteSnapshot).toHaveBeenCalledOnceWith(
      {
        ...shapeSnapshot,
        props: {
          ...shapeSnapshot.props,
          width: 240,
          height: 140,
        },
      },
      jasmine.objectContaining({
        anchorRect,
        layer: "over",
      }),
    );
    expect((component.doc as any).chain).not.toHaveBeenCalled();
    expect(
      component.doc.selection.selectOrSetCursorAtBlock,
    ).toHaveBeenCalledOnceWith("new-shape", true);
    rootHost.remove();
  });

  it("draws a text box and enters its first editable child after commit", async () => {
    const {
      component,
      rootHost,
      textBoxSnapshot,
      textBoxEnterEditing,
      createSnapshot,
      insertAbsoluteSnapshot,
    } = makeHarness();
    spyOn<any>(component, "syncToolbarState");
    let drawRequest: any;
    spyOn<any>(component, "armObjectDrawing").and.callFake((request: any) => {
      drawRequest = request;
      return true;
    });

    const trigger = jasmine.createSpyObj<BcOverlayTriggerDirective>(
      "BcOverlayTriggerDirective",
      ["closePanel"],
    );
    (component as any).insertTextBox("soft-blue", trigger);

    expect(trigger.closePanel).toHaveBeenCalledTimes(1);
    expect(drawRequest.defaultWidth).toBe(280);
    expect(drawRequest.defaultHeight).toBe(140);
    expect(createSnapshot).not.toHaveBeenCalled();
    expect(textBoxEnterEditing).not.toHaveBeenCalled();

    const anchorRect = new DOMRect(140, 90, 300, 180);
    await drawRequest.commit({ anchorRect, width: 300, height: 180 });

    expect(createSnapshot).toHaveBeenCalledOnceWith("text-box", [
      "",
      {
        ...getTextBoxPreset("soft-blue").props,
        width: 300,
        height: 180,
      },
    ]);
    expect(insertAbsoluteSnapshot).toHaveBeenCalledOnceWith(
      textBoxSnapshot,
      jasmine.objectContaining({ anchorRect, layer: "over" }),
    );
    expect(
      component.doc.selection.selectOrSetCursorAtBlock,
    ).toHaveBeenCalledOnceWith("new-text-box", true);
    expect((component.doc as any).navigateToBlock).toHaveBeenCalledOnceWith(
      "new-text-box",
    );
    expect(textBoxEnterEditing).toHaveBeenCalledOnceWith(true);
    rootHost.remove();
  });

  it("arms WordArt drawing without an editor selection and edits after commit", async () => {
    const {
      component,
      rootHost,
      wordArtSnapshot,
      createSnapshot,
      insertAbsoluteSnapshot,
      enterEditing,
    } = makeHarness();
    spyOn<any>(component, "syncToolbarState");
    let drawRequest: any;
    spyOn<any>(component, "armObjectDrawing").and.callFake((request: any) => {
      drawRequest = request;
      return true;
    });
    const trigger = jasmine.createSpyObj<BcOverlayTriggerDirective>(
      "BcOverlayTriggerDirective",
      ["closePanel"],
    );
    const preset = getWordArtPreset("ocean");

    await (component as any).insertWordArt("ocean", trigger);

    expect(trigger.closePanel).toHaveBeenCalled();
    expect(drawRequest.defaultWidth).toBe(320);
    expect(drawRequest.defaultHeight).toBe(96);
    expect(createSnapshot).not.toHaveBeenCalled();
    expect(insertAbsoluteSnapshot).not.toHaveBeenCalled();
    expect(enterEditing).not.toHaveBeenCalled();

    const anchorRect = new DOMRect(160, 96, 420, 140);
    await drawRequest.commit({ anchorRect, width: 420, height: 140 });

    expect(createSnapshot).toHaveBeenCalledOnceWith("word-art", [
      "艺术字",
      {
        ...preset.props,
        width: 420,
        height: 140,
        gradientColors: [...preset.props.gradientColors],
        gradientStops: [...preset.props.gradientStops],
      },
    ]);
    const insertedProps = createSnapshot.calls.mostRecent().args[1][1];
    expect(insertedProps.gradientColors).not.toBe(preset.props.gradientColors);
    expect(insertedProps.gradientStops).not.toBe(preset.props.gradientStops);
    expect(insertAbsoluteSnapshot).toHaveBeenCalledOnceWith(
      wordArtSnapshot,
      jasmine.objectContaining({
        anchorRect,
        layer: "over",
      }),
    );
    expect(
      component.doc.selection.selectOrSetCursorAtBlock,
    ).toHaveBeenCalledOnceWith("new-word-art", true);
    expect((component.doc as any).navigateToBlock).toHaveBeenCalledOnceWith(
      "new-word-art",
    );
    expect(enterEditing).toHaveBeenCalledOnceWith(true);
    rootHost.remove();
  });

  it("delegates the complete catalog to the shared categorized picker", () => {
    expect(SHAPE_DEFINITIONS.length).toBe(103);
    expect(
      SHAPE_CATEGORIES.flatMap((category) => category.definitions),
    ).toEqual(SHAPE_DEFINITIONS);
    expect(SHAPE_DEFINITIONS.map((item) => item.type)).toContain(
      "notched-right-arrow",
    );
    expect(
      SHAPE_DEFINITIONS.every(
        (item) => typeof item.path === "string" && !("icon" in item),
      ),
    ).toBeTrue();
  });

  it("disables generic block insertion for model table-cell selections", () => {
    const { component, rootHost, cell, selection } = makeHarness();
    const tableCellSelection = selection({
      blockId: "cell-1",
      type: "table-cell",
      tableId: "table-1",
      block: cell,
    } as any);

    expect(
      (component as any).canInsertBlock("image", tableCellSelection),
    ).toBeFalse();
    rootHost.remove();
  });

  it("disables the column picker for model table-cell selections", () => {
    const { component, rootHost, cell, selection } = makeHarness();
    const tableCellSelection = selection({
      blockId: "cell-1",
      type: "table-cell",
      tableId: "table-1",
      block: cell,
    } as any);

    expect(
      (component as any).canUseColumnPicker(tableCellSelection),
    ).toBeFalse();
    rootHost.remove();
  });

  it("does not run the columns command for a stale table-cell selection", async () => {
    const { component, rootHost, cell, selection, setSelection } =
      makeHarness();
    const tableCellSelection = selection({
      blockId: "cell-1",
      type: "table-cell",
      tableId: "table-1",
      block: cell,
    } as any);
    setSelection(tableCellSelection);
    component.selectionJSON = tableCellSelection.toJSON();
    const insertColumns = spyOn<any>(component, "insertColumns").and.resolveTo(
      {},
    );
    const trigger = jasmine.createSpyObj<BcOverlayTriggerDirective>(
      "BcOverlayTriggerDirective",
      ["closePanel"],
    );

    await (component as any).insertColumnsBlock({ count: 2 }, trigger);

    expect(trigger.closePanel).toHaveBeenCalled();
    expect(insertColumns).not.toHaveBeenCalled();
    rootHost.remove();
  });

  it("disables the column picker for a collapsed boundary cursor", () => {
    const { component, rootHost, root, selection } = makeHarness();
    const boundaryCursor = selection({
      blockId: "root",
      type: "boundary",
      index: 1,
      block: root,
    } as any);

    expect((component as any).canUseColumnPicker(boundaryCursor)).toBeFalse();
    rootHost.remove();
  });

  it("enables the column picker for a boundary range covering an editable block", () => {
    const { component, rootHost, root, selection } = makeHarness();
    const boundaryRange = selection(
      { blockId: "root", type: "boundary", index: 0, block: root } as any,
      { blockId: "root", type: "boundary", index: 1, block: root } as any,
    );

    expect((component as any).canUseColumnPicker(boundaryRange)).toBeTrue();
    rootHost.remove();
  });

  it("enables the column picker from a text cursor inside an existing columns block", () => {
    const { component, rootHost, columnParagraph, selection } = makeHarness();
    const textCursor = selection({
      blockId: "p-col",
      type: "text",
      offset: 0,
      block: columnParagraph,
    } as any);

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
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>("ChangeDetectorRef", [
      "markForCheck",
    ]);
    const component = new FixedTextToolbarComponent(cdr);
    component.doc = doc as any;
    component.ngOnDestroy();

    const result = (component as any).replaySelection({
      anchor: { blockId: "p1", type: "text", offset: 0 },
      head: { blockId: "p1", type: "text", offset: 1 },
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
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>("ChangeDetectorRef", [
      "markForCheck",
    ]);
    const component = new FixedTextToolbarComponent(cdr);
    component.doc = doc as any;

    const result = (component as any).replaySelection({
      anchor: { blockId: "deleted", type: "text", offset: 0 },
      head: { blockId: "deleted", type: "text", offset: 1 },
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
      { blockId: "deleted", type: "text", offset: 0, block } as any,
      { blockId: "deleted", type: "text", offset: 1, block } as any,
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
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>("ChangeDetectorRef", [
      "markForCheck",
    ]);
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
    const blocks: Record<string, any> = { p1: block };
    const selection = new BlockSelection(
      { blockId: "p1", type: "text", offset: 0, block } as any,
      { blockId: "p1", type: "text", offset: 2, block } as any,
      "root",
      (id) => blocks[id],
      () => 0,
    );
    const selectionJSON = selection.toJSON();
    const getSelectionRect = jasmine
      .createSpy("getSelectionRect")
      .and.returnValue(null);
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
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>("ChangeDetectorRef", [
      "markForCheck",
    ]);
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
    const selection = { anchor: { blockId: "p1" } } as any;
    const recalculate = jasmine.createSpy("recalculate");
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>("ChangeDetectorRef", [
      "markForCheck",
    ]);
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
    const selection = { anchor: { blockId: "p1" } } as any;
    const recalculate = jasmine.createSpy("recalculate");
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>("ChangeDetectorRef", [
      "markForCheck",
    ]);
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
    spyOn<any>(component, "insertColumns").and.resolveTo({ id: "columns-1" });
    const syncToolbarState = spyOn<any>(component, "syncToolbarState");
    const trigger = jasmine.createSpyObj<BcOverlayTriggerDirective>(
      "BcOverlayTriggerDirective",
      ["closePanel"],
    );

    await (component as any).insertColumnsBlock({ count: 2 }, trigger);

    expect(trigger.closePanel).toHaveBeenCalled();
    expect(recalculate).not.toHaveBeenCalled();
    expect(syncToolbarState).toHaveBeenCalledOnceWith(selection);
    expect(cdr.markForCheck).toHaveBeenCalled();
  });

  it("re-resolves selection ancestry after shrinking columns", () => {
    const setSelection = jasmine.createSpy("setSelection");
    const setCursorAtBlock = jasmine.createSpy("setCursorAtBlock");
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>("ChangeDetectorRef", [
      "markForCheck",
    ]);
    const component = new FixedTextToolbarComponent(cdr);
    const selection = {
      anchor: { blockId: "p1", type: "text", offset: 1 },
      head: { blockId: "p2", type: "text", offset: 2 },
    } as any;
    component.doc = {
      selection: { setSelection, setCursorAtBlock },
    } as any;

    (component as any).restoreSelectionAfterColumnShrink(
      selection,
      "column-keep",
    );

    expect(setSelection).toHaveBeenCalledOnceWith(
      selection.anchor,
      selection.head,
    );
    expect(setCursorAtBlock).not.toHaveBeenCalled();
  });

  it("falls back to the last retained column when a shrunk endpoint was deleted", () => {
    const setSelection = jasmine
      .createSpy("setSelection")
      .and.throwError("missing endpoint");
    const setCursorAtBlock = jasmine.createSpy("setCursorAtBlock");
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>("ChangeDetectorRef", [
      "markForCheck",
    ]);
    const component = new FixedTextToolbarComponent(cdr);
    const selection = {
      anchor: { blockId: "deleted", type: "text", offset: 0 },
      head: { blockId: "deleted", type: "text", offset: 0 },
    } as any;
    component.doc = {
      selection: { setSelection, setCursorAtBlock },
    } as any;

    (component as any).restoreSelectionAfterColumnShrink(
      selection,
      "column-keep",
    );

    expect(setCursorAtBlock).toHaveBeenCalledOnceWith("column-keep", true);
  });
});

describe("FixedTextToolbarComponent typography ownership", () => {
  const createComponent = () => {
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>("ChangeDetectorRef", [
      "markForCheck",
    ]);
    return new FixedTextToolbarComponent(cdr);
  };

  it("writes compact inline typography through the selection helper", () => {
    const component = createComponent();
    const formatText = jasmine.createSpy("formatText");
    component.utils = { formatText } as any;
    spyOn<any>(component, "runWithSelection").and.callFake((run: () => void) =>
      run(),
    );

    const closePanel = jasmine.createSpy("closePanel");
    (component as any).onFontFamilyItemClicked(
      { value: "kai" },
      { closePanel },
    );

    expect(closePanel).toHaveBeenCalled();
    expect(formatText).toHaveBeenCalledOnceWith({
      "t:ff": "kai",
      "s:fontFamily": null,
    });
  });

  it("keeps font size as a relative scale", () => {
    const component = createComponent();
    const formatText = jasmine.createSpy("formatText");
    component.utils = { formatText } as any;
    spyOn<any>(component, "runWithSelection").and.callFake((run: () => void) =>
      run(),
    );

    const closePanel = jasmine.createSpy("closePanel");
    (component as any).onFontScaleItemClicked({ value: 1.25 }, { closePanel });

    expect(closePanel).toHaveBeenCalled();
    expect(formatText).toHaveBeenCalledOnceWith({
      "t:fs": 1.25,
      "s:fontSize": null,
    });
  });

  it("shows letter spacing as the persisted em value", () => {
    const component = createComponent();
    (component as any).activeTypography = { ff: null, fs: null, ls: 0.075 };

    expect((component as any).activeLetterSpacingLabel).toBe("0.075em");
    expect((component as any).letterSpacingOptionLabel(-0.05)).toBe("-0.05em");
  });

  it("keeps the paragraph-style leading icon in sync", () => {
    const component = createComponent();

    (component as any).activeProps = {};
    expect((component as any).activeStyleItem.icon).toBe("bc_wenben");

    (component as any).activeProps = { heading: 2 };
    expect((component as any).activeStyleItem.icon).toBe("bc_biaoti_2");
  });

  it("uses one alignment menu and reflects the current alignment", () => {
    const component = createComponent();
    const updateBlockProps = jasmine.createSpy("updateBlockProps");
    component.utils = { updateBlockProps } as any;
    (component as any).activeProps = { textAlign: "center" };
    spyOn<any>(component, "runWithSelection").and.callFake((run: () => void) =>
      run(),
    );

    expect((component as any).activeAlignAction.value).toBe("center");

    const closePanel = jasmine.createSpy("closePanel");
    (component as any).onAlignItemClicked({ value: "right" }, { closePanel });

    expect(closePanel).toHaveBeenCalled();
    expect(updateBlockProps).toHaveBeenCalledOnceWith({ textAlign: "right" });
  });

  it("writes line height as a paragraph property", () => {
    const component = createComponent();
    const updateBlockProps = jasmine.createSpy("updateBlockProps");
    component.utils = { updateBlockProps } as any;
    spyOn<any>(component, "runWithSelection").and.callFake((run: () => void) =>
      run(),
    );

    const closePanel = jasmine.createSpy("closePanel");
    (component as any).onLineHeightItemClicked({ value: 1.5 }, { closePanel });

    expect(closePanel).toHaveBeenCalled();
    expect(updateBlockProps).toHaveBeenCalledOnceWith({ lh: 1.5 });
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
    const blocks: Record<string, any> = { [id]: block };
    const selection = new BlockSelection(
      { blockId: id, type: "text", offset, block } as any,
      { blockId: id, type: "text", offset, block } as any,
      "root",
      (blockId) => blocks[blockId],
      () => 0,
    );
    return { block, hostElement, selection };
  };

  it("emits the live replayed selection instead of the saved snapshot", () => {
    const { hostElement, selection } = makeTextSelection("p1", 2);
    let currentSelection: BlockCraft.Selection | null = null;
    const replay = jasmine.createSpy("replay").and.callFake(() => {
      currentSelection = selection;
    });
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>("ChangeDetectorRef", [
      "markForCheck",
    ]);
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
      anchor: { blockId: "stale", type: "text", offset: 0 },
      head: { blockId: "stale", type: "text", offset: 0 },
      commonParent: "root",
    };
    const emitted: any[] = [];
    component.extensionAction.subscribe((ctx) => emitted.push(ctx));

    (component as any).onExtensionAction({
      key: "custom",
      icon: "bc_test",
      title: "Custom",
    });

    expect(replay).toHaveBeenCalledOnceWith(component.selectionJSON);
    expect(emitted.length).toBe(1);
    expect(emitted[0].selection).toEqual(selection.toJSON());
    hostElement.remove();
  });

  it("emits null selection when replay clears a stale saved selection", () => {
    let currentSelection: BlockCraft.Selection | null = null;
    const replay = jasmine.createSpy("replay");
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>("ChangeDetectorRef", [
      "markForCheck",
    ]);
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
      anchor: { blockId: "deleted", type: "text", offset: 0 },
      head: { blockId: "deleted", type: "text", offset: 0 },
      commonParent: "root",
    };
    const emitted: any[] = [];
    component.extensionAction.subscribe((ctx) => emitted.push(ctx));

    (component as any).onExtensionAction({
      key: "custom",
      icon: "bc_test",
      title: "Custom",
    });

    expect(replay).toHaveBeenCalled();
    expect(emitted.length).toBe(1);
    expect(emitted[0].selection).toBeNull();
    expect(component.selectionJSON).toBeNull();
  });

  it("does not emit disabled or readonly extension actions", () => {
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>("ChangeDetectorRef", [
      "markForCheck",
    ]);
    const component = new FixedTextToolbarComponent(cdr);
    component.doc = {
      selection: { value: null, replay: jasmine.createSpy("replay") },
    } as any;
    const emit = spyOn(component.extensionAction, "emit");

    (component as any).onExtensionAction({
      key: "disabled",
      icon: "bc_test",
      title: "Disabled",
      disabled: true,
    });
    component.readonly = true;
    (component as any).onExtensionAction({
      key: "readonly",
      icon: "bc_test",
      title: "Readonly",
    });

    expect(emit).not.toHaveBeenCalled();
  });
});
