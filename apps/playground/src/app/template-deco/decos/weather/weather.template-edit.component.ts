import { ChangeDetectionStrategy, Component, computed } from '@angular/core'
import { WeatherTone } from '../../data/template-data'
import { PlaceableEditBase } from '../_shared/placeable-edit.base'
import { WeatherMarkComponent } from './weather-mark.component'
import { wireWeatherChip } from './weather-data'
import type { WeatherModel } from './weather.deco'

/**
 * 编辑态：与渲染态同款 chip 预览。天气按 IP 自动定位、设计期不设城市，故无设置。
 * 三态排版 + 选中/拖拽全部继承 PlaceableEditBase（void 物料默认可拖，零接线）；
 * 天气数据与列宽 zoom 走组合式函数（wireWeatherData / wireColumnZoom），两态各调一行、逻辑各只有一份。
 */
@Component({
  selector: 'div.template-weather-edit-block',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WeatherMarkComponent],
  template: `
    <span class="tpl-weather-chip tpl-edit" contenteditable="false" [style.zoom]="chip.zoom() === 1 ? null : chip.zoom()">
      <weather-mark [tone]="tone()"></weather-mark>
      <span class="tpl-weather-chip__copy">
        <span class="tpl-weather-chip__temp">{{ chip.w()?.temp ?? '--' }}°</span>
        <span class="tpl-weather-chip__meta">{{ chip.w()?.location ?? '当前位置' }} · {{ chip.w()?.condition ?? '天气' }}</span>
      </span>
    </span>
  `,
})
export class WeatherTemplateEditComponent extends PlaceableEditBase<WeatherModel> {
  /** 数据信号 w + 列宽 zoom 信号，一行接完（与渲染态共用 wireWeatherChip，逻辑只此一份）。 */
  protected readonly chip = wireWeatherChip()
  /** 编辑态没有真数据也要给个底色调（sunny），空态 chip 不至于灰白。 */
  protected readonly tone = computed<WeatherTone>(() => this.chip.w()?.tone ?? 'sunny')
}
