import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
} from "@angular/core";
import {
  BcColumnCountPickerComponent,
  BcFloatToolbarComponent,
  BcFloatToolbarItemComponent,
  BcOverlayTriggerDirective,
  BcTableSizePickerComponent,
  ColorGroup,
  ColorPickerComponent,
  IColumnCountPickedEvent,
  ITableSizePickedEvent,
} from "../../../components";
import {
  BLOCK_CREATOR_SERVICE_TOKEN,
  BlockNodeType,
  INLINE_FONT_SCALE_PRESETS,
  INLINE_LETTER_SPACING_PRESETS,
  IBlockSnapshot,
  IEditableBlockProps,
  IInlineNodeAttrs,
  ISelectionJSON,
  createInlineTypographyPatch,
  normalizeTypographyLineHeight,
  getTypographyFontFamily,
  PARAGRAPH_LINE_HEIGHT_PRESETS,
  TextToolbarHelper,
  TYPOGRAPHY_FONT_FAMILIES,
  type TypographyFontFamilyId,
} from "../../../framework";
import { fromEvent, merge, Subscription } from "rxjs";
import { debounce, IS_MAC, nextTick } from "../../../global";
import { Overlay } from "@angular/cdk/overlay";
import { ComponentPortal } from "@angular/cdk/portal";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { LinkInputPad } from "../../float-text-toolbar/widgets/link-input-pad";
import { getSelectionCoveredBlockIds } from "../../../framework/modules/selection/covered-blocks";
import { isSelectionAlive } from "../../../framework/modules/selection/liveness";
import {
  DEFAULT_SHAPE_PROPS,
  type ShapeKind,
} from "../../../blocks/shape-block";
import { ShapePickerComponent } from "../../../components/shape-picker";
import { TextBoxPresetPickerComponent } from "../../../components/text-box-preset-picker";
import {
  DEFAULT_WORD_ART_PROPS,
  getWordArtPreset,
  type WordArtPresetId,
} from "../../../blocks/word-art-block";
import {
  getTextBoxPreset,
  type TextBoxPresetId,
} from "../../../blocks/text-box-block";
import { WordArtPresetPickerComponent } from "./word-art-preset-picker.component";
import {
  ObjectDrawInsertController,
  type ObjectDrawInsertGeometry,
  type ObjectDrawInsertRequest,
} from "./object-draw-insert.controller";

type TInlineToggle =
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "code"
  | "sup"
  | "sub";
type TAlignValue = "left" | "center" | "right";
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
  blockProps: Partial<Pick<IEditableBlockProps, "lh">>;
}

interface IInlineTypographyState {
  ff: TypographyFontFamilyId | null | undefined;
  fs: number | null | undefined;
  ls: number | null | undefined;
}

interface IParagraphTypographyState {
  lh: number | null | undefined;
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
  { value: "sup", icon: "bc_shangbiao", title: "上标" },
  { value: "sub", icon: "bc_xiabiao", title: "下标" },
];

const LIST_ACTIONS: IToolbarIconAction<TListFlavour>[] = [
  { value: "todo", icon: "bc_gongzuoshixiang", title: "待办事项" },
  { value: "bullet", icon: "bc_wuxuliebiao", title: "无序列表" },
  { value: "ordered", icon: "bc_youxuliebiao", title: "有序列表" },
];

const ALIGN_ACTIONS: IToolbarIconAction<TAlignValue>[] = [
  { value: "left", icon: "bc_zuoduiqi", title: "左对齐" },
  { value: "center", icon: "bc_juzhongduiqi", title: "居中" },
  { value: "right", icon: "bc_youduiqi", title: "右对齐" },
];

const BG_GRAPH_LIST: Array<{ attr: string | null; class: string }> = [
  {
    attr: null,
    class: "none",
  },
  {
    attr: "r1",
    class: "radius-1",
  },
  {
    attr: "rb",
    class: "right-border",
  },
];

@Component({
  selector: "bc-fixed-toolbar",
  template: `
    <button
      class="toolbar-scroll toolbar-scroll--previous"
      type="button"
      title="向前浏览工具组"
      aria-label="向前浏览工具组"
      (click)="scrollTextToolbar(-1)"
    >
      <i class="bc_icon bc_fanhui"></i>
    </button>

    <div #textSection class="toolbar-section toolbar-section--text">
      <ng-content select="[fixed-toolbar-prefix]"></ng-content>

      <div class="toolbar-group toolbar-group--history" role="group" aria-label="历史">
        <div class="toolbar-group__controls">
      <button
        class="toolbar-btn"
        title="撤销"
        (mousedown)="onActionMouseDown($event)"
        (click)="undo()"
        [disabled]="!doc?.crud?.undoManager?.isCanUndo()"
      >
        <i class="bc_icon bc_chehui"></i>
      </button>
      <button
        class="toolbar-btn"
        title="重做"
        (mousedown)="onActionMouseDown($event)"
        (click)="redo()"
        [disabled]="!doc?.crud?.undoManager?.isCanRedo()"
      >
        <i class="bc_icon bc_huitui"></i>
      </button>
        </div>
      </div>

      <div class="toolbar-group toolbar-group--styles" role="group" aria-label="样式">
        <div class="toolbar-group__controls">
      <button
        class="toolbar-btn toolbar-btn--style"
        [disabled]="readonly || !canTransformBlocks"
        [bcOverlayTrigger]="styleDropdown"
        [bcOverlayDisabled]="readonly || !canTransformBlocks"
        #styleTrigger="bcOverlayTrigger"
      >
        <i
          [class]="['bc_icon', activeStyleItem.icon, 'toolbar-btn__leading']"
        ></i>
        <span>{{ activeStyleItem.intro }}</span>
        <i class="bc_icon bc_xiajaintou"></i>
      </button>

      <button
        class="toolbar-btn toolbar-btn--style toolbar-btn--font-family toolbar-control--wide-only"
        title="字体"
        aria-haspopup="menu"
        [disabled]="readonly || !allEditable"
        [bcOverlayTrigger]="fontFamilyPicker"
        [bcOverlayDisabled]="readonly || !allEditable"
        #fontFamilyTrigger="bcOverlayTrigger"
      >
        <i class="bc_icon bc_wenben toolbar-btn__leading"></i>
        <span>{{ activeFontFamilyLabel }}</span>
        <i class="bc_icon bc_xiajaintou toolbar-btn__caret"></i>
      </button>

      <button
        class="toolbar-btn toolbar-btn--style toolbar-btn--font-size"
        title="文字缩放"
        aria-haspopup="menu"
        [disabled]="readonly || !allEditable"
        [bcOverlayTrigger]="fontSizePicker"
        [bcOverlayDisabled]="readonly || !allEditable"
        #fontSizeTrigger="bcOverlayTrigger"
      >
        <i class="bc_icon bc_zihao-jia toolbar-btn__leading"></i>
        <span>{{ activeFontScaleLabel }}</span>
        <i class="bc_icon bc_xiajaintou toolbar-btn__caret"></i>
      </button>

      <button
        class="toolbar-btn toolbar-btn--style toolbar-btn--letter-spacing toolbar-control--wide-only"
        [title]="'字符间距：' + activeLetterSpacingLabel"
        [attr.aria-label]="'字符间距：' + activeLetterSpacingLabel"
        aria-haspopup="menu"
        [disabled]="readonly || !allEditable"
        [bcOverlayTrigger]="letterSpacingPicker"
        [bcOverlayDisabled]="readonly || !allEditable"
        #letterSpacingTrigger="bcOverlayTrigger"
      >
        <i class="bc_icon bc_zengjiasuojin1 toolbar-btn__leading"></i>
        <span>{{ activeLetterSpacingLabel }}</span>
        <i class="bc_icon bc_xiajaintou toolbar-btn__caret"></i>
      </button>
        </div>
      </div>

      <div class="toolbar-group toolbar-group--font" role="group" aria-label="字体">
        <div class="toolbar-group__controls">
      @for (item of inlineToggleActions; track item.value) {
        <button
          class="toolbar-btn"
          [class.toolbar-control--wide-only]="
            item.value === 'sup' || item.value === 'sub'
          "
          [class.active]="isAttrActive(item.value)"
          [title]="item.title"
          [disabled]="readonly || !allEditable"
          (mousedown)="onActionMouseDown($event)"
          (click)="toggleInlineAttr(item.value)"
        >
          <i [class]="['bc_icon', item.icon]"></i>
        </button>
      }

      <button
        class="toolbar-btn"
        title="文字/背景颜色"
        [attr.disabled]="readonly || !allEditable ? '' : null"
        [disabled]="readonly || !allEditable"
        [bcOverlayTrigger]="colorPicker"
        [bcOverlayDisabled]="readonly || !allEditable"
        [style.color]="activeColors['color']"
        [style.background-color]="activeColors['backColor']"
      >
        <i class="bc_icon bc_bianji"></i>
      </button>

      <button
        class="toolbar-btn"
        title="清除格式"
        [disabled]="readonly || !allEditable"
        (mousedown)="onActionMouseDown($event)"
        (click)="clearFormat()"
      >
        <i class="bc_icon bc_quxiao"></i>
      </button>

      <button
        class="toolbar-btn"
        [class.active]="formatBrushActive"
        [title]="formatBrushTitle"
        [disabled]="
          readonly || (!formatBrushActive && !canCaptureFormatBrush())
        "
        (mousedown)="onActionMouseDown($event)"
        (click)="toggleFormatBrush()"
      >
        <i class="bc_icon bc_geshishua"></i>
      </button>
        </div>
      </div>

      <div class="toolbar-group toolbar-group--paragraph" role="group" aria-label="段落">
        <div class="toolbar-group__controls">
      @for (item of listActions; track item.value) {
        <button
          class="toolbar-btn"
          [class.active]="activeFlavour === item.value"
          [title]="item.title"
          [disabled]="readonly || !canTransformBlocks"
          (mousedown)="onActionMouseDown($event)"
          (click)="setList(item.value)"
        >
          <i [class]="['bc_icon', item.icon]"></i>
        </button>
      }

      <button
        class="toolbar-btn toolbar-btn--dropdown"
        [title]="activeAlignAction.title"
        [attr.aria-label]="'对齐方式：' + activeAlignAction.title"
        aria-haspopup="menu"
        [disabled]="readonly || !allEditable"
        [bcOverlayTrigger]="alignDropdown"
        [bcOverlayDisabled]="readonly || !allEditable"
        #alignTrigger="bcOverlayTrigger"
      >
        <i [class]="['bc_icon', activeAlignAction.icon]"></i>
        <i class="bc_icon bc_xiajaintou toolbar-btn__caret"></i>
      </button>

      <button
        class="toolbar-btn toolbar-btn--dropdown toolbar-control--wide-only"
        [title]="'行距：' + activeLineHeightLabel"
        [attr.aria-label]="'行距：' + activeLineHeightLabel"
        aria-haspopup="menu"
        [disabled]="readonly || !canSetLineHeight"
        [bcOverlayTrigger]="lineHeightPicker"
        [bcOverlayDisabled]="readonly || !canSetLineHeight"
        #lineHeightTrigger="bcOverlayTrigger"
      >
        <i class="bc_icon bc_hangjianju"></i>
        <span class="toolbar-btn__value">{{ activeLineHeightLabel }}</span>
        <i class="bc_icon bc_xiajaintou toolbar-btn__caret"></i>
      </button>
        </div>
      </div>

      <div
        class="toolbar-group toolbar-group--responsive-more"
        role="group"
        aria-label="更多格式"
      >
        <div class="toolbar-group__controls">
          <button
            class="toolbar-btn toolbar-btn--dropdown"
            title="更多格式"
            aria-label="更多格式"
            aria-haspopup="menu"
            [disabled]="readonly || (!allEditable && !canSetLineHeight)"
            [bcOverlayTrigger]="responsiveMorePicker"
            [bcOverlayDisabled]="readonly || (!allEditable && !canSetLineHeight)"
            (click)="responsiveMoreTrigger.openOverlay()"
            #responsiveMoreTrigger="bcOverlayTrigger"
          >
            <i class="bc_icon bc_gengduo"></i>
            <i class="bc_icon bc_xiajaintou toolbar-btn__caret"></i>
          </button>
        </div>
      </div>

      <div class="toolbar-group toolbar-group--reference toolbar-control--wide-only" role="group" aria-label="引用">
        <div class="toolbar-group__controls">
      <button
        class="toolbar-btn"
        [class.active]="isAttrActive('link')"
        title="链接"
        [disabled]="
          readonly || !allEditable || !isLinkAble || !hasTextSelection
        "
        (mousedown)="onActionMouseDown($event)"
        (click)="onLinkAction()"
      >
        <i class="bc_icon bc_lianjie"></i>
      </button>

      <button
        class="toolbar-btn"
        title="行内公式"
        [disabled]="
          readonly || !allEditable || !isLinkAble || !hasTextSelection
        "
        (mousedown)="onActionMouseDown($event)"
        (click)="insertFormula()"
      >
        <i class="bc_icon bc_gongshi"></i>
      </button>
        </div>
      </div>
    </div>

    <button
      class="toolbar-scroll toolbar-scroll--next"
      type="button"
      title="向后浏览工具组"
      aria-label="向后浏览工具组"
      (click)="scrollTextToolbar(1)"
    >
      <i class="bc_icon bc_youjiantou"></i>
    </button>

    <div class="toolbar-section toolbar-section--insert">
      <div class="toolbar-group toolbar-group--insert" role="group" aria-label="插入">
        <div class="toolbar-group__controls">
          <button
            class="toolbar-btn toolbar-btn--dropdown"
            title="插入形状"
            aria-label="插入形状"
            [hidden]="!doc.schemas.has('shape')"
            [disabled]="readonly"
            [bcOverlayTrigger]="shapePicker"
            [bcOverlayDisabled]="readonly"
            (click)="shapeTrigger.openOverlay()"
            #shapeTrigger="bcOverlayTrigger"
          >
            <i class="bc_icon bc_tuxing"></i>
            <i class="bc_icon bc_xiajaintou toolbar-btn__caret"></i>
          </button>

          <button
            class="toolbar-btn toolbar-btn--dropdown"
            title="插入文本框"
            aria-label="插入文本框"
            [hidden]="!doc.schemas.has('text-box')"
            [disabled]="readonly"
            [bcOverlayTrigger]="textBoxPicker"
            [bcOverlayDisabled]="readonly"
            (click)="textBoxTrigger.openOverlay()"
            #textBoxTrigger="bcOverlayTrigger"
          >
            <i class="bc_icon bc_wenbenkuang"></i>
            <i class="bc_icon bc_xiajaintou toolbar-btn__caret"></i>
          </button>

          <button
            class="toolbar-btn toolbar-btn--dropdown"
            title="插入艺术字"
            aria-label="插入艺术字"
            [hidden]="!doc.schemas.has('word-art')"
            [disabled]="readonly"
            [bcOverlayTrigger]="wordArtPicker"
            [bcOverlayDisabled]="readonly"
            (click)="wordArtTrigger.openOverlay()"
            #wordArtTrigger="bcOverlayTrigger"
          >
            <i class="bc_icon bc_yishuzishengcheng"></i>
            <i class="bc_icon bc_xiajaintou toolbar-btn__caret"></i>
          </button>

          <button
            class="toolbar-btn toolbar-btn--dropdown"
            title="插入表格"
            [disabled]="readonly || !canInsertBlock('table')"
            [bcOverlayTrigger]="quickTablePicker"
            [bcOverlayDisabled]="readonly || !canInsertBlock('table')"
            #quickTableTrigger="bcOverlayTrigger"
          >
            <i class="bc_icon bc_column-vertical"></i>
            <i class="bc_icon bc_xiajaintou toolbar-btn__caret"></i>
          </button>

          <button
            class="toolbar-btn toolbar-btn--dropdown"
            title="分栏"
            [disabled]="readonly || !canUseColumns"
            [bcOverlayTrigger]="columnCountPicker"
            [bcOverlayDisabled]="readonly || !canUseColumns"
            #columnCountTrigger="bcOverlayTrigger"
          >
            <i class="bc_icon bc_fenlan"></i>
            <i class="bc_icon bc_xiajaintou toolbar-btn__caret"></i>
          </button>

          <button
            class="toolbar-btn"
            title="插入图片"
            [disabled]="readonly || !canInsertBlock('image')"
            (mousedown)="onActionMouseDown($event)"
            (click)="insertSchemaBlock('image')"
          >
            <i class="bc_icon bc_tupian-color"></i>
          </button>

          <button
            class="toolbar-btn toolbar-btn--dropdown"
            title="插入视频或音频"
            [disabled]="
              readonly || (!canInsertBlock('video') && !canInsertBlock('audio'))
            "
            [bcOverlayTrigger]="mediaTypePicker"
            [bcOverlayDisabled]="
              readonly || (!canInsertBlock('video') && !canInsertBlock('audio'))
            "
            #mediaTypeTrigger="bcOverlayTrigger"
          >
            <i class="bc_icon bc_shipin"></i>
            <i class="bc_icon bc_xiajaintou toolbar-btn__caret"></i>
          </button>
        </div>
      </div>

      @if (extensionActions.length) {
        <div class="toolbar-group toolbar-group--extensions" role="group" aria-label="扩展">
          <div class="toolbar-group__controls">
        <span class="toolbar-divider"></span>

        @for (item of extensionActions; track item.key) {
          @if (item.dividerBefore) {
            <span class="toolbar-divider"></span>
          }

          <button
            class="toolbar-btn"
            [class.active]="!!item.active"
            [title]="item.title"
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

      <ng-template #quickTablePicker>
        <bc-table-size-picker
          (pick)="insertQuickTable($event, quickTableTrigger)"
        ></bc-table-size-picker>
      </ng-template>

      <ng-template #columnCountPicker>
        <bc-column-count-picker
          [current]="columnPickerCurrent"
          (pick)="insertColumnsBlock($event, columnCountTrigger)"
        ></bc-column-count-picker>
      </ng-template>

      <ng-template #mediaTypePicker>
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
      </ng-template>

      <ng-template #shapePicker>
        <bc-shape-picker
          ariaLabel="选择要插入的形状"
          (pick)="insertShape($event, shapeTrigger)"
        ></bc-shape-picker>
      </ng-template>

      <ng-template #wordArtPicker>
        <bc-word-art-preset-picker
          (pick)="insertWordArt($event, wordArtTrigger)"
        ></bc-word-art-preset-picker>
      </ng-template>

      <ng-template #textBoxPicker>
        <bc-text-box-preset-picker
          (pick)="insertTextBox($event, textBoxTrigger)"
        ></bc-text-box-preset-picker>
      </ng-template>

    <ng-template #responsiveMorePicker>
      <div class="insert-menu responsive-more-menu" role="menu" aria-label="更多格式">
        <button
          class="insert-menu__item"
          type="button"
          role="menuitem"
          [disabled]="readonly || !allEditable"
          [bcOverlayTrigger]="compactFontFamilyPicker"
          [bcOverlayDisabled]="readonly || !allEditable"
          [positions]="['right-top', 'left-top']"
          [offsetX]="8"
          (click)="compactFontFamilyTrigger.openOverlay()"
          #compactFontFamilyTrigger="bcOverlayTrigger"
        >
          <i class="bc_icon bc_wenben"></i>
          <span>字体</span>
          <i class="bc_icon bc_xiajaintou insert-menu__expand"></i>
        </button>
        <button
          class="insert-menu__item"
          type="button"
          role="menuitem"
          [disabled]="readonly || !allEditable"
          [bcOverlayTrigger]="compactLetterSpacingPicker"
          [bcOverlayDisabled]="readonly || !allEditable"
          [positions]="['right-top', 'left-top']"
          [offsetX]="8"
          (click)="compactLetterSpacingTrigger.openOverlay()"
          #compactLetterSpacingTrigger="bcOverlayTrigger"
        >
          <i class="bc_icon bc_zengjiasuojin1"></i>
          <span>字符间距</span>
          <i class="bc_icon bc_xiajaintou insert-menu__expand"></i>
        </button>
        <button
          class="insert-menu__item"
          type="button"
          role="menuitem"
          [disabled]="readonly || !canSetLineHeight"
          [bcOverlayTrigger]="compactLineHeightPicker"
          [bcOverlayDisabled]="readonly || !canSetLineHeight"
          [positions]="['right-top', 'left-top']"
          [offsetX]="8"
          (click)="compactLineHeightTrigger.openOverlay()"
          #compactLineHeightTrigger="bcOverlayTrigger"
        >
          <i class="bc_icon bc_hangjianju"></i>
          <span>行间距</span>
          <i class="bc_icon bc_xiajaintou insert-menu__expand"></i>
        </button>
      </div>

      <ng-template #compactFontFamilyPicker>
        <bc-float-toolbar
          [direction]="'column'"
          (onItemClick)="onFontFamilyItemClicked($event, compactFontFamilyTrigger, responsiveMoreTrigger)"
          [gapAround]="8"
          styles="width: 224px; max-width: calc(100vw - 24px); max-height: min(60vh, 420px); overflow-x: hidden; overflow-y: auto"
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
        </bc-float-toolbar>
      </ng-template>

      <ng-template #compactLetterSpacingPicker>
        <bc-float-toolbar
          [direction]="'column'"
          (onItemClick)="onLetterSpacingItemClicked($event, compactLetterSpacingTrigger, responsiveMoreTrigger)"
          [gapAround]="8"
          styles="max-height: min(60vh, 420px); overflow-x: hidden; overflow-y: auto"
        >
          <bc-float-toolbar-item
            name="letter-spacing"
            [value]="null"
            [active]="activeTypography.ls === null"
            >默认（0em）</bc-float-toolbar-item
          >
          @for (spacing of letterSpacingPresets; track spacing) {
            <bc-float-toolbar-item
              name="letter-spacing"
              [value]="spacing"
              [active]="activeTypography.ls === spacing"
              >{{ letterSpacingOptionLabel(spacing) }}</bc-float-toolbar-item
            >
          }
        </bc-float-toolbar>
      </ng-template>

      <ng-template #compactLineHeightPicker>
        <bc-float-toolbar
          [direction]="'column'"
          (onItemClick)="onLineHeightItemClicked($event, compactLineHeightTrigger, responsiveMoreTrigger)"
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
        </bc-float-toolbar>
      </ng-template>
    </ng-template>

    <ng-template #colorPicker>
      <bc-color-picker
        (colorPicked)="onColorPicked($event)"
        [gapAround]="8"
        [activeColors]="activeColors"
      >
        <div class="bc-color-group">
          <div class="bc-color-group-title">背景图形</div>
          <div class="bg-list">
            @for (item of bgGraphList; track item.attr) {
              <div
                class="bg-graph-item"
                [class]="item.class"
                [class.active]="activeAttrs.get('bg') == item.attr"
                (click)="onBgGraphPicked(item.attr)"
              >
                <span
                  [style.background-color]="
                    activeColors['backColor'] || '#f4a1a1'
                  "
                  [style.color]="activeColors['color'] || '#ffffff'"
                  >文本</span
                >
              </div>
            }
          </div>
        </div>
      </bc-color-picker>
    </ng-template>

    <ng-template #fontFamilyPicker>
      <bc-float-toolbar
        [direction]="'column'"
        (onItemClick)="onFontFamilyItemClicked($event, fontFamilyTrigger)"
        [gapAround]="8"
        styles="width: 224px; max-width: calc(100vw - 24px); max-height: min(60vh, 420px); overflow-x: hidden; overflow-y: auto"
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
      </bc-float-toolbar>
    </ng-template>

    <ng-template #fontSizePicker>
      <bc-float-toolbar
        [direction]="'column'"
        (onItemClick)="onFontScaleItemClicked($event, fontSizeTrigger)"
        [gapAround]="8"
        styles="max-height: min(60vh, 420px); overflow-y: auto"
      >
        @for (scale of fontScalePresets; track scale) {
          <bc-float-toolbar-item
            name="font-scale"
            [value]="scale"
            [active]="(activeTypography.fs ?? 1) === scale"
            >{{ scale }}×</bc-float-toolbar-item
          >
        }
      </bc-float-toolbar>
    </ng-template>

    <ng-template #letterSpacingPicker>
      <bc-float-toolbar
        [direction]="'column'"
        (onItemClick)="onLetterSpacingItemClicked($event, letterSpacingTrigger)"
        [gapAround]="8"
        styles="max-height: min(60vh, 420px); overflow-y: auto"
      >
        <bc-float-toolbar-item
          name="letter-spacing"
          [value]="null"
          [active]="activeTypography.ls === null"
          >默认（0em）</bc-float-toolbar-item
        >
        @for (spacing of letterSpacingPresets; track spacing) {
          <bc-float-toolbar-item
            name="letter-spacing"
            [value]="spacing"
            [active]="activeTypography.ls === spacing"
            >{{ letterSpacingOptionLabel(spacing) }}</bc-float-toolbar-item
          >
        }
      </bc-float-toolbar>
    </ng-template>

    <ng-template #lineHeightPicker>
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
      </bc-float-toolbar>
    </ng-template>

    <ng-template #alignDropdown>
      <bc-float-toolbar
        [direction]="'column'"
        (onItemClick)="onAlignItemClicked($event, alignTrigger)"
        [gapAround]="8"
      >
        @for (item of alignActions; track item.value) {
          <bc-float-toolbar-item
            name="align"
            [value]="item.value"
            [icon]="item.icon"
            [active]="isAlignActive(item.value)"
            >{{ item.title }}</bc-float-toolbar-item
          >
        }
      </bc-float-toolbar>
    </ng-template>

    <ng-template #styleDropdown>
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
    </ng-template>
  `,
  styles: [
    `
      :host {
        position: relative;
        display: flex;
        align-items: stretch;
        justify-content: center;
        column-gap: 4px;
        row-gap: 4px;
        flex-wrap: wrap;
        width: 100%;
        max-width: 100%;
        box-sizing: border-box;
        padding: var(--bc-fixed-toolbar-padding, 5px 8px);
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
        will-change: transform;
      }

      .toolbar-section {
        display: flex;
        align-items: center;
        gap: 4px;
        max-width: 100%;
        min-width: 0;
        overflow-y: hidden;
        scrollbar-width: none;
      }

      .toolbar-section::-webkit-scrollbar {
        display: none;
      }

      .toolbar-group {
        position: relative;
        display: flex;
        align-items: center;
        flex: 0 0 auto;
        padding-inline: 8px;
      }

      .toolbar-group:first-child {
        padding-inline-start: 0;
      }

      .toolbar-group + .toolbar-group::before {
        position: absolute;
        inset-block: 2px 3px;
        inset-inline-start: 0;
        width: 1px;
        background: var(--bc-float-toolbar-divider-color);
        content: "";
      }

      .toolbar-group__controls {
        display: flex;
        align-items: center;
        gap: 4px;
        min-width: 0;
      }

      .toolbar-scroll {
        display: none;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        padding: 0;
        border: 1px solid var(--bc-border-color);
        border-radius: 50%;
        background: var(--bc-bg-elevated);
        color: var(--bc-float-toolbar-item-color);
        box-shadow: var(--bc-shadow-sm);
        cursor: pointer;
      }

      .toolbar-scroll:hover,
      .toolbar-scroll:focus-visible {
        background: var(--bc-float-toolbar-item-hover-bg);
      }

      .toolbar-scroll:focus-visible {
        outline: 2px solid var(--bc-active-color);
        outline-offset: -2px;
      }

      .toolbar-section--text {
        flex: 0 1 auto;
        justify-content: center;
        justify-content: safe center;
      }

      .toolbar-section--insert {
        flex: 0 0 auto;
      }

      .toolbar-group--responsive-more {
        display: none;
      }

      :host(.toolbar-layout--wide) {
        flex-wrap: nowrap;
      }

      :host(.toolbar-layout--wide) .toolbar-section--text {
        justify-content: center;
        justify-content: safe center;
        overflow-x: auto;
      }

      :host(.toolbar-layout--balanced) .toolbar-section--text {
        flex: 0 1 auto;
        flex-wrap: nowrap;
        justify-content: center;
        justify-content: safe center;
        overflow-x: auto;
        overscroll-behavior-inline: contain;
      }

      :host(.toolbar-layout--balanced) {
        flex-wrap: nowrap;
      }

      :host(.toolbar-layout--balanced) .toolbar-control--wide-only,
      :host(.toolbar-layout--compact) .toolbar-control--wide-only {
        display: none;
      }

      :host(.toolbar-layout--balanced) .toolbar-group--responsive-more,
      :host(.toolbar-layout--compact) .toolbar-group--responsive-more {
        display: flex;
      }

      :host(.toolbar-layout--compact) {
        flex-wrap: wrap;
        justify-content: center;
      }

      :host(.toolbar-layout--compact) .toolbar-section--text {
        flex: 1 1 100%;
        justify-content: center;
        justify-content: safe center;
        overflow-x: auto;
        overscroll-behavior-inline: contain;
        padding-inline: 32px;
        scroll-behavior: smooth;
      }

      :host(.toolbar-layout--compact) .toolbar-section--insert {
        justify-content: center;
        justify-content: safe center;
        overflow-x: auto;
        margin-inline: auto;
      }

      :host(.toolbar-layout--compact) .toolbar-group {
        padding-inline: 6px;
      }

      :host(.toolbar-layout--compact) .toolbar-scroll {
        position: absolute;
        z-index: 2;
        top: 6px;
        display: inline-flex;
      }

      :host(.toolbar-layout--compact) .toolbar-scroll--previous {
        inset-inline-start: 6px;
      }

      :host(.toolbar-layout--compact) .toolbar-scroll--next {
        inset-inline-end: 6px;
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

      .toolbar-btn:hover:not(:disabled) {
        background: var(--bc-float-toolbar-item-hover-bg);
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

      .toolbar-btn--font-family {
        width: 112px;
      }

      .toolbar-btn--font-size {
        width: 78px;
        min-width: 78px;
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

      .insert-menu {
        display: flex;
        flex-direction: column;
        min-width: 176px;
        padding: 6px;
        border: 1px solid var(--bc-border-color);
        border-radius: 8px;
        background: var(--bc-bg-elevated);
        box-shadow: var(
          --bc-fixed-toolbar-shadow,
          0 6px 16px rgba(15, 15, 15, 0.08)
        );
      }

      .insert-menu__item {
        display: grid;
        grid-template-columns: 20px minmax(0, 1fr) 12px;
        align-items: center;
        gap: 8px;
        min-height: 34px;
        padding: 0 8px;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: var(--bc-float-toolbar-item-color);
        font: inherit;
        text-align: left;
        cursor: pointer;
      }

      .insert-menu__item:hover:not(:disabled),
      .insert-menu__item:focus-visible {
        background: var(--bc-float-toolbar-item-hover-bg);
      }

      .insert-menu__item:focus-visible {
        outline: 2px solid var(--bc-active-color);
        outline-offset: -2px;
      }

      .insert-menu__item:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .insert-menu__item > i:first-child {
        font-size: 15px;
        text-align: center;
      }

      .insert-menu__item > span {
        font-size: 12px;
      }

      .insert-menu__expand {
        font-size: 10px;
        opacity: 0.6;
        transform: rotate(-90deg);
      }

      .insert-menu__divider {
        height: 1px;
        margin: 4px 6px;
        background: var(--bc-float-toolbar-divider-color);
      }

      .bg-list {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }

      .bg-graph-item {
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
    BcOverlayTriggerDirective,
    BcFloatToolbarComponent,
    BcFloatToolbarItemComponent,
    ColorPickerComponent,
    BcTableSizePickerComponent,
    BcColumnCountPickerComponent,
    ShapePickerComponent,
    TextBoxPresetPickerComponent,
    WordArtPresetPickerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    contenteditable: "false",
    "[class.readonly]": "readonly",
    "[class.hidden]": "!visible",
    "[class.toolbar-layout--wide]": "toolbarLayout === 'wide'",
    "[class.toolbar-layout--balanced]": "toolbarLayout === 'balanced'",
    "[class.toolbar-layout--compact]": "toolbarLayout === 'compact'",
    "[style.--bc-fixed-toolbar-top.px]": "stickyTop",
    "(mousedown)": "onToolbarMouseDown($event)",
  },
})
export class FixedTextToolbarComponent implements OnInit, OnDestroy {
  private readonly _sub = new Subscription();
  private _toolbarHelper?: TextToolbarHelper;
  private _formatBrushPayload: IFormatBrushPayload | null = null;
  private _formatBrushSourceKey: string | null = null;
  private _formatBrushLastAppliedKey: string | null = null;
  private _isApplyingFormatBrush = false;
  private _objectDrawInsert?: ObjectDrawInsertController;
  private _resizeObserver?: ResizeObserver;
  protected toolbarLayout: "wide" | "balanced" | "compact" = "balanced";

  @ViewChild("textSection", { read: ElementRef })
  private textSectionRef?: ElementRef<HTMLElement>;

  constructor(
    private readonly cdr: ChangeDetectorRef,
    private readonly hostRef?: ElementRef<HTMLElement>,
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
    lh: null,
  };

  protected readonly fontFamilies = TYPOGRAPHY_FONT_FAMILIES;
  protected readonly fontScalePresets = INLINE_FONT_SCALE_PRESETS;
  protected readonly letterSpacingPresets = INLINE_LETTER_SPACING_PRESETS;
  protected readonly lineHeightPresets = PARAGRAPH_LINE_HEIGHT_PRESETS;

  @Input()
  activeFlavour: BlockCraft.BlockFlavour = "paragraph";

  @Input()
  allEditable = false;

  /** 行间距属于块属性；混合选区中存在一个可编辑文本块即可执行。 */
  canSetLineHeight = false;

  canTransformBlocks = false;

  canUseColumns = false;

  /** 分栏按钮回显的栏数：选区在分栏内为当前栏数，否则为 1（单栏） */
  columnPickerCurrent = 1;

  @Input()
  isLinkAble = false;

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
  protected readonly listActions = LIST_ACTIONS;
  protected readonly alignActions = ALIGN_ACTIONS;
  protected readonly bgGraphList = BG_GRAPH_LIST;
  protected formatBrushActive = false;
  private _destroyed = false;

  protected get formatBrushTitle() {
    return `格式刷（${IS_MAC ? "⌘" : "Ctrl"}+Shift+C）`;
  }

  ngOnInit() {
    this._destroyed = false;
    this.observeToolbarWidth();
    this.syncToolbarState(this.doc.selection.value);

    this._sub.add(
      this.doc.selection.changeObserve().subscribe(
        debounce((sel) => {
          this.handleSelectionChange(sel);
        }, 40),
      ),
    );

    this._sub.add(
      this.doc.event.add("selectEnd", () => {
        void this.tryApplyFormatBrush(this.doc.selection.value);
      }),
    );

    this._sub.add(
      this.doc.readonlySwitch$.subscribe((readonly) => {
        this.readonly = readonly;
        if (readonly) {
          this.clearFormatBrush();
          this._objectDrawInsert?.cancel();
        }
        this.cdr.markForCheck();
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

  ngOnDestroy() {
    this._destroyed = true;
    this._resizeObserver?.disconnect();
    this._resizeObserver = undefined;
    this.clearFormatBrush();
    this._objectDrawInsert?.destroy();
    this._objectDrawInsert = undefined;
    this._sub.unsubscribe();
  }

  private observeToolbarWidth(): void {
    const host = this.hostRef?.nativeElement;
    if (!host || typeof ResizeObserver === "undefined") return;

    this._resizeObserver = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? host.clientWidth;
      const nextLayout = this.resolveToolbarLayout(width);
      if (nextLayout === this.toolbarLayout) return;
      this.toolbarLayout = nextLayout;
      this.cdr.markForCheck();
    });
    this._resizeObserver.observe(host);
  }

  protected resolveToolbarLayout(
    width: number,
  ): "wide" | "balanced" | "compact" {
    return width >= 1480 ? "wide" : width >= 720 ? "balanced" : "compact";
  }

  protected scrollTextToolbar(direction: -1 | 1): void {
    const section = this.textSectionRef?.nativeElement;
    if (!section) return;
    section.scrollBy({ left: direction * 240, behavior: "smooth" });
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
    trigger: BcOverlayTriggerDirective,
  ) {
    trigger.closePanel();
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
    trigger: BcOverlayTriggerDirective,
  ) {
    trigger.closePanel();
    const align = ALIGN_ACTIONS.find((action) => action.value === item.value);
    if (align) this.setAlign(align.value);
  }

  protected setAlign(align: TAlignValue) {
    this.runWithSelection(() => {
      this.toolbarHelper.updateBlockProps({
        textAlign: align === "left" ? undefined : (align as any),
      });
    });
  }

  protected onColorPicked(evt: {
    type: string;
    color: string | null;
    group: ColorGroup;
  }) {
    this.runWithSelection(() => {
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

  protected onBgGraphPicked(bg: string | null) {
    this.runWithSelection(() => {
      this.toolbarHelper.formatText({ "a:bg": bg });
    });
  }

  /** 当前选区共有的字体缩放比例（1 = 默认/正文大小）。 */
  protected get activeFontScale(): number {
    return this.activeTypography.fs ?? 1;
  }

  protected get activeFontScaleLabel(): string {
    return this.activeTypography.fs === undefined
      ? "混合"
      : `${Math.round(this.activeFontScale * 1000) / 1000}×`;
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

  private applyInlineTypography(key: "ff" | "fs" | "ls", value: unknown) {
    this.runWithSelection(() => {
      this.toolbarHelper.formatText(
        createInlineTypographyPatch(key, value) as IInlineNodeAttrs,
      );
    });
  }

  protected onFontFamilyItemClicked(
    item: BcFloatToolbarItemComponent,
    trigger: BcOverlayTriggerDirective,
    parentTrigger?: BcOverlayTriggerDirective,
  ) {
    trigger.closePanel();
    parentTrigger?.closePanel();
    this.applyInlineTypography("ff", item.value);
  }

  protected onFontScaleItemClicked(
    item: BcFloatToolbarItemComponent,
    trigger: BcOverlayTriggerDirective,
  ) {
    trigger.closePanel();
    this.applyInlineTypography("fs", item.value);
  }

  protected onLetterSpacingItemClicked(
    item: BcFloatToolbarItemComponent,
    trigger: BcOverlayTriggerDirective,
    parentTrigger?: BcOverlayTriggerDirective,
  ) {
    trigger.closePanel();
    parentTrigger?.closePanel();
    this.applyInlineTypography("ls", item.value);
  }

  protected onLineHeightItemClicked(
    item: BcFloatToolbarItemComponent,
    trigger: BcOverlayTriggerDirective,
    parentTrigger?: BcOverlayTriggerDirective,
  ) {
    trigger.closePanel();
    parentTrigger?.closePanel();
    const value = normalizeTypographyLineHeight(item.value);
    this.runWithSelection(
      () => {
        this.toolbarHelper.updateBlockProps({ lh: value });
      },
      { allowPartialEditableBlocks: true },
    );
  }

  protected letterSpacingOptionLabel(value: number): string {
    return `${Math.round(value * 1000) / 1000}em`;
  }

  protected async insertQuickTable(
    evt: ITableSizePickedEvent,
    trigger: BcOverlayTriggerDirective,
  ) {
    if (this.readonly || !this.selectionJSON) return;
    this.restoreSelection();
    const selection = this.doc.selection.value;
    if (!this.isLiveSelection(selection)) return;

    const inserted = await this.insertTable(evt.rows, evt.cols, selection);
    if (!inserted) return;
    trigger.closePanel();
    this.syncToolbarState(this.doc.selection.value);
    this.cdr.markForCheck();
  }

  protected async insertColumnsBlock(
    evt: IColumnCountPickedEvent,
    trigger: BcOverlayTriggerDirective,
  ) {
    if (this.readonly || !this.selectionJSON) return;
    this.restoreSelection();
    const selection = this.doc.selection.value;
    if (
      !this.isLiveSelection(selection) ||
      !this.canUseColumnPicker(selection)
    ) {
      trigger.closePanel();
      this.syncToolbarState(selection);
      return;
    }

    const changed = await this.insertColumns(evt.count, selection);
    trigger.closePanel();
    if (!changed) return;
    this.syncToolbarState(this.doc.selection.value);
    this.cdr.markForCheck();
  }

  protected onMediaTypePicked(
    item: BcFloatToolbarItemComponent,
    trigger: BcOverlayTriggerDirective,
  ) {
    trigger.closePanel();
    if (item.value === "video" || item.value === "audio") {
      void this.insertSchemaBlock(item.value);
    }
  }

  protected async insertShape(
    shapeType: ShapeKind,
    trigger: BcOverlayTriggerDirective,
  ) {
    trigger.closePanel();
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
    trigger: BcOverlayTriggerDirective,
  ): void {
    trigger.closePanel();
    if (this.readonly) return;

    const schema = this.doc.schemas.get("text-box", false);
    if (!schema) return;
    const preset = getTextBoxPreset(presetId);

    const armed = this.armObjectDrawing({
      defaultWidth: preset.defaultWidth,
      defaultHeight: preset.defaultHeight,
      commit: (geometry) =>
        this.commitTextBox(presetId, schema.metadata.label, geometry),
    });
    if (!armed) {
      this.doc.messageService.warn(
        `无法在当前视图绘制${schema.metadata.label}`,
      );
    }
  }

  private async commitTextBox(
    presetId: TextBoxPresetId,
    label: string,
    geometry: ObjectDrawInsertGeometry,
  ): Promise<void> {
    if (this._destroyed || this.readonly) return;
    const preset = getTextBoxPreset(presetId);
    const snapshot = this.doc.schemas.createSnapshot("text-box", [
      "",
      {
        ...preset.props,
        width: geometry.width,
        height: geometry.height,
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

    this.doc.selection.selectOrSetCursorAtBlock(insertedId, true);
    const revealed = await this.doc.navigateToBlock(insertedId);
    if (revealed) {
      try {
        const block = this.doc.getBlockById(insertedId);
        if (block.flavour === "text-box") {
          (block as BlockCraft.IBlockComponents["text-box"]).enterEditing(true);
        }
      } catch {
        // 协同更新可能已移除视图；保留已建立的对象选区即可。
      }
    }
    this.syncToolbarState(this.doc.selection.value);
    this.cdr.markForCheck();
  }

  protected async insertWordArt(
    presetId: WordArtPresetId,
    trigger: BcOverlayTriggerDirective,
  ) {
    trigger.closePanel();
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
    const presetProps = {
      ...preset.props,
      width: geometry.width,
      height: geometry.height,
      gradientColors: [...preset.props.gradientColors],
      gradientStops: [...preset.props.gradientStops],
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
    if (
      this.readonly ||
      !this.allEditable ||
      !this.isLinkAble ||
      !this.hasTextSelection
    )
      return;
    if (this.isAttrActive("link")) {
      this.runWithSelection(() => {
        this.toolbarHelper.formatText({ "a:link": null });
      });
      return;
    }
    this.openLinkPad();
  }

  protected openLinkPad() {
    this.restoreSelection();
    const selection = this.doc.selection.value;
    if (
      !this.isLiveSelection(selection) ||
      !selection.isInSameBlock ||
      selection.start.type !== "text" ||
      !this.hasTextSelection
    )
      return;
    const selectionJSON = selection.toJSON();

    const rect = this.doc.selection.getSelectionRect();
    if (!rect) return;

    let fake;
    try {
      fake = this.doc.selection.createFakeRange(selection);
    } catch {
      return;
    }
    const overlay = this.doc.injector.get(Overlay);

    const positionStrategy = overlay
      .position()
      .global()
      .top(rect.bottom + "px")
      .left(rect.left + "px");
    const portal = new ComponentPortal(LinkInputPad);
    const ovr = overlay.create({
      positionStrategy,
      hasBackdrop: true,
      backdropClass: "cdk-overlay-transparent-backdrop",
    });

    const close = () => {
      ovr.dispose();
      fake.destroy();
      nextTick().then(() => {
        if (!this.replaySelection(selectionJSON)) return;
        this.syncToolbarState(this.doc.selection.value);
        this.cdr.markForCheck();
      });
    };

    const cpr = ovr.attach(portal);
    merge(ovr.backdropClick(), cpr.instance.onCancel)
      .pipe(takeUntilDestroyed(cpr.instance.destroyRef))
      .subscribe(close);
    cpr.instance.onConfirm
      .pipe(takeUntilDestroyed(cpr.instance.destroyRef))
      .subscribe((url: string) => {
        close();
        if (!this.replaySelection(selectionJSON)) return;
        const liveSelection = this.doc.selection.value;
        if (
          !this.isLiveSelection(liveSelection) ||
          liveSelection.start.type !== "text"
        )
          return;
        const startBlock = liveSelection.firstBlock as any;
        const startOff = liveSelection.start.offset;
        const len =
          liveSelection.isInSameBlock && liveSelection.end.type === "text"
            ? liveSelection.end.offset - startOff
            : startBlock.textLength - startOff;
        startBlock.formatText(startOff, len, { "a:link": url });
      });
  }

  protected insertFormula() {
    if (!this.hasTextSelection) return;
    this.runWithSelection(() => {
      const selection = this.doc.selection.value;
      if (!this.isLiveSelection(selection) || selection.start.type !== "text")
        return;
      const block = selection.firstBlock as any;
      const index = selection.start.offset;
      const length =
        selection.isInSameBlock && selection.end.type === "text"
          ? selection.end.offset - index
          : block.textLength - index;
      const text = this.doc.selection.getSelectedText();
      block.applyDeltaOperations([
        ...(index > 0 ? [{ retain: index }] : []),
        { delete: length },
        { insert: { latex: text } },
      ]);
    });
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
    },
  ) {
    if (this.readonly) return;
    this.restoreSelection();

    const selection = this.doc.selection.value;
    const canRun = options?.allowPartialEditableBlocks
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
    return this.canFormatTextSelection(selection);
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
    if (!common.allEditable || selection.start.type !== "text") return null;

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
    } as IInlineNodeAttrs;

    const typography = common.typography;
    if (typography?.ff !== undefined) {
      Object.assign(
        inlineAttrs,
        createInlineTypographyPatch("ff", typography.ff),
      );
    }
    if (typography?.fs !== undefined) {
      Object.assign(
        inlineAttrs,
        createInlineTypographyPatch("fs", typography.fs),
      );
    }
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
    this.toolbarHelper.formatText(payload.inlineAttrs, selection);
    if (Object.keys(payload.blockProps).length) {
      this.toolbarHelper.updateBlockProps(payload.blockProps, selection);
    }
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
      }
      // 各栏已清空，删除整个分栏块
      this.doc.crud.deleteBlockById(columnsBlock.id);
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
    const columnSchema = this.doc.schemas.get("column");
    if (!columnSchema) return null;

    const betweenIds = this.getSelectedBlockIds(selection);
    if (betweenIds.length < 1) return null;

    const blocks = betweenIds
      .map((id) => this.doc.getBlockById(id))
      .filter((b) => !!b);
    if (blocks.length < 1) return null;

    const parent = blocks[0].parentBlock;
    if (!parent) return null;

    // 必须同父、可作为列内容、父块允许放置 columns，否则不转换
    const sameParent = blocks.every((b) => b.parentId === parent.id);
    const allValidChildren = blocks.every((b) =>
      this.doc.schemas.isValidChildren(b.flavour, columnSchema),
    );
    if (
      !sameParent ||
      !allValidChildren ||
      !this.doc.canInsertChild(parent.id, "columns")
    ) {
      return null;
    }

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
    if (!this.isLiveSelection(selection)) {
      this.activeAttrs = new Map<string, any>();
      this.activeColors = {};
      this.activeProps = {};
      this.activeTypography = { ff: null, fs: null, ls: null };
      this.activeParagraphTypography = { lh: null };
      this.activeFlavour = "paragraph";
      this.allEditable = false;
      this.canSetLineHeight = false;
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
    this.canSetLineHeight = this.canSetLineHeightForSelection(selection);
    this.canUseColumns = this.canUseColumnPicker(selection);
    if (!this.canTransformBlocks) {
      this.activeAttrs = new Map<string, any>();
      this.activeColors = {};
      this.activeProps = {};
      this.activeTypography = { ff: null, fs: null, ls: null };
      this.activeParagraphTypography = { lh: null };
      this.activeFlavour = "paragraph";
      this.allEditable = false;
      this.isLinkAble = false;
      this.hasTextSelection = false;
      this.cdr.markForCheck();
      return;
    }

    const common = this.toolbarHelper.getCurrentCommonAttrs(selection);
    this.activeProps = { ...common.props };
    this.activeTypography = common.typography
      ? { ...common.typography }
      : { ff: null, fs: null, ls: null };
    this.activeParagraphTypography = common.paragraph
      ? { ...common.paragraph }
      : { lh: null };
    this.activeFlavour = common.flavour || "paragraph";
    this.allEditable = this.canFormatTextSelection(selection);
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
    if (!this.isLiveSelection(selection) || selection.isAllSelected)
      return false;
    if (this.isReadonlySelection(selection)) return false;

    let between: string[];
    try {
      between = this.getSelectedBlockIds(selection);
    } catch {
      return false;
    }
    if (!between.length) return false;
    return between.every((id) => this.isEditableTextBlockId(id));
  }

  private canUseColumnPicker(selection: BlockCraft.Selection | null) {
    if (!this.isLiveSelection(selection)) return false;
    if (selection.getTableCellSelection?.()) return false;
    if (selection.collapsed && selection.start.type !== "text") return false;
    if (this.findColumnsAncestor(selection.firstBlock)) return true;
    return this.canTransformSelection(selection);
  }

  private getSelectedBlockIds(selection: BlockCraft.Selection) {
    return getSelectionCoveredBlockIds(selection, this.doc);
  }

  private canFormatTextSelection(selection: BlockCraft.Selection | null) {
    return (
      this.isLiveSelection(selection) &&
      selection.start.type === "text" &&
      this.canTransformSelection(selection)
    );
  }

  private canSetLineHeightForSelection(
    selection: BlockCraft.Selection | null,
  ) {
    if (!this.isLiveSelection(selection) || selection.isAllSelected)
      return false;
    if (this.isReadonlySelection(selection)) return false;

    try {
      return this.getSelectedBlockIds(selection).some((id) =>
        this.isEditableTextBlockId(id),
      );
    } catch {
      return false;
    }
  }

  private isEditableTextBlockId(id: string) {
    if (
      typeof (this.doc as any).model?.exists === "function" &&
      this.doc.model.exists(id)
    ) {
      return (
        this.doc.model.getNodeType(id) === BlockNodeType.editable &&
        !this.doc.isPlainTextBlock(id)
      );
    }
    try {
      const block = this.doc.getBlockById(id);
      return this.doc.isEditable(block) && !block.plainTextOnly;
    } catch {
      return false;
    }
  }

  private isLiveSelection(
    selection: BlockCraft.Selection | null | undefined,
  ): selection is BlockCraft.Selection {
    return isSelectionAlive(selection as any, this.doc);
  }

  private isReadonlySelection(selection: BlockCraft.Selection) {
    return (
      this.doc.readonlyManager?.isSelectionReadonly(selection) ??
      this.doc.isReadonly
    );
  }

  private get toolbarHelper() {
    return (
      this.utils || (this._toolbarHelper ||= new TextToolbarHelper(this.doc))
    );
  }
}
