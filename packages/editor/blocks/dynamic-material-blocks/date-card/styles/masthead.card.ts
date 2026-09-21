import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {todayParts, type DateParts} from '../date-card-parts.util';
import {DATE_FORMATS, showsWeek, showsYear} from '../date-card-format.util';
import {monthNameOf} from './month-name';

/** masthead：与 HTML 选定稿同源；无输入时也能独立用作面板缩略图。 */
@Component({
    selector: 'dc-masthead',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    styleUrl: './masthead.card.scss',
    template: `
<div class="card">
  <div class="card__top card__secondary">@if (year) { <span>{{ parts['YYYY'] }}</span> }<span class="card__month-name">{{ monthName }}</span></div>
  <div class="card__main"><span class="card__day">{{ parts['DD'] }}</span><div class="card__side"><span class="card__primary">{{ parts['M'] }}月</span>@if (week) { <span class="card__secondary card__week">{{ parts['dddd'] }}</span> }</div></div>
  <div class="card__footer card__secondary">DAILY RECORD</div>
</div>
    `
})
export class MastheadCardComponent {
    @Input() parts: DateParts = todayParts();
    @Input() format: string = DATE_FORMATS.Full;
    protected get week(): boolean { return showsWeek(this.format); }
    protected get year(): boolean { return showsYear(this.format); }
    protected get monthName(): string { return monthNameOf(this.parts); }
}
