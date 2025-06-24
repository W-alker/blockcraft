import {ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, Output} from "@angular/core";
import {BcFloatToolbarComponent, BcFloatToolbarItemComponent} from "../../../components";
import {nextTick} from "../../../global";

const ORDER_MODE_LIST = [
  {
    name: 'continue',
    value: 'continue',
    label: '继续编号'
  },
  {
    name: 'reset',
    value: 'reset',
    label: '重新编号'
  },
  {
    name: 'recalculate',
    value: 'recalculate',
    label: '重新计算'
  }
]

@Component({
  selector: "ordered-prefix-toolbar",
  template: `
    <bc-float-toolbar direction="column" (onItemClick)="onItemClicked($event)">
      @for (item of ORDER_MODE_LIST; track item.value) {
        <bc-float-toolbar-item [name]="item.name" [active]="item.value === activeMode">{{ item.label }}
        </bc-float-toolbar-item>
      }
    </bc-float-toolbar>
  `,
  styles: [`
    bc-float-toolbar bc-float-toolbar-item.active {
      color: #333;
      opacity: .3;
      background: transparent;
    }
  `],
  standalone: true,
  imports: [
    BcFloatToolbarItemComponent,
    BcFloatToolbarComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OrderedPrefixToolbar {
  @Input()
  orderedBlock!: BlockCraft.IBlockComponents['ordered']

  @Output()
  onPropsChanged$ = new EventEmitter<BlockCraft.IBlockComponents['ordered']['props']>()

  protected ORDER_MODE_LIST = ORDER_MODE_LIST

  protected activeMode = 'continue'

  constructor(
    private cdr: ChangeDetectorRef
  ) {
  }

  ngOnInit() {
    this.checkMode()
  }

  checkMode() {
    this.activeMode = typeof this.orderedBlock.props.start === 'number' ? 'reset' : 'continue'
    this.cdr.markForCheck()
  }

  onItemClicked($event: BcFloatToolbarItemComponent) {
    if (this.activeMode === $event.name) return
    console.log($event.name)
    switch ($event.name) {
      case 'recalculate':
        break
      case 'reset':
        this.orderedBlock.updateProps({
          start: 1,
          order: 0
        })
        break
      case 'continue':
        this.orderedBlock.updateProps({
          start: null
        })
        break
    }
    nextTick().then(() => {
      this.checkMode()
      this.onPropsChanged$.emit(this.orderedBlock.props)
    })
  }
}
