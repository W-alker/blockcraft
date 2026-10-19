import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { todayParts } from '../date-card-parts.util';
import type { DateParts } from '../date-card-parts.util';
import { DATE_FORMATS, showsWeek, showsYear } from '../date-card-format.util';

/**
 * banner —— 横幅样式（设计宽 184px、实测高 45px，宽高比 4.10）。
 *
 * `parts` 带默认值不是"顺手给个兜底"，而是契约：面板的缩略图用 `*ngComponentOutlet` outlet 本组件
 * 且**一个 input 都不传**（这样面板永远不必认识日期物料的数据形状）。没有默认值缩略图就是一张空卡。
 *
 * 尺寸全部交给宿主的 `--mtl-w`：正文里用设计宽 184px，面板缩略图传 72px，内部一律 cqw 等比跟随。
 * 不用 `zoom`／JS 换算——那条路要逐帧回调，而宿主改宽度时不发任何事件（天气 chip 踩过，见
 * weather-render.component.ts 的注释）。
 */
@Component({
    selector: 'dc-banner',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    styleUrl: './banner.card.scss',
    template: `
        <div class="card">
            <span class="card__day">{{ parts['D'] }}</span>
            <span class="card__rule"></span>
            <span class="card__col">
                <span class="card__mon">{{ parts['MMM'] }}</span>
                <!-- 副行两段都可能没有，所以整行也要能整体消失：极简档只剩「17 | AUG」，
                     留一个空的 card__sub 会把 mon 顶到上半边、竖线两侧就不对齐了。
                     中点分隔符由 CSS 的相邻兄弟规则画，只在两段同时在场时才出现。 -->
                @if (week || year) {
                    <span class="card__sub">
                        @if (week) { <span>{{ parts['dddd'] }}</span> }
                        @if (year) { <span>{{ parts['YYYY'] }}</span> }
                    </span>
                }
            </span>
        </div>
    `
})
export class BannerCardComponent {
    /** 缺省画当天：模板态、缩略图两条路径都靠它，渲染态才会由宿主传定格值。 */
    @Input() parts: DateParts = todayParts();
    /** 格式档。缺省完整档——同上，缩略图那条路径一个 input 都不传。 */
    @Input() format: string = DATE_FORMATS.Full;

    /** 模板里的两个显隐口。走 getter 而不是在模板里调函数：脏值回落的口径收在 util 一处。 */
    protected get week(): boolean { return showsWeek(this.format); }
    protected get year(): boolean { return showsYear(this.format); }
}
