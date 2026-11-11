import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core'
import { DomSanitizer, SafeHtml } from '@angular/platform-browser'
import { WeatherTone } from '../dynamic-material-data'
import { FALLBACK_TONE, WEATHER_ICONS } from './weather-icon.const'

/**
 * 天气图标：按 `tone` 从 `WEATHER_ICONS` 查一段 SVG 塞进 DOM。给天气块的 render 与 edit 占位共用。
 *
 * 早先是**纯 CSS 画**的（5 个空 span + opacity 组合出 6 种天气，1:1 移植自 cses workbench-weather）。
 * 换成 SVG 的原因是画不出细节：CSS 版的雨是一条斜线渐变、雪是一圈圆点渐变，32px 下两者几乎一样，
 * 而 SVG 版靠形状 + 固定配色能一眼分开。数据侧零改动——快照里存的一直只有 `tone` 那个字符串，
 * 换的只是「拿到 rainy 之后画什么」这一步（详见 `weather-icon.const` 的抬头）。
 *
 * 尺寸沿用旧口径：1em = 图标边长，宿主改 `font-size` 即整体等比缩放，
 * 默认 34px = 原设计尺寸，chip 里用 `21cqw` 覆盖它实现随宽自适应。
 * （不能用 px + zoom：zoom 要 JS 算，而 resizer 拖动中只写 DOM 宽度、不发逐帧回调。）
 *
 * 底板（旧版 `#f7f9ff` 的圆角方块）已去掉：那是给扁平 CSS 色块兜形状用的，
 * SVG 本身是自封闭图形，压在 chip 的 `#f5f7fa` 上本就几乎看不见这层板。
 */
@Component({
  selector: 'weather-mark',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'weather-mark', 'aria-hidden': 'true' },
  template: `<span class="weather-mark__svg" [innerHTML]="icon"></span>`,
  styles: [`
    :host{ flex:none; display:block; font-size:34px; width:1em; height:1em }
    .weather-mark__svg{ display:block; width:100%; height:100% }
    /* innerHTML 插进来的节点拿不到 _ngcontent 属性，组件样式够不着，必须 ::ng-deep 穿透。
       前缀限定在 :host 内，不会污染全局的 .weather-mark（工作台那份同名 class 还在用）。 */
    :host ::ng-deep svg{ display:block; width:100%; height:100% }
  `],
})
export class WeatherMarkComponent {
  @Input() tone: WeatherTone = FALLBACK_TONE

  private readonly sanitizer = inject(DomSanitizer)

  /**
   * SVG 素材是本仓库写死的常量、不含任何用户输入，`bypassSecurityTrustHtml` 在这里是正当用法
   * （Angular 的 sanitizer 会剥掉 SVG 的 `<defs>`/渐变引用，不绕过就只剩没有填色的空壳）。
   */
  private cachedTone: WeatherTone | null = null
  private cachedIcon: SafeHtml | null = null

  /**
   * 必须按 tone 缓存：`[innerHTML]` 是**按引用**比对的，每轮变更检测返回一个新的 SafeHtml
   * 会让 Angular 每次都重写一遍 innerHTML——DOM 整棵重建，图标闪一下且白烧性能。
   */
  protected get icon(): SafeHtml {
    if (this.cachedTone !== this.tone || !this.cachedIcon) {
      this.cachedTone = this.tone
      this.cachedIcon = this.sanitizer.bypassSecurityTrustHtml(
        WEATHER_ICONS[this.tone] ?? WEATHER_ICONS[FALLBACK_TONE]
      )
    }
    return this.cachedIcon
  }
}
