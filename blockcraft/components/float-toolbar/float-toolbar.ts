import {
  ChangeDetectionStrategy,
  Component,
  ContentChildren,
  ElementRef,
  EventEmitter,
  HostBinding,
  HostListener,
  Input,
  Output,
  QueryList
} from '@angular/core';
import { BcFloatToolbarItemComponent } from "./float-toolbar-item";

@Component({
  selector: 'bc-float-toolbar',
  template: `
    <div class="bc-float-toolbar__wrapper" [style]="styles"
         [attr.data-direction]="direction">
      <ng-content></ng-content>
    </div>
  `,
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.padding.px]': 'gapAround'
  }
})
export class BcFloatToolbarComponent {
  @Input()
  gapAround = 0

  @Input()
  @HostBinding('attr.data-direction')
  direction: 'row' | 'column' = 'row'

  @Input()
  styles: string = ''

  @Input()
  @HostBinding('class')
  theme: string = 'light'

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

  timestamp: number = 0

  @HostListener('mousedown', ['$event'])
  onMouseDown(event: MouseEvent) {
    event.stopPropagation()
    event.preventDefault()

    if (event.timeStamp - this.timestamp < 100) return;
    this.timestamp = event.timeStamp

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
