import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { todayParts } from '../date-card-parts.util';
import type { DateParts } from '../date-card-parts.util';
import { DATE_FORMATS, showsWeek, showsYear } from '../date-card-format.util';

/**
 * 「邮戳」档：正圆双圈，AUG / 17 / MON 三行居中。
 *
 * 它是宫格里**唯一的圆形轮廓**——四档旧样式全是方的，缩略图挤在一起时靠形状就能认出来
 * （这正是「选的是视觉」那条判据想要的效果）。
 *
 * 双圈画在**内层元素**上，不占用 `.card` 的 `border`：外框那一圈是配置项「边框」的地盘，
 * 两者抢同一个属性的话，作者一开边框，邮戳的圈就被顶掉了（显示配置之间必须正交）。
 *
 * 三行都用英文缩写：圆里横向空间很窄，「星期一」三个汉字在这个直径下会顶到圈上，
 * 而 `MON` 只有三个窄字符。年份同理只在完整/不含星期两档出现，且挤在月份后面。
 */
@Component({
    selector: 'dc-stamp',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    styleUrl: './stamp.card.scss',
    template: `
        <div class="card">
            <span class="card__ring">
                <span class="card__mon">
                    <span>{{ parts['MMM'] }}</span>
                    @if (year) { <span>{{ parts['YYYY'] }}</span> }
                </span>
                <span class="card__day">{{ parts['D'] }}</span>
                <!-- 星期没了整行消失，但**卡片不变矮**：外圈是 aspect-ratio: 1 钉死的正圆，
                     内容少一行只是更居中一点。所以这一档不需要 arByVariant。 -->
                @if (week) { <span class="card__week">{{ parts['EEE'] }}</span> }
            </span>
        </div>
    `
})
export class StampCardComponent {
    /** 缺省画当天：模板态、缩略图两条路径都靠它，渲染态才会由宿主传定格值。 */
    @Input() parts: DateParts = todayParts();
    /** 格式档。缺省完整档——同上，缩略图那条路径一个 input 都不传。 */
    @Input() format: string = DATE_FORMATS.Full;
    /** 模板里的两个显隐口。走 getter 而不是在模板里调函数：脏值回落的口径收在 util 一处。 */
    protected get week(): boolean { return showsWeek(this.format); }
    protected get year(): boolean { return showsYear(this.format); }
}
