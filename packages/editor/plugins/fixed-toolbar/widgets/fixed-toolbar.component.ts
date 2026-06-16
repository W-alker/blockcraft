import {ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, OnInit, Output} from "@angular/core";
import {
  BcColumnCountPickerComponent,
  BcFloatToolbarComponent,
  BcFloatToolbarItemComponent,
  BcFontScalePickerComponent,
  BcOverlayTriggerDirective,
  BcTableSizePickerComponent,
  ColorGroup,
  ColorPickerComponent,
  IColumnCountPickedEvent,
  ITableSizePickedEvent
} from "../../../components";
import {
  BLOCK_CREATOR_SERVICE_TOKEN,
  IEditableBlockProps,
  IInlineNodeAttrs,
  ISelectionJSON,
  TextToolbarHelper
} from "../../../framework";
import {fromEvent, merge, Subscription} from "rxjs";
import {debounce, IS_MAC, nextTick} from "../../../global";
import {Overlay} from "@angular/cdk/overlay";
import {ComponentPortal} from "@angular/cdk/portal";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";
import {LinkInputPad} from "../../float-text-toolbar/widgets/link-input-pad";

type TInlineToggle = 'bold' | 'italic' | 'underline' | 'strike' | 'code' | 'sup' | 'sub'
type TAlignValue = 'left' | 'center' | 'right'
type TListFlavour = 'ordered' | 'bullet' | 'todo'
interface IStyleMenuItem {
  name: string
  value: any
  intro: string
}

interface IToolbarIconAction<T extends string = string> {
  value: T
  icon: string
  title: string
}

interface IFormatBrushPayload {
  inlineAttrs: IInlineNodeAttrs
}

export interface IFixedToolbarExtensionAction {
  key: string
  icon: string
  title: string
  active?: boolean
  disabled?: boolean
  dividerBefore?: boolean
}

export interface IFixedToolbarExtensionActionContext {
  action: IFixedToolbarExtensionAction
  selection: ISelectionJSON | null
  doc: BlockCraft.Doc
}

const HEADING_MENU_LIST: IStyleMenuItem[] = [
  {name: 'heading', intro: '正文', value: null},
  {name: 'heading', value: 1, intro: '一级标题'},
  {name: 'heading', value: 2, intro: '二级标题'},
  {name: 'heading', value: 3, intro: '三级标题'},
  {name: 'heading', value: 4, intro: '四级标题'},
]

const INLINE_TOGGLE_ACTIONS: IToolbarIconAction<TInlineToggle>[] = [
  {value: 'bold', icon: 'bc_jiacu', title: '加粗'},
  {value: 'italic', icon: 'bc_xieti', title: '斜体'},
  {value: 'underline', icon: 'bc_xiahuaxian', title: '下划线'},
  {value: 'strike', icon: 'bc_shanchuxian', title: '删除线'},
  {value: 'code', icon: 'bc_daimakuai', title: '行内代码'},
  {value: 'sup', icon: 'bc_shangbiao', title: '上标'},
  {value: 'sub', icon: 'bc_xiabiao', title: '下标'}
]

const LIST_ACTIONS: IToolbarIconAction<TListFlavour>[] = [
  {value: 'todo', icon: 'bc_gongzuoshixiang', title: '待办事项'},
  {value: 'bullet', icon: 'bc_wuxuliebiao', title: '无序列表'},
  {value: 'ordered', icon: 'bc_youxuliebiao', title: '有序列表'}
]

const ALIGN_ACTIONS: IToolbarIconAction<TAlignValue>[] = [
  {value: 'left', icon: 'bc_zuoduiqi', title: '左对齐'},
  {value: 'center', icon: 'bc_juzhongduiqi', title: '居中'},
  {value: 'right', icon: 'bc_youduiqi', title: '右对齐'}
]

const BG_GRAPH_LIST: Array<{ attr: string | null; class: string }> = [
  {
    attr: null,
    class: 'none'
  },
  {
    attr: 'r1',
    class: 'radius-1'
  },
  {
    attr: 'rb',
    class: 'right-border'
  }
]

@Component({
  selector: "bc-fixed-toolbar",
  template: `
    <ng-content select="[fixed-toolbar-prefix]"></ng-content>

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

    <span class="toolbar-divider"></span>

    <button
      class="toolbar-btn toolbar-btn--style"
      [disabled]="readonly || !canTransformBlocks"
      [bcOverlayTrigger]="styleDropdown"
      [bcOverlayDisabled]="readonly || !canTransformBlocks"
      #styleTrigger="bcOverlayTrigger"
    >
      <span>{{ activeStyleItem.intro }}</span>
      <i class="bc_icon bc_xiajaintou"></i>
    </button>

    <button
      class="toolbar-btn toolbar-btn--dropdown"
      title="字体缩放"
      [disabled]="readonly || !allEditable"
      [bcOverlayTrigger]="fontScalePicker"
      [bcOverlayDisabled]="readonly || !allEditable"
    >
      <i class="bc_icon bc_wenben"></i>
      <span class="toolbar-btn__scale">{{ activeFontScaleLabel }}</span>
      <i class="bc_icon bc_xiajaintou toolbar-btn__caret"></i>
    </button>

    @for (item of inlineToggleActions; track item.value) {
      <button
        class="toolbar-btn"
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
      [disabled]="readonly || (!formatBrushActive && !canCaptureFormatBrush())"
      (mousedown)="onActionMouseDown($event)"
      (click)="toggleFormatBrush()"
    >
      <i class="bc_icon bc_geshishua"></i>
    </button>

    <span class="toolbar-divider"></span>

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

    @for (item of alignActions; track item.value) {
      <button
        class="toolbar-btn"
        [class.active]="isAlignActive(item.value)"
        [title]="item.title"
        [disabled]="readonly || !allEditable"
        (mousedown)="onActionMouseDown($event)"
        (click)="setAlign(item.value)"
      >
        <i [class]="['bc_icon', item.icon]"></i>
      </button>
    }

    <span class="toolbar-divider"></span>

    <button
      class="toolbar-btn"
      [class.active]="isAttrActive('link')"
      title="链接"
      [disabled]="readonly || !allEditable || !isLinkAble || !hasTextSelection"
      (mousedown)="onActionMouseDown($event)"
      (click)="onLinkAction()"
    >
      <i class="bc_icon bc_lianjie"></i>
    </button>

    <button
      class="toolbar-btn"
      title="行内公式"
      [disabled]="readonly || !allEditable || !isLinkAble || !hasTextSelection"
      (mousedown)="onActionMouseDown($event)"
      (click)="insertFormula()"
    >
      <i class="bc_icon bc_gongshi"></i>
    </button>

    <button
      class="toolbar-btn toolbar-btn--dropdown"
      title="插入表格"
      [disabled]="readonly || !selectionJSON"
      [bcOverlayTrigger]="quickTablePicker"
      [bcOverlayDisabled]="readonly || !selectionJSON"
      #quickTableTrigger="bcOverlayTrigger"
    >
      <i class="bc_icon bc_column-vertical"></i>
      <i class="bc_icon bc_xiajaintou toolbar-btn__caret"></i>
    </button>

    <button
      class="toolbar-btn toolbar-btn--dropdown"
      title="分栏"
      [disabled]="readonly || !selectionJSON"
      [bcOverlayTrigger]="columnCountPicker"
      [bcOverlayDisabled]="readonly || !selectionJSON"
      #columnCountTrigger="bcOverlayTrigger"
    >
      <i class="bc_icon bc_fenlan"></i>
      <i class="bc_icon bc_xiajaintou toolbar-btn__caret"></i>
    </button>

    <button
      class="toolbar-btn"
      title="插入图片"
      [disabled]="readonly || !selectionJSON"
      (mousedown)="onActionMouseDown($event)"
      (click)="insertSchemaBlock('image')"
    >
      <i class="bc_icon bc_tupian-color"></i>
    </button>

    <button
      class="toolbar-btn toolbar-btn--dropdown"
      title="插入视频或音频"
      [disabled]="readonly || !selectionJSON"
      [bcOverlayTrigger]="mediaTypePicker"
      [bcOverlayDisabled]="readonly || !selectionJSON"
      #mediaTypeTrigger="bcOverlayTrigger"
    >
      <i class="bc_icon bc_shipin"></i>
      <i class="bc_icon bc_xiajaintou toolbar-btn__caret"></i>
    </button>

    @if (extensionActions.length) {
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
    }

    <ng-content></ng-content>
    <ng-content select="[fixed-toolbar-suffix]"></ng-content>

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

    <ng-template #fontScalePicker>
      <bc-font-scale-picker
        [current]="activeFontScale"
        (pick)="onFontScalePicked($event)"
      ></bc-font-scale-picker>
    </ng-template>

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
        display: flex;
        align-items: center;
        gap: 4px;
        flex-wrap: wrap;
        width: max-content;
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
        opacity: .6;
        flex-shrink: 0;
      }

      .toolbar-btn__scale {
        font-size: 12px;
        min-width: 26px;
        text-align: center;
      }

      .toolbar-btn--dropdown {
        gap: 4px;
      }

      .toolbar-btn--style {
        gap: 4px;
        min-width: 80px;
        border: 1px solid var(--bc-border-color);
      }

      .toolbar-btn--style > span {
        font-size: 12px;
        flex: 1;
        text-align: left;
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
    BcFontScalePickerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    contenteditable: "false",
    "[class.readonly]": "readonly",
    "[class.hidden]": "!visible",
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

  constructor(private readonly cdr: ChangeDetectorRef) {}

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

  @Input()
  activeFlavour: BlockCraft.BlockFlavour = "paragraph";

  @Input()
  allEditable = false;

  canTransformBlocks = false;

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

  protected get formatBrushTitle() {
    return `格式刷（${IS_MAC ? "⌘" : "Ctrl"}+Shift+C）`;
  }

  ngOnInit() {
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
    this.clearFormatBrush();
    this._sub.unsubscribe();
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
    return this.parseFontScale(this.activeAttrs.get("fontSize"));
  }

  protected get activeFontScaleLabel(): string {
    return `${this.activeFontScale}×`;
  }

  /** 仅把 `<n>em` 解析为相对比例；px 等非比例值或缺省一律回退 1（默认大小）。 */
  private parseFontScale(value: unknown): number {
    if (typeof value === "string") {
      const match = /^([\d.]+)em$/.exec(value.trim());
      if (match) {
        const n = Number.parseFloat(match[1]);
        if (Number.isFinite(n) && n > 0) return Math.round(n * 100) / 100;
      }
    }
    return 1;
  }

  protected onFontScalePicked(ratio: number) {
    // 用实时选区（与取色器一致）：picker 里的按钮在 mousedown 已 preventDefault，
    // 不会夺走编辑器焦点，故 selection 始终是最新的——不能用面板打开时的快照，
    // 否则「选号→输入→再选号」时会把光标回放到输入之前。
    // 光标（collapsed）场景下 formatText 会把比例写进 pendingInsertAttrs，
    // 后续输入自动套用该字号。
    this.runWithSelection(() => {
      this.toolbarHelper.formatText({
        "s:fontSize": ratio === 1 ? null : `${ratio}em`,
      } as IInlineNodeAttrs);
    });
  }

  protected async insertQuickTable(
    evt: ITableSizePickedEvent,
    trigger: BcOverlayTriggerDirective,
  ) {
    if (this.readonly || !this.selectionJSON) return;
    this.restoreSelection();
    const selection = this.doc.selection.value;
    if (!selection) return;

    const inserted = await this.insertTable(evt.rows, evt.cols, selection);
    if (!inserted) return;
    trigger.closePanel();
    this.doc.selection.recalculate();
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
    if (!selection) return;

    const changed = await this.insertColumns(evt.count, selection);
    trigger.closePanel();
    if (!changed) return;
    this.doc.selection.recalculate();
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
      !selection ||
      !selection.isInSameBlock ||
      selection.start.type !== "text" ||
      !this.hasTextSelection
    )
      return;
    const selectionJSON = selection.toJSON();

    const rect = this.doc.selection.getSelectionRect()!;
    const fake = this.doc.selection.createFakeRange(selection);
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
        this.doc.selection.replay(selectionJSON);
        this.doc.selection.recalculate();
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
        if (selection.start.type !== "text") return;
        const startBlock = selection.firstBlock as any;
        const startOff = selection.start.offset;
        const len =
          selection.isInSameBlock && selection.end.type === "text"
            ? selection.end.offset - startOff
            : startBlock.textLength - startOff;
        startBlock.formatText(startOff, len, { "a:link": url });
      });
  }

  protected insertFormula() {
    if (!this.hasTextSelection) return;
    this.runWithSelection(() => {
      const selection = this.doc.selection.value;
      if (!selection || selection.start.type !== "text") return;
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
        "s:fontSize": null,
        "s:fontFamily": null,
      } as unknown as IInlineNodeAttrs);
      // if (this.activeFlavour !== 'paragraph') {
      //   this.toolbarHelper.transformBlocks('paragraph')
      // }
      this.toolbarHelper.updateBlockProps({
        heading: undefined,
        textAlign: undefined,
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
    this.extensionAction.emit({
      action,
      selection: this.selectionJSON,
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
    return target instanceof HTMLElement && !!target.closest("input,textarea,select");
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
    options?: { allowBlockTransform?: boolean },
  ) {
    if (this.readonly) return;
    this.restoreSelection();

    const selection = this.doc.selection.value;
    const canRun = options?.allowBlockTransform
      ? this.canTransformSelection(selection)
      : this.canFormatTextSelection(selection);
    if (!canRun) return;
    run();

    this.doc.selection.recalculate();
    const current = this.doc.selection.value;
    this.syncToolbarState(current);
    this.cdr.markForCheck();
  }

  private restoreSelection() {
    if (!this.selectionJSON) return;
    try {
      this.doc.selection.replay(this.selectionJSON);
    } catch {}
  }

  private canInsertBlock(
    flavour: BlockCraft.BlockFlavour,
    selection: BlockCraft.Selection | null = this.doc.selection.value,
  ) {
    return !!selection;
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
      "s:fontSize": this.readFormatBrushAttr(common.attrs, "fontSize"),
    } as IInlineNodeAttrs;

    return {
      inlineAttrs,
    } satisfies IFormatBrushPayload;
  }

  private readFormatBrushAttr(attrs: Map<string, any>, key: string) {
    return attrs.has(key) ? attrs.get(key) : null;
  }

  private getSelectionKey(selection: BlockCraft.Selection | null) {
    return selection ? JSON.stringify(selection.toJSON()) : null;
  }

  private resolveInsertAnchor(
    flavour: BlockCraft.BlockFlavour,
    selection: BlockCraft.Selection,
  ) {
    let anchor: BlockCraft.BlockComponent | null = selection.lastBlock;
    while (
      anchor?.parentBlock &&
      !this.doc.schemas.isValidChildren(flavour, anchor.parentBlock.flavour)
    ) {
      anchor = anchor.parentBlock;
    }
    if (
      !anchor ||
      !anchor.parentBlock ||
      !this.doc.schemas.isValidChildren(flavour, anchor.parentBlock.flavour)
    ) {
      return null;
    }
    return anchor;
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
      this.doc.selection.recalculate();
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
  }

  protected async insertSchemaBlock(flavour: "image" | "video" | "audio") {
    if (this.readonly || !this.selectionJSON) return;
    this.restoreSelection();
    const selection = this.doc.selection.value;
    if (!selection) return;

    const schema = this.doc.schemas.get(flavour);
    if (!schema) return;

    const anchor = this.resolveInsertAnchor(flavour, selection);
    if (!anchor) {
      this.doc.messageService.warn(`此处不能添加${schema.metadata.label}`);
      return;
    }

    const blockCreator = this.doc.injector.get(BLOCK_CREATOR_SERVICE_TOKEN);

    try {
      const params = await blockCreator.getParamsByScheme(schema as any);
      if (!params) return;

      const snapshot = this.doc.schemas.createSnapshot(flavour, params as any);
      await this.doc.chain().insertAfterSnapshots(anchor, [snapshot]).run();
      this.doc.selection.selectOrSetCursorAtBlock(snapshot.id, true);
      this.doc.selection.recalculate();
      this.syncToolbarState(this.doc.selection.value);
      this.cdr.markForCheck();
    } catch {
    }
  }

  private async insertTable(
    rows: number,
    cols: number,
    selection: BlockCraft.Selection,
  ) {
    const safeRows = Math.max(1, Math.min(12, Math.floor(rows) || 0));
    const safeCols = Math.max(1, Math.min(12, Math.floor(cols) || 0));
    const anchor = this.resolveInsertAnchor("table", selection);
    if (!anchor) return null;

    const tableSnapshot = this.doc.schemas.createSnapshot("table", [
      safeRows,
      safeCols,
    ]);
    await this.doc.chain().insertAfterSnapshots(anchor, [tableSnapshot]).run();

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
      return this.applyColumnCount(columnsBlock, safeCount);
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
          const keepLen = this.doc.getBlockById(keepLastId)?.childrenLength ?? 0;
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
    return columnsBlock;
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

    const betweenIds = this.doc.queryBlocksBetween(
      selection.firstBlock,
      selection.lastBlock,
      true,
    );
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
      !this.doc.schemas.isValidChildren("columns", parent.flavour)
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
    if (!selection) {
      this.activeAttrs = new Map<string, any>();
      this.activeColors = {};
      this.activeProps = {};
      this.activeFlavour = "paragraph";
      this.allEditable = false;
      this.canTransformBlocks = false;
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
    if (!this.canTransformBlocks) {
      this.activeAttrs = new Map<string, any>();
      this.activeColors = {};
      this.activeProps = {};
      this.activeFlavour = "paragraph";
      this.allEditable = false;
      this.isLinkAble = false;
      this.hasTextSelection = false;
      this.cdr.markForCheck();
      return;
    }

    const common = this.toolbarHelper.getCurrentCommonAttrs(selection);
    this.activeProps = { ...common.props };
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
    if (!selection || selection.isAllSelected) return false;

    const between = this.doc.queryBlocksBetween(
      selection.firstBlock,
      selection.lastBlock,
      true,
    );
    return between.every((id) => {
      const block = this.doc.getBlockById(id);
      return this.doc.isEditable(block) && !block.plainTextOnly;
    });
  }

  private canFormatTextSelection(selection: BlockCraft.Selection | null) {
    return (
      !!selection &&
      selection.start.type === "text" &&
      this.canTransformSelection(selection)
    );
  }

  private get toolbarHelper() {
    return (
      this.utils || (this._toolbarHelper ||= new TextToolbarHelper(this.doc))
    );
  }
}
