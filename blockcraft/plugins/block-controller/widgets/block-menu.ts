import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from "@angular/core";
import { NgComponentOutlet, NgTemplateOutlet } from "@angular/common";
import { BcFloatToolbarComponent, BcFloatToolbarItemComponent, BcOverlayTriggerDirective } from "../../../components";
import {
  BlockMenuActionEvent,
  BlockMenuDropdownItem,
  BlockMenuItem,
  BlockMenuSortAction,
  BlockMenuSortItem,
  BlockMenuSwitchItem
} from "../types";

@Component({
  selector: "bc-block-menu",
  template: `
    <bc-float-toolbar [direction]="direction" [styles]="toolbarStyles">
      <ng-container *ngTemplateOutlet="menuItemsTpl; context: { $implicit: visibleItems, path: [] }"></ng-container>
    </bc-float-toolbar>

    <ng-template #menuItemsTpl let-items let-path="path">
      @for (item of items; track trackByItem($index, item)) {
        @if (item.type === "divider") {
          <span class="bc-float-toolbar__divider"></span>
        } @else if (item.type === "custom") {
          <bc-float-toolbar-item [disabled]="isDisabled(item)">
            <div class="custom-content" (mousedown)="$event.stopPropagation()">
              @if (item.template) {
                <ng-container *ngTemplateOutlet="item.template; context: item.templateContext || {}"></ng-container>
              } @else if (item.component) {
                <ng-container *ngComponentOutlet="item.component; inputs: item.componentInputs || {}"></ng-container>
              } @else if (item.label) {
                <span>{{ item.label }}</span>
              }
            </div>
          </bc-float-toolbar-item>
        } @else if (item.type === "dropdown") {
          <bc-float-toolbar-item [icon]="item.icon" [title]="item.desc || item.label"
                                 [disabled]="isDisabled(item)"
                                 [bcOverlayDisabled]="isDisabled(item)"
                                 [expandable]="true"
                                 [bcOverlayTrigger]="subMenuTpl"
                                 [positions]="item.positions || defaultSubMenuPositions"
                                 [offsetX]="item.offsetX ?? 2">
            <span>{{ item.label }}</span>
          </bc-float-toolbar-item>
          <ng-template #subMenuTpl>
            <bc-float-toolbar direction="column" [styles]="subMenuStyles">
              <ng-container
                *ngTemplateOutlet="menuItemsTpl; context: { $implicit: item.items, path: appendPath(path, item) }"></ng-container>
            </bc-float-toolbar>
          </ng-template>
        } @else if (item.type === "switch") {
          <bc-float-toolbar-item [icon]="item.icon" [title]="item.desc || item.label"
                                 [disabled]="isDisabled(item)"
                                 [active]="item.checked"
                                 (mousedown)="onSwitchItemClick(item, path, $event)">
            <span>{{ item.label }}</span>
            <i class="bc_icon bc_duihao switch-check" [class.checked]="item.checked"></i>
          </bc-float-toolbar-item>
        } @else if (item.type === "sort") {
          <bc-float-toolbar-item class="sort-item" [icon]="item.icon" [title]="item.desc || item.label"
                                 [disabled]="isDisabled(item)">
            <span>{{ item.label }}</span>
            <div class="sort-actions">
              @for (action of item.actions; track action.key) {
                <button type="button" class="sort-action"
                        [class.active]="!!action.active"
                        [class.disabled]="!!action.disabled"
                        [attr.title]="action.label"
                        (mousedown)="onSortActionClick(item, action, path, $event)">
                  @if (action.icon) {
                    <i [class]="['bc_icon', action.icon]"></i>
                  } @else {
                    <span>{{ action.label || action.key }}</span>
                  }
                </button>
              }
            </div>
          </bc-float-toolbar-item>
        } @else {
          <bc-float-toolbar-item [icon]="item.icon" [title]="item.desc || item.label"
                                 [disabled]="isDisabled(item)"
                                 [active]="!!item.active"
                                 (mousedown)="onSimpleItemClick(item, path, $event)">
            <span>{{ item.label }}</span>
          </bc-float-toolbar-item>
        }
      }
    </ng-template>
  `,
  styles: [`
    bc-float-toolbar-item {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 36px;
      padding: 0 8px;
      border-radius: 4px;
      cursor: pointer;
    }

    bc-float-toolbar-item > span {
      font-size: 14px;
      line-height: 20px;
      flex: 1;
    }

    .switch-check {
      color: transparent;
      font-size: 14px;
      transition: color .12s ease-in-out;
    }

    .switch-check.checked {
      color: var(--bc-active-color);
    }

    .sort-item {
      justify-content: space-between;
      gap: 6px;
    }

    .custom-content {
      width: 100%;
    }

    .sort-actions {
      display: inline-flex;
      gap: 2px;
      align-items: center;
    }

    .sort-action {
      border: 0;
      outline: none;
      background: transparent;
      box-shadow: none;
      appearance: none;
      color: var(--bc-color-lighter);
      height: 24px;
      min-width: 24px;
      border-radius: 4px;
      padding: 0 6px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }

    .sort-action:hover {
      background: var(--bc-bg-hover);
    }

    .sort-action.active {
      color: var(--bc-active-color);
    }

    .sort-action.disabled {
      cursor: not-allowed;
      color: var(--bc-color-disabled);
    }

    .sort-action:focus,
    .sort-action:focus-visible {
      outline: none;
      box-shadow: none;
    }
  `],
  imports: [
    BcFloatToolbarComponent,
    BcFloatToolbarItemComponent,
    BcOverlayTriggerDirective,
    NgTemplateOutlet,
    NgComponentOutlet
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BlockMenuComponent {
  @Input()
  items: BlockMenuItem[] = []

  @Input()
  direction: "row" | "column" = "column"

  @Input()
  menuWidth = 224

  @Input()
  styles = ""

  @Input()
  embedded = false

  @Input()
  menuDisabled = false

  @Output()
  itemAction = new EventEmitter<BlockMenuActionEvent>()

  protected readonly defaultSubMenuPositions: BlockMenuDropdownItem["positions"] = ["right-center"]

  get visibleItems() {
    return this.items.filter(item => !item.hidden)
  }

  get toolbarStyles() {
    if (this.styles) return this.styles
    if (this.embedded) {
      return `display: block; width: 100%; box-sizing: border-box; background: transparent; box-shadow: none; border-radius: 0; padding: 0;`
    }
    return `display: block; width: ${this.menuWidth}px;`
  }

  protected isDisabled(item: BlockMenuItem) {
    return this.menuDisabled || !!("disabled" in item && item.disabled)
  }

  get subMenuStyles() {
    return `display: block; width: ${this.menuWidth}px; max-height: 70vh; overflow-y: auto;`
  }

  protected appendPath(path: BlockMenuDropdownItem[], item: BlockMenuDropdownItem) {
    return [...path, item]
  }

  protected trackByItem(index: number, item: BlockMenuItem) {
    return `${item.type}:${item.name}:${index}`
  }

  protected onSimpleItemClick(item: BlockMenuItem,
                              path: BlockMenuDropdownItem[],
                              event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    if (item.type !== "simple") return
    if (this.isDisabled(item)) return
    this.itemAction.emit({
      item,
      path,
      source: "simple"
    })
  }

  protected onSwitchItemClick(item: BlockMenuSwitchItem, path: BlockMenuDropdownItem[], event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    if (this.isDisabled(item)) return
    this.itemAction.emit({
      item,
      path,
      source: "switch",
      checked: !item.checked
    })
  }

  protected onSortActionClick(item: BlockMenuSortItem,
                              action: BlockMenuSortAction,
                              path: BlockMenuDropdownItem[],
                              event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    if (this.isDisabled(item) || action.disabled) return
    this.itemAction.emit({
      item,
      path,
      source: "sort",
      sortAction: action
    })
  }
}
