import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import {NzTooltipDirective} from 'ng-zorro-antd/tooltip';
import {
  BcFloatToolbarComponent,
  BcFloatToolbarItemComponent,
} from '../../../components';
import {
  BLOCK_OBJECT_LAYOUT_OPTIONS,
  InlineImageWrapSide,
} from '../../../framework';

export type InlineImageToolbarLayout = 'inline' | 'wrap';

const INLINE_IMAGE_LAYOUT_OPTIONS = [
  BLOCK_OBJECT_LAYOUT_OPTIONS[0],
  {
    value: 'wrap',
    label: '四周型环绕',
    icon: 'bc_sizhouhuanrao',
  },
  ...BLOCK_OBJECT_LAYOUT_OPTIONS.slice(1),
] as const;

const INLINE_IMAGE_WRAP_SIDE_OPTIONS: readonly {
  value: InlineImageWrapSide
  label: string
  icon: string
}[] = [
  {
    value: 'auto',
    label: '较宽一侧',
    icon: 'bc_duiqifangshi',
  },
  {
    value: 'left',
    label: '文字在左',
    icon: 'bc_tupianjuyou',
  },
  {
    value: 'right',
    label: '文字在右',
    icon: 'bc_tupianjuzuo',
  },
] as const;

@Component({
  selector: 'bc-inline-image-toolbar',
  template: `
    <bc-float-toolbar (onItemClick)="onItemClicked.emit($event)">
      <span class="bc-inline-image-toolbar__size">{{width}} × {{height}}</span>
      <span class="bc-float-toolbar__divider"></span>
      @for (item of LAYOUT_OPTIONS; track item.value) {
        <bc-float-toolbar-item
          [icon]="item.icon"
          name="object-layout"
          [value]="item.value"
          [nz-tooltip]="item.label"
          [active]="item.value === layout" />
      }
      @if (layout === 'wrap') {
        <span class="bc-float-toolbar__divider"></span>
        @for (item of WRAP_SIDE_OPTIONS; track item.value) {
          <bc-float-toolbar-item
            [icon]="item.icon"
            name="inline-wrap-side"
            [value]="item.value"
            [nz-tooltip]="item.label"
            [active]="item.value === side" />
        }
      }
    </bc-float-toolbar>
  `,
  styles: [`
    .bc-inline-image-toolbar__size {
      display: inline-flex;
      align-items: center;
      padding: 0 8px;
      color: var(--bc-color-secondary, #666);
      font-size: 12px;
      white-space: nowrap;
    }
  `],
  imports: [
    BcFloatToolbarComponent,
    BcFloatToolbarItemComponent,
    NzTooltipDirective,
  ],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InlineImageToolbar {
  @Input({required: true}) width = 0;
  @Input({required: true}) height = 0;
  @Input() layout: InlineImageToolbarLayout = 'inline';
  @Input() side: InlineImageWrapSide = 'auto';

  @Output()
  readonly onItemClicked = new EventEmitter<BcFloatToolbarItemComponent>();

  protected readonly LAYOUT_OPTIONS = INLINE_IMAGE_LAYOUT_OPTIONS;
  protected readonly WRAP_SIDE_OPTIONS = INLINE_IMAGE_WRAP_SIDE_OPTIONS;
}
