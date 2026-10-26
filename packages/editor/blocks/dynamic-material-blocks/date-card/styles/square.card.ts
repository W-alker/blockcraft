import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { todayParts } from '../date-card-parts.util';
import type { DateParts } from '../date-card-parts.util';
import { DATE_FORMATS, showsWeek, showsYear } from '../date-card-format.util';

/**
 * 日期卡片样式「② square — 极简方块」（设计宽 140px，正方形）。
 *
 * 与 calendar 同一套缩略图约束（设计 §3.6）：`parts` 必须可缺省（面板 outlet 不传 input）、
 * 内部尺寸一律 cqw（缩略图靠 `--mtl-w: 72px` 压缩）、不认祖先选择器（渲染在编辑器根之外）。
 *
 * 只有两行字：顶上年月、底下大号日号。信息量比 calendar 少是刻意的——
 * 它的用途是「贴在版面角上不抢戏」，不是替代日历卡。
 */
@Component({
    selector: 'dc-square',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="card">
            <!-- 顶行是「月份标签」，年份在不在只改它的写法：有年走数字式 2026-08，
                 没年走缩写 Aug——退成孤零零一个「08」既读不出是月份、也撑不住这个位置。
                 注意：模板字符串里不许出现反引号，写了会当场截断整个 template（这里踩过）。 -->
            <div class="card__ym">@if (year) { {{ parts['YYYY'] }}-{{ parts['MM'] }} } @else { {{ parts['MMM'] }} }</div>
            <div class="card__day">{{ parts['DD'] }}</div>
            <!-- 星期落在数字**下面**、不挤进顶行：正方形里三行一上一下夹着大数字才是稳的，
                 塞进顶行会变成「2026-08 · 周五」一长条，这个字号下贴着两边框。 -->
            @if (week) { <div class="card__week">{{ parts['ddd'] }}</div> }
        </div>
    `,
    styleUrl: './square.card.scss'
})
export class SquareCardComponent {
    /** 缺省当天：面板 outlet 缩略图时不传任何 input，示例数据只能由组件自己兜。 */
    @Input() parts: DateParts = todayParts();
    /** 格式档。缺省完整档——同上，缩略图那条路径一个 input 都不传。 */
    @Input() format: string = DATE_FORMATS.Full;

    /** 模板里的两个显隐口。走 getter 而不是在模板里调函数：脏值回落的口径收在 util 一处。 */
    protected get week(): boolean { return showsWeek(this.format); }
    protected get year(): boolean { return showsYear(this.format); }
}
