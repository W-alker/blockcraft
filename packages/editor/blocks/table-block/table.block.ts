import { ChangeDetectionStrategy, Component, ElementRef, ViewChild } from "@angular/core";
import {
  BaseBlockComponent, getPositionWithOffset,
  UIEventStateContext
} from "../../framework";
import { TableBlockModel } from "./index";
import { TableCellBlockComponent } from "./table-cell.block";
import { BehaviorSubject, filter, fromEvent, merge, skip, Subject, take, takeUntil } from "rxjs";
import { CellToolbarComponent } from "./widgets/cell-toolbar.component";
import { AsyncPipe, NgForOf, NgIf } from "@angular/common";
import { TableColBarComponent } from "./widgets/table-col-bar.component";
import { TableRowBarComponent } from "./widgets/table-row-bar.component";
import { adjustSelection, RectangleSelection } from "./utils";
import { debounce, nextTick, throttle } from "../../global";
import { addTableCol, addTableRow, deleteTableCols, deleteTableRows } from "./callback";
import { OverlayRef } from "@angular/cdk/overlay";
import { TableCellsSelection } from "./types";
import { NzTooltipDirective } from "ng-zorro-antd/tooltip";

@Component({
  selector: 'div.table-block',
  templateUrl: './table.block.html',
  standalone: true,
  imports: [NgForOf, TableColBarComponent, TableRowBarComponent, AsyncPipe, NgIf, NzTooltipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.row-head]': 'props.rowHead',
    '[class.col-head]': 'props.colHead',
  }
})
export class TableBlockComponent extends BaseBlockComponent<TableBlockModel> {

  protected hoveringCell: TableCellBlockComponent | null = null
  protected resizingCol$ = new BehaviorSubject(false)

  protected _startSelectingCell: TableCellBlockComponent | null = null
  protected _lastSelectingCell: TableCellBlockComponent | null = null

  private _selectedCellSet = new Set<TableCellBlockComponent>()

  private toolbarOvr?: OverlayRef
  private _closeToolbar$ = new Subject()

  private tableBody!: HTMLElement

  @ViewChild('tableScrollable', { read: ElementRef }) tableScrollable!: ElementRef<HTMLElement>
  @ViewChild('colResizeBar', { read: ElementRef }) colResizeBar!: ElementRef<HTMLElement>
  @ViewChild('rowResizeBar', { read: ElementRef }) rowResizeBar!: ElementRef<HTMLElement>
  @ViewChild('colBarComponent') colBarComponent!: TableColBarComponent
  @ViewChild('rowBarComponent') rowBarComponent!: TableRowBarComponent

  protected _rowHeightsRecord: Record<string, number> = {}

  protected _activeColRange: [number, number] = [-1, -1]
  protected _activeRowRange: [number, number] = [-1, -1]

  private _prevAdjustedSelection: TableCellsSelection | null = null

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

    this.doc.event.add('selectStart', this.onSelectstart, { blockId: this.id })
    this.doc.event.add('mouseEnter', this.onMouseEnter, { blockId: this.id })
  }

  override ngOnDestroy() {
    super.ngOnDestroy();
    this.mutationObserver.disconnect()
    this.resizeObserver.disconnect()
    this.doc.event.remove('selectStart', this.onSelectstart)
    this.doc.event.remove('mouseEnter', this.onMouseEnter)

    // 清理列和行添加器的状态，避免事件监听器泄漏
    this._clearColAdderState()
    this._clearRowAdderState()
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

  onSelectstart = (ctx: UIEventStateContext) => {
    this._clearSelected()
    this._startSelectingCell = this._lastSelectingCell = null

    const evt = ctx.getDefaultEvent()
    const id = this._closetCell(evt)

    if (!id) return

    const cell = this.doc.getBlockById(id) as TableCellBlockComponent

    const startSelectCell = () => {
      this._startSelectingCell = cell
      this.hostElement.classList.add('is-selecting-cell')
      this.selectCell(cell)
      this.doc.selection.selectBlock(this._startSelectingCell!)
    }

    const sub1 = this.doc.event.customListen(document, 'selectionchange').pipe(skip(1)).subscribe(() => {
      const selection = window.getSelection()!
      if (!cell.hostElement.contains(selection.focusNode)) {
        startSelectCell()
        sub1.unsubscribe()
      }
    })

    const sub2 = this.doc.event.customListen(cell.hostElement, 'mouseleave', { once: true }).subscribe(() => {
      evt.preventDefault()
      evt.stopPropagation()

      startSelectCell()
    })

    this.doc.event.once('selectEnd', () => {
      sub1.unsubscribe()
      sub2.unsubscribe()
      this.onEndSelect()
    })
  }

  onMouseEnter = (ctx: UIEventStateContext) => {
    const evt = ctx.getDefaultEvent<MouseEvent>()
    const id = this._closetCell(evt)
    if (!id || this.hoveringCell?.id === id) return

    if (!this.resizingCol$.value && !this.doc.isReadonly) {
      // 鼠标回到表格单元格时，清理可能残留的添加器激活状态
      if (this._colAdderHandler) this._clearColAdderState()
      if (this._rowAdderHandler) this._clearRowAdderState()

      // hovering bar
      this.hoveringCell = this.doc.getBlockById(id) as TableCellBlockComponent
      const offsetX = this.hoveringCell.hostElement.getBoundingClientRect().right
        - this.tableScrollable.nativeElement.getBoundingClientRect().left - 6
      this.colResizeBar.nativeElement.style.left = `${offsetX}px`
    }

    // select cells
    if (!this._startSelectingCell || evt.buttons < 1) return;
    if ((!this._lastSelectingCell && id === this._startSelectingCell.id) || id === this._lastSelectingCell?.id) return
    this._lastSelectingCell = this.doc.getBlockById(id) as TableCellBlockComponent
    this._setRectangleSelected()
  }

  private onEndSelect = () => {
    if (!this._startSelectingCell) return;
    this.hostElement.classList.remove('is-selecting-cell')
    const firstSelectedCell = this._selectedCellSet[Symbol.iterator]().next().value
    if (firstSelectedCell) {
      this.showToolbar(firstSelectedCell.hostElement)
    }
    this._prevAdjustedSelection = null
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

  showToolbar(target: HTMLElement, type: 'col' | 'row' | 'cells' = 'cells', index?: number, count = 1, closeFn?: () => void) {
    if (this.toolbarOvr) {
      this.toolbarOvr.dispose()
      this.toolbarOvr = undefined
      this._closeToolbar$.next(true)
    }

    if (this.doc.isReadonly) {
      this.doc.selection.afterNextChange(() => this._clearSelected())
      return
    }

    this.hostElement.classList.add('active')
    const closeCb = () => {
      closeFn?.()

      // close toolbar
      this.hostElement.classList.remove('active')
      this._clearSelected()
      this._closeToolbar$.next(true)
      this._startSelectingCell = this._lastSelectingCell = null
    }

    const { componentRef: cpr, overlayRef } = this.doc.overlayService.createConnectedOverlay<CellToolbarComponent>({
      target,
      component: CellToolbarComponent,
      positions: [
        getPositionWithOffset('top-left', 0, 8),
        getPositionWithOffset('bottom-left', 0, 8),
        getPositionWithOffset('top-right', 0, 8),
        getPositionWithOffset('bottom-right', 0, 8),
      ],
      backdrop: true
    }, this._closeToolbar$, closeCb)
    this.toolbarOvr = overlayRef

    cpr.setInput('options', { type, index, count })
    cpr.setInput('doc', this.doc)
    cpr.setInput('table', this)

    const selectedCell = this.doc.selection.value!.firstBlock

    merge(
      this.doc.selection.selectionChange$.pipe(skip(1), filter(v => v?.from.blockId !== selectedCell.id)),
      this.onDestroy$, cpr.instance.onClose$)
      .pipe(takeUntil(cpr.instance.onDestroy)).subscribe(closeCb)
  }

  onColBarSelected(range: [number, number]) {
    const firstCell = this.firstChildren!.getChildrenByIndex(range[0]) as TableCellBlockComponent
    this.doc.selection.selectBlock(firstCell)

    const col = this.hostElement.querySelector(`col:nth-child(${range[0] + 1})`) as HTMLElement
    const len = range[1] - range[0] + 1

    this.doc.selection.afterNextChange(() => {
      this._activeColRange = range
      this.rowBarComponent.changeDetectionRef.markForCheck()
      this.getCellsMatrixByCoordinates([0, range[0]], [this.rowLength - 1, range[1]])
        .map(row => row.filter((cell, cellAddIdx) => !cell.props.colspan || cell.props.colspan + cellAddIdx <= len))
        .flat(1).forEach(cell => this.selectCell(cell))

      // TODO 监听过程中col增加或减少了，调整选区

      this.showToolbar(col, 'col', range[0], range[1] - range[0] + 1, () => {
        this._activeColRange = [-1, -1]
        this.colBarComponent.changeDetectionRef.markForCheck()
      })
    })

  }

  onRowBarSelected(range: [number, number]) {
    const firstCell = this.getChildrenByIndex(range[0]).getChildrenByIndex(0) as TableCellBlockComponent
    this.doc.selection.selectBlock(firstCell)

    const len = range[1] - range[0] + 1
    const row = this.hostElement.querySelector(`tr:nth-child(${range[0] + 1})`) as HTMLElement

    this.doc.selection.afterNextChange(() => {
      this._activeRowRange = range
      this.rowBarComponent.changeDetectionRef.markForCheck()
      this.getCellsMatrixByCoordinates([range[0], 0], [range[1], this.colLength - 1])
        .map(
          (row, rowAddIdx) =>
            row.filter(cell => !cell.props.rowspan || cell.props.rowspan + rowAddIdx <= len)
        ).flat(1)
        .forEach(cell => this.selectCell(cell))

      // TODO 监听过程中row增加或减少了，调整选区或者关闭

      this.showToolbar(row, 'row', range[0], range[1] - range[0] + 1, () => {
        this._activeRowRange = [-1, -1]
        this.rowBarComponent.changeDetectionRef.markForCheck()
      })
    })
  }

  private _disableColResize = false

  onColResizerMousedown(evt: MouseEvent) {
    evt.preventDefault()
    evt.stopPropagation()

    if (!this.hoveringCell || this._disableColResize) return
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

  private _colAdderHandler: ((e: Event) => void) | null = null
  private _colLeaveHandler: ((e: Event) => void) | null = null  // 新增：追踪 mouseleave 监听器

  onColAdderActive(colIdx: number) {
    // 先清理之前可能残留的状态（不能在此之前 return，否则卡住后永远无法恢复）
    this._clearColAdderState()

    const offsetLeft = this.props.colWidths.slice(0, colIdx).reduce((a, b) => a + b, 0)
      - this.tableScrollable.nativeElement.scrollLeft

    const bar = this.colResizeBar.nativeElement
    bar.style.left = `${offsetLeft - 6}px`
    bar.classList.add('active')
    this._disableColResize = true

    // 创建新的 handler 并缓存引用
    this._colAdderHandler = (e: Event) => {
      e.stopPropagation()
      e.preventDefault()
      this.addColumn(colIdx)
      // 添加列后立即清理状态
      this._clearColAdderState()
    }

    bar.addEventListener('mousedown', this._colAdderHandler)

    // 创建并缓存 mouseleave handler
    this._colLeaveHandler = (e: Event) => {
      e.stopPropagation()
      e.preventDefault()
      this._clearColAdderState()
    }

    bar.addEventListener('mouseleave', this._colLeaveHandler, { once: true, capture: true })
  }

  /**
   * 清理列添加器状态
   */
  private _clearColAdderState() {
    const bar = this.colResizeBar?.nativeElement
    if (!bar) return

    // 移除 active 类
    bar.classList.remove('active')
    this._disableColResize = false

    // 移除事件监听器
    if (this._colAdderHandler) {
      bar.removeEventListener('mousedown', this._colAdderHandler)
      this._colAdderHandler = null
    }

    if (this._colLeaveHandler) {
      bar.removeEventListener('mouseleave', this._colLeaveHandler)
      this._colLeaveHandler = null
    }
  }

  private _rowAdderHandler: ((e: Event) => void) | null = null
  private _rowLeaveHandler: ((e: Event) => void) | null = null  // 新增：追踪 mouseleave 监听器

  onRowAdderActive(rowIdx: number) {
    // 先清理之前可能残留的状态
    this._clearRowAdderState()

    const offsetTop = this.childrenIds.slice(0, rowIdx).reduce((a, b) => a + this._rowHeightsRecord[b], 0)
    const el = this.rowResizeBar.nativeElement

    el.style.transform = `translateY(${offsetTop - 6 + 16}px)`
    el.classList.add('active')

    // 创建新的 handler，并存入字段
    this._rowAdderHandler = (e: Event) => {
      e.stopPropagation()
      e.preventDefault()
      this.addRow(rowIdx)
      // 添加行后立即清理状态
      this._clearRowAdderState()
    }

    el.addEventListener('mousedown', this._rowAdderHandler)

    // 创建并缓存 mouseleave handler
    this._rowLeaveHandler = (e: Event) => {
      e.stopPropagation()
      e.preventDefault()
      this._clearRowAdderState()
    }

    el.addEventListener('mouseleave', this._rowLeaveHandler, { once: true, capture: true })
  }

  /**
   * 清理行添加器状态
   */
  private _clearRowAdderState() {
    const el = this.rowResizeBar?.nativeElement
    if (!el) return

    // 移除 active 类
    el.classList.remove('active')

    // 移除事件监听器
    if (this._rowAdderHandler) {
      el.removeEventListener('mousedown', this._rowAdderHandler)
      this._rowAdderHandler = null
    }

    if (this._rowLeaveHandler) {
      el.removeEventListener('mouseleave', this._rowLeaveHandler)
      this._rowLeaveHandler = null
    }
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
    if (this.doc.event.status.isShiftKeyPressing) {
      this._isShiftScroll = true
    }
  }, 50)
}
