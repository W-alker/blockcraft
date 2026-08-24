import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { todayParts } from '../date-card-parts.util';
import type { DateParts } from '../date-card-parts.util';
import { DATE_FORMATS, showsWeek, showsYear } from '../date-card-format.util';

/**
 * 日期卡片样式「① calendar — 竖版日历卡」（设计宽 160px，高由内容定，实测约 143px）。
 *
 * 三条约束全是被**面板缩略图**逼出来的——面板把样式组件本身当选项图标直接 outlet（设计 §3.6/§5）：
 * ① `parts` 必须有默认值：outlet 时一个 input 都不传，组件得自己画出当天这份示例；
 * ② 尺寸一律 cqw、`:host` 只留宽度：缩略图靠 `--mtl-w: 72px` 把整张卡压成图标，
 *    任何写死的 px 都会在那个尺寸下把格子撑破；
 * ③ 不认任何祖先选择器：缩略图渲染在 `[data-blockcraft-root]` 之外，主题类在那里够不着。
 *
 * 第三行原型上是「农历：七月初一」，本版不做农历（全仓无此能力、要引依赖），用年月行顶替。
 */
@Component({
    selector: 'dc-calendar',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="card">
            <div class="card__sheet">
                <div class="card__band"></div>
                <div class="card__body">
                    <div class="card__day">{{ parts['D'] }}</div>
                    <!-- 月份恒在，星期跟着格式档走。拆成两个 span 而不是拼一个插值串：
                         分隔线由 CSS 的相邻兄弟规则画（见 scss），星期没了分隔线自然一起没，
                         不会留下一个孤零零的「Aug /」。 -->
                    <div class="card__sub">
                        <span>{{ parts['MMM'] }}</span>
                        <!-- ddd（周四）而非 dddd（星期四）：原型这一行是短式，且这个字号下长式会顶到卡片边 -->
                        @if (week) { <span>{{ parts['ddd'] }}</span> }
                    </div>
                    @if (year) {
                        <div class="card__ym">{{ parts['YYYY'] }} 年 {{ parts['M'] }} 月</div>
                    }
                </div>
            </div>
        </div>
    `,
    styleUrl: './calendar.card.scss'
})
export class CalendarCardComponent {
    /** 缺省当天：面板 outlet 缩略图时不传任何 input，示例数据只能由组件自己兜。 */
    @Input() parts: DateParts = todayParts();
    /** 格式档。缺省完整档——同上，缩略图那条路径一个 input 都不传。 */
    @Input() format: string = DATE_FORMATS.Full;

    /** 模板里的两个显隐口。走 getter 而不是在模板里调函数：脏值回落的口径收在 util 一处。 */
    protected get week(): boolean { return showsWeek(this.format); }
    protected get year(): boolean { return showsYear(this.format); }
}
