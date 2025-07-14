import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component, ElementRef,
  EventEmitter,
  Input,
  Output
} from "@angular/core";
import {NgForOf} from "@angular/common";
import {fromEvent, take} from "rxjs";

@Component({
  selector: "table-row-bar",
  template: `
    <div class="insert-bar" (mouseover)="onAddRowBtnEnter($event)">
      <span style="margin-top: -1px;" data-index="0"></span>
      @for (rowId of rowIds; let idx = $index; track rowId) {
        <span [style.margin-top.px]="rowHeightsRecord[rowId] - 14" [attr.data-index]="idx + 1"></span>
      }
    </div>
    <div class="ctrl-bar" (mousedown)="onMouseDown($event)">
      @for (rowId of rowIds; let idx = $index; track rowId) {
        <span [style.height.px]="rowHeightsRecord[rowId]" [attr.data-index]="idx"
              [class.active]="idx >= _selectedRange[0] && idx <= _selectedRange[1]"></span>
      }
    </div>
  `,
  imports: [
    NgForOf
  ],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'contenteditable': 'false',
  }
})
export class TableRowBarComponent {

  private _rowIds: string[] = []
  @Input({required: true})
  set rowIds(v: string[]) {
    this._rowIds = v
    this.changeDetectionRef.markForCheck()
  }
  get rowIds() {
    return this._rowIds
  }

  @Input({required: true})
  rowHeightsRecord: {[key: string]: number} = {}

  protected _selectedRange: [number, number] = [-1, -1]
  @Input()
  set selectedRange(val: [number, number]) {
    this._selectedRange = val
  }

  @Output()
  selectedRangeChange = new EventEmitter<[number, number]>()

  @Output()
  onAdderActive = new EventEmitter<number>()

  constructor(
    public readonly changeDetectionRef: ChangeDetectorRef,
    private host: ElementRef<HTMLElement>
  ) {
  }

  private _getIdx(evt: MouseEvent) {
    evt.preventDefault()
    evt.stopPropagation()
    const target = evt.target as HTMLElement
    const dataIndex = target.getAttribute('data-index')
    if (!dataIndex) return null
    return parseInt(dataIndex)
  }

  onMouseDown(evt: MouseEvent) {
    const idx = this._getIdx(evt)
    if (idx === null) return
    const target = evt.target as HTMLElement
    this._selectedRange = [idx, idx]
    this.host.nativeElement.classList.add('selecting')

    const sub = fromEvent<MouseEvent>(target.parentElement!, 'mouseover').subscribe(v => {
      v.preventDefault()
      v.stopPropagation()
      const _oIdx = this._getIdx(v)
      if (_oIdx == null) return
      this._selectedRange = [
        Math.min(idx, _oIdx),
        Math.max(idx, _oIdx)
      ]
      this.changeDetectionRef.markForCheck()
    })

    fromEvent<MouseEvent>(document.documentElement, 'pointerup').pipe(take(1)).subscribe(v => {
      sub.unsubscribe()
      this.selectedRangeChange.emit(this._selectedRange)
      this.host.nativeElement.classList.remove('selecting')
    })
  }

  onAddRowBtnEnter($event: MouseEvent) {
    const idx = this._getIdx($event)
    if (idx === null) return
    this.onAdderActive.emit(idx)
  }
}
