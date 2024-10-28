import {Component, ElementRef, HostListener, ViewChild} from "@angular/core";
import {ITableBlockModel} from "./type";
import {BaseBlock, getCurrentCharacterRange} from "../../core";
import {TableRowBlock} from "./table-row.block";
import {AsyncPipe, NgForOf, NgIf} from "@angular/common";
import {BehaviorSubject, filter, fromEvent, take, takeUntil} from "rxjs";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";
import {TableCellBlock} from "./table-cell.block";

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

    protected _colWidths: number[] = []
    protected isResizing = new BehaviorSubject(false)
    protected resizeColIdx = -1
    protected resizeBarX = 0

    private cells?: NodeListOf<Element>
    private startSelectingCell?: [number, number]
    private selectingCell?: [[number, number], [number, number]]
    private selecting$ = new BehaviorSubject<boolean>(false)

    @ViewChild('tableElement', {read: ElementRef}) table!: ElementRef<HTMLTableElement>

    trackById = (index: number, item: any) => item.id

    override ngAfterViewInit() {
        super.ngAfterViewInit();
        this._colWidths = this.model.props.colWidths

        this.selecting$.pipe(takeUntilDestroyed(this.destroyRef), filter(e => e)).subscribe((selecting) => {
            window.getSelection()!.removeAllRanges()
            this.hostEl.nativeElement.focus({preventScroll: true})
        })

        this.model.update$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(e => {
            if (e.type === 'props' && e.event.changes.keys.get('colWidths')) {
                this._colWidths = this.model.props.colWidths
            }
        })
    }

    onKeyDown(e: KeyboardEvent) {
        switch (e.key) {
            case 'ArrowLeft':
            case 'ArrowUp': {
                e.stopPropagation()
                if (this.selectingCell) {
                    this.focusCell(this.selectingCell[0][0], this.selectingCell[0][1], 'start')
                    return
                }

                const range = getCurrentCharacterRange()
                if (range.start === range.end && range.start === 0) {
                    this.moveSelection(e.target as HTMLTableCellElement, e.key === 'ArrowLeft' ? 'left' : 'up')
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
                const target = e.target as HTMLTableCellElement
                const range = getCurrentCharacterRange()
                if (range.start === range.end && range.start === target.textContent!.length) {
                    this.moveSelection(target, e.key === 'ArrowRight' ? 'right' : 'down')
                }
            }
                break
            case 'Backspace':
                e.stopPropagation()
                if (this.selectingCell) {
                    this.clearSelectingCellText()
                }
                break
        }
    }

    /** 表格列宽调整 **/
    onMouseOver(e: MouseEvent) {
        const target = e.target as HTMLElement
        if (target.tagName !== 'TD' || this.isResizing.value) return
        this.resizeColIdx = parseInt(target.getAttribute('data-col-idx')!)
        this.resizeBarX = target.getBoundingClientRect().right - this.table.nativeElement.getBoundingClientRect().left - 2
    }

    onResizebarMouseDown(e: MouseEvent) {
        e.stopPropagation()
        e.preventDefault()
        this.isResizing.next(true)

        fromEvent<MouseEvent>(document, 'mousemove').pipe(takeUntil(fromEvent(document, 'mouseup')))
            .subscribe((e) => {
                const {width, left, right} = this.hostEl.nativeElement.getBoundingClientRect()
                if (!this.isResizing.value || e.clientX > right || e.clientX < left) return
                const targetRect = this.table.nativeElement.querySelector(`td:nth-child(${this.resizeColIdx + 1})`)!.getBoundingClientRect()
                let newWidth = e.clientX - targetRect.left
                // 不得小于50，不得大于maxWidth - 其他列宽度之和
                if (newWidth < 50) return
                // 如果是减少宽度，不用判断是否超出最大宽度
                if (newWidth <= this.props.colWidths[this.resizeColIdx]) {
                    this.resizeBarX = targetRect.right - left - 2
                    this._colWidths[this.resizeColIdx] = newWidth
                    return;
                }
                if (newWidth - this.props.colWidths[this.resizeColIdx] > width - this.props.colWidths.reduce((pre, cur) => pre + cur, 0)) return
                this.resizeBarX = targetRect.right - left - 2
                this._colWidths[this.resizeColIdx] = newWidth
            })

        fromEvent(document, 'mouseup').pipe(take(1)).subscribe(() => {
            if(!this.isResizing.value) return
            this.setProp('colWidths', this._colWidths)
            this.isResizing.next(false)
            this.resizeColIdx = -1
        })
    }

    /** 表格选中 **/
    focusCell(rowIdx: number, colIdx: number, pos: 'start' | 'end') {
        const cell = this.model.children[rowIdx].children[colIdx]
        if (!cell) return
        this.controller.setSelection(cell.id, pos)
    }

    moveSelection(target: HTMLTableCellElement, direction: 'up' | 'down' | 'left' | 'right') {
        const cellPos = this.getCellPos(target)
        console.log(cellPos)
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
            if (!this.selecting$.value) {
                this.clearSelecting()
                return
            }
            this.selecting$.next(false)
        })
    }

    getCellPos = (td: HTMLElement | null): null | [number, number] => {
        if (!td) return null
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
