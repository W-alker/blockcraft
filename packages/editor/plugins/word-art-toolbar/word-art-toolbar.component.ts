import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  Output,
} from "@angular/core";
import { NzTooltipDirective } from "ng-zorro-antd/tooltip";
import {
  BLOCK_OBJECT_LAYOUT_OPTIONS,
  type BlockObjectBlockLayout,
} from "../../framework";
import {
  BcFloatToolbarComponent,
  BcFloatToolbarItemComponent,
  BcOverlayTriggerDirective,
} from "../../components";
import {
  type WordArtBlockProps,
  type WordArtEffect,
  type WordArtFillType,
  type WordArtHorizontalAlign,
  type WordArtVerticalAlign,
} from "../../blocks/word-art-block";

export type WordArtToolbarAction =
  | { name: "update-props"; value: Partial<WordArtBlockProps> }
  | { name: "object-layout"; value: BlockObjectBlockLayout }
  | { name: "move-forward" }
  | { name: "move-backward" }
  | { name: "delete" };

@Component({
  selector: "bc-word-art-toolbar",
  standalone: true,
  imports: [
    BcFloatToolbarComponent,
    BcFloatToolbarItemComponent,
    BcOverlayTriggerDirective,
    NzTooltipDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="word-art-toolbar" contenteditable="false">
      <label class="word-art-toolbar__field word-art-toolbar__field--number">
        <span>字号</span>
        <input
          type="number"
          min="8"
          max="512"
          step="1"
          [value]="props.fontSize"
          (change)="setNumber('fontSize', $event)"
        />
      </label>

      <bc-float-toolbar-item
        class="word-art-toolbar__menu-trigger"
        name="fill-type"
        aria-label="艺术字填充类型"
        [expandable]="true"
        [bcOverlayTrigger]="fillTypeMenu"
        #fillTypeTrigger="bcOverlayTrigger"
        [positions]="['bottom-left', 'top-left']"
        [offsetY]="8"
      >
        {{ fillTypeLabel }}
      </bc-float-toolbar-item>

      @if (props.fillType === "solid") {
        <label class="word-art-toolbar__color" nz-tooltip="填充颜色">
          <input
            type="color"
            aria-label="填充颜色"
            [value]="props.fillColor"
            (change)="setColor('fillColor', $event)"
          />
        </label>
      } @else {
        @for (color of props.gradientColors; track $index) {
          <label
            class="word-art-toolbar__color"
            [nz-tooltip]="'渐变色 ' + ($index + 1)"
          >
            <input
              type="color"
              [attr.aria-label]="'渐变色 ' + ($index + 1)"
              [value]="color"
              (change)="setGradientColor($index, $event)"
            />
          </label>
        }
        <label class="word-art-toolbar__field word-art-toolbar__field--number">
          <span>角度</span>
          <input
            type="number"
            min="0"
            max="360"
            step="15"
            [value]="props.gradientAngle"
            (change)="setNumber('gradientAngle', $event)"
          />
        </label>
      }

      <label class="word-art-toolbar__color" nz-tooltip="描边颜色">
        <input
          type="color"
          aria-label="描边颜色"
          [value]="props.outlineColor"
          (change)="setColor('outlineColor', $event)"
        />
      </label>
      <label class="word-art-toolbar__range" nz-tooltip="描边粗细">
        <span>描边</span>
        <input
          type="range"
          aria-label="描边粗细"
          min="0"
          max="0.2"
          step="0.01"
          [value]="props.outlineWidthEm"
          [style.--word-art-range-progress]="outlineWidthProgress"
          (input)="syncRangeProgress($event)"
          (change)="setNumber('outlineWidthEm', $event)"
        />
      </label>

      <button
        type="button"
        nz-tooltip="投影"
        aria-label="投影"
        [class.active]="props.shadowEnabled"
        (click)="toggleShadow()"
      >
        <i class="bc_icon bc_wenziyinying"></i>
      </button>

      <label class="word-art-toolbar__range" nz-tooltip="字间距">
        <span>字距</span>
        <input
          type="range"
          aria-label="字间距"
          min="-0.2"
          max="1"
          step="0.02"
          [value]="props.letterSpacingEm"
          [style.--word-art-range-progress]="letterSpacingProgress"
          (input)="syncRangeProgress($event)"
          (change)="setNumber('letterSpacingEm', $event)"
        />
      </label>

      <bc-float-toolbar-item
        class="word-art-toolbar__menu-trigger"
        name="effect"
        aria-label="艺术字效果"
        [expandable]="true"
        [bcOverlayTrigger]="effectMenu"
        #effectTrigger="bcOverlayTrigger"
        [positions]="['bottom-left', 'top-left']"
        [offsetY]="8"
      >
        {{ effectLabel }}
      </bc-float-toolbar-item>

      <span class="word-art-toolbar__divider"></span>

      <bc-float-toolbar-item
        class="word-art-toolbar__menu-trigger word-art-toolbar__align-trigger"
        name="horizontal-align"
        aria-label="水平对齐"
        nz-tooltip="水平对齐"
        [icon]="horizontalAlignIcon"
        [expandable]="true"
        [bcOverlayTrigger]="horizontalAlignMenu"
        #horizontalAlignTrigger="bcOverlayTrigger"
        [positions]="['bottom-left', 'top-left']"
        [offsetY]="8"
      >
      </bc-float-toolbar-item>

      <bc-float-toolbar-item
        class="word-art-toolbar__menu-trigger word-art-toolbar__align-trigger"
        name="vertical-align"
        aria-label="垂直对齐"
        nz-tooltip="垂直对齐"
        [icon]="verticalAlignIcon"
        [expandable]="true"
        [bcOverlayTrigger]="verticalAlignMenu"
        #verticalAlignTrigger="bcOverlayTrigger"
        [positions]="['bottom-left', 'top-left']"
        [offsetY]="8"
      >
      </bc-float-toolbar-item>

      <span class="word-art-toolbar__divider"></span>

      @for (item of layoutOptions; track item.value) {
        <button
          type="button"
          [nz-tooltip]="item.label"
          [attr.aria-label]="item.label"
          [class.active]="objectLayout === item.value"
          (click)="action.emit({ name: 'object-layout', value: item.value })"
        >
          <i [class]="'bc_icon ' + item.icon"></i>
        </button>
      }

      @if (isAbsolute) {
        <button
          type="button"
          nz-tooltip="上移一层"
          aria-label="上移一层"
          [disabled]="!canMoveForward"
          (click)="action.emit({ name: 'move-forward' })"
        >
          <i class="bc_icon bc_cengji-shangyi"></i>
        </button>
        <button
          type="button"
          nz-tooltip="下移一层"
          aria-label="下移一层"
          [disabled]="!canMoveBackward"
          (click)="action.emit({ name: 'move-backward' })"
        >
          <i class="bc_icon bc_cengji-xiayi"></i>
        </button>
      }

      <span class="word-art-toolbar__divider"></span>
      <button
        type="button"
        nz-tooltip="删除艺术字"
        aria-label="删除艺术字"
        (click)="action.emit({ name: 'delete' })"
      >
        <i class="bc_icon bc_shanchu"></i>
      </button>
    </div>

    <ng-template #fillTypeMenu>
      <bc-float-toolbar
        direction="column"
        (onItemClick)="selectFillType($event, fillTypeTrigger)"
      >
        @for (fillType of fillTypes; track fillType.value) {
          <bc-float-toolbar-item
            name="fill-type"
            [value]="fillType.value"
            [active]="props.fillType === fillType.value"
          >
            {{ fillType.label }}
          </bc-float-toolbar-item>
        }
      </bc-float-toolbar>
    </ng-template>

    <ng-template #effectMenu>
      <bc-float-toolbar
        direction="column"
        (onItemClick)="selectEffect($event, effectTrigger)"
      >
        @for (effect of effects; track effect.value) {
          <bc-float-toolbar-item
            name="effect"
            [value]="effect.value"
            [active]="props.effect === effect.value"
          >
            {{ effect.label }}
          </bc-float-toolbar-item>
        }
      </bc-float-toolbar>
    </ng-template>

    <ng-template #horizontalAlignMenu>
      <bc-float-toolbar
        direction="row"
        (onItemClick)="selectHorizontalAlign($event, horizontalAlignTrigger)"
      >
        @for (align of horizontalAligns; track align.value) {
          <bc-float-toolbar-item
            class="word-art-toolbar__align-option"
            name="horizontal-align"
            [value]="align.value"
            [icon]="align.icon"
            [active]="props.horizontalAlign === align.value"
            [nz-tooltip]="align.label"
            [attr.aria-label]="align.label"
          >
          </bc-float-toolbar-item>
        }
      </bc-float-toolbar>
    </ng-template>

    <ng-template #verticalAlignMenu>
      <bc-float-toolbar
        direction="row"
        (onItemClick)="selectVerticalAlign($event, verticalAlignTrigger)"
      >
        @for (align of verticalAligns; track align.value) {
          <bc-float-toolbar-item
            class="word-art-toolbar__align-option"
            name="vertical-align"
            [value]="align.value"
            [icon]="align.icon"
            [active]="props.verticalAlign === align.value"
            [nz-tooltip]="align.label"
            [attr.aria-label]="align.label"
          >
          </bc-float-toolbar-item>
        }
      </bc-float-toolbar>
    </ng-template>
  `,
  styles: [
    `
      .word-art-toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px;
        box-sizing: border-box;
        max-width: min(920px, calc(100vw - 24px));
        min-height: 42px;
        padding: 5px 7px;
        border: 1px solid var(--bc-border-color);
        border-radius: 10px;
        background: var(--bc-bg-primary);
        box-shadow: var(--bc-shadow-md);
        color: var(--bc-color);
        font-size: 12px;
      }

      button,
      input,
      .word-art-toolbar__menu-trigger {
        color: inherit;
        font: inherit;
      }

      button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        min-width: 30px;
        height: 30px;
        padding: 0 7px;
        border: 0;
        border-radius: 6px;
        background: transparent;
        cursor: pointer;
      }

      button:hover,
      button.active,
      .word-art-toolbar__menu-trigger:hover {
        background: var(--bc-bg-hover);
      }

      .word-art-toolbar__menu-trigger {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        min-width: 54px;
        height: 30px;
        padding: 0 7px;
        border-radius: 6px;
        cursor: pointer;
        white-space: nowrap;
      }

      .word-art-toolbar__align-trigger {
        min-width: 42px;
        padding-inline: 5px;
      }

      button:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }

      .word-art-toolbar__field,
      .word-art-toolbar__range {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        height: 30px;
        padding: 0 5px;
        border-radius: 6px;
        color: var(--bc-color-secondary);
        white-space: nowrap;
      }

      .word-art-toolbar__field:hover,
      .word-art-toolbar__range:hover {
        background: var(--bc-bg-hover);
      }

      .word-art-toolbar__field input {
        box-sizing: border-box;
        height: 24px;
        border: 1px solid var(--bc-border-color);
        border-radius: 4px;
        background: var(--bc-bg-primary);
      }

      .word-art-toolbar__field--number input {
        width: 58px;
      }

      .word-art-toolbar__color {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 30px;
        height: 30px;
        border-radius: 6px;
        cursor: pointer;
      }

      .word-art-toolbar__color:hover {
        background: var(--bc-bg-hover);
      }

      .word-art-toolbar__color input {
        width: 18px;
        height: 18px;
        padding: 0;
        border: 0;
        background: none;
        cursor: pointer;
      }

      .word-art-toolbar__range input {
        --word-art-range-progress: 100%;
        box-sizing: border-box;
        width: 54px;
        height: 16px;
        margin: 0;
        padding: 0;
        appearance: none;
        -webkit-appearance: none;
        border: 0;
        outline: 0;
        background: transparent;
        cursor: pointer;
      }

      .word-art-toolbar__range input::-webkit-slider-runnable-track {
        box-sizing: border-box;
        width: 100%;
        height: 4px;
        border: 0;
        border-radius: 999px;
        background: linear-gradient(
          to right,
          var(--bc-active-color, #4857e2) 0,
          var(--bc-active-color, #4857e2) var(--word-art-range-progress),
          var(--bc-border-color, #e2e8f0) var(--word-art-range-progress),
          var(--bc-border-color, #e2e8f0) 100%
        );
      }

      .word-art-toolbar__range input::-moz-range-track {
        box-sizing: border-box;
        width: 100%;
        height: 4px;
        border: 0;
        border-radius: 999px;
        background: linear-gradient(
          to right,
          var(--bc-active-color, #4857e2) 0,
          var(--bc-active-color, #4857e2) var(--word-art-range-progress),
          var(--bc-border-color, #e2e8f0) var(--word-art-range-progress),
          var(--bc-border-color, #e2e8f0) 100%
        );
      }

      .word-art-toolbar__range input::-moz-range-progress {
        height: 4px;
        border-radius: 999px;
        background: transparent;
      }

      .word-art-toolbar__range input::-webkit-slider-thumb {
        box-sizing: border-box;
        width: 14px;
        height: 14px;
        margin-top: -5px;
        appearance: none;
        -webkit-appearance: none;
        border: 2px solid var(--bc-active-color, #4857e2);
        border-radius: 50%;
        background: var(--bc-bg-primary, #fff);
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.16);
      }

      .word-art-toolbar__range input::-moz-range-thumb {
        box-sizing: border-box;
        width: 14px;
        height: 14px;
        border: 2px solid var(--bc-active-color, #4857e2);
        border-radius: 50%;
        background: var(--bc-bg-primary, #fff);
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.16);
      }

      .word-art-toolbar__range input:focus-visible::-webkit-slider-thumb {
        box-shadow:
          0 0 0 3px var(--bc-active-color-lighter, rgba(72, 87, 226, 0.1)),
          0 1px 2px rgba(15, 23, 42, 0.16);
      }

      .word-art-toolbar__range input:focus-visible::-moz-range-thumb {
        box-shadow:
          0 0 0 3px var(--bc-active-color-lighter, rgba(72, 87, 226, 0.1)),
          0 1px 2px rgba(15, 23, 42, 0.16);
      }

      .word-art-toolbar__divider {
        width: 1px;
        height: 24px;
        margin: 0 2px;
        background: var(--bc-border-color);
      }
    `,
  ],
})
export class WordArtToolbarComponent {
  @Input({ required: true })
  wordArtBlock!: BlockCraft.IBlockComponents["word-art"];

  @Output()
  readonly action = new EventEmitter<WordArtToolbarAction>();

  readonly fillTypes: ReadonlyArray<{
    value: WordArtFillType;
    label: string;
  }> = [
    { value: "solid", label: "纯色" },
    { value: "linear-gradient", label: "渐变" },
  ];
  readonly effects: ReadonlyArray<{
    value: WordArtEffect;
    label: string;
  }> = [
    { value: "none", label: "无效果" },
    { value: "slant-left", label: "左倾" },
    { value: "slant-right", label: "右倾" },
    { value: "perspective-left", label: "左透视" },
    { value: "perspective-right", label: "右透视" },
  ];
  readonly layoutOptions = BLOCK_OBJECT_LAYOUT_OPTIONS.filter(
    (item): item is typeof item & { value: BlockObjectBlockLayout } =>
      item.value !== "inline",
  );
  readonly horizontalAligns: ReadonlyArray<{
    value: WordArtHorizontalAlign;
    label: string;
    icon: string;
  }> = [
    { value: "left", label: "左对齐", icon: "bc_zuoduiqi" },
    { value: "center", label: "居中对齐", icon: "bc_juzhongduiqi" },
    { value: "right", label: "右对齐", icon: "bc_youduiqi" },
  ];
  readonly verticalAligns: ReadonlyArray<{
    value: WordArtVerticalAlign;
    label: string;
    icon: string;
  }> = [
    { value: "top", label: "顶部对齐", icon: "bc_dingbuduiqi" },
    { value: "middle", label: "垂直居中", icon: "bc_juzhongduiqi1" },
    { value: "bottom", label: "底部对齐", icon: "bc_dibuduiqi" },
  ];

  constructor(readonly cdr: ChangeDetectorRef) {}

  get props() {
    return this.wordArtBlock.wordArtProps;
  }

  get objectLayout(): BlockObjectBlockLayout {
    return this.wordArtBlock.doc.placement.getObjectLayout(this.wordArtBlock);
  }

  get isAbsolute(): boolean {
    return (
      this.wordArtBlock.doc.placement.getState(this.wordArtBlock).mode ===
      "absolute"
    );
  }

  get canMoveForward(): boolean {
    return this.wordArtBlock.doc.placement.canMoveForward(this.wordArtBlock);
  }

  get canMoveBackward(): boolean {
    return this.wordArtBlock.doc.placement.canMoveBackward(this.wordArtBlock);
  }

  get fillTypeLabel(): string {
    return (
      this.fillTypes.find((item) => item.value === this.props.fillType)
        ?.label ?? "填充"
    );
  }

  get effectLabel(): string {
    return (
      this.effects.find((item) => item.value === this.props.effect)?.label ??
      "效果"
    );
  }

  get horizontalAlignIcon(): string {
    return (
      this.horizontalAligns.find(
        (item) => item.value === this.props.horizontalAlign,
      )?.icon ?? "bc_zuoduiqi"
    );
  }

  get verticalAlignIcon(): string {
    return (
      this.verticalAligns.find(
        (item) => item.value === this.props.verticalAlign,
      )?.icon ?? "bc_juzhongduiqi1"
    );
  }

  get outlineWidthProgress(): string {
    return this.rangeProgress(this.props.outlineWidthEm, 0, 0.2);
  }

  get letterSpacingProgress(): string {
    return this.rangeProgress(this.props.letterSpacingEm, -0.2, 1);
  }

  selectFillType(
    item: BcFloatToolbarItemComponent,
    trigger: BcOverlayTriggerDirective,
  ): void {
    this.emitProps({
      fillType: String(item.value) as WordArtFillType,
    });
    trigger.closePanel();
  }

  selectEffect(
    item: BcFloatToolbarItemComponent,
    trigger: BcOverlayTriggerDirective,
  ): void {
    this.emitProps({
      effect: String(item.value) as WordArtEffect,
    });
    trigger.closePanel();
  }

  setColor(key: "fillColor" | "outlineColor", event: Event): void {
    this.emitProps({
      [key]: (event.target as HTMLInputElement).value,
    });
  }

  setGradientColor(index: number, event: Event): void {
    const gradientColors = [...this.props.gradientColors];
    gradientColors[index] = (event.target as HTMLInputElement).value;
    this.emitProps({ gradientColors });
  }

  setNumber(
    key: "fontSize" | "gradientAngle" | "outlineWidthEm" | "letterSpacingEm",
    event: Event,
  ): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value)) return;
    this.emitProps({ [key]: value });
  }

  syncRangeProgress(event: Event): void {
    const input = event.currentTarget as HTMLInputElement | null;
    if (!input) return;
    input.style.setProperty(
      "--word-art-range-progress",
      this.rangeProgress(
        Number(input.value),
        Number(input.min),
        Number(input.max),
      ),
    );
  }

  toggleShadow(): void {
    this.emitProps({ shadowEnabled: !this.props.shadowEnabled });
  }

  selectHorizontalAlign(
    item: BcFloatToolbarItemComponent,
    trigger: BcOverlayTriggerDirective,
  ): void {
    this.emitProps({
      horizontalAlign: String(item.value) as WordArtHorizontalAlign,
    });
    trigger.closePanel();
  }

  selectVerticalAlign(
    item: BcFloatToolbarItemComponent,
    trigger: BcOverlayTriggerDirective,
  ): void {
    this.emitProps({
      verticalAlign: String(item.value) as WordArtVerticalAlign,
    });
    trigger.closePanel();
  }

  private rangeProgress(value: number, min: number, max: number): string {
    const range = max - min;
    const progress =
      Number.isFinite(value) && range > 0
        ? Math.min(100, Math.max(0, ((value - min) / range) * 100))
        : 0;
    return `${progress}%`;
  }

  private emitProps(value: Partial<WordArtBlockProps>): void {
    this.action.emit({ name: "update-props", value });
  }
}
