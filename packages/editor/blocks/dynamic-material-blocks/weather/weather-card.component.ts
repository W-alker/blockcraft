import {ChangeDetectionStrategy, Component, Input} from '@angular/core'
import {WeatherMarkComponent} from './weather-mark.component'
import type {DocWeatherData} from '../../../framework/ports/weather'
import type {WeatherLayout} from './weather-presentation'
import type {WeatherChipStatus} from './weather-chip.util'

/** 无数据请求、无持久化副作用；画布与样式缩略图复用。 */
@Component({
  selector: 'bc-weather-card', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WeatherMarkComponent], styleUrl: './weather-card.scss',
  template: `
    <div class="weather-card" [attr.data-layout]="layout" [attr.data-icon-mode]="iconMode">
      @if (layout === 'ledger') { <div class="weather-card__meta">WEATHER / 天气</div> }
      <weather-mark class="weather-card__icon" [tone]="weather?.tone ?? 'sunny'" />
      <span class="weather-card__temp">{{ weather?.temp ?? '--' }}°</span>
      <span class="weather-card__location" [title]="location">{{ layout === 'classic' ? classicSubtitle : location }}</span>
      <span class="weather-card__condition" [title]="condition">{{ condition }}</span>
      @if (layout !== 'classic') {
        <span class="weather-card__range" [style.visibility]="showRange ? 'visible' : 'hidden'"
              [attr.aria-hidden]="!showRange" aria-label="最高与最低温度">
          {{ weather?.high ?? '--' }}°<span> / {{ weather?.low ?? '--' }}°</span>
        </span>
      }
    </div>
  `,
})
export class WeatherCardComponent {
  @Input() layout: WeatherLayout = 'classic'
  @Input() weather: DocWeatherData | null = null
  @Input() status: WeatherChipStatus = 'idle'
  @Input() showRange = true
  @Input() iconMode: 'original' | 'mono' = 'original'
  get location(): string { return this.weather?.location || '城市' }
  get classicSubtitle(): string { return this.status === 'loading' || this.status === 'error' ? this.condition : `${this.location} · ${this.weather?.condition || '天气'}` }
  get condition(): string {
    if (this.status === 'loading') return '获取天气中…'
    if (this.status === 'error') return '天气获取失败'
    return this.weather?.condition || '天气'
  }
}
