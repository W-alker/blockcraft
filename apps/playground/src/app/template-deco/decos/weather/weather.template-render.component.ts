import { ChangeDetectionStrategy, Component } from '@angular/core'
import { PlaceableDecoBase } from '../_shared/placeable-deco.base'
import { WeatherMarkComponent } from './weather-mark.component'
import { wireWeatherChip } from './weather-data'
import type { WeatherModel } from './weather.deco'

/**
 * 渲染态：cses 风格天气 chip。三态排版绑定继承 PlaceableDecoBase（使用页只渲染、不拖，故不继承编辑基类）；
 * 天气数据与列宽 zoom 走组合式函数（与编辑态各调一行，逻辑各只有一份）。
 */
@Component({
  selector: 'div.template-weather-render-block',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WeatherMarkComponent],
  template: `
    <span class="tpl-weather-chip" contenteditable="false" [style.zoom]="chip.zoom() === 1 ? null : chip.zoom()">
      @if (chip.w(); as cur) {
        <weather-mark [tone]="cur.tone"></weather-mark>
        <span class="tpl-weather-chip__copy">
          <span class="tpl-weather-chip__temp">{{ cur.temp }}°</span>
          <span class="tpl-weather-chip__meta">{{ cur.location }} · {{ cur.condition }}</span>
        </span>
      } @else { <span class="tpl-empty">天气加载中…</span> }
    </span>
  `,
})
export class WeatherTemplateRenderComponent extends PlaceableDecoBase<WeatherModel> {
  /** 数据信号 w + 列宽 zoom 信号，一行接完（与编辑态共用 wireWeatherChip，逻辑只此一份）。 */
  protected readonly chip = wireWeatherChip()
}
