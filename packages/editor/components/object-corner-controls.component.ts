import {ChangeDetectionStrategy, Component, Input} from '@angular/core'

/** 对象的轻量选择入口；边缘移动仍交给 ObjectDragPlugin。 */
@Component({
  selector: 'bc-object-corner-controls',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'contenteditable': 'false',
    'data-bc-print-exclude': 'true',
    'data-bc-selection-interaction-ignore': '',
  },
  template: `
    @if (movable) {
      @for (edge of edges; track edge) {
        <span [attr.data-bc-object-entry-edge]="edge"
          data-bc-object-drag-handle aria-hidden="true"></span>
      }
    }
    <button type="button" data-bc-object-floating-handle data-bc-object-select-handle
      [attr.data-bc-object-drag-handle]="movable ? '' : null"
      [attr.data-bc-nodrag]="movable ? null : ''"
      [attr.aria-label]="'选中' + label + (movable ? '并拖动' : '')"
      [title]="movable ? '选中整块并拖动' : '选中整块'"
      (pointerdown)="pressFloatingHandle($event)"
      (keydown)="$event.stopPropagation()"
      (click)="activateFloatingHandle($event)">
      <i class="bc_icon bc_yidong" aria-hidden="true"></i>
    </button>
  `,
  styles: [`
    :host {
      position: absolute; inset: 0; z-index: 5;
      display: block; opacity: 0; visibility: hidden; pointer-events: none;
      outline: 1px solid color-mix(in srgb, var(--bc-active-color) 35%, transparent);
      outline-offset: -1px;
    }
    [data-bc-object-entry-edge] { position: absolute; pointer-events: auto; cursor: move; touch-action: none; }
    [data-bc-object-entry-edge='north'], [data-bc-object-entry-edge='south'] { left: 12px; right: 12px; height: 8px; }
    [data-bc-object-entry-edge='west'], [data-bc-object-entry-edge='east'] { top: 12px; bottom: 12px; width: 8px; }
    [data-bc-object-entry-edge='north'] { top: -4px; }
    [data-bc-object-entry-edge='south'] { bottom: -4px; }
    [data-bc-object-entry-edge='west'] { left: -4px; }
    [data-bc-object-entry-edge='east'] { right: -4px; }
    button {
      box-sizing: border-box; margin: 0; padding: 0;
      pointer-events: auto;
    }
    [data-bc-object-floating-handle] {
      position: absolute; z-index: 1; top: 0; left: 50%;
      display: inline-flex; align-items: center; justify-content: center;
      width: 24px; height: 14px; transform: translate(-50%, -50%);
      border: 1px solid var(--bc-active-color); border-radius: 7px;
      background: var(--bc-bg-primary); color: var(--bc-active-color);
      cursor: pointer; touch-action: manipulation;
    }
    [data-bc-object-floating-handle][data-bc-object-drag-handle] { cursor: move; touch-action: none; }
    [data-bc-object-floating-handle]:focus-visible { outline: 2px solid var(--bc-active-color); outline-offset: 2px; }
    [data-bc-object-floating-handle] > i {
      flex: 0 0 auto; width: 1em; font-size: 11px; line-height: 1;
      letter-spacing: 0; text-indent: 0; text-align: center;
    }
    [data-bc-object-floating-handle] > i::before { display: block; }
    @media print { :host { display: none !important; } }
  `],
})
export class ObjectCornerControlsComponent {
  @Input({required: true}) block!: BlockCraft.BlockComponent
  @Input() label = '整个对象'
  @Input() movable = false

  protected readonly edges = ['north', 'east', 'south', 'west']
  protected preserveEditingSelection(event: PointerEvent): void {
    if (event.button !== 0 || !event.isPrimary) return
    event.preventDefault()
    event.stopPropagation()
  }

  protected pressFloatingHandle(event: PointerEvent): void {
    if (!this.movable) this.preserveEditingSelection(event)
  }

  protected activateFloatingHandle(event: MouseEvent): void {
    // 可移动对象的指针手势由 ObjectDragPlugin 完整处理，拖动后不能再重选旧落点。
    // 键盘激活不经过 pointerdown；填写区也只需要选择。
    if (!this.movable || event.detail === 0) {
      this.selectObject(event)
    } else {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  protected selectObject(event: MouseEvent): void {
    if (event.button !== 0 || this.block.isReadonly) return
    event.preventDefault()
    event.stopPropagation()
    this.block.doc.selection.selectBlock(this.block)
  }
}
