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
  minCount = 1

  @Input()
  maxCount = 8

  @Input()
  emptyHint = '拖动选择分栏列数'

  /** 当前栏数（打开时回显高亮）；0 表示无当前值 */
  @Input()
  current = 0

  @Output()
  pick = new EventEmitter<IColumnCountPickedEvent>()

  /** 鼠标悬停预览的栏数；0 表示未悬停 */
  private _hovering = 0

  /** 高亮栏数：悬停时取悬停值，否则回显当前值 */
  get activeCount() {
    return this._hovering || this.current
  }

  get counts() {
    const min = Math.max(1, Math.floor(this.minCount) || 1)
    const max = Math.max(min, Math.floor(this.maxCount) || min)
    return Array.from({length: max - min + 1}, (_, i) => min + i)
  }

  get hintText() {
    if (this._hovering) {
      // 已有分栏（current ≥ 2）内悬停到 1 列时，提示这是"取消分栏"
      if (this._hovering === 1 && this.current >= 2) return '取消分栏'
      return `${this._hovering} 列`
    }
    if (this.current > 0) return `当前 ${this.current} 列`
    return this.emptyHint
  }

  onMouseDown(evt: MouseEvent) {
    evt.preventDefault()
    evt.stopPropagation()
  }

  onHover(count: number) {
    this._hovering = count
  }

  onPickerLeave() {
    this._hovering = 0
  }

  onPick(count: number) {
    this.pick.emit({count})
  }
}
