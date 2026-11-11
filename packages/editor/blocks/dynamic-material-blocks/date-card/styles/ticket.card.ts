import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { todayParts } from '../date-card-parts.util';
import type { DateParts } from '../date-card-parts.util';
import { DATE_FORMATS, showsWeek, showsYear } from '../date-card-format.util';

/**
 * 「票根」档：左边大数字、中间一道打孔虚线、右边月年与星期，上下各咬掉一个半圆缺口。
 *
 * 与「长卷」的分工：两者都是横版大数字，但长卷是**无底裸排**（一条竖线分栏），
 * 票根是**有底带纹理**——同样一句日期，一个像正文里的强调，一个像贴上去的一张票。
 * 缩略图上靠底色与打孔线一眼分得开，这是加它的前提（分不开的档不该进宫格）。
 *
 * 缺口用 `mask` 抠、不是画两个白圆：画白圆等于假定纸面恒白，压在有底色的区块上会露馅。
 * mask 不被支持时（老 WebView）缺口不出现、其余照常——退化是「少个装饰」，不是排版塌掉。
 */
@Component({
    selector: 'dc-ticket',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    styleUrl: './ticket.card.scss',
    template: `
        <div class="card">
            <span class="card__day">{{ parts['D'] }}</span>
            <!-- 打孔线是**元素**不是右边框：它要与两个缺口对齐在同一条竖线上，
                 而缺口由 card 的 mask 定位；写成边框就得在两处各维护一个百分比。 -->
            <span class="card__perf"></span>
            <span class="card__col">
                <!-- 月份恒在，年份跟着格式档。拆两个 span 让 gap 管间距——这一行有 0.1em 字距，
                     写死一个空格会被字距顶成两个字宽的裂口（同行签那条）。 -->
                <span class="card__mon">
                    <span>{{ parts['MMM'] }}</span>
                    @if (year) { <span>{{ parts['YYYY'] }}</span> }
                </span>
                <!-- 星期整行消失（不是留空壳）：右列由两行变一行，卡片跟着变矮，
                     所以这一档在 DATE_CARD_STYLES 里有自己的宽高比。 -->
                @if (week) { <span class="card__week">{{ parts['dddd'] }}</span> }
            </span>
        </div>
    `
})
export class TicketCardComponent {
    /** 缺省画当天：模板态、缩略图两条路径都靠它，渲染态才会由宿主传定格值。 */
    @Input() parts: DateParts = todayParts();
    /** 格式档。缺省完整档——同上，缩略图那条路径一个 input 都不传。 */
    @Input() format: string = DATE_FORMATS.Full;
    /** 模板里的两个显隐口。走 getter 而不是在模板里调函数：脏值回落的口径收在 util 一处。 */
    protected get week(): boolean { return showsWeek(this.format); }
    protected get year(): boolean { return showsYear(this.format); }
}
