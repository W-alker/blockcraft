import {TypographySettingsController} from './typography-settings-controller';
import { PARAGRAPH_ALIGNMENT_OPTIONS } from "../../paragraph-alignment-options";
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  NgZone,
  Optional,
  Output,
  ViewChild,
  Type,
} from "@angular/core";
import {
  BcColumnCountPickerComponent,
  BcOrderedMarkerPickerComponent,
  BcFloatToolbarComponent,
  BcFloatToolbarItemComponent,
  BcTableSizePickerComponent,
  IColumnCountPickedEvent,
  ITableSizePickedEvent,
} from "../../../components";
import {
  CsColorPickerPanelComponent,
  CsIconComponent,
  CsDropdownDirective,
  CsDropdownMenuComponent,
  CsMenuDirective,
  CsMenuItemComponent,
  CsModalService,
  CsSubmenuComponent,
  CsTooltipDirective,
} from "@cses/ui";
import {
  BLOCK_CREATOR_SERVICE_TOKEN,
  BlockNodeType,
  IBlockSnapshot,
  IBlockProps,
  IEditableBlockProps,
  IInlineNodeAttrs,
  ISelectionJSON,
  DeltaInsert,
  getPositionWithOffset,
  createInlineTypographyPatch,
  normalizeTypographyLineHeight,
  getTypographyFontFamily,
  PARAGRAPH_LINE_HEIGHT_PRESETS,
  TextToolbarHelper,
  TYPOGRAPHY_FONT_FAMILIES,
  type TypographyFontFamilyId,
} from "../../../framework";
import {
  debounceTime,
  filter,
  fromEvent,
  Subject,
  takeUntil,
  Subscription,
  take,
} from "rxjs";
import { debounce, IS_MAC, nextTick, sliceDelta } from "../../../global";
import { FormulaBlockToolbar } from "../../formula-extension/widgets/formula-toolbar";
import { ToolbarSelectionSession } from "./toolbar-selection-session";
import { LinkInputPad } from "../../float-text-toolbar/widgets/link-input-pad";
import {
  getSelectionFormatRootIds,
  isSelectedContainer,
} from "../../../framework/utils/selection-format-blocks";
import {
  applyOrderedMarkerStyle,
  isOrderedMarkerStyleId,
  OrderedMarkerStyleId,
} from "../../../blocks/ordered-block";
import {
  DEFAULT_SHAPE_PROPS,
  type ShapeKind,
} from "../../../blocks/shape-block";
import { ShapePickerComponent } from "../../../components/shape-picker";
import { TextBoxPresetPickerComponent } from "../../../components/text-box-preset-picker";
import {
  DEFAULT_WORD_ART_PROPS,
  getWordArtPreset,
  type WordArtBlockProps,
  type WordArtPresetId,
} from "../../../blocks/word-art-block";
import {
  getTextBoxPreset,
  type TextBoxBlockProps,
  type TextBoxPresetId,
} from "../../../blocks/text-box-block";
import { WordArtPresetPickerComponent } from "./word-art-preset-picker.component";
import {
  ObjectDrawInsertController,
  type ObjectDrawInsertGeometry,
  type ObjectDrawInsertRequest,
} from "./object-draw-insert.controller";
import type {
  FontSettingsTarget,
  ParagraphSettingsTarget,
} from "./typography-settings-dialog.types";

type TInlineToggle =
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "code"
  | "sup"
  | "sub";
type TScriptToggle = Extract<TInlineToggle, "sup" | "sub">;
type TAlignValue = NonNullable<IEditableBlockProps["textAlign"]> | "left";
type TListFlavour = "ordered" | "bullet" | "todo";
interface IStyleMenuItem {
  name: string;
  value: any;
  intro: string;
  icon: string;
}

interface IToolbarIconAction<T extends string = string> {
  value: T;
  icon: string;
  title: string;
}

interface IFormatBrushPayload {
  inlineAttrs: IInlineNodeAttrs;
  fontScale?: number | null;
  fontSize?: number;
  blockProps: Partial<Pick<IEditableBlockProps, "lh">>;
}

interface IToolbarPopupController {
  close(restoreFocus?: boolean): void;
}

interface IInlineTypographyState {
  ff: TypographyFontFamilyId | null | undefined;
  fs: number | null | undefined;
  ls: number | null | undefined;
}

interface IParagraphTypographyState {
  pfs: number | null | undefined;
  lh: number | null | undefined;
  psb: number | null | undefined;
  psa: number | null | undefined;
}

type InsertPlacement =
  | { kind: "before"; anchor: BlockCraft.BlockComponent }
  | { kind: "after"; anchor: BlockCraft.BlockComponent }
  | { kind: "index"; parentId: string; index: number };

export interface IFixedToolbarExtensionAction {
  key: string;
  icon: string;
  title: string;
  active?: boolean;
  disabled?: boolean;
  dividerBefore?: boolean;
}

export interface IFixedToolbarExtensionActionContext {
  action: IFixedToolbarExtensionAction;
  selection: ISelectionJSON | null;
  doc: BlockCraft.Doc;
}

const HEADING_MENU_LIST: IStyleMenuItem[] = [
  { name: "heading", intro: "正文", value: null, icon: "bc_wenben" },
  {
    name: "heading",
    value: 1,
    intro: "一级标题",
    icon: "bc_biaoti_1",
  },
  {
    name: "heading",
    value: 2,
    intro: "二级标题",
    icon: "bc_biaoti_2",
  },
  {
    name: "heading",
    value: 3,
    intro: "三级标题",
    icon: "bc_biaoti_3",
  },
  {
    name: "heading",
    value: 4,
    intro: "四级标题",
    icon: "bc_biaoti_4",
  },
];

const INLINE_TOGGLE_ACTIONS: IToolbarIconAction<TInlineToggle>[] = [
  { value: "bold", icon: "bc_jiacu", title: "加粗" },
  { value: "italic", icon: "bc_xieti", title: "斜体" },
  { value: "underline", icon: "bc_xiahuaxian", title: "下划线" },
  { value: "strike", icon: "bc_shanchuxian", title: "删除线" },
  { value: "code", icon: "bc_daimakuai", title: "行内代码" },
];

const SCRIPT_ACTIONS: IToolbarIconAction<TScriptToggle>[] = [
  { value: "sup", icon: "bc_shangbiao", title: "上标" },
  { value: "sub", icon: "bc_xiabiao", title: "下标" },
];

const NARROW_INLINE_ACTIONS: IToolbarIconAction<TInlineToggle>[] = [
  ...INLINE_TOGGLE_ACTIONS,
  ...SCRIPT_ACTIONS,
];

const LIST_ACTIONS: IToolbarIconAction<TListFlavour>[] = [
  { value: "todo", icon: "bc_gongzuoshixiang", title: "待办事项" },
  { value: "bullet", icon: "bc_wuxuliebiao", title: "无序列表" },
  { value: "ordered", icon: "bc_youxuliebiao", title: "有序列表" },
];

/** 高频快捷档位；完整范围由“更多设置”中的数值控件承接。 */
const FIXED_TOOLBAR_FONT_SIZE_PRESETS = [
  12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72,
];
const FIXED_TOOLBAR_FONT_FAMILY_WIDTH = 104;
const FIXED_TOOLBAR_FONT_SIZE_MIN_WIDTH = 56;

const FIXED_TOOLBAR_LETTER_SPACING_PRESETS = [
  -0.05, -0.025, 0.025, 0.05, 0.1,
] as const;

const ALIGN_ACTIONS: IToolbarIconAction<TAlignValue>[] =
  PARAGRAPH_ALIGNMENT_OPTIONS;

const BG_GRAPH_LIST: Array<{ attr: string | null; class: string; title: string }> = [
  {
    attr: null,
    class: "none",
    title: "无背景图形",
  },
  {
    attr: "r1",
    class: "radius-1",
    title: "圆角背景",
  },
  {
    attr: "rb",
    class: "right-border",
    title: "侧边强调背景",
  },
];

@Component({
  selector: "bc-fixed-toolbar",
  template: `
    <div class="toolbar-surface">
      <div class="toolbar-head">
        <div class="toolbar-head__actions">
          <button
            class="toolbar-btn toolbar-btn--dropdown"
            title="更多格式"
            aria-label="更多格式"
            aria-haspopup="menu"
            [disabled]="readonly"
            csDropdown
            csTrigger="hover"
            csMatchTriggerWidth
            csOverlayClassName="bc-fixed-toolbar-dropdown"
            [csDropdownMenu]="responsiveMorePicker"
            [csDisabled]="readonly"
            [csClickHide]="false"
            csPlacement="bottom"
            #responsiveMoreTrigger="csDropdown"
          >
            <i class="bc_icon bc_gengduo" aria-hidden="true"></i>
          </button>
        </div>
        <button
          class="toolbar-btn toolbar-mode-switch"
          #modeTooltip="csTooltip"
          [csTooltip]="
            toolbarMode === 'simple' ? '展开为双层工具栏' : '收起为简略工具栏'
          "
          [attr.aria-label]="
            toolbarMode === 'simple' ? '展开为双层工具栏' : '收起为简略工具栏'
          "
          [attr.aria-expanded]="toolbarMode === 'full'"
          (mousedown)="onActionMouseDown($event)"
          (click)="modeTooltip.hide(); setToolbarMode(toolbarMode === 'simple' ? 'full' : 'simple')"
        >
          <i class="bc_icon bc_xiajaintou" aria-hidden="true"></i>
        </button>
      </div>
      <div class="toolbar-body">
        <div class="toolbar-section toolbar-section--text">
          <ng-content select="[fixed-toolbar-prefix]"></ng-content>
          <div
            class="toolbar-group toolbar-group--history"
            role="group"
            aria-label="编辑操作"
          >
            <div class="toolbar-group__controls">
              <button
                class="toolbar-btn"
                csTooltip="撤销"
                aria-label="撤销"
                (mousedown)="onActionMouseDown($event)"
                (click)="undo()"
                [disabled]="!doc?.crud?.undoManager?.isCanUndo()"
              >
                <i class="bc_icon bc_chehui"></i>
              </button>
              <button
                class="toolbar-btn"
                csTooltip="重做"
                [csTooltipPlacement]="toolbarMode === 'full' ? 'bottom' : 'top'"
                aria-label="重做"
                (mousedown)="onActionMouseDown($event)"
                (click)="redo()"
                [disabled]="!doc?.crud?.undoManager?.isCanRedo()"
              >
                <i class="bc_icon bc_huitui"></i>
              </button>
              <button
                class="toolbar-btn toolbar-format-utility"
                [class.toolbar-priority-hidden]="
                  overflowedGroups.has('utilities')
                "
                [class.active]="formatBrushActive"
                [csTooltip]="formatBrushTitle"
                #formatBrushTooltip="csTooltip"
                [attr.aria-label]="formatBrushTitle"
                [disabled]="
                  readonly || (!formatBrushActive && !canCaptureFormatBrush())
                "
                (mousedown)="onActionMouseDown($event)"
                (click)="formatBrushTooltip.hide(); toggleFormatBrush()"
              >
                <i class="bc_icon bc_geshishua"></i>
              </button>
              <button
                class="toolbar-btn toolbar-format-utility"
                [class.toolbar-priority-hidden]="
                  overflowedGroups.has('utilities')
                "
                csTooltip="清除格式"
                [csTooltipPlacement]="toolbarMode === 'full' ? 'bottom' : 'top'"
                aria-label="清除格式"
                [disabled]="readonly || !allEditable"
                (mousedown)="onActionMouseDown($event)"
                (click)="clearFormat()"
              >
                <i class="bc_icon bc_quxiao"></i>
              </button>
            </div>
          </div>
          <div
            class="toolbar-group toolbar-group--font"
            role="group"
            aria-label="文本"
          >
            <div class="toolbar-group__controls">
              <div class="toolbar-row">
                <button
                  class="toolbar-btn toolbar-btn--style"
                  [class.toolbar-priority-hidden]="
                    overflowedGroups.has('style')
                  "
                  [disabled]="readonly || !canTransformBlocks"
                  csDropdown
                  csTrigger="hover"
                  csMatchTriggerWidth
                  csOverlayClassName="bc-fixed-toolbar-dropdown"
                  [csDropdownMenu]="styleDropdown"
                  [csDisabled]="readonly || !canTransformBlocks"
                  [csClickHide]="false"
                  csPlacement="bottom"
                  #styleTrigger="csDropdown"
                >
                  <i
                    [class]="[
                      'bc_icon',
                      activeStyleItem.icon,
                      'toolbar-btn__leading',
                    ]"
                  ></i>
                  <span>{{ activeStyleItem.intro }}</span>
                  <i class="bc_icon bc_xiajaintou"></i>
                </button>
                <span class="toolbar-font-combo">
                  <button
                    class="toolbar-btn toolbar-font-combo__control toolbar-btn--font-family"
                    title="字体"
                    aria-haspopup="menu"
                    [disabled]="readonly || !allEditable"
                    csDropdown
                    csTrigger="hover"
                    csMatchTriggerWidth
                    csOverlayClassName="bc-fixed-toolbar-dropdown"
                    [csDropdownMenu]="fontFamilyPicker"
                    [csDisabled]="readonly || !allEditable"
                    [csClickHide]="false"
                    csPlacement="bottom"
                    #fontFamilyTrigger="csDropdown"
                  >
                    <span>{{ activeFontFamilyLabel }}</span>
                    <i class="bc_icon bc_xiajaintou toolbar-btn__caret"></i>
                  </button>

                  <button
                    class="toolbar-btn toolbar-font-combo__control toolbar-btn--font-size"
                    title="字号"
                    aria-haspopup="menu"
                    [disabled]="readonly || !canSetFontScale"
                    csDropdown
                    csTrigger="hover"
                    csMatchTriggerWidth
                    csOverlayClassName="bc-fixed-toolbar-dropdown bc-fixed-toolbar-font-picker"
                    [csOverlayStyle]="fontSizeDropdownStyle"
                    [csDropdownMenu]="fontSizePicker"
                    [csDisabled]="readonly || !canSetFontScale"
                    [csClickHide]="false"
                    csPlacement="bottom"
                    #fontSizeTrigger="csDropdown"
                  >
                    <span>{{ activeFontSizeLabel }}</span>
                    <i class="bc_icon bc_xiajaintou toolbar-btn__caret"></i>
                  </button>
                </span>
                <button
                  class="toolbar-btn toolbar-settings-entry toolbar-settings-entry--text"
                  [hidden]="toolbarMode === 'simple'"
                  csTooltip="文本设置"
                  #textSettingsTooltip="csTooltip"
                  [csTooltipPlacement]="toolbarMode === 'full' && toolbarLayout !== 'wide' ? 'bottom' : 'top'"
                  aria-label="文本设置"
                  aria-haspopup="dialog"
                  [disabled]="readonly || !canSetFontScale"
                  (mousedown)="onActionMouseDown($event)"
                  (click)="openSettings('text', $event); textSettingsTooltip.hide()"
                >
                  <i class="bc_icon bc_zitishezhi" aria-hidden="true"></i>
                </button>
              </div>
              <div class="toolbar-row">
                @for (item of inlineToggleActions; track item.value) {
                  <button
                    class="toolbar-btn"
                    [attr.data-inline-action]="item.value"
                    [class.active]="isAttrActive(item.value)"
                    [csTooltip]="item.title"
                    [csTooltipPlacement]="fontActionsTooltipPlacement"
                    [attr.aria-label]="item.title"
                    [disabled]="readonly || !allEditable"
                    (mousedown)="onActionMouseDown($event)"
                    (click)="toggleInlineAttr(item.value)"
                  >
                    <i [class]="['bc_icon', item.icon]"></i>
                  </button>
                }

                <span
                  class="toolbar-split toolbar-control--wide-only"
                  [class.toolbar-priority-hidden]="
                    overflowedGroups.has('script')
                  "
                  [class.active]="isAttrActive('sup') || isAttrActive('sub')"
                  [class.toolbar-split--disabled]="readonly || !allEditable"
                  [class.toolbar-split--open]="scriptDropdownOpen"
                >
                  <button
                    class="toolbar-btn toolbar-split__main"
                    [csTooltip]="activeScriptAction.title"
                    [csTooltipPlacement]="fontActionsTooltipPlacement"
                    [attr.aria-label]="activeScriptAction.title"
                    [disabled]="readonly || !allEditable"
                    (mousedown)="onActionMouseDown($event)"
                    (click)="toggleScriptAttr(activeScriptAction.value)"
                  >
                    <i [class]="['bc_icon', activeScriptAction.icon]"></i>
                  </button>
                  <button
                    class="toolbar-btn toolbar-split__caret"
                    title="选择上标或下标"
                    aria-label="选择上标或下标"
                    aria-haspopup="menu"
                    [disabled]="readonly || !allEditable"
                    csDropdown
                    csTrigger="hover"
                    csMatchTriggerWidth
                    csOverlayClassName="bc-fixed-toolbar-dropdown"
                    [csDropdownMenu]="scriptPicker"
                    [csDisabled]="readonly || !allEditable"
                    [csClickHide]="false"
                    csPlacement="bottom"
                    (csOpenChange)="scriptDropdownOpen = $event"
                    #scriptTrigger="csDropdown"
                  >
                    <i class="bc_icon bc_xiajaintou toolbar-btn__caret"></i>
                  </button>
                </span>

                <button
                  type="button"
                  class="toolbar-btn toolbar-color-control toolbar-color-control--text"
                  csTooltip="文字颜色"
                  [csTooltipPlacement]="fontActionsTooltipPlacement"
                  #textColorTooltip="csTooltip"
                  [csTooltipDisabled]="activeColorPanel === 'color'"
                  aria-label="文字颜色"
                  [disabled]="readonly || !allEditable"
                  (mousedown)="onColorTriggerMouseDown($event)"
                  csDropdown
                  csTrigger="click"
                  csMatchTriggerWidth
                  csOverlayClassName="bc-fixed-toolbar-dropdown bc-fixed-toolbar-color-dropdown"
                  [csDropdownMenu]="textColorPicker"
                  (csOpenChange)="textColorTooltip.hide(); onColorPanelOpenChange('color', $event)"
                  #textColorTrigger="csDropdown"
                  [csDisabled]="readonly || !allEditable"
                  [csClickHide]="false"
                  csPlacement="bottom"
                >
                  <cs-icon csType="text-field" [csSize]="16" aria-hidden="true" />
                  <span class="toolbar-color-indicator" aria-hidden="true"
                    [style.background-color]="activeColors['color'] || 'var(--bc-color)'"></span>
                </button>

                <button
                  type="button"
                  class="toolbar-btn toolbar-color-control toolbar-color-control--background"
                  csTooltip="背景颜色"
                  [csTooltipPlacement]="fontActionsTooltipPlacement"
                  #backgroundColorTooltip="csTooltip"
                  [csTooltipDisabled]="activeColorPanel === 'backColor'"
                  aria-label="背景颜色"
                  [disabled]="readonly || !allEditable"
                  (mousedown)="onColorTriggerMouseDown($event)"
                  csDropdown
                  csTrigger="click"
                  csMatchTriggerWidth
                  csOverlayClassName="bc-fixed-toolbar-dropdown bc-fixed-toolbar-color-dropdown"
                  [csDropdownMenu]="backgroundColorPicker"
                  (csOpenChange)="backgroundColorTooltip.hide(); onColorPanelOpenChange('backColor', $event)"
                  #backgroundColorTrigger="csDropdown"
                  [csDisabled]="readonly || !allEditable"
                  [csClickHide]="false"
                  csPlacement="bottom"
                >
                  <i class="bc_icon bc_tianchongyanse" aria-hidden="true"></i>
                  <span class="toolbar-color-indicator" aria-hidden="true"
                    [style.background-color]="activeColors['backColor'] || 'transparent'"></span>
                </button>
              </div>
            </div>
          </div>
          <div
            class="toolbar-group toolbar-group--paragraph"
            [class.toolbar-group--spacing-collapsed]="overflowedGroups.has('spacing')"
            role="group"
            aria-label="段落"
          >
            <div class="toolbar-group__controls">
              <div class="toolbar-row">
                @for (item of listActions; track item.value) {
                  @if (item.value !== "ordered") {
                    <button
                      class="toolbar-btn toolbar-list-control"
                      [attr.data-list-action]="item.value"
                      [class.active]="activeFlavour === item.value"
                      [csTooltip]="item.title"
                      [csTooltipPlacement]="toolbarMode === 'full' && toolbarLayout === 'wide' && overflowedGroups.has('spacing') && item.value === 'bullet' ? 'bottom' : 'top'"
                      [attr.aria-label]="item.title"
                      [disabled]="readonly || !canTransformBlocks"
                      (mousedown)="onActionMouseDown($event)"
                      (click)="setList(item.value)"
                    >
                      <i [class]="['bc_icon', item.icon]"></i>
                    </button>
                  }
                }

                <span
                  class="toolbar-split toolbar-list-control"
                  [class.active]="activeFlavour === 'ordered'"
                  [class.toolbar-split--disabled]="
                    readonly || !canTransformBlocks
                  "
                  [class.toolbar-split--open]="orderedMarkerDropdownOpen"
                >
                  <button
                    class="toolbar-btn toolbar-split__main"
                    csTooltip="有序列表"
                    [csTooltipPlacement]="toolbarMode === 'full' && toolbarLayout === 'balanced' ? 'bottom' : 'top'"
                    aria-label="有序列表"
                    [disabled]="readonly || !canTransformBlocks"
                    (mousedown)="onActionMouseDown($event)"
                    (click)="setList('ordered')"
                  >
                    <i class="bc_icon bc_youxuliebiao"></i>
                  </button>
                  <button
                    class="toolbar-btn toolbar-split__caret"
                    title="编号样式"
                    aria-label="选择编号样式"
                    aria-haspopup="menu"
                    [disabled]="readonly || !canTransformBlocks"
                    csDropdown
                    csTrigger="hover"
                    csMatchTriggerWidth
                    csOverlayClassName="bc-fixed-toolbar-dropdown"
                    [csDropdownMenu]="orderedMarkerPicker"
                    [csDisabled]="readonly || !canTransformBlocks"
                    [csClickHide]="false"
                    csPlacement="bottom"
                    (csOpenChange)="orderedMarkerDropdownOpen = $event"
                    #orderedMarkerTrigger="csDropdown"
                  >
                    <i class="bc_icon bc_xiajaintou toolbar-btn__caret"></i>
                  </button>
                </span>

                <button
                  class="toolbar-btn toolbar-btn--dropdown toolbar-align-control"
                  [title]="allEditable ? activeAlignAction.title : '段落设置'"
                  [attr.aria-label]="
                    allEditable
                      ? '对齐方式：' + activeAlignAction.title
                      : '段落设置'
                  "
                  aria-haspopup="menu"
                  [disabled]="readonly || !canSetParagraphSpacing"
                  csDropdown
                  csTrigger="hover"
                  csMatchTriggerWidth
                  csOverlayClassName="bc-fixed-toolbar-dropdown"
                  [csDropdownMenu]="alignDropdown"
                  [csDisabled]="readonly || !canSetParagraphSpacing"
                  [csClickHide]="false"
                  csPlacement="bottom"
                  #alignTrigger="csDropdown"
                >
                  <i
                    [class]="[
                      'bc_icon',
                      allEditable
                        ? activeAlignAction.icon
                        : 'bc_version_settings',
                    ]"
                  ></i>
                  <i class="bc_icon bc_xiajaintou toolbar-btn__caret"></i>
                </button>
              </div>
              <div class="toolbar-row">
                <button
                  class="toolbar-btn toolbar-btn--dropdown toolbar-control--wide-only toolbar-letter-spacing"
                  [class.toolbar-priority-hidden]="
                    overflowedGroups.has('spacing')
                  "
                  [title]="'字符间距：' + activeLetterSpacingLabel"
                  [attr.aria-label]="'字符间距：' + activeLetterSpacingLabel"
                  aria-haspopup="menu"
                  [disabled]="readonly || !allEditable"
                  csDropdown
                  csTrigger="hover"
                  csMatchTriggerWidth
                  csOverlayClassName="bc-fixed-toolbar-dropdown"
                  [csDropdownMenu]="letterSpacingPicker"
                  [csDisabled]="readonly || !allEditable"
                  [csClickHide]="false"
                  csPlacement="bottom"
                  #letterSpacingTrigger="csDropdown"
                >
                  <i class="bc_icon bc_zijianju"></i>
                  <span class="toolbar-btn__value">{{
                    activeLetterSpacingLabel
                  }}</span>
                  <i class="bc_icon bc_xiajaintou toolbar-btn__caret"></i>
                </button>

                <button
                  class="toolbar-btn toolbar-btn--dropdown toolbar-control--wide-only toolbar-line-height"
                  [class.toolbar-priority-hidden]="
                    overflowedGroups.has('spacing')
                  "
                  [title]="'行距：' + activeLineHeightLabel"
                  [attr.aria-label]="'行距：' + activeLineHeightLabel"
                  aria-haspopup="menu"
                  [disabled]="readonly || !canSetLineHeight"
                  csDropdown
                  csTrigger="hover"
                  csMatchTriggerWidth
                  csOverlayClassName="bc-fixed-toolbar-dropdown"
                  [csDropdownMenu]="lineHeightPicker"
                  [csDisabled]="readonly || !canSetLineHeight"
                  [csClickHide]="false"
                  csPlacement="bottom"
                  #lineHeightTrigger="csDropdown"
                >
                  <i class="bc_icon bc_hangjianju"></i>
                  <span class="toolbar-btn__value">{{
                    activeLineHeightLabel
                  }}</span>
                  <i class="bc_icon bc_xiajaintou toolbar-btn__caret"></i>
                </button>
                <button
                  class="toolbar-btn toolbar-settings-entry toolbar-settings-entry--paragraph"
                  [hidden]="toolbarMode === 'simple'"
                  csTooltip="段落设置"
                  #paragraphSettingsTooltip="csTooltip"
                  csTooltipPlacement="bottom"
                  aria-label="段落设置"
                  aria-haspopup="dialog"
                  [disabled]="readonly || !canSetParagraphSpacing"
                  (mousedown)="onActionMouseDown($event)"
                  (click)="openSettings('paragraph', $event); paragraphSettingsTooltip.hide()"
                >
                  <i class="bc_icon bc_duanla" aria-hidden="true"></i>
                </button>
              </div>
            </div>
          </div>
          <div
            class="toolbar-group toolbar-group--reference"
            [class.toolbar-group--formula-collapsed]="overflowedGroups.has('formula')"
            [class.toolbar-control--wide-only]="toolbarMode === 'full'"
            [class.toolbar-priority-hidden]="overflowedGroups.has('reference')"
            role="group"
            aria-label="引用"
          >
            <div class="toolbar-group__controls">
              <button
                class="toolbar-btn"
                [class.active]="isAttrActive('link')"
                [attr.aria-pressed]="isAttrActive('link')"
                csTooltip="链接"
                aria-label="链接"
                [disabled]="
                  readonly || !allEditable || !isLinkAble
                "
                (mousedown)="onActionMouseDown($event)"
                (click)="onLinkAction()"
              >
                <i class="bc_icon bc_lianjie"></i>
              </button>

              <button
                class="toolbar-btn toolbar-control--wide-only"
                [class.toolbar-priority-hidden]="overflowedGroups.has('formula')"
                [class.active]="formulaActive"
                [attr.aria-pressed]="formulaActive"
                csTooltip="行内公式"
                [csTooltipPlacement]="toolbarMode === 'full' ? 'bottom' : 'top'"
                aria-label="行内公式"
                [disabled]="
                  readonly || !allEditable || !isLinkAble
                "
                (mousedown)="onActionMouseDown($event)"
                (click)="insertFormula()"
              >
                <i class="bc_icon bc_gongshi"></i>
              </button>
            </div>
          </div>
        </div>
        <div class="toolbar-section toolbar-section--insert">
          <div
            class="toolbar-group toolbar-group--insert"
            role="group"
            aria-label="插入"
          >
            <div class="toolbar-group__controls">
              <div class="toolbar-row">
                <button
                  class="toolbar-btn toolbar-insert-shortcut toolbar-insert-shortcut--image"
                  csTooltip="插入图片"
                  aria-label="插入图片"
                  [disabled]="readonly || !canInsertBlock('image')"
                  (mousedown)="onActionMouseDown($event)"
                  (click)="insertSchemaBlock('image')"
                >
                  <i class="bc_icon bc_tupian-color"></i
                  ><span class="toolbar-insert-label">图片</span></button
                ><button
                  class="toolbar-btn toolbar-insert-shortcut toolbar-insert-shortcut--table toolbar-btn--dropdown"
                  title="插入表格"
                  [disabled]="readonly || !canInsertBlock('table')"
                  csDropdown
                  csTrigger="hover"
                  csMatchTriggerWidth
                  csOverlayClassName="bc-fixed-toolbar-dropdown"
                  [csDropdownMenu]="quickTablePicker"
                  [csDisabled]="readonly || !canInsertBlock('table')"
                  [csClickHide]="false"
                  csPlacement="bottom"
                  #quickTableTrigger="csDropdown"
                >
                  <i class="bc_icon bc_column-vertical"></i
                  ><span class="toolbar-insert-label">表格</span>
                  <i
                    class="bc_icon bc_xiajaintou toolbar-btn__caret"
                  ></i></button
                ><button
                  class="toolbar-btn toolbar-insert-shortcut toolbar-insert-shortcut--shape toolbar-btn--dropdown"
                  [class.toolbar-priority-hidden]="
                    overflowedGroups.has('shape')
                  "
                  title="插入形状"
                  aria-label="插入形状"
                  [hidden]="!doc.schemas.has('shape')"
                  [disabled]="readonly"
                  csDropdown
                  csTrigger="hover"
                  csMatchTriggerWidth
                  csOverlayClassName="bc-fixed-toolbar-dropdown"
                  [csDropdownMenu]="shapePicker"
                  [csDisabled]="readonly"
                  [csClickHide]="false"
                  csPlacement="bottom"
                  #shapeTrigger="csDropdown"
                >
                  <i class="bc_icon bc_tuxing"></i
                  ><span class="toolbar-insert-label">形状</span>
                  <i class="bc_icon bc_xiajaintou toolbar-btn__caret"></i>
                </button>
                <button
                  class="toolbar-btn toolbar-insert-shortcut toolbar-insert-shortcut--media toolbar-btn--dropdown"
                  [class.toolbar-priority-hidden]="
                    overflowedGroups.has('media')
                  "
                  title="插入视频或音频"
                  [disabled]="
                    readonly ||
                    (!canInsertBlock('video') && !canInsertBlock('audio'))
                  "
                  csDropdown
                  csTrigger="hover"
                  csMatchTriggerWidth
                  csOverlayClassName="bc-fixed-toolbar-dropdown"
                  [csDropdownMenu]="mediaTypePicker"
                  [csDisabled]="
                    readonly ||
                    (!canInsertBlock('video') && !canInsertBlock('audio'))
                  "
                  [csClickHide]="false"
                  csPlacement="bottom"
                  #mediaTypeTrigger="csDropdown"
                >
                  <i class="bc_icon bc_shipin"></i
                  ><span class="toolbar-insert-label">音视频</span>
                  <i class="bc_icon bc_xiajaintou toolbar-btn__caret"></i>
                </button>
              </div>
              <div class="toolbar-row">
                <button
                  class="toolbar-btn toolbar-insert-shortcut toolbar-insert-shortcut--textbox toolbar-btn--dropdown"
                  [class.toolbar-priority-hidden]="
                    overflowedGroups.has('textbox')
                  "
                  title="插入文本框"
                  aria-label="插入文本框"
                  [hidden]="!doc.schemas.has('text-box')"
                  [disabled]="readonly"
                  csDropdown
                  csTrigger="hover"
                  csMatchTriggerWidth
                  csOverlayClassName="bc-fixed-toolbar-dropdown"
                  [csDropdownMenu]="textBoxPicker"
                  [csDisabled]="readonly"
                  [csClickHide]="false"
                  csPlacement="bottom"
                  #textBoxTrigger="csDropdown"
                >
                  <i class="bc_icon bc_wenbenkuang"></i
                  ><span class="toolbar-insert-label">文本框</span>
                  <i
                    class="bc_icon bc_xiajaintou toolbar-btn__caret"
                  ></i></button
                ><button
                  class="toolbar-btn toolbar-insert-shortcut toolbar-insert-shortcut--wordart toolbar-btn--dropdown"
                  [class.toolbar-priority-hidden]="
                    overflowedGroups.has('wordart')
                  "
                  title="插入艺术字"
                  aria-label="插入艺术字"
                  [hidden]="!doc.schemas.has('word-art')"
                  [disabled]="readonly"
                  csDropdown
                  csTrigger="hover"
                  csMatchTriggerWidth
                  csOverlayClassName="bc-fixed-toolbar-dropdown"
                  [csDropdownMenu]="wordArtPicker"
                  [csDisabled]="readonly"
                  [csClickHide]="false"
                  csPlacement="bottom"
                  #wordArtTrigger="csDropdown"
                >
                  <i class="bc_icon bc_yishuzishengcheng"></i
                  ><span class="toolbar-insert-label">艺术字</span>
                  <i
                    class="bc_icon bc_xiajaintou toolbar-btn__caret"
                  ></i></button
                ><button
                  class="toolbar-btn toolbar-insert-shortcut toolbar-insert-shortcut--columns toolbar-btn--dropdown"
                  [class.toolbar-priority-hidden]="
                    overflowedGroups.has('columns')
                  "
                  title="分栏"
                  [disabled]="readonly || !canUseColumns"
                  csDropdown
                  csTrigger="hover"
                  csMatchTriggerWidth
                  csOverlayClassName="bc-fixed-toolbar-dropdown"
                  [csDropdownMenu]="columnCountPicker"
                  [csDisabled]="readonly || !canUseColumns"
                  [csClickHide]="false"
                  csPlacement="bottom"
                  #columnCountTrigger="csDropdown"
                >
                  <i class="bc_icon bc_fenlan"></i
                  ><span class="toolbar-insert-label">分栏</span>
                  <i
                    class="bc_icon bc_xiajaintou toolbar-btn__caret"
                  ></i></button
                ><button
                  class="toolbar-btn toolbar-insert-menu"
                  title="插入"
                  aria-label="插入"
                  csDropdown
                  csTrigger="hover"
                  csMatchTriggerWidth
                  csOverlayClassName="bc-fixed-toolbar-dropdown"
                  [csDropdownMenu]="insertMorePicker"
                  [csDisabled]="readonly"
                  [disabled]="readonly"
                  [csClickHide]="false"
                  #insertMoreTrigger="csDropdown"
                >
                  插入<i class="bc_icon bc_xiajaintou toolbar-btn__caret"></i>
                </button>
              </div>
            </div>
          </div>
          @if (extensionActions.length) {
            <div
              class="toolbar-group toolbar-group--extensions"
              role="group"
              aria-label="扩展"
            >
              <div class="toolbar-group__controls">
                <span class="toolbar-divider"></span>

                @for (item of extensionActions; track item.key) {
                  @if (item.dividerBefore) {
                    <span class="toolbar-divider"></span>
                  }

                  <button
                    class="toolbar-btn"
                    [class.active]="!!item.active"
                    [csTooltip]="item.title"
                    [attr.aria-label]="item.title"
                    [disabled]="readonly || !!item.disabled"
                    (mousedown)="onActionMouseDown($event)"
                    (click)="onExtensionAction(item)"
                  >
                    <i [class]="['bc_icon', item.icon]"></i>
                  </button>
                }
              </div>
            </div>
          }

          <ng-content></ng-content>
          <ng-content select="[fixed-toolbar-suffix]"></ng-content>
        </div>
      </div>
    </div>
    <cs-dropdown-menu #insertMorePicker="csDropdownMenu"
      ><div
        csMenu
        aria-label="插入内容"
        (csClick)="onMenuAction($event, insertMoreTrigger)"
      >
        <div
          csMenuItem
          [csDisabled]="readonly || !canInsertBlock('image')"
          data-toolbar-command="insert-image"
        >
          图片
        </div>
        <div
          csSubmenu
          csTitle="形状"
          [hidden]="!doc.schemas.has('shape')"
          [csDisabled]="readonly || !doc.schemas.has('shape')"
          csMenuClassName="bc-fixed-toolbar-submenu bc-fixed-toolbar-picker-submenu"
          #insertShapeTrigger="csSubmenu"
        >
          <bc-shape-picker
            (pick)="
              insertMoreTrigger.close(); insertShape($event, insertShapeTrigger)
            "
          />
        </div>
        <div
          csSubmenu
          csTitle="文本框"
          [hidden]="!doc.schemas.has('text-box')"
          [csDisabled]="readonly || !doc.schemas.has('text-box')"
          csMenuClassName="bc-fixed-toolbar-submenu bc-fixed-toolbar-picker-submenu"
          #insertTextBoxTrigger="csSubmenu"
        >
          <bc-text-box-preset-picker
            (pick)="
              insertMoreTrigger.close();
              insertTextBox($event, insertTextBoxTrigger)
            "
          />
        </div>
        <div
          csSubmenu
          csTitle="艺术字"
          [hidden]="!doc.schemas.has('word-art')"
          [csDisabled]="readonly || !doc.schemas.has('word-art')"
          csMenuClassName="bc-fixed-toolbar-submenu bc-fixed-toolbar-picker-submenu"
          #insertWordArtTrigger="csSubmenu"
        >
          <bc-word-art-preset-picker
            (pick)="
              insertMoreTrigger.close();
              insertWordArt($event, insertWordArtTrigger)
            "
          />
        </div>
        <div
          csSubmenu
          csTitle="表格"
          [csDisabled]="readonly || !canInsertBlock('table')"
          csMenuClassName="bc-fixed-toolbar-submenu bc-fixed-toolbar-picker-submenu"
          #insertTableTrigger="csSubmenu"
        >
          <bc-table-size-picker
            (pick)="
              insertMoreTrigger.close();
              insertQuickTable($event, insertTableTrigger)
            "
          />
        </div>
        <div
          csSubmenu
          csTitle="分栏"
          [csDisabled]="readonly || !canUseColumns"
          csMenuClassName="bc-fixed-toolbar-submenu bc-fixed-toolbar-picker-submenu"
          #insertColumnsTrigger="csSubmenu"
        >
          <bc-column-count-picker
            [current]="columnPickerCurrent"
            (pick)="
              insertMoreTrigger.close();
              insertColumnsBlock($event, insertColumnsTrigger)
            "
          />
        </div>
        <div
          csMenuItem
          [csDisabled]="readonly || !canInsertBlock('video')"
          data-toolbar-command="insert-video"
        >
          视频
        </div>
        <div
          csMenuItem
          [csDisabled]="readonly || !canInsertBlock('audio')"
          data-toolbar-command="insert-audio"
        >
          音频
        </div>
      </div></cs-dropdown-menu
    >
    <cs-dropdown-menu #quickTablePicker="csDropdownMenu">
      <bc-table-size-picker
        (pick)="insertQuickTable($event, quickTableTrigger)"
      ></bc-table-size-picker>
    </cs-dropdown-menu>

    <cs-dropdown-menu #columnCountPicker="csDropdownMenu">
      <bc-column-count-picker
        [current]="columnPickerCurrent"
        (pick)="insertColumnsBlock($event, columnCountTrigger)"
      ></bc-column-count-picker>
    </cs-dropdown-menu>

    <cs-dropdown-menu #mediaTypePicker="csDropdownMenu">
      <bc-float-toolbar
        [direction]="'column'"
        (onItemClick)="onMediaTypePicked($event, mediaTypeTrigger)"
        [gapAround]="8"
      >
        <bc-float-toolbar-item name="media" value="video" icon="bc_shipin">
          插入视频
        </bc-float-toolbar-item>
        <bc-float-toolbar-item name="media" value="audio" icon="bc_yinpin">
          插入音频
        </bc-float-toolbar-item>
      </bc-float-toolbar>
    </cs-dropdown-menu>

    <cs-dropdown-menu #shapePicker="csDropdownMenu">
      <bc-shape-picker
        ariaLabel="选择要插入的形状"
        (pick)="insertShape($event, shapeTrigger)"
      ></bc-shape-picker>
    </cs-dropdown-menu>

    <cs-dropdown-menu #wordArtPicker="csDropdownMenu">
      <bc-word-art-preset-picker
        (pick)="insertWordArt($event, wordArtTrigger)"
      ></bc-word-art-preset-picker>
    </cs-dropdown-menu>

    <cs-dropdown-menu #orderedMarkerPicker="csDropdownMenu">
      <bc-ordered-marker-picker
        [current]="activeOrderedMarkerStyle"
        (pick)="applyOrderedMarker($event, orderedMarkerTrigger)"
      />
    </cs-dropdown-menu>

    <cs-dropdown-menu #scriptPicker="csDropdownMenu">
      <bc-float-toolbar
        [direction]="'column'"
        (onItemClick)="onScriptItemClicked($event, scriptTrigger)"
        [gapAround]="8"
      >
        @for (item of scriptActions; track item.value) {
          <bc-float-toolbar-item
            name="script"
            [value]="item.value"
            [icon]="item.icon"
            [active]="isAttrActive(item.value)"
            >{{ item.title }}</bc-float-toolbar-item
          >
        }
      </bc-float-toolbar>
    </cs-dropdown-menu>

    <cs-dropdown-menu #textBoxPicker="csDropdownMenu">
      <bc-text-box-preset-picker
        (pick)="insertTextBox($event, textBoxTrigger)"
      ></bc-text-box-preset-picker>
    </cs-dropdown-menu>

    <cs-dropdown-menu #responsiveMorePicker="csDropdownMenu">
      <div
        csMenu
        class="responsive-more-menu"
        aria-label="更多格式"
        (csClick)="onMenuAction($event, responsiveMoreTrigger)"
      >
        <div
          csSubmenu
          csTitle="编号样式"
          [csDisabled]="readonly || !canTransformBlocks"
          csMenuClassName="bc-fixed-toolbar-submenu"
          #moreOrderedTrigger="csSubmenu"
        >
          <bc-ordered-marker-picker
            [current]="activeOrderedMarkerStyle"
            (pick)="
              responsiveMoreTrigger.close();
              applyOrderedMarker($event, moreOrderedTrigger)
            "
          />
        </div>
        <div
          csSubmenu
          csTitle="文字格式"
          [csDisabled]="readonly || !allEditable"
          csMenuClassName="bc-fixed-toolbar-submenu"
          #inlineMoreTrigger="csSubmenu"
        >
          <bc-float-toolbar
            direction="column"
            [gapAround]="0"
            (onItemClick)="
              responsiveMoreTrigger.close();
              onNarrowInlineItemClicked($event, inlineMoreTrigger)
            "
          >
            @for (item of narrowInlineActions; track item.value) {
              <bc-float-toolbar-item
                name="inline-format"
                [value]="item.value"
                [icon]="item.icon"
                [active]="isAttrActive(item.value)"
                >{{ item.title }}</bc-float-toolbar-item
              >
            }
          </bc-float-toolbar>
        </div>
        <div
          csSubmenu
          csTitle="段落样式与列表"
          [csDisabled]="readonly || !canTransformBlocks"
          csMenuClassName="bc-fixed-toolbar-submenu"
          #styleMoreTrigger="csSubmenu"
        >
          <bc-float-toolbar direction="column" [gapAround]="0">
            @for (item of headingMenuList; track item.value) {
              <bc-float-toolbar-item
                [name]="item.name"
                [active]="isHeadingItemActive(item)"
                [value]="item.value"
                [icon]="item.icon"
                #moreHeadingItem
                (click)="
                  responsiveMoreTrigger.close();
                  onStyleItemClicked(moreHeadingItem, styleMoreTrigger)
                "
                >{{ item.intro }}</bc-float-toolbar-item
              >
            }
            @for (item of listActions; track item.value) {
              <bc-float-toolbar-item
                [icon]="item.icon"
                (click)="
                  responsiveMoreTrigger.close();
                  styleMoreTrigger.close();
                  setList(item.value)
                "
                >{{ item.title }}</bc-float-toolbar-item
              >
            }
          </bc-float-toolbar>
        </div>
        <div
          csMenuItem
          [csDisabled]="!doc?.crud?.undoManager?.isCanUndo()"
          data-toolbar-command="undo"
        >
          撤销
        </div>
        <div
          csMenuItem
          [csDisabled]="!doc?.crud?.undoManager?.isCanRedo()"
          data-toolbar-command="redo"
        >
          重做
        </div>
        <div
          csMenuItem
          [csDisabled]="readonly || !allEditable"
          data-toolbar-command="clear-format"
        >
          清除格式
        </div>
        <div
          csMenuItem
          [csDisabled]="
            readonly || (!formatBrushActive && !canCaptureFormatBrush())
          "
          data-toolbar-command="format-brush"
        >
          格式刷
        </div>
        <div
          csMenuItem
          [csDisabled]="
            readonly || !allEditable || !isLinkAble
          "
          [csSelected]="isAttrActive('link')"
          (mousedown)="onActionMouseDown($event)"
          data-toolbar-command="link"
        >
          链接
        </div>
        <div
          csMenuItem
          [csDisabled]="
            readonly || !allEditable || !isLinkAble
          "
          [csSelected]="formulaActive"
          (mousedown)="onActionMouseDown($event)"
          data-toolbar-command="formula"
        >
          行内公式
        </div>
        @for (item of extensionActions; track item.key) {
          <div
            csMenuItem
            [csDisabled]="readonly || !!item.disabled"
            data-toolbar-command="extension"
            [attr.data-extension-key]="item.key"
          >
            {{ item.title }}
          </div>
        }

        <ng-template #compactFontFamilyTitle>
          <span class="responsive-more-menu__title">
            <i class="bc_icon bc_wenben"></i>
            <span>字体</span>
          </span>
        </ng-template>
        <div
          csSubmenu
          [csTitle]="compactFontFamilyTitle"
          [csDisabled]="readonly || !allEditable"
          csTriggerSubMenuAction="hover"
          csMenuClassName="bc-fixed-toolbar-submenu"
          #compactFontFamilyTrigger="csSubmenu"
        >
          <bc-float-toolbar
            [direction]="'column'"
            (onItemClick)="
              onFontFamilyItemClicked(
                $event,
                compactFontFamilyTrigger,
                responsiveMoreTrigger
              )
            "
            [gapAround]="0"
            styles="box-sizing: border-box; width: 100%; min-width: 184px; max-width: calc(100vw - 24px); max-height: min(60vh, 420px); overflow-x: hidden; overflow-y: auto"
          >
            <bc-float-toolbar-item
              name="font-family"
              [value]="null"
              [active]="activeTypography.ff === null"
              >默认字体</bc-float-toolbar-item
            >
            @for (font of fontFamilies; track font.id) {
              <bc-float-toolbar-item
                name="font-family"
                [value]="font.id"
                [active]="activeTypography.ff === font.id"
                [style.font-family]="font.css"
                >{{ font.label }}</bc-float-toolbar-item
              >
            }
            <span class="bc-float-toolbar__divider"></span>
            <bc-float-toolbar-item
              name="more-font-settings"
              value="font-family"
              icon="bc_version_settings"
              >更多设置…</bc-float-toolbar-item
            >
          </bc-float-toolbar>
        </div>

        <ng-template #compactFontScaleTitle>
          <span class="responsive-more-menu__title">
            <i class="bc_icon bc_zihao"></i>
            <span>字号</span>
          </span>
        </ng-template>
        <div
          csSubmenu
          [csTitle]="compactFontScaleTitle"
          [csDisabled]="readonly || !canSetFontScale"
          csTriggerSubMenuAction="hover"
          csMenuClassName="bc-fixed-toolbar-submenu bc-fixed-toolbar-font-size-submenu"
          #compactFontScaleTrigger="csSubmenu"
        >
          <bc-float-toolbar
            [direction]="'column'"
            (onItemClick)="
              onFontSizeItemClicked(
                $event,
                compactFontScaleTrigger,
                responsiveMoreTrigger
              )
            "
            [gapAround]="0"
            styles="max-height: min(60vh, 420px); overflow-x: hidden; overflow-y: auto"
          >
            @for (size of quickFontSizePresets; track size) {
              <bc-float-toolbar-item
                name="font-size"
                [value]="size"
                [active]="activeFontSizePixels === size"
                >{{ size }}</bc-float-toolbar-item
              >
            }
            <span class="bc-float-toolbar__divider"></span>
            <bc-float-toolbar-item
              name="more-font-settings"
              value="font-size"
              icon="bc_version_settings"
              >更多设置…</bc-float-toolbar-item
            >
          </bc-float-toolbar>
        </div>

        <ng-template #compactLetterSpacingTitle>
          <span class="responsive-more-menu__title">
            <i class="bc_icon bc_zijianju"></i>
            <span>字符间距</span>
          </span>
        </ng-template>
        <div
          csSubmenu
          [csTitle]="compactLetterSpacingTitle"
          [csDisabled]="readonly || !allEditable"
          csTriggerSubMenuAction="hover"
          csMenuClassName="bc-fixed-toolbar-submenu"
          #compactLetterSpacingTrigger="csSubmenu"
        >
          <bc-float-toolbar
            [direction]="'column'"
            (onItemClick)="
              onLetterSpacingItemClicked(
                $event,
                compactLetterSpacingTrigger,
                responsiveMoreTrigger
              )
            "
            [gapAround]="0"
            styles="max-height: min(60vh, 420px); overflow-x: hidden; overflow-y: auto"
          >
            <bc-float-toolbar-item
              name="letter-spacing"
              [value]="null"
              [active]="activeTypography.ls === null"
              >默认（0em）</bc-float-toolbar-item
            >
            @for (spacing of quickLetterSpacingPresets; track spacing) {
              <bc-float-toolbar-item
                name="letter-spacing"
                [value]="spacing"
                [active]="activeTypography.ls === spacing"
                >{{ letterSpacingOptionLabel(spacing) }}</bc-float-toolbar-item
              >
            }
            <span class="bc-float-toolbar__divider"></span>
            <bc-float-toolbar-item
              name="more-font-settings"
              value="letter-spacing"
              icon="bc_version_settings"
              >更多设置…</bc-float-toolbar-item
            >
          </bc-float-toolbar>
        </div>

        <ng-template #compactLineHeightTitle>
          <span class="responsive-more-menu__title">
            <i class="bc_icon bc_hangjianju"></i>
            <span>行间距</span>
          </span>
        </ng-template>
        <div
          csSubmenu
          [csTitle]="compactLineHeightTitle"
          [csDisabled]="readonly || !canSetLineHeight"
          csTriggerSubMenuAction="hover"
          csMenuClassName="bc-fixed-toolbar-submenu"
          #compactLineHeightTrigger="csSubmenu"
        >
          <bc-float-toolbar
            [direction]="'column'"
            (onItemClick)="
              onLineHeightItemClicked(
                $event,
                compactLineHeightTrigger,
                responsiveMoreTrigger
              )
            "
            [gapAround]="0"
          >
            <bc-float-toolbar-item
              name="line-height"
              [value]="null"
              [active]="activeParagraphTypography.lh === null"
              >默认</bc-float-toolbar-item
            >
            @for (lineHeight of lineHeightPresets; track lineHeight) {
              <bc-float-toolbar-item
                name="line-height"
                [value]="lineHeight"
                [active]="activeParagraphTypography.lh === lineHeight"
                >{{ lineHeight }} 倍</bc-float-toolbar-item
              >
            }
            <span class="bc-float-toolbar__divider"></span>
            <bc-float-toolbar-item
              name="more-paragraph-settings"
              value="line-height"
              icon="bc_version_settings"
              >更多设置…</bc-float-toolbar-item
            >
          </bc-float-toolbar>
        </div>
      </div>
    </cs-dropdown-menu>

    <cs-dropdown-menu #textColorPicker="csDropdownMenu">
      <div class="toolbar-color-menu" aria-label="文字颜色面板" (mousedown)="$event.stopPropagation()">
        @if (activeColorPanel === 'color') {
          <cs-color-picker-panel csMode="palette"
            [csValue]="activeColors['color'] === 'var(--bc-color)' ? null : activeColors['color']"
            [csDisabled]="readonly || !allEditable" [csShowAlpha]="false"
            csClearText="自动" [(csRecentColors)]="recentTextColors"
            (csChangeComplete)="onColorPicked({type: 'color', color: $event.value})" />
        }
      </div>
    </cs-dropdown-menu>

    <cs-dropdown-menu #backgroundColorPicker="csDropdownMenu">
      <div class="toolbar-color-menu" aria-label="背景颜色面板" (mousedown)="$event.stopPropagation()">
        @if (activeColorPanel === 'backColor') {
          <cs-color-picker-panel csMode="palette"
            [csValue]="activeColors['backColor'] === 'transparent' ? null : activeColors['backColor']"
            [csDisabled]="readonly || !allEditable" [csShowAlpha]="false"
            csClearText="无背景色" [(csRecentColors)]="recentBackgroundColors"
            (csChangeComplete)="onColorPicked({type: 'backColor', color: $event.value})" />
          <div class="bc-color-group">
            <div class="bc-color-group-title">背景图形</div>
            <div class="bg-list">
              @for (item of bgGraphList; track item.attr) {
                <button type="button"
                  class="bg-graph-item"
                  [class]="item.class"
                  [class.active]="activeAttrs.get('bg') == item.attr"
                  [attr.aria-label]="item.title"
                  [csTooltip]="item.title"
                  [attr.aria-pressed]="activeAttrs.get('bg') == item.attr"
                  (click)="onBgGraphPicked(item.attr)"
                >
                  <span
                    [style.background-color]="
                      activeColors['backColor'] || '#f4a1a1'
                    "
                    [style.color]="activeColors['color'] || '#ffffff'"
                    >文本</span
                  >
                </button>
              }
            </div>
          </div>
        }
      </div>
    </cs-dropdown-menu>

    <cs-dropdown-menu #fontFamilyPicker="csDropdownMenu">
      <bc-float-toolbar
        [direction]="'column'"
        (onItemClick)="onFontFamilyItemClicked($event, fontFamilyTrigger)"
        [gapAround]="0"
        styles="box-sizing: border-box; width: max-content; min-width: 100%; max-width: calc(100vw - 24px); max-height: min(60vh, 420px); overflow-x: hidden; overflow-y: auto"
      >
        <bc-float-toolbar-item
          name="font-family"
          [value]="null"
          [active]="activeTypography.ff === null"
          title="默认字体"
          ><span>默认字体</span></bc-float-toolbar-item
        >
        @for (font of fontFamilies; track font.id) {
          <bc-float-toolbar-item
            name="font-family"
            [value]="font.id"
            [active]="activeTypography.ff === font.id"
            [style.font-family]="font.css"
            [title]="font.label"
            [attr.aria-label]="font.label"
            ><span>{{ font.label }}</span></bc-float-toolbar-item
          >
        }
        <span class="bc-float-toolbar__divider"></span>
        <bc-float-toolbar-item
          name="more-font-settings"
          value="font-family"
          icon="bc_version_settings"
          title="更多设置…"
          aria-label="更多设置…"
          ><span>更多设置…</span></bc-float-toolbar-item
        >
      </bc-float-toolbar>
    </cs-dropdown-menu>

    <cs-dropdown-menu #fontSizePicker="csDropdownMenu">
      <bc-float-toolbar
        [direction]="'column'"
        (onItemClick)="onFontSizeItemClicked($event, fontSizeTrigger)"
        [gapAround]="0"
        styles="box-sizing: border-box; width: 100%; max-height: min(60vh, 420px); overflow-x: hidden; overflow-y: auto"
      >
        @for (size of quickFontSizePresets; track size) {
          <bc-float-toolbar-item
            name="font-size"
            [value]="size"
            [active]="activeFontSizePixels === size"
            >{{ size }}</bc-float-toolbar-item
          >
        }
        <span class="bc-float-toolbar__divider"></span>
        <bc-float-toolbar-item
          name="more-font-settings"
          value="font-size"
          icon="bc_version_settings"
          title="更多设置…"
          aria-label="更多设置…"
        ></bc-float-toolbar-item>
      </bc-float-toolbar>
    </cs-dropdown-menu>

    <cs-dropdown-menu #letterSpacingPicker="csDropdownMenu">
      <bc-float-toolbar
        [direction]="'column'"
        (onItemClick)="onLetterSpacingItemClicked($event, letterSpacingTrigger)"
        [gapAround]="8"
        styles="box-sizing: border-box; width: 100%; max-height: min(60vh, 420px); overflow-x: hidden; overflow-y: auto"
      >
        <bc-float-toolbar-item
          name="letter-spacing"
          [value]="null"
          [active]="activeTypography.ls === null"
          >默认（0em）</bc-float-toolbar-item
        >
        @for (spacing of quickLetterSpacingPresets; track spacing) {
          <bc-float-toolbar-item
            name="letter-spacing"
            [value]="spacing"
            [active]="activeTypography.ls === spacing"
            >{{ letterSpacingOptionLabel(spacing) }}</bc-float-toolbar-item
          >
        }
        <span class="bc-float-toolbar__divider"></span>
        <bc-float-toolbar-item
          name="more-font-settings"
          value="letter-spacing"
          icon="bc_version_settings"
          >更多设置…</bc-float-toolbar-item
        >
      </bc-float-toolbar>
    </cs-dropdown-menu>

    <cs-dropdown-menu #lineHeightPicker="csDropdownMenu">
      <bc-float-toolbar
        [direction]="'column'"
        (onItemClick)="onLineHeightItemClicked($event, lineHeightTrigger)"
        [gapAround]="8"
      >
        <bc-float-toolbar-item
          name="line-height"
          [value]="null"
          [active]="activeParagraphTypography.lh === null"
          >默认</bc-float-toolbar-item
        >
        @for (lineHeight of lineHeightPresets; track lineHeight) {
          <bc-float-toolbar-item
            name="line-height"
            [value]="lineHeight"
            [active]="activeParagraphTypography.lh === lineHeight"
            >{{ lineHeight }} 倍</bc-float-toolbar-item
          >
        }
        <span class="bc-float-toolbar__divider"></span>
        <bc-float-toolbar-item
          name="more-paragraph-settings"
          value="line-height"
          icon="bc_version_settings"
          >更多设置…</bc-float-toolbar-item
        >
      </bc-float-toolbar>
    </cs-dropdown-menu>

    <cs-dropdown-menu #alignDropdown="csDropdownMenu">
      <bc-float-toolbar
        [direction]="'column'"
        (onItemClick)="onAlignItemClicked($event, alignTrigger)"
        [gapAround]="8"
      >
        @if (allEditable) {
          @for (item of alignActions; track item.value) {
            <bc-float-toolbar-item
              name="align"
              [value]="item.value"
              [icon]="item.icon"
              [active]="isAlignActive(item.value)"
              >{{ item.title }}</bc-float-toolbar-item
            >
          }
          <span class="bc-float-toolbar__divider"></span>
        }
        <bc-float-toolbar-item
          name="more-paragraph-settings"
          [value]="allEditable ? 'paragraph-align' : 'paragraph-spacing'"
          icon="bc_version_settings"
          >{{ allEditable ? "更多设置…" : "段落设置…" }}</bc-float-toolbar-item
        >
      </bc-float-toolbar>
    </cs-dropdown-menu>

    <cs-dropdown-menu #styleDropdown="csDropdownMenu">
      <bc-float-toolbar
        [direction]="'column'"
        (onItemClick)="onStyleItemClicked($event, styleTrigger)"
        [gapAround]="8"
      >
        @for (item of headingMenuList; track item.value) {
          <bc-float-toolbar-item
            [name]="item.name"
            [value]="item.value"
            [icon]="item.icon"
            [active]="isHeadingItemActive(item)"
            >{{ item.intro }}
          </bc-float-toolbar-item>
        }
      </bc-float-toolbar>
    </cs-dropdown-menu>
  `,
  styles: [
    `
      :host {
        position: relative;
        display: block;
        width: 100%;
        max-width: 100%;
        box-sizing: border-box;
        padding: var(--bc-fixed-toolbar-padding, 6px 8px);
        background: var(--bc-float-toolbar-bg);
        border: var(
          --bc-fixed-toolbar-border,
          1px solid var(--bc-float-toolbar-divider-color)
        );
        box-shadow: var(
          --bc-fixed-toolbar-shadow,
          0 6px 16px rgba(15, 15, 15, 0.08)
        );
        pointer-events: auto;
        transition: opacity 0.12s ease;
      }
      [hidden] {
        display: none !important;
      }
      .toolbar-surface {
        width: max-content;
        max-width: 100%;
        margin-inline: auto;
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }
      .toolbar-head {
        display: flex;
        align-items: center;
        flex: none;
        order: 1;
        gap: 2px;
        padding-inline-start: 6px;
        border-inline-start: 1px solid var(--bc-float-toolbar-divider-color);
      }
      .toolbar-head__actions {
        display: flex;
      }
      .toolbar-mode-switch[aria-expanded="true"] > i {
        transform: rotate(180deg);
      }
      .toolbar-mode-switch > i {
        font-size: 10px;
      }
      :host(.toolbar-mode--full) .toolbar-head {
        flex-direction: column;
        gap: 6px;
      }
      .toolbar-body {
        display: flex;
        align-items: stretch;
        justify-content: flex-start;
        flex: 0 1 auto;
        gap: 0;
        min-width: 0;
        overflow-x: auto;
        scrollbar-width: thin;
        scrollbar-color: var(--bc-float-toolbar-divider-color) transparent;
      }
      .toolbar-section {
        display: flex;
        align-items: stretch;
        flex: none;
        gap: 0;
        min-width: max-content;
      }
      .toolbar-group {
        display: flex;
        align-items: center;
        flex: none;
        padding-inline: 8px;
        border-inline-start: 1px solid var(--bc-float-toolbar-divider-color);
      }
      .toolbar-section--text > .toolbar-group:first-of-type {
        border: 0;
        padding-inline-start: 0;
      }
      .toolbar-section--insert > .toolbar-group:last-of-type {
        padding-inline-end: 0;
      }
      .toolbar-group__controls,
      .toolbar-row {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .toolbar-row {
        min-height: 28px;
        flex: none;
      }
      .toolbar-btn {
        flex: none;
        white-space: nowrap;
      }
      .toolbar-settings-entry {
        margin-inline-start: 4px;
      }
      :host(.toolbar-mode--full) .toolbar-settings-entry {
        margin-inline-start: 0;
      }
      :host(.toolbar-mode--full) .toolbar-row {
        justify-content: space-between;
      }
      :host(.toolbar-mode--full.toolbar-layout--wide)
        .toolbar-group--paragraph:not(.toolbar-group--spacing-collapsed)
        .toolbar-row:first-child > .toolbar-btn {
        flex: 1 1 0;
      }
      :host(.toolbar-mode--full)
        .toolbar-group--paragraph
        .toolbar-row:last-child
        > .toolbar-btn--dropdown {
        flex: 1 1 0;
        justify-content: space-between;
      }
      .toolbar-priority-hidden {
        display: none !important;
      }
      .toolbar-insert-menu {
        font-size: 12px;
        gap: 4px;
      }
      .toolbar-insert-label {
        display: none;
        font-size: 12px;
      }
      :host(.toolbar-mode--full) .toolbar-group__controls {
        display: grid;
        grid-template-rows: 28px 28px;
        gap: 6px;
      }
      :host(.toolbar-mode--full) .toolbar-row:nth-child(2) {
        grid-row: 2;
      }
      :host(.toolbar-mode--full)
        .toolbar-group--history
        .toolbar-group__controls {
        grid-auto-flow: column;
        grid-auto-columns: 28px;
        justify-items: center;
      }
      :host(.toolbar-mode--full) .toolbar-insert-label {
        display: inline;
      }
      :host(.toolbar-mode--full) .toolbar-insert-shortcut {
        gap: 4px;
      }
      :host(.toolbar-mode--full)
        .toolbar-group--reference
        .toolbar-group__controls {
        justify-items: center;
      }
      :host(.toolbar-mode--full)
        .toolbar-group--extensions
        .toolbar-group__controls {
        display: flex;
      }
      /* Each tier removes lower-priority shortcuts; all destinations remain in menus. */
      :host(:not(.toolbar-layout--wide)) .toolbar-control--wide-only,
      :host(:not(.toolbar-layout--wide)) [data-inline-action="strike"],
      :host(:not(.toolbar-layout--wide)) [data-inline-action="code"],
      :host(:not(.toolbar-layout--wide)) [data-list-action="todo"],
      :host(:not(.toolbar-layout--wide)) .toolbar-format-utility,
      :host(:not(.toolbar-layout--wide)) .toolbar-btn--style,
      :host(:not(.toolbar-layout--wide)) .toolbar-insert-shortcut--shape,
      :host(:not(.toolbar-layout--wide)) .toolbar-insert-shortcut--textbox,
      :host(:not(.toolbar-layout--wide)) .toolbar-insert-shortcut--wordart,
      :host(:not(.toolbar-layout--wide)) .toolbar-insert-shortcut--columns,
      :host(:not(.toolbar-layout--wide)) .toolbar-insert-shortcut--media {
        display: none;
      }
      :host(.toolbar-layout--balanced) .toolbar-insert-shortcut {
        display: none;
      }
      :host(.toolbar-mode--full.toolbar-layout--balanced)
        .toolbar-insert-shortcut--image,
      :host(.toolbar-mode--full.toolbar-layout--balanced)
        .toolbar-insert-shortcut--table,
      :host(.toolbar-mode--full.toolbar-layout--balanced)
        .toolbar-insert-shortcut--textbox {
        display: inline-flex;
      }
      /* Reflow the remaining paragraph commands when spacing shortcuts collapse. */
      :host(.toolbar-mode--full.toolbar-layout--wide)
        .toolbar-group--spacing-collapsed .toolbar-row,
      :host(.toolbar-mode--full.toolbar-layout--balanced)
        .toolbar-group--paragraph .toolbar-row {
        display: contents;
      }
      :host(.toolbar-mode--full.toolbar-layout--wide)
        .toolbar-group--spacing-collapsed .toolbar-group__controls,
      :host(.toolbar-mode--full.toolbar-layout--balanced)
        .toolbar-group--paragraph .toolbar-group__controls {
        grid-auto-flow: column;
        grid-auto-columns: max-content;
      }
      :host(.toolbar-mode--full.toolbar-layout--wide)
        .toolbar-group--spacing-collapsed .toolbar-settings-entry--paragraph,
      :host(.toolbar-mode--full.toolbar-layout--balanced)
        .toolbar-settings-entry--paragraph {
        grid-row: 2;
      }
      :host(.toolbar-mode--full)
        .toolbar-group--formula-collapsed .toolbar-group__controls {
        grid-template-rows: 28px;
      }
      :host(.toolbar-layout--compact) .toolbar-group--font,
      :host(.toolbar-layout--narrow) .toolbar-group--font {
        border-inline-start: 0;
        padding-inline-start: 0;
      }
      :host(.toolbar-layout--compact) .toolbar-btn--font-family,
      :host(.toolbar-layout--narrow) .toolbar-btn--font-family,
      :host(.toolbar-layout--compact) .toolbar-group--history,
      :host(.toolbar-layout--narrow) .toolbar-group--history,
      :host(.toolbar-layout--compact) .toolbar-list-control,
      :host(.toolbar-layout--narrow) .toolbar-list-control,
      :host(.toolbar-layout--narrow) .toolbar-align-control,
      :host(.toolbar-layout--compact) .toolbar-insert-shortcut,
      :host(.toolbar-layout--narrow) .toolbar-insert-shortcut,
      :host(.toolbar-layout--compact) .toolbar-group--extensions,
      :host(.toolbar-layout--narrow) .toolbar-group--extensions {
        display: none;
      }
      :host(.toolbar-layout--compact) .toolbar-group,
      :host(.toolbar-layout--narrow) .toolbar-group {
        padding-inline: 4px;
      }
      :host(.toolbar-layout--narrow) [data-inline-action="italic"],
      :host(.toolbar-layout--narrow) [data-inline-action="underline"],
      :host(.toolbar-layout--compact) .toolbar-color-control,
      :host(.toolbar-layout--narrow) .toolbar-color-control {
        display: none;
      }
      :host(.toolbar-layout--narrow) .toolbar-btn {
        padding-inline: 4px;
      }
      :host(.toolbar-layout--narrow) .toolbar-insert-menu .toolbar-btn__caret {
        display: none;
      }
      :host(:not(.toolbar-mode--full).toolbar-layout--narrow) .toolbar-group--paragraph {
        display: none;
      }
      :host(.toolbar-layout--compact) .toolbar-btn--font-size,
      :host(.toolbar-layout--narrow) .toolbar-btn--font-size {
        border: 0;
      }
      :host(.toolbar-mode--full.toolbar-layout--balanced)
        .toolbar-group--font
        .toolbar-group__controls {
        grid-template-columns: repeat(6, 28px);
        column-gap: 4px;
      }
      :host(.toolbar-mode--full.toolbar-layout--balanced)
        .toolbar-group--font
        .toolbar-row {
        display: contents;
      }
      :host(.toolbar-mode--full.toolbar-layout--balanced) .toolbar-font-combo {
        grid-column: 1 / -1;
        grid-row: 1;
        justify-self: start;
      }
      :host(.toolbar-mode--full.toolbar-layout--balanced)
        [data-inline-action="bold"] {
        grid-row: 2;
        grid-column: 1;
      }
      :host(.toolbar-mode--full.toolbar-layout--balanced)
        [data-inline-action="italic"] {
        grid-row: 2;
        grid-column: 2;
      }
      :host(.toolbar-mode--full.toolbar-layout--balanced)
        [data-inline-action="underline"] {
        grid-row: 2;
        grid-column: 3;
      }
      :host(.toolbar-mode--full.toolbar-layout--balanced)
        .toolbar-color-control--text {
        grid-row: 2;
        grid-column: 4;
      }
      :host(.toolbar-mode--full.toolbar-layout--balanced)
        .toolbar-color-control--background {
        grid-row: 2;
        grid-column: 5;
      }
      :host(.toolbar-mode--full.toolbar-layout--balanced)
        .toolbar-settings-entry--text {
        grid-row: 2;
        grid-column: 6;
      }
      /* At the smallest width, keep format commands above the group launchers. */
      :host(.toolbar-mode--full.toolbar-layout--compact) .toolbar-body,
      :host(.toolbar-mode--full.toolbar-layout--narrow) .toolbar-body {
        display: grid;
        grid-template-rows: 28px 28px;
        grid-auto-columns: max-content;
        gap: 6px 4px;
        justify-content: start;
      }
      :host(.toolbar-mode--full.toolbar-layout--compact) .toolbar-section,
      :host(.toolbar-mode--full.toolbar-layout--narrow) .toolbar-section,
      :host(.toolbar-mode--full.toolbar-layout--compact) .toolbar-group--font,
      :host(.toolbar-mode--full.toolbar-layout--narrow) .toolbar-group--font,
      :host(.toolbar-mode--full.toolbar-layout--compact)
        .toolbar-group--paragraph,
      :host(.toolbar-mode--full.toolbar-layout--narrow)
        .toolbar-group--paragraph,
      :host(.toolbar-mode--full.toolbar-layout--compact) .toolbar-group--insert,
      :host(.toolbar-mode--full.toolbar-layout--narrow) .toolbar-group--insert,
      :host(.toolbar-mode--full.toolbar-layout--compact)
        .toolbar-group__controls,
      :host(.toolbar-mode--full.toolbar-layout--narrow)
        .toolbar-group__controls,
      :host(.toolbar-mode--full.toolbar-layout--compact) .toolbar-row,
      :host(.toolbar-mode--full.toolbar-layout--narrow) .toolbar-row {
        display: contents;
      }
      :host(.toolbar-mode--full.toolbar-layout--compact) .toolbar-align-control,
      :host(.toolbar-mode--full.toolbar-layout--narrow) .toolbar-align-control {
        display: none;
      }
      :host(.toolbar-mode--full.toolbar-layout--compact) .toolbar-font-combo,
      :host(.toolbar-mode--full.toolbar-layout--narrow) .toolbar-font-combo {
        grid-row: 1;
        grid-column: 1;
      }
      :host(.toolbar-mode--full.toolbar-layout--compact)
        [data-inline-action="bold"],
      :host(.toolbar-mode--full.toolbar-layout--narrow)
        [data-inline-action="bold"] {
        grid-row: 1;
        grid-column: 2;
      }
      :host(.toolbar-mode--full.toolbar-layout--compact)
        [data-inline-action="italic"],
      :host(.toolbar-mode--full.toolbar-layout--narrow)
        [data-inline-action="italic"] {
        display: inline-flex;
        grid-row: 1;
        grid-column: 3;
      }
      :host(.toolbar-mode--full.toolbar-layout--compact)
        [data-inline-action="underline"],
      :host(.toolbar-mode--full.toolbar-layout--narrow)
        [data-inline-action="underline"] {
        display: inline-flex;
        grid-row: 1;
        grid-column: 4;
      }
      :host(.toolbar-mode--full.toolbar-layout--compact) .toolbar-color-control,
      :host(.toolbar-mode--full.toolbar-layout--narrow) .toolbar-color-control {
        display: inline-flex;
        grid-row: 1;
        grid-column: 5;
      }
      :host(.toolbar-mode--full.toolbar-layout--compact) .toolbar-color-control--background,
      :host(.toolbar-mode--full.toolbar-layout--narrow) .toolbar-color-control--background {
        grid-column: 6;
      }
      :host(.toolbar-mode--full.toolbar-layout--compact)
        .toolbar-settings-entry--text,
      :host(.toolbar-mode--full.toolbar-layout--narrow)
        .toolbar-settings-entry--text {
        grid-row: 2;
        grid-column: 1;
        margin-inline-start: 0;
      }
      :host(.toolbar-mode--full.toolbar-layout--compact)
        .toolbar-settings-entry--paragraph,
      :host(.toolbar-mode--full.toolbar-layout--narrow)
        .toolbar-settings-entry--paragraph {
        grid-row: 2;
        grid-column: 2;
        margin-inline-start: 0;
      }
      :host(.toolbar-mode--full.toolbar-layout--compact) .toolbar-insert-menu,
      :host(.toolbar-mode--full.toolbar-layout--narrow) .toolbar-insert-menu {
        grid-row: 2;
        grid-column: 3 / 7;
        justify-self: start;
      }

      :host(.hidden) {
        opacity: 0;
        visibility: hidden;
      }

      :host(.readonly) {
        opacity: 0.6;
        pointer-events: none;
      }

      .toolbar-btn {
        height: 28px;
        min-width: 28px;
        border-radius: 6px;
        background: transparent;
        color: var(--bc-float-toolbar-item-color);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all var(--bc-transition-fast);
        padding: 0 6px;
        line-height: 1;
        border: 0;
      }

      .toolbar-btn:hover:not(:disabled),
      .toolbar-btn.cs-dropdown-trigger-open:not(:disabled) {
        background: var(--bc-float-toolbar-item-hover-bg);
      }

      .toolbar-split {
        display: inline-flex;
        align-items: center;
        border-radius: 6px;
        transition: background-color var(--bc-transition-fast);
      }

      .toolbar-split:hover:not(.toolbar-split--disabled),
      .toolbar-split--open:not(.toolbar-split--disabled) {
        background: var(--bc-float-toolbar-item-hover-bg);
      }

      .toolbar-split:hover:not(.toolbar-split--disabled) .toolbar-btn,
      .toolbar-split--open:not(.toolbar-split--disabled) .toolbar-btn {
        background: transparent;
      }

      .toolbar-split.active {
        background: var(--bc-float-toolbar-item-active-bg);
      }

      .toolbar-split__main {
        padding-right: 2px;
        border-top-right-radius: 0;
        border-bottom-right-radius: 0;
      }

      .toolbar-split__caret {
        min-width: 16px;
        padding-right: 4px;
        padding-left: 0;
        border-top-left-radius: 0;
        border-bottom-left-radius: 0;
      }

      .toolbar-split:hover:not(.toolbar-split--disabled)
        .toolbar-split__caret:hover,
      .toolbar-split--open:not(.toolbar-split--disabled) .toolbar-split__caret {
        color: var(--bc-active-color);
        background: var(--bc-float-toolbar-item-active-bg);
        box-shadow: inset 0 0 0 1px var(--bc-active-color-lighter);
      }

      .toolbar-btn:focus-visible {
        outline: 2px solid var(--bc-active-color);
        outline-offset: -2px;
      }

      .toolbar-btn.active {
        background: var(--bc-float-toolbar-item-active-bg);
        color: var(--bc-active-color);
      }

      .toolbar-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .toolbar-btn > i {
        font-size: 14px;
        color: inherit;
      }

      .toolbar-btn__caret {
        font-size: 10px !important;
        opacity: 0.6;
        flex-shrink: 0;
      }

      .toolbar-btn__leading {
        flex-shrink: 0;
      }

      .toolbar-btn__scale {
        font-size: 12px;
        text-align: center;
      }

      .toolbar-btn__value {
        min-width: 26px;
        font-size: 11px;
        text-align: center;
      }

      .toolbar-btn--dropdown {
        gap: 4px;
      }

      .toolbar-btn--style {
        gap: 4px;
        min-width: 96px;
        border: 1px solid var(--bc-border-color);
      }

      .toolbar-font-combo {
        display: inline-flex;
        align-items: center;
        height: 28px;
        box-sizing: border-box;
        overflow: hidden;
        border: 1px solid var(--bc-border-color);
        border-radius: 6px;
      }

      .toolbar-font-combo__control {
        height: 26px;
        gap: 4px;
        border-radius: 0;
      }

      .toolbar-font-combo__control + .toolbar-font-combo__control {
        border-left: 1px solid var(--bc-border-color);
      }

      .toolbar-btn--font-family {
        width: ${FIXED_TOOLBAR_FONT_FAMILY_WIDTH}px;
      }

      .toolbar-btn--font-size {
        width: max-content;
        min-width: ${FIXED_TOOLBAR_FONT_SIZE_MIN_WIDTH}px;
      }

      .toolbar-btn--letter-spacing {
        width: 92px;
        min-width: 92px;
      }

      .toolbar-btn--style > span {
        overflow: hidden;
        font-size: 12px;
        flex: 1;
        line-height: 1;
        text-align: left;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .toolbar-font-combo__control > span {
        min-width: 0;
        overflow: hidden;
        flex: 1;
        font-size: 12px;
        line-height: 1;
        text-align: left;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .toolbar-btn--font-size > span {
        flex: 0 0 auto;
        overflow: visible;
        text-overflow: clip;
      }

      .toolbar-btn--style > i:last-child {
        font-size: 10px;
        opacity: 0.6;
      }

      .toolbar-divider {
        width: 1px;
        height: 20px;
        background: var(--bc-float-toolbar-divider-color);
        margin: 0 2px;
        flex-shrink: 0;
      }

      .responsive-more-menu {
        min-width: 176px;
      }

      .responsive-more-menu__title {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }

      .bg-list {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }

      .toolbar-color-control {
        position: relative;
      }
      .toolbar-color-control > .bc_icon,
      .toolbar-color-control > cs-icon {
        transform: translateY(-2px);
      }
      .toolbar-color-indicator {
        position: absolute;
        inset-inline: 6px;
        bottom: 3px;
        height: 3px;
        border: 1px solid var(--bc-border-color);
        border-radius: 1px;
        box-sizing: border-box;
        pointer-events: none;
      }
      .toolbar-color-menu {
        width: max-content;
        max-width: calc(100vw - 40px);
        box-sizing: border-box;
        padding: 4px;
        border-radius: 8px;
        background: var(--bc-float-toolbar-bg);
        box-shadow: var(--bc-float-toolbar-shadow);
        color: var(--bc-color);
        font-size: var(--bc-fs-xs);
      }

      .toolbar-color-menu .bc-color-group {
        margin: 0 8px 8px;
        padding-top: 10px;
        border-top: 1px solid var(--bc-border-color);
      }

      .bc-color-group-title {
        margin-bottom: 7px;
        color: var(--bc-color-light);
        font-size: var(--bc-fs-xs);
      }

      .bg-graph-item {
        padding: 0;
        box-sizing: border-box;
        background: transparent;
        width: 46px;
        height: 27px;
        border-radius: 2px;
        border: 1px solid var(--bc-border-color);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }

      .bg-graph-item.active {
        border: 2px solid var(--bc-active-color);
      }

      .bg-graph-item:hover {
        border: 2px solid var(--bc-active-color-light);
      }

      .bg-graph-item > span {
        width: 35px;
        height: 16px;
        font-size: 11px;
        color: #fff;
        text-align: center;
        background-color: #f4a1a1;
      }

      .bg-graph-item.none {
        background: linear-gradient(
          -29deg,
          transparent 49%,
          var(--bc-color-dark) 50%,
          transparent 51%
        );
      }

      .bg-graph-item.none > span {
        display: none;
      }

      .bg-graph-item.radius-1 > span {
        border-radius: 1em;
      }

      .bg-graph-item.right-border > span {
        border-radius: 0.3em;
        border-right: 0.25em solid var(--bc-active-color);
      }
    `,
  ],
  standalone: true,
  imports: [
    CsDropdownDirective,
    CsDropdownMenuComponent,
    CsMenuDirective,
    CsMenuItemComponent,
    CsSubmenuComponent,
    CsTooltipDirective,
    BcFloatToolbarComponent,
    BcFloatToolbarItemComponent,
    CsColorPickerPanelComponent,
    CsIconComponent,
    BcTableSizePickerComponent,
    BcColumnCountPickerComponent,
    BcOrderedMarkerPickerComponent,
    ShapePickerComponent,
    TextBoxPresetPickerComponent,
    WordArtPresetPickerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    contenteditable: "false",
    "[class.readonly]": "readonly",
    "[class.hidden]": "!visible",
    "[class.toolbar-mode--full]": "toolbarMode === 'full'",
    "[class.toolbar-layout--wide]": "toolbarLayout === 'wide'",
    "[class.toolbar-layout--balanced]": "toolbarLayout === 'balanced'",
    "[class.toolbar-layout--compact]": "toolbarLayout === 'compact'",
    "[class.toolbar-layout--narrow]": "toolbarLayout === 'narrow'",
    "[style.--bc-fixed-toolbar-top.px]": "stickyTop",
    "(mousedown)": "onToolbarMouseDown($event)",
  },
})
export class FixedTextToolbarComponent implements OnInit, AfterViewInit, OnDestroy {
  protected overflowedGroups = new Set<string>();
  private _overflowStep = 0;
  // Collapse specialist commands first; link remains independent of formula.
  private readonly simpleOverflowGroups = [
    ["spacing", "formula"],
    ["media"],
    ["wordart"],
    ["columns"],
    ["shape"],
    ["textbox"],
    ["script"],
    ["utilities"],
    ["style"],
  ];
  private readonly fullOverflowGroups = [
    ["spacing", "formula"],
    ["media", "wordart"],
    ["shape", "columns"],
    ["reference"],
    ["utilities", "script", "style"],
  ];

  private readonly _sub = new Subscription();
  private _toolbarHelper?: TextToolbarHelper;
  private _formatBrushPayload: IFormatBrushPayload | null = null;
  private _formatBrushSourceKey: string | null = null;
  private _formatBrushLastAppliedKey: string | null = null;
  private _isApplyingFormatBrush = false;
  private _objectDrawInsert?: ObjectDrawInsertController;
  private _resizeObserver?: ResizeObserver;
  private _layoutFitFrame: number | null = null;
  private _observedToolbarWidth = -1;
  private _typographySettings?: TypographySettingsController;
  protected toolbarLayout: "wide" | "balanced" | "compact" | "narrow" = "wide";
  private _toolbarMode: "simple" | "full" = "full";

  @Input()
  get toolbarMode(): "simple" | "full" { return this._toolbarMode; }
  set toolbarMode(mode: "simple" | "full") {
    if (mode === this._toolbarMode) return;
    this._toolbarMode = mode;
    this.resetToolbarLayout();
    this.scheduleToolbarFit();
  }

  /** 仅用户点击切换时发出；宿主负责保存个人偏好。 */
  @Output() toolbarModeChange = new EventEmitter<"simple" | "full">();
  // Keep two-row tooltips outside the command rows, including after modal focus restoration.
  protected get fontActionsTooltipPlacement(): "top" | "bottom" {
    return this.toolbarMode === "full" &&
      (this.toolbarLayout === "wide" || this.toolbarLayout === "balanced")
      ? "bottom"
      : "top";
  }

  protected orderedMarkerDropdownOpen = false;
  protected scriptDropdownOpen = false;
  private preferredScriptValue: TScriptToggle = "sup";

  constructor(
    private readonly cdr: ChangeDetectorRef,
    private readonly hostRef?: ElementRef<HTMLElement>,
    @Optional() private readonly modalService?: CsModalService,
    @Optional() private readonly zone?: NgZone,
  ) {}

  @Input({ required: true })
  doc!: BlockCraft.Doc;

  @Input()
  utils?: TextToolbarHelper;

  @Input()
  readonly = false;

  @Input()
  stickyTop = 0;

  @Input()
  visible = true;

  @Input()
  activeAttrs = new Map<string, any>();

  @Input()
  activeColors: Record<string, string | null> = {};

  @Input()
  activeProps: Partial<IEditableBlockProps> = {};

  protected activeTypography: IInlineTypographyState = {
    ff: null,
    fs: null,
    ls: null,
  };

  protected activeParagraphTypography: IParagraphTypographyState = {
    pfs: null,
    lh: null,
    psb: null,
    psa: null,
  };

  protected readonly fontFamilies = TYPOGRAPHY_FONT_FAMILIES;
  protected readonly quickFontSizePresets = FIXED_TOOLBAR_FONT_SIZE_PRESETS;
  protected readonly fontSizeDropdownStyle = {width: "min-content"};
  protected activeFontWeight: number | null | undefined = null;
  protected activeFontSizePixels: number | undefined = undefined;
  protected readonly quickLetterSpacingPresets =
    FIXED_TOOLBAR_LETTER_SPACING_PRESETS;
  protected readonly lineHeightPresets = PARAGRAPH_LINE_HEIGHT_PRESETS;
  @Input()
  activeFlavour: BlockCraft.BlockFlavour = "paragraph";

  @Input()
  allEditable = false;

  /** 行间距属于块属性；混合选区中存在一个可编辑文本块即可执行。 */
  canSetLineHeight = false;
  canSetParagraphSpacing = false;

  /** 字体缩放支持完整段落、局部文字与光标三种目标。 */
  canSetFontScale = false;

  canTransformBlocks = false;

  canUseColumns = false;

  /** 分栏按钮回显的栏数：选区在分栏内为当前栏数，否则为 1（单栏） */
  columnPickerCurrent = 1;

  @Input()
  isLinkAble = false;
  protected formulaActive = false;
  private closeReferencePad?: () => void;
  private colorSelection?: ToolbarSelectionSession;
  private restoreColorOnClose = false;

  private _hasTextSelection = false;

  @Input()
  set hasTextSelection(value: boolean) {
    this._hasTextSelection = value;
  }

  get hasTextSelection() {
    return this._hasTextSelection;
  }

  @Input()
  selectionJSON: ISelectionJSON | null = null;

  @Input()
  extensionActions: IFixedToolbarExtensionAction[] = [];

  @Output()
  extensionAction = new EventEmitter<IFixedToolbarExtensionActionContext>();

  protected readonly headingMenuList = HEADING_MENU_LIST;
  protected readonly inlineToggleActions = INLINE_TOGGLE_ACTIONS;
  protected readonly narrowInlineActions = NARROW_INLINE_ACTIONS;
  protected readonly scriptActions = SCRIPT_ACTIONS;
  protected readonly listActions = LIST_ACTIONS;
  protected readonly alignActions = ALIGN_ACTIONS;
  protected readonly bgGraphList = BG_GRAPH_LIST;
  protected formatBrushActive = false;
  private _destroyed = false;
  private readonly typographyContextIds = new Set<string>();

  protected get formatBrushTitle() {
    return `格式刷（${IS_MAC ? "⌘" : "Ctrl"}+Shift+C）`;
  }

  ngOnInit() {
    this._destroyed = false;
    this.syncToolbarState(this.doc.selection.value);

    this._sub.add(
      this.doc.selection.changeObserve().subscribe(
        debounce((sel) => {
          this.handleSelectionChange(sel);
        }, 40),
      ),
    );

    if (this.doc.model?.contentChange$) {
      this._sub.add(this.doc.model.contentChange$.pipe(
        filter(change => change.blockIds.some((id: string) => this.typographyContextIds.has(id))),
        debounceTime(40),
      ).subscribe(() => this.syncToolbarState(this.doc.selection.value)));
    }

    this._sub.add(
      this.doc.event.add("selectEnd", () => {
        void this.tryApplyFormatBrush(this.doc.selection.value);
      }),
    );

    this._sub.add(
      this.doc.readonlySwitch$.subscribe((readonly) => {
        this.readonly = readonly;
        if (readonly) {
          this._typographySettings?.close();
          this.colorSelection?.dispose();
          this.textColorTrigger?.close();
          this.backgroundColorTrigger?.close();
          this.clearFormatBrush();
          this._objectDrawInsert?.cancel();
        }
        this.cdr.markForCheck();
      }),
    );

    this._sub.add(
      fromEvent<KeyboardEvent>(document, "keydown", {capture: true}).subscribe((evt) => {
        if (evt.key === "Escape" && this.colorPanelOpen) {
          const trigger = this.activeColorPanel === 'color' ? this.textColorTrigger : this.backgroundColorTrigger;
          this.restoreColorOnClose = true;
          trigger?.close();
          evt.preventDefault();
          evt.stopPropagation();
        }
      }),
    );
    this._sub.add(
      fromEvent<KeyboardEvent>(document, "keydown").subscribe((evt) => {
        if (this.isNativeInputTarget(evt.target)) return;

        if (this.isFormatBrushHotkey(evt)) {
          if (this.formatBrushActive || !this.canCaptureFormatBrush()) return;
          evt.preventDefault();
          this.activateFormatBrush();
          return;
        }

        if (evt.key !== "Escape" || !this.formatBrushActive) return;
        evt.preventDefault();
        this.clearFormatBrush();
        this.cdr.markForCheck();
      }),
    );
  }

  ngAfterViewInit(): void {
    this.observeToolbarWidth();
  }

  ngOnDestroy() {
    this._destroyed = true;
    this._typographySettings?.close();
    this.colorSelection?.dispose();
    this.closeReferencePad?.();
    const view = this.hostRef?.nativeElement.ownerDocument.defaultView;
    if (view && this._layoutFitFrame !== null) {
      view.cancelAnimationFrame(this._layoutFitFrame);
      this._layoutFitFrame = null;
    }
    this._typographySettings?.destroy();
    this._resizeObserver?.disconnect();
    this._resizeObserver = undefined;
    this.clearFormatBrush();
    this._objectDrawInsert?.destroy();
    this._objectDrawInsert = undefined;
    this._sub.unsubscribe();
  }

  protected setToolbarMode(mode: "simple" | "full"): void {
    if (mode === this.toolbarMode) return;
    this.toolbarMode = mode;
    this.toolbarModeChange.emit(mode);
  }

  private observeToolbarWidth(): void {
    const host = this.hostRef?.nativeElement;
    if (!host || typeof ResizeObserver === "undefined") return;
    const observe = () => {
      this._resizeObserver = new ResizeObserver((entries) => {
        const hostEntry = entries.find((entry) => entry.target === host);
        const width = hostEntry?.contentRect.width;
        if (
          width !== undefined &&
          Math.abs(width - this._observedToolbarWidth) > 0.5
        ) {
          this._observedToolbarWidth = width;
          this.resetToolbarLayout();
        }
        this.scheduleToolbarFit();
      });
      this._resizeObserver.observe(host);
      // Projected content, extension actions and font labels can resize independently of the host.
      host
        .querySelectorAll<HTMLElement>(".toolbar-section")
        .forEach((section) => this._resizeObserver!.observe(section));
    };
    this.zone ? this.zone.runOutsideAngular(observe) : observe();
  }

  private resetToolbarLayout(): void {
    const reset = () => {
      this.toolbarLayout = "wide";
      this.overflowedGroups = new Set();
      this._overflowStep = 0;
      this.cdr.markForCheck();
    };
    this.zone ? this.zone.run(reset) : reset();
  }

  private collapseNextPriorityGroup(): boolean {
    const groups =
      this.toolbarMode === "full"
        ? this.fullOverflowGroups
        : this.simpleOverflowGroups;
    const next = groups[this._overflowStep];
    if (!next || this.toolbarLayout !== "wide") return false;
    const collapse = () => {
      this._overflowStep++;
      this.overflowedGroups = new Set([...this.overflowedGroups, ...next]);
      this.cdr.markForCheck();
    };
    this.zone ? this.zone.run(collapse) : collapse();
    return true;
  }

  private updateToolbarLayout(
    layout: "wide" | "balanced" | "compact" | "narrow",
  ): void {
    if (layout === this.toolbarLayout) return;
    const update = () => {
      this.toolbarLayout = layout;
      this.overflowedGroups = new Set();
      this.cdr.markForCheck();
    };
    this.zone ? this.zone.run(update) : update();
  }

  private scheduleToolbarFit(): void {
    const host = this.hostRef?.nativeElement;
    const view = host?.ownerDocument.defaultView;
    if (!host || !view || this._destroyed || this._layoutFitFrame !== null)
      return;
    const schedule = () => {
      this._layoutFitFrame = view.requestAnimationFrame(() => {
        this._layoutFitFrame = null;
        if (this._destroyed || !this.hasVisibleToolbarOverflow(host)) return;
        if (this.collapseNextPriorityGroup()) {
          this.scheduleToolbarFit();
          return;
        }
        const nextLayout = this.nextToolbarLayout(this.toolbarLayout);
        if (!nextLayout) return;
        this.updateToolbarLayout(nextLayout);
        this.scheduleToolbarFit();
      });
    };
    this.zone ? this.zone.runOutsideAngular(schedule) : schedule();
  }

  private hasVisibleToolbarOverflow(host: HTMLElement): boolean {
    // Only command content participates; CDK template hosts are outside the surface.
    const body = host.querySelector<HTMLElement>(".toolbar-body");
    return !!body && body.scrollWidth > body.clientWidth + 1;
  }

  protected nextToolbarLayout(
    layout: "wide" | "balanced" | "compact" | "narrow",
  ): "balanced" | "compact" | "narrow" | null {
    if (layout === "wide") return "balanced";
    if (layout === "balanced") return "compact";
    if (layout === "compact") return "narrow";
    return null;
  }

  protected get activeStyleItem(): IStyleMenuItem {
    const heading = this.activeProps.heading;
    if (typeof heading === "number" && heading > 0 && heading <= 4) {
      return (
        HEADING_MENU_LIST.find((item) => item.value === heading) ||
        HEADING_MENU_LIST[0]
      );
    }
    return HEADING_MENU_LIST[0];
  }

  protected onToolbarMouseDown(evt: MouseEvent) {
    const target = evt.target as HTMLElement | null;
    if (!target) return;
    if (target.closest("input,select,textarea")) return;
    evt.preventDefault();
    evt.stopPropagation();
  }

  protected onActionMouseDown(evt: MouseEvent) {
    evt.preventDefault();
    evt.stopPropagation();
  }

  protected undo() {
    if (this.readonly) return;
    this.doc.crud.undoManager.undo();
  }

  protected redo() {
    if (this.readonly) return;
    this.doc.crud.undoManager.redo();
  }

  protected isHeadingItemActive(item: IStyleMenuItem): boolean {
    if (item.value === null) {
      return !this.activeProps.heading;
    }
    return this.activeProps.heading === item.value;
  }

  protected onStyleItemClicked(
    item: BcFloatToolbarItemComponent,
    trigger: IToolbarPopupController,
  ) {
    trigger.close();
    this.runWithSelection(
      () => {
        this.toolbarHelper.updateBlockProps({
          heading: item.value || undefined,
        });
      },
      { allowBlockTransform: true },
    );
  }

  protected isAttrActive(name: string) {
    return this.activeAttrs.has(name) && this.activeAttrs.get(name) !== null;
  }

  protected toggleInlineAttr(name: TInlineToggle) {
    const active = this.isAttrActive(name);
    this.runWithSelection(() => {
      this.toolbarHelper.formatText({
        [`a:${name}`]: active ? null : true,
      } as IInlineNodeAttrs);
    });
  }

  protected onNarrowInlineItemClicked(
    item: BcFloatToolbarItemComponent,
    trigger: IToolbarPopupController,
  ) {
    trigger.close();
    const value = item.value as TInlineToggle;
    if (value === "sup" || value === "sub") {
      this.toggleScriptAttr(value);
      return;
    }
    this.toggleInlineAttr(value);
  }

  protected get activeScriptAction(): IToolbarIconAction<TScriptToggle> {
    const selectedValue = this.isAttrActive("sub")
      ? "sub"
      : this.isAttrActive("sup")
        ? "sup"
        : this.preferredScriptValue;
    return SCRIPT_ACTIONS.find((item) => item.value === selectedValue)!;
  }

  protected toggleScriptAttr(value: TScriptToggle) {
    const active = this.isAttrActive(value);
    const other: TScriptToggle = value === "sup" ? "sub" : "sup";
    this.preferredScriptValue = value;
    this.runWithSelection(() => {
      this.toolbarHelper.formatText({
        [`a:${value}`]: active ? null : true,
        [`a:${other}`]: null,
      } as IInlineNodeAttrs);
    });
  }

  protected onScriptItemClicked(
    item: BcFloatToolbarItemComponent,
    trigger: IToolbarPopupController,
  ) {
    trigger.close();
    this.toggleScriptAttr(item.value as TScriptToggle);
  }

  protected setList(flavour: TListFlavour) {
    this.runWithSelection(
      () => {
        this.toolbarHelper.transformBlocks(
          this.activeFlavour === flavour ? "paragraph" : flavour,
        );
      },
      { allowBlockTransform: true },
    );
  }

  /** Common marker preset for the selected ordered blocks; undefined means mixed/not applicable. */
  protected get activeOrderedMarkerStyle():
    | OrderedMarkerStyleId
    | null
    | undefined {
    const selection = this.doc?.selection?.value;
    if (this.activeFlavour !== "ordered" || !selection) return undefined;
    let initialized = false;
    let common: OrderedMarkerStyleId | null = null;
    let selectedIds: string[];
    try {
      selectedIds = this.getSelectedBlockIds(selection);
    } catch {
      return undefined;
    }
    for (const blockId of selectedIds) {
      if (this.doc.model.getFlavour(blockId) !== "ordered") continue;
      const props = this.doc.model.getProps(blockId) as IBlockProps | null;
      const current = isOrderedMarkerStyleId(props?.["ms"])
        ? (props!["ms"] as OrderedMarkerStyleId)
        : null;
      if (!initialized) {
        initialized = true;
        common = current;
      } else if (common !== current) {
        return undefined;
      }
    }
    return initialized ? common : undefined;
  }

  protected applyOrderedMarker(
    style: OrderedMarkerStyleId | null,
    trigger: IToolbarPopupController,
  ) {
    trigger.close();
    this.runWithSelection(
      () => {
        const selection = this.doc.selection.value;
        if (!selection) return;
        const selectedIds = this.getSelectedBlockIds(selection);
        const orderedIds = selectedIds.filter(
          (id) => this.doc.model.getFlavour(id) === "ordered",
        );
        applyOrderedMarkerStyle(this.doc, orderedIds, style);

        if (orderedIds.length !== selectedIds.length) {
          this.toolbarHelper.transformBlocks("ordered", selection, {
            ms: style,
          });
        }
      },
      { allowBlockTransform: true },
    );
  }

  protected isAlignActive(align: TAlignValue) {
    if (align === "left") return !this.activeProps.textAlign;
    return this.activeProps.textAlign === align;
  }

  protected get activeAlignAction(): IToolbarIconAction<TAlignValue> {
    return (
      ALIGN_ACTIONS.find((item) => this.isAlignActive(item.value)) ??
      ALIGN_ACTIONS[0]
    );
  }

  protected onAlignItemClicked(
    item: BcFloatToolbarItemComponent,
    trigger: IToolbarPopupController,
  ) {
    if (item.name === "more-paragraph-settings") {
      this.closePopupBeforeSettings(trigger);
      this.openParagraphSettings(item.value as ParagraphSettingsTarget);
      return;
    }
    trigger.close();
    const align = ALIGN_ACTIONS.find((action) => action.value === item.value);
    if (align) this.setAlign(align.value);
  }

  protected setAlign(align: TAlignValue) {
    this.runWithSelection(() => {
      this.toolbarHelper.updateBlockProps({
        textAlign: align === "left" ? undefined : align,
      });
    });
  }

  protected onColorPicked(evt: {
    type: string;
    color: string | null;
  }) {
    this.colorSelection?.run(() => {
      switch (evt.type) {
        case "color":
          this.toolbarHelper.formatText({ "s:color": evt.color });
          break;
        case "backColor":
          this.toolbarHelper.formatText({
            "s:background": evt.color === "transparent" ? null : evt.color,
          });
          break;
      }
    });
  }

  protected activeColorPanel: 'color' | 'backColor' | null = null;
  protected get colorPanelOpen(): boolean {
    return this.activeColorPanel !== null;
  }
  protected recentTextColors: readonly string[] = [];
  protected recentBackgroundColors: readonly string[] = [];
  @ViewChild("textColorTrigger") private textColorTrigger?: CsDropdownDirective;
  @ViewChild("backgroundColorTrigger") private backgroundColorTrigger?: CsDropdownDirective;

  protected onColorTriggerMouseDown(event: MouseEvent): void {
    event.stopPropagation();
    // Let a focused colour field blur and confirm before switching panels.
    if (!this.colorPanelOpen) event.preventDefault();
  }

  protected onColorPanelOpenChange(type: 'color' | 'backColor', open: boolean): void {
    if (open) {
      if (!this.colorSelection && this.selectionJSON) {
        this.colorSelection = new ToolbarSelectionSession(this.doc, this.selectionJSON, () => {
          this.textColorTrigger?.close();
          this.backgroundColorTrigger?.close();
        });
      }
      this.activeColorPanel = type;
      (type === 'color' ? this.backgroundColorTrigger : this.textColorTrigger)?.close();
    } else if (this.activeColorPanel === type) {
      this.activeColorPanel = null;
      // An outside click can close the old panel before the other trigger opens.
      // Reconcile after that click, so a switch retains the saved text range.
      queueMicrotask(() => {
        if (this._destroyed || this.colorPanelOpen) return;
        const focused = this.hostRef?.nativeElement.ownerDocument.activeElement;
        const returnToEditor = this.restoreColorOnClose || !!focused && !!this.hostRef?.nativeElement.contains(focused);
        this.restoreColorOnClose = false;
        this.colorSelection?.finish(returnToEditor && !this._destroyed && !this.readonly);
        this.colorSelection = undefined;
        this.syncToolbarState(this.doc.selection.value);
        this.cdr.markForCheck();
      });
    }
  }

  protected onBgGraphPicked(bg: string | null) {
    this.colorSelection?.run(() => {
      this.toolbarHelper.formatText({ "a:bg": bg });
    });
  }

  protected get activeFontSizeLabel(): string {
    return this.activeFontSizePixels === undefined
      ? "混合"
      : `${Math.round(this.activeFontSizePixels * 10) / 10}`;
  }

  private applyFontSize(value: number | null): void {
    this.runWithSelection(
      () => this.toolbarHelper.formatFontSizePixels(value),
      {allowFontScaleTargets: true},
    );
  }

  protected get activeLineHeightLabel(): string {
    const value = this.activeParagraphTypography.lh;
    if (value === undefined) return "混合";
    if (value === null) return "默认";
    return `${Math.round(value * 100) / 100}×`;
  }

  protected get activeLetterSpacingLabel(): string {
    const value = this.activeTypography.ls;
    if (value === undefined) return "混合";
    return this.letterSpacingOptionLabel(value ?? 0);
  }

  protected get activeFontFamilyLabel(): string {
    const family = this.activeTypography.ff;
    if (family === undefined) return "多种字体";
    if (family === null) return "默认字体";
    return getTypographyFontFamily(family)?.label ?? "默认字体";
  }

  private applyInlineTypography(key: "ff" | "ls", value: unknown) {
    this.runWithSelection(() => {
      this.toolbarHelper.formatText(
        createInlineTypographyPatch(key, value) as IInlineNodeAttrs,
      );
    });
  }

  protected onFontFamilyItemClicked(
    item: BcFloatToolbarItemComponent,
    trigger: IToolbarPopupController,
    parentTrigger?: IToolbarPopupController,
  ) {
    if (item.name === "more-font-settings") {
      this.closePopupBeforeSettings(trigger, parentTrigger);
      this.openFontSettings(item.value as FontSettingsTarget);
      return;
    }
    trigger.close();
    parentTrigger?.close();
    this.applyInlineTypography("ff", item.value);
  }

  protected onFontSizeItemClicked(
    item: BcFloatToolbarItemComponent,
    trigger: IToolbarPopupController,
    parentTrigger?: IToolbarPopupController,
  ) {
    if (item.name === "more-font-settings") {
      this.closePopupBeforeSettings(trigger, parentTrigger);
      this.openFontSettings(item.value as FontSettingsTarget);
      return;
    }
    trigger.close();
    parentTrigger?.close();
    this.applyFontSize(item.value);
  }

  protected onLetterSpacingItemClicked(
    item: BcFloatToolbarItemComponent,
    trigger: IToolbarPopupController,
    parentTrigger?: IToolbarPopupController,
  ) {
    if (item.name === "more-font-settings") {
      this.closePopupBeforeSettings(trigger, parentTrigger);
      this.openFontSettings(item.value as FontSettingsTarget);
      return;
    }
    trigger.close();
    parentTrigger?.close();
    this.applyInlineTypography("ls", item.value);
  }

  protected onLineHeightItemClicked(
    item: BcFloatToolbarItemComponent,
    trigger: IToolbarPopupController,
    parentTrigger?: IToolbarPopupController,
  ) {
    if (item.name === "more-paragraph-settings") {
      this.closePopupBeforeSettings(trigger, parentTrigger);
      this.openParagraphSettings(item.value as ParagraphSettingsTarget);
      return;
    }
    trigger.close();
    parentTrigger?.close();
    const value = normalizeTypographyLineHeight(item.value);
    this.runWithSelection(
      () => {
        this.toolbarHelper.updateBlockProps({ lh: value });
      },
      { allowPartialEditableBlocks: true },
    );
  }

  private closePopupBeforeSettings(
    trigger: IToolbarPopupController,
    parentTrigger?: IToolbarPopupController,
  ): void {
    // The modal restores its previously focused element on close. Hand focus
    // back to the toolbar button so focusing the editor root cannot scroll it.
    trigger.close(!parentTrigger);
    parentTrigger?.close(true);
  }

  protected letterSpacingOptionLabel(value: number): string {
    return `${Math.round(value * 1000) / 1000}em`;
  }

  protected onMenuAction(
    event: { originalEvent: Event },
    trigger: IToolbarPopupController,
  ): void {
    const target = event.originalEvent.target;
    if (!(target instanceof Element)) return;
    const item = target.closest<HTMLElement>("[data-toolbar-command]");
    if (!item || item.getAttribute("aria-disabled") === "true") return;
    const command = item.dataset["toolbarCommand"];
    trigger.close();
    switch (command) {
      case "undo":
        this.undo();
        break;
      case "redo":
        this.redo();
        break;
      case "clear-format":
        this.clearFormat();
        break;
      case "format-brush":
        this.toggleFormatBrush();
        break;
      case "link":
        this.onLinkAction();
        break;
      case "formula":
        this.insertFormula();
        break;
      case "insert-image":
        this.insertSchemaBlock("image");
        break;
      case "insert-video":
        this.insertSchemaBlock("video");
        break;
      case "insert-audio":
        this.insertSchemaBlock("audio");
        break;
      case "extension": {
        const action = this.extensionActions.find(
          (action) => action.key === item.dataset["extensionKey"],
        );
        if (action) this.onExtensionAction(action);
        break;
      }
    }
  }

  protected openSettings(kind: "text" | "paragraph", event: Event): void {
    // The modal must restore focus to its trigger, not scroll the editor root into view.
    (event.currentTarget as HTMLElement | null)?.focus({ preventScroll: true });
    if (kind === "text") this.openFontSettings("font-size");
    else this.openParagraphSettings("paragraph-align");
  }

  protected openFontSettings(target: FontSettingsTarget): void {
    if (this.readonly || !this.selectionJSON) return;
    this.typographySettings.openFontSettings(target, this.selectionJSON);
  }

  protected openParagraphSettings(target: ParagraphSettingsTarget): void {
    if (this.readonly || !this.selectionJSON) return;
    this.typographySettings.openParagraphSettings(target, this.selectionJSON);
  }

  protected async insertQuickTable(
    evt: ITableSizePickedEvent,
    trigger: IToolbarPopupController,
  ) {
    if (this.readonly || !this.selectionJSON) return;
    this.restoreSelection();
    const selection = this.doc.selection.value;
    if (!this.isLiveSelection(selection)) return;

    const inserted = await this.insertTable(evt.rows, evt.cols, selection);
    if (!inserted) return;
    trigger.close();
    this.syncToolbarState(this.doc.selection.value);
    this.cdr.markForCheck();
  }

  protected async insertColumnsBlock(
    evt: IColumnCountPickedEvent,
    trigger: IToolbarPopupController,
  ) {
    if (this.readonly || !this.selectionJSON) return;
    this.restoreSelection();
    const selection = this.doc.selection.value;
    if (
      !this.isLiveSelection(selection) ||
      !this.canUseColumnPicker(selection)
    ) {
      trigger.close();
      this.syncToolbarState(selection);
      return;
    }

    const changed = await this.insertColumns(evt.count, selection);
    trigger.close();
    if (!changed) return;
    this.syncToolbarState(this.doc.selection.value);
    this.cdr.markForCheck();
  }

  protected onMediaTypePicked(
    item: BcFloatToolbarItemComponent,
    trigger: IToolbarPopupController,
  ) {
    trigger.close();
    if (item.value === "video" || item.value === "audio") {
      void this.insertSchemaBlock(item.value);
    }
  }

  protected async insertShape(
    shapeType: ShapeKind,
    trigger: IToolbarPopupController,
  ) {
    trigger.close();
    if (this.readonly) return;

    const schema = this.doc.schemas.get("shape", false);
    if (!schema) return;

    const armed = this.armObjectDrawing({
      defaultWidth: DEFAULT_SHAPE_PROPS.width,
      defaultHeight: DEFAULT_SHAPE_PROPS.height,
      commit: (geometry) =>
        this.commitShape(shapeType, schema.metadata.label, geometry),
    });
    if (!armed) {
      this.doc.messageService.warn(
        `无法在当前视图绘制${schema.metadata.label}`,
      );
    }
  }

  private commitShape(
    shapeType: ShapeKind,
    label: string,
    geometry: ObjectDrawInsertGeometry,
  ): void {
    if (this._destroyed || this.readonly) return;
    const baseSnapshot = this.doc.schemas.createSnapshot("shape", [shapeType]);
    const snapshot: IBlockSnapshot = {
      ...baseSnapshot,
      props: {
        ...baseSnapshot.props,
        width: geometry.width,
        height: geometry.height,
      },
    };
    const insertedId = this.doc.placement.insertAbsoluteSnapshot(snapshot, {
      anchorRect: geometry.anchorRect,
      layer: "over",
    });
    if (!insertedId) {
      this.doc.messageService.warn(`此处不能添加${label}`);
      return;
    }
    this.doc.selection.selectOrSetCursorAtBlock(insertedId, true);
    this.syncToolbarState(this.doc.selection.value);
    this.cdr.markForCheck();
  }

  protected insertTextBox(
    presetId: TextBoxPresetId,
    trigger: IToolbarPopupController,
  ): void {
    trigger.close();
    if (this.readonly) return;

    const schema = this.doc.schemas.get("text-box", false);
    if (!schema) return;
    const preset = getTextBoxPreset(presetId);

    // Catalog picks are horizontal because decorated surfaces are stretched,
    // not rotated. Writing direction can be changed from the selected text
    // box's text settings after insertion.
    const armed = this.armObjectDrawing({
      defaultWidth: preset.defaultWidth,
      defaultHeight: preset.defaultHeight,
      commit: (geometry) =>
        this.commitTextBox(preset.props, schema.metadata.label, geometry),
    });
    if (!armed) {
      this.doc.messageService.warn(
        `无法在当前视图绘制${schema.metadata.label}`,
      );
    }
  }

  /** Shared insertion tail. Callers decide the appearance; geometry wins. */
  private async commitTextBox(
    props: Readonly<Partial<TextBoxBlockProps>>,
    label: string,
    geometry: ObjectDrawInsertGeometry,
  ): Promise<void> {
    if (this._destroyed || this.readonly) return;
    const snapshot = this.doc.schemas.createSnapshot("text-box", [
      "",
      {
        ...props,
        width: geometry.width,
        height: geometry.height,
        textAutoFit: geometry.gesture === "click" ? "resize-shape" : "none",
      },
    ]);
    const insertedId = this.doc.placement.insertAbsoluteSnapshot(snapshot, {
      anchorRect: geometry.anchorRect,
      layer: "over",
    });
    if (!insertedId) {
      this.doc.messageService.warn(`此处不能添加${label}`);
      return;
    }

    // Stay whole-object selected. Text editing shows no frame chrome, so
    // entering the initial paragraph here would hide the handles and the
    // settings rail right after insertion; typing is one content click or
    // Enter away, matching a click on an existing frame.
    this.doc.selection.selectOrSetCursorAtBlock(insertedId, true);
    await this.doc.navigateToBlock(insertedId);
    this.syncToolbarState(this.doc.selection.value);
    this.cdr.markForCheck();
  }

  protected async insertWordArt(
    presetId: WordArtPresetId,
    trigger: IToolbarPopupController,
  ) {
    trigger.close();
    if (this.readonly) return;

    const schema = this.doc.schemas.get("word-art", false);
    if (!schema) return;

    const armed = this.armObjectDrawing({
      defaultWidth: DEFAULT_WORD_ART_PROPS.width,
      defaultHeight: DEFAULT_WORD_ART_PROPS.height,
      commit: (geometry) =>
        this.commitWordArt(presetId, schema.metadata.label, geometry),
    });
    if (!armed) {
      this.doc.messageService.warn(
        `无法在当前视图绘制${schema.metadata.label}`,
      );
    }
  }

  private async commitWordArt(
    presetId: WordArtPresetId,
    label: string,
    geometry: ObjectDrawInsertGeometry,
  ): Promise<void> {
    if (this._destroyed || this.readonly) return;
    const preset = getWordArtPreset(presetId);
    const presetProps: Partial<WordArtBlockProps> = {
      ...preset.props,
      width: geometry.width,
      height: geometry.height,
      textAutoFit: geometry.gesture === "click" ? "resize-shape" : "none",
    };
    const snapshot = this.doc.schemas.createSnapshot("word-art", [
      "艺术字",
      presetProps,
    ]);
    const insertedId = this.doc.placement.insertAbsoluteSnapshot(snapshot, {
      anchorRect: geometry.anchorRect,
      layer: "over",
    });
    if (!insertedId) {
      this.doc.messageService.warn(`此处不能添加${label}`);
      return;
    }

    this.doc.selection.selectOrSetCursorAtBlock(insertedId, true);
    const revealed = await this.doc.navigateToBlock(insertedId);
    if (revealed) {
      try {
        const block = this.doc.getBlockById(insertedId);
        if (block.flavour === "word-art") {
          (block as BlockCraft.IBlockComponents["word-art"]).enterEditing(true);
        }
      } catch {
        // 视图可能在协同更新中被移除；保留已建立的对象选区即可。
      }
    }
    this.syncToolbarState(this.doc.selection.value);
    this.cdr.markForCheck();
  }

  private armObjectDrawing(request: ObjectDrawInsertRequest): boolean {
    this._objectDrawInsert ??= new ObjectDrawInsertController(this.doc);
    return this._objectDrawInsert.arm(request);
  }

  protected onLinkAction() {
    if (this.readonly || !this.allEditable || !this.isLinkAble) return;
    if (this.isAttrActive("link")) {
      this.runWithSelection(() => this.toolbarHelper.formatText({"a:link": null}));
    } else {
      this.openLinkPad();
    }
  }

  protected openLinkPad() {
    this.openReferencePad(LinkInputPad, (pad, selection, confirm, close$) => {
      pad.setInput("showTextInput", selection.collapsed);
      pad.instance.onCancel.pipe(takeUntil(close$)).subscribe(() => close$.next());
      pad.instance.onConfirm.pipe(takeUntil(close$)).subscribe(url => {
        const text = pad.instance.textValue;
        confirm(live => {
          if (live.collapsed) {
            if (!text.trim()) return;
            this.replaceReference(live, {insert: text, attributes: {
              ...this.referenceInsertAttrs(live), "a:link": url,
            }});
          } else {
            this.toolbarHelper.formatText({"a:link": url}, live);
          }
        });
      });
    });
  }

  protected insertFormula() {
    if (this.readonly || !this.allEditable || !this.isLinkAble) return;
    this.runWithSelection(() => {
      const selection = this.doc.selection.value!;
      const formula = this.selectedFormula(selection);
      if (formula && typeof formula.insert === 'object') {
        this.replaceReference(selection, {insert: String(formula.insert['latex']), attributes: formula.attributes});
      } else if (!selection.collapsed) {
        // Keep the existing selected-text-to-formula shortcut.
        this.replaceReference(selection, {insert: {latex: this.doc.selection.getSelectedText()}});
      } else {
        this.openReferencePad(FormulaBlockToolbar, (pad, _selection, confirm, close$) => {
          pad.setInput("doc", this.doc);
          pad.instance.confirm.pipe(takeUntil(close$)).subscribe(latex => {
            if (!latex.trim()) return;
            confirm(live => this.replaceReference(live, {insert: {latex}}));
          });
        });
      }
    });
  }

  /** Only an explicitly selected formula is active; a caret beside it is plain text. */
  private selectedFormula(selection: BlockCraft.Selection | null) {
    if (!selection || !selection.isInSameBlock || selection.start.type !== "text" ||
        selection.end.type !== "text" || selection.end.offset - selection.start.offset !== 1) return null;
    const runs = sliceDelta(this.doc.model.getTextDeltas(selection.start.blockId) ?? [],
      selection.start.offset, selection.end.offset);
    const run = runs[0];
    return runs.length === 1 && run && typeof run.insert === "object" && 'latex' in run.insert ? run : null;
  }

  private referenceInsertAttrs(selection: BlockCraft.Selection): IInlineNodeAttrs {
    if (selection.start.type !== "text") return {};
    const {blockId, offset} = selection.start;
    const pending = this.doc.inputManger.peekNextInsertAttrs({blockId, index: offset});
    if (pending) return {...pending};
    const index = Math.max(0, offset - (selection.collapsed ? 1 : 0));
    return {...sliceDelta(this.doc.model.getTextDeltas(blockId) ?? [], index, index + 1)[0]?.attributes};
  }

  private replaceReference(selection: BlockCraft.Selection, run: DeltaInsert): void {
    if (selection.start.type !== "text" || selection.end.type !== "text") return;
    const {blockId, offset} = selection.start;
    const attrs = this.referenceInsertAttrs(selection);
    delete attrs['a:link'];
    this.doc.crud.undoManager.stopCapturing();
    this.doc.crud.applyTextDelta(blockId, [
      ...(offset ? [{retain: offset}] : []),
      ...(selection.end.offset > offset ? [{delete: selection.end.offset - offset}] : []),
      run,
    ]);
    const end = offset + (typeof run.insert === 'string' ? run.insert.length : 1);
    this.doc.selection.setSelection({blockId, type: 'text', index: end, length: 0});
    // Links and formulas are explicit insertions; following text starts outside them.
    this.doc.inputManger.setNextInsertAttrs(attrs, {blockId, index: end});
    this.doc.crud.undoManager.stopCapturing();
  }

  private openReferencePad<T>(component: Type<T>, setup: (
    pad: import('@angular/core').ComponentRef<T>, selection: BlockCraft.Selection,
    confirm: (apply: (selection: BlockCraft.Selection) => void) => void, close$: Subject<void>,
  ) => void): void {
    this.restoreSelection();
    const selection = this.doc.selection.value;
    if (!this.canFormatTextSelection(selection) || !selection?.isInSameBlock ||
        selection.start.type !== 'text' || selection.end.type !== 'text') return;
    this.closeReferencePad?.();
    const close$ = new Subject<void>();
    const close = () => close$.next();
    const session = new ToolbarSelectionSession(this.doc, selection.toJSON(), close);
    if (!session.resolve()) return;
    this.closeReferencePad = close;
    const {componentRef, overlayRef} = this.doc.overlayService.createConnectedOverlay<T>({
      target: selection.firstBlock,
      // These input panels belong to the fixed toolbar, including hosts whose
      // document canvas is wider than the visible viewport.
      clampTo: this.doc.root.hostElement.ownerDocument.documentElement,
      component,
      backdrop: true,
      positions: [getPositionWithOffset('bottom-left', 0, 8), getPositionWithOffset('top-left', 0, 8)],
    }, close$);
    close$.pipe(take(1)).subscribe(() => {
      if (this.closeReferencePad === close) this.closeReferencePad = undefined;
      if (session.finish(!this._destroyed && !this.readonly)) {
        this.syncToolbarState(this.doc.selection.value);
        this.cdr.markForCheck();
      }
    });
    overlayRef.keydownEvents().pipe(takeUntil(close$)).subscribe(event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    });
    setup(componentRef, selection, apply => {
      const saved = session.resolve();
      close();
      const live = this.doc.selection.value;
      if (this.readonly || !this.canFormatTextSelection(live) || !live?.isInSameBlock ||
          live.start.type !== 'text' || live.end.type !== 'text') return;
      // A removed source block must never redirect confirmation to another selection.
      if (!saved) return;
      apply(live);
      this.syncToolbarState(this.doc.selection.value);
      this.cdr.markForCheck();
    }, close$);
  }

  protected clearFormat() {
    this.runWithSelection(() => {
      this.toolbarHelper.formatText({
        "a:bold": null,
        "a:italic": null,
        "a:underline": null,
        "a:strike": null,
        "a:code": null,
        "a:sub": null,
        "a:sup": null,
        "a:bg": null,
        "a:link": null,
        "s:color": null,
        "s:background": null,
        "t:ff": null,
        "t:fs": null,
        "t:ls": null,
        "s:fontSize": null,
        "s:fontFamily": null,
        "s:letterSpacing": null,
      } as unknown as IInlineNodeAttrs);
      // if (this.activeFlavour !== 'paragraph') {
      //   this.toolbarHelper.transformBlocks('paragraph')
      // }
      this.toolbarHelper.updateBlockProps({
        heading: undefined,
        textAlign: undefined,
        pfs: null,
        lh: null,
      });
    });
  }

  protected toggleFormatBrush() {
    if (this.formatBrushActive) {
      this.clearFormatBrush();
      this.cdr.markForCheck();
      return;
    }

    this.activateFormatBrush();
  }

  protected activateFormatBrush() {
    if (this.formatBrushActive) {
      this.cdr.markForCheck();
      return;
    }

    const selection = this.doc.selection.value;
    if (!this.canCaptureFormatBrush(selection)) return;
    if (!selection) return;

    const payload = this.buildFormatBrushPayload(selection);
    if (!payload) return;

    this._formatBrushPayload = payload;
    this._formatBrushSourceKey = this.getSelectionKey(selection);
    this._formatBrushLastAppliedKey = null;
    this.formatBrushActive = true;
    this.cdr.markForCheck();
  }

  protected onExtensionAction(action: IFixedToolbarExtensionAction) {
    if (this.readonly || action.disabled) return;

    const resolvedSelection = this.resolveExtensionActionSelection();
    const selection = this.doc.selection.value;
    if (this.isLiveSelection(selection) && this.isReadonlySelection(selection))
      return;

    this.extensionAction.emit({
      action,
      selection: resolvedSelection,
      doc: this.doc,
    });
  }

  private handleSelectionChange(selection: BlockCraft.Selection | null) {
    this.syncToolbarState(selection);
  }

  private clearFormatBrush() {
    this.formatBrushActive = false;
    this._formatBrushPayload = null;
    this._formatBrushSourceKey = null;
    this._formatBrushLastAppliedKey = null;
    this._isApplyingFormatBrush = false;
  }

  private isNativeInputTarget(target: EventTarget | null) {
    return (
      target instanceof HTMLElement && !!target.closest("input,textarea,select")
    );
  }

  private isFormatBrushHotkey(evt: KeyboardEvent) {
    return (
      evt.key.toLowerCase() === "c" &&
      evt.shiftKey &&
      !evt.altKey &&
      (IS_MAC ? evt.metaKey : evt.ctrlKey)
    );
  }

  private runWithSelection(
    run: () => void,
    options?: {
      allowBlockTransform?: boolean;
      allowPartialEditableBlocks?: boolean;
      allowParagraphSpacingTargets?: boolean;
      allowFontScaleTargets?: boolean;
    },
  ) {
    if (this.readonly) return;
    this.restoreSelection();

    const selection = this.doc.selection.value;
    const canRun = options?.allowFontScaleTargets
      ? this.canSetFontScaleForSelection(selection)
      : options?.allowParagraphSpacingTargets
        ? this.canSetParagraphSpacingForSelection(selection)
      : options?.allowPartialEditableBlocks
        ? this.canSetLineHeightForSelection(selection)
        : options?.allowBlockTransform
          ? this.canTransformSelection(selection)
          : this.canFormatTextSelection(selection);
    if (!canRun) return;
    run();

    const current = this.doc.selection.value;
    this.syncToolbarState(current);
    this.cdr.markForCheck();
  }

  private restoreSelection() {
    if (!this.selectionJSON) return;
    this.replaySelection(this.selectionJSON);
  }

  private replaySelection(selectionJSON: ISelectionJSON | null) {
    if (this._destroyed || !selectionJSON) return false;
    try {
      this.doc.selection.replay(selectionJSON);
      return this.isLiveSelection(this.doc.selection.value);
    } catch {
      return false;
    }
  }

  private resolveExtensionActionSelection() {
    if (!this.selectionJSON) return null;
    if (!this.replaySelection(this.selectionJSON)) {
      this.syncToolbarState(this.doc.selection.value);
      return null;
    }
    return this.doc.selection.value?.toJSON() ?? null;
  }

  protected canInsertBlock(
    flavour: BlockCraft.BlockFlavour,
    selection: BlockCraft.Selection | null = this.doc.selection.value,
  ) {
    if (!this.isLiveSelection(selection)) return false;
    if (this.isReadonlySelection(selection)) return false;
    return !!this.resolveInsertPlacement(flavour, selection);
  }

  protected canCaptureFormatBrush(
    selection: BlockCraft.Selection | null = this.doc.selection.value,
  ) {
    return (
      this.canFormatTextSelection(selection) && selection?.start.type === "text"
    );
  }

  private canApplyFormatBrush(selection: BlockCraft.Selection | null) {
    return (
      this.canFormatTextSelection(selection) &&
      !!selection &&
      !selection.collapsed &&
      !selection.isEmpty
    );
  }

  private buildFormatBrushPayload(selection: BlockCraft.Selection) {
    const common = this.toolbarHelper.getCurrentCommonAttrs(selection);
    if (selection.start.type !== "text") return null;

    const inlineAttrs: IInlineNodeAttrs = {
      "a:bold": this.readFormatBrushAttr(common.attrs, "bold"),
      "a:italic": this.readFormatBrushAttr(common.attrs, "italic"),
      "a:underline": this.readFormatBrushAttr(common.attrs, "underline"),
      "a:strike": this.readFormatBrushAttr(common.attrs, "strike"),
      "a:code": this.readFormatBrushAttr(common.attrs, "code"),
      "a:sup": this.readFormatBrushAttr(common.attrs, "sup"),
      "a:sub": this.readFormatBrushAttr(common.attrs, "sub"),
      "a:bg": this.readFormatBrushAttr(common.attrs, "bg"),
      "s:color": common.colors["color"] ?? null,
      "s:background": common.colors["backColor"] ?? null,
      ...(common.fontWeight !== undefined ? {
        "s:fontWeight": common.fontWeight === null ? null : String(common.fontWeight),
      } : {}),
    } as IInlineNodeAttrs;

    if ('fontWeight' in common && common.fontWeight === undefined) delete inlineAttrs['a:bold'];
    const typography = common.typography;
    if (typography?.ff !== undefined) {
      Object.assign(
        inlineAttrs,
        createInlineTypographyPatch("ff", typography.ff),
      );
    }
    const fontScale = typography?.fs === undefined ? undefined : typography.fs;
    if (typography?.ls !== undefined) {
      Object.assign(
        inlineAttrs,
        createInlineTypographyPatch("ls", typography.ls),
      );
    }

    const blockProps: Partial<Pick<IEditableBlockProps, "lh">> = {};
    if (common.paragraph?.lh !== undefined) blockProps.lh = common.paragraph.lh;

    return {
      inlineAttrs,
      ...(common.hasFixedFontSize && common.fontSize !== undefined ? {fontSize: common.fontSize} : {}),
      ...(fontScale !== undefined ? { fontScale } : {}),
      blockProps,
    } satisfies IFormatBrushPayload;
  }

  private readFormatBrushAttr(attrs: Map<string, any>, key: string) {
    return attrs.has(key) ? attrs.get(key) : null;
  }

  private getSelectionKey(selection: BlockCraft.Selection | null) {
    return selection ? JSON.stringify(selection.toJSON()) : null;
  }

  private resolveInsertPlacement(
    flavour: BlockCraft.BlockFlavour,
    selection: BlockCraft.Selection,
  ): InsertPlacement | null {
    if (!this.isLiveSelection(selection)) return null;
    if (selection.getTableCellSelection?.()) return null;

    const start = selection.start;
    const end = selection.end;
    if (
      start.type === "boundary" &&
      end.type === "boundary" &&
      start.blockId === end.blockId
    ) {
      return this.resolveContainerInsertPlacement(
        flavour,
        start.block,
        Math.max(start.index, end.index),
      );
    }

    if (selection.collapsed && start.type === "gap") {
      return this.resolveBlockInsertPlacement(
        flavour,
        start.block,
        start.side === "before" ? "before" : "after",
      );
    }

    return this.resolveBlockInsertPlacement(
      flavour,
      selection.lastBlock,
      "after",
    );
  }

  private resolveContainerInsertPlacement(
    flavour: BlockCraft.BlockFlavour,
    container: BlockCraft.BlockComponent,
    index: number,
  ): InsertPlacement | null {
    if (!this.doc.canInsertChild(container.id, flavour)) return null;
    return {
      kind: "index",
      parentId: container.id,
      index: Math.max(0, Math.min(container.childrenLength, index)),
    };
  }

  private resolveBlockInsertPlacement(
    flavour: BlockCraft.BlockFlavour,
    block: BlockCraft.BlockComponent,
    side: "before" | "after",
  ): InsertPlacement | null {
    let anchor: BlockCraft.BlockComponent | null = block;
    if (
      this.doc.schemas.get(flavour)?.metadata.rootOnly &&
      block.parentId !== this.doc.rootId
    ) return null;
    while (
      anchor?.parentBlock &&
      !this.doc.canInsertChild(anchor.parentBlock.id, flavour)
    ) {
      anchor = anchor.parentBlock;
    }
    if (
      !anchor ||
      !anchor.parentBlock ||
      !this.doc.canInsertChild(anchor.parentBlock.id, flavour)
    ) {
      return null;
    }
    return { kind: side, anchor };
  }

  private insertSnapshotsAtPlacement(
    placement: InsertPlacement,
    snapshots: IBlockSnapshot[],
  ) {
    if (placement.kind === "index") {
      return this.doc
        .chain()
        .insertSnapshots(placement.parentId, placement.index, snapshots)
        .run();
    }
    if (placement.kind === "before") {
      return this.doc
        .chain()
        .insertBeforeSnapshots(placement.anchor, snapshots)
        .run();
    }
    return this.doc
      .chain()
      .insertAfterSnapshots(placement.anchor, snapshots)
      .run();
  }

  private async tryApplyFormatBrush(selection: BlockCraft.Selection | null) {
    if (
      !this.formatBrushActive ||
      !this._formatBrushPayload ||
      this._isApplyingFormatBrush ||
      !this.canApplyFormatBrush(selection)
    ) {
      return false;
    }

    const selectionKey = this.getSelectionKey(selection);
    if (
      !selectionKey ||
      selectionKey === this._formatBrushSourceKey ||
      selectionKey === this._formatBrushLastAppliedKey
    ) {
      return false;
    }

    this._isApplyingFormatBrush = true;
    this._formatBrushLastAppliedKey = selectionKey;

    try {
      if (!selection) return false;
      await this.applyFormatBrushPayload(selection, this._formatBrushPayload);
      this.clearFormatBrush();
      this.syncToolbarState(this.doc.selection.value);
      this.cdr.markForCheck();
      return true;
    } finally {
      void nextTick().then(() => {
        this._isApplyingFormatBrush = false;
      });
    }
  }

  private async applyFormatBrushPayload(
    selection: BlockCraft.Selection,
    payload: IFormatBrushPayload,
  ) {
    this.doc.crud.transact(() => {
      this.toolbarHelper.formatTypography(
        {
          attrs: payload.inlineAttrs,
          ...(Object.prototype.hasOwnProperty.call(payload, "fontScale")
            ? { fontScale: payload.fontScale }
            : {}),
        },
        selection,
      );
      if (payload.fontSize !== undefined) this.toolbarHelper.formatFontSizePixels(payload.fontSize, selection);
      if (Object.keys(payload.blockProps).length) {
        this.toolbarHelper.updateBlockProps(payload.blockProps, selection);
      }
    });
  }

  protected async insertSchemaBlock(flavour: "image" | "video" | "audio") {
    if (this.readonly || !this.selectionJSON) return;
    this.restoreSelection();
    const selection = this.doc.selection.value;
    if (!this.isLiveSelection(selection)) return;

    const schema = this.doc.schemas.get(flavour);
    if (!schema) return;

    const placement = this.resolveInsertPlacement(flavour, selection);
    if (!placement) {
      this.doc.messageService.warn(`此处不能添加${schema.metadata.label}`);
      return;
    }

    const blockCreator = this.doc.injector.get(BLOCK_CREATOR_SERVICE_TOKEN);

    try {
      const params = await blockCreator.getParamsByScheme(schema as any);
      if (!params) return;

      const snapshot = this.doc.schemas.createSnapshot(flavour, params as any);
      await this.insertSnapshotsAtPlacement(placement, [snapshot]);
      this.doc.selection.selectOrSetCursorAtBlock(snapshot.id, true);
      this.syncToolbarState(this.doc.selection.value);
      this.cdr.markForCheck();
    } catch {}
  }

  private async insertTable(
    rows: number,
    cols: number,
    selection: BlockCraft.Selection,
  ) {
    const safeRows = Math.max(1, Math.min(12, Math.floor(rows) || 0));
    const safeCols = Math.max(1, Math.min(12, Math.floor(cols) || 0));
    const placement = this.resolveInsertPlacement("table", selection);
    if (!placement) return null;

    const tableSnapshot = this.doc.schemas.createSnapshot("table", [
      safeRows,
      safeCols,
    ]);
    await this.insertSnapshotsAtPlacement(placement, [tableSnapshot]);

    const firstParagraphId = (tableSnapshot as any).children?.[0]?.children?.[0]
      ?.children?.[0]?.id as string | undefined;
    if (firstParagraphId) {
      this.doc.selection.setCursorAtBlock(firstParagraphId, true);
    } else {
      this.doc.selection.selectOrSetCursorAtBlock(tableSnapshot.id, true);
    }
    return tableSnapshot;
  }

  private async insertColumns(count: number, selection: BlockCraft.Selection) {
    const safeCount = Math.max(1, Math.min(8, Math.floor(count) || 0));

    // 选区在分栏内：调整当前分栏的栏数（目标 1 栏 = 取消分栏）
    const columnsBlock = this.findColumnsAncestor(selection.firstBlock);
    if (columnsBlock) {
      return this.applyColumnCount(columnsBlock, safeCount, selection);
    }

    // 选区在分栏外：选 1 栏视为维持单栏、不处理；≥2 栏把当前选区（单块或多块）就地转成分栏
    if (safeCount < 2) return null;
    return this.convertSelectedBlocksToColumns(safeCount, selection);
  }

  /** 从给定块向上查找最近的分栏（columns）祖先块；找不到返回 null。 */
  private findColumnsAncestor(
    block: BlockCraft.BlockComponent | null | undefined,
  ): BlockCraft.BlockComponent | null {
    let cur: BlockCraft.BlockComponent | null | undefined = block;
    while (cur) {
      if (cur.flavour === "columns") return cur;
      cur = cur.parentBlock;
    }
    return null;
  }

  /**
   * 调整已有分栏块的栏数：
   * - 目标 1 栏 → 取消分栏（解散为上下布局）。
   * - 目标 > 当前 → 末尾追加空栏。
   * - 目标 < 当前 → 把多余栏的内容并入最后保留的栏，再删除多余栏。
   * 列宽由分栏块的 onChildrenChange 自动按等分重算。
   */
  private applyColumnCount(
    columnsBlock: BlockCraft.BlockComponent,
    targetCount: number,
    selection: BlockCraft.Selection,
  ) {
    const current = columnsBlock.childrenLength;
    if (targetCount <= 1) return this.dissolveColumns(columnsBlock);
    if (targetCount === current) return columnsBlock;

    if (targetCount > current) {
      const newColumns = Array.from({ length: targetCount - current }, () =>
        this.doc.schemas.createSnapshot("column", []),
      );
      this.doc.crud.transact(() => {
        this.doc.crud.insertBlocks(columnsBlock.id, current, newColumns);
      });
      return columnsBlock;
    }

    // targetCount < current：把多余栏的内容并入最后保留的栏后删除；仅含空段落的栏直接丢弃
    const columnIds = [...columnsBlock.childrenIds];
    const keepLastId = columnIds[targetCount - 1];
    const removeIds = columnIds.slice(targetCount);
    this.doc.crud.transact(() => {
      for (const removeId of removeIds) {
        const removeCol = this.doc.getBlockById(removeId);
        if (removeCol && !this.isColumnEffectivelyEmpty(removeCol)) {
          const keepLen =
            this.doc.getBlockById(keepLastId)?.childrenLength ?? 0;
          this.doc.crud.moveBlocks(
            removeId,
            0,
            removeCol.childrenLength,
            keepLastId,
            keepLen,
          );
        }
        this.doc.crud.deleteBlockById(removeId);
      }
    });
    this.restoreSelectionAfterColumnShrink(selection, keepLastId);
    return columnsBlock;
  }

  private restoreSelectionAfterColumnShrink(
    selection: BlockCraft.Selection,
    fallbackColumnId: string,
  ) {
    try {
      this.doc.selection.setSelection(selection.anchor, selection.head);
    } catch {
      try {
        this.doc.selection.setCursorAtBlock(fallbackColumnId, true);
      } catch {}
    }
  }

  /**
   * 解散分栏：把分栏块内所有栏的内容按顺序平铺回分栏块所在的父级（上下布局），
   * 随后删除已清空的分栏块。
   */
  private dissolveColumns(columnsBlock: BlockCraft.BlockComponent) {
    const parent = columnsBlock.parentBlock;
    if (!parent) return null;
    const parentId = parent.id;
    const columnIds = [...columnsBlock.childrenIds];

    // 插入位置始终紧接在分栏块之前；每移走一栏内容，分栏块随之后移，insertAt 同步累加。
    let insertAt = columnsBlock.getIndexOfParent();
    let firstContentId: string | undefined;
    let movedAny = false;
    this.doc.crud.transact(() => {
      for (const colId of columnIds) {
        const col = this.doc.getBlockById(colId);
        // 仅含空段落的栏直接丢弃，不平铺出来
        if (!col || this.isColumnEffectivelyEmpty(col)) continue;
        // 必须在移动前取数：moveBlocks 会清空该栏，移动后 childrenLength 归零，
        // 直接复用会导致 insertAt 不前进、各栏内容被插到前一栏之前（顺序反转）。
        const childCount = col.childrenLength;
        if (!firstContentId) firstContentId = col.childrenIds[0];
        this.doc.crud.moveBlocks(colId, 0, childCount, parentId, insertAt);
        insertAt += childCount;
        movedAny = true;
      }
      // 全部栏都为空时：仅当分栏块是父级唯一子块（删除后会留空洞）才补一个空段落占位
      if (!movedAny && parent.childrenLength <= 1) {
        const placeholder = this.doc.schemas.createSnapshot("paragraph", []);
        this.doc.crud.insertBlocks(parentId, insertAt, [placeholder]);
        firstContentId = placeholder.id;
        insertAt += 1;
      }
      // 同一事务内 ModelGraph 仍保留搬移前的索引；使用累加后的实时位置，
      // 避免 deleteBlockById 按旧索引删除刚搬出的第一个内容块。
      this.doc.crud.deleteBlocks(parentId, insertAt, 1);
    });

    if (firstContentId) {
      this.doc.selection.selectOrSetCursorAtBlock(firstContentId, true);
    }
    return columnsBlock;
  }

  /** 判断某一栏是否"只有空段落"：无子块，或所有子块都是空文本段落 */
  private isColumnEffectivelyEmpty(
    columnBlock: BlockCraft.BlockComponent,
  ): boolean {
    const childIds = columnBlock.childrenIds;
    if (!childIds.length) return true;
    return childIds.every((id) => {
      const child = this.doc.getBlockById(id);
      if (!child || child.flavour !== "paragraph") return false;
      return this.doc.isEditable(child) && child.textLength === 0;
    });
  }

  /**
   * 行转列：把选区覆盖的同级块（≥1 个）就地包进 `count` 个并排的栏中。
   *
   * - 单块选区（光标只在一个段落内）：该块进第一栏，其余栏保留默认空段落 →
   *   当前段落原地变成分栏，而不是在下方新增空分栏。
   * - 行数 == 栏数：一栏放一块（如选 2 行选 2 栏 → 上下两行变左右两栏）。
   * - 行数 > 栏数：按顺序连续均分，靠前的栏多放一块。
   * - 行数 < 栏数：靠前的栏每栏一块，多出来的空栏保留默认空段落。
   *
   * 仅当选中的块同属一个父块、可作为 column 子块、且父块允许放置 columns 时才生效；
   * 否则返回 null（不创建分栏）。
   */
  private convertSelectedBlocksToColumns(
    count: number,
    selection: BlockCraft.Selection,
  ) {
    const targets = this.resolveColumnConversionTargets(selection);
    if (!targets) return null;
    const { blocks, parent } = targets;

    // 计算每栏分得的块数（连续均分，余数分给靠前的栏）
    const total = blocks.length;
    const base = Math.floor(total / count);
    const remainder = total % count;
    const takes = Array.from(
      { length: count },
      (_, c) => base + (c < remainder ? 1 : 0),
    );

    const columnsSnapshot = this.doc.schemas.createSnapshot("columns", [count]);
    const columnSnapshots = (columnsSnapshot as any).children as any[];
    // 接收块的栏清空默认段落；空栏保留默认段落以满足列容器非空约束
    takes.forEach((take, c) => {
      if (take > 0 && columnSnapshots[c]) columnSnapshots[c].children = [];
    });

    const parentId = parent.id;
    const firstIndex = blocks[0].getIndexOfParent();
    const firstBlockId = blocks[0].id;

    // 插入 columns 后，源块整体后移一位，落在 [firstIndex + 1, ...) 的连续区间。
    // 预先算出每栏对应的源块起始位置。
    const starts: number[] = [];
    let acc = firstIndex + 1;
    for (let c = 0; c < count; c++) {
      starts.push(acc);
      acc += takes[c];
    }

    // 第一笔事务先插入 columns 块，待 VM 物化出 column 子块后，
    // 第二笔事务再把源块移入对应栏（与 dnd.service 的分栏创建保持一致）。
    this.doc.crud.transact(() => {
      this.doc.crud.insertBlocks(parentId, firstIndex, [columnsSnapshot]);
    });
    this.doc.crud.transact(() => {
      // 自右向左搬移：每次移走的都是当前末段，不会影响尚未搬移的靠前块的索引。
      for (let c = count - 1; c >= 0; c--) {
        const take = takes[c];
        if (take <= 0) continue;
        const colId = columnSnapshots[c]?.id;
        if (!colId) continue;
        this.doc.crud.moveBlocks(parentId, starts[c], take, colId, 0);
      }
    });

    this.doc.selection.selectOrSetCursorAtBlock(firstBlockId, true);
    return columnsSnapshot;
  }

  private syncToolbarState(selection: BlockCraft.Selection | null) {
    // Native colour/HEX inputs temporarily own focus. Keep the existing saved
    // selection until the panel closes; runWithSelection still validates it
    // against the live document and readonly state before every format action.
    if (!selection && (this.colorPanelOpen || this.closeReferencePad || this._typographySettings?.isOpen)) return;
    this.formulaActive = this.isLiveSelection(selection) && !!this.selectedFormula(selection);
    if (!this.isLiveSelection(selection)) {
      this.typographyContextIds.clear();
      this.activeAttrs = new Map<string, any>();
      this.activeColors = {};
      this.activeProps = {};
      this.activeTypography = { ff: null, fs: null, ls: null };
      this.activeFontSizePixels = undefined;
      this.activeFontWeight = null;
      this.activeParagraphTypography = {
        pfs: null,
        lh: null,
        psb: null,
        psa: null,
      };
      this.activeFlavour = "paragraph";
      this.allEditable = false;
      this.canSetFontScale = false;
      this.canSetLineHeight = false;
      this.canSetParagraphSpacing = false;
      this.canTransformBlocks = false;
      this.canUseColumns = false;
      this.selectionJSON = null;
      this.columnPickerCurrent = 1;
      this.isLinkAble = false;
      this.hasTextSelection = false;
      this.cdr.markForCheck();
      return;
    }

    this.selectionJSON = selection.toJSON();
    // 分栏按钮回显：选区在分栏内显示当前栏数，否则按"单栏"显示
    const columnsBlock = this.findColumnsAncestor(selection.firstBlock);
    this.columnPickerCurrent = columnsBlock ? columnsBlock.childrenLength : 1;
    this.canTransformBlocks = this.canTransformSelection(selection);
    this.canSetFontScale = this.canSetFontScaleForSelection(selection);
    this.canSetLineHeight = this.canSetLineHeightForSelection(selection);
    this.canSetParagraphSpacing = this.canSetParagraphSpacingForSelection(selection);
    this.canUseColumns = this.canUseColumnPicker(selection);
    const canFormatText = this.canFormatTextSelection(selection);
    if (!canFormatText && !this.canSetFontScale && !this.canSetLineHeight && !this.canSetParagraphSpacing) {
      this.activeAttrs = new Map<string, any>();
      this.activeColors = {};
      this.activeProps = {};
      this.activeTypography = { ff: null, fs: null, ls: null };
      this.activeFontSizePixels = undefined;
      this.activeParagraphTypography = {
        pfs: null,
        lh: null,
        psb: null,
        psa: null,
      };
      this.activeFlavour = "paragraph";
      this.allEditable = false;
      this.isLinkAble = false;
      this.hasTextSelection = false;
      this.cdr.markForCheck();
      return;
    }

    this.typographyContextIds.clear();
    for (const target of this.toolbarHelper.getFontScaleTargets(selection)) {
      let id: string | null = target.blockId;
      while (id && !this.typographyContextIds.has(id)) {
        this.typographyContextIds.add(id);
        id = this.doc.model?.getParentId?.(id) ?? null;
      }
    }
    const common = this.toolbarHelper.getCurrentCommonAttrs(selection);
    this.activeProps = { ...common.props };
    this.activeFontSizePixels = common.fontSize;
    this.activeFontWeight = common.fontWeight;
    this.activeTypography = common.typography
      ? { ...common.typography }
      : { ff: null, fs: null, ls: null };
    this.activeParagraphTypography = common.paragraph
      ? { ...common.paragraph }
      : { pfs: null, lh: null, psb: null, psa: null };
    if (this.canSetParagraphSpacing) {
      const spacing = this.getCommonParagraphSpacing(selection);
      this.activeParagraphTypography.psb = spacing.psb;
      this.activeParagraphTypography.psa = spacing.psa;
    }
    this.activeFlavour = common.flavour || "paragraph";
    this.allEditable = canFormatText;
    this.activeAttrs = this.allEditable
      ? new Map(common.attrs)
      : new Map<string, any>();
    this.activeColors = this.allEditable ? { ...common.colors } : {};
    this.isLinkAble =
      this.allEditable &&
      selection.isInSameBlock &&
      selection.start.type === "text";
    this.hasTextSelection =
      this.allEditable &&
      selection.isInSameBlock &&
      selection.start.type === "text" &&
      !selection.collapsed &&
      !selection.isEmpty;
    this.cdr.markForCheck();
  }

  private canTransformSelection(selection: BlockCraft.Selection | null) {
    if (!this.isLiveSelection(selection) ||
        (selection.isAllSelected && !isSelectedContainer(selection, this.doc)))
      return false;
    if (this.isReadonlyFormatSelection(selection)) return false;

    let between: string[];
    let formatIds: string[];
    try {
      between = getSelectionFormatRootIds(selection, this.doc);
      formatIds = this.getFormatBlockIds(selection);
    } catch {
      return false;
    }
    if (!between.length || !formatIds.length) return false;
    if (between.some(id => this.doc.model?.exists(id)
      ? this.doc.model.getNodeType(id) === BlockNodeType.block
      : this.doc.getBlockById(id)?.nodeType === BlockNodeType.block)) {
      return formatIds.some(id => this.isEditableTextBlockId(id));
    }
    return between.every((id) => this.isEditableTextBlockId(id));
  }

  private canUseColumnPicker(selection: BlockCraft.Selection | null) {
    if (!this.isLiveSelection(selection)) return false;
    if (this.isReadonlySelection(selection)) return false;
    if (selection.getTableCellSelection?.()) return false;
    if (selection.collapsed && selection.start.type !== "text") return false;
    if (this.findColumnsAncestor(selection.firstBlock)) return true;
    return this.resolveColumnConversionTargets(selection) !== null;
  }

  /** 分栏搬移完整块，不应复用标题/列表转换的纯文本限制。 */
  private resolveColumnConversionTargets(selection: BlockCraft.Selection) {
    const columnSchema = this.doc.schemas.get("column", false);
    if (!columnSchema || this.isReadonlySelection(selection)) return null;

    const ids = this.getSelectedBlockIds(selection);
    if (!ids.length) return null;
    const blocks = ids.map((id) => this.doc.getBlockById(id));
    const parent = blocks[0]?.parentBlock;
    if (!parent || !this.doc.canInsertChild(parent.id, "columns")) return null;

    // 只读取一次同级列表，避免逐块 getIndexOfParent 重复复制和扫描父级。
    const siblings = parent.childrenIds;
    const firstIndex = siblings.indexOf(blocks[0].id);
    // 搬移算法按连续区间操作，缺失视图或跨父级时不能仅转换部分选区。
    if (
      firstIndex < 0 ||
      !blocks.every((block, index) =>
        block &&
        block.parentId === parent.id &&
        siblings[firstIndex + index] === block.id &&
        this.doc.schemas.isValidChildren(block.flavour, columnSchema),
      )
    ) return null;

    return { blocks, parent };
  }

  private getSelectedBlockIds(selection: BlockCraft.Selection) {
    return this.typographySettings.getSelectedBlockIds(selection);
  }

  private getFormatBlockIds(selection: BlockCraft.Selection) {
    return this.typographySettings.getFormatBlockIds(selection);
  }

  private canFormatTextSelection(selection: BlockCraft.Selection | null) {
    return this.typographySettings.canFormatTextSelection(selection);
  }

  private canSetLineHeightForSelection(selection: BlockCraft.Selection | null) {
    if (!this.isLiveSelection(selection) ||
        (selection.isAllSelected && !isSelectedContainer(selection, this.doc)))
      return false;
    if (this.isReadonlyFormatSelection(selection)) return false;

    return this.hasEditableTextTarget(selection);
  }

  private canSetParagraphSpacingForSelection(selection: BlockCraft.Selection | null) {
    return this.typographySettings.canSetParagraphSpacingForSelection(selection);
  }

  private getCommonParagraphSpacing(selection: BlockCraft.Selection): Pick<IParagraphTypographyState, 'psb' | 'psa'> {
    return this.typographySettings.getCommonParagraphSpacing(selection);
  }

  private hasEditableTextTarget(selection: BlockCraft.Selection) {
    return this.typographySettings.hasEditableTextTarget(selection);
  }

  private canSetFontScaleForSelection(selection: BlockCraft.Selection | null) {
    return this.typographySettings.canSetFontScaleForSelection(selection);
  }

  private isEditableTextBlockId(id: string) {
    return this.typographySettings.isEditableTextBlockId(id);
  }

  private isLiveSelection(
    selection: BlockCraft.Selection | null | undefined,
  ): selection is BlockCraft.Selection {
    return this.typographySettings.isLiveSelection(selection);
  }

  private isReadonlySelection(selection: BlockCraft.Selection) {
    return this.typographySettings.isReadonlySelection(selection);
  }

  private isReadonlyFormatSelection(selection: BlockCraft.Selection) {
    return this.typographySettings.isReadonlyFormatSelection(selection);
  }

  private get typographySettings(): TypographySettingsController {
    return this._typographySettings ||= new TypographySettingsController(this.doc, this.modalService, this.toolbarHelper, () => {
      if (this._destroyed) return;
      this.syncToolbarState(this.doc.selection.value);
      this.cdr.markForCheck();
    });
  }

  private get toolbarHelper() {
    return (
      this.utils || (this._toolbarHelper ||= new TextToolbarHelper(this.doc))
    );
  }
}
