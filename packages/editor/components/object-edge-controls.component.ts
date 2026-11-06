import {ChangeDetectionStrategy, Component, Input} from '@angular/core'

/** 边缘优先的对象入口，指针移动复用 ObjectDragPlugin，不占正文布局。 */
@Component({
  selector: 'bc-object-edge-controls',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'contenteditable': 'false',
    'data-bc-print-exclude': 'true',
    'data-bc-selection-interaction-ignore': '',
    '(dblclick)': '$event.stopPropagation()',
  },
  template: `
    @for (edge of edges; track edge.position) {
      <button type="button" [attr.data-bc-object-entry-edge]="edge.position"
        data-bc-object-drag-handle
        [attr.aria-label]="edge.label + '：选中' + label"
        title="点击选中，拖动移动"
        (keydown)="$event.stopPropagation()"
        (click)="activate($event)"></button>
    }
  `,
  styles: [`
    :host {
      position: absolute; inset: 0; z-index: 5; display: block;
      pointer-events: none; opacity: 0;
      outline: 1px solid color-mix(in srgb, var(--bc-active-color) 55%, transparent);
    }
    :host(:hover), :host(:focus-within) { opacity: 1; }
    button {
      position: absolute; box-sizing: border-box; margin: 0; padding: 0;
      border: 0; background: transparent; outline: none;
      pointer-events: auto; cursor: move; touch-action: none;
    }
    button:focus-visible { background: color-mix(in srgb, var(--bc-active-color) 15%, transparent); }
    [data-bc-object-entry-edge='north'], [data-bc-object-entry-edge='south'] { left: 0; right: 0; height: 8px; }
    [data-bc-object-entry-edge='west'], [data-bc-object-entry-edge='east'] { top: -6px; bottom: -6px; width: 8px; }
    [data-bc-object-entry-edge='north'] { top: -6px; }
    [data-bc-object-entry-edge='south'] { bottom: -6px; }
    [data-bc-object-entry-edge='west'] { left: -6px; }
    [data-bc-object-entry-edge='east'] { right: -6px; }
    @media print { :host { display: none !important; } }
  `],
})
export class ObjectEdgeControlsComponent {
  @Input({required: true}) block!: BlockCraft.BlockComponent
  @Input() label = '形状'

  protected readonly edges = [
    {position: 'north', label: '上边缘'}, {position: 'east', label: '右边缘'},
    {position: 'south', label: '下边缘'}, {position: 'west', label: '左边缘'},
  ]

  protected activate(event: MouseEvent): void {
    event.preventDefault()
    event.stopPropagation()
    // 指针点击/拖动由 ObjectDragPlugin 完成；键盘激活没有 pointerdown。
    if (event.button === 0 && event.detail === 0 && !this.block.isReadonly) {
      this.block.doc.selection.selectBlock(this.block)
    }
  }
}
