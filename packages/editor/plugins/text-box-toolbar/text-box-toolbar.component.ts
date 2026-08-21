import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core'
import {
  CsButtonComponent,
  CsTooltipDirective,
} from '@cses/ui'
import {
  BLOCK_OBJECT_LAYOUT_OPTIONS,
  BLOCK_OBJECT_PLANE_ALIGNMENT_OPTIONS,
  type BlockObjectBlockLayout,
  type BlockObjectPlaneAlignment,
} from '../../framework'
import {
  type BcOverlayTriggerDirective,
  TextBoxPresetPickerComponent,
} from '../../components'
import {
  getTextBoxPreset,
  normalizeTextBoxProps,
  normalizeTextBoxWordArtStyle,
  serializeTextBoxWordArtStyle,
  type NormalizedTextBoxBlockProps,
  type TextBoxBlockProps,
  type TextBoxPresetId,
  type TextBoxWordArtStyle,
  type TextBoxWritingMode,
} from '../../blocks/text-box-block'
import {
  getWordArtPreset,
  type WordArtPresetId,
} from '../../blocks/word-art-block'
import type {ShapeKind} from '../../blocks/shape-block'
import {TextBoxShapePanelComponent} from './text-box-shape-panel.component'
import {TextBoxTextPanelComponent} from './text-box-text-panel.component'

export type TextBoxToolbarPropsPatch = Partial<TextBoxBlockProps>
export type TextBoxToolbarPanel = 'layout' | 'style' | 'shape' | 'text'
export type TextBoxToolbarSide = 'left' | 'right'

export type TextBoxToolbarAction =
  | {name: 'update-props'; value: TextBoxToolbarPropsPatch}
  | {name: 'object-layout'; value: BlockObjectBlockLayout}
  | {name: 'plane-align'; value: BlockObjectPlaneAlignment}
  | {name: 'move-forward'}
  | {name: 'move-backward'}
  | {name: 'delete'}

const TEXT_BOX_LAYOUT_OPTIONS = BLOCK_OBJECT_LAYOUT_OPTIONS.filter(
  (option): option is typeof option & {value: BlockObjectBlockLayout} =>
    option.value !== 'inline',
)

@Component({
  selector: 'bc-text-box-toolbar',
  standalone: true,
  imports: [
    TextBoxPresetPickerComponent,
    TextBoxShapePanelComponent,
    TextBoxTextPanelComponent,
    CsButtonComponent,
    CsTooltipDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="text-box-toolbar"
      [class.text-box-toolbar--left]="side === 'left'"
      contenteditable="false"
      data-bc-text-box-toolbar>
      <nav class="text-box-toolbar__rail" aria-label="文本框快捷工具">
        @if (!isGrouped) {
          <button
            cs-button
            csType="text"
            csSize="sm"
            type="button"
            class="text-box-toolbar__rail-button"
            [class.active]="activePanel === 'layout'"
            [attr.aria-expanded]="activePanel === 'layout'"
            aria-controls="bc-text-box-layout-panel"
            csTooltip="布局选项"
            [csTooltipPlacement]="tooltipPlacement"
            aria-label="布局选项"
            (click)="togglePanel('layout')">
            <i class="bc_icon bc_buju" aria-hidden="true"></i>
          </button>
        }

        <button
          cs-button
          csType="text"
          csSize="sm"
          type="button"
          class="text-box-toolbar__rail-button"
          [class.active]="activePanel === 'style'"
          [attr.aria-expanded]="activePanel === 'style'"
          aria-controls="bc-text-box-style-panel"
          csTooltip="文本框样式"
          [csTooltipPlacement]="tooltipPlacement"
          aria-label="文本框样式"
          (click)="togglePanel('style')">
          <i class="bc_icon bc_sepan" aria-hidden="true"></i>
        </button>

        <button
          cs-button
          csType="text"
          csSize="sm"
          type="button"
          class="text-box-toolbar__rail-button"
          [class.active]="activePanel === 'shape'"
          [attr.aria-expanded]="activePanel === 'shape'"
          aria-controls="bc-text-box-shape-panel"
          csTooltip="形状格式"
          [csTooltipPlacement]="tooltipPlacement"
          aria-label="形状格式"
          (click)="togglePanel('shape')">
          <i class="bc_icon bc_tuxing" aria-hidden="true"></i>
        </button>

        <button
          cs-button
          csType="text"
          csSize="sm"
          type="button"
          class="text-box-toolbar__rail-button"
          [class.active]="activePanel === 'text'"
          [attr.aria-expanded]="activePanel === 'text'"
          aria-controls="bc-text-box-text-panel"
          csTooltip="文字格式"
          [csTooltipPlacement]="tooltipPlacement"
          aria-label="文字格式"
          (click)="togglePanel('text')">
          <i class="bc_icon bc_wenben" aria-hidden="true"></i>
        </button>

        <span class="text-box-toolbar__rail-divider"></span>

        <button
          cs-button
          csType="text"
          csSize="sm"
          type="button"
          class="text-box-toolbar__rail-button text-box-toolbar__rail-button--danger"
          csTooltip="删除文本框"
          [csTooltipPlacement]="tooltipPlacement"
          aria-label="删除文本框"
          (click)="action.emit({name: 'delete'})">
          <i class="bc_icon bc_shanchu" aria-hidden="true"></i>
        </button>
      </nav>

      @if (!isGrouped && activePanel === 'layout') {
        <section
          id="bc-text-box-layout-panel"
          class="text-box-toolbar__panel text-box-toolbar__layout-panel"
          aria-label="布局选项">
          <header class="text-box-toolbar__panel-header">
            <div>
              <strong>布局选项</strong>
              <span>控制文本框与正文的关系</span>
            </div>
            <button
              cs-button
              csType="text"
              csSize="sm"
              type="button"
              aria-label="关闭布局选项"
              (click)="closePanel()">
              <i class="bc_icon bc_guanbi" aria-hidden="true"></i>
            </button>
          </header>

          <div class="text-box-toolbar__section-label">文字环绕</div>
          <div class="text-box-toolbar__layout-grid" role="radiogroup" aria-label="文字环绕方式">
            @for (item of layoutOptions; track item.value) {
              <button
                cs-button
                csType="text"
                csSize="sm"
                type="button"
                role="radio"
                class="text-box-toolbar__layout-option"
                [class.active]="objectLayout === item.value"
                [attr.aria-checked]="objectLayout === item.value"
                [attr.aria-label]="item.label"
                [disabled]="isGrouped"
                (click)="setObjectLayout(item.value)">
                <i [class]="'bc_icon ' + item.icon" aria-hidden="true"></i>
                <span>{{ item.label }}</span>
              </button>
            }
          </div>

          @if (isAbsolute && !isGrouped) {
            <div class="text-box-toolbar__section-label">排列</div>
            <div class="text-box-toolbar__stack-actions">
              <button
                cs-button
                csType="secondary"
                csSize="sm"
                type="button"
                [disabled]="!canMoveForward"
                (click)="action.emit({name: 'move-forward'})">
                <i class="bc_icon bc_cengji-shangyi" aria-hidden="true"></i>
                上移一层
              </button>
              <button
                cs-button
                csType="secondary"
                csSize="sm"
                type="button"
                [disabled]="!canMoveBackward"
                (click)="action.emit({name: 'move-backward'})">
                <i class="bc_icon bc_cengji-xiayi" aria-hidden="true"></i>
                下移一层
              </button>
            </div>

            <div class="text-box-toolbar__section-label">页面对齐</div>
            <div
              class="text-box-toolbar__plane-align-actions"
              role="group"
              aria-label="页面对齐">
              @for (item of planeAlignOptions; track item.value) {
                <button
                  cs-button
                  csType="secondary"
                  csSize="sm"
                  type="button"
                  class="text-box-toolbar__plane-align-option"
                  [attr.aria-label]="item.label"
                  [disabled]="!canAlignToPlane"
                  (click)="selectPlaneAlign(item.value)">
                  <i [class]="'bc_icon ' + item.icon" aria-hidden="true"></i>
                  {{ item.label }}
                </button>
              }
            </div>
          }
        </section>
      } @else if (activePanel === 'style') {
        <section
          id="bc-text-box-style-panel"
          class="text-box-toolbar__panel text-box-toolbar__style-panel"
          aria-label="文本框样式">
          <header class="text-box-toolbar__panel-header">
            <div>
              <strong>文本框样式</strong>
              <span>预设同时组合形状、填充与文字效果</span>
            </div>
            <button
              cs-button
              csType="text"
              csSize="sm"
              type="button"
              aria-label="关闭文本框样式"
              (click)="closePanel()">
              <i class="bc_icon bc_guanbi" aria-hidden="true"></i>
            </button>
          </header>
          <bc-text-box-preset-picker
            [embedded]="true"
            (pick)="applyPreset($event)">
          </bc-text-box-preset-picker>
        </section>
      } @else if (activePanel === 'shape') {
        <div id="bc-text-box-shape-panel">
          <bc-text-box-shape-panel
            [props]="normalizedProps"
            [textBoxBlock]="textBoxBlock"
            (patch)="emitPatch($event)">
          </bc-text-box-shape-panel>
        </div>
      } @else if (activePanel === 'text') {
        <div id="bc-text-box-text-panel">
          <bc-text-box-text-panel
            [style]="wordArtStyle"
            [wm]="writingMode"
            (patch)="emitPatch($event)">
          </bc-text-box-text-panel>
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      max-width: calc(100vw - 16px);
    }

    .text-box-toolbar {
      --text-box-settings-panel-width: 288px;
      display: flex;
      align-items: center;
      gap: 8px;
      box-sizing: border-box;
      width: max-content;
      max-width: 100%;
      color: var(--bc-float-toolbar-item-color, #1f2937);
      font-size: 12px;
    }

    .text-box-toolbar--left {
      flex-direction: row-reverse;
    }

    .text-box-toolbar__rail {
      display: flex;
      flex: 0 0 auto;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      box-sizing: border-box;
      width: 42px;
      padding: 5px;
      border: 1px solid var(--bc-float-toolbar-divider-color, #e2e8f0);
      border-radius: 11px;
      background: var(--bc-float-toolbar-bg, #fff);
      box-shadow: var(--bc-fixed-toolbar-shadow, 0 8px 24px rgba(15, 23, 42, .16));
    }

    .text-box-toolbar__rail-button.cs-btn {
      width: 32px;
      min-width: 32px;
      height: 32px;
      padding: 0;
      color: inherit;
    }

    .text-box-toolbar__rail-button .bc_icon {
      font-size: 16px;
    }

    .text-box-toolbar__rail-button.active {
      background: var(--bc-float-toolbar-item-active-bg, #eef2ff);
      color: var(--bc-active-color, #4857e2);
      box-shadow: inset 2px 0 0 var(--bc-active-color, #4857e2);
    }

    .text-box-toolbar--left .text-box-toolbar__rail-button.active {
      box-shadow: inset -2px 0 0 var(--bc-active-color, #4857e2);
    }

    .text-box-toolbar__rail-button--danger:hover {
      background: var(--bc-error-background-color, #fef2f2);
      color: var(--bc-error-color, #dc2626);
    }

    .text-box-toolbar__rail-divider {
      width: 24px;
      height: 1px;
      background: var(--bc-float-toolbar-divider-color, #e2e8f0);
    }

    .text-box-toolbar__panel {
      box-sizing: border-box;
      width: min(var(--text-box-settings-panel-width), calc(100vw - 86px));
      max-width: 100%;
      max-height: min(520px, calc(100vh - 24px));
      padding: 10px;
      overflow: auto;
      overscroll-behavior: contain;
      border: 1px solid var(--bc-float-toolbar-divider-color, #e2e8f0);
      border-radius: 12px;
      background: var(--bc-float-toolbar-bg, #fff);
      box-shadow: var(--bc-fixed-toolbar-shadow, 0 10px 28px rgba(15, 23, 42, .16));
    }

    .text-box-toolbar__panel-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 10px;
    }

    .text-box-toolbar__panel-header strong,
    .text-box-toolbar__panel-header span {
      display: block;
    }

    .text-box-toolbar__panel-header strong {
      font-size: 13px;
      line-height: 18px;
    }

    .text-box-toolbar__panel-header span {
      margin-top: 2px;
      color: var(--bc-color-secondary, #64748b);
      font-size: 11px;
      line-height: 16px;
    }

    .text-box-toolbar__section-label {
      margin: 12px 0 7px;
      color: var(--bc-color-secondary, #64748b);
      font-size: 11px;
      font-weight: 600;
    }

    .text-box-toolbar__layout-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px;
    }

    .text-box-toolbar__layout-option.cs-btn {
      display: flex;
      flex-direction: column;
      gap: 5px;
      height: 62px;
      padding: 6px;
      border: 1px solid var(--bc-float-toolbar-divider-color, #e2e8f0);
      font-size: 10px;
    }

    .text-box-toolbar__layout-option .bc_icon {
      font-size: 20px;
    }

    .text-box-toolbar__layout-option.active {
      border-color: var(--bc-active-color, #4857e2);
      background: var(--bc-float-toolbar-item-active-bg, #eef2ff);
      color: var(--bc-active-color, #4857e2);
    }

    .text-box-toolbar__stack-actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .text-box-toolbar__stack-actions button {
      min-width: 0;
    }

    .text-box-toolbar__stack-actions .bc_icon {
      margin-right: 4px;
    }

    .text-box-toolbar__plane-align-actions {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
    }

    /* 288px 面板三等分后每格约 84px，压缩水平内边距避免「水平居中」被截断 */
    .text-box-toolbar__plane-align-option.cs-btn {
      min-width: 0;
      padding: 0 4px;
    }

    .text-box-toolbar__plane-align-option .bc_icon {
      margin-right: 4px;
    }

  `],
})
export class TextBoxToolbarComponent {
  @Input({required: true})
  textBoxBlock!: BlockCraft.BlockComponent

  @Input()
  side: TextBoxToolbarSide = 'right'

  @Output()
  readonly action = new EventEmitter<TextBoxToolbarAction>()

  /** Emits only for visual panel size changes; it never mutates document data. */
  @Output()
  readonly panelChange = new EventEmitter<TextBoxToolbarPanel | null>()

  readonly layoutOptions = TEXT_BOX_LAYOUT_OPTIONS
  readonly planeAlignOptions = BLOCK_OBJECT_PLANE_ALIGNMENT_OPTIONS
  activePanel: TextBoxToolbarPanel | null = null

  constructor(readonly cdr: ChangeDetectorRef) {}

  get props(): Readonly<TextBoxBlockProps> {
    return this.textBoxBlock.props as TextBoxBlockProps
  }

  get normalizedProps(): NormalizedTextBoxBlockProps {
    return normalizeTextBoxProps(this.props)
  }

  get wordArtStyle(): TextBoxWordArtStyle | null {
    return normalizeTextBoxWordArtStyle(this.props.wa) ?? null
  }

  get writingMode(): TextBoxWritingMode {
    return this.normalizedProps.wm
  }

  get shapeType(): ShapeKind {
    return this.normalizedProps.sh
  }

  get hasWordArt(): boolean {
    return !!this.props.wa
  }

  get objectLayout(): BlockObjectBlockLayout {
    return this.textBoxBlock.doc.placement.getObjectLayout(this.textBoxBlock)
  }

  get isAbsolute(): boolean {
    return this.textBoxBlock.doc.placement.getState(this.textBoxBlock).mode ===
      'absolute'
  }

  get isGrouped(): boolean {
    return this.textBoxBlock.doc.placement.isInObjectGroup?.(
      this.textBoxBlock,
    ) ?? false
  }

  get canMoveForward(): boolean {
    return this.textBoxBlock.doc.placement.canMoveForward(this.textBoxBlock)
  }

  get canMoveBackward(): boolean {
    return this.textBoxBlock.doc.placement.canMoveBackward(this.textBoxBlock)
  }

  /** 页面对齐依赖已测量的 plane 宽度；未就绪时按钮禁用而非静默空点。 */
  get canAlignToPlane(): boolean {
    return this.textBoxBlock.doc.placement.canAlignObjectsToPlane(
      [this.textBoxBlock.id],
    )
  }

  get tooltipPlacement(): 'left' | 'right' {
    return this.side === 'right' ? 'left' : 'right'
  }

  togglePanel(panel: TextBoxToolbarPanel): void {
    this.activePanel = this.activePanel === panel ? null : panel
    this.panelChange.emit(this.activePanel)
  }

  closePanel(): void {
    if (this.activePanel === null) return
    this.activePanel = null
    this.panelChange.emit(null)
  }

  setObjectLayout(value: BlockObjectBlockLayout): void {
    this.action.emit({name: 'object-layout', value})
  }

  selectPlaneAlign(value: BlockObjectPlaneAlignment): void {
    this.action.emit({name: 'plane-align', value})
  }

  applyPreset(
    presetId: TextBoxPresetId,
    trigger?: BcOverlayTriggerDirective,
  ): void {
    trigger?.closePanel()
    const preset = getTextBoxPreset(presetId)
    this.emitPatch({...preset.props})
  }

  applyShape(
    shape: ShapeKind,
    trigger?: BcOverlayTriggerDirective,
  ): void {
    trigger?.closePanel()
    this.emitPatch({sh: shape})
  }

  applyWordArt(
    presetId: WordArtPresetId,
    trigger?: BcOverlayTriggerDirective,
  ): void {
    trigger?.closePanel()
    const style = normalizeTextBoxWordArtStyle(getWordArtPreset(presetId).props)
    const serialized = serializeTextBoxWordArtStyle(style)
    if (serialized) this.emitPatch({wa: serialized})
  }

  clearWordArt(): void {
    this.emitPatch({wa: null})
  }

  emitPatch(value: TextBoxToolbarPropsPatch): void {
    this.action.emit({name: 'update-props', value})
  }
}
