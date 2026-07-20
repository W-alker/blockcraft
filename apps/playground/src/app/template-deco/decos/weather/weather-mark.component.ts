import { ChangeDetectionStrategy, Component, Input } from '@angular/core'
import { WeatherTone } from '../../data/template-data'

/**
 * 天气图标：纯 CSS 画的太阳/云/雨/雷/雾，按 tone 控制各部件显隐。
 * 1:1 移植自 cses workbench-weather 的 `.weather-mark`（34px 版），自带封装样式、无外部依赖，
 * 因此可整体复制到 cses 复用。给天气块的 render 与 edit 占位共用。
 */
@Component({
  selector: 'weather-mark',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': "'weather-mark weather-mark--' + tone", 'aria-hidden': 'true' },
  template: `
    <span class="weather-mark__sun"></span>
    <span class="weather-mark__cloud"></span>
    <span class="weather-mark__rain"></span>
    <span class="weather-mark__bolt"></span>
    <span class="weather-mark__fog"></span>
  `,
  styles: [`
    :host{ flex:none; position:relative; width:34px; height:34px; display:block; border-radius:10px; background:#f7f9ff; box-shadow:inset 0 0 0 1px rgba(72,87,226,.08) }
    .weather-mark__sun,.weather-mark__cloud,.weather-mark__rain,.weather-mark__bolt,.weather-mark__fog{ position:absolute }
    .weather-mark__sun{ width:13px; height:13px; top:7px; left:8px; border-radius:999px; background:#f5a524; box-shadow:0 0 0 3px rgba(245,165,36,.15) }
    .weather-mark__cloud{ width:21px; height:9px; right:5px; bottom:7px; border-radius:999px; background:#fff; box-shadow:inset 0 0 0 1px rgba(112,123,158,.18) }
    .weather-mark__cloud::before{ content:''; position:absolute; width:11px; height:11px; left:4px; bottom:4px; border-radius:999px; background:inherit; box-shadow:inherit }
    .weather-mark__rain{ width:18px; height:8px; right:5px; bottom:1px; opacity:0; background:linear-gradient(115deg, transparent 0 42%, #4f6be8 43% 57%, transparent 58% 100%) 0 0 / 6px 8px repeat-x }
    .weather-mark__bolt{ width:8px; height:13px; right:11px; bottom:1px; opacity:0; clip-path:polygon(44% 0, 100% 0, 64% 42%, 100% 42%, 28% 100%, 44% 54%, 0 54%); background:#f5a524 }
    .weather-mark__fog{ width:20px; height:11px; right:5px; bottom:3px; opacity:0; background:linear-gradient(#8f97ad,#8f97ad) 0 2px / 20px 1px no-repeat, linear-gradient(#8f97ad,#8f97ad) 4px 7px / 16px 1px no-repeat }
    :host(.weather-mark--sunny) .weather-mark__cloud{ opacity:0 }
    :host(.weather-mark--cloudy) .weather-mark__sun{ opacity:.42 }
    :host(.weather-mark--rainy) .weather-mark__sun,
    :host(.weather-mark--stormy) .weather-mark__sun,
    :host(.weather-mark--snowy) .weather-mark__sun{ opacity:0 }
    :host(.weather-mark--rainy) .weather-mark__rain,
    :host(.weather-mark--stormy) .weather-mark__rain,
    :host(.weather-mark--stormy) .weather-mark__bolt{ opacity:1 }
    :host(.weather-mark--snowy) .weather-mark__rain{ opacity:1; background:radial-gradient(circle, #6aa3ff 0 1px, transparent 1.5px) 0 0 / 6px 6px }
    :host(.weather-mark--foggy) .weather-mark__fog{ opacity:1 }
    :host(.weather-mark--foggy) .weather-mark__sun{ opacity:.3 }
  `],
})
export class WeatherMarkComponent {
  @Input() tone: WeatherTone = 'sunny'
}
