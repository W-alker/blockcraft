import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  computed,
  signal,
} from '@angular/core'
import {
  CsButtonComponent,
  CsDateTimePickerComponent,
  CsOptionComponent,
  CsSelectComponent,
} from '@cses/ui'
import {
  DEFAULT_INLINE_DATE_FORMAT,
  INLINE_DATE_FORMATS,
  formatInlineDateValue,
  isInlineDateFormat,
  parseInlineDateValue,
  toInlineDateValue,
} from '../../../framework'

export interface InlineDateEditResult {
  value: string
  format: string
}

/**
 * 行内日期的编辑弹框：选时刻 + 选显示格式，两个字段都用 `@cses/ui` 的控件。
 *
 * 格式下拉里每一项显示的是**当前所选时刻**在该格式下的实际样子，而不是
 * `YYYY-MM-DD` 这种 token 串——作者要挑的是「看起来像什么」，不是记格式语法。
 *
 * 改动只在点「确定」时才提交。逐次提交会重建 embed 元素，而弹框正锚定在
 * 那个元素上，锚点被换掉后弹框会跟着错位甚至自关。
 */
@Component({
  selector: 'div.bc-inline-date-dialog',
  standalone: true,
  imports: [
    CsButtonComponent,
    CsDateTimePickerComponent,
    CsOptionComponent,
    CsSelectComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bd-field">
      <span class="bd-label">时间</span>
      <cs-date-time-picker
        class="bd-control"
        csSize="sm"
        csFormat="yyyy-MM-dd HH:mm"
        csPlaceholder="选择日期时间"
        [csValue]="draftDate()"
        (csValueChange)="onDateChange($event)"></cs-date-time-picker>
    </div>
    <div class="bd-field">
      <span class="bd-label">格式</span>
      <cs-select
        class="bd-control"
        csSize="sm"
        [csValue]="draftFormat()"
        (csValueChange)="onFormatChange($event)">
        @for (option of formatOptions(); track option.format) {
          <cs-option [csValue]="option.format" [csLabel]="option.sample" />
        }
      </cs-select>
    </div>
    <div class="bd-footer">
      <button cs-button csSize="sm" (click)="close.emit()">取消</button>
      <button cs-button csType="primary" csSize="sm" (click)="onConfirm()">确定</button>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 280px;
      max-width: calc(100vw - 24px);
      box-sizing: border-box;
      padding: 12px;
      border-radius: var(--bc-radius-lg);
      border: 1px solid var(--bc-border-color);
      background: var(--bc-bg-primary);
      box-shadow: var(--bc-shadow-md);
      font-size: 14px;
      line-height: normal;
      color: var(--bc-color);
    }

    .bd-field {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .bd-field + .bd-field {
      margin-top: 8px;
    }

    .bd-label {
      flex: none;
      width: 28px;
      color: var(--bc-color-light);
      font-size: 12px;
    }

    .bd-control {
      flex: 1;
      min-width: 0;
    }

    .bd-footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 12px;
    }
  `],
})
export class InlineDateEditDialog {
  @Input({required: true})
  set value(v: string) {
    this.draftValue.set(v)
  }

  @Input({required: true})
  set format(v: string) {
    this.draftFormat.set(isInlineDateFormat(v) ? v : DEFAULT_INLINE_DATE_FORMAT)
  }

  @Output() close = new EventEmitter<void>()
  @Output() update = new EventEmitter<InlineDateEditResult>()

  protected readonly draftValue = signal('')
  protected readonly draftFormat = signal<string>(DEFAULT_INLINE_DATE_FORMAT)

  /** 坏数据落到这里也要有个能选的起点，否则日历面板整个不可用。 */
  protected readonly draftDate = computed(
    () => parseInlineDateValue(this.draftValue()) ?? new Date(),
  )

  protected readonly formatOptions = computed(() => {
    const value = this.draftValue()
    return INLINE_DATE_FORMATS.map(format => ({
      format,
      sample: formatInlineDateValue(value, format),
    }))
  })

  protected onDateChange(value: Date | [Date, Date] | null): void {
    const picked = Array.isArray(value) ? value[0] : value
    if (!picked) return
    this.draftValue.set(toInlineDateValue(picked))
  }

  protected onFormatChange(format: unknown): void {
    if (isInlineDateFormat(format)) this.draftFormat.set(format)
  }

  protected onConfirm(): void {
    const value = this.draftValue()
    if (!value) return this.close.emit()
    this.update.emit({value, format: this.draftFormat()})
  }
}
