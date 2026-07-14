import {BlockNodeType} from "../../block-std";
import {BlockSelection} from "./blockSelection";
import {SelectionSelectedManager} from "./selected-manager";

describe("SelectionSelectedManager", () => {
  it("reconciles stable selection classes without toggling unchanged blocks", () => {
    const tableClassList = {
      add: jasmine.createSpy("table.add"),
      remove: jasmine.createSpy("table.remove"),
    };
    const p1ClassList = {
      add: jasmine.createSpy("p1.add"),
      remove: jasmine.createSpy("p1.remove"),
    };
    const p2ClassList = {
      add: jasmine.createSpy("p2.add"),
      remove: jasmine.createSpy("p2.remove"),
    };
    const blocks: Record<string, any> = {
      table: {
        id: "table",
        nodeType: BlockNodeType.block,
        hostElement: {classList: tableClassList},
      },
      p1: {
        id: "p1",
        nodeType: BlockNodeType.editable,
        hostElement: {classList: p1ClassList},
      },
      p2: {
        id: "p2",
        nodeType: BlockNodeType.editable,
        hostElement: {classList: p2ClassList},
      },
    };
    const manager = new SelectionSelectedManager({
      getBlockById: (id: string) => blocks[id],
    } as any);
    const selectionFor = (ids: string[]) => ({
      getBoundarySelectedChildIds: () => ids,
    });

    manager.setSelected(selectionFor(["table", "p1"]) as any);

    expect(tableClassList.add).toHaveBeenCalledOnceWith("selected");
    expect(p1ClassList.add).toHaveBeenCalledOnceWith("focused");
    tableClassList.add.calls.reset();
    tableClassList.remove.calls.reset();
    p1ClassList.add.calls.reset();
    p1ClassList.remove.calls.reset();

    manager.setSelected(selectionFor(["table", "p1"]) as any);

    expect(tableClassList.add).not.toHaveBeenCalled();
    expect(tableClassList.remove).not.toHaveBeenCalled();
    expect(p1ClassList.add).not.toHaveBeenCalled();
    expect(p1ClassList.remove).not.toHaveBeenCalled();

    manager.setSelected(selectionFor(["table", "p2"]) as any);

    expect(tableClassList.add).not.toHaveBeenCalled();
    expect(tableClassList.remove).not.toHaveBeenCalled();
    expect(p1ClassList.remove).toHaveBeenCalledOnceWith("focused");
    expect(p2ClassList.add).toHaveBeenCalledOnceWith("focused");
  });

  it("does not mark column containers selected for cross-column text selections", () => {
    const rootHost = document.createElement("div");
    const columnsHost = document.createElement("section");
    const column1Host = document.createElement("section");
    const column2Host = document.createElement("section");
    const p1Host = document.createElement("p");
    const p2Host = document.createElement("p");
    rootHost.setAttribute("data-block-id", "root");
    columnsHost.setAttribute("data-block-id", "columns-1");
    column1Host.setAttribute("data-block-id", "column-1");
    column2Host.setAttribute("data-block-id", "column-2");
    p1Host.setAttribute("data-block-id", "p1");
    p2Host.setAttribute("data-block-id", "p2");
    column1Host.appendChild(p1Host);
    column2Host.appendChild(p2Host);
    columnsHost.append(column1Host, column2Host);
    rootHost.appendChild(columnsHost);
    document.body.appendChild(rootHost);

    const root = {
      id: "root",
      flavour: "root",
      nodeType: BlockNodeType.root,
      hostElement: rootHost,
      childrenIds: ["columns-1"],
      childrenLength: 1,
    };
    const columns = {
      id: "columns-1",
      flavour: "columns",
      nodeType: BlockNodeType.block,
      hostElement: columnsHost,
      parentId: "root",
      parentBlock: root,
      childrenIds: ["column-1", "column-2"],
      childrenLength: 2,
      getIndexOfParent: () => 0,
    };
    const column1 = {
      id: "column-1",
      flavour: "column",
      nodeType: BlockNodeType.block,
      hostElement: column1Host,
      parentId: "columns-1",
      parentBlock: columns,
      childrenIds: ["p1"],
      childrenLength: 1,
      getIndexOfParent: () => 0,
    };
    const column2 = {
      id: "column-2",
      flavour: "column",
      nodeType: BlockNodeType.block,
      hostElement: column2Host,
      parentId: "columns-1",
      parentBlock: columns,
      childrenIds: ["p2"],
      childrenLength: 1,
      getIndexOfParent: () => 1,
    };
    const p1 = {
      id: "p1",
      flavour: "paragraph",
      nodeType: BlockNodeType.editable,
      hostElement: p1Host,
      parentId: "column-1",
      parentBlock: column1,
      textLength: 10,
      getIndexOfParent: () => 0,
    };
    const p2 = {
      id: "p2",
      flavour: "paragraph",
      nodeType: BlockNodeType.editable,
      hostElement: p2Host,
      parentId: "column-2",
      parentBlock: column2,
      textLength: 10,
      getIndexOfParent: () => 0,
    };
    const schemaDoc = {
      schemas: {
        get: (flavour: string) => ({
          metadata: {
            selectionScope: flavour === "root"
              ? "document"
              : flavour === "columns"
                ? "columns"
                : undefined,
          },
        }),
      },
    };
    (root as any).doc = schemaDoc;
    (columns as any).doc = schemaDoc;
    const blocks: Record<string, any> = {root, "columns-1": columns, "column-1": column1, "column-2": column2, p1, p2};
    const doc = {
      getBlockById: (id: string) => blocks[id],
      queryBlocksBetween: jasmine.createSpy("queryBlocksBetween").and.returnValue(["column-1", "column-2"]),
    };
    const selection = new BlockSelection(
      {blockId: "p1", type: "text", offset: 2, block: p1} as any,
      {blockId: "p2", type: "text", offset: 4, block: p2} as any,
      "columns-1",
      id => blocks[id],
      (a, b) => blocks[a].hostElement.compareDocumentPosition(blocks[b].hostElement),
    );
    const manager = new SelectionSelectedManager(doc as any);

    manager.setSelected(selection as any);

    expect(column1Host.classList.contains("selected")).toBeFalse();
    expect(column2Host.classList.contains("selected")).toBeFalse();
    expect(p1Host.classList.contains("focused")).toBeTrue();
    expect(p2Host.classList.contains("focused")).toBeTrue();
    expect(doc.queryBlocksBetween).not.toHaveBeenCalled();

    rootHost.remove();
  });

  it("does not mark a transparent endpoint ancestor container selected for text selections", () => {
    const rootHost = document.createElement("div");
    const calloutHost = document.createElement("section");
    const calloutTextHost = document.createElement("p");
    const outsideTextHost = document.createElement("p");
    rootHost.setAttribute("data-block-id", "root");
    calloutHost.setAttribute("data-block-id", "callout-1");
    calloutTextHost.setAttribute("data-block-id", "callout-p");
    outsideTextHost.setAttribute("data-block-id", "p-after");
    calloutHost.appendChild(calloutTextHost);
    rootHost.append(calloutHost, outsideTextHost);
    document.body.appendChild(rootHost);

    const root = {
      id: "root",
      flavour: "root",
      nodeType: BlockNodeType.root,
      hostElement: rootHost,
      childrenIds: ["callout-1", "p-after"],
      childrenLength: 2,
    };
    const callout = {
      id: "callout-1",
      flavour: "callout",
      nodeType: BlockNodeType.block,
      hostElement: calloutHost,
      parentId: "root",
      parentBlock: root,
      childrenIds: ["callout-p"],
      childrenLength: 1,
      getIndexOfParent: () => 0,
    };
    const calloutText = {
      id: "callout-p",
      flavour: "paragraph",
      nodeType: BlockNodeType.editable,
      hostElement: calloutTextHost,
      parentId: "callout-1",
      parentBlock: callout,
      textLength: 10,
      getIndexOfParent: () => 0,
    };
    const outsideText = {
      id: "p-after",
      flavour: "paragraph",
      nodeType: BlockNodeType.editable,
      hostElement: outsideTextHost,
      parentId: "root",
      parentBlock: root,
      textLength: 10,
      getIndexOfParent: () => 1,
    };
    const schemaDoc = {
      schemas: {
        get: (flavour: string) => ({
          metadata: {
            selectionScope: flavour === "root" ? "document" : undefined,
          },
        }),
      },
    };
    (root as any).doc = schemaDoc;
    (callout as any).doc = schemaDoc;
    const blocks: Record<string, any> = {root, "callout-1": callout, "callout-p": calloutText, "p-after": outsideText};
    const doc = {
      getBlockById: (id: string) => blocks[id],
      queryBlocksThroughPathDeeply: jasmine.createSpy("queryBlocksThroughPathDeeply").and.returnValue([]),
      queryBlocksBetween: jasmine.createSpy("queryBlocksBetween").and.returnValue(["callout-1", "p-after"]),
    };
    const selection = new BlockSelection(
      {blockId: "callout-p", type: "text", offset: 2, block: calloutText} as any,
      {blockId: "p-after", type: "text", offset: 4, block: outsideText} as any,
      "root",
      id => blocks[id],
      (a, b) => blocks[a].hostElement.compareDocumentPosition(blocks[b].hostElement),
    );
    const manager = new SelectionSelectedManager(doc as any);

    manager.setSelected(selection as any);

    expect(calloutHost.classList.contains("selected")).toBeFalse();
    expect(calloutTextHost.classList.contains("focused")).toBeTrue();
    expect(outsideTextHost.classList.contains("focused")).toBeTrue();
    expect(doc.queryBlocksThroughPathDeeply).toHaveBeenCalledOnceWith(calloutText, outsideText);
    expect(doc.queryBlocksBetween).not.toHaveBeenCalled();

    rootHost.remove();
  });

  it("marks the content blocks for a reversed mixed boundary-to-text selection", () => {
    const rootHost = document.createElement("div");
    const calloutHost = document.createElement("section");
    const p1Host = document.createElement("p");
    rootHost.setAttribute("data-block-id", "root");
    calloutHost.setAttribute("data-block-id", "callout-1");
    p1Host.setAttribute("data-block-id", "p1");
    rootHost.append(calloutHost, p1Host);
    document.body.appendChild(rootHost);

    const root = {
      id: "root",
      nodeType: BlockNodeType.root,
      hostElement: rootHost,
      childrenIds: ["callout-1", "p1"],
      childrenLength: 2,
    };
    const callout = {
      id: "callout-1",
      nodeType: BlockNodeType.block,
      hostElement: calloutHost,
      parentId: "root",
      parentBlock: root,
      childrenIds: [],
      childrenLength: 0,
      getIndexOfParent: () => 0,
    };
    const p1 = {
      id: "p1",
      nodeType: BlockNodeType.editable,
      hostElement: p1Host,
      parentId: "root",
      parentBlock: root,
      textLength: 5,
      getIndexOfParent: () => 1,
    };
    const blocks: Record<string, any> = {root, "callout-1": callout, p1};
    const doc = {
      getBlockById: (id: string) => blocks[id],
      queryBlocksBetween: jasmine.createSpy("queryBlocksBetween").and.returnValue(["callout-1", "p1"]),
    };
    const selection = new BlockSelection(
      {blockId: "p1", type: "text", offset: 3, block: p1} as any,
      {blockId: "root", type: "boundary", index: 0, block: root} as any,
      "root",
      id => blocks[id],
      (a, b) => blocks[a].hostElement.compareDocumentPosition(blocks[b].hostElement),
    );
    const manager = new SelectionSelectedManager(doc as any);

    manager.setSelected(selection as any);

    expect(selection.direction).toBe("backward");
    expect(selection.firstBlock).toBe(callout as any);
    expect(selection.lastBlock).toBe(p1 as any);
    expect(rootHost.classList.contains("selected")).toBeFalse();
    expect(rootHost.classList.contains("focused")).toBeFalse();
    expect(calloutHost.classList.contains("selected")).toBeTrue();
    expect(p1Host.classList.contains("focused")).toBeTrue();
    expect(doc.queryBlocksBetween).toHaveBeenCalledOnceWith(callout, p1, true);

    manager.setSelected(null);

    expect(calloutHost.classList.contains("selected")).toBeFalse();
    expect(p1Host.classList.contains("focused")).toBeFalse();
    rootHost.remove();
  });
});
