import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core'
import {CsTooltipDirective} from '@cses/ui'
import {
  BcFloatToolbarComponent,
  BcFloatToolbarItemComponent,
} from '../../components'
import {BLOCK_OBJECT_LAYOUT_OPTIONS} from '../../framework'
import type {InlineObjectWrapSide} from '../../blocks'
export const INLINE_OBJECT_WRAP_LAYOUT_OPTION = {
  value: 'wrap',
  label: '四周型环绕',
  icon: 'bc_tuwenraopai',
} as const

const INLINE_OBJECT_LAYOUT_OPTIONS = [
  BLOCK_OBJECT_LAYOUT_OPTIONS[0],
  INLINE_OBJECT_WRAP_LAYOUT_OPTION,
  ...BLOCK_OBJECT_LAYOUT_OPTIONS.slice(1),
] as const

const INLINE_OBJECT_WRAP_SIDE_OPTIONS: readonly {
  value: InlineObjectWrapSide
  label: string
  icon: string
}[] = [
  {value: 'auto', label: '自动环绕', icon: 'bc_duiqifangshi'},
  {value: 'left', label: '文字在左', icon: 'bc_tupianjuyou'},
  {value: 'right', label: '文字在右', icon: 'bc_tupianjuzuo'},
]

@Component({
  selector: 'bc-inline-object-toolbar',
  standalone: true,
  imports: [
    BcFloatToolbarComponent,
    BcFloatToolbarItemComponent,
    CsTooltipDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <bc-float-toolbar (onItemClick)="onItemClicked.emit($event)">
      <span class="bc-inline-object-toolbar__type">{{label}}</span>
      <span class="bc-float-toolbar__divider"></span>
      @for (item of layoutOptions; track item.value) {
        <bc-float-toolbar-item
          [icon]="item.icon"
          name="object-layout"
          [value]="item.value"
          [csTooltip]="item.label"
          [attr.aria-label]="item.label"
          [active]="item.value === layout" />
      }
      @if (layout === 'wrap') {
        <span class="bc-float-toolbar__divider"></span>
        @for (item of wrapSideOptions; track item.value) {
          <bc-float-toolbar-item
            [icon]="item.icon"
            name="inline-wrap-side"
            [value]="item.value"
            [csTooltip]="item.label"
            [attr.aria-label]="item.label"
            [active]="item.value === side" />
        }
      }
    </bc-float-toolbar>
  `,
  styles: [`
    .bc-inline-object-toolbar__type {
      display: inline-flex;
      align-items: center;
      padding: 0 8px;
      color: var(--bc-color-secondary, #666);
      font-size: 12px;
      white-space: nowrap;
    }
  `],
})
export class InlineObjectToolbarComponent {
  @Input() label = '对象'
  @Input() layout: 'inline' | 'wrap' = 'inline'
  @Input() side: InlineObjectWrapSide = 'auto'

  @Output()
  readonly onItemClicked = new EventEmitter<BcFloatToolbarItemComponent>()

  protected readonly layoutOptions = INLINE_OBJECT_LAYOUT_OPTIONS
  protected readonly wrapSideOptions = INLINE_OBJECT_WRAP_SIDE_OPTIONS
}
