import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { PLACEHOLDER_VIEW, fallbackAvatar } from '../person-card-view.util';
import type { PersonCardView } from '../person-card-view.util';

/**
 * 人员卡片格式「③ column — 竖排」（设计宽 168px，高约 84px，是三档里唯一接近方形的一档）。
 *
 * 头像在上、姓名在下、整体居中——署名、封面负责人那类用法：它不嵌在句子边上，
 * 而是独立占一块版面。头像因此可以放大到 56px（横排两档受制于行高只能给 32/40px）。
 *
 * **部门仍然跟在姓名后、同一行**，不是另起一行：分档判据是「改高度的进格式档」，
 * 部门另起一行就改了高度，那它就该是第四个格式档而不是一个开关。竖排本就窄，
 * 姓名 + 部门挤一行大概率会截断——省略号在这里是常态而非兜底，作者觉得截了把卡片拖宽即可。
 *
 * 同一套缩略图约束：`view` 必须可缺省、内部尺寸一律 cqw、不认祖先选择器。
 */
@Component({
    selector: 'pc-column',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    styleUrl: './column.card.scss',
    template: `
        <div class="card">
            <img class="card__avatar" [src]="view.avatar" alt="" (error)="fallbackAvatar($event)" />
            <span class="card__line">
                <span class="card__name">{{ view.name }}</span>
                @if (view.desc) {
                    <span class="card__desc">{{ view.desc }}</span>
                }
            </span>
        </div>
    `
})
export class ColumnCardComponent {
    /** 缺省画占位：面板 outlet 缩略图时不传任何 input，示例数据只能由组件自己兜。 */
    @Input() view: PersonCardView = PLACEHOLDER_VIEW;
    /** 头像 404 回落默认头像。共用函数，三档各挂一行——写成方法要抄三份。 */
    protected readonly fallbackAvatar = fallbackAvatar;
}
