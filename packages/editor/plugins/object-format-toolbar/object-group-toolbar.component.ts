import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from "@angular/core";
import { CsTooltipDirective } from "@cses/ui";
import {
  BLOCK_OBJECT_LAYOUT_OPTIONS,
  type BlockObjectAlignment,
  type BlockObjectBlockLayout,
} from "../../framework";

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

/** Restored compact group toolbar surface, hosted by the unified plugin. */
@Component({
  selector: "bc-object-group-toolbar",
  standalone: true,
  imports: [CsTooltipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="object-group-toolbar" contenteditable="false">
      @if (mode === "group") {
        @for (item of alignmentItems; track item.value) {
          <button
            type="button"
            class="object-group-toolbar__icon-button"
            [csTooltip]="item.label"
            [attr.aria-label]="item.label"
            [disabled]="item.distribution && !canDistribute"
            (click)="action.emit(item.value)"
          >
            <i [attr.class]="'bc_icon ' + item.icon"></i>
          </button>
        }
        <span class="object-group-toolbar__divider"></span>
      }
      @if (mode === "ungroup") {
        @for (item of layoutItems; track item.value) {
          <button
            type="button"
            class="object-group-toolbar__icon-button"
            [class.object-group-toolbar__icon-button--active]="
              objectLayout === item.value
            "
            [csTooltip]="item.label"
            [attr.aria-label]="item.label"
            [attr.aria-pressed]="objectLayout === item.value"
            (click)="action.emit({ name: 'object-layout', value: item.value })"
          >
            <i [attr.class]="'bc_icon ' + item.icon"></i>
          </button>
        }
        <span class="object-group-toolbar__divider"></span>
        <button
          type="button"
          csTooltip="上移一层"
          aria-label="上移一层"
          [disabled]="!canMoveForward"
          (click)="action.emit('move-forward')"
        >
          <i class="bc_icon bc_cengji-shangyi"></i>
        </button>
        <button
          type="button"
          csTooltip="下移一层"
          aria-label="下移一层"
          [disabled]="!canMoveBackward"
          (click)="action.emit('move-backward')"
        >
          <i class="bc_icon bc_cengji-xiayi"></i>
        </button>
        <span class="object-group-toolbar__divider"></span>
      }
      <button
        type="button"
        [csTooltip]="mode === 'group' ? '组合' : '取消组合'"
        [attr.aria-label]="mode === 'group' ? '组合' : '取消组合'"
        [disabled]="mode === 'group' ? !canGroup : !canUngroup"
        (click)="action.emit(mode)"
      >
        <i
          class="bc_icon"
          [class.bc_combination]="mode === 'group'"
          [class.bc_quxiaozuhe]="mode === 'ungroup'"
        ></i>
        <span>{{ mode === "group" ? "组合" : "取消组合" }}</span>
      </button>
    </div>
  `,
  styles: `
    .object-group-toolbar {
      display: flex;
      align-items: center;
      min-height: 42px;
      padding: 5px 7px;
      border: 1px solid var(--bc-border-color, #e2e8f0);
      border-radius: 10px;
      background: var(--bc-bg-primary, #fff);
      box-shadow: var(--bc-shadow-md, 0 8px 24px rgba(15, 23, 42, 0.14));
      color: var(--bc-color, #1f2937);
      font-size: 12px;
      white-space: nowrap;
    }
    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      box-sizing: border-box;
      height: 30px;
      padding: 0 10px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: inherit;
      cursor: pointer;
    }
    button:hover {
      background: var(--bc-bg-hover, #f1f5f9);
    }
    .object-group-toolbar__icon-button {
      width: 30px;
      padding: 0;
    }
    .object-group-toolbar__icon-button--active {
      background: var(
        --bc-bg-active,
        color-mix(in srgb, var(--bc-active-color, #4857e2) 12%, transparent)
      );
      color: var(--bc-active-color, #4857e2);
    }
    button:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    .object-group-toolbar__divider {
      width: 1px;
      height: 22px;
      margin: 0 3px;
      background: var(--bc-border-color, #e2e8f0);
    }
  `,
})
export class ObjectGroupToolbarComponent {
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
