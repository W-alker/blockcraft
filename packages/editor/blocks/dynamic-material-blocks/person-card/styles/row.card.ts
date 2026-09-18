import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {PLACEHOLDER_VIEW, fallbackAvatar, type PersonCardView} from '../person-card-view.util';

/** 排版宽度独立于内容尺度；同一组件也用于配置面板缩略图。 */
@Component({
    selector: 'pc-row',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    styleUrl: './row.card.scss',
    template: `
        <div class="card">
            <img class="card__avatar" [src]="view.avatar" alt="" (error)="fallbackAvatar($event)" />
            <span class="card__col">
                <span class="card__name">{{ view.name }}</span>
                @if (view.desc) { <span class="card__desc">{{ view.desc }}</span> }
            </span>
        </div>
    `
})
export class RowCardComponent {
    @Input() view: PersonCardView = PLACEHOLDER_VIEW;
    protected readonly fallbackAvatar = fallbackAvatar;
}
