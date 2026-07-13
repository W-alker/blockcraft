import {FakeRange} from "./createFakeRange";
import {BlockSelection} from "./blockSelection";

describe("FakeRange table-cell selection", () => {
  const makeHarness = () => {
    const tableHost = document.createElement("table");
    const row1Host = document.createElement("tr");
    const row2Host = document.createElement("tr");
    const makeCell = (id: string, parentId: string, index: number) => {
      const hostElement = document.createElement("td");
      hostElement.setAttribute("data-block-id", id);
      hostElement.className = "table-cell-block";
      hostElement.style.position = "relative";
      hostElement.style.width = "120px";
      hostElement.style.height = "40px";
      const content = document.createElement("div");
      content.className = "table-cell__children-wrapper children-render-container";
      content.textContent = id;
      hostElement.appendChild(content);
      const cell = {
        id,
        flavour: "table-cell",
        parentId,
        props: {},
        hostElement,
        getIndexOfParent: () => index,
      };
      return cell;
    };

    const cell1 = makeCell("cell-1", "row-1", 0);
    const cell2 = makeCell("cell-2", "row-1", 1);
    const cell3 = makeCell("cell-3", "row-2", 0);
    const cell4 = makeCell("cell-4", "row-2", 1);
    row1Host.append(cell1.hostElement, cell2.hostElement);
    row2Host.append(cell3.hostElement, cell4.hostElement);
    tableHost.append(row1Host, row2Host);
    document.body.appendChild(tableHost);

    const rows = [[cell1, cell2], [cell3, cell4]];
    const table = {
      id: "table-1",
      flavour: "table",
      childrenIds: ["row-1", "row-2"],
      hostElement: tableHost,
      confirmSelection: jasmine.createSpy("confirmSelection").and.callFake((start: number[], end: number[]) => ({start, end})),
      getCellsMatrixByCoordinates: jasmine.createSpy("getCellsMatrixByCoordinates").and.callFake((start: number[], end: number[]) =>
        rows.slice(start[0], end[0] + 1).map(row => row.slice(start[1], end[1] + 1))),
    };
    const blocks: Record<string, any> = {
      "table-1": table,
      "cell-1": cell1,
      "cell-2": cell2,
      "cell-3": cell3,
      "cell-4": cell4,
    };
    const doc = {
      getBlockById: (id: string) => blocks[id],
      isEditable: () => false,
      queryBlocksBetween: jasmine.createSpy("queryBlocksBetween").and.returnValue([]),
    };
    const selection = new BlockSelection(
      {blockId: "cell-1", type: "table-cell", tableId: "table-1", block: cell1} as any,
      {blockId: "cell-4", type: "table-cell", tableId: "table-1", block: cell4} as any,
      "table-1",
      id => blocks[id],
      () => 0,
    );
    return {doc, table, cells: [cell1, cell2, cell3, cell4], selection, tableHost};
  };

  it("paints only the anchor cell as a border focus", () => {
    const {doc, table, cells, selection, tableHost} = makeHarness();
    const tableHeight = tableHost.offsetHeight;

    const fakeRange = new FakeRange(doc as any, selection);

    expect(table.confirmSelection).not.toHaveBeenCalled();
    expect(table.getCellsMatrixByCoordinates).not.toHaveBeenCalled();
    expect(fakeRange.fakeSpans.length).toBe(1);
    expect(fakeRange.fakeSpans[0].isConnected).toBeFalse();
    expect(tableHost.querySelector(".blockcraft-cursor")).toBeNull();
    expect(cells[0].hostElement.style.outlineWidth).toBe("2px");
    expect(cells[0].hostElement.style.outlineStyle).toBe("solid");
    expect(cells[0].hostElement.style.outlineColor).toBe("var(--bgColor)");
    expect(cells[0].hostElement.style.outlineOffset).toBe("-2px");
    expect(tableHost.offsetHeight).toBe(tableHeight);
    cells.slice(1).forEach(cell => {
      expect(cell.hostElement.querySelector(".blockcraft-cursor")).toBeNull();
      expect(cell.hostElement.style.outlineStyle).toBe("");
    });
    expect(doc.queryBlocksBetween).not.toHaveBeenCalled();

    fakeRange.setColor({bgColor: "rgb(1, 2, 3)"});
    expect(cells[0].hostElement.style.getPropertyValue("--bgColor")).toBe("rgb(1, 2, 3)");

    fakeRange.destroy();
    expect(cells[0].hostElement.style.outlineWidth).toBe("");
    expect(cells[0].hostElement.style.outlineStyle).toBe("");
    expect(cells[0].hostElement.style.outlineColor).toBe("");
    expect(cells[0].hostElement.style.outlineOffset).toBe("");
    expect(cells[0].hostElement.style.getPropertyValue("--bgColor")).toBe("");
    expect(tableHost.querySelector(".blockcraft-cursor")).toBeNull();
    tableHost.remove();
  });
});

describe("FakeRange boundary selection", () => {
  it("paints a reversed boundary range over selected children without changing anchor/head", () => {
    const rootHost = document.createElement("div");
    const calloutHost = document.createElement("section");
    const p1Host = document.createElement("p");
    const p2Host = document.createElement("p");
    rootHost.setAttribute("data-block-id", "root");
    calloutHost.setAttribute("data-block-id", "callout-1");
    p1Host.setAttribute("data-block-id", "p1");
    p2Host.setAttribute("data-block-id", "p2");
    calloutHost.append(p1Host, p2Host);
    rootHost.appendChild(calloutHost);
    document.body.appendChild(rootHost);

    const root = {
      id: "root",
      hostElement: rootHost,
      childrenIds: ["callout-1"],
      childrenLength: 1,
    };
    const callout = {
      id: "callout-1",
      hostElement: calloutHost,
      parentId: "root",
      parentBlock: root,
      childrenIds: ["p1", "p2"],
      childrenLength: 2,
    };
    const p1 = {
      id: "p1",
      hostElement: p1Host,
      parentId: "callout-1",
      parentBlock: callout,
      getIndexOfParent: () => 0,
    };
    const p2 = {
      id: "p2",
      hostElement: p2Host,
      parentId: "callout-1",
      parentBlock: callout,
      getIndexOfParent: () => 1,
    };
    const blocks: Record<string, any> = {root, "callout-1": callout, p1, p2};
    const doc = {
      getBlockById: (id: string) => blocks[id],
      isEditable: () => false,
      queryBlocksBetween: jasmine.createSpy("queryBlocksBetween").and.returnValue([]),
    };
    const selection = new BlockSelection(
      {blockId: "callout-1", type: "boundary", index: 2, block: callout} as any,
      {blockId: "callout-1", type: "boundary", index: 0, block: callout} as any,
      "callout-1",
      id => blocks[id],
      () => 0,
    );
    const json = selection.toJSON();

    const fakeRange = new FakeRange(doc as any, selection);

    expect(selection.direction).toBe("backward");
    expect(selection.toJSON()).toEqual(json);
    expect(selection.getBoundarySelectedChildIds()).toEqual(["p1", "p2"]);
    expect(fakeRange.fakeSpans.length).toBe(2);
    expect(p1Host.querySelector(".blockcraft-cursor")).toBe(fakeRange.fakeSpans[0]);
    expect(p2Host.querySelector(".blockcraft-cursor")).toBe(fakeRange.fakeSpans[1]);
    expect(Array.from(calloutHost.children).some(child => child.classList.contains("blockcraft-cursor"))).toBeFalse();
    expect(doc.queryBlocksBetween).not.toHaveBeenCalled();

    fakeRange.destroy();
    expect(p1Host.querySelector(".blockcraft-cursor")).toBeNull();
    expect(p2Host.querySelector(".blockcraft-cursor")).toBeNull();
    rootHost.remove();
  });

  it("paints reversed mixed boundary-to-text ranges from content blocks instead of the container endpoint", () => {
    const rootHost = document.createElement("div");
    const calloutHost = document.createElement("section");
    const p1Host = document.createElement("p");
    const p1Text = document.createTextNode("after");
    rootHost.setAttribute("data-block-id", "root");
    calloutHost.setAttribute("data-block-id", "callout-1");
    p1Host.setAttribute("data-block-id", "p1");
    p1Host.appendChild(p1Text);
    rootHost.append(calloutHost, p1Host);
    document.body.appendChild(rootHost);

    const root = {
      id: "root",
      hostElement: rootHost,
      childrenIds: ["callout-1", "p1"],
      childrenLength: 2,
    };
    const callout = {
      id: "callout-1",
      hostElement: calloutHost,
      parentId: "root",
      parentBlock: root,
      childrenIds: [],
      childrenLength: 0,
      textContent: () => "callout",
      getIndexOfParent: () => 0,
    };
    const textRect = {
      left: 10,
      top: 20,
      right: 42,
      bottom: 34,
      width: 32,
      height: 14,
    } as DOMRect;
    const p1 = {
      id: "p1",
      hostElement: p1Host,
      containerElement: p1Host,
      parentId: "root",
      parentBlock: root,
      textLength: p1Text.length,
      textContent: () => "after",
      getIndexOfParent: () => 1,
      runtime: {
        mapper: {
          modelRangeToDomRange: jasmine.createSpy("modelRangeToDomRange").and.returnValue({
            getClientRects: () => [textRect],
          }),
        },
      },
    };
    const blocks: Record<string, any> = {root, "callout-1": callout, p1};
    const doc = {
      getBlockById: (id: string) => blocks[id],
      isEditable: (block: any) => block === p1,
      queryBlocksBetween: jasmine.createSpy("queryBlocksBetween").and.returnValue([]),
    };
    const selection = new BlockSelection(
      {blockId: "p1", type: "text", offset: 3, block: p1} as any,
      {blockId: "root", type: "boundary", index: 0, block: root} as any,
      "root",
      id => blocks[id],
      (a, b) => blocks[a].hostElement.compareDocumentPosition(blocks[b].hostElement),
    );
    const json = selection.toJSON();

    const fakeRange = new FakeRange(doc as any, selection);

    expect(selection.direction).toBe("backward");
    expect(selection.toJSON()).toEqual(json);
    expect(selection.firstBlock).toBe(callout as any);
    expect(selection.lastBlock).toBe(p1 as any);
    expect(fakeRange.fakeSpans.length).toBe(2);
    expect(Array.from(rootHost.children).some(child => child.classList.contains("blockcraft-cursor"))).toBeFalse();
    expect(calloutHost.querySelector(".blockcraft-cursor")).toBe(fakeRange.fakeSpans[0]);
    expect(p1Host.querySelector(".blockcraft-cursor")).toBe(fakeRange.fakeSpans[1]);
    expect(p1.runtime.mapper.modelRangeToDomRange).toHaveBeenCalledWith(p1Host, 0, 3);
    expect(doc.queryBlocksBetween).toHaveBeenCalledOnceWith(callout, p1);

    fakeRange.destroy();
    expect(calloutHost.querySelector(".blockcraft-cursor")).toBeNull();
    expect(p1Host.querySelector(".blockcraft-cursor")).toBeNull();
    rootHost.remove();
  });
});

describe("FakeRange whole-block table selection", () => {
  it("paints an absolute overlay without changing table block layout", () => {
    const hostElement = document.createElement("div");
    hostElement.className = "table-block";
    hostElement.setAttribute("data-node-type", "block");
    hostElement.setAttribute("data-block-id", "table-1");
    hostElement.style.position = "relative";
    hostElement.style.width = "320px";

    const content = document.createElement("div");
    content.className = "table-scrollable";
    content.style.height = "96px";
    hostElement.appendChild(content);
    document.body.appendChild(hostElement);

    const table = {
      id: "table-1",
      flavour: "table",
      hostElement,
    };
    const doc = {
      getBlockById: () => table,
      isEditable: () => false,
      queryBlocksBetween: jasmine.createSpy("queryBlocksBetween").and.returnValue([]),
    };
    const selection = new BlockSelection(
      {blockId: "table-1", type: "selected", block: table} as any,
      {blockId: "table-1", type: "selected", block: table} as any,
      "root",
      () => table as any,
      () => 0,
    );
    const height = hostElement.offsetHeight;

    const fakeRange = new FakeRange(doc as any, selection);

    expect(fakeRange.fakeSpans.length).toBe(1);
    const overlay = hostElement.querySelector(".blockcraft-cursor") as HTMLElement | null;
    expect(overlay).toBe(fakeRange.fakeSpans[0]);
    expect(overlay!.style.position).toBe("absolute");
    expect(overlay!.style.inset).toBe("0px");
    expect(overlay!.style.display).toBe("block");
    expect(overlay!.style.pointerEvents).toBe("none");
    const border = overlay!.firstElementChild as HTMLElement;
    expect(border.style.position).toBe("absolute");
    expect(border.style.boxShadow).toContain("inset");
    expect(border.style.backgroundColor).toBe("transparent");
    expect(hostElement.offsetHeight).toBe(height);
    expect(doc.queryBlocksBetween).not.toHaveBeenCalled();

    fakeRange.destroy();
    expect(hostElement.querySelector(".blockcraft-cursor")).toBeNull();
    expect(hostElement.offsetHeight).toBe(height);
    hostElement.remove();
  });

  it("keeps the temporary containing block until all block overlays are destroyed", () => {
    const hostElement = document.createElement("div");
    hostElement.setAttribute("data-node-type", "block");
    hostElement.setAttribute("data-block-id", "callout-1");
    hostElement.style.width = "200px";
    hostElement.style.height = "40px";
    document.body.appendChild(hostElement);

    const block = {
      id: "callout-1",
      flavour: "callout",
      hostElement,
    };
    const doc = {
      getBlockById: () => block,
      isEditable: () => false,
      queryBlocksBetween: jasmine.createSpy("queryBlocksBetween").and.returnValue([]),
    };
    const selection = new BlockSelection(
      {blockId: "callout-1", type: "selected", block} as any,
      {blockId: "callout-1", type: "selected", block} as any,
      "root",
      () => block as any,
      () => 0,
    );

    const first = new FakeRange(doc as any, selection);
    const second = new FakeRange(doc as any, selection);

    expect(hostElement.style.position).toBe("relative");
    expect(hostElement.querySelectorAll(".blockcraft-cursor").length).toBe(2);

    first.destroy();
    expect(hostElement.style.position).toBe("relative");
    expect(hostElement.querySelectorAll(".blockcraft-cursor").length).toBe(1);

    second.destroy();
    expect(hostElement.style.position).toBe("");
    expect(hostElement.querySelector(".blockcraft-cursor")).toBeNull();
    hostElement.remove();
  });
});
