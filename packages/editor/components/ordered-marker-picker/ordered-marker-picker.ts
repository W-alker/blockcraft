import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core'
import {CsTooltipDirective} from '@cses/ui'
import {
  ORDERED_MARKER_STYLES,
  OrderedMarkerStyleId,
} from '../../blocks/ordered-block'

/** Word-like numbering library used by the fixed toolbar's split-button panel. */
@Component({
  selector: 'bc-ordered-marker-picker',
  standalone: true,
  imports: [CsTooltipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.embedded]': 'embedded',
    '(mousedown)': 'onMouseDown($event)',
  },
  template: `
    <div class="ordered-marker-picker" role="group" aria-label="编号样式">
      <div class="ordered-marker-picker__title">编号库</div>
      <button type="button"
              class="ordered-marker-picker__auto"
              [class.is-active]="current === null"
              (click)="select(null)">
        <span class="ordered-marker-picker__auto-preview">1.&nbsp;&nbsp; a.&nbsp;&nbsp; I.</span>
        <span>按层级自动编号</span>
      </button>
      <div class="ordered-marker-picker__grid">
        @for (style of styles; track style.id) {
          <button type="button"
                  class="ordered-marker-picker__option"
                  [class.is-active]="current === style.id"
                  [csTooltip]="style.label"
                  [attr.aria-label]="style.label"
                  (click)="select(style.id)">
            @for (preview of style.preview; track $index) {
              <span class="ordered-marker-picker__preview-row">
                <span class="ordered-marker-picker__marker"
                      [attr.data-bc-marker-enclosure]="style.enclosure">{{ preview }}</span>
                <span class="ordered-marker-picker__line"></span>
              </span>
            }
          </button>
        }
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .ordered-marker-picker {
      box-sizing: border-box;
      width: 250px;
      padding: 8px;
      border: 1px solid var(--bc-float-toolbar-divider-color);
      border-radius: 8px;
      background: var(--bc-float-toolbar-bg);
      color: var(--bc-float-toolbar-item-color);
      box-shadow: var(--bc-float-toolbar-shadow);
    }

    :host.embedded .ordered-marker-picker {
      width: 234px;
      padding: 0 0 8px;
      border: 0;
      border-bottom: 1px solid var(--bc-float-toolbar-divider-color);
      border-radius: 0;
      box-shadow: none;
    }

    .ordered-marker-picker__title {
      margin-bottom: 6px;
      font-size: 12px;
      line-height: 18px;
      color: var(--bc-float-toolbar-item-color);
    }

    .ordered-marker-picker__auto {
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      margin-bottom: 6px;
      padding: 5px 7px;
      border: 1px solid var(--bc-float-toolbar-divider-color);
      border-radius: 6px;
      background: transparent;
      color: inherit;
      cursor: pointer;
      font-size: 12px;
    }

    .ordered-marker-picker__auto-preview {
      color: var(--bc-active-color);
      font-variant-numeric: tabular-nums;
    }

    .ordered-marker-picker__grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 5px;
    }

    .ordered-marker-picker__option {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
      min-height: 50px;
      padding: 5px;
      border: 1px solid var(--bc-float-toolbar-divider-color);
      border-radius: 6px;
      background: transparent;
      color: inherit;
      cursor: pointer;
    }

    .ordered-marker-picker__auto:hover,
    .ordered-marker-picker__option:hover {
      background: var(--bc-float-toolbar-item-hover-bg);
    }

    .ordered-marker-picker__auto.is-active,
    .ordered-marker-picker__option.is-active {
      border-color: var(--bc-active-color);
      background: var(--bc-float-toolbar-item-active-bg);
    }

    .ordered-marker-picker__preview-row {
      display: flex;
      align-items: center;
      gap: 3px;
      height: 10px;
    }

    .ordered-marker-picker__marker {
      flex: 0 0 20px;
      overflow: visible;
      color: var(--bc-active-color);
      font-size: 9px;
      line-height: 1;
      text-align: left;
      white-space: nowrap;
    }

    .ordered-marker-picker__marker[data-bc-marker-enclosure="circle"] {
      box-sizing: border-box;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-basis: 12px;
      width: 12px;
      height: 12px;
      margin-right: 8px;
      border: 1px solid currentColor;
      border-radius: 50%;
    }

    .ordered-marker-picker__line {
      flex: 1 1 auto;
      min-width: 0;
      height: 1px;
      background: var(--bc-float-toolbar-divider-color);
    }
  `],
})
export class BcOrderedMarkerPickerComponent {
  /** null = legacy automatic depth cycle; undefined = mixed/not applicable. */
  @Input() current: OrderedMarkerStyleId | null | undefined = undefined
  @Input() embedded = false
  @Output() pick = new EventEmitter<OrderedMarkerStyleId | null>()

  protected readonly styles = ORDERED_MARKER_STYLES

  protected select(style: OrderedMarkerStyleId | null) {
    this.pick.emit(style)
  }

  protected onMouseDown(event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
  }
}
