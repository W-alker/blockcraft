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

export interface ColReorderStartEvent {
  fromIndex: number
  count: number
}

export interface ColReorderMoveEvent {
  cursorX: number
}

export interface ColReorderEndEvent {
  commit: boolean
}

@Component({
  selector: 'table-col-bar',
  template: `
    @for (w of colWidths; track $index; let idx = $index) {
      <button type="button"
              class="handle"
              (mousedown)="onMouseDown(idx, $event)"
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

  @Output()
  reorderStart = new EventEmitter<ColReorderStartEvent>()

  @Output()
  reorderMove = new EventEmitter<ColReorderMoveEvent>()

  @Output()
  reorderEnd = new EventEmitter<ColReorderEndEvent>()

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

    // Preserve an existing multi-column selection when the mousedown lands on
    // a handle inside that range — so dragging moves the whole selection,
    // not just the clicked column. Click outside the range resets to single.
    const inExistingRange = this._selectedRange[0] !== -1
      && idx >= this._selectedRange[0]
      && idx <= this._selectedRange[1]
    if (!inExistingRange) {
      this._selectedRange = [idx, idx]
    }
    const dragFromIndex = this._selectedRange[0]
    const dragCount = this._selectedRange[1] - this._selectedRange[0] + 1
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
          this.reorderStart.emit({ fromIndex: dragFromIndex, count: dragCount })
        }
        this.reorderMove.emit({ cursorX: e.clientX })
      })

    fromEvent<KeyboardEvent>(document, 'keydown', { capture: true })
      .pipe(takeUntil(stop$))
      .subscribe(e => {
        if (e.key !== 'Escape' || mode !== 'dragging') return
        e.preventDefault()
        mode = 'pending'
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
