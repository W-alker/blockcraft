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
  selector: 'table-col-bar',
  template: `
    <span *ngFor="let w of colWidths; index as idx" [style.width.px]="w"
          [attr.data-index]="idx" [class.active]="idx >= selectedRange[0] && idx <= selectedRange[1]">
    </span>
  `,
  standalone: true,
  imports: [NgForOf],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'contenteditable': 'false',
  }
})
export class TableColBarComponent {

  protected _colWidths: number[] = []
  @Input({required: true})
  set colWidths(val: number[]) {
    this._colWidths = [...val]
  }

  get colWidths() {
    return this._colWidths
  }

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
