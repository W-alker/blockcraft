import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {todayParts, type DateParts} from '../date-card-parts.util';
import {DATE_FORMATS, showsWeek, showsYear} from '../date-card-format.util';

/** pill：与 HTML 选定稿同源；无输入时也能独立用作面板缩略图。 */
@Component({
    selector: 'dc-pill',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    styleUrl: './pill.card.scss',
    template: `
<div class="card"><span class="card__disc"><span class="card__day">{{ parts['DD'] }}</span></span><div class="card__info">
  <div class="card__primary">@if (year) { <span>{{ parts['YYYY'] }} 年 </span> }<span>{{ parts['M'] }} 月</span></div>
  @if (week) { <span class="card__secondary card__week">{{ parts['dddd'] }}</span> }
</div></div>
    `
})
export class PillCardComponent {
    @Input() parts: DateParts = todayParts();
    @Input() format: string = DATE_FORMATS.Full;
    protected get week(): boolean { return showsWeek(this.format); }
    protected get year(): boolean { return showsYear(this.format); }
}
