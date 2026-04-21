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
  selector: 'table-col-bar',
  template: `
    @for (w of colWidths; track $index; let idx = $index) {
      <button type="button"
              class="handle"
              (mousedown)="onMouseDown(idx)"
              [style.width.px]="w"
              [attr.data-index]="idx"
              [class.visible]="visibleHandleIndex === idx"
              [class.active]="idx >= _selectedRange[0] && idx <= _selectedRange[1]"
              [class.hover]="_hoveredIndex === idx"
              (mouseenter)="onHandleEnter(idx)"
              (mouseleave)="onHandleLeave()">
        <span class="handle-line"></span>
        <span class="handle-grip">
          <i class="bc_icon bc_yidong"></i>
        </span>
      </button>
    }
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
    // const idx = this._getIdx(evt)
    // if (idx == null) return
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

    fromEvent<MouseEvent>(document.documentElement, 'pointerup', {capture: true}).pipe(take(1)).subscribe(v => {
      sub.unsubscribe()
      this.selectedRangeChange.emit(this._selectedRange)
      this.host.nativeElement.classList.remove('selecting')
    })
  }
}
