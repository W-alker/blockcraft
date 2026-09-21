import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {todayParts, type DateParts} from '../date-card-parts.util';
import {DATE_FORMATS, showsWeek, showsYear} from '../date-card-format.util';

/** split：与 HTML 选定稿同源；无输入时也能独立用作面板缩略图。 */
@Component({
    selector: 'dc-split',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    styleUrl: './split.card.scss',
    template: `
<div class="card">
  <div class="card__numbers"><div class="card__column"><span class="card__label card__secondary">MONTH</span><span class="card__primary">{{ parts['MM'] }}</span></div><span class="card__slash" aria-hidden="true"></span><div class="card__column"><span class="card__label card__secondary">DAY</span><span class="card__day">{{ parts['DD'] }}</span></div></div>
  @if (year || week) { <div class="card__footer card__secondary">@if (year) { <span>{{ parts['YYYY'] }}</span> }@if (week) { <span class="card__week">{{ parts['dddd'] }}</span> }</div> }
</div>
    `
})
export class SplitCardComponent {
    @Input() parts: DateParts = todayParts();
    @Input() format: string = DATE_FORMATS.Full;
    protected get week(): boolean { return showsWeek(this.format); }
    protected get year(): boolean { return showsYear(this.format); }
}
