import {TableBlockComponent} from "./table.block";
import {BlockSelection} from "../../framework/modules/selection/blockSelection";
import {BehaviorSubject} from "rxjs";

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

  it("keeps column-bar selection model-owned without resampling the DOM", () => {
    const table = Object.create(TableBlockComponent.prototype) as TableBlockComponent & any;
    const firstCell = {id: "cell-0-1", props: {}};
    const selectedCells = [firstCell, {id: "cell-1-1", props: {}}];
    const selection = {anchor: {blockId: firstCell.id}};

    Object.defineProperties(table, {
      firstChildren: {
        value: {
          getChildrenByIndex: jasmine.createSpy("getChildrenByIndex").and.returnValue(firstCell),
        },
      },
      rowLength: {value: 2},
      colLength: {value: 3},
    });
    table._activeRowRange = [-1, -1];
    table._activeColRange = [-1, -1];
    table._clearSelected = jasmine.createSpy("_clearSelected");
    table._showTableMenu = jasmine.createSpy("_showTableMenu");
    table.selectCell = jasmine.createSpy("selectCell");
    table.getCellsMatrixByCoordinates = jasmine.createSpy("getCellsMatrixByCoordinates").and.returnValue([
      [selectedCells[0]],
      [selectedCells[1]],
    ]);
    table.rowBarComponent = {
      selectedRange: [-1, -1],
      visibleHandleIndex: null,
      changeDetectionRef: {markForCheck: jasmine.createSpy("rowMarkForCheck")},
    };
    table.colBarComponent = {
      selectedRange: [-1, -1],
      visibleHandleIndex: null,
      changeDetectionRef: {markForCheck: jasmine.createSpy("colMarkForCheck")},
    };
    table.doc = {
      selection: {
        value: selection,
        selectBlock: jasmine.createSpy("selectBlock"),
        recalculate: jasmine.createSpy("recalculate"),
      },
    };

    table.onColBarSelected([1, 1]);

    expect(table.doc.selection.selectBlock).toHaveBeenCalledOnceWith(firstCell);
    expect(table.doc.selection.recalculate).not.toHaveBeenCalled();
    expect(table.selectCell).toHaveBeenCalledTimes(2);
    expect(table._showTableMenu).toHaveBeenCalledWith({
      rowIndex: 0,
      rowCount: 2,
      colIndex: 1,
      colCount: 1,
      selectionKind: "col",
    });
  });

  it("keeps row-bar selection model-owned without resampling the DOM", () => {
    const table = Object.create(TableBlockComponent.prototype) as TableBlockComponent & any;
    const firstCell = {id: "cell-1-0", props: {}};
    const selectedCells = [firstCell, {id: "cell-1-1", props: {}}, {id: "cell-1-2", props: {}}];
    const row = {
      getChildrenByIndex: jasmine.createSpy("getChildrenByIndex").and.returnValue(firstCell),
    };

    table.getChildrenByIndex = jasmine.createSpy("getChildrenByIndex").and.returnValue(row);
    Object.defineProperties(table, {
      rowLength: {value: 3},
      colLength: {value: 3},
    });
    table._activeRowRange = [-1, -1];
    table._activeColRange = [-1, -1];
    table._clearSelected = jasmine.createSpy("_clearSelected");
    table._showTableMenu = jasmine.createSpy("_showTableMenu");
    table.selectCell = jasmine.createSpy("selectCell");
    table.getCellsMatrixByCoordinates = jasmine.createSpy("getCellsMatrixByCoordinates").and.returnValue([
      selectedCells,
    ]);
    table.rowBarComponent = {
      selectedRange: [-1, -1],
      visibleHandleIndex: null,
      changeDetectionRef: {markForCheck: jasmine.createSpy("rowMarkForCheck")},
    };
    table.colBarComponent = {
      selectedRange: [-1, -1],
      visibleHandleIndex: null,
      changeDetectionRef: {markForCheck: jasmine.createSpy("colMarkForCheck")},
    };
    table.doc = {
      selection: {
        selectBlock: jasmine.createSpy("selectBlock"),
        recalculate: jasmine.createSpy("recalculate"),
      },
    };

    table.onRowBarSelected([1, 1]);

    expect(table.doc.selection.selectBlock).toHaveBeenCalledOnceWith(firstCell);
    expect(table.doc.selection.recalculate).not.toHaveBeenCalled();
    expect(table.selectCell).toHaveBeenCalledTimes(3);
    expect(table._showTableMenu).toHaveBeenCalledWith({
      rowIndex: 1,
      rowCount: 1,
      colIndex: 0,
      colCount: 3,
      selectionKind: "row",
    });
  });

  it("refreshes table menu state from the canonical model selection", () => {
    const table = Object.create(TableBlockComponent.prototype) as TableBlockComponent & any;
    const selection = {anchor: {blockId: "cell-1"}};
    table.doc = {
      selection: {
        value: selection,
        recalculate: jasmine.createSpy("recalculate"),
      },
    };
    table._isGone = () => false;
    table._syncTableFocusUi = jasmine.createSpy("_syncTableFocusUi");

    table.refreshTableMenuFromSelection();

    expect(table._syncTableFocusUi).toHaveBeenCalledOnceWith(selection);
    expect(table.doc.selection.recalculate).not.toHaveBeenCalled();
  });

  it("ignores a delayed table menu refresh after the component is gone", () => {
    const table = Object.create(TableBlockComponent.prototype) as TableBlockComponent & any;
    table.doc = {selection: {value: {anchor: {blockId: "cell-1"}}}};
    table._isGone = () => true;
    table._syncTableFocusUi = jasmine.createSpy("_syncTableFocusUi");

    table.refreshTableMenuFromSelection();

    expect(table._syncTableFocusUi).not.toHaveBeenCalled();
  });

  it("drops a delayed table menu overlay after the table leaves the model graph", () => {
    const table = Object.create(TableBlockComponent.prototype) as TableBlockComponent & any;
    const host = document.createElement("div");
    document.body.appendChild(host);
    table.hostElement = host;
    Object.defineProperty(table, "id", {value: "table-1"});
    const readonlyLookup = jasmine.createSpy("isReadonly").and.throwError("stale readonly lookup");
    table.doc = {
      model: {exists: jasmine.createSpy("exists").and.returnValue(false)},
      readonlyManager: {isReadonly: readonlyLookup},
    };
    table._disposeToolbar = jasmine.createSpy("_disposeToolbar");

    table._showTableMenuOverlay();

    expect(table.doc.model.exists).toHaveBeenCalledOnceWith("table-1");
    expect(readonlyLookup).not.toHaveBeenCalled();
    expect(table._disposeToolbar).toHaveBeenCalledTimes(1);
    host.remove();
  });
});

describe("TableBlockComponent readonly resize", () => {
  it("does not start a column resize for a readonly table", () => {
    const table = Object.create(TableBlockComponent.prototype) as TableBlockComponent & any;
    const host = document.createElement("div");
    const nativeTable = document.createElement("table");
    const colGroup = document.createElement("colgroup");
    const col = document.createElement("col");
    colGroup.appendChild(col);
    nativeTable.appendChild(colGroup);
    host.appendChild(nativeTable);

    table.hostElement = host;
    table.doc = {
      readonlyManager: {
        isReadonly: jasmine.createSpy("isReadonly").and.returnValue(true),
      },
    };
    table.hoveringCell = {
      props: {colspan: 1},
      getIndexOfParent: () => 0,
    };
    Object.defineProperty(table, "props", {value: {colWidths: [120]}});
    table.resizingCol$ = new BehaviorSubject(false);
    const resizeState = spyOn(table.resizingCol$, "next").and.callThrough();
    table.colBarComponent = {
      colWidths: [120],
      changeDetectionRef: {markForCheck: jasmine.createSpy("markForCheck")},
    };
    table.updateProps = jasmine.createSpy("updateProps");
    table._normalizeHorizontalScroll = jasmine.createSpy("_normalizeHorizontalScroll");

    const event = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      clientX: 120,
    });
    const stopPropagation = spyOn(event, "stopPropagation").and.callThrough();

    table.onColResizerMousedown(event);
    document.dispatchEvent(new MouseEvent("mouseup", {bubbles: true}));

    expect(event.defaultPrevented).toBeTrue();
    expect(stopPropagation).toHaveBeenCalled();
    expect(resizeState).not.toHaveBeenCalled();
    expect(table.updateProps).not.toHaveBeenCalled();
    expect(col.style.width).toBe("");
  });
});

describe("TableBlockComponent equal column widths", () => {
  function createHarness({
    columns,
    parentClientWidth,
    paddingLeft = 0,
    paddingRight = 0,
    tableClientWidth = 180,
    overhead = 0,
  }: {
    columns: number;
    parentClientWidth: number;
    paddingLeft?: number;
    paddingRight?: number;
    tableClientWidth?: number;
    overhead?: number;
  }) {
    const table = Object.create(TableBlockComponent.prototype) as TableBlockComponent & any;
    const parentHost = document.createElement("div");
    const parentContent = document.createElement("div");
    const tableHost = document.createElement("div");
    const tableScroller = document.createElement("div");

    parentContent.style.paddingLeft = `${paddingLeft}px`;
    parentContent.style.paddingRight = `${paddingRight}px`;
    Object.defineProperty(parentContent, "clientWidth", {
      configurable: true,
      value: parentClientWidth,
    });
    Object.defineProperty(tableScroller, "clientWidth", {
      configurable: true,
      value: tableClientWidth,
    });
    parentContent.appendChild(tableHost);
    parentHost.appendChild(parentContent);
    document.body.appendChild(parentHost);

    const parent = {
      hostElement: parentHost,
      childrenRenderRef: {containerElement: parentContent},
    };
    table.hostElement = tableHost;
    table.parentId = "parent-1";
    table.doc = {
      getBlockById: (id: string) => id === "parent-1" ? parent : null,
    };
    table.tableScrollable = {nativeElement: tableScroller};
    Object.defineProperty(table, "props", {
      value: {colWidths: Array.from({length: columns}, () => 100)},
    });
    table.updateProps = jasmine.createSpy("updateProps");
    table._clearColInlineWidths = jasmine.createSpy("_clearColInlineWidths");
    table._normalizeHorizontalScroll = jasmine.createSpy("_normalizeHorizontalScroll");
    spyOn(table, "_getTableHorizontalOverhead").and.returnValue(overhead);

    return {
      table,
      dispose: () => parentHost.remove(),
    };
  }

  it("fills the direct parent children content box instead of the current table width", () => {
    const {table, dispose} = createHarness({
      columns: 3,
      parentClientWidth: 630,
      paddingLeft: 10,
      paddingRight: 20,
      tableClientWidth: 180,
      overhead: 3,
    });

    table.setEqualColumnWidths();

    expect(table.updateProps).toHaveBeenCalledOnceWith({
      colWidths: [199, 199, 199],
    });
    expect(table._normalizeHorizontalScroll).toHaveBeenCalledOnceWith(true);
    dispose();
  });

  it("distributes an indivisible pixel remainder without shrinking the table", () => {
    const {table, dispose} = createHarness({
      columns: 3,
      parentClientWidth: 604,
      paddingLeft: 2,
      paddingRight: 2,
      overhead: 1,
    });

    table.setEqualColumnWidths();

    expect(table.updateProps).toHaveBeenCalledOnceWith({
      colWidths: [200, 200, 199],
    });
    dispose();
  });

  it("keeps the minimum column width when the parent content box is narrower", () => {
    const {table, dispose} = createHarness({
      columns: 3,
      parentClientWidth: 120,
      overhead: 1,
    });

    table.setEqualColumnWidths();

    expect(table.updateProps).toHaveBeenCalledOnceWith({
      colWidths: [50, 50, 50],
    });
    dispose();
  });

  it("measures table overhead without relying on col bounding boxes", () => {
    const component = Object.create(TableBlockComponent.prototype) as TableBlockComponent & any;
    const host = document.createElement("div");
    const table = document.createElement("table");
    const colgroup = document.createElement("colgroup");
    const cols = Array.from({length: 7}, () => document.createElement("col"));
    colgroup.append(...cols);
    table.appendChild(colgroup);
    host.appendChild(table);
    component.hostElement = host;
    Object.defineProperty(component, "props", {
      value: {colWidths: Array.from({length: 7}, () => 100)},
    });
    spyOn(table, "getBoundingClientRect").and.returnValue({width: 701} as DOMRect);
    const colRectSpies = cols.map(col =>
      spyOn(col, "getBoundingClientRect").and.returnValue({width: 0} as DOMRect),
    );
    component._layoutDistanceFromBcr = jasmine.createSpy("_layoutDistanceFromBcr")
      .and.callFake((distance: number) => distance);

    expect(component._getTableHorizontalOverhead()).toBe(1);
    expect(colRectSpies.every(spy => !spy.calls.any())).toBeTrue();
  });
});
