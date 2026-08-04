import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core'
import {
  BLOCK_OBJECT_LAYOUT_OPTIONS,
  type BlockObjectLayout,
} from '../../framework'
import {
  BcFloatToolbarComponent,
  BcFloatToolbarItemComponent,
  BcOverlayTriggerDirective,
} from '../../components'
import {
  type ShapeKind,
  type ShapeStrokeStyle,
  type ShapeTextAlign,
  type ShapeVerticalAlign,
} from '../../blocks/shape-block'
import {NzTooltipDirective} from 'ng-zorro-antd/tooltip'
import {
  INLINE_OBJECT_WRAP_LAYOUT_OPTION,
} from '../object-layout/inline-object-toolbar.component'

export type ShapeObjectLayout = BlockObjectLayout | 'wrap'

export type ShapeToolbarAction =
  | {name: 'shape-type'; value: ShapeKind}
  | {name: 'fill-color'; value: string}
  | {name: 'fill-opacity'; value: number}
  | {name: 'stroke-color'; value: string}
  | {name: 'stroke-width'; value: number}
  | {name: 'stroke-style'; value: ShapeStrokeStyle}
  | {name: 'text-color'; value: string}
  | {name: 'text-align'; value: ShapeTextAlign}
  | {name: 'vertical-align'; value: ShapeVerticalAlign}
  | {name: 'object-layout'; value: ShapeObjectLayout}
  | {name: 'move-forward'}
  | {name: 'move-backward'}
  | {name: 'delete'}

@Component({
  selector: 'bc-shape-toolbar',
  standalone: true,
  imports: [
    BcFloatToolbarComponent,
    BcFloatToolbarItemComponent,
    BcOverlayTriggerDirective,
    NzTooltipDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="shape-toolbar" contenteditable="false">
      <label
        class="shape-toolbar__color"
        nz-tooltip="形状填充"
        aria-label="形状填充">
        <i class="bc_icon bc_tianchongyanse"></i>
        <input
          type="color"
          [value]="shapeBlock.props.fillColor"
          (change)="emitString('fill-color', $event)">
      </label>
      <label
        class="shape-toolbar__range"
        nz-tooltip="填充透明度"
        aria-label="填充透明度">
        <span>透明度</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          [value]="shapeBlock.props.fillOpacity"
          [style.--shape-range-progress]="fillOpacityProgress"
          (input)="syncRangeProgress($event)"
          (change)="emitNumber('fill-opacity', $event)">
      </label>

      <label
        class="shape-toolbar__color"
        nz-tooltip="轮廓颜色"
        aria-label="轮廓颜色">
        <i class="bc_icon bc_tubiao_xianduan-leixing"></i>
        <input
          type="color"
          [value]="shapeBlock.props.strokeColor"
          (change)="emitString('stroke-color', $event)">
      </label>
      <bc-float-toolbar-item
        class="shape-toolbar__stroke-width"
        name="stroke-width"
        nz-tooltip="轮廓粗细"
        aria-label="轮廓粗细"
        [expandable]="true"
        [bcOverlayTrigger]="strokeWidthMenu"
        #strokeWidthTrigger="bcOverlayTrigger"
        [positions]="['bottom-left', 'top-left']"
        [offsetY]="8">
        {{ strokeWidthLabel }}
      </bc-float-toolbar-item>
      <button
        type="button"
        nz-tooltip="实线/虚线"
        aria-label="实线/虚线"
        [class.active]="shapeBlock.props.strokeStyle === 'dashed'"
        (click)="toggleStrokeStyle()">
        <i class="bc_icon bc_xuxian"></i>
      </button>

      <span class="shape-toolbar__divider"></span>

      @for (item of layoutOptions; track item.value) {
        <button
          type="button"
          [nz-tooltip]="item.label"
          [attr.aria-label]="item.label"
          [class.active]="objectLayout === item.value"
          (click)="action.emit({name: 'object-layout', value: item.value})">
          <i [class]="'bc_icon ' + item.icon"></i>
        </button>
      }

      @if (isAbsolute) {
        <span class="shape-toolbar__divider"></span>
        <span class="shape-toolbar__tooltip-host" nz-tooltip="上移一层">
          <button
            type="button"
            aria-label="上移一层"
            [disabled]="!canMoveForward"
            (click)="action.emit({name: 'move-forward'})">
            <i class="bc_icon bc_cengji-shangyi"></i>
          </button>
        </span>
        <span class="shape-toolbar__tooltip-host" nz-tooltip="下移一层">
          <button
            type="button"
            aria-label="下移一层"
            [disabled]="!canMoveBackward"
            (click)="action.emit({name: 'move-backward'})">
            <i class="bc_icon bc_cengji-xiayi"></i>
          </button>
        </span>
      }

      <span class="shape-toolbar__divider"></span>
      <button
        type="button"
        nz-tooltip="删除形状"
        aria-label="删除形状"
        (click)="action.emit({name: 'delete'})">
        <i class="bc_icon bc_shanchu"></i>
      </button>
    </div>

    <ng-template #strokeWidthMenu>
      <bc-float-toolbar
        direction="column"
        (onItemClick)="selectStrokeWidth($event, strokeWidthTrigger)">
        @for (item of strokeWidthOptions; track item.value) {
          <bc-float-toolbar-item
            name="stroke-width"
            [value]="item.value"
            [active]="shapeBlock.props.strokeWidth === item.value">
            {{ item.label }}
          </bc-float-toolbar-item>
        }
      </bc-float-toolbar>
    </ng-template>
  `,
  styles: [`
    .shape-toolbar {
      display: flex;
      align-items: center;
      gap: 4px;
      min-height: 42px;
      padding: 5px 7px;
      border: 1px solid var(--bc-border-color, #e2e8f0);
      border-radius: 10px;
      background: var(--bc-bg-primary, #fff);
      box-shadow: var(--bc-shadow-md, 0 8px 24px rgba(15, 23, 42, .14));
      color: var(--bc-color, #1f2937);
      font-size: 12px;
      white-space: nowrap;
    }

    button,
    .shape-toolbar__color,
    .shape-toolbar__stroke-width {
      box-sizing: border-box;
      min-width: 30px;
      height: 30px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: inherit;
    }

    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }

    .shape-toolbar__tooltip-host {
      display: inline-flex;
    }

    button:hover,
    button.active,
    .shape-toolbar__color:hover,
    .shape-toolbar__stroke-width:hover {
      background: var(--bc-bg-hover, #f1f5f9);
    }

    button:disabled {
      opacity: .45;
      cursor: not-allowed;
    }

    button:disabled:hover {
      background: transparent;
    }

    .shape-toolbar__color {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 0 5px;
      cursor: pointer;
    }

    .shape-toolbar__color input {
      width: 17px;
      height: 17px;
      padding: 0;
      border: 0;
      background: none;
      cursor: pointer;
    }

    .shape-toolbar__stroke-width {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 6px;
    }

    .shape-toolbar__range {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 0 4px;
      color: var(--bc-color-secondary, #64748b);
    }

    .shape-toolbar__range input {
      --shape-range-progress: 100%;
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

    .shape-toolbar__range input::-webkit-slider-runnable-track {
      box-sizing: border-box;
      width: 100%;
      height: 4px;
      border: 0;
      border-radius: 999px;
      background: linear-gradient(
        to right,
        var(--bc-active-color, #4857e2) 0,
        var(--bc-active-color, #4857e2) var(--shape-range-progress),
        var(--bc-border-color, #e2e8f0) var(--shape-range-progress),
        var(--bc-border-color, #e2e8f0) 100%
      );
    }

    .shape-toolbar__range input::-moz-range-track {
      box-sizing: border-box;
      width: 100%;
      height: 4px;
      border: 0;
      border-radius: 999px;
      background: linear-gradient(
        to right,
        var(--bc-active-color, #4857e2) 0,
        var(--bc-active-color, #4857e2) var(--shape-range-progress),
        var(--bc-border-color, #e2e8f0) var(--shape-range-progress),
        var(--bc-border-color, #e2e8f0) 100%
      );
    }

    .shape-toolbar__range input::-moz-range-progress {
      height: 4px;
      border-radius: 999px;
      background: transparent;
    }

    .shape-toolbar__range input::-webkit-slider-thumb {
      box-sizing: border-box;
      width: 14px;
      height: 14px;
      margin-top: -5px;
      appearance: none;
      -webkit-appearance: none;
      border: 2px solid var(--bc-active-color, #4857e2);
      border-radius: 50%;
      background: var(--bc-bg-primary, #fff);
      box-shadow: 0 1px 2px rgba(15, 23, 42, .16);
    }

    .shape-toolbar__range input::-moz-range-thumb {
      box-sizing: border-box;
      width: 14px;
      height: 14px;
      border: 2px solid var(--bc-active-color, #4857e2);
      border-radius: 50%;
      background: var(--bc-bg-primary, #fff);
      box-shadow: 0 1px 2px rgba(15, 23, 42, .16);
    }

    .shape-toolbar__range input:focus-visible::-webkit-slider-thumb {
      box-shadow:
        0 0 0 3px var(--bc-active-color-lighter, rgba(72, 87, 226, .1)),
        0 1px 2px rgba(15, 23, 42, .16);
    }

    .shape-toolbar__range input:focus-visible::-moz-range-thumb {
      box-shadow:
        0 0 0 3px var(--bc-active-color-lighter, rgba(72, 87, 226, .1)),
        0 1px 2px rgba(15, 23, 42, .16);
    }

    .shape-toolbar__divider {
      width: 1px;
      height: 24px;
      margin: 0 2px;
      background: var(--bc-border-color, #e2e8f0);
    }
  `],
})
export class ShapeToolbarComponent {
  @Input({required: true})
  shapeBlock!: BlockCraft.IBlockComponents['shape']

  @Output()
  readonly action = new EventEmitter<ShapeToolbarAction>()

  readonly layoutOptions = [
    BLOCK_OBJECT_LAYOUT_OPTIONS[0],
    INLINE_OBJECT_WRAP_LAYOUT_OPTION,
    ...BLOCK_OBJECT_LAYOUT_OPTIONS.slice(1),
  ] as const
  readonly strokeWidthOptions = [
    {value: 0, label: '无'},
    {value: 1, label: '1 px'},
    {value: 2, label: '2 px'},
    {value: 3, label: '3 px'},
    {value: 4, label: '4 px'},
    {value: 6, label: '6 px'},
  ]

  constructor(readonly cdr: ChangeDetectorRef) {}

  get objectLayout(): BlockObjectLayout {
    return this.shapeBlock.doc.placement.getObjectLayout(this.shapeBlock)
  }

  get isAbsolute(): boolean {
    return this.shapeBlock.doc.placement.getState(this.shapeBlock).mode ===
      'absolute'
  }

  get canMoveForward(): boolean {
    return this.shapeBlock.doc.placement.canMoveForward(this.shapeBlock)
  }

  get canMoveBackward(): boolean {
    return this.shapeBlock.doc.placement.canMoveBackward(this.shapeBlock)
  }

  get strokeWidthLabel(): string {
    const width = this.shapeBlock.props.strokeWidth
    return width === 0 ? '无' : `${width} px`
  }

  get fillOpacityProgress(): string {
    const value = Number(this.shapeBlock.props.fillOpacity)
    const opacity = Number.isFinite(value)
      ? Math.min(1, Math.max(0, value))
      : 1
    return `${opacity * 100}%`
  }

  syncRangeProgress(event: Event): void {
    const input = event.currentTarget as HTMLInputElement | null
    if (!input) return

    const min = Number(input.min)
    const max = Number(input.max)
    const value = Number(input.value)
    const range = max - min
    const progress = Number.isFinite(value) && range > 0
      ? Math.min(100, Math.max(0, ((value - min) / range) * 100))
      : 0
    input.style.setProperty('--shape-range-progress', `${progress}%`)
  }

  emitString(name: ShapeToolbarAction['name'], event: Event): void {
    const value = (event.target as HTMLInputElement).value
    this.action.emit({name, value} as ShapeToolbarAction)
  }

  emitNumber(name: ShapeToolbarAction['name'], event: Event): void {
    const value = Number((event.target as HTMLInputElement).value)
    this.action.emit({name, value} as ShapeToolbarAction)
  }

  selectStrokeWidth(
    item: BcFloatToolbarItemComponent,
    trigger: BcOverlayTriggerDirective,
  ): void {
    const value = Number(item.value)
    if (!Number.isFinite(value)) return
    this.action.emit({name: 'stroke-width', value})
    trigger.closePanel()
  }

  toggleStrokeStyle(): void {
    this.action.emit({
      name: 'stroke-style',
      value: this.shapeBlock.props.strokeStyle === 'dashed'
        ? 'solid'
        : 'dashed',
    })
  }
}
