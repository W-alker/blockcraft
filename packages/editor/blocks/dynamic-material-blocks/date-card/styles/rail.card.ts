import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {todayParts, type DateParts} from '../date-card-parts.util';
import {DATE_FORMATS, showsWeek, showsYear} from '../date-card-format.util';
import {monthNameOf} from './month-name';

/** rail：与 HTML 选定稿同源；无输入时也能独立用作面板缩略图。 */
@Component({
    selector: 'dc-rail',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    styleUrl: './rail.card.scss',
    template: `
<div class="card">
  <div class="card__top"><span class="card__day">{{ parts['DD'] }}</span><span class="card__primary">{{ monthName }}</span></div><div class="card__lines" aria-hidden="true"></div>
  @if (year || week) { <div class="card__footer card__secondary">@if (year) { <span>{{ parts['YYYY'] }}</span> }@if (week) { <span class="card__week">{{ parts['dddd'] }}</span> }</div> }
</div>
    `
})
export class RailCardComponent {
    @Input() parts: DateParts = todayParts();
    @Input() format: string = DATE_FORMATS.Full;
    protected get week(): boolean { return showsWeek(this.format); }
    protected get year(): boolean { return showsYear(this.format); }
    protected get monthName(): string { return monthNameOf(this.parts); }
}
