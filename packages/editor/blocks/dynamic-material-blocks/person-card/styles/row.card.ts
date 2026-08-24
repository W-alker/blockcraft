import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { PLACEHOLDER_VIEW, fallbackAvatar } from '../person-card-view.util';
import type { PersonCardView } from '../person-card-view.util';

/**
 * 人员卡片格式「① row — 横排」（设计宽 225px，高由头像定，约 32px）。
 *
 * 最朴素的一档：头像 + 姓名并排，一行文字的高度就装得下，贴在版面角上不抢戏。
 * 「部门职务」开关打开时部门跟在姓名后、**仍在同一行**——这是分档判据决定的：
 * 改高度的必须进格式档，不改高度的才能做正交开关（拼音那档多一行，所以它是独立格式档）。
 *
 * 三条约束全是被**面板缩略图**逼出来的（面板把样式组件本身当选项图标直接 outlet）：
 * ① `view` 必须有默认值：outlet 时一个 input 都不传，组件得自己画出那份占位示例；
 * ② 内部尺寸一律 cqw、`:host` 只留宽度：缩略图靠 `--mtl-w` 把整张卡压成图标，写死的 px 不会跟着缩；
 * ③ 不认任何祖先选择器：缩略图渲染在 `[data-blockcraft-root]` 之外，主题类在那里够不着。
 */
@Component({
    selector: 'pc-row',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    styleUrl: './row.card.scss',
    template: `
        <div class="card">
            <img class="card__avatar" [src]="view.avatar" alt="" (error)="fallbackAvatar($event)" />
            <!-- 姓名与部门共处一行、各自 min-width:0：人员数据的宽度波动没有上界
                 （「张明·研发部」vs「欧阳明月·信息技术中心/高级工程师」），而 ar 固定、内部按 cqw 等比缩放。
                 不给省略号就是顶破版；截了的话作者把卡片拖宽即可（本就可缩放）。 -->
            <span class="card__line">
                <span class="card__name">{{ view.name }}</span>
                @if (view.desc) {
                    <span class="card__desc">{{ view.desc }}</span>
                }
            </span>
        </div>
    `
})
export class RowCardComponent {
    /** 缺省画占位：面板 outlet 缩略图时不传任何 input，示例数据只能由组件自己兜。 */
    @Input() view: PersonCardView = PLACEHOLDER_VIEW;
    /** 头像 404 回落默认头像。共用函数，三档各挂一行——写成方法要抄三份。 */
    protected readonly fallbackAvatar = fallbackAvatar;
}
