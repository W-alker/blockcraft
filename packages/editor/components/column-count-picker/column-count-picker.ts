import {ChangeDetectionStrategy, Component, EventEmitter, Input, Output} from "@angular/core";

export interface IColumnCountPickedEvent {
  count: number
}

@Component({
  selector: 'bc-column-count-picker',
  template: `
    <div class="bc-column-count-picker" (mouseleave)="onPickerLeave()">
      <div class="bc-column-count-picker-row">
        @for (count of counts; track count) {
          <button type="button"
                  class="bc-column-count-picker-cell"
                  [class.active]="activeCount > 0 && count <= activeCount"
                  (mouseenter)="onHover(count)"
                  (click)="onPick(count)"></button>
        }
      </div>
      <div class="bc-column-count-picker-hint">{{ hintText }}</div>
    </div>
  `,
  standalone: true,
  styles: [`
    :host {
      display: block;
    }

    .bc-column-count-picker {
      padding: 8px;
      border-radius: 8px;
      border: 1px solid var(--bc-float-toolbar-divider-color);
      background: var(--bc-float-toolbar-bg);
      box-shadow: var(--bc-float-toolbar-shadow);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .bc-column-count-picker-row {
      display: flex;
      gap: 4px;
      width: max-content;
    }

    .bc-column-count-picker-cell {
      width: 18px;
      height: 48px;
      border-radius: 4px;
      border: 1px solid var(--bc-border-color);
      background: var(--bc-bg-primary);
      padding: 0;
      cursor: pointer;
      transition: all var(--bc-transition-fast);
    }

    .bc-column-count-picker-cell:hover {
      border-color: var(--bc-active-color);
    }

    .bc-column-count-picker-cell.active {
      border-color: var(--bc-active-color);
      background: var(--bc-float-toolbar-item-active-bg);
    }

    .bc-column-count-picker-hint {
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
export class BcColumnCountPickerComponent {
  @Input()
  minCount = 2

  @Input()
  maxCount = 8

  @Input()
  emptyHint = '拖动选择分栏列数'

  @Output()
  pick = new EventEmitter<IColumnCountPickedEvent>()

  activeCount = 0

  get counts() {
    const min = Math.max(1, Math.floor(this.minCount) || 1)
    const max = Math.max(min, Math.floor(this.maxCount) || min)
    return Array.from({length: max - min + 1}, (_, i) => min + i)
  }

  get hintText() {
    if (!this.activeCount) return this.emptyHint
    return `${this.activeCount} 列`
  }

  onMouseDown(evt: MouseEvent) {
    evt.preventDefault()
    evt.stopPropagation()
  }

  onHover(count: number) {
    this.activeCount = count
  }

  onPickerLeave() {
    this.activeCount = 0
  }

  onPick(count: number) {
    this.activeCount = count
    this.pick.emit({count})
  }
}
