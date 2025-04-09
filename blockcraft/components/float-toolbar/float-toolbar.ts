import {
  Component,
  ContentChildren,
  ElementRef, EventEmitter,
  HostBinding,
  HostListener,
  Input,
  Output,
  QueryList
} from '@angular/core';
import {BcFloatToolbarItemComponent} from "./float-toolbar-item";

@Component({
  selector: 'bc-float-toolbar',
  template: `
    <div class="bc-float-toolbar__wrapper"
         [attr.data-direction]="direction">
      <ng-content></ng-content>
    </div>
  `,
  standalone: true,
  styles: [`
    .bc-float-toolbar__wrapper {
      background-color: #fff;
      padding: 4px;
      border-radius: 4px;
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);

      &[data-direction="column"] {
        flex-direction: column;

        ::ng-deep {
          bc-float-toolbar-item {
            padding: 4px 8px;
            width: 100%;
            justify-content: flex-start;
          }

          > span.bc-float-toolbar__divider {
            margin: 4px 0;
            display: block;
            flex: 1;
            height: 1px;
            background-color: #e0e0e0;
          }
        }
      }

      &[data-direction="row"] {
        display: flex;
        justify-content: space-between;
        align-items: stretch;
        height: 40px;
        gap: 8px;

        ::ng-deep {
          bc-float-toolbar-item {
            width: 100%;
            justify-content: center;
            padding: 0 4px;
          }

          > span.bc-float-toolbar__divider {
            flex-shrink: 0;
            height: 32px;
            width: 1px;
            background-color: #e0e0e0;
          }
        }
      }

    }
  `]
})
export class BcFloatToolbarComponent {
  @Input()
  @HostBinding('attr.data-direction')
  direction: 'row' | 'column' = 'row'

  @Output()
  onItemClick = new EventEmitter<BcFloatToolbarItemComponent>()

  @ContentChildren(BcFloatToolbarItemComponent)
  items!: QueryList<BcFloatToolbarItemComponent>

  constructor(
    private el: ElementRef<HTMLElement>
  ) {
  }

  ngAfterViewInit() {
  }

  @HostListener('mousedown', ['$event'])
  onMouseDown(event: MouseEvent) {
    event.stopPropagation()
    event.preventDefault()
    const target = event.target as Node | null
    if (!target) return
    const targetEle = target instanceof HTMLElement ? target : target.parentElement!
    const closetItem = targetEle.closest('bc-float-toolbar-item')
    if (!closetItem) return
    const item = this.items.find(i => i.hostEle === closetItem)
    if (!item) return
    this.onItemClick.emit(item)
  }
}
