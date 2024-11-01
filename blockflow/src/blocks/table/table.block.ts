import {Component, ElementRef, ViewChild} from "@angular/core";
import {ITableBlockModel} from "./type";
import {BaseBlock, getCurrentCharacterRange, USER_CHANGE_SIGNAL} from "../../core";
import {TableRowBlock} from "./table-row.block";
import {AsyncPipe, NgForOf, NgIf} from "@angular/common";
import {BehaviorSubject, filter, fromEvent, take, takeUntil} from "rxjs";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";
import {TableCellBlock} from "./table-cell.block";
import {ComponentPortal} from "@angular/cdk/portal";
import {FloatToolbar} from "../../components";
import {Overlay} from "@angular/cdk/overlay";
import {TableColControlMenu, TableRolControlMenu} from "./const";

@Component({
  selector: 'div.table-block',
  templateUrl: './table.block.html',
  styleUrl: './table.block.scss',
  standalone: true,
  imports: [
    TableRowBlock,
    NgIf,
    NgForOf,
    AsyncPipe,
  ],
})
export class TableBlock extends BaseBlock<ITableBlockModel> {
  protected activeColIdx = -1
  protected activeRowIdx = -1
  protected _rowHeights: number[] = []

  protected _colWidths: number[] = []
  protected resizing$ = new BehaviorSubject(false)
  protected resizeColIdx = -1
  protected resizeBarX = 0

  private cells?: NodeListOf<Element>
  private startSelectingCell?: [number, number]
  private selectingCell?: [[number, number], [number, number]]
  private selecting$ = new BehaviorSubject<boolean>(false)

  @ViewChild('tableElement', {read: ElementRef}) table!: ElementRef<HTMLTableElement>

  trackById = (index: number, item: any) => item.id
  trackByValue = (index: number, w: number) => w

  constructor(
    private overlay: Overlay,
  ) {
    super();
  }

  override ngAfterViewInit() {
    super.ngAfterViewInit();
    this._colWidths = [...this.model.props.colWidths]

    this.selecting$.pipe(takeUntilDestroyed(this.destroyRef), filter(e => e)).subscribe((selecting) => {
      window.getSelection()!.removeAllRanges()
      this.hostEl.nativeElement.focus({preventScroll: true})
    })

    this.model.update$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(e => {
      if (e.type === 'props') {
        if (e.event.changes.keys.get('colWidths')) {
          this._colWidths = [...this.model.props.colWidths]
        }
      }
    })
  }

  onKeyDown(e: KeyboardEvent) {
    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        break
      case 'ArrowLeft':
      case 'ArrowUp': {
        e.stopPropagation()
        if (this.selectingCell) {
          this.focusCell(this.selectingCell[0][0], this.selectingCell[0][1], 'start')
          return
        }

        const range = getCurrentCharacterRange()
        if (range.start === range.end && range.start === 0) {
          this.moveSelection(e.target as HTMLElement, e.key === 'ArrowLeft' ? 'left' : 'up')
        }
      }
        break
      case 'ArrowRight':
      case 'ArrowDown': {
        e.stopPropagation()
        if (this.selectingCell) {
          this.focusCell(this.selectingCell[1][0], this.selectingCell[1][1], 'end')
          return
        }
        const target = e.target as HTMLElement
        const range = getCurrentCharacterRange()
        if (range.start === range.end && range.start === target.textContent!.length) {
          this.moveSelection(target, e.key === 'ArrowRight' ? 'right' : 'down')
        }
      }
        break
      case 'Backspace':
        if (this.selectingCell) {
          e.stopPropagation()
          e.preventDefault()
          this.clearSelectingCellText()
        } else {
          const range = getCurrentCharacterRange()
          if (range.start === range.end && range.start === 0) {
            e.stopPropagation()
          }
        }
        break
    }
  }

  /** 表格行列操作 **/
  onShowColBar(e: MouseEvent) {
    e.stopPropagation()
    const target = e.target as HTMLElement
    const dataColIdx = target.getAttribute('data-col-idx')
    if (!dataColIdx) return
    const colIdx = parseInt(dataColIdx)
    this.activeColIdx = colIdx
    const portal = new ComponentPortal(FloatToolbar)
    const overlayRef = this.overlay.create({
      positionStrategy: this.overlay.position().flexibleConnectedTo(target).withPositions([
        {originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom', offsetY: -4},
        {originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top', offsetY: 4},
      ]),
      scrollStrategy: this.overlay.scrollStrategies.close(),
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop',
    })
    const close = () => {
      overlayRef.dispose()
      this.activeColIdx = -1
    }

    overlayRef.backdropClick().pipe(take(1)).subscribe(close)
    const cpr = overlayRef.attach(portal)
    const menu = [...TableColControlMenu]
    if (colIdx === 0) menu.unshift(...[
      {
        name: "setHeadCol",
        title: "设置为标题列",
        value: "col",
        icon: "bf_icon bf_biaotilie",
        active: this.props.colHead
      },
      {
        name: '|'
      }
    ])
    cpr.setInput('toolbarList', menu)
    cpr.instance.itemClick.pipe(take(1)).subscribe(({item, event}) => {
      switch (item.name) {
        case 'align':
          this.setColAlign(colIdx, <any>item.value)
          break
        case 'insert':
          this.addCol(item.value === 'left' ? colIdx : colIdx + 1);
          break
        case 'delete':
          this.deleteCol(colIdx)
          break
        case 'setHeadCol':
          this.setProp('colHead', !this.props.colHead)
          break
      }
      close()
    })
  }

  setColAlign(colIdx: number, align: 'left' | 'center' | 'right') {
    const rows = this.model.children
    this.controller.transact(() => {
      for (let i = 0; i < rows.length; i++) {
        const cell = rows[i].children[colIdx]
        if (cell && cell.props['textAlign'] !== align) cell.setProp('textAlign', align)
      }
    }, USER_CHANGE_SIGNAL)
  }

  addCol(index: number) {
    const addWidth = 80
    // // 提前计算宽度
    // const maxWidth = this.table.nativeElement.getBoundingClientRect().width
    // const totalWidth = this._colWidths.reduce((pre, cur) => pre + cur, 0)
    // // 如果超出最大宽度
    // if (totalWidth + addWidth > maxWidth) {
    //   // 其他列宽度平均减少加出的宽度
    //   const reduceWidth = Math.floor((totalWidth + addWidth - maxWidth) / this._colWidths.length)
    //   this._colWidths = this._colWidths.map(width => width - reduceWidth)
    // }
    this._colWidths.splice(index, 0, addWidth)

    this.controller.transact(() => {
      this.model.children.forEach(row => {
        const cell = this.controller.createBlock('table-cell')
        row.insertChildren(index, [cell])
      })
    }, USER_CHANGE_SIGNAL)
    this.setColWidths()
  }

  deleteCol(index: number) {
    this.controller.transact(() => {
      this.model.children.forEach(row => {
        row.deleteChildren(index, 1)
      })
    }, USER_CHANGE_SIGNAL)
    this._colWidths.splice(index, 1)
    this.setColWidths()
  }

  onRowHeightChange(height: number, rowIdx: number) {
    this._rowHeights[rowIdx] = height
  }

  onShowRowBar(e: MouseEvent) {
    e.stopPropagation()
    const target = e.target as HTMLElement
    const dataRowIdx = target.getAttribute('data-row-idx')
    if (!dataRowIdx) return
    const rowIdx = parseInt(dataRowIdx)
    this.activeRowIdx = rowIdx
    const portal = new ComponentPortal(FloatToolbar)
    const overlayRef = this.overlay.create({
      positionStrategy: this.overlay.position().flexibleConnectedTo(target).withPositions([
        {originX: 'end', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -4},
        {originX: 'end', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetX: 4},
      ]),
      scrollStrategy: this.overlay.scrollStrategies.close(),
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop',
    })
    const close = () => {
      overlayRef.dispose()
      this.activeRowIdx = -1
    }
    overlayRef.backdropClick().pipe(take(1)).subscribe(close)
    const cpr = overlayRef.attach(portal)
    const menu = [...TableRolControlMenu]
    if (rowIdx === 0) menu.unshift(...[
      {
        name: "setHeadRow",
        title: "设置为标题行",
        value: "row",
        icon: "bf_icon bf_biaotihang",
        active: this.props.rowHead
      },
      {
        name: '|'
      }
    ])
    cpr.setInput('toolbarList', menu)
    cpr.instance.itemClick.pipe(take(1)).subscribe(({item, event}) => {
      switch (item.name) {
        case 'insert':
          this.addRow(item.value === 'top' ? rowIdx : rowIdx + 1)
          break
        case 'delete':
          this.deleteRow(rowIdx)
          break
        case 'setHeadRow':
          this.setProp('rowHead', !this.props.rowHead)
          break
      }
      close()
    })
  }

  addRow(index: number) {
    const addHeight = 40
    this._rowHeights.splice(index, 0, addHeight)
    const row = this.controller.createBlock('table-row', [this._colWidths.length])
    this.model.insertChildren(index, [row])
  }

  deleteRow(index: number) {
    console.log('delete row', index)
    this.model.deleteChildren(index, 1)
    this._rowHeights.splice(index, 1)
  }

  /** 表格列宽调整 **/
  setColWidths() {
    this.model.yModel.get('props').set('colWidths', this._colWidths)
  }

  onMouseOver(e: MouseEvent) {
    const target = e.target as HTMLElement
    if (target.tagName !== 'TD' || this.resizing$.value) return
    this.resizeColIdx = parseInt(target.getAttribute('data-col-idx')!)
    this.resizeBarX = target.getBoundingClientRect().right - this.table.nativeElement.getBoundingClientRect().left
  }

  onResizebarMouseDown(e: MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    this.resizing$.next(true)

    fromEvent<MouseEvent>(document, 'mousemove').pipe(takeUntil(fromEvent(document, 'mouseup')))
      .subscribe((e) => {
        const {width, left, right} = this.hostEl.nativeElement.getBoundingClientRect()
        if (!this.resizing$.value || e.clientX > right || e.clientX < left) return
        const targetRect = this.table.nativeElement.querySelector(`td:nth-child(${this.resizeColIdx + 1})`)!.getBoundingClientRect()
        let newWidth = e.clientX - targetRect.left
        // 不得小于50，不得大于maxWidth - 其他列宽度之和
        if (newWidth < 50) return
        // // 如果是减少宽度，不用判断是否超出最大宽度
        // if (newWidth <= this.props.colWidths[this.resizeColIdx]) {
        //   this.resizeBarX = targetRect.right - left - 2
        //   this._colWidths[this.resizeColIdx] = newWidth
        //   return;
        // }
        // if (newWidth - this.props.colWidths[this.resizeColIdx] > width - this.props.colWidths.reduce((pre, cur) => pre + cur, 0)) return
        this.resizeBarX = targetRect.right - left - 8
        this._colWidths[this.resizeColIdx] = newWidth
      })

    fromEvent(document, 'mouseup').pipe(take(1)).subscribe(() => {
      if (!this.resizing$.value) return
      this.resizing$.next(false)
      this.resizeColIdx = -1
      this.setColWidths()
    })
  }

  /** 表格选中 **/
  focusCell(rowIdx: number, colIdx: number, pos: 'start' | 'end') {
    const cell = this.model.children[rowIdx].children[colIdx]
    if (!cell) return
    this.controller.setSelection(cell.id, pos)
  }

  moveSelection(target: HTMLElement, direction: 'up' | 'down' | 'left' | 'right') {
    const cellEl = target.closest('td.table-cell') as HTMLTableCellElement
    const cellPos = this.getCellPos(cellEl)
    if (!cellPos) return
    const [rowIdx, colIdx] = cellPos
    switch (direction) {
      case 'up':
        if (rowIdx === 0) return
        this.focusCell(rowIdx - 1, colIdx, 'end')
        break
      case 'down':
        if (rowIdx === this.model.children.length - 1) return
        this.focusCell(rowIdx + 1, colIdx, 'start')
        break
      case 'left':
        if (colIdx === 0) return
        this.focusCell(rowIdx, colIdx - 1, 'end')
        break
      case 'right':
        if (colIdx === this.model.children[rowIdx].children.length - 1) return
        this.focusCell(rowIdx, colIdx + 1, 'start')
        break
    }
  }

  clearSelectingCellText() {
    if (!this.selectingCell) return
    const [start, end] = this.selectingCell
    if (start[0] === end[0] && start[1] === end[1]) return this.clearSelecting()
    const [startRowIdx, startColIdx] = start
    const [endRowIdx, endColIdx] = end

    this.controller.transact(() => {
      for (let rowIdx = startRowIdx; rowIdx <= endRowIdx; rowIdx++) {
        const tr = this.model.children[rowIdx]
        for (let colIdx = startColIdx; colIdx <= endColIdx; colIdx++) {
          const td = tr.children[colIdx]
          const block = this.controller.getBlockRef(td.id) as TableCellBlock
          if (!block) continue
          block.textLength && block.applyDelta([
            {retain: 0},
            {delete: block.textLength}
          ])
        }
      }
    })

    const firstCell = this.model.children[startRowIdx].children[startColIdx]
    this.controller.setSelection(firstCell.id, 0)
    this.clearSelecting()
  }

  onBlur() {
    this.clearSelecting()
  }

  onMouseDown(e: MouseEvent) {
    e.stopPropagation()
    this.clearSelecting()
    const target = e.target as HTMLElement
    const cellPos = this.getCellPos(target.closest('td.table-cell'))
    if (!cellPos) return
    this.startSelectingCell = cellPos
    this.selectingCell = [cellPos, cellPos]

    fromEvent<MouseEvent>(this.hostEl.nativeElement, 'mouseover').pipe(takeUntil(fromEvent<MouseEvent>(document, 'mouseup')))
      .subscribe((e) => {
        e.stopPropagation()
        if (!this.startSelectingCell || !this.selectingCell) return
        const cellPos = this.getCellPos((e.target as HTMLElement).closest('td.table-cell'))
        if (!cellPos) return
        // 确定选区，左上角和右下角
        if (this.startSelectingCell[0] === cellPos[0] && this.startSelectingCell[1] === cellPos[1]) {
          return
        }
        // 鼠标移动方向，确定是从左上到右下还是从右下到左上
        // 从左上到右下
        if (this.startSelectingCell[0] <= cellPos[0] && this.startSelectingCell[1] <= cellPos[1])
          this.selectingCell[1] = cellPos
        // 从右下到左上
        else this.selectingCell[0] = cellPos
        this.selecting$.next(true)
        this.selectCell()
      })

    fromEvent<MouseEvent>(document, 'mouseup').pipe(take(1)).subscribe((e) => {
      if (!this.selecting$.value) return this.clearSelecting()
      this.selecting$.next(false)
    })
  }

  getCellPos = (td: HTMLElement | null): null | [number, number] => {
    if (!td || td.tagName !== 'TD') return null
    const colIdx = td.getAttribute('data-col-idx')!
    const rowIdx = td.getAttribute('data-row-idx')!
    return [parseInt(rowIdx), parseInt(colIdx)]
  }

  clearSelecting() {
    this.selectingCell = undefined
    this.startSelectingCell = undefined
    this.cells?.forEach(cell => cell.classList.remove('selected'))
    this.cells = undefined
  }

  selectCell() {
    if (!this.selectingCell) return
    if (!this.cells) {
      this.cells = this.hostEl.nativeElement.querySelectorAll('td.table-cell')
    }
    this.cells.forEach((cell, idx) => {
      const [cellRowIdx, cellColIdx] = this.getCellPos(cell as HTMLElement)!
      if (cellRowIdx >= this.selectingCell![0][0] && cellRowIdx <= this.selectingCell![1][0] && cellColIdx >= this.selectingCell![0][1] && cellColIdx <= this.selectingCell![1][1]) {
        cell.classList.add('selected')
      } else {
        cell.classList.remove('selected')
      }
    })
  }

}
