import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component, ElementRef,
  EventEmitter,
  Input,
  Output
} from "@angular/core";
import {NgForOf} from "@angular/common";
import {fromEvent, merge, Subject, take, takeUntil} from "rxjs";

const DRAG_THRESHOLD_PX = 4

export interface RowReorderStartEvent {
  fromIndex: number
  count: number
}

export interface RowReorderMoveEvent {
  cursorY: number
}

export interface RowReorderEndEvent {
  commit: boolean
}

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
              (mousedown)="onMouseDown(idx, $event)">
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

  @Output()
  reorderStart = new EventEmitter<RowReorderStartEvent>()

  @Output()
  reorderMove = new EventEmitter<RowReorderMoveEvent>()

  @Output()
  reorderEnd = new EventEmitter<RowReorderEndEvent>()

  protected _hoveredIndex: number | null = null

  constructor(
    public readonly changeDetectionRef: ChangeDetectorRef,
    private host: ElementRef<HTMLElement>
  ) {
  }

  onHandleEnter(idx: number) {
    if (this.host.nativeElement.classList.contains('reordering')) return
    this._hoveredIndex = idx
    this.hoveredHandleChange.emit(idx)
    this.changeDetectionRef.markForCheck()
  }

  onHandleLeave() {
    if (this.host.nativeElement.classList.contains('reordering')) return
    this._hoveredIndex = null
    this.hoveredHandleChange.emit(null)
    this.changeDetectionRef.markForCheck()
  }

  onMouseDown(idx: number, event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    this._selectedRange = [idx, idx]
    this.host.nativeElement.classList.add('selecting')

    const startX = event.clientX
    const startY = event.clientY
    const stop$ = new Subject<void>()
    let mode: 'pending' | 'dragging' = 'pending'

    fromEvent<PointerEvent>(document, 'pointermove')
      .pipe(takeUntil(stop$))
      .subscribe(e => {
        if (mode === 'pending') {
          const dx = e.clientX - startX
          const dy = e.clientY - startY
          if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return
          mode = 'dragging'
          this.host.nativeElement.classList.add('reordering')
          this.host.nativeElement.classList.remove('selecting')
          this._hoveredIndex = null
          this.reorderStart.emit({ fromIndex: idx, count: 1 })
        }
        this.reorderMove.emit({ cursorY: e.clientY })
      })

    fromEvent<KeyboardEvent>(document, 'keydown', { capture: true })
      .pipe(takeUntil(stop$))
      .subscribe(e => {
        if (e.key !== 'Escape' || mode !== 'dragging') return
        e.preventDefault()
        mode = 'pending'   // mark as cancelled so mouseup treats it as a no-op
        stop$.next()
        stop$.complete()
        this._cleanupReorder()
        this.reorderEnd.emit({ commit: false })
      })

    merge(
      fromEvent<PointerEvent>(window, 'pointerup', { capture: true }),
      fromEvent<MouseEvent>(window, 'mouseup', { capture: true }),
    ).pipe(take(1), takeUntil(stop$)).subscribe(() => {
      stop$.next()
      stop$.complete()
      if (mode === 'dragging') {
        this._cleanupReorder()
        this.reorderEnd.emit({ commit: true })
      } else {
        this.host.nativeElement.classList.remove('selecting')
        this._hoveredIndex = null
        this.hoveredHandleChange.emit(null)
        this.changeDetectionRef.markForCheck()
        this.selectedRangeChange.emit(this._selectedRange)
      }
    })
  }

  private _cleanupReorder() {
    this.host.nativeElement.classList.remove('reordering')
    this.host.nativeElement.classList.remove('selecting')
    this._hoveredIndex = null
    this.hoveredHandleChange.emit(null)
    this.changeDetectionRef.markForCheck()
  }

  resetVisualState() {
    this.host.nativeElement.classList.remove('reordering')
    this.host.nativeElement.classList.remove('selecting')
    this._hoveredIndex = null
    this._selectedRange = [-1, -1]
    this.visibleHandleIndex = null
    this.hoveredHandleChange.emit(null)
    this.changeDetectionRef.markForCheck()
  }
}
