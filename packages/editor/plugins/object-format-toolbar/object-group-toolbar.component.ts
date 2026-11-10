import {FloatingToolbarComponent, FloatingToolbarState} from '../../components/floating-toolbar';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from "@angular/core";
import { CsButtonComponent, CsTooltipDirective } from "@cses/ui";
import {
  BLOCK_OBJECT_LAYOUT_OPTIONS,
  type BlockObjectAlignment,
  type BlockObjectBlockLayout,
} from "../../framework";

import {OBJECT_FORMAT_POPUP_STYLES, ObjectFormatPopupState} from "./object-format-popup";

export type ObjectGroupToolbarMode = "group" | "ungroup";
export type ObjectGroupToolbarAction =
  | ObjectGroupToolbarMode
  | BlockObjectAlignment
  | "move-forward"
  | "move-backward"
  | { name: "object-layout"; value: BlockObjectBlockLayout };

const GROUP_LAYOUT_ITEMS = BLOCK_OBJECT_LAYOUT_OPTIONS.filter(
  (item): item is typeof item & { value: BlockObjectBlockLayout } =>
    item.value !== "inline",
);

const ALIGNMENT_ITEMS: readonly {
  value: BlockObjectAlignment;
  label: string;
  icon: string;
  distribution?: boolean;
}[] = [
  { value: "left", label: "左对齐", icon: "bc_align2left" },
  {
    value: "horizontal-center",
    label: "水平居中",
    icon: "bc_align2center",
  },
  { value: "right", label: "右对齐", icon: "bc_align2right" },
  { value: "top", label: "顶端对齐", icon: "bc_align2top" },
  {
    value: "vertical-center",
    label: "垂直居中",
    icon: "bc_align2middle",
  },
  { value: "bottom", label: "底端对齐", icon: "bc_align2bottom" },
  { value: "center", label: "中心对齐", icon: "bc_zhongxinduiqi" },
  {
    value: "horizontal-distribute",
    label: "横向分布",
    icon: "bc_hengxiangfenbu",
    distribution: true,
  },
  {
    value: "vertical-distribute",
    label: "纵向分布",
    icon: "bc_zongxiangfenbu",
    distribution: true,
  },
];

/** Group settings rail and multi-selection commands, hosted by the unified plugin. */
@Component({
  selector: "bc-object-group-toolbar",
  standalone: true,
  imports: [CsButtonComponent, CsTooltipDirective, FloatingToolbarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <bc-floating-toolbar [state]="toolbarState" [side]="side" [constrainHeight]="true" label="组合工具栏" (collapsedChange)="popup.close()">
    @if (!toolbarState.collapsed()) {
    @if (mode === "ungroup") {
      <div class="object-format" [class.object-format--left]="side === 'left'" contenteditable="false" data-bc-group-format-toolbar>
        <nav class="object-format__rail" aria-label="组合快捷工具">
          <button cs-button csType="text" csSize="sm" type="button"
            [class.active]="popup.activePanel === 'layout'"
            [attr.aria-expanded]="popup.activePanel === 'layout'"
            aria-label="布局" csTooltip="布局" [csTooltipDisabled]="!!popup.activePanel"
            csTooltipPlacement="left" (click)="popup.toggle('layout')">
            <i class="bc_icon bc_buju" aria-hidden="true"></i>
          </button>
          @if (canUngroup) {
          <button type="button"
            aria-label="解除组合" csTooltip="解除组合" [csTooltipDisabled]="!!popup.activePanel"
            csTooltipPlacement="left" (click)="action.emit('ungroup')">
            <i class="bc_icon bc_quxiaozuhe" aria-hidden="true"></i>
          </button>
          }
        </nav>
        @if (popup.activePanel === 'layout') {
          <aside class="object-format__panel object-layout-panel" aria-label="组合布局">
            <div class="object-format__scroll">
              <div class="object-layout-list">
                @for (item of layoutItems; track item.value) {
                  <button cs-button csType="text" csSize="sm" type="button"
                    class="object-layout-option" [class.active]="objectLayout === item.value"
                    [attr.aria-pressed]="objectLayout === item.value" [attr.aria-label]="item.label"
                    (click)="action.emit({ name: 'object-layout', value: item.value })">
                    <i [attr.class]="'bc_icon ' + item.icon" aria-hidden="true"></i>
                    <span>{{ item.label }}</span>
                    @if (objectLayout === item.value) {<i class="bc_icon bc_xuanzhong object-layout-option__check" aria-hidden="true"></i>}
                  </button>
                }
              </div>
              <div class="object-layout-tools">
                <button type="button" class="object-layout-action"
                  aria-label="上移一层" [disabled]="!canMoveForward" (click)="action.emit('move-forward')">
                  <i class="bc_icon bc_cengji-shangyi" aria-hidden="true"></i><span>上移一层</span>
                </button>
                <button type="button" class="object-layout-action"
                  aria-label="下移一层" [disabled]="!canMoveBackward" (click)="action.emit('move-backward')">
                  <i class="bc_icon bc_cengji-xiayi" aria-hidden="true"></i><span>下移一层</span>
                </button>
              </div>
            </div>
          </aside>
        }
      </div>
    } @else {
      <div class="object-group-toolbar" contenteditable="false">
        @for (item of alignmentItems; track item.value) {
          <button type="button" class="object-group-toolbar__icon-button" [csTooltip]="item.label"
            [attr.aria-label]="item.label" [disabled]="item.distribution && !canDistribute" (click)="action.emit(item.value)">
            <i [attr.class]="'bc_icon ' + item.icon" aria-hidden="true"></i>
          </button>
        }
        <span class="object-group-toolbar__divider"></span>
        <button type="button" aria-label="组合" [disabled]="!canGroup" (click)="action.emit('group')">
          <i class="bc_icon bc_combination" aria-hidden="true"></i><span>组合</span>
        </button>
      </div>
    }
    }
    </bc-floating-toolbar>
  `,
  styles: `${OBJECT_FORMAT_POPUP_STYLES}

    .object-group-toolbar {
      display: flex;
      align-items: center;
      min-height: 34px;
      max-width:100%;
      max-height:var(--bc-floating-toolbar-content-height,none);
      overflow:auto;
      padding: 3px 5px;
      border: 1px solid var(--bc-border-color, #e2e8f0);
      border-radius: 10px;
      background: var(--bc-bg-primary, #fff);
      box-shadow: var(--bc-shadow-md, 0 8px 24px rgba(15, 23, 42, 0.14));
      color: var(--bc-color, #1f2937);
      font-size: 12px;
      white-space: nowrap;
    }
    .object-group-toolbar button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      box-sizing: border-box;
      height: 26px;
      padding: 0 10px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: inherit;
      cursor: pointer;
    }
    .object-group-toolbar button:hover {
      background: var(--bc-bg-hover, #f1f5f9);
    }
    .object-group-toolbar .object-group-toolbar__icon-button {
      width: 26px;
      padding: 0;
    }
    .object-group-toolbar button:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    @media(pointer:coarse) {
      .object-group-toolbar button {min-height:34px}
      .object-group-toolbar .object-group-toolbar__icon-button {width:34px}
    }
    .object-group-toolbar__divider {
      width: 1px;
      height: 18px;
      margin: 0 3px;
      background: var(--bc-border-color, #e2e8f0);
    }
    /* Keep guarded commands native: CsButton's loading host binding clears disabled. */
    [data-bc-group-format-toolbar] button:not([cs-button]){box-sizing:border-box;border:0;border-radius:6px;background:transparent;color:inherit;font:inherit;cursor:pointer}
    [data-bc-group-format-toolbar] button:not([cs-button]):hover:not(:disabled){background:var(--bc-float-toolbar-item-hover-bg,var(--bc-bg-hover,#f1f5f9))}
    [data-bc-group-format-toolbar] button:not([cs-button]):disabled{opacity:.45;cursor:not-allowed}
    [data-bc-group-format-toolbar] button:not([cs-button]):focus-visible{outline:2px solid var(--bc-active-color,#4857e2);outline-offset:1px}

  `,
})
export class ObjectGroupToolbarComponent {
  @Input() toolbarState = new FloatingToolbarState();
  @Input() side: "left" | "right" = "right";
  readonly popup = new ObjectFormatPopupState<"layout">();
  @Output() readonly panelChange = this.popup.panelChange;
  readonly alignmentItems = ALIGNMENT_ITEMS;
  readonly layoutItems = GROUP_LAYOUT_ITEMS;
  @Input({ required: true }) mode: ObjectGroupToolbarMode = "group";
  @Input() objectLayout: BlockObjectBlockLayout = "over";
  @Input() canGroup = false;
  @Input() canUngroup = false;
  @Input() canDistribute = false;
  @Input() canMoveForward = false;
  @Input() canMoveBackward = false;
  @Output() readonly action = new EventEmitter<ObjectGroupToolbarAction>();
}
