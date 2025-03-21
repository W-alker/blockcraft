import {Component, HostListener} from "@angular/core";
import {BaseBlockComponent} from "../../framework";
import {TableBlockModel} from "./index";
import {TableCellBlockComponent} from "./table-cell.block";
import {TableRowBlockComponent} from "./table-row.block";
import {skip, take} from "rxjs";

@Component({
  selector: 'div.table-block',
  templateUrl: './table.block.html',
  standalone: true
})
export class TableBlockComponent extends BaseBlockComponent<TableBlockModel> {
  private _startSelectingCell: TableCellBlockComponent | null = null
  private _lastSelectingCell: TableCellBlockComponent | null = null

  selectedCellSet = new Set<TableCellBlockComponent>()

  @HostListener('mousedown', ['$event'])
  onMouseDown(event: MouseEvent) {
    if (event.target === this.hostElement) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  private _closetCell(event: Event) {
    const target = event.target as Node
    const ele = target instanceof HTMLElement ? target : target.parentElement!
    const closetCell = ele.closest('td')
    return closetCell?.getAttribute('data-block-id')
  }

  @HostListener('mouseover', ['$event'])
  onMouseEnter(event: MouseEvent) {
    if (!this._startSelectingCell || event.buttons < 1) return;
    const id = this._closetCell(event)
    if (!id || id === this._startSelectingCell.id || id === this._lastSelectingCell?.id) return

    if (!this._lastSelectingCell) {
      this.selectedCellSet.add(this._startSelectingCell)
      this.doc.selection.selectBlock(this._startSelectingCell)
      this.hostElement.classList.add('is-selecting-cell')
    }

    this._lastSelectingCell = this.doc.getBlockById(id) as TableCellBlockComponent
    this._setRectangleSelected()
  }

  @HostListener('document:mouseup', ['$event'])
  onMouseUp(event: MouseEvent) {
    if (!this._startSelectingCell) return;
    this._lastSelectingCell = this._startSelectingCell = null
    this.hostElement.classList.remove('is-selecting-cell')
    this.doc.selection.update$.pipe(skip(1), take(1)).subscribe(v => {
      this._clearSelected()
    })
  }

  @HostListener('selectstart', ['$event'])
  onSelectstart(event: Event) {
    this._clearSelected()
    const id = this._closetCell(event)
    if (!id) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    this._startSelectingCell = this.doc.getBlockById(id) as TableCellBlockComponent
  }

  private _clearSelected() {
    this.selectedCellSet.forEach(cell => cell.hostElement.classList.remove('selected'))
    this.selectedCellSet.clear()
  }

  // 根据上下坐标设置矩形区间选中
  private _setRectangleSelected() {
    if (!this._startSelectingCell || !this._lastSelectingCell) return
    this._clearSelected()

    const startParent = this._startSelectingCell.parentId
    const childrenIds = this.childrenIds
    const startCoordinate = [
      childrenIds.findIndex(id => startParent === id),
      this._startSelectingCell.getIndexOfParent()
    ]

    const endParent = this._lastSelectingCell.parentId
    const endCoordinate = [
      childrenIds.findIndex(id => endParent === id),
      this._lastSelectingCell.getIndexOfParent()
    ]

    const min = [Math.min(startCoordinate[0], endCoordinate[0]), Math.min(startCoordinate[1], endCoordinate[1])]
    const max = [Math.max(startCoordinate[0], endCoordinate[0]), Math.max(startCoordinate[1], endCoordinate[1])]

    for (let i = min[0]; i <= max[0]; i++) {
      const row = this.doc.getBlockById(childrenIds[i]) as TableRowBlockComponent
      const rowChildrenIds = row.childrenIds
      for (let j = min[1]; j <= max[1]; j++) {
        const cell = this.doc.getBlockById(rowChildrenIds[j]) as TableCellBlockComponent
        cell.hostElement.classList.add('selected')
        this.selectedCellSet.add(cell)
      }
    }
  }

}
