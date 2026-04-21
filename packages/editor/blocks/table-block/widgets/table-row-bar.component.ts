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
    @for (rowId of rowIds; let idx = $index; track rowId) {
      <button type="button"
              class="handle"
              [style.height.px]="rowHeightsRecord[rowId]"
              [attr.data-index]="idx"
              [class.visible]="visibleHandleIndex === idx"
              [class.active]="idx >= _selectedRange[0] && idx <= _selectedRange[1]"
              [class.hover]="_hoveredIndex === idx"
              (mouseenter)="onHandleEnter(idx)"
              (mouseleave)="onHandleLeave()"
              (mousedown)="onMouseDown(idx)">
        <span class="handle-line"></span>
        <span class="handle-grip">
          <i class="bc_icon bc_yidong"></i>
        </span>
      </button>
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

  @Input()
  visibleHandleIndex: number | null = null

  protected _selectedRange: [number, number] = [-1, -1]
  @Input()
  set selectedRange(val: [number, number]) {
    this._selectedRange = val
    this.changeDetectionRef.markForCheck()
  }

  @Output()
  selectedRangeChange = new EventEmitter<[number, number]>()

  @Output()
  hoveredHandleChange = new EventEmitter<number | null>()

  protected _hoveredIndex: number | null = null

  constructor(
    public readonly changeDetectionRef: ChangeDetectorRef,
    private host: ElementRef<HTMLElement>
  ) {
  }

  private _getIdx(evt: MouseEvent) {
    evt.preventDefault()
    evt.stopPropagation()
    const target = evt.target as HTMLElement | null
    const handle = target?.closest('[data-index]') as HTMLElement | null
    const dataIndex = handle?.getAttribute('data-index')
    if (!dataIndex) return null
    return parseInt(dataIndex, 10)
  }

  onHandleEnter(idx: number) {
    this._hoveredIndex = idx
    this.hoveredHandleChange.emit(idx)
    this.changeDetectionRef.markForCheck()
  }

  onHandleLeave() {
    this._hoveredIndex = null
    this.hoveredHandleChange.emit(null)
    this.changeDetectionRef.markForCheck()
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
}
