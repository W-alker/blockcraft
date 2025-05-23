import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  HostListener,
  Input,
  Output
} from "@angular/core";
import {NgForOf} from "@angular/common";

@Component({
  selector: "table-row-bar",
  template: `
    @for (rowId of rowIds; let idx = $index; track rowId) {
      <span [style.height.px]="rowHeightsRecord[rowId]" [attr.data-index]="idx"
            [class.active]="idx >= selectedRange[0] && idx <= selectedRange[1]"></span>
    }
  `,
  imports: [
    NgForOf
  ],
  standalone: true,
  // changeDetection: ChangeDetectionStrategy.OnPush,
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
  selectedRange: [number, number] = [-1, -1]

  @Output()
  selectedRangeChange = new EventEmitter<[number, number]>()

  constructor(
    public readonly changeDetectionRef: ChangeDetectorRef
  ) {
  }

  @HostListener('mousedown', ['$event'])
  onMouseDown(evt: MouseEvent) {
    evt.preventDefault()
    evt.stopPropagation()
    const target = evt.target as HTMLElement
    const dataIndex = target.getAttribute('data-index')
    if (!dataIndex) return
    const idx = parseInt(dataIndex)
    this.selectedRangeChange.emit([idx, idx])
    this.changeDetectionRef.markForCheck()
  }
}
