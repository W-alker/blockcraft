import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core'
import {CsTooltipDirective} from '@cses/ui'
import {
  SHAPE_CATEGORIES,
  ShapeIconComponent,
  type ShapeKind,
} from '../../blocks/shape-block'

@Component({
  selector: 'bc-shape-picker',
  standalone: true,
  imports: [ShapeIconComponent, CsTooltipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.shape-picker-host--embedded]': 'embedded',
  },
  template: `
    <div class="shape-picker" role="menu" [attr.aria-label]="ariaLabel">
      @for (category of categories; track category.id) {
        <section
          class="shape-picker__category"
          [attr.aria-label]="category.label">
          <h3 class="shape-picker__category-title">
            {{ category.label }}
          </h3>
          <div class="shape-picker__grid">
            @for (definition of category.definitions; track definition.type) {
              <button
                type="button"
                class="shape-picker__item"
                role="menuitemradio"
                [class.active]="current === definition.type"
                [attr.aria-checked]="current === definition.type"
                [attr.data-shape-type]="definition.type"
                [attr.aria-label]="definition.label"
                [csTooltip]="definition.label"
                (mousedown)="preserveSelection($event)"
                (click)="pick.emit(definition.type)">
                <bc-shape-icon
                  [path]="definition.path"
                  [detailPath]="definition.detailPath">
                </bc-shape-icon>
              </button>
            }
          </div>
        </section>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      max-width: calc(100vw - 24px);
    }

    :host(.shape-picker-host--embedded) {
      max-width: none;
    }

    :host(.shape-picker-host--embedded) .shape-picker {
      width: auto;
      max-height: 300px;
      padding: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
    }

    .shape-picker {
      box-sizing: border-box;
      width: min(320px, calc(100vw - 16px));
      max-height: min(460px, calc(100vh - 24px));
      padding: 6px;
      overflow: auto;
      overscroll-behavior: contain;
      border: 1px solid var(--bc-float-toolbar-divider-color);
      border-radius: 8px;
      background: var(--bc-float-toolbar-bg);
      box-shadow: var(
        --bc-fixed-toolbar-shadow,
        0 6px 16px rgba(15, 15, 15, 0.08)
      );
    }

    .shape-picker__category + .shape-picker__category {
      margin-top: 5px;
    }

    .shape-picker__category-title {
      position: sticky;
      top: -6px;
      z-index: 1;
      margin: 0 0 2px;
      padding: 2px 1px 1px;
      background: var(--bc-float-toolbar-bg);
      color: var(--bc-color-secondary, #64748b);
      font-size: 9px;
      font-weight: 600;
      line-height: 14px;
    }

    .shape-picker__grid {
      display: grid;
      grid-template-columns: repeat(9, minmax(0, 1fr));
      gap: 2px;
    }

    .shape-picker__item {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      aspect-ratio: 1;
      min-height: 32px;
      padding: 3px;
      border: 1px solid transparent;
      border-radius: 6px;
      background: transparent;
      color: var(--bc-float-toolbar-item-color);
      cursor: pointer;
    }

    .shape-picker__item:hover,
    .shape-picker__item:focus-visible {
      background: var(--bc-float-toolbar-item-hover-bg);
      outline: none;
    }

    .shape-picker__item.active {
      border-color: var(--bc-active-color);
      background: var(--bc-float-toolbar-item-active-bg);
      color: var(--bc-active-color);
    }

    .shape-picker__item > bc-shape-icon {
      width: 18px;
      height: 18px;
    }
  `],
})
export class ShapePickerComponent {
  /** Removes standalone popup chrome when hosted inside a settings panel. */
  @Input()
  embedded = false

  @Input()
  current?: ShapeKind

  @Input()
  ariaLabel = '选择形状'

  /** Hides line/connectors that cannot own a text frame. */
  @Input()
  supportsTextOnly = false

  @Output()
  readonly pick = new EventEmitter<ShapeKind>()

  protected get categories() {
    if (!this.supportsTextOnly) return SHAPE_CATEGORIES
    return SHAPE_CATEGORIES
      .map(category => ({
        ...category,
        definitions: category.definitions.filter(
          definition => definition.supportsText !== false,
        ),
      }))
      .filter(category => category.definitions.length > 0)
  }

  protected preserveSelection(event: MouseEvent): void {
    event.preventDefault()
    event.stopPropagation()
  }
}
