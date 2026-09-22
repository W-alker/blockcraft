import {ChangeDetectionStrategy, Component, EventEmitter, Input, Output, signal} from '@angular/core'
import {CsButtonComponent, CsOptionComponent, CsSelectComponent} from '@cses/ui'
import type {DeltaInsertEmbed} from '../../framework/block-std/types'
import {
  INLINE_WEATHER_FORMATS, InlineWeatherFormat, formatInlineWeatherDelta,
  isInlineWeatherFormat, readInlineWeatherDelta,
} from '../../embeds/weather'

@Component({
  selector: 'div.bc-inline-weather-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {role: 'dialog', 'aria-label': '行内天气格式'},
  imports: [CsButtonComponent, CsOptionComponent, CsSelectComponent],
  template: `
    <label>显示格式</label>
    <cs-select aria-label="显示格式" csSize="sm" [csValue]="format()" (csValueChange)="selectFormat($event)">
      @for (option of options; track option.value) {
        <cs-option [csValue]="option.value" [csLabel]="option.label" />
      }
    </cs-select>
    <div class="actions">
      <button cs-button csSize="sm" (click)="close.emit()">取消</button>
      <button cs-button csSize="sm" csType="primary" (click)="update.emit(format())">确定</button>
    </div>
  `,
  styles: [`
    :host {
      display: grid; gap: 8px; width: 280px; max-width: calc(100vw - 24px);
      box-sizing: border-box; padding: 12px; font-size: var(--bc-fs, 14px);
      color: var(--bc-color); background: var(--bc-bg-primary);
      border: 1px solid var(--bc-border-color); border-radius: var(--bc-radius-lg);
      box-shadow: var(--bc-shadow-md);
    }
    .actions { display: flex; justify-content: flex-end; gap: 8px; }
  `],
})
export class InlineWeatherFormatDialog {
  protected readonly format = signal<InlineWeatherFormat>('full')
  protected options: {value: InlineWeatherFormat; label: string}[] = []
  @Output() close = new EventEmitter<void>()
  @Output() update = new EventEmitter<InlineWeatherFormat>()

  @Input({required: true}) set delta(delta: DeltaInsertEmbed) {
    const format = delta.attributes?.['weatherFormat']
    this.format.set(isInlineWeatherFormat(format) ? format : 'full')
    const labels: Record<InlineWeatherFormat, string> = {
      full: '图标 · 温度 · 天气 · 城市',
      'weather-temp': '图标 · 温度 · 天气',
      temp: '图标 · 温度',
      condition: '图标 · 天气',
    }
    this.options = INLINE_WEATHER_FORMATS.map(value => ({
      value,
      label: readInlineWeatherDelta(delta)
        ? formatInlineWeatherDelta({...delta, attributes: {...delta.attributes, weatherFormat: value}})
        : labels[value],
    }))
  }

  protected selectFormat(value: unknown): void {
    if (isInlineWeatherFormat(value)) this.format.set(value)
  }
}
