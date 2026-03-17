import {ChangeDetectionStrategy, Component, EventEmitter, Input, Output} from "@angular/core";

export interface ITableSizePickedEvent {
  rows: number
  cols: number
}

@Component({
  selector: 'bc-table-size-picker',
  template: `
    <div class="bc-table-size-picker" (mouseleave)="onPickerLeave()">
      <div class="bc-table-size-picker-grid">
        @for (row of rows; track row) {
          <div class="bc-table-size-picker-row">
            @for (col of cols; track col) {
              <button type="button"
                      class="bc-table-size-picker-cell"
                      [class.active]="row <= activeRows && col <= activeCols"
                      (mouseenter)="onHover(row, col)"
                      (click)="onPick(row, col)"></button>
            }
          </div>
        }
      </div>
      <div class="bc-table-size-picker-hint">{{ hintText }}</div>
    </div>
  `,
  standalone: true,
  styles: [`
    :host {
      display: block;
    }

    .bc-table-size-picker {
      padding: 8px;
      border-radius: 8px;
      border: 1px solid var(--bc-float-toolbar-divider-color);
      background: var(--bc-float-toolbar-bg);
      box-shadow: var(--bc-float-toolbar-shadow);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .bc-table-size-picker-grid {
      display: flex;
      flex-direction: column;
      gap: 2px;
      width: max-content;
    }

    .bc-table-size-picker-row {
      display: flex;
      gap: 2px;
    }

    .bc-table-size-picker-cell {
      width: 14px;
      height: 14px;
      border-radius: 3px;
      border: 1px solid var(--bc-border-color);
      background: var(--bc-bg-primary);
      padding: 0;
      cursor: pointer;
      transition: all var(--bc-transition-fast);
    }

    .bc-table-size-picker-cell:hover {
      border-color: var(--bc-active-color);
    }

    .bc-table-size-picker-cell.active {
      border-color: var(--bc-active-color);
      background: var(--bc-float-toolbar-item-active-bg);
    }

    .bc-table-size-picker-hint {
      line-height: 1;
      font-size: 12px;
      color: var(--bc-color-lighter);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(mousedown)': 'onMouseDown($event)'
  }
})
export class BcTableSizePickerComponent {
  @Input()
  maxRows = 8

  @Input()
  maxCols = 8

  @Input()
  emptyHint = '拖动选择表格大小'

  @Output()
  pick = new EventEmitter<ITableSizePickedEvent>()

  activeRows = 0
  activeCols = 0

  get rows() {
    return Array.from({length: Math.max(1, this.maxRows)}, (_, i) => i + 1)
  }

  get cols() {
    return Array.from({length: Math.max(1, this.maxCols)}, (_, i) => i + 1)
  }

  get hintText() {
    if (!this.activeRows || !this.activeCols) return this.emptyHint
    return `${this.activeRows} × ${this.activeCols}`
  }

  onMouseDown(evt: MouseEvent) {
    evt.preventDefault()
    evt.stopPropagation()
  }

  onHover(rows: number, cols: number) {
    this.activeRows = rows
    this.activeCols = cols
  }

  onPickerLeave() {
    this.activeRows = 0
    this.activeCols = 0
  }

  onPick(rows: number, cols: number) {
    this.activeRows = rows
    this.activeCols = cols
    this.pick.emit({rows, cols})
  }
}
