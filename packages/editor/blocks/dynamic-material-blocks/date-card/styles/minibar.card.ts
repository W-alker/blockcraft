import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { todayParts } from '../date-card-parts.util';
import type { DateParts } from '../date-card-parts.util';
import { DATE_FORMATS, showsWeek, showsYear } from '../date-card-format.util';

/**
 * minibar —— 迷你条样式（设计宽 129px、实测高 30px，宽高比 4.31）。
 * 四个样式里最小的一档，右列只有「月份年份 / 星期」两行，没有分隔线。
 *
 * `parts` 带默认值不是"顺手给个兜底"，而是契约：面板的缩略图用 `*ngComponentOutlet` outlet 本组件
 * 且**一个 input 都不传**（这样面板永远不必认识日期物料的数据形状）。没有默认值缩略图就是一张空卡。
 *
 * 尺寸全部交给宿主的 `--mtl-w`：正文里用设计宽 129px，面板缩略图传 72px，内部一律 cqw 等比跟随。
 */
@Component({
    selector: 'dc-minibar',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    styleUrl: './minibar.card.scss',
    template: `
        <div class="card">
            <span class="card__day">{{ parts['D'] }}</span>
            <span class="card__col">
                <!-- 月份恒在、年份跟着格式档。拆两个 span 是为了让 gap 去管间距：
                     这一行有 0.22em 的字距，写死一个空格会被字距顶成两个字宽的裂口。 -->
                <span class="card__ym">
                    <span>{{ parts['MMM'] }}</span>
                    @if (year) { <span>{{ parts['YYYY'] }}</span> }
                </span>
                <!-- 星期整行消失（不是留空壳）：右列由两行变一行，卡片跟着变矮，
                     所以这一档在 DATE_CARD_STYLES 里有自己的宽高比，不共用完整档那组数。 -->
                @if (week) { <span class="card__week">{{ parts['dddd'] }}</span> }
            </span>
        </div>
    `
})
export class MinibarCardComponent {
    /** 缺省画当天：模板态、缩略图两条路径都靠它，渲染态才会由宿主传定格值。 */
    @Input() parts: DateParts = todayParts();
    /** 格式档。缺省完整档——同上，缩略图那条路径一个 input 都不传。 */
    @Input() format: string = DATE_FORMATS.Full;

    /** 模板里的两个显隐口。走 getter 而不是在模板里调函数：脏值回落的口径收在 util 一处。 */
    protected get week(): boolean { return showsWeek(this.format); }
    protected get year(): boolean { return showsYear(this.format); }
}
