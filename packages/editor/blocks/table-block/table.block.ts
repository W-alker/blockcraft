import { ChangeDetectionStrategy, Component, ElementRef, ViewChild } from "@angular/core";
import {
  BaseBlockComponent, getPositionWithOffset
} from "../../framework";
import { TableBlockModel } from "./index";
import { TableCellBlockComponent } from "./table-cell.block";
import { BehaviorSubject, filter, fromEvent, merge, Subject, take, takeUntil } from "rxjs";
import { TableColBarComponent } from "./widgets/table-col-bar.component";
import { TableRowBarComponent } from "./widgets/table-row-bar.component";
import { TableStructureToolbarComponent } from "./widgets/table-structure-toolbar.component";
import { resolveTableStructureAnchor } from "./widgets/table-structure-anchor";
import { adjustSelection, RectangleSelection } from "./utils";
import { debounce, nextTick, throttle } from "../../global";
import { addTableCol, addTableRow, deleteTableCols, deleteTableRows } from "./callback";
import { OverlayRef } from "@angular/cdk/overlay";
import { TableCellsSelection } from "./types";
import { BlockSelection } from "../../framework/modules/selection/blockSelection";

@Component({
  selector: 'div.table-block',
  templateUrl: './table.block.html',
  standalone: true,
  imports: [TableColBarComponent, TableRowBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.row-head]': 'props.rowHead',
    '[class.col-head]': 'props.colHead',
    '[class.has-col-handle-hover]': '_hoveredColHandle != null',
    '[class.has-row-handle-hover]': '_hoveredRowHandle != null',
    '[class.has-col-handle-visible]': '_visibleColHandle != null',
    '[class.has-row-handle-visible]': '_visibleRowHandle != null',
  }
})
export class TableBlockComponent extends BaseBlockComponent<TableBlockModel> {
  protected hoveringCell: TableCellBlockComponent | null = null
  protected resizingCol$ = new BehaviorSubject(false)

  protected _startSelectingCell: TableCellBlockComponent | null = null
  protected _lastSelectingCell: TableCellBlockComponent | null = null
  private _pendingStart: TableCellBlockComponent | null = null

  private _selectedCellSet = new Set<TableCellBlockComponent>()

  private toolbarOvr?: OverlayRef
  private _closeToolbar$ = new Subject()

  private tableBody!: HTMLElement

  @ViewChild('tableScrollable', { read: ElementRef }) tableScrollable!: ElementRef<HTMLElement>
  @ViewChild('tableWrapper', { read: ElementRef }) tableWrapper!: ElementRef<HTMLElement>
  @ViewChild('tableMenuAnchor', { read: ElementRef }) tableMenuAnchor!: ElementRef<HTMLElement>
  @ViewChild('colResizeBar', { read: ElementRef }) colResizeBar!: ElementRef<HTMLElement>
  @ViewChild('colBarComponent') colBarComponent!: TableColBarComponent
  @ViewChild('rowBarComponent') rowBarComponent!: TableRowBarComponent

  protected _rowHeightsRecord: Record<string, number> = {}

  protected _activeColRange: [number, number] = [-1, -1]
  protected _activeRowRange: [number, number] = [-1, -1]
  protected _hoveredColHandle: number | null = null
  protected _hoveredRowHandle: number | null = null
  protected _visibleColHandle: number | null = null
  protected _visibleRowHandle: number | null = null
  protected _tableMenu = {
    visible: false,
    left: -9999,
    top: -9999,
    width: 0,
    rowIndex: 0,
    rowCount: 1,
    colIndex: 0,
    colCount: 1,
    selectionKind: 'cell' as 'cell' | 'cells' | 'row' | 'col',
  }

  private _prevAdjustedSelection: TableCellsSelection | null = null
  private _activeCellsRange: { start: [number, number], end: [number, number], anchorId: string } | null = null
  private _suppressFocusSync = false

  private resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      const id = entry.target.getAttribute('data-block-id')
      this._rowHeightsRecord[id!] = entry.borderBoxSize[0].blockSize
      this.rowBarComponent.changeDetectionRef.markForCheck()
    }
  })

  private mutationObserver = new MutationObserver(records => {
    for (const record of records) {
      if (record.addedNodes.length) {
        record.addedNodes.forEach(row => {
          this.resizeObserver.observe(row as HTMLElement, { box: "border-box" })
        })
      }
      if (record.removedNodes.length) {
        record.removedNodes.forEach(row => {
          this.resizeObserver.unobserve(row as HTMLElement)
        })
      }
    }
    this.rowBarComponent.changeDetectionRef.markForCheck()
  })

  override ngAfterViewInit() {
    super.ngAfterViewInit();
    this.tableBody = this.tableScrollable.nativeElement.querySelector('tbody')!
    // 刚初始化的时候对row进行高度记录
    const rows = this.tableBody.querySelectorAll('tr')
    rows.forEach(row => {
      this.resizeObserver.observe(row as HTMLElement, { box: "border-box" })
    })
    this.mutationObserver.observe(this.tableBody, { childList: true })
    nextTick().then(() => {
      this.rowBarComponent.changeDetectionRef.markForCheck()
    })

    // Attach native DOM listeners directly to the table host so routing
    // cannot swallow the events. Capture-phase mousedown guarantees we arm
    // selection state before any other handler runs.
    fromEvent<MouseEvent>(this.hostElement, 'mousedown', { capture: true })
      .pipe(takeUntil(this.onDestroy$))
      .subscribe(e => this._handleNativeMouseDown(e))
    fromEvent<MouseEvent>(this.hostElement, 'mouseover')
      .pipe(takeUntil(this.onDestroy$))
      .subscribe(e => this._handleNativeMouseOver(e))
    this.doc.selection.selectionChange$
      .pipe(takeUntil(this.onDestroy$))
      .subscribe(selection => {
        this._syncTableFocusUi(selection)
      })
  }

  override ngOnDestroy() {
    super.ngOnDestroy();
    this.mutationObserver.disconnect()
    this.resizeObserver.disconnect()
  }

  get colLength() {
    return this.props.colWidths.length
  }

  get rowLength() {
    return this.childrenLength
  }

  getCellByCoordinate(rowIdx: number, colIdx: number) {
    return this.getChildrenByIndex(rowIdx).getChildrenByIndex(colIdx) as TableCellBlockComponent
  }

  addColumn(index: number) {
    this.doc.crud.transact(() => {
      addTableCol.call(this, index)
    })
  }

  addRow(index: number) {
    this.doc.crud.transact(() => {
      addTableRow.call(this, index)
    })
  }

  deleteColumns(index: number, count: number = 1) {
    if (index === 0 && this.colLength <= count) {
      this.doc.crud.deleteBlockById(this.id)
      return
    }

    this.doc.crud.transact(() => {
      deleteTableCols.call(this, index, count)

      const _colWidths: number[] = JSON.parse(JSON.stringify(this.props.colWidths))
      _colWidths.splice(index, count)
      this._activeColRange = [-1, -1]
      this.updateProps({
        colWidths: _colWidths
      })
    })
  }

  deleteRows(index: number, count = 1) {
    if (index === 0 && this.rowLength <= count) {
      this.doc.crud.deleteBlockById(this.id)
      return
    }

    this.doc.crud.transact(() => {
      deleteTableRows.call(this, index, count)
    })
  }

  setEqualColumnWidths(minWidth = 50) {
    if (!this.colLength) return

    const containerWidth = (this.tableScrollable?.nativeElement?.clientWidth
      || this.hostElement.clientWidth
      || this.colLength * minWidth) - 6
    const overhead = this._getTableHorizontalOverhead()
    const availableWidth = Math.max(this.colLength * minWidth, containerWidth - overhead)
    const eachWidth = Math.max(minWidth, Math.floor(availableWidth / this.colLength))
    const nextWidths = Array.from({ length: this.colLength }, () => eachWidth)

    this.updateProps({
      colWidths: nextWidths
    })

    // 清理拖拽过程中写入到 <col> 的临时 style.width，避免后续属性宽度被覆盖
    this._clearColInlineWidths()

    // 从超宽表格切换到均分时，重置并钳制滚动位置，避免右侧出现空白区
    this._normalizeHorizontalScroll(true)
  }

  toggleHeaderRow() {
    this.updateProps({
      rowHead: !this.props.rowHead
    })
  }

  toggleHeaderColumn() {
    this.updateProps({
      colHead: !this.props.colHead
    })
  }

  private _closetCell(event: Event) {
    const target = event.target as Node
    const ele = target instanceof HTMLElement ? target : target.parentElement!
    const closetCell = ele.closest('td')
    return closetCell?.getAttribute('data-block-id')
  }

  // Armed at capture-phase native mousedown on the table host. Native
  // listeners (not the framework dispatcher) so routing can't swallow events.
  private _handleNativeMouseDown(evt: MouseEvent) {
    if (this.doc.isReadonly) return
    const id = this._closetCell(evt)
    if (!id) return
    const cell = this.doc.getBlockById(id) as TableCellBlockComponent
    if (!cell) return

    this._clearSelected()
    this._startSelectingCell = this._lastSelectingCell = null
    this._prevAdjustedSelection = null
    this._activeCellsRange = null
    this._pendingStart = cell

    const origin = cell

    // Primary promotion signal: mouseleave on the origin cell itself.
    // This fires the moment the cursor crosses the cell boundary, regardless
    // of pointer capture, native text-selection state, or selectionchange
    // timing. `{ once: true }` so we only promote once; `_handleNativeMouseOver`
    // handles subsequent cell crossings for rectangle expansion.
    const onOriginLeave = () => {
      if (this._startSelectingCell) return
      if (!this._pendingStart) return
      this._startCellSelection(origin)
    }
    origin.hostElement.addEventListener('mouseleave', onOriginLeave, { once: true })

    let finished = false
    const finishSelection = () => {
      if (finished) return
      finished = true
      origin.hostElement.removeEventListener('mouseleave', onOriginLeave)
      releaseSub.unsubscribe()
      this.onEndSelect()
    }

    const releaseSub = merge(
      fromEvent<PointerEvent>(window, 'pointerup', { capture: true }),
      fromEvent<MouseEvent>(window, 'mouseup', { capture: true }),
      fromEvent<TouchEvent>(window, 'touchend', { capture: true }),
    ).pipe(takeUntil(this.onDestroy$)).subscribe(() => finishSelection())
  }

  private _handleNativeMouseOver(evt: MouseEvent) {
    if (this.doc.isReadonly) return
    const id = this._closetCell(evt)
    if (!id || this.hoveringCell?.id === id) return

    if (!this.resizingCol$.value) {
      this.hoveringCell = this.doc.getBlockById(id) as TableCellBlockComponent
      const offsetX = this.hoveringCell.hostElement.getBoundingClientRect().right
        - this.tableScrollable.nativeElement.getBoundingClientRect().left - 6
      this.colResizeBar.nativeElement.style.left = `${offsetX}px`
    }

    // Promote pending on first different-cell crossing (belt + suspenders
    // alongside the document pointermove listener).
    if (!this._startSelectingCell && this._pendingStart && evt.buttons >= 1
      && id !== this._pendingStart.id) {
      this._startCellSelection(this._pendingStart)
    }

    if (!this._startSelectingCell || evt.buttons < 1) return
    if ((!this._lastSelectingCell && id === this._startSelectingCell.id)
      || id === this._lastSelectingCell?.id) return
    this._lastSelectingCell = this.doc.getBlockById(id) as TableCellBlockComponent
    this._setRectangleSelected()
  }

  private _startCellSelection(cell: TableCellBlockComponent) {
    if (this._startSelectingCell) return
    // Apply visual state FIRST so the cell is already highlighted before we
    // touch the native selection. If we blur first, there's a flash where the
    // text cursor disappears but the 'selected' class hasn't painted yet.
    this._startSelectingCell = cell
    this._pendingStart = null
    this.hostElement.classList.add('is-selecting-cell')
    this.selectCell(cell)
    // Now clear the native selection so Safari doesn't keep extending it
    // across cells. Suppress sync so the transient null selectionchange
    // doesn't wipe the highlight/range state we just set.
    this._suppressFocusSync = true
    try {
      this.doc.selection.blur()
    } finally {
      this._suppressFocusSync = false
    }
  }

  private onEndSelect = () => {
    this._pendingStart = null
    if (!this._startSelectingCell) return;
    this.hostElement.classList.remove('is-selecting-cell')
    const anchorCell = this._startSelectingCell
    this._startSelectingCell = this._lastSelectingCell = null

    if (this._selectedCellSet.size > 1 && this._prevAdjustedSelection) {
      const sel = this._prevAdjustedSelection
      this._activeCellsRange = {
        start: [sel.start[0], sel.start[1]],
        end: [sel.end[0], sel.end[1]],
        anchorId: anchorCell.id,
      }
    } else {
      this._activeCellsRange = null
    }
    this._prevAdjustedSelection = null

    this._suppressFocusSync = true
    try {
      this.doc.selection.selectBlock(anchorCell)
    } finally {
      this._suppressFocusSync = false
    }
  }

  protected selectCell = (cell: TableCellBlockComponent) => {
    if (this._selectedCellSet.has(cell)) return
    this._selectedCellSet.add(cell)
    cell.hostElement.classList.add('selected')
  }

  protected _clearSelected() {
    this._selectedCellSet.forEach(cell => cell.hostElement.classList.remove('selected'))
    this._selectedCellSet.clear()
  }

  // 根据上下坐标设置矩形区间选中
  protected _setRectangleSelected() {
    const coordinates = this._getSelectedCellsCoordinates()
    if (!coordinates) {
      this._clearSelected()
      this._prevAdjustedSelection = null
      return;
    }
    const selection = this.confirmSelection(coordinates.start, coordinates.end)
    const { start, end } = selection
    if (this._prevAdjustedSelection?.start[0] === start[0]
      && this._prevAdjustedSelection?.end[0] === end[0]
      && this._prevAdjustedSelection?.start[1] === start[1]
      && this._prevAdjustedSelection?.end[1] === end[1]) return

    this._clearSelected()
    // 初始位置和结束位置相等
    if (start[0] === end[0] && start[1] === end[1]) {
      this.selectCell(this._startSelectingCell!)
      return
    }

    this._prevAdjustedSelection = selection

    this.getCellsMatrixByCoordinates(start, end).flat(1).forEach(cell => this.selectCell(cell))
  }

  protected _getSelectedCellsCoordinates() {
    if (!this._startSelectingCell || !this._lastSelectingCell) {
      const docSelection = this.doc.selection.value
      if (!docSelection || docSelection.firstBlock.flavour !== 'table-cell') return null
      this._startSelectingCell = this._lastSelectingCell = docSelection.firstBlock as TableCellBlockComponent
    }
    let startCell = this._startSelectingCell
    let endCell = this._lastSelectingCell

    const rowIds = this.childrenIds
    const startCoordinate = [rowIds.indexOf(startCell.parentId!), startCell.getIndexOfParent()]

    if (startCell === endCell) {
      return { start: startCoordinate, end: startCoordinate }
    }

    const endCoordinate = [rowIds.indexOf(endCell.parentId!), endCell.getIndexOfParent()]
    return {
      start: [Math.min(startCoordinate[0], endCoordinate[0]), Math.min(startCoordinate[1], endCoordinate[1])],
      end: [Math.max(startCoordinate[0], endCoordinate[0]), Math.max(startCoordinate[1], endCoordinate[1])]
    }
  }

  getCellsMatrixByCoordinates(start: number[], end: number[]) {
    return this.childrenIds.slice(start[0], end[0] + 1)
      .map(rowId => this.doc.getBlockById(rowId).childrenIds.slice(start[1], end[1] + 1).map(cid => this.doc.getBlockById(cid)) as TableCellBlockComponent[])
  }

  confirmSelection(start: number[], end: number[]) {
    return adjustSelection(new RectangleSelection(start[0], start[1], end[0], end[1]), this)
  }

  getSelectedCoordinates() {
    if (this._activeColRange[0] > -1 && this._activeColRange[1] > -1) {
      return {
        start: [0, this._activeColRange[0]],
        end: [this.rowLength - 1, this._activeColRange[1]]
      }
    }
    if (this._activeRowRange[0] > -1 && this._activeRowRange[1] > -1) {
      return {
        start: [this._activeRowRange[0], 0],
        end: [this._activeRowRange[1], this.colLength - 1]
      }
    }
    const cellsSelection = this._getSelectedCellsCoordinates()
    if (!cellsSelection) return null
    return this.confirmSelection(cellsSelection.start, cellsSelection.end)
  }

  onColHandleHovered(index: number | null) {
    this._hoveredColHandle = index
    this.changeDetectorRef.markForCheck()
  }

  onRowHandleHovered(index: number | null) {
    this._hoveredRowHandle = index
    this.changeDetectorRef.markForCheck()
  }

  private _getCellCoordinate(cell: TableCellBlockComponent) {
    const rowIdx = this.childrenIds.indexOf(cell.parentId!)
    const colIdx = cell.getIndexOfParent()
    if (rowIdx < 0 || colIdx < 0) return null
    return { rowIdx, colIdx }
  }

  private _resolveCellFromSelection(selection: BlockSelection | null) {
    if (!selection) return null
    const block = selection.firstBlock
    if (!this.hostElement.contains(block.hostElement)) return null
    if (block.flavour === 'table-cell') {
      return block as TableCellBlockComponent
    }

    const cellId = block.hostElement.closest('td[data-block-id]')?.getAttribute('data-block-id')
    if (!cellId) return null
    return this.doc.getBlockById(cellId) as TableCellBlockComponent
  }

  private _showTableMenu(options: {
    rowIndex: number,
    rowCount?: number,
    colIndex: number,
    colCount?: number,
    selectionKind?: 'cell' | 'cells' | 'row' | 'col',
  }) {
    if (this.doc.isReadonly) {
      this._hideTableMenu()
      return
    }

    const tableRect = this.tableWrapper.nativeElement.querySelector('table')?.getBoundingClientRect()
    if (!tableRect) {
      this._hideTableMenu()
      return
    }

    const anchor = resolveTableStructureAnchor({
      wrapperRect: this.tableWrapper.nativeElement.getBoundingClientRect(),
      selectionRect: tableRect,
      gap: 12,
    })

    this._tableMenu = {
      visible: true,
      left: anchor.left,
      top: anchor.top,
      width: anchor.width,
      rowIndex: options.rowIndex,
      rowCount: options.rowCount ?? 1,
      colIndex: options.colIndex,
      colCount: options.colCount ?? 1,
      selectionKind: options.selectionKind ?? 'cell',
    }
    this.hostElement.classList.add('active')
    this.changeDetectorRef.markForCheck()
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this._showTableMenuOverlay()
      })
    })
  }

  private _hideTableMenu() {
    this._disposeToolbar()
    this._tableMenu = {
      visible: false,
      left: -9999,
      top: -9999,
      width: 0,
      rowIndex: 0,
      rowCount: 1,
      colIndex: 0,
      colCount: 1,
      selectionKind: 'cell',
    }
    this.hostElement.classList.remove('active')
    this.changeDetectorRef.markForCheck()
  }

  private _clearActiveRanges() {
    if (this._activeColRange[0] !== -1 || this._activeColRange[1] !== -1) {
      this._activeColRange = [-1, -1]
      this.colBarComponent?.changeDetectionRef.markForCheck()
    }
    if (this._activeRowRange[0] !== -1 || this._activeRowRange[1] !== -1) {
      this._activeRowRange = [-1, -1]
      this.rowBarComponent?.changeDetectionRef.markForCheck()
    }
  }

  private _syncHandleVisibility(cell: TableCellBlockComponent | null) {
    if (!cell) {
      this._visibleRowHandle = null
      this._visibleColHandle = null
      this.changeDetectorRef.markForCheck()
      return
    }

    const coordinate = this._getCellCoordinate(cell)
    if (!coordinate) return
    this._visibleRowHandle = this._activeRowRange[0] > -1 ? this._activeRowRange[0] : coordinate.rowIdx
    this._visibleColHandle = this._activeColRange[0] > -1 ? this._activeColRange[0] : coordinate.colIdx
    this.changeDetectorRef.markForCheck()
  }

  private _syncTableFocusUi(selection: BlockSelection | null) {
    if (this.doc.isReadonly) {
      this._hideTableMenu()
      this._visibleRowHandle = null
      this._visibleColHandle = null
      this._clearSelected()
      this._activeCellsRange = null
      return
    }

    const cell = this._resolveCellFromSelection(selection)
    if (!cell) {
      // `selectBlock` fires a transient null selectionchange between
      // `removeAllRanges()` and `addRange()`. Skip so we don't wipe the range
      // and highlights we just set in `onEndSelect`.
      if (this._suppressFocusSync) return
      // Also skip while an active cell-drag is in progress: we deliberately
      // blur the native selection inside `_startCellSelection` to stop Safari
      // extending text selection, so a null selection is EXPECTED during drag.
      // Without this guard the async selectionchange dispatched by
      // `removeAllRanges()` would wipe the rectangle we just highlighted.
      if (this._startSelectingCell) return
      this._hideTableMenu()
      this._visibleRowHandle = null
      this._visibleColHandle = null
      this._clearSelected()
      this._clearActiveRanges()
      this._activeCellsRange = null
      return
    }

    if (this._startSelectingCell) return

    const coordinate = this._getCellCoordinate(cell)
    if (!coordinate) return

    const range = this._activeCellsRange
    if (range && range.anchorId === cell.id) {
      this._syncHandleVisibility(cell)
      this._showTableMenu({
        rowIndex: range.start[0],
        rowCount: range.end[0] - range.start[0] + 1,
        colIndex: range.start[1],
        colCount: range.end[1] - range.start[1] + 1,
        selectionKind: 'cells',
      })
      return
    }

    this._activeCellsRange = null
    this._clearSelected()
    this._clearActiveRanges()
    this._syncHandleVisibility(cell)

    this._showTableMenu({
      rowIndex: coordinate.rowIdx,
      colIndex: coordinate.colIdx,
      selectionKind: 'cell',
    })
  }

  refreshTableMenuFromSelection() {
    this._syncTableFocusUi(this.doc.selection.recalculate().value)
  }

  private _disposeToolbar() {
    if (this.toolbarOvr) {
      this.toolbarOvr.dispose()
      this.toolbarOvr = undefined
      this._closeToolbar$.next(true)
    }
  }

  private _showTableMenuOverlay() {
    this._disposeToolbar()

    if (this.doc.isReadonly || !this._tableMenu.visible || !this.tableMenuAnchor) {
      return
    }

    const closeCb = () => {
      this.toolbarOvr = undefined
    }

    const { componentRef, overlayRef } = this.doc.overlayService.createConnectedOverlay<TableStructureToolbarComponent>({
      target: this.tableMenuAnchor.nativeElement,
      component: TableStructureToolbarComponent,
      positions: [
        getPositionWithOffset('bottom-center', 0, 8),
        getPositionWithOffset('top-center', 0, 8),
      ],
      backdrop: false,
    }, this._closeToolbar$, closeCb)

    this.toolbarOvr = overlayRef
    componentRef.setInput('table', this)
    componentRef.setInput('rowIndex', this._tableMenu.rowIndex)
    componentRef.setInput('rowCount', this._tableMenu.rowCount)
    componentRef.setInput('colIndex', this._tableMenu.colIndex)
    componentRef.setInput('colCount', this._tableMenu.colCount)
    componentRef.setInput('selectionKind', this._tableMenu.selectionKind)
  }

  onColBarSelected(range: [number, number]) {
    const firstCell = this.firstChildren!.getChildrenByIndex(range[0]) as TableCellBlockComponent
    this.doc.selection.selectBlock(firstCell)
    const len = range[1] - range[0] + 1
    const currentRowIndex = this._visibleRowHandle ?? 0

    this.doc.selection.afterNextChange(() => {
      this._activeColRange = range
      this.colBarComponent.changeDetectionRef.markForCheck()
      const selectedCells = this.getCellsMatrixByCoordinates([0, range[0]], [this.rowLength - 1, range[1]])
        .map(row => row.filter((cell, cellAddIdx) => !cell.props.colspan || cell.props.colspan + cellAddIdx <= len))
        .flat(1)
      selectedCells.forEach(cell => this.selectCell(cell))
      this._visibleColHandle = range[0]
      this._visibleRowHandle = currentRowIndex

      // TODO 监听过程中col增加或减少了，调整选区

      this._showTableMenu({
        rowIndex: 0,
        rowCount: this.rowLength,
        colIndex: range[0],
        colCount: len,
        selectionKind: 'col',
      })
    })

  }

  onRowBarSelected(range: [number, number]) {
    const firstCell = this.getChildrenByIndex(range[0]).getChildrenByIndex(0) as TableCellBlockComponent
    this.doc.selection.selectBlock(firstCell)

    const len = range[1] - range[0] + 1
    const currentColIndex = this._visibleColHandle ?? 0

    this.doc.selection.afterNextChange(() => {
      this._activeRowRange = range
      this.rowBarComponent.changeDetectionRef.markForCheck()
      const selectedCells = this.getCellsMatrixByCoordinates([range[0], 0], [range[1], this.colLength - 1])
        .map(
          (row, rowAddIdx) =>
            row.filter(cell => !cell.props.rowspan || cell.props.rowspan + rowAddIdx <= len)
        ).flat(1)
      selectedCells.forEach(cell => this.selectCell(cell))
      this._visibleRowHandle = range[0]
      this._visibleColHandle = currentColIndex

      // TODO 监听过程中row增加或减少了，调整选区或者关闭

      this._showTableMenu({
        rowIndex: range[0],
        rowCount: len,
        colIndex: 0,
        colCount: this.colLength,
        selectionKind: 'row',
      })
    })
  }

  onColResizerMousedown(evt: MouseEvent) {
    evt.preventDefault()
    evt.stopPropagation()

    if (!this.hoveringCell) return
    this.resizingCol$.next(true)

    const resizingColIdx = this.hoveringCell.getIndexOfParent() + (this.hoveringCell.props.colspan || 1) - 1
    const curCol = this.hostElement.querySelector(`col:nth-child(${resizingColIdx + 1})`) as HTMLElement
    const scrollableEl = this.tableScrollable.nativeElement

    let newWidth = this.props.colWidths[resizingColIdx]
    let prevClientX = evt.clientX
    const minWidth = 50

    const resizeSub = fromEvent<MouseEvent>(document, 'mousemove', { capture: true })
      .pipe(takeUntil(this.resizingCol$.pipe(filter(v => !v))))
      .subscribe((e) => {
        if (!this.hoveringCell || !this.resizingCol$.value) {
          resizeSub.unsubscribe()
          return
        }

        // 计算鼠标移动的增量
        const deltaX = e.clientX - prevClientX
        prevClientX = e.clientX

        // 应用增量到宽度
        newWidth += deltaX

        // 最小宽度限制
        if (newWidth < minWidth) {
          newWidth = minWidth
          return
        }

        // 更新列宽
        curCol.style.width = newWidth + 'px'
        this.colBarComponent.colWidths[resizingColIdx] = newWidth
        this.colBarComponent.changeDetectionRef.markForCheck()

        // 更新可视指示器位置（考虑滚动偏移）
        const colRect = curCol.getBoundingClientRect()
        const containerRect = scrollableEl.getBoundingClientRect()
        // 列的右边界相对于容器的位置 + 滚动偏移量
        const barLeft = colRect.right - containerRect.left + scrollableEl.scrollLeft + 10
        this.colResizeBar.nativeElement.style.left = `${barLeft}px`
      })

    fromEvent(document, 'mouseup', { capture: true }).pipe(take(1)).subscribe(() => {
      if (!this.resizingCol$.value) return
      this.resizingCol$.next(false)
      const widths = [...this.props.colWidths]
      widths[resizingColIdx] = Math.max(minWidth, newWidth)
      this.updateProps({
        colWidths: widths
      })

      // 拖拽结束后清理临时 inline width，改由模型中的 colWidths 统一控制
      requestAnimationFrame(() => {
        curCol.style.width = ''
      })
      this._normalizeHorizontalScroll()
    })
  }

  private _clearColInlineWidths() {
    const cols = this.hostElement.querySelectorAll('col')
    cols.forEach(col => {
      (col as HTMLElement).style.width = ''
    })
  }

  private _getTableHorizontalOverhead() {
    const table = this.hostElement.querySelector('table') as HTMLElement | null
    if (!table) return 0
    const colEls = table.querySelectorAll('col')
    if (!colEls.length) return 0
    const colsTotal = Array.from(colEls).reduce((sum, col) => {
      return sum + (col as HTMLElement).getBoundingClientRect().width
    }, 0)
    return Math.max(0, Math.ceil(table.getBoundingClientRect().width - colsTotal))
  }

  private _normalizeHorizontalScroll(resetToStart = false) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const scroller = this.tableScrollable?.nativeElement
        if (!scroller) return
        if (resetToStart) {
          scroller.scrollLeft = 0
        }
        const maxScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth)
        if (scroller.scrollLeft > maxScrollLeft) {
          scroller.scrollLeft = maxScrollLeft
        }
      })
    })
  }

  private _prevScrollLeft = 0
  private _isShiftScroll = false

  onScrollEnd = debounce(() => {
    const scroller = this.tableScrollable.nativeElement
    if (!this._isShiftScroll && scroller.scrollLeft !== this._prevScrollLeft) {
      this.doc.messageService.info('按住 shift 键加滚轮可快速横向滚动')
      this._prevScrollLeft = scroller.scrollLeft
    }
    this._isShiftScroll = false
  }, 1000)

  onScroll = throttle((evt: Event) => {
    this.toolbarOvr?.updatePosition()
    if (this.doc.event.status.isShiftKeyPressing) {
      this._isShiftScroll = true
    }
  }, 50)
}
