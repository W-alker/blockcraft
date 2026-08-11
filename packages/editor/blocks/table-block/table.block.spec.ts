import {TableBlockComponent} from "./table.block";
import {TableCellBlockComponent} from "./table-cell.block";
import {EditableBlockComponent} from "../../framework";
import {InlineRuntime} from "../../framework/block-std/inline/runtime/inline-runtime";
import {registerInlinePaginationAccess} from "../../framework/block-std/inline/runtime/inline-pagination-access";
import {BlockSelection} from "../../framework/modules/selection/blockSelection";
import {BehaviorSubject, Subject} from "rxjs";
import {isNativeInputTarget} from "../../framework/utils/node-search";

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

  it("syncs a model rectangle while painting only mounted cell components", () => {
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
    const parentIds: Record<string, string | null> = {
      "table-1": null,
      "row-0": "table-1",
      "row-1": "table-1",
    };
    Object.values(rows).forEach((row: any) => {
      row.childrenIds.forEach((cellId: string) => {
        parentIds[cellId] = row.id;
      });
    });
    table.doc = {
      isReadonly: false,
      getBlockById: jasmine.createSpy("getBlockById").and.callFake((id: string) =>
        id === "cell-0-1" ? null : blocks[id]),
      vm: {
        isMounted: (id: string) => id !== "cell-0-1",
      },
      model: {
        getFlavour: (id: string) => {
          if (id === "table-1") return "table";
          if (rows[id]) return "table-row";
          return cells[id] ? "table-cell" : undefined;
        },
        getProps: (id: string) => id === "table-1"
          ? {colWidths: [100, 100, 100]}
          : {},
        getChildrenIds: (id: string) => {
          if (id === "table-1") return ["row-0", "row-1"];
          return [...(rows[id]?.childrenIds ?? [])];
        },
        getParentId: (id: string) => parentIds[id] ?? null,
      },
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

    expect(table.confirmSelection).not.toHaveBeenCalled();
    expect(table._activeCellsRange).toEqual({
      start: [0, 0],
      end: [1, 2],
      anchorId: "cell-0-0",
    });
    expect(table._selectedCellSet.size).toBe(5);
    expect(table.doc.getBlockById).not.toHaveBeenCalledWith("cell-0-1");
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

describe("TableBlockComponent column resize", () => {
  function createResizeHarness(colWidths = [120, 140]) {
    const table = Object.create(TableBlockComponent.prototype) as TableBlockComponent & any;
    const host = document.createElement("div");
    const wrapper = document.createElement("div");
    const nativeTable = document.createElement("table");
    const colGroup = document.createElement("colgroup");
    const cols = colWidths.map(() => document.createElement("col"));
    const tbody = document.createElement("tbody");
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    const resizeBar = document.createElement("div");
    resizeBar.setAttribute("data-bc-native-input", "");
    cell.dataset["blockId"] = "cell-1";
    row.appendChild(cell);
    tbody.appendChild(row);
    cols.forEach(col => colGroup.appendChild(col));
    nativeTable.append(colGroup, tbody);
    wrapper.append(nativeTable, resizeBar);
    host.appendChild(wrapper);
    document.body.appendChild(host);

    wrapper.getBoundingClientRect = () => new DOMRect(10, 20, 300, 220);
    nativeTable.getBoundingClientRect = () => new DOMRect(10, 30, 260, 200);
    cell.getBoundingClientRect = () => new DOMRect(10, 30, 120, 60);

    const onDestroy$ = new Subject<void>();
    table.hostElement = host;
    table.doc = {
      readonlyManager: {
        isReadonly: jasmine.createSpy("isReadonly").and.returnValue(false),
      },
      ngZone: {runOutsideAngular: (run: () => void) => run()},
    };
    table.hoveringCell = {
      id: "cell-1",
      hostElement: cell,
      props: {colspan: 1},
      getIndexOfParent: () => 0,
    };
    table.tableWrapper = {nativeElement: wrapper};
    table.colResizeBar = {nativeElement: resizeBar};
    table._columnResizeHandleAnchor = {
      cellId: "cell-1",
      boundaryCell: cell,
    };
    table.resizingCol$ = new BehaviorSubject(false);
    table.onDestroy$ = onDestroy$;
    table.colBarComponent = {
      colWidths: [...colWidths],
      changeDetectionRef: {markForCheck: jasmine.createSpy("markForCheck")},
    };
    Object.defineProperty(table, "props", {value: {colWidths: [...colWidths]}});
    table.updateProps = jasmine.createSpy("updateProps");
    table._normalizeHorizontalScroll = jasmine.createSpy("_normalizeHorizontalScroll");

    return {
      table,
      host,
      cell,
      resizeBar,
      cols,
      onDestroy$,
      destroy: () => {
        table._finishColumnResize(false);
        onDestroy$.next();
        onDestroy$.complete();
        host.remove();
      },
    };
  }

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
    document.dispatchEvent(new MouseEvent("mouseup", {
      button: 0,
      bubbles: true,
    }));

    expect(event.defaultPrevented).toBeTrue();
    expect(stopPropagation).toHaveBeenCalled();
    expect(resizeState).not.toHaveBeenCalled();
    expect(table.updateProps).not.toHaveBeenCalled();
    expect(col.style.width).toBe("");
  });

  it("isolates the resize handle from root selection and mouse controls", () => {
    const harness = createResizeHarness();
    harness.table._clearSelectionUiState = jasmine.createSpy("_clearSelectionUiState");
    harness.table._isInsideCellFlowMask = jasmine.createSpy("_isInsideCellFlowMask")
      .and.returnValue(true);
    harness.table._getTableModelGrid = jasmine.createSpy("_getTableModelGrid")
      .and.returnValue({getSpan: () => ({start: [0, 0], end: [0, 0]})});

    try {
      expect(isNativeInputTarget(harness.resizeBar)).toBeTrue();
      harness.host.addEventListener("mousedown", event => {
        harness.table._handleNativeMouseDown(event);
      }, {capture: true, once: true});
      harness.resizeBar.dispatchEvent(new MouseEvent("mousedown", {
        button: 0,
        bubbles: true,
        cancelable: true,
      }));

      expect(harness.table._clearSelectionUiState).not.toHaveBeenCalled();
      expect(harness.table._pendingStart).toBeFalsy();
      expect(harness.table._isInsideCellFlowMask).not.toHaveBeenCalled();
      expect(document.body.querySelector(
        "[data-bc-table-col-resize-preview]",
      )).not.toBeNull();
      window.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape"}));
    } finally {
      harness.destroy();
    }
  });

  it("starts resize when Safari hit-tests the boundary as the table cell", () => {
    const harness = createResizeHarness();
    harness.table._clearSelectionUiState = jasmine.createSpy("_clearSelectionUiState");
    harness.table._isInsideCellFlowMask = jasmine.createSpy("_isInsideCellFlowMask")
      .and.returnValue(true);
    harness.table._getTableModelGrid = jasmine.createSpy("_getTableModelGrid")
      .and.returnValue({getSpan: () => ({start: [0, 0], end: [0, 0]})});

    try {
      harness.host.addEventListener("mousedown", event => {
        harness.table._handleNativeMouseDown(event);
      }, {capture: true, once: true});
      // The handle owns x=118..130, but WebKit reports the td as event.target.
      harness.cell.dispatchEvent(new MouseEvent("mousedown", {
        button: 0,
        bubbles: true,
        cancelable: true,
        clientX: 128,
        clientY: 40,
      }));

      expect(harness.table._clearSelectionUiState).not.toHaveBeenCalled();
      expect(harness.table._pendingStart).toBeFalsy();
      expect(harness.table._isInsideCellFlowMask).not.toHaveBeenCalled();
      expect(document.body.querySelector(
        "[data-bc-table-col-resize-preview]",
      )).not.toBeNull();
      window.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape"}));
    } finally {
      harness.destroy();
    }
  });

  it("resolves Safari's exact boundary hit back to the cell on the left", () => {
    const harness = createResizeHarness();
    const rightCell = document.createElement("td");
    rightCell.dataset["blockId"] = "cell-2";
    rightCell.getBoundingClientRect = () => new DOMRect(130, 30, 120, 60);
    harness.cell.parentElement!.appendChild(rightCell);
    // Reproduce a cold/fallback hit before the overlay anchor has been
    // positioned: the exact separator pixel was assigned to the right cell.
    harness.table._columnResizeHandleAnchor = null;
    const elementFromPoint = spyOn(document, "elementFromPoint")
      .and.callFake((x: number) => x < 130 ? harness.cell : rightCell);

    try {
      const anchor = harness.table._resolveColumnResizePointerAnchor({
        target: rightCell,
        button: 0,
        clientX: 130,
        clientY: 40,
      } as unknown as MouseEvent);

      expect(elementFromPoint).toHaveBeenCalledWith(126, 40);
      expect(anchor).toEqual({cellId: "cell-1", boundaryCell: harness.cell});
    } finally {
      harness.destroy();
    }
  });

  it("starts from the handle DOM anchor without hover state and commits one width", () => {
    const harness = createResizeHarness();
    const gridAtStart = {getSpan: () => ({start: [0, 0], end: [0, 0]})};
    const gridAtCommit = {getSpan: () => ({start: [0, 1], end: [0, 1]})};
    harness.table._getTableModelGrid = jasmine.createSpy("_getTableModelGrid")
      .and.returnValues(gridAtStart, gridAtCommit);
    // Pagination/Angular projection can reset transient hover state before
    // mousedown. The handle's actual cell DOM remains the gesture source.
    harness.table.hoveringCell = null;

    try {
      harness.table.onColResizerMousedown(new MouseEvent("mousedown", {
        button: 0,
        bubbles: true,
        cancelable: true,
        clientX: 130,
      }));

      const previewLine = document.body.querySelector<HTMLElement>(
        "[data-bc-table-col-resize-preview]",
      );
      expect(previewLine).not.toBeNull();
      expect(previewLine!.style.transform).toBe("translate3d(129px, 0px, 0px)");
      expect(harness.host.contains(previewLine)).toBeFalse();

      // Move past wrapper.right (310px). A wrapper-local guide would be
      // clipped here, which made rightward last-column resize look inert.
      document.dispatchEvent(new MouseEvent("mousemove", {
        bubbles: true,
        cancelable: true,
        clientX: 360,
      }));

      expect(previewLine!.style.transform).toBe("translate3d(359px, 0px, 0px)");
      expect(harness.cols.every(col => col.style.width === "")).toBeTrue();
      expect(harness.table.colBarComponent.colWidths).toEqual([120, 140]);
      expect(harness.table.updateProps).not.toHaveBeenCalled();

      document.dispatchEvent(new MouseEvent("mouseup", {
        button: 0,
        bubbles: true,
        cancelable: true,
        clientX: 360,
      }));

      // The stable cell anchor moved to column 1 during the gesture, so the
      // one final write follows that model column instead of the stale index 0.
      expect(harness.table.updateProps).toHaveBeenCalledOnceWith({
        colWidths: [120, 350],
      });
      expect(harness.table._normalizeHorizontalScroll).toHaveBeenCalledTimes(1);
      expect(previewLine!.isConnected).toBeFalse();
      expect(harness.table.resizingCol$.value).toBeFalse();
    } finally {
      harness.destroy();
    }
  });

  it("repairs a stale overlay anchor on idle mousemove when hover id did not change", () => {
    const harness = createResizeHarness();
    const hoveringCell = harness.table.hoveringCell;
    harness.table._columnResizeHandleAnchor = null;
    harness.resizeBar.classList.remove("is-visible");
    harness.table._isInsideCellFlowMask = jasmine.createSpy("_isInsideCellFlowMask")
      .and.returnValue(false);

    try {
      const move = {
        target: harness.cell,
        clientX: 129,
        clientY: 40,
        buttons: 0,
      } as unknown as MouseEvent;
      harness.table._handleIdleCellMouseMove(move);

      expect(harness.table.hoveringCell).toBe(hoveringCell);
      expect(harness.resizeBar.parentElement).toBe(harness.table.tableWrapper.nativeElement);
      expect(harness.table._columnResizeHandleAnchor).toEqual({
        cellId: "cell-1",
        boundaryCell: harness.cell,
      });
      expect(harness.resizeBar.classList.contains("is-visible")).toBeTrue();
      expect(harness.resizeBar.style.left).toBe("114px");

      // Same-cell movement stays on the layout-free identity fast path.
      harness.table._isInsideCellFlowMask.calls.reset();
      harness.table._handleIdleCellMouseMove(move);
      expect(harness.table._isInsideCellFlowMask).not.toHaveBeenCalled();
    } finally {
      harness.destroy();
    }
  });

  it("keeps the last-column resize hit target inside the table wrapper", () => {
    const harness = createResizeHarness();
    // wrapper: x=10..310; the hovered cell ends exactly at the wrapper's
    // right edge. Centring a 12px hit target there used to place it at x=304
    // and expand the scroller by the remaining 6px.
    harness.cell.getBoundingClientRect = () => new DOMRect(190, 30, 120, 60);

    try {
      harness.table._positionColumnResizeHandle("cell-1", harness.cell);

      expect(harness.resizeBar.style.left).toBe("288px");
      expect(Number.parseFloat(harness.resizeBar.style.left) + 12).toBe(300);
      expect(harness.resizeBar.classList.contains("is-visible")).toBeTrue();
      expect(harness.table._columnResizeHandleAnchor).toEqual({
        cellId: "cell-1",
        boundaryCell: harness.cell,
      });
    } finally {
      harness.destroy();
    }
  });

  it("maps a paginated continuation handle back to the master model cell", () => {
    const harness = createResizeHarness();
    harness.cell.setAttribute("data-bc-pagination-master-cell-id", "master-cell");
    harness.table._positionColumnResizeHandle("master-cell", harness.cell);
    const grid = {
      getSpan: jasmine.createSpy("getSpan")
        .and.callFake((id: string) => id === "master-cell"
          ? {start: [0, 0], end: [0, 0]}
          : null),
    };
    harness.table._getTableModelGrid = jasmine.createSpy("_getTableModelGrid")
      .and.returnValue(grid);

    try {
      harness.table.onColResizerMousedown(new MouseEvent("mousedown", {
        button: 0,
        cancelable: true,
        clientX: 130,
      }));

      expect(grid.getSpan).toHaveBeenCalledWith("master-cell");
      expect(document.body.querySelector(
        "[data-bc-table-col-resize-preview]",
      )).not.toBeNull();

      window.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape"}));
      expect(harness.table.updateProps).not.toHaveBeenCalled();
    } finally {
      harness.destroy();
    }
  });

  it("resolves a merged-cell resize boundary without building the full table grid", () => {
    const harness = createResizeHarness([120, 140, 160]);
    Object.defineProperty(harness.table, "id", {value: "table-1"});
    harness.table.doc.model = {
      getParentId: (id: string) => ({
        "cell-1": "row-1",
        "row-1": "table-1",
      } as Record<string, string>)[id] ?? null,
      getChildrenIds: (id: string) => id === "row-1"
        ? ["cell-1", "cell-covered", "cell-3"]
        : [],
      getFlavour: (id: string) => id === "row-1"
        ? "table-row"
        : id === "cell-1"
          ? "table-cell"
          : undefined,
      getProps: (id: string) => id === "cell-1" ? {colspan: 2} : {},
    };
    harness.table._getTableModelGrid = jasmine.createSpy("_getTableModelGrid")
      .and.throwError("a distant legacy merge makes the strict grid invalid");

    try {
      harness.table.onColResizerMousedown(new MouseEvent("mousedown", {
        button: 0,
        cancelable: true,
        clientX: 130,
      }));

      expect(harness.table._getTableModelGrid).not.toHaveBeenCalled();
      expect(document.body.querySelector(
        "[data-bc-table-col-resize-preview]",
      )).not.toBeNull();

      document.dispatchEvent(new MouseEvent("mousemove", {
        cancelable: true,
        clientX: 170,
      }));
      document.dispatchEvent(new MouseEvent("mouseup", {
        button: 0,
        cancelable: true,
        clientX: 170,
      }));

      expect(harness.table.updateProps).toHaveBeenCalledOnceWith({
        colWidths: [120, 180, 160],
      });
    } finally {
      harness.destroy();
    }
  });

  it("uses a diagnostic projection when a collaborative parent edge is unavailable", () => {
    const harness = createResizeHarness([120, 140]);
    Object.defineProperty(harness.table, "id", {value: "table-1"});
    const facts: Record<string, {
      flavour: string;
      props: Record<string, unknown>;
      children: string[];
    }> = {
      "table-1": {
        flavour: "table",
        props: {colWidths: [120, 140]},
        children: ["row-1", "row-2"],
      },
      "row-1": {
        flavour: "table-row",
        props: {},
        children: ["cell-1", "cell-2"],
      },
      "row-2": {
        flavour: "table-row",
        props: {},
        children: ["orphan-hidden", "cell-4"],
      },
      "cell-1": {flavour: "table-cell", props: {}, children: []},
      "cell-2": {flavour: "table-cell", props: {}, children: []},
      "orphan-hidden": {
        flavour: "table-cell",
        props: {display: "none"},
        children: [],
      },
      "cell-4": {flavour: "table-cell", props: {}, children: []},
    };
    harness.table.doc.model = {
      getParentId: () => null,
      getChildrenIds: (id: string) => [...(facts[id]?.children ?? [])],
      getFlavour: (id: string) => facts[id]?.flavour,
      getProps: (id: string) => facts[id]?.props,
    };
    harness.table._getTableModelGrid = jasmine.createSpy("_getTableModelGrid")
      .and.returnValue(null);

    try {
      harness.table.onColResizerMousedown(new MouseEvent("mousedown", {
        button: 0,
        cancelable: true,
        clientX: 130,
      }));

      expect(document.body.querySelector(
        "[data-bc-table-col-resize-preview]",
      )).not.toBeNull();
      expect(harness.table._getTableModelGrid).not.toHaveBeenCalled();
      window.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape"}));
    } finally {
      harness.destroy();
    }
  });

  it("cancels the guide without a model write on Escape", () => {
    const harness = createResizeHarness();
    harness.table._getTableModelGrid = jasmine.createSpy("_getTableModelGrid")
      .and.returnValue({getSpan: () => ({start: [0, 0], end: [0, 0]})});

    try {
      harness.table.onColResizerMousedown(new MouseEvent("mousedown", {
        button: 0,
        cancelable: true,
        clientX: 130,
      }));
      const previewLine = document.body.querySelector<HTMLElement>(
        "[data-bc-table-col-resize-preview]",
      );
      expect(previewLine).not.toBeNull();
      document.dispatchEvent(new MouseEvent("mousemove", {
        cancelable: true,
        clientX: -100,
      }));
      expect(previewLine!.style.transform).toBe("translate3d(59px, 0px, 0px)");

      window.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape"}));
      document.dispatchEvent(new MouseEvent("mouseup", {
        button: 0,
      }));

      expect(harness.table.updateProps).not.toHaveBeenCalled();
      expect(previewLine!.isConnected).toBeFalse();
      expect(harness.host.classList.contains("is-resizing-col")).toBeFalse();
      expect(harness.table.resizingCol$.value).toBeFalse();
    } finally {
      harness.destroy();
    }
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

describe("TableBlockComponent cell drag native-selection handoff", () => {
  it("cancels native range growth after a document move promotes the model drag", () => {
    const table = Object.create(TableBlockComponent.prototype) as TableBlockComponent & any;
    table._startSelectingCell = null;
    table._handleNativeMouseOver = jasmine.createSpy("_handleNativeMouseOver")
      .and.callFake(() => {
        table._startSelectingCell = {id: "cell-0-0"};
      });
    table._clearNativeSelectionWhileCellDragging = jasmine.createSpy(
      "_clearNativeSelectionWhileCellDragging",
    );
    const event = new MouseEvent("pointermove", {
      buttons: 1,
      cancelable: true,
    });

    table._handleNativeCellDragMove(event);

    expect(table._handleNativeMouseOver).toHaveBeenCalledOnceWith(event);
    expect(event.defaultPrevented).toBeTrue();
    expect(table._clearNativeSelectionWhileCellDragging).toHaveBeenCalled();
  });

  it("leaves ordinary same-cell text selection native before drag promotion", () => {
    const table = Object.create(TableBlockComponent.prototype) as TableBlockComponent & any;
    table._startSelectingCell = null;
    table._handleNativeMouseOver = jasmine.createSpy("_handleNativeMouseOver");
    table._clearNativeSelectionWhileCellDragging = jasmine.createSpy(
      "_clearNativeSelectionWhileCellDragging",
    );
    const event = new MouseEvent("pointermove", {
      buttons: 1,
      cancelable: true,
    });

    table._handleNativeCellDragMove(event);

    expect(event.defaultPrevented).toBeFalse();
    expect(table._clearNativeSelectionWhileCellDragging).not.toHaveBeenCalled();
  });

  it("does not read pagination masks again while pointermove stays in the same cell", () => {
    const table = Object.create(TableBlockComponent.prototype) as TableBlockComponent & any;
    table.hoveringCell = {id: "cell-0-0"};
    table._startSelectingCell = {id: "cell-0-0"};
    table._closetCell = jasmine.createSpy("_closetCell").and.returnValue("cell-0-0");
    table._handleNativeMouseOver = jasmine.createSpy("_handleNativeMouseOver");
    table._clearNativeSelectionWhileCellDragging = jasmine.createSpy(
      "_clearNativeSelectionWhileCellDragging",
    );
    const event = new MouseEvent("pointermove", {buttons: 1, cancelable: true});

    table._handleNativeCellDragMove(event);

    expect(table._handleNativeMouseOver).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBeTrue();
  });

  it("coalesces crossed cells to the last target in one animation frame", () => {
    const table = Object.create(TableBlockComponent.prototype) as TableBlockComponent & any;
    table.hostElement = document.createElement("div");
    table._startSelectingCell = {id: "cell-0-0"};
    table._lastSelectingCell = null;
    table._pendingDragCell = null;
    table._dragSelectionFrame = null;
    table._setRectangleSelected = jasmine.createSpy("_setRectangleSelected");
    let frame: FrameRequestCallback | null = null;
    spyOn(window, "requestAnimationFrame").and.callFake(callback => {
      frame = callback;
      return 17;
    });

    table._queueDragSelection({id: "cell-0-1"});
    table._queueDragSelection({id: "cell-0-2"});

    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(table._setRectangleSelected).not.toHaveBeenCalled();
    frame!(0);
    expect(table._lastSelectingCell.id).toBe("cell-0-2");
    expect(table._setRectangleSelected).toHaveBeenCalledTimes(1);
  });

  it("keeps the native-selection guard alive through pointerup until mouseup", () => {
    const table = Object.create(TableBlockComponent.prototype) as TableBlockComponent & any;
    const host = document.createElement("table");
    const cellHost = document.createElement("td");
    cellHost.setAttribute("data-block-id", "cell-0-0");
    host.appendChild(cellHost);
    document.body.appendChild(host);
    const cell = {id: "cell-0-0", hostElement: cellHost};
    table.hostElement = host;
    table._startSelectingCell = null;
    table._pendingDragCell = null;
    table._dragSelectionFrame = null;
    table._clearSelectionUiState = jasmine.createSpy("_clearSelectionUiState");
    table._isInsideCellFlowMask = jasmine.createSpy("_isInsideCellFlowMask").and.returnValue(false);
    table._getTableModelGrid = jasmine.createSpy("_getTableModelGrid").and.returnValue(null);
    table._clearNativeSelectionWhileCellDragging = jasmine.createSpy(
      "_clearNativeSelectionWhileCellDragging",
    );
    table.onEndSelect = jasmine.createSpy("onEndSelect");
    table.onDestroy$ = new Subject<void>();
    table.doc = {
      ngZone: {runOutsideAngular: (callback: () => unknown) => callback()},
      getBlockById: () => cell,
    };
    host.addEventListener("mousedown", event => table._handleNativeMouseDown(event), {once: true});
    cellHost.dispatchEvent(new MouseEvent("mousedown", {button: 0, bubbles: true}));
    expect(table._clearSelectionUiState).toHaveBeenCalledTimes(1);
    expect(table._pendingStart).toBe(cell);
    table._startSelectingCell = cell;

    window.dispatchEvent(new PointerEvent("pointerup", {button: 0}));
    expect(table.onEndSelect).not.toHaveBeenCalled();

    window.dispatchEvent(new MouseEvent("mouseup", {button: 0}));
    expect(table.onEndSelect).toHaveBeenCalledTimes(1);
    host.remove();
  });

  it("routes a paginated rowspan continuation drag to its master cell", () => {
    const table = Object.create(TableBlockComponent.prototype) as TableBlockComponent & any;
    const host = document.createElement("table");
    const masterHost = document.createElement("td");
    const continuationHost = document.createElement("td");
    masterHost.setAttribute("data-block-id", "master");
    continuationHost.setAttribute("data-block-id", "continuation");
    host.append(masterHost, continuationHost);
    document.body.appendChild(host);

    const master = {id: "master", hostElement: masterHost};
    const continuation = {
      id: "continuation",
      hostElement: continuationHost,
      setPaginationRender: jasmine.createSpy("setPaginationRender"),
    };
    table.hostElement = host;
    table._splitCells = new Set();
    table._continuationsOf = new Map([[master, [continuation]]]);
    table._selectedCellSet = new Set();
    table.selectCell = (cell: any) => {
      table._selectedCellSet.add(cell);
      table._toggleCellSelected(cell, true);
    };
    table._startSelectingCell = null;
    table._lastSelectingCell = null;
    table._pendingDragCell = null;
    table._dragSelectionFrame = null;
    table._clearSelectionUiState = jasmine.createSpy("_clearSelectionUiState");
    table._isInsideCellFlowMask = jasmine.createSpy("_isInsideCellFlowMask").and.returnValue(false);
    table._getTableModelGrid = jasmine.createSpy("_getTableModelGrid").and.returnValue({
      getCellCoordinate: (id: string) => id === "master" ? [0, 0] : null,
    });
    table._clearNativeSelectionWhileCellDragging = jasmine.createSpy(
      "_clearNativeSelectionWhileCellDragging",
    );
    table._flushPendingDragSelection = jasmine.createSpy("_flushPendingDragSelection");
    table.onEndSelect = jasmine.createSpy("onEndSelect");
    table.onDestroy$ = new Subject<void>();
    table.doc = {
      ngZone: {runOutsideAngular: (callback: () => unknown) => callback()},
      getBlockById: (id: string) => id === "master" ? master : null,
      selection: {blur: jasmine.createSpy("blur")},
    };

    table._setCellOverride(continuation, {display: "", rowspan: 2}, master.id);
    host.addEventListener("mousedown", event => table._handleNativeMouseDown(event), {once: true});
    const down = new MouseEvent("mousedown", {
      button: 0,
      bubbles: true,
      cancelable: true,
    });
    continuationHost.dispatchEvent(down);

    expect(down.defaultPrevented).toBeTrue();
    expect(continuationHost.style.pointerEvents).toBe("auto");
    expect(continuationHost.getAttribute("contenteditable")).toBe("false");
    expect(table._closetCell({target: continuationHost} as unknown as Event)).toBe("master");
    expect(table._startSelectingCell).toBe(master);
    expect(table._selectedCellSet.has(master)).toBeTrue();
    expect(masterHost.classList.contains("bc-table-cell-selected")).toBeTrue();
    expect(continuationHost.classList.contains("bc-table-cell-selected")).toBeTrue();

    const selectStart = new Event("selectstart", {bubbles: true, cancelable: true});
    continuationHost.dispatchEvent(selectStart);
    expect(selectStart.defaultPrevented).toBeTrue();
    expect(table._clearNativeSelectionWhileCellDragging).toHaveBeenCalled();

    window.dispatchEvent(new MouseEvent("mouseup", {button: 0, cancelable: true}));
    expect(table.onEndSelect).toHaveBeenCalledTimes(1);

    table._clearCellOverrides();
    expect(continuationHost.style.pointerEvents).toBe("");
    expect(continuationHost.hasAttribute("contenteditable")).toBeFalse();
    host.remove();
  });

  it("clears a Safari native range through SelectionManager without losing sync guards", () => {
    const table = Object.create(TableBlockComponent.prototype) as TableBlockComponent & any;
    const host = document.createElement("div");
    const text = document.createTextNode("native table range");
    host.appendChild(text);
    document.body.appendChild(host);
    const nativeSelection = document.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(text);
    nativeSelection.removeAllRanges();
    nativeSelection.addRange(range);

    table.hostElement = host;
    table._startSelectingCell = {id: "cell-0-0"};
    table._suppressFocusSync = false;
    table.doc = {
      selection: {
        blur: jasmine.createSpy("blur").and.callFake(() => nativeSelection.removeAllRanges()),
      },
    };

    table._clearNativeSelectionWhileCellDragging();

    expect(table.doc.selection.blur).toHaveBeenCalledTimes(1);
    expect(table._suppressFocusSync).toBeFalse();
    expect(nativeSelection.rangeCount).toBe(0);
    host.remove();
  });

  it("expands a 100-row rectangle by one column using only the new edge", () => {
    const table = Object.create(TableBlockComponent.prototype) as TableBlockComponent & any;
    const cells = new Map<string, any>();
    for (let row = 0; row < 100; row++) {
      const id = `cell-${row}-99`;
      cells.set(id, {
        id,
        flavour: "table-cell",
        hostElement: document.createElement("td"),
        getIndexOfParent: () => 99,
      });
    }
    const getMasterCellIdAt = jasmine.createSpy("getMasterCellIdAt")
      .and.callFake((row: number, col: number) => `cell-${row}-${col}`);
    table.doc = {
      vm: {isMounted: () => true},
      getBlockById: (id: string) => cells.get(id) ?? null,
    };
    table._selectedCellSet = new Set();
    table._continuationsOf = new Map();

    table._applyRectangleSelectionDiff(
      {getMasterCellIdAt} as any,
      {start: [0, 0], end: [99, 98]},
      {start: [0, 0], end: [99, 99]},
    );

    expect(getMasterCellIdAt).toHaveBeenCalledTimes(100);
    expect(table._selectedCellSet.size).toBe(100);
  });
});

describe("TableBlockComponent pagination hot-path caches", () => {
  it("rechecks cell-flow health before returning from the table break cache", () => {
    const table = Object.create(TableBlockComponent.prototype) as TableBlockComponent & any;
    const grid = {};
    const breaks = [{
      kind: "cell-flow" as const,
      rowId: "row-1",
      cells: [{
        cellId: "cell-1",
        anchor: {kind: "cell-end" as const},
        gap: 40,
        backdropOffset: 20,
        backdropHeight: 10,
      }],
      mask: {top: 80, height: 40, backdropOffset: 20, backdropHeight: 10},
    }];
    table.tableBody = document.createElement("tbody");
    Object.defineProperty(table, "props", {value: {rowHead: false}});
    table._getTableModelGrid = () => grid;
    table._appliedPaginationBreakSig = JSON.stringify(breaks);
    table._appliedPaginationGrid = grid;
    const applyCellFlow = spyOn(table, "_applyCellFlowProjection");

    table._renderPaginationBreaks(breaks);

    expect(applyCellFlow).toHaveBeenCalledOnceWith(breaks);
  });

  it("suspends table-local pagination DOM in fullscreen and replays the latest breaks on exit", () => {
    const table = Object.create(TableBlockComponent.prototype) as TableBlockComponent & any;
    const initialBreaks = [{beforeRowId: "row-1", gap: 40}];
    const latestBreaks = [{beforeRowId: "row-2", gap: 60}];
    table.tableBody = document.createElement("tbody");
    table._paginationProjectionSuspended = false;
    table._lastPaginationBreaks = initialBreaks;
    const render = spyOn(table, "_renderPaginationBreaks");

    table._setPaginationProjectionSuspended(true);

    expect(table._paginationProjectionSuspended).toBeTrue();
    expect(render).toHaveBeenCalledOnceWith([]);
    expect(table._lastPaginationBreaks).toEqual(initialBreaks);

    table._setPaginationProjectionSuspended(true);
    expect(render).toHaveBeenCalledTimes(1);

    table._applyPaginationBreaks(latestBreaks);

    expect(table._lastPaginationBreaks).toEqual(latestBreaks);
    expect(table._lastPaginationBreaks).not.toBe(latestBreaks);
    expect(render).toHaveBeenCalledTimes(1);

    table._setPaginationProjectionSuspended(false);

    expect(table._paginationProjectionSuspended).toBeFalse();
    expect(render).toHaveBeenCalledTimes(2);
    expect(render.calls.mostRecent().args[0]).toEqual(latestBreaks);
  });

  it("keeps normal-flow pagination geometry stable while fullscreen is active", () => {
    const table = Object.create(TableBlockComponent.prototype) as TableBlockComponent & any;
    const normalGeometry = {
      naturalHeight: 1_200,
      headerHeight: 0,
      rows: [{id: "row-0", top: 0, bottom: 1_200, coveredFromAbove: false}],
    };
    const fullscreenGeometry = {
      naturalHeight: 600,
      headerHeight: 0,
      rows: [{id: "row-0", top: 0, bottom: 600, coveredFromAbove: false}],
    };
    let fullscreen = false;
    table.fullscreenController = {get isFullscreen() { return fullscreen; }};
    table._normalFlowPaginationGeometry = null;
    table._splitCells = new Set();
    table._cellFlowBlockOffsets = new Map();
    table._cellFlowMasks = new Set();
    const measure = spyOn(table, "_measurePaginationGeometryWithoutFullscreen")
      .and.returnValues(normalGeometry, fullscreenGeometry);

    expect(table._getPaginationGeometry({contentHeight: 800, widowOrphanLines: 2}))
      .toBe(normalGeometry);
    fullscreen = true;
    expect(table._getPaginationGeometry({contentHeight: 800, widowOrphanLines: 2}))
      .toBe(normalGeometry);
    expect(measure).toHaveBeenCalledTimes(1);

    fullscreen = false;
    expect(table._getPaginationGeometry({contentHeight: 800, widowOrphanLines: 2}))
      .toBe(fullscreenGeometry);
    expect(measure).toHaveBeenCalledTimes(2);
  });

  it("reuses model rowspan facts and ignores hidden continuation cells", () => {
    const table = Object.create(TableBlockComponent.prototype) as TableBlockComponent & any;
    const master = {
      id: "master",
      flavour: "table-cell",
      hasContent: true,
      getIndexOfParent: () => 0,
    };
    const getSpan = jasmine.createSpy("getSpan").and.returnValue({
      start: [0, 0],
      end: [1, 1],
    });
    const grid = {
      rowCount: 2,
      rowIds: ["row-0", "row-1"],
      getMasterCellId: (id: string) => id === "master" ? "master" : "master",
      getSpan,
    };
    table._paginationRowspanCache = null;
    table._getTableModelGrid = () => grid;
    table.doc = {
      model: {
        getChildrenIds: (rowId: string) => rowId === "row-0"
          ? ["master", "hidden-0"]
          : ["hidden-1", "hidden-2"],
      },
      getBlockById: (id: string) => id === "master" ? master : null,
    };

    const first = table._getPaginationRowCoverage([{}, {}]);
    const second = table._getPaginationRowCoverage([{}, {}]);

    expect(first.covered).toEqual([false, true]);
    expect(first.coveredByContent).toEqual([false, true]);
    expect(second).toEqual(first);
    expect(getSpan).toHaveBeenCalledTimes(1);
  });

  it("allows a rowspan boundary after the merged cell content has ended", () => {
    const table = Object.create(TableBlockComponent.prototype) as TableBlockComponent & any;
    table._layoutDistanceFromBcr = (distance: number) => distance;
    const grid = {};
    const content = document.createElement("div");
    content.getBoundingClientRect = () => new DOMRect(0, 20, 100, 130);
    const master = {
      id: "master",
      hasContent: true,
      getChildrenBlocks: () => [{hostElement: content}],
    };
    table._paginationRowspanCache = {
      grid,
      spans: [{cellId: "master", startRow: 0, endRow: 2}],
    };
    table._getTableModelGrid = () => grid;
    table._getLiveBlockById = () => master;
    table._isTableCellBlock = () => true;

    const coverage = table._refinePaginationContentMergeCoverage(
      [{top: 0}, {top: 100}, {top: 200}],
      [false, true, true],
      0,
    );

    // 内容底 150px：100px 边界仍会腰斩内容；200px 边界已在内容之后，可安全拆分。
    expect(coverage).toEqual([false, true, false]);
  });

  it("does not inspect cell subtrees when there are no oversized candidate rows", () => {
    const table = Object.create(TableBlockComponent.prototype) as TableBlockComponent & any;
    table._nestedAtomicLocks = new Set();

    expect(table._syncNestedAtomicLocks(800, [])).toBeFalse();
    expect(table._nestedAtomicLocks.size).toBe(0);
  });

  it("fails closed before measuring a rich row beyond the continuation budget", () => {
    const table = Object.create(TableBlockComponent.prototype) as TableBlockComponent & any;
    const cells = Array.from({length: 9}, (_, index) => {
      const cell = Object.create(TableCellBlockComponent.prototype);
      Object.defineProperties(cell, {
        props: {value: {display: "table-cell"}},
        hostElement: {value: document.createElement("td")},
        id: {value: `cell-${index}`},
      });
      return cell;
    });
    const row = {getChildrenBlocks: () => cells};
    const measure = spyOn(table, "_measureSingleCellFlow");
    const budget = {continuations: 0, safeAnchors: 0};

    const result = table._measureCellFlowInputs(
      row,
      0,
      50_000,
      0,
      100,
      2,
      budget,
    );

    expect(result).toEqual([]);
    expect(measure).not.toHaveBeenCalled();
    expect(budget.continuations).toBe(0);
  });

  it("keeps the first Block boundary for a vertically aligned short cell", () => {
    const table = Object.create(TableBlockComponent.prototype) as TableBlockComponent & any;
    table._layoutDistanceFromBcr = (distance: number) => distance / 1.25;
    const childElement = document.createElement("div");
    childElement.getBoundingClientRect = () => new DOMRect(0, 1_875, 125, 62.5);
    const cell = {
      id: "cell-short",
      getChildrenBlocks: () => [{id: "first-child", hostElement: childElement}],
    };
    const budget = {continuations: 0, safeAnchors: 0};

    const input = table._measureSingleCellFlow(
      cell,
      0,
      2_000,
      0,
      979,
      2,
      budget,
    );

    expect(input).toEqual({
      cellId: "cell-short",
      points: [
        {offset: 1_500, anchor: {kind: "block", blockId: "first-child"}},
        {offset: 1_550, anchor: {kind: "cell-end"}},
      ],
    });
  });

  it("converts the measured visual line guard into table layout pixels", () => {
    const table = Object.create(TableBlockComponent.prototype) as TableBlockComponent & any;
    table._layoutDistanceFromBcr = (distance: number) => distance / 1.25;
    const childHost = document.createElement("div");
    const container = document.createElement("div");
    childHost.appendChild(container);
    childHost.getBoundingClientRect = () => new DOMRect(0, 0, 125, 200);
    container.getBoundingClientRect = () => new DOMRect(0, 0, 125, 200);
    const runtime = {};
    const release = registerInlinePaginationAccess(runtime, {
      apply: () => true,
      clear: () => undefined,
      measureLineStarts: () => [{
        offset: 5,
        top: 50,
        visualGuardHeight: 25,
      }],
    });
    const child = Object.create(EditableBlockComponent.prototype);
    Object.defineProperties(child, {
      id: {value: "paragraph-1"},
      hostElement: {value: childHost},
      containerElement: {value: container},
      runtime: {value: runtime},
    });
    const cell = {
      id: "cell-1",
      getChildrenBlocks: () => [child],
    };

    try {
      const input = table._measureSingleCellFlow(
        cell,
        0,
        160,
        0,
        100,
        1,
        {continuations: 0, safeAnchors: 0},
      );

      expect(input?.points[0]).toEqual({
        offset: 40,
        anchor: {kind: "text", blockId: "paragraph-1", offset: 5},
        requiredTail: 20,
      });
    } finally {
      release();
    }
  });

  it("finishes an empty visible cell without reserving the oversized row stride", () => {
    const table = Object.create(TableBlockComponent.prototype) as TableBlockComponent & any;
    const budget = {continuations: 0, safeAnchors: 0};

    const input = table._measureSingleCellFlow(
      {id: "empty-cell", getChildrenBlocks: () => []},
      0,
      2_000,
      0,
      979,
      2,
      budget,
    );

    expect(input).toEqual({
      cellId: "empty-cell",
      points: [{offset: 1, anchor: {kind: "cell-end"}}],
    });
    expect(budget.safeAnchors).toBe(1);
  });

  it("projects repeated block-anchor gaps as one reversible offset without injecting cell DOM", () => {
    const table = Object.create(TableBlockComponent.prototype) as TableBlockComponent & any;
    const wrapper = document.createElement("div");
    wrapper.className = "table-cell__children-wrapper";
    wrapper.style.paddingTop = "1px";
    const previous = document.createElement("div");
    previous.textContent = "previous";
    previous.style.marginBottom = "12px";
    const paragraph = document.createElement("p");
    paragraph.textContent = "paragraph";
    paragraph.style.setProperty("margin-top", "7px", "important");
    const next = document.createElement("p");
    next.textContent = "next";
    next.style.marginTop = "5px";
    wrapper.append(previous, paragraph, next);
    const cellHost = document.createElement("div");
    cellHost.appendChild(wrapper);
    document.body.appendChild(cellHost);
    const cell = Object.create(TableCellBlockComponent.prototype);
    Object.defineProperties(cell, {
      id: {value: "cell-1"},
      hostElement: {value: cellHost},
    });
    cell.getChildrenBlocks = () => [
      {id: "previous", hostElement: previous},
      {id: "paragraph-1", hostElement: paragraph},
      {id: "paragraph-2", hostElement: next},
    ];
    table.getChildrenBlocks = () => [{id: "row-1", getChildrenBlocks: () => [cell]}];
    table._cellFlowSig = "";
    table._cellFlowBlockOffsets = new Map();
    table._cellFlowMasks = new Set();
    table._cellFlowRuntimes = new Set();
    table._cellFlowRuntimeGaps = new Map();
    table._cellFlowAnchorOwners = new Map();
    const tableWrapper = document.createElement("div");
    tableWrapper.appendChild(document.createElement("table"));
    document.body.appendChild(tableWrapper);
    table.hostElement = tableWrapper;
    table._stylePositionFromBcrDistance = (distance: number) => distance;
    table.tableWrapper = {nativeElement: tableWrapper};

    const naturalTop = paragraph.getBoundingClientRect().top;
    const naturalNextTop = next.getBoundingClientRect().top;
    table._applyCellFlowProjection([
      {
        kind: "cell-flow",
        rowId: "row-1",
        cells: [{
          cellId: "cell-1",
          anchor: {kind: "block", blockId: "paragraph-1"},
          gap: 60,
          backdropOffset: 30,
          backdropHeight: 20,
        }],
        mask: {top: 0, height: 60, backdropOffset: 30, backdropHeight: 20},
      },
      {
        kind: "cell-flow",
        rowId: "row-1",
        cells: [{
          cellId: "cell-1",
          anchor: {kind: "block", blockId: "paragraph-1"},
          gap: 60,
          backdropOffset: 30,
          backdropHeight: 20,
        }],
        mask: {top: 120, height: 60, backdropOffset: 30, backdropHeight: 20},
      },
      {
        kind: "cell-flow",
        rowId: "row-1",
        cells: [{
          cellId: "cell-1",
          anchor: {kind: "block", blockId: "paragraph-1"},
          gap: 60,
          backdropOffset: 30,
          backdropHeight: 20,
        }],
        mask: {top: 240, height: 60, backdropOffset: 30, backdropHeight: 20},
      },
      {
        kind: "cell-flow",
        rowId: "row-1",
        cells: [{
          cellId: "cell-1",
          anchor: {kind: "block", blockId: "paragraph-2"},
          gap: 60,
          backdropOffset: 30,
          backdropHeight: 20,
        }],
        mask: {top: 360, height: 60, backdropOffset: 30, backdropHeight: 20},
      },
    ]);

    expect(wrapper.children.length).toBe(3);
    expect(wrapper.lastElementChild).toBe(next);
    expect(paragraph.getBoundingClientRect().top - naturalTop).toBeCloseTo(180, 1);
    expect(next.getBoundingClientRect().top - naturalNextTop).toBeCloseTo(240, 1);
    expect(paragraph.style.getPropertyPriority("margin-top")).toBe("important");

    table._clearCellFlowProjection();
    expect(wrapper.children.length).toBe(3);
    expect(paragraph.style.marginTop).toBe("7px");
    expect(paragraph.style.getPropertyPriority("margin-top")).toBe("important");
    expect(next.style.marginTop).toBe("5px");
    expect(paragraph.getBoundingClientRect().top).toBeCloseTo(naturalTop, 1);
    expect(next.getBoundingClientRect().top).toBeCloseTo(naturalNextTop, 1);
    cellHost.remove();
    tableWrapper.remove();
  });

  it("restores a revoked text gap before reusing the same cell-flow mask", () => {
    const table = Object.create(TableBlockComponent.prototype) as TableBlockComponent & any;
    const wrapperHost = document.createElement("div");
    const tableElement = document.createElement("table");
    const body = document.createElement("tbody");
    const rowElement = document.createElement("tr");
    const cellHost = document.createElement("td");
    const childrenWrapper = document.createElement("div");
    const paragraphHost = document.createElement("p");
    const editContainer = document.createElement("span");
    childrenWrapper.className = "table-cell__children-wrapper";
    paragraphHost.appendChild(editContainer);
    childrenWrapper.appendChild(paragraphHost);
    cellHost.appendChild(childrenWrapper);
    rowElement.appendChild(cellHost);
    body.appendChild(rowElement);
    tableElement.appendChild(body);
    wrapperHost.appendChild(tableElement);
    document.body.appendChild(wrapperHost);

    const runtime = new InlineRuntime(editContainer, new Map());
    runtime.render([{insert: "abcdef"}]);
    const editable = Object.create(EditableBlockComponent.prototype);
    Object.defineProperties(editable, {
      id: {value: "paragraph-1"},
      hostElement: {value: paragraphHost},
      containerElement: {value: editContainer},
      runtime: {value: runtime},
    });
    const cell = Object.create(TableCellBlockComponent.prototype);
    Object.defineProperties(cell, {
      id: {value: "cell-1"},
      hostElement: {value: cellHost},
    });
    cell.getChildrenBlocks = () => [editable];
    table.getChildrenBlocks = () => [{id: "row-1", getChildrenBlocks: () => [cell]}];
    table.hostElement = wrapperHost;
    table.tableWrapper = {nativeElement: wrapperHost};
    table._stylePositionFromBcrDistance = (distance: number) => distance;
    table._cellFlowSig = "";
    table._cellFlowBlockOffsets = new Map();
    table._cellFlowMasks = new Set();
    table._cellFlowRuntimes = new Set();
    table._cellFlowRuntimeGaps = new Map();
    table._cellFlowAnchorOwners = new Map();
    const breaks = [{
      kind: "cell-flow" as const,
      rowId: "row-1",
      cells: [{
        cellId: "cell-1",
        anchor: {kind: "text" as const, blockId: "paragraph-1", offset: 3},
        gap: 60,
        backdropOffset: 30,
        backdropHeight: 20,
      }],
      mask: {top: 0, height: 60, backdropOffset: 30, backdropHeight: 20},
    }];

    table._applyCellFlowProjection(breaks);
    expect(editContainer.querySelector("[data-bc-inline-pagination-gap]")).not.toBeNull();
    expect(wrapperHost.querySelectorAll(".bc-pagination-table-flow-mask").length).toBe(1);

    // Inline model updates deliberately revoke view-only markers first. The
    // table must not let the unchanged break signature leave only its mask.
    runtime.applyDelta([{retain: 6}, {insert: "!"}]);
    expect(editContainer.querySelector("[data-bc-inline-pagination-gap]")).toBeNull();

    table._applyCellFlowProjection(breaks);
    expect(editContainer.querySelector("[data-bc-inline-pagination-gap]")).not.toBeNull();
    expect(wrapperHost.querySelectorAll(".bc-pagination-table-flow-mask").length).toBe(1);

    runtime.destroy();
    table._applyCellFlowProjection(breaks);
    expect(wrapperHost.querySelector(".bc-pagination-table-flow-mask")).toBeNull();

    wrapperHost.remove();
  });
});
