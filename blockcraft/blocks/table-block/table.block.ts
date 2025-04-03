import {ChangeDetectionStrategy, Component, ElementRef, HostListener, ViewChild} from "@angular/core";
import {BaseBlockComponent, BLOCK_POSITION, createBlockGapSpace, ORIGIN_SKIP_SYNC} from "../../framework";
import {TableBlockModel} from "./index";
import {TableCellBlockComponent} from "./table-cell.block";
import {TableRowBlockComponent} from "./table-row.block";
import {BehaviorSubject, filter, fromEvent, merge, skip, take, takeUntil} from "rxjs";
import {Overlay, OverlayRef} from "@angular/cdk/overlay";
import {ComponentPortal} from "@angular/cdk/portal";
import {CellToolbarComponent} from "./widgets/cell-toolbar.component";
import {POSITION_MAP} from "../../components";
import {AsyncPipe, NgForOf, NgIf} from "@angular/common";
import {TableColBarComponent} from "./widgets/table-col-bar.component";
import {TableRowBarComponent} from "./widgets/table-row-bar.component";

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

  private _startSelectingCell: TableCellBlockComponent | null = null
  private _lastSelectingCell: TableCellBlockComponent | null = null

  selectedCellSet = new Set<TableCellBlockComponent>()

  private toolbarOvr?: OverlayRef

  @ViewChild('tableBody', {read: ElementRef}) tableBody!: ElementRef<HTMLElement>
  @ViewChild('colResizeBar', {read: ElementRef}) colResizeBar!: ElementRef<HTMLElement>
  @ViewChild('colBarComponent') colBarComponent!: TableColBarComponent
  @ViewChild('rowBarComponent') rowBarComponent!: TableRowBarComponent

  protected _rowHeightsRecord: Record<string, number> = {}

  protected _activeColRange: [number, number] = [-1, -1]
  protected _activeRowRange: [number, number] = [-1, -1]

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
  })

  constructor(
    private overlay: Overlay,
  ) {
    super();
  }

  override ngAfterViewInit() {
    super.ngAfterViewInit();

    this.mutationObserver.observe(this.tableBody.nativeElement, {childList: true})
    // this.hostElement.prepend(createBlockGapSpace())
    // this.hostElement.appendChild(createBlockGapSpace())
  }

  override ngOnDestroy() {
    super.ngOnDestroy();
    this.mutationObserver.disconnect()
    this.resizeObserver.disconnect()
  }

  addColumns(index: number, count: number = 1) {
    this.doc.crud.transact(() => {
      this.getChildrenBlocks().forEach(row => {
        (row as TableRowBlockComponent).addColumn(index, count)
      })
      const _colWidths: number[] = [...this.props.colWidths]
      _colWidths.splice(index, 0, ...new Array(count).fill(100))
      this.updateProps({colWidths: _colWidths})

      if (this._activeColRange[0] > -1) {
        this._activeColRange = [this._activeColRange[0] + count, this._activeColRange[1] + count]
      }
    }, ORIGIN_SKIP_SYNC)
  }

  addRows(index: number, count: number = 1) {
    const cellCount = this.firstChildren!.childrenLength
    const newRows = new Array(count).fill(0).map(() => this.doc.schemas.createSnapshot('table-row', [cellCount]))
    this.doc.crud.insertBlocks(this.id, index, newRows)
  }

  deleteColumn(index: number, count: number = 1) {
    this.doc.crud.transact(() => {
      this.getChildrenBlocks().forEach(row => {
        this.doc.crud.deleteBlocks(row.id, index, count)
      })
      const _colWidths: number[] = JSON.parse(JSON.stringify(this.props.colWidths))
      _colWidths.splice(index, count)
      this.updateProps({
        colWidths: _colWidths
      })
      this._activeColRange = [-1, -1]
    }, ORIGIN_SKIP_SYNC)
  }

  deleteRow(index: number) {
    this.doc.crud.deleteBlocks(this.id, index, 1)
  }

  private _closetCell(event: Event) {
    const target = event.target as Node
    const ele = target instanceof HTMLElement ? target : target.parentElement!
    const closetCell = ele.closest('td')
    return closetCell?.getAttribute('data-block-id')
  }

  @HostListener('selectstart', ['$event'])
  onSelectstart(event: Event) {
    this._clearSelected()
    const id = this._closetCell(event)

    if (!id) {
      event.stopPropagation()
      event.preventDefault()
      return
    }

    const cell = this.doc.getBlockById(id) as TableCellBlockComponent
    const sub = fromEvent<MouseEvent>(cell.hostElement, 'mouseleave').pipe(take(1)).subscribe(() => {
      this._startSelectingCell = cell
      this.hostElement.classList.add('is-selecting-cell')
      this.selectedCellSet.add(this._startSelectingCell!)
      this.doc.selection.selectBlock(this._startSelectingCell!)
    })

    fromEvent<MouseEvent>(document, 'mouseup').pipe(take(1)).subscribe(e => {
      sub.unsubscribe()
      this.onEndSelect(e)
    })
  }

  @HostListener('mouseover', ['$event'])
  onMouseEnter(evt: MouseEvent) {
    const target = evt.target
    if (!(target instanceof HTMLElement) || target.tagName !== 'TD') return
    const id = target.getAttribute('data-block-id')
    if (!id) return

    if (!this.resizingCol$.value) {
      // hovering bar
      this.hoveringCell = this.doc.getBlockById(id) as TableCellBlockComponent
      const offsetX = this.hoveringCell.hostElement.getBoundingClientRect().right
        - this.tableBody.nativeElement.getBoundingClientRect().left - 4
      this.colResizeBar.nativeElement.style.left = `${offsetX}px`
    }

    // select cells
    if (!this._startSelectingCell || evt.buttons < 1) return;
    if ((!this._lastSelectingCell && id === this._startSelectingCell.id) || id === this._lastSelectingCell?.id) return
    evt.stopPropagation()
    this._lastSelectingCell = this.doc.getBlockById(id) as TableCellBlockComponent
    this._setRectangleSelected()
  }

  onEndSelect = (event: MouseEvent) => {
    if (!this._startSelectingCell) return;
    event.stopPropagation()
    this._lastSelectingCell = this._startSelectingCell = null
    this.hostElement.classList.remove('is-selecting-cell')
    this.showToolbar(this.selectedCellSet[Symbol.iterator]().next().value.hostElement)
  }

  private _clearSelected() {
    this.selectedCellSet.forEach(cell => cell.hostElement.classList.remove('selected'))
    this.selectedCellSet.clear()
  }

  selectCell = (cell: TableCellBlockComponent) => {
    this.selectedCellSet.add(cell)
    cell.hostElement.classList.add('selected')
  }

  unselectCell = (cell: TableCellBlockComponent) => {
    this.selectedCellSet.delete(cell)
    cell.hostElement.classList.remove('selected')
  }

  // 根据上下坐标设置矩形区间选中
  // TODO 修复
  private _setRectangleSelected() {
    if (!this._startSelectingCell || !this._lastSelectingCell) return
    this._clearSelected()

    let startCell = this._startSelectingCell
    let endCell = this._lastSelectingCell

    if (startCell === endCell) {
      this.selectCell(startCell)
      return
    }

    const rowIds = this.childrenIds
    // const startRowId = startCell.parentId!
    // const endRowId = endCell.parentId!
    //
    // const startRowIndex = rowIds.indexOf(startRowId)
    // const endRowIndex = rowIds.indexOf(endRowId)
    //
    // const startRow = this.doc.getBlockById(startRowId) as TableRowBlockComponent
    // const endRow = this.doc.getBlockById(endRowId) as TableRowBlockComponent
    //
    // const startRowChildrenIds = startRow.childrenIds
    // const endRowChildrenIds = endRow.childrenIds
    //
    // const startColIndex = startRowChildrenIds.indexOf(startCell.id)
    // const endColIndex = endRowChildrenIds.indexOf(endCell.id)
    //
    // const startCoordinate = [Math.min(startRowIndex, endRowIndex), Math.min(startColIndex, endColIndex)]
    // const endCoordinate = [Math.max(startRowIndex, endRowIndex), Math.max(startColIndex, endColIndex)]
    //
    //
    // let mergedCell
    // // 是否有被合并的单元格
    // for (let i = startCoordinate[0]; i <= endCoordinate[0]; i++) {
    //   const row = this.doc.getBlockById(rowIds[i]) as TableRowBlockComponent
    //   const rowChildrenIds = row.childrenIds
    //
    //   for (let j = startCoordinate[1]; j <= endCoordinate[1]; j++) {
    //     const cid = rowChildrenIds[j]
    //     if (!cid) continue;
    //     const cell = this.doc.getBlockById(cid) as TableCellBlockComponent
    //
    //     // 需要向左上方寻找到合并单元格
    //     if(cell.props.display === 'none') {
    //
    //     }
    //
    //   }
    // }

    const positionRelation = this.doc.compareBlockPosition(this._startSelectingCell, this._lastSelectingCell)
    if (positionRelation === BLOCK_POSITION.BEFORE) {
      startCell = this._lastSelectingCell
      endCell = this._startSelectingCell
    }

    const startCoordinate = [rowIds.indexOf(startCell.parentId!), startCell.getIndexOfParent()]
    const endCoordinate = [rowIds.indexOf(endCell.parentId!), endCell.getIndexOfParent()]

    const expandStartCoordinate = [...startCoordinate]
    const expandEndCoordinate = [...endCoordinate]

    endCell.props.rowspan && (expandEndCoordinate[0] = expandEndCoordinate[0] + endCell.props.rowspan - 1)
    endCell.props.colspan && (expandEndCoordinate[1] = expandEndCoordinate[1] + endCell.props.colspan - 1)
    startCell.props.rowspan && (expandStartCoordinate[0] = expandStartCoordinate[0] + startCell.props.rowspan - 1)
    startCell.props.colspan && (expandStartCoordinate[1] = expandStartCoordinate[1] + startCell.props.colspan - 1)

    const minCoordinate = [
      Math.min(startCoordinate[0], endCoordinate[0], expandStartCoordinate[0], expandEndCoordinate[0]),
      Math.min(startCoordinate[1], endCoordinate[1], expandStartCoordinate[1], expandEndCoordinate[1])
    ]
    const maxCoordinate = [
      Math.max(startCoordinate[0], endCoordinate[0], expandStartCoordinate[0], expandEndCoordinate[0]),
      Math.max(startCoordinate[1], endCoordinate[1], expandStartCoordinate[1], expandEndCoordinate[1])
    ]

    for (let i = minCoordinate[0]; i <= maxCoordinate[0]; i++) {
      const row = this.doc.getBlockById(rowIds[i]) as TableRowBlockComponent
      const rowChildrenIds = row.childrenIds
      for (let j = minCoordinate[1]; j <= maxCoordinate[1]; j++) {
        const cid = rowChildrenIds[j]
        if (!cid) continue;
        const cell = this.doc.getBlockById(cid) as TableCellBlockComponent
        if (cell.props.display === 'none') continue;
        this.selectCell(cell)
      }
    }
  }

  getSelectedCells() {
    if (this.selectedCellSet.size) {
      return Array.from(this.selectedCellSet)
    }

    const selection = this.doc.selection.value
    if (!selection) return []

    const block = this.doc.getBlockById(selection.commonParent)
    if (block.flavour === 'table-cell') {
      return [block] as TableCellBlockComponent[]
    }

    const {firstBlock, lastBlock} = selection

    if (block.flavour === 'table-row') {
      if (block === firstBlock) {
        return block.getChildrenBlocks() as TableCellBlockComponent[]
      }

      const childrenIds = block.childrenIds
      const start = childrenIds.indexOf(firstBlock.id)
      const end = childrenIds.indexOf(lastBlock.id)
      return childrenIds.slice(start, end + 1).map(id => this.doc.getBlockById(id) as TableCellBlockComponent)
    }

    if (block.flavour === 'table') {
      const childrenIds = block.childrenIds
      const start = childrenIds.indexOf(firstBlock.id)
      const end = childrenIds.indexOf(lastBlock.id)
      return childrenIds.slice(start, end + 1).map(id => this.doc.getBlockById(id) as TableRowBlockComponent)
        .flatMap(row => row.getChildrenBlocks() as TableCellBlockComponent[])
    }

    return []
  }

  showToolbar(target: HTMLElement, type: 'col' | 'row' | 'cells' = 'cells', index?: number, count = 1, closeFn?: () => void) {
    this.hostElement.classList.add('active')
    const portal = new ComponentPortal(CellToolbarComponent)
    this.toolbarOvr = this.overlay.create({
      positionStrategy: this.overlay.position().flexibleConnectedTo(target).withPositions([
        {...POSITION_MAP['top-left'], offsetY: -8},
        POSITION_MAP['bottom-left']
      ]),
      scrollStrategy: this.overlay.scrollStrategies.close(),
      // hasBackdrop: true,
      // backdropClass: 'cdk-overlay-transparent-backdrop',
    })

    const cpr = this.toolbarOvr.attach(portal)
    const selectedCells = this.getSelectedCells()
    cpr.setInput('selectedCells', selectedCells)
    cpr.setInput('options', {type, index, count})
    cpr.setInput('doc', this.doc)
    cpr.setInput('table', this)

    merge(this.toolbarOvr.backdropClick(),
      this.doc.selection.nextChangeObserve(),
      this.onDestroy$, selectedCells[0]?.onDestroy$,
      fromEvent(this.doc.root.hostElement, 'scroll').pipe(take(1)))
      .pipe(takeUntil(cpr.instance.onDestroy)).subscribe(() => {
      closeFn?.()
      this.closeToolbar()
    })

  }

  closeToolbar = () => {
    this.hostElement.classList.remove('active')
    this.toolbarOvr?.dispose()
    this.toolbarOvr = undefined
    this._clearSelected()
  }

  onColBarSelected(range: [number, number]) {
    const firstCell = this.firstChildren!.getChildrenByIndex(range[0])
    this.doc.selection.selectBlock(firstCell)

    this.doc.selection.afterNextChange(() => {
      this._activeColRange = range
      this.rowBarComponent.changeDetectionRef.markForCheck()

      this.getChildrenBlocks().forEach((row, i) => {
        const cell = this.doc.getBlockById(row.childrenIds[range[0]]) as TableCellBlockComponent
        this.selectCell(cell)
      })

      this.showToolbar(firstCell.hostElement, 'col', range[0], 1, () => {
        this._activeColRange = [-1, -1]
        this.colBarComponent.changeDetectionRef.markForCheck()
      })
    })

  }

  onRowBarSelected(range: [number, number]) {
    const row = this.getChildrenByIndex(range[0])
    this.doc.selection.selectBlock(row)

    this.doc.selection.afterNextChange(() => {
      this._activeRowRange = range
      this.rowBarComponent.changeDetectionRef.markForCheck()

      this.showToolbar(row.hostElement, 'row', range[0], 1, () => {
        this._activeRowRange = [-1, -1]
        this.rowBarComponent.changeDetectionRef.markForCheck()
      })
    })
  }

  onResizerMousedown(evt: Event) {
    evt.preventDefault()
    evt.stopPropagation()

    if (!this.hoveringCell) return
    this.resizingCol$.next(true)

    const resizingColIdx = this.hoveringCell.getIndexOfParent()
    const curCol = this.hostElement.querySelector(`col:nth-child(${resizingColIdx + 1})`) as HTMLElement

    let newWidth = this.props.colWidths[resizingColIdx]
    const resizeSub = fromEvent<MouseEvent>(document, 'mousemove')
      .pipe(takeUntil(this.resizingCol$.pipe(filter(v => !v))))
      .subscribe((e) => {

        if (!this.hoveringCell) {
          resizeSub.unsubscribe()
          return
        }

        const {left} = this.tableBody.nativeElement.getBoundingClientRect()
        const scrollLeft = this.tableBody.nativeElement.scrollLeft
        if (!this.resizingCol$.value || e.clientX < left) return
        const targetRect = this.hoveringCell.hostElement.getBoundingClientRect()
        newWidth = e.clientX - targetRect.left
        // 不得小于50
        if (newWidth < 50) return
        const offsetX = targetRect.right + scrollLeft - left - 4
        this.colBarComponent.colWidths[resizingColIdx] = newWidth
        this.colBarComponent.changeDetectionRef.markForCheck()
        this.colResizeBar.nativeElement.style.left = `${offsetX}px`
        curCol.style.width = newWidth + 'px'
      })

    fromEvent(document, 'mouseup').pipe(take(1)).subscribe(() => {
      if (!this.resizingCol$.value) return
      this.resizingCol$.next(false)
      const widths = [...this.props.colWidths]
      widths[resizingColIdx] = newWidth
      this.updateProps({
        colWidths: widths
      })
    })
  }
}
