import {ChangeDetectionStrategy, Component, EventEmitter, Input, Output} from '@angular/core'
import {CsTooltipDirective} from '@cses/ui'

/** 分栏私有操作浮层；沿用表格结构工具栏的图标、尺寸和主题。 */
@Component({
  selector: 'bc-columns-toolbar',
  standalone: true,
  imports: [CsTooltipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'toolbar',
    'aria-label': '分栏操作',
    contenteditable: 'false',
    'data-bc-selection-interaction-ignore': '',
    '(mousedown)': '$event.preventDefault(); $event.stopPropagation()',
  },
  template: `
    <span class="context">第 {{ index + 1 }} 栏</span>
    <span class="divider"></span>
    <button type="button" aria-label="在左侧插入栏" csTooltip="在左侧插入栏"
            [disabled]="count >= 8" (click)="insert.emit('before')">
      <i class="bc_icon bc_zuojiantou-jia" aria-hidden="true"></i>
    </button>
    <button type="button" aria-label="在右侧插入栏" csTooltip="在右侧插入栏"
            [disabled]="count >= 8" (click)="insert.emit('after')">
      <i class="bc_icon bc_youjiantou-jia" aria-hidden="true"></i>
    </button>
    <span class="divider"></span>
    <button type="button" aria-label="取消分栏" csTooltip="取消分栏，按从左到右的顺序保留内容"
            [disabled]="!canDissolve" (click)="dissolve.emit()">
      <i class="bc_icon bc_fenlan" aria-hidden="true"></i><span>取消分栏</span>
    </button>
  `,
  styles: [`
    :host {
      display: inline-flex;
      align-items: center;
      gap: var(--bc-padding-sm);
      padding: var(--bc-padding-sm);
      border: 1px solid var(--bc-float-toolbar-divider-color);
      border-radius: var(--bc-radius-lg);
      background: var(--bc-float-toolbar-bg);
      color: var(--bc-float-toolbar-item-color);
      box-shadow: var(--bc-float-toolbar-shadow);
      font-size: var(--bc-fs-sm);
      white-space: nowrap;
    }
    .context { padding: 0 var(--bc-padding-sm); color: var(--bc-color-light); }
    .divider { width: 1px; height: 20px; background: var(--bc-float-toolbar-divider-color); }
    button {
      display: inline-flex; align-items: center; justify-content: center;
      height: 32px; min-width: 32px; padding: 0 var(--bc-padding-md);
      gap: var(--bc-padding-sm); border: 0; border-radius: var(--bc-radius-md);
      background: transparent; color: inherit; font: inherit; cursor: pointer;
    }
    button:hover:not(:disabled), button:focus-visible { background: var(--bc-float-toolbar-item-active-bg); }
    button:focus-visible { outline: 2px solid var(--bc-active-color); outline-offset: -2px; }
    button:disabled { opacity: .4; cursor: default; }
    i { font-size: var(--bc-fs); }
  `],
})
export class ColumnsToolbarComponent {
  @Input() count = 2
  @Input() index = 0
  @Input() canDissolve = true
  @Output() readonly insert = new EventEmitter<'before' | 'after'>()
  @Output() readonly dissolve = new EventEmitter<void>()
}
