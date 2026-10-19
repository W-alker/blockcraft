import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import {CsTooltipDirective} from '@cses/ui';
import {
  BcFloatToolbarComponent,
  BcFloatToolbarItemComponent,
} from '../../../components';
import {
  BLOCK_OBJECT_LAYOUT_OPTIONS,
} from '../../../framework';
import {INLINE_IMAGE_WRAP_LAYOUT_OPTION} from './inline-image-layout-options';

export type InlineImageToolbarLayout = 'inline' | 'wrap';

const INLINE_IMAGE_LAYOUT_OPTIONS = [
  BLOCK_OBJECT_LAYOUT_OPTIONS[0],
  INLINE_IMAGE_WRAP_LAYOUT_OPTION,
  ...BLOCK_OBJECT_LAYOUT_OPTIONS.slice(1),
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
          [csTooltip]="item.label"
          [active]="item.value === layout" />
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
    CsTooltipDirective,
  ],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InlineImageToolbar {
  @Input({required: true}) width = 0;
  @Input({required: true}) height = 0;
  @Input() layout: InlineImageToolbarLayout = 'inline';

  @Output()
  readonly onItemClicked = new EventEmitter<BcFloatToolbarItemComponent>();

  protected readonly LAYOUT_OPTIONS = INLINE_IMAGE_LAYOUT_OPTIONS;
}
