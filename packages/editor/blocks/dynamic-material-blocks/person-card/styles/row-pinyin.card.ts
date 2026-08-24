import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { PLACEHOLDER_VIEW, fallbackAvatar } from '../person-card-view.util';
import type { PersonCardView } from '../person-card-view.util';

/**
 * 人员卡片格式「② rowPinyin — 横排拼音」（设计宽 222px，高由头像定，约 40px）。
 *
 * 与 ① row 的差别只有一样：右列变成姓名/拼音**竖排两行**。
 * 它必须是**独立格式档而不是一个开关**——分档判据只有一条：改宽高比的进格式档。
 * 多一行拼音就是改高度（ar 从 3.75 掉到 3.50），而 `applySize` 只在换格式档时重置 wr/ar；
 * 做成开关的话打开它卡片会被旧比例压扁。头像形状、部门、主色都不改比例，所以那三条才能做正交配置。
 *
 * 拼音由 `data/person.util` 的 `displayPinyin` 统一算好塞进 view，本组件只管排版——
 * 样式组件认识数据来源的话，换档就得换 input 形状，outlet 的通用契约当场破掉。
 *
 * 同一套缩略图约束：`view` 必须可缺省、内部尺寸一律 cqw、不认祖先选择器。
 */
@Component({
    selector: 'pc-row-pinyin',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    styleUrl: './row-pinyin.card.scss',
    template: `
        <div class="card">
            <img class="card__avatar" [src]="view.avatar" alt="" (error)="fallbackAvatar($event)" />
            <span class="card__col">
                <!-- 姓名与部门同一行：部门开关不许改高度，否则它就该是个格式档而不是开关 -->
                <span class="card__line">
                    <span class="card__name">{{ view.name }}</span>
                    @if (view.desc) {
                        <span class="card__desc">{{ view.desc }}</span>
                    }
                </span>
                <!-- 空拼音（纯符号名之类）整行不出现，不留一道空白：与 desc 同一条「没内容就不留空壳」 -->
                @if (view.pinyin) {
                    <span class="card__pinyin">{{ view.pinyin }}</span>
                }
            </span>
        </div>
    `
})
export class RowPinyinCardComponent {
    /** 缺省画占位：面板 outlet 缩略图时不传任何 input，示例数据只能由组件自己兜。 */
    @Input() view: PersonCardView = PLACEHOLDER_VIEW;
    /** 头像 404 回落默认头像。共用函数，三档各挂一行——写成方法要抄三份。 */
    protected readonly fallbackAvatar = fallbackAvatar;
}
