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
    <div class="insert-bar" (mouseover)="onAddColBtnEnter($event)">
      <span style="margin-left: 6px" data-index="0"></span>
      @for (w of colWidths; track w; let idx = $index) {
        <span [style.margin-left.px]="w - 14" [attr.data-index]="idx + 1">
          </span>
      }
    </div>
    <div class="ctrl-bar" (mousedown)="onMouseDown($event)">
      @for (w of colWidths; track w; let idx = $index) {
        <span [style.width.px]="w"
              [attr.data-index]="idx" [class.active]="idx >= _selectedRange[0] && idx <= _selectedRange[1]">
          </span>
      }
    </div>
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
    if (idx == null) return
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

  onAddColBtnEnter(evt: MouseEvent) {
    const idx = this._getIdx(evt)
    if (idx == null) return
    this.onAdderActive.emit(idx)
  }
}
