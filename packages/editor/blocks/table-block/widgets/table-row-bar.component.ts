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
    <div class="item">
      <span class="pt" (mouseenter)="onAddRowBtnEnter(0)"></span>
    </div>
    @for (rowId of rowIds; let idx = $index; track rowId) {
      <div class="item">
        <span class="bar" (mousedown)="onMouseDown(idx)"
              [style.height.px]="rowHeightsRecord[rowId]"
              [attr.data-index]="idx"
              [class.active]="idx >= _selectedRange[0] && idx <= _selectedRange[1]"></span>
        <div class="pt" (mouseenter)="onAddRowBtnEnter(idx + 1)"></div>
      </div>
    }
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

  onMouseDown(idx: number) {
    this._selectedRange = [idx, idx]
    this.host.nativeElement.classList.add('selecting')

    const sub = fromEvent<MouseEvent>(this.host.nativeElement, 'mouseover').subscribe(v => {
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

    fromEvent<MouseEvent>(document.documentElement, 'mouseup', {capture: true}).pipe(take(1)).subscribe(v => {
      sub.unsubscribe()
      this.selectedRangeChange.emit(this._selectedRange)
      this.host.nativeElement.classList.remove('selecting')
    })
  }

  onAddRowBtnEnter(idx: number) {
    this.onAdderActive.emit(idx)
  }
}
