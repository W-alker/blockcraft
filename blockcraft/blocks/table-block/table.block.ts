import {ChangeDetectionStrategy, Component, ElementRef, ViewChild} from "@angular/core";
import {
  BaseBlockComponent, getPositionWithOffset,
  UIEventStateContext
} from "../../framework";
import {TableBlockModel} from "./index";
import {TableCellBlockComponent} from "./table-cell.block";
import {BehaviorSubject, filter, fromEvent, merge, skip, Subject, take, takeUntil} from "rxjs";
import {CellToolbarComponent} from "./widgets/cell-toolbar.component";
import {AsyncPipe, NgForOf, NgIf} from "@angular/common";
import {TableColBarComponent} from "./widgets/table-col-bar.component";
import {TableRowBarComponent} from "./widgets/table-row-bar.component";
import {adjustSelection, RectangleSelection} from "./utils";
import {debounce, nextTick, throttle} from "../../global";
import {addTableCol, addTableRow, deleteTableCols, deleteTableRows} from "./callback";
import {OverlayRef} from "@angular/cdk/overlay";
import {TableCellsSelection} from "./types";

@Component({
  selector: 'div.table-block',
  templateUrl: './table.block.html',
  standalone: true,
  imports: [NgForOf, TableColBarComponent, TableRowBarComponent, AsyncPipe, NgIf],
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

  @ViewChild('tableScrollable', {read: ElementRef}) tableScrollable!: ElementRef<HTMLElement>
  @ViewChild('colResizeBar', {read: ElementRef}) colResizeBar!: ElementRef<HTMLElement>
  @ViewChild('rowResizeBar', {read: ElementRef}) rowResizeBar!: ElementRef<HTMLElement>
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
          this.resizeObserver.observe(row as HTMLElement, {box: "border-box"})
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

  constructor() {
    super();
  }

  override ngAfterViewInit() {
    super.ngAfterViewInit();
    this.tableBody = this.tableScrollable.nativeElement.querySelector('tbody')!

    this.mutationObserver.observe(this.tableBody, {childList: true})
    nextTick().then(() => {
      this.rowBarComponent.changeDetectionRef.markForCheck()
    })

    this.doc.event.add('selectStart', this.onSelectstart, {blockId: this.id})
    this.doc.event.add('mouseEnter', this.onMouseEnter, {blockId: this.id})
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

    const sub2 = this.doc.event.customListen(cell.hostElement, 'mouseleave', {once: true}).subscribe(() => {
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
    const target = evt.target
    if (!(target instanceof HTMLElement) || target.tagName !== 'TD') return
    const id = target.getAttribute('data-block-id')
    if (!id) return

    if (!this.resizingCol$.value && !this.doc.isReadonly) {
      // hovering bar
      this.hoveringCell = this.doc.getBlockById(id) as TableCellBlockComponent
      const offsetX = this.hoveringCell.hostElement.getBoundingClientRect().right
        - this.tableScrollable.nativeElement.getBoundingClientRect().left + 10
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
    this.showToolbar(this._selectedCellSet[Symbol.iterator]().next().value.hostElement)
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
    const {start, end} = selection
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
      return {start: startCoordinate, end: startCoordinate}
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

    const {componentRef: cpr, overlayRef} = this.doc.overlayService.createConnectedOverlay<CellToolbarComponent>({
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

    cpr.setInput('options', {type, index, count})
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

  onColResizerMousedown(evt: Event) {
    evt.preventDefault()
    evt.stopPropagation()

    if (!this.hoveringCell || this._disableColResize) return
    this.resizingCol$.next(true)

    const resizingColIdx = this.hoveringCell.getIndexOfParent() + (this.hoveringCell.props.colspan || 1) - 1
    const curCol = this.hostElement.querySelector(`col:nth-child(${resizingColIdx + 1})`) as HTMLElement

    let newWidth = this.props.colWidths[resizingColIdx]
    const resizeSub = fromEvent<MouseEvent>(document, 'mousemove', {capture: true})
      .pipe(takeUntil(this.resizingCol$.pipe(filter(v => !v))))
      .subscribe((e) => {

        if (!this.hoveringCell) {
          resizeSub.unsubscribe()
          return
        }

        const {left} = this.tableScrollable.nativeElement.getBoundingClientRect()
        const scrollLeft = this.tableScrollable.nativeElement.scrollLeft
        if (!this.resizingCol$.value || e.clientX < left) return
        const targetRect = curCol.getBoundingClientRect()
        newWidth = e.clientX - targetRect.left
        // 不得小于50
        if (newWidth < 50) return
        const offsetX = targetRect.right + scrollLeft - left + 10
        this.colBarComponent.colWidths[resizingColIdx] = newWidth
        this.colBarComponent.changeDetectionRef.markForCheck()
        this.colResizeBar.nativeElement.style.left = `${offsetX}px`
        curCol.style.width = newWidth + 'px'
      })

    fromEvent(document, 'mouseup', {capture: true}).pipe(take(1)).subscribe(() => {
      if (!this.resizingCol$.value) return
      this.resizingCol$.next(false)
      const widths = [...this.props.colWidths]
      widths[resizingColIdx] = Math.max(50, newWidth)
      this.updateProps({
        colWidths: widths
      })
    })
  }

  private _colAdderHandler: ((e: Event) => void) | null = null

  onColAdderActive(colIdx: number) {
    if (this._disableColResize) return

    const offsetLeft = this.props.colWidths.slice(0, colIdx).reduce((a, b) => a + b, 0)
      - this.tableScrollable.nativeElement.scrollLeft

    const bar = this.colResizeBar.nativeElement
    bar.style.left = `${offsetLeft + 12}px`
    bar.classList.add('active')
    this._disableColResize = true

    // 移除上一个 addCol handler（如有）
    if (this._colAdderHandler) {
      bar.removeEventListener('mousedown', this._colAdderHandler)
    }

    // 创建新的 handler 并缓存引用
    this._colAdderHandler = (e: Event) => {
      e.stopPropagation()
      e.preventDefault()
      this.addColumn(colIdx)
    }

    bar.addEventListener('mousedown', this._colAdderHandler)

    // 一次性 pointerleave 事件
    bar.addEventListener('mouseleave', (e) => {
      e.stopPropagation()
      e.preventDefault()

      setTimeout(() => {
        bar.classList.remove('active')
        this._disableColResize = false
      }, 10)

      // 移除当前 handler
      if (this._colAdderHandler) {
        bar.removeEventListener('mousedown', this._colAdderHandler)
        this._colAdderHandler = null
      }
    }, {once: true})
  }

  private _rowAdderHandler: ((e: Event) => void) | null = null

  onRowAdderActive(rowIdx: number) {
    if (this._rowAdderHandler) return
    const offsetTop = this.childrenIds.slice(0, rowIdx).reduce((a, b) => a + this._rowHeightsRecord[b], 0)
    const el = this.rowResizeBar.nativeElement

    el.style.transform = `translateY(${offsetTop - 6 + 16}px)`
    el.classList.add('active')

    // 如果之前已经绑定了 handler，先解绑
    if (this._rowAdderHandler) {
      el.removeEventListener('mousedown', this._rowAdderHandler)
    }

    // 创建新的 handler，并存入字段
    this._rowAdderHandler = (e: Event) => {
      e.stopPropagation()
      e.preventDefault()
      this.addRow(rowIdx)
    }

    el.addEventListener('mousedown', this._rowAdderHandler)

    el.addEventListener('mouseleave', (e) => {
      e.stopPropagation()
      e.preventDefault()

      setTimeout(() => {
        el.classList.remove('active')

        // 解绑当前 handler
        if (this._rowAdderHandler) {
          el.removeEventListener('mousedown', this._rowAdderHandler)
          this._rowAdderHandler = null
        }
      }, 10)
    }, {once: true})
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
