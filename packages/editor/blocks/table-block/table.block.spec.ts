import {TableBlockComponent} from "./table.block";
import {BlockSelection} from "../../framework/modules/selection/blockSelection";

describe("TableBlockComponent selection UI sync", () => {
  it("clears a stale rectangle when selection moves into anchor cell text", () => {
    const table = Object.create(TableBlockComponent.prototype) as TableBlockComponent & any;
    const tableHost = document.createElement("div");
    const cell1Host = document.createElement("td");
    const cell2Host = document.createElement("td");
    const paragraphHost = document.createElement("div");

    cell1Host.setAttribute("data-block-id", "cell-1");
    cell2Host.setAttribute("data-block-id", "cell-2");
    cell1Host.classList.add("bc-table-cell-selected");
    cell2Host.classList.add("bc-table-cell-selected");
    cell1Host.appendChild(paragraphHost);
    tableHost.append(cell1Host, cell2Host);

    const cell1 = {
      id: "cell-1",
      flavour: "table-cell",
      parentId: "row-1",
      hostElement: cell1Host,
      getIndexOfParent: () => 0,
    };
    const cell2 = {
      id: "cell-2",
      flavour: "table-cell",
      parentId: "row-1",
      hostElement: cell2Host,
      getIndexOfParent: () => 1,
    };
    const paragraph = {
      id: "p-1",
      flavour: "paragraph",
      parentId: "cell-1",
      hostElement: paragraphHost,
      textLength: 1,
    };
    const blocks: Record<string, any> = {
      "cell-1": cell1,
      "cell-2": cell2,
      "p-1": paragraph,
    };

    table.hostElement = tableHost;
    Object.defineProperties(table, {
      id: {value: "table-1"},
      childrenIds: {value: ["row-1"]},
    });
    table.doc = {
      isReadonly: false,
      getBlockById: (id: string) => blocks[id],
    };
    table.changeDetectorRef = {
      markForCheck: jasmine.createSpy("markForCheck"),
    };
    table._selectedCellSet = new Set([cell1, cell2]);
    table._activeCellsRange = {
      start: [0, 0],
      end: [0, 1],
      anchorId: "cell-1",
    };
    table._activeColRange = [-1, -1];
    table._activeRowRange = [-1, -1];
    table._showTableMenu = jasmine.createSpy("_showTableMenu");

    const selection = new BlockSelection(
      {blockId: "p-1", type: "text", offset: 1, block: paragraph} as any,
      {blockId: "p-1", type: "text", offset: 1, block: paragraph} as any,
      "p-1",
      id => blocks[id],
      () => 0,
    );

    table._syncTableFocusUi(selection);

    expect(table._activeCellsRange).toBeNull();
    expect(table._selectedCellSet.size).toBe(0);
    expect(cell1Host.classList.contains("bc-table-cell-selected")).toBeFalse();
    expect(cell2Host.classList.contains("bc-table-cell-selected")).toBeFalse();
    expect(table._showTableMenu).toHaveBeenCalledWith({
      rowIndex: 0,
      colIndex: 0,
      selectionKind: "cell",
    });
  });

  it("clears table focus UI when a model table-cell selection endpoint is stale", () => {
    const table = Object.create(TableBlockComponent.prototype) as TableBlockComponent & any;
    const tableHost = document.createElement("div");
    const staleCellHost = document.createElement("td");
    tableHost.appendChild(staleCellHost);

    const staleCell = {
      id: "cell-1",
      flavour: "table-cell",
      parentId: "row-1",
      hostElement: staleCellHost,
      getIndexOfParent: () => 0,
    };

    table.hostElement = tableHost;
    Object.defineProperties(table, {
      id: {value: "table-1"},
      childrenIds: {value: ["row-1"]},
    });
    table.doc = {
      isReadonly: false,
      getBlockById: jasmine.createSpy("getBlockById").and.returnValue(null),
    };
    table._suppressFocusSync = false;
    table._startSelectingCell = false;
    table._hideTableMenu = jasmine.createSpy("_hideTableMenu");
    table._clearSelected = jasmine.createSpy("_clearSelected");
    table._clearActiveRanges = jasmine.createSpy("_clearActiveRanges");
    table._activeCellsRange = {
      start: [0, 0],
      end: [0, 0],
      anchorId: "cell-1",
    };

    const selection = new BlockSelection(
      {blockId: "cell-1", type: "table-cell", tableId: "table-1", block: staleCell} as any,
      {blockId: "cell-1", type: "table-cell", tableId: "table-1", block: staleCell} as any,
      "table-1",
      () => staleCell as any,
      () => 0,
    );

    table._syncTableFocusUi(selection);

    expect(table._hideTableMenu).toHaveBeenCalled();
    expect(table._clearSelected).toHaveBeenCalled();
    expect(table._clearActiveRanges).toHaveBeenCalled();
    expect(table._activeCellsRange).toBeNull();
  });

  it("syncs a non-square model table-cell selection with the correct column range", () => {
    const table = Object.create(TableBlockComponent.prototype) as TableBlockComponent & any;
    const tableHost = document.createElement("div");
    const cells: Record<string, any> = {};
    const rows: Record<string, any> = {};
    const blocks: Record<string, any> = {};

    for (let r = 0; r < 2; r++) {
      const rowId = `row-${r}`;
      const rowChildren: string[] = [];
      rows[rowId] = {
        id: rowId,
        flavour: "table-row",
        childrenIds: rowChildren,
      };
      blocks[rowId] = rows[rowId];

      for (let c = 0; c < 3; c++) {
        const cellId = `cell-${r}-${c}`;
        const hostElement = document.createElement("td");
        hostElement.setAttribute("data-block-id", cellId);
        tableHost.appendChild(hostElement);
        rowChildren.push(cellId);
        cells[cellId] = {
          id: cellId,
          flavour: "table-cell",
          parentId: rowId,
          hostElement,
          getIndexOfParent: () => c,
        };
        blocks[cellId] = cells[cellId];
      }
    }

    table.hostElement = tableHost;
    Object.defineProperties(table, {
      id: {value: "table-1"},
      childrenIds: {value: ["row-0", "row-1"]},
    });
    table.doc = {
      isReadonly: false,
      getBlockById: (id: string) => blocks[id],
    };
    table.changeDetectorRef = {
      markForCheck: jasmine.createSpy("markForCheck"),
    };
    table._selectedCellSet = new Set();
    table._activeCellsRange = null;
    table._activeColRange = [-1, -1];
    table._activeRowRange = [-1, -1];
    table._showTableMenu = jasmine.createSpy("_showTableMenu");
    table.confirmSelection = jasmine.createSpy("confirmSelection").and.callFake((start: number[], end: number[]) => ({
      start,
      end,
    }));

    const selection = new BlockSelection(
      {blockId: "cell-0-0", type: "table-cell", tableId: "table-1", block: cells["cell-0-0"]} as any,
      {blockId: "cell-1-2", type: "table-cell", tableId: "table-1", block: cells["cell-1-2"]} as any,
      "table-1",
      id => blocks[id],
      (a, b) => blocks[a].hostElement.compareDocumentPosition(blocks[b].hostElement),
    );

    table._syncTableFocusUi(selection);

    expect(table.confirmSelection).toHaveBeenCalledOnceWith([0, 0], [1, 2]);
    expect(table._activeCellsRange).toEqual({
      start: [0, 0],
      end: [1, 2],
      anchorId: "cell-0-0",
    });
    expect(table._selectedCellSet.size).toBe(6);
    expect(table._showTableMenu).toHaveBeenCalledWith({
      rowIndex: 0,
      rowCount: 2,
      colIndex: 0,
      colCount: 3,
      selectionKind: "cells",
    });
  });
});
