import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { todayParts } from '../date-card-parts.util';
import type { DateParts } from '../date-card-parts.util';
import { DATE_FORMATS, showsWeek, showsYear } from '../date-card-format.util';

/**
 * 「翻页牌」档：深底白字，年月一行、大数字一行，中间横着一道翻页缝，底下一条星期带。
 *
 * 全家唯一**默认深底**的一档。这不是随手挑的配色：深底白字是「封面日期」的常见长相，
 * 而背景/字体色两个配置项的缺席语义正是**跟随样式档**（见 defineColorConfig 的 fallback 参数），
 * 所以这一档的深底只活在自己的 scss 兜底里，别的档一个字不受影响。
 *
 * 由此而来的既定代价：作者把「背景颜色」调成浅色而不动「字体颜色」，就会白字压浅底看不见。
 * 这与自由取色是同一笔账（见 material-color.util 那段），不靠预设清单挡。
 */
@Component({
    selector: 'dc-flip',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    styleUrl: './flip.card.scss',
    template: `
        <div class="card">
            <!-- 顶行：有年是「2026 年 8 月」，没年退成「8 月」。退成孤零零一个数字读不出是月份，
                 所以汉字「月」恒在（同方牌顶行那条的思路，只是它退成英文缩写、这里退成中文短式）。 -->
            <div class="card__ym">@if (year) { {{ parts['YYYY'] }} 年 }{{ parts['M'] }} 月</div>
            <div class="card__day">{{ parts['DD'] }}</div>
            <!-- 翻页缝：压在大数字腰上的一条暗线。绝对定位在 50% 而不是插一个块元素——
                 它必须**穿过**数字而不是把上下推开，塞进流里会把卡片顶高一整条线的厚度。 -->
            <span class="card__seam"></span>
            <!-- 星期整条带子消失（不是留空壳）：卡片跟着变矮，所以这一档有自己的宽高比。 -->
            @if (week) { <div class="card__week">{{ parts['dddd'] }}</div> }
        </div>
    `
})
export class FlipCardComponent {
    /** 缺省画当天：模板态、缩略图两条路径都靠它，渲染态才会由宿主传定格值。 */
    @Input() parts: DateParts = todayParts();
    /** 格式档。缺省完整档——同上，缩略图那条路径一个 input 都不传。 */
    @Input() format: string = DATE_FORMATS.Full;
    /** 模板里的两个显隐口。走 getter 而不是在模板里调函数：脏值回落的口径收在 util 一处。 */
    protected get week(): boolean { return showsWeek(this.format); }
    protected get year(): boolean { return showsYear(this.format); }
}
