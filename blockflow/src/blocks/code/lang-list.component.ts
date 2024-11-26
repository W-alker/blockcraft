import {ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, EventEmitter, Output} from "@angular/core";
import {LANGUAGE_LIST} from "./const";
import {NgForOf} from "@angular/common";
import {IModeItem} from "./type";

@Component({
  selector: 'lang-list',
  template: `
    <input (input)="onSearch($event)" />
    @for (item of languageList; track item.name) {
      <div class="lang-list_item"
           (click)="langChange.emit(item)">
        {{ item.name }}
      </div>
    }
  `,
  styles: [`
    :host {
      background-color: #fff;
      border: 1px solid #f5f2f0;
      border-radius: 4px;
      padding: 4px;

      > input {
        margin: 0 auto 4px;
        width: 120px;
        height: calc(var(--bf-lh) * 1.5);
        line-height: calc(var(--bf-lh) * 1.5);
        font-size: var(--bf-fs);
        border: 1px solid #f5f2f0;
        border-radius: 4px;
        padding: 0 4px;
      }

      .lang-list_item {
        padding: 0 4px;
        height: calc(var(--bf-lh) * 1.5);
        line-height: calc(var(--bf-lh) * 1.5);
        text-align: center;
        font-size: calc(var(--bf-fs) * .8);
        color: #999;
        cursor: pointer;
        border-radius: 4px;

        &:hover {
          background-color: rgba(153, 153, 153, .1);
        }
      }
    }
  `],
  imports: [
    NgForOf,
  ],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LangListComponent {
  @Output() langChange = new EventEmitter<IModeItem>();

  protected languageList = LANGUAGE_LIST;

  constructor(
    private cdr: ChangeDetectorRef,
    public readonly destroyRef: DestroyRef
  ) {
  }

  onSearch(e: Event) {
    const v = (e.target as HTMLInputElement).value;
    if(!v) this.languageList = LANGUAGE_LIST;
    else this.languageList = LANGUAGE_LIST.filter(item => item.value.includes(v) || item.name.includes(v));
    this.cdr.markForCheck();
  }
}
