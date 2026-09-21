import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {todayParts, type DateParts} from '../date-card-parts.util';
import {DATE_FORMATS, showsWeek, showsYear} from '../date-card-format.util';

/** bookmark：与 HTML 选定稿同源；无输入时也能独立用作面板缩略图。 */
@Component({
    selector: 'dc-bookmark',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    styleUrl: './bookmark.card.scss',
    template: `
<div class="card"><div class="card__paper">
  <div class="card__primary">@if (year) { <span>{{ parts['YYYY'] }}.</span> }<span>{{ parts['MM'] }}</span></div>
  <div class="card__day">{{ parts['DD'] }}</div>
  @if (week) { <div class="card__secondary card__week">{{ parts['dddd'] }}</div> }
</div></div>
    `
})
export class BookmarkCardComponent {
    @Input() parts: DateParts = todayParts();
    @Input() format: string = DATE_FORMATS.Full;
    protected get week(): boolean { return showsWeek(this.format); }
    protected get year(): boolean { return showsYear(this.format); }
}
