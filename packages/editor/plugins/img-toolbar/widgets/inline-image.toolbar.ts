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

@Component({
  selector: 'bc-inline-image-toolbar',
  template: `
    <bc-float-toolbar (onItemClick)="onItemClicked.emit($event)">
      <span class="bc-inline-image-toolbar__size">{{width}} × {{height}}</span>
      <span class="bc-float-toolbar__divider"></span>
      <bc-float-toolbar-item
        icon="bc_qiehuan"
        name="block"
        nz-tooltip="转为图片块" />
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

  @Output()
  readonly onItemClicked = new EventEmitter<BcFloatToolbarItemComponent>();
}
