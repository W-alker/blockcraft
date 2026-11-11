import {BlockNodeType} from "../../framework";
import {calcFloatToolbarPosition} from "./toolbar-position";

describe("calcFloatToolbarPosition", () => {
  const rect = (
    left: number,
    top: number,
    right: number,
    bottom: number,
  ) => ({
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect);

  const makeDoc = (selectionRects: DOMRect[] | null = [rect(16, 24, 88, 42)]) => {
    const scrollContainer = document.createElement("div");
    scrollContainer.getBoundingClientRect = () => rect(0, 0, 500, 500);
    return {
      scrollContainer,
      selection: {
        getSelectionRects: jasmine.createSpy("getSelectionRects").and.returnValue(selectionRects),
      },
    };
  };

  const makeTextSelection = (direction: "forward" | "backward" = "forward") => {
    const hostElement = document.createElement("p");
    hostElement.getBoundingClientRect = () => rect(10, 20, 110, 48);
    const block = {
      id: "p1",
      flavour: "paragraph",
      nodeType: BlockNodeType.editable,
      hostElement,
    };
    return {
      collapsed: false,
      isAllSelected: false,
      isEmpty: false,
      isInSameBlock: true,
      start: {blockId: "p1", type: "text", offset: 0, block},
      end: {blockId: "p1", type: "text", offset: 2, block},
      firstBlock: block,
      lastBlock: block,
      direction,
    } as any;
  };

  const modelOnlySelections = [
    {
      name: "table-cell",
      selection: {
        collapsed: false,
        isAllSelected: false,
        isEmpty: false,
        start: {blockId: "cell-1", type: "table-cell", tableId: "table-1"},
        end: {blockId: "cell-4", type: "table-cell", tableId: "table-1"},
      },
    },
    {
      name: "boundary",
      selection: {
        collapsed: false,
        isAllSelected: false,
        isEmpty: false,
        start: {blockId: "callout-1", type: "boundary", index: 0},
        end: {blockId: "callout-1", type: "boundary", index: 2},
      },
    },
    {
      name: "gap",
      selection: {
        collapsed: true,
        isAllSelected: false,
        isEmpty: false,
        start: {blockId: "table-1", type: "gap", side: "after"},
        end: {blockId: "table-1", type: "gap", side: "after"},
      },
    },
  ];

  modelOnlySelections.forEach(({name, selection}) => {
    it(`does not request DOM geometry for ${name} selections`, () => {
      const doc = makeDoc();

      const position = calcFloatToolbarPosition(doc as any, selection as any);

      expect(position).toBeNull();
      expect(doc.selection.getSelectionRects).not.toHaveBeenCalled();
    });
  });

  it("uses DOM selection geometry for text selections", () => {
    const doc = makeDoc();
    const selection = makeTextSelection();

    const position = calcFloatToolbarPosition(doc as any, selection);

    expect(position).not.toBeNull();
    expect(position!.connectElement).toBe(selection.firstBlock.hostElement);
    expect(doc.selection.getSelectionRects).toHaveBeenCalled();
  });

  it("uses direction to choose the relative block for cross-block selections", () => {
    const firstHost = document.createElement("p");
    const lastHost = document.createElement("p");
    firstHost.getBoundingClientRect = () => rect(10, 20, 90, 44);
    lastHost.getBoundingClientRect = () => rect(10, 80, 90, 104);
    const firstBlock = {
      id: "p1",
      flavour: "paragraph",
      nodeType: BlockNodeType.editable,
      hostElement: firstHost,
    };
    const lastBlock = {
      id: "p2",
      flavour: "paragraph",
      nodeType: BlockNodeType.editable,
      hostElement: lastHost,
    };
    const selection = {
      collapsed: false,
      isAllSelected: false,
      isEmpty: false,
      isInSameBlock: false,
      direction: "backward",
      start: {blockId: "p1", type: "text", offset: 0, block: firstBlock},
      end: {blockId: "p2", type: "text", offset: 2, block: lastBlock},
      firstBlock,
      lastBlock,
    } as any;
    const doc = makeDoc([rect(12, 24, 72, 42), rect(14, 82, 86, 100)]);

    const position = calcFloatToolbarPosition(doc as any, selection);

    expect(position).not.toBeNull();
    expect(position!.connectElement).toBe(firstHost);
    expect(doc.selection.getSelectionRects).toHaveBeenCalled();
  });
});
