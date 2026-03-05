import {ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, OnInit, Output} from "@angular/core";
import {
  BcColumnCountPickerComponent,
  BcOverlayTriggerDirective,
  BcTableSizePickerComponent,
  ColorGroup,
  ColorPickerComponent,
  IColumnCountPickedEvent,
  ITableSizePickedEvent
} from "../../../components";
import {IBlockSelectionJSON, IEditableBlockProps, IInlineNodeAttrs, TextToolbarHelper} from "../../../framework";
import {merge, Subscription} from "rxjs";
import {debounce, nextTick} from "../../../global";
import {Overlay} from "@angular/cdk/overlay";
import {ComponentPortal} from "@angular/cdk/portal";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";
import {LinkInputPad} from "../../float-text-toolbar/widgets/link-input-pad";

type TInlineToggle = 'bold' | 'italic' | 'underline' | 'strike' | 'code' | 'sup' | 'sub'
type TAlignValue = 'left' | 'center' | 'right'
type TListFlavour = 'ordered' | 'bullet' | 'todo'
type TStyleValue = 'paragraph' | 'heading-1' | 'heading-2' | 'heading-3' | 'heading-4' | TListFlavour

interface IToolbarOption<T extends string = string> {
  value: T
  label: string
}

interface IToolbarIconAction<T extends string = string> {
  value: T
  icon: string
  title: string
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
  selection: IBlockSelectionJSON | null
  doc: BlockCraft.Doc
}

const STYLE_OPTIONS: IToolbarOption<TStyleValue>[] = [
  {value: 'paragraph', label: '正文'},
  {value: 'heading-1', label: '一级标题'},
  {value: 'heading-2', label: '二级标题'},
  {value: 'heading-3', label: '三级标题'},
  {value: 'heading-4', label: '四级标题'},
  {value: 'ordered', label: '有序列表'},
  {value: 'bullet', label: '无序列表'},
  {value: 'todo', label: '待办事项'}
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

    <button class="toolbar-btn" title="撤销" (mousedown)="onActionMouseDown($event)" (click)="undo()">
      <i class="bc_icon bc_chehui"></i>
    </button>
    <button class="toolbar-btn" title="重做" (mousedown)="onActionMouseDown($event)" (click)="redo()">
      <i class="bc_icon bc_huitui"></i>
    </button>

    <span class="toolbar-divider"></span>

    <label class="toolbar-select toolbar-select--style">
      <select [disabled]="readonly || !allEditable"
              [value]="selectedStyle"
              (change)="onStyleChanged($event)">
        @for (item of styleOptions; track item.value) {
          <option [value]="item.value">{{ item.label }}</option>
        }
      </select>
    </label>

    @for (item of inlineToggleActions; track item.value) {
      <button class="toolbar-btn"
              [class.active]="isAttrActive(item.value)"
              [title]="item.title"
              [disabled]="readonly || !allEditable"
              (mousedown)="onActionMouseDown($event)"
              (click)="toggleInlineAttr(item.value)">
        <i [class]="['bc_icon', item.icon]"></i>
      </button>
    }

    <span class="toolbar-divider"></span>

    @for (item of listActions; track item.value) {
      <button class="toolbar-btn"
              [class.active]="activeFlavour === item.value"
              [title]="item.title"
              [disabled]="readonly || !allEditable"
              (mousedown)="onActionMouseDown($event)"
              (click)="setList(item.value)">
        <i [class]="['bc_icon', item.icon]"></i>
      </button>
    }

    @for (item of alignActions; track item.value) {
      <button class="toolbar-btn"
              [class.active]="isAlignActive(item.value)"
              [title]="item.title"
              [disabled]="readonly || !allEditable"
              (mousedown)="onActionMouseDown($event)"
              (click)="setAlign(item.value)">
        <i [class]="['bc_icon', item.icon]"></i>
      </button>
    }

    <span class="toolbar-divider"></span>

    <button class="toolbar-btn"
            title="文字/背景颜色"
            [attr.disabled]="readonly || !allEditable ? '' : null"
            [disabled]="readonly || !allEditable"
            [bcOverlayTrigger]="colorPicker"
            [style.color]="activeColors['color']"
            [style.background-color]="activeColors['backColor']">
      <i class="bc_icon bc_bianji"></i>
    </button>

    @if (isLinkAble) {
      <button class="toolbar-btn"
              [class.active]="isAttrActive('link')"
              title="链接"
              [disabled]="readonly || !allEditable || !hasTextSelection"
              (mousedown)="onActionMouseDown($event)"
              (click)="onLinkAction()">
        <i class="bc_icon bc_lianjie"></i>
      </button>

      <button class="toolbar-btn"
              title="行内公式"
              [disabled]="readonly || !allEditable || !hasTextSelection"
              (mousedown)="onActionMouseDown($event)"
              (click)="insertFormula()">
        <i class="bc_icon bc_gongshi"></i>
      </button>
    }

    <button class="toolbar-btn"
            title="清除格式"
            [disabled]="readonly || !allEditable"
            (mousedown)="onActionMouseDown($event)"
            (click)="clearFormat()">
      <i class="bc_icon bc_quxiao"></i>
    </button>

    <span class="toolbar-divider"></span>

    <button class="toolbar-btn"
            title="插入表格"
            [disabled]="readonly || !selectionJSON"
            [bcOverlayTrigger]="quickTablePicker">
      <i class="bc_icon bc_column-vertical"></i>
    </button>

    <button class="toolbar-btn"
            title="创建分栏"
            [disabled]="readonly || !selectionJSON"
            [bcOverlayTrigger]="columnCountPicker">
      <i class="bc_icon bc_fenlan"></i>
    </button>

    @if (extensionActions.length) {
      <span class="toolbar-divider"></span>

      @for (item of extensionActions; track item.key) {
        @if (item.dividerBefore) {
          <span class="toolbar-divider"></span>
        }

        <button class="toolbar-btn"
                [class.active]="!!item.active"
                [title]="item.title"
                [disabled]="readonly || !!item.disabled"
                (mousedown)="onActionMouseDown($event)"
                (click)="onExtensionAction(item)">
          <i [class]="['bc_icon', item.icon]"></i>
        </button>
      }
    }

    <ng-content></ng-content>
    <ng-content select="[fixed-toolbar-suffix]"></ng-content>

    <ng-template #colorPicker>
      <bc-color-picker (colorPicked)="onColorPicked($event)"
                       [gapAround]="8"
                       [activeColors]="activeColors">
        <div class="bc-color-group">
          <div class="bc-color-group-title">背景图形</div>
          <div class="bg-list">
            @for (item of bgGraphList; track item.attr) {
              <div class="bg-graph-item"
                   [class]="item.class"
                   [class.active]="activeAttrs.get('bg') == item.attr"
                   (click)="onBgGraphPicked(item.attr)">
                <span [style.background-color]="activeColors['backColor'] || '#f4a1a1'"
                      [style.color]="activeColors['color'] || '#ffffff'">文本</span>
              </div>
            }
          </div>
        </div>
      </bc-color-picker>
    </ng-template>

    <ng-template #quickTablePicker>
      <bc-table-size-picker (pick)="insertQuickTable($event)"></bc-table-size-picker>
    </ng-template>

    <ng-template #columnCountPicker>
      <bc-column-count-picker (pick)="insertColumnsBlock($event)"></bc-column-count-picker>
    </ng-template>
  `,
  styles: [`
    :host {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-wrap: wrap;
      width: max-content;
      padding: var(--bc-fixed-toolbar-padding, 5px 8px);
      border: var(--bc-fixed-toolbar-border, 1px solid var(--bc-float-toolbar-divider-color));
      box-shadow: var(--bc-fixed-toolbar-shadow, 0 6px 16px rgba(15, 15, 15, 0.08));
      pointer-events: auto;
      transition: opacity .12s ease;
      will-change: transform;
    }

    :host(.hidden) {
      opacity: 0;
      visibility: hidden;
    }

    :host(.readonly) {
      opacity: .6;
      pointer-events: none;
    }

    .toolbar-btn {
      height: 28px;
      min-width: 28px;
      border: 0;
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
    }

    .toolbar-btn:hover:not(:disabled) {
      background: var(--bc-float-toolbar-item-hover-bg);
    }

    .toolbar-btn.active {
      background: var(--bc-float-toolbar-item-active-bg);
      color: var(--bc-active-color);
    }

    .toolbar-btn:disabled {
      opacity: .4;
      cursor: not-allowed;
    }

    .toolbar-btn > i {
      font-size: 14px;
      color: inherit;
    }

    .toolbar-select {
      position: relative;
      height: 28px;
      display: inline-flex;
      align-items: center;
      border: 1px solid var(--bc-border-color);
      border-radius: 6px;
      overflow: hidden;
      background: var(--bc-bg-primary);
    }

    .toolbar-select > select {
      height: 100%;
      border: 0;
      outline: none;
      background: transparent;
      color: var(--bc-color);
      font-size: 12px;
      padding: 0 6px;
      cursor: pointer;
    }

    .toolbar-select > select:disabled {
      cursor: not-allowed;
      opacity: .45;
    }

    .toolbar-select--style > select {
      min-width: 96px;
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
      background: linear-gradient(-29deg, transparent 49%, var(--bc-color-dark) 50%, transparent 51%);
    }

    .bg-graph-item.none > span {
      display: none;
    }

    .bg-graph-item.radius-1 > span {
      border-radius: 1em;
    }

    .bg-graph-item.right-border > span {
      border-radius: .3em;
      border-right: .25em solid var(--bc-active-color);
    }
  `],
  standalone: true,
  imports: [
    BcOverlayTriggerDirective,
    ColorPickerComponent,
    BcTableSizePickerComponent,
    BcColumnCountPickerComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'contenteditable': 'false',
    '[class.readonly]': 'readonly',
    '[class.hidden]': '!visible',
    '[style.--bc-fixed-toolbar-top.px]': 'stickyTop',
    '(mousedown)': 'onToolbarMouseDown($event)'
  }
})
export class FixedTextToolbarComponent implements OnInit, OnDestroy {
  private readonly _sub = new Subscription()
  private _toolbarHelper?: TextToolbarHelper

  constructor(private readonly cdr: ChangeDetectorRef) {
  }

  @Input({required: true})
  doc!: BlockCraft.Doc

  @Input()
  utils?: TextToolbarHelper

  @Input()
  readonly = false

  @Input()
  stickyTop = 0

  @Input()
  visible = true

  @Input()
  activeAttrs = new Map<string, any>()

  @Input()
  activeColors: Record<string, string | null> = {}

  @Input()
  activeProps: Partial<IEditableBlockProps> = {}

  @Input()
  activeFlavour: BlockCraft.BlockFlavour = 'paragraph'

  @Input()
  allEditable = false

  @Input()
  isLinkAble = false

  private _hasTextSelection = false

  @Input()
  set hasTextSelection(value: boolean) {
    this._hasTextSelection = value
  }

  get hasTextSelection() {
    return this._hasTextSelection
  }

  @Input()
  selectionJSON: IBlockSelectionJSON | null = null

  @Input()
  extensionActions: IFixedToolbarExtensionAction[] = []

  @Output()
  extensionAction = new EventEmitter<IFixedToolbarExtensionActionContext>()

  protected readonly styleOptions = STYLE_OPTIONS
  protected readonly inlineToggleActions = INLINE_TOGGLE_ACTIONS
  protected readonly listActions = LIST_ACTIONS
  protected readonly alignActions = ALIGN_ACTIONS
  protected readonly bgGraphList = BG_GRAPH_LIST

  ngOnInit() {
    this.syncToolbarState(this.doc.selection.value)

    this._sub.add(this.doc.selection.changeObserve().subscribe(debounce((sel) => {
      this.syncToolbarState(sel)
    }, 40)))

    this._sub.add(this.doc.readonlySwitch$.subscribe((readonly) => {
      this.readonly = readonly
      this.cdr.markForCheck()
    }))
  }

  ngOnDestroy() {
    this._sub.unsubscribe()
  }

  protected get selectedStyle(): TStyleValue {
    if (this.activeFlavour === 'ordered' || this.activeFlavour === 'bullet' || this.activeFlavour === 'todo') {
      return this.activeFlavour
    }
    const heading = this.activeProps.heading
    if (typeof heading === 'number' && heading > 0 && heading <= 4) {
      return `heading-${heading}` as TStyleValue
    }
    return 'paragraph'
  }

  protected onToolbarMouseDown(evt: MouseEvent) {
    const target = evt.target as HTMLElement | null
    if (!target) return
    if (target.closest('input,select,textarea')) return
    evt.preventDefault()
    evt.stopPropagation()
  }

  protected onActionMouseDown(evt: MouseEvent) {
    evt.preventDefault()
    evt.stopPropagation()
  }

  protected undo() {
    if (this.readonly) return
    this.doc.crud.undoManager.undo()
  }

  protected redo() {
    if (this.readonly) return
    this.doc.crud.undoManager.redo()
  }

  protected onStyleChanged(evt: Event) {
    const value = (evt.target as HTMLSelectElement).value as TStyleValue
    this.runWithSelection(() => {
      if (value === 'ordered' || value === 'bullet' || value === 'todo') {
        this.toolbarHelper.transformBlocks(value)
        return
      }

      if (this.activeFlavour !== 'paragraph') {
        this.toolbarHelper.transformBlocks('paragraph')
      }

      if (value === 'paragraph') {
        this.toolbarHelper.updateBlockProps({heading: undefined})
        return
      }

      const heading = Number(value.replace('heading-', ''))
      if (Number.isNaN(heading) || heading < 1 || heading > 4) return
      this.toolbarHelper.updateBlockProps({heading})
    })
  }

  protected isAttrActive(name: string) {
    return this.activeAttrs.has(name) && this.activeAttrs.get(name) !== null
  }

  protected toggleInlineAttr(name: TInlineToggle) {
    const active = this.isAttrActive(name)
    this.runWithSelection(() => {
      this.toolbarHelper.formatText({[`a:${name}`]: active ? null : true} as IInlineNodeAttrs)
    })
  }

  protected setList(flavour: TListFlavour) {
    this.runWithSelection(() => {
      this.toolbarHelper.transformBlocks(flavour)
    })
  }

  protected isAlignActive(align: TAlignValue) {
    if (align === 'left') return !this.activeProps.textAlign
    return this.activeProps.textAlign === align
  }

  protected setAlign(align: TAlignValue) {
    this.runWithSelection(() => {
      this.toolbarHelper.updateBlockProps({
        textAlign: align === 'left' ? undefined : align as any
      })
    })
  }

  protected onColorPicked(evt: { type: string; color: string | null; group: ColorGroup }) {
    this.runWithSelection(() => {
      switch (evt.type) {
        case 'color':
          this.toolbarHelper.formatText({'s:color': evt.color})
          break
        case 'backColor':
          this.toolbarHelper.formatText({'s:background': evt.color === 'transparent' ? null : evt.color})
          break
      }
    })
  }

  protected onBgGraphPicked(bg: string | null) {
    this.runWithSelection(() => {
      this.toolbarHelper.formatText({'a:bg': bg})
    })
  }

  protected async insertQuickTable(evt: ITableSizePickedEvent) {
    if (this.readonly || !this.selectionJSON) return
    this.restoreSelection()
    const selection = this.doc.selection.value
    if (!selection) return

    const inserted = await this.insertTable(evt.rows, evt.cols, selection)
    if (!inserted) return
    this.doc.selection.recalculate()
    this.syncToolbarState(this.doc.selection.value)
    this.cdr.markForCheck()
  }

  protected async insertColumnsBlock(evt: IColumnCountPickedEvent) {
    if (this.readonly || !this.selectionJSON) return
    this.restoreSelection()
    const selection = this.doc.selection.value
    if (!selection) return

    const inserted = await this.insertColumns(evt.count, selection)
    if (!inserted) return
    this.doc.selection.recalculate()
    this.syncToolbarState(this.doc.selection.value)
    this.cdr.markForCheck()
  }

  protected onLinkAction() {
    if (this.readonly || !this.allEditable || !this.isLinkAble || !this.hasTextSelection) return
    if (this.isAttrActive('link')) {
      this.runWithSelection(() => {
        this.toolbarHelper.formatText({'a:link': null})
      })
      return
    }
    this.openLinkPad()
  }

  protected openLinkPad() {
    this.restoreSelection()
    const selection = this.doc.selection.value
    if (!selection || !selection.isInSameBlock || selection.from.type !== 'text' || !this.hasTextSelection) return
    const selectionJSON = selection.toJSON()

    const rect = selection.raw.getBoundingClientRect()
    const fake = this.doc.selection.createFakeRange(selection)
    const overlay = this.doc.injector.get(Overlay)

    const positionStrategy = overlay.position().global().top(rect.bottom + 'px').left(rect.left + 'px')
    const portal = new ComponentPortal(LinkInputPad)
    const ovr = overlay.create({
      positionStrategy,
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop',
    })

    const close = () => {
      ovr.dispose()
      fake.destroy()
      nextTick().then(() => {
        this.doc.selection.replay(selectionJSON)
        this.doc.selection.recalculate()
        this.syncToolbarState(this.doc.selection.value)
        this.cdr.markForCheck()
      })
    }

    const cpr = ovr.attach(portal)
    merge(ovr.backdropClick(), cpr.instance.onCancel).pipe(takeUntilDestroyed(cpr.instance.destroyRef)).subscribe(close)
    cpr.instance.onConfirm.pipe(takeUntilDestroyed(cpr.instance.destroyRef)).subscribe((url: string) => {
      close()
      if (selection.from.type !== 'text') return
      const {index, length} = selection.from
      selection.from.block.formatText(index, length, {'a:link': url})
    })
  }

  protected insertFormula() {
    if (!this.hasTextSelection) return
    this.runWithSelection(() => {
      const selection = this.doc.selection.value
      if (!selection || selection.from.type !== 'text') return
      const {block, index, length} = selection.from
      const text = selection.raw.toString()
      block.applyDeltaOperations([
        ...(index > 0 ? [{retain: index}] : []),
        {delete: length},
        {insert: {latex: text}}
      ])
    })
  }

  protected clearFormat() {
    this.runWithSelection(() => {
      this.toolbarHelper.formatText({
        'a:bold': null,
        'a:italic': null,
        'a:underline': null,
        'a:strike': null,
        'a:code': null,
        'a:sub': null,
        'a:sup': null,
        'a:bg': null,
        'a:link': null,
        's:color': null,
        's:background': null,
        's:fontSize': null,
        's:fontFamily': null
      } as unknown as IInlineNodeAttrs)
      // if (this.activeFlavour !== 'paragraph') {
      //   this.toolbarHelper.transformBlocks('paragraph')
      // }
      this.toolbarHelper.updateBlockProps({
        heading: undefined,
        textAlign: undefined
      })
    })
  }

  protected onExtensionAction(action: IFixedToolbarExtensionAction) {
    this.extensionAction.emit({
      action,
      selection: this.selectionJSON,
      doc: this.doc
    })
  }

  private runWithSelection(run: () => void) {
    if (this.readonly || !this.allEditable) return
    this.restoreSelection()

    const selection = this.doc.selection.value
    if (!selection || selection.from.type !== 'text') return
    run()

    this.doc.selection.recalculate()
    const current = this.doc.selection.value
    this.syncToolbarState(current)
    this.cdr.markForCheck()
  }

  private restoreSelection() {
    if (!this.selectionJSON) return
    try {
      this.doc.selection.replay(this.selectionJSON)
    } catch {
    }
  }

  private canInsertBlock(flavour: BlockCraft.BlockFlavour, selection: BlockCraft.Selection | null = this.doc.selection.value) {
    return !!selection
  }

  private resolveInsertAnchor(flavour: BlockCraft.BlockFlavour, selection: BlockCraft.Selection) {
    let anchor: BlockCraft.BlockComponent | null = selection.lastBlock
    while (anchor?.parentBlock && !this.doc.schemas.isValidChildren(flavour, anchor.parentBlock.flavour)) {
      anchor = anchor.parentBlock
    }
    if (!anchor || !anchor.parentBlock || !this.doc.schemas.isValidChildren(flavour, anchor.parentBlock.flavour)) {
      return null
    }
    return anchor
  }

  private async insertTable(rows: number, cols: number, selection: BlockCraft.Selection) {
    const safeRows = Math.max(1, Math.min(12, Math.floor(rows) || 0))
    const safeCols = Math.max(1, Math.min(12, Math.floor(cols) || 0))
    const anchor = this.resolveInsertAnchor('table', selection)
    if (!anchor) return null

    const tableSnapshot = this.doc.schemas.createSnapshot('table', [safeRows, safeCols])
    await this.doc.crud.insertBlocksAfter(anchor, [tableSnapshot])

    const firstParagraphId = (tableSnapshot as any).children?.[0]?.children?.[0]?.children?.[0]?.id as string | undefined
    if (firstParagraphId) {
      this.doc.selection.setCursorAtBlock(firstParagraphId, true)
    } else {
      this.doc.selection.selectOrSetCursorAtBlock(tableSnapshot.id, true)
    }
    return tableSnapshot
  }

  private async insertColumns(count: number, selection: BlockCraft.Selection) {
    const safeCount = Math.max(2, Math.min(6, Math.floor(count) || 0))
    const anchor = this.resolveInsertAnchor('columns', selection)
    if (!anchor) return null

    const columnsSnapshot = this.doc.schemas.createSnapshot('columns', [safeCount])
    await this.doc.crud.insertBlocksAfter(anchor, [columnsSnapshot])

    const firstParagraphId = (columnsSnapshot as any).children?.[0]?.children?.[0]?.id as string | undefined
    if (firstParagraphId) {
      this.doc.selection.setCursorAtBlock(firstParagraphId, true)
    } else {
      this.doc.selection.selectOrSetCursorAtBlock(columnsSnapshot.id, true)
    }
    return columnsSnapshot
  }

  private syncToolbarState(selection: BlockCraft.Selection | null) {

    if (!selection) {
      this.activeAttrs = new Map<string, any>()
      this.activeColors = {}
      this.activeProps = {}
      this.activeFlavour = 'paragraph'
      this.allEditable = false
      this.selectionJSON = null
      this.isLinkAble = false
      this.hasTextSelection = false
      this.cdr.markForCheck()
      return
    }

    if (selection.isAllSelected || selection.from.type !== 'text' || !this.doc.isEditable(selection.from.block)
      || selection.from.block.plainTextOnly
    ) {
      this.activeAttrs = new Map<string, any>()
      this.activeColors = {}
      this.activeProps = {}
      this.activeFlavour = 'paragraph'
      this.allEditable = false
      this.selectionJSON = selection.toJSON()
      this.isLinkAble = false
      this.hasTextSelection = false
      this.cdr.markForCheck()
      return
    }

    const common = this.toolbarHelper.getCurrentCommonAttrs(selection)
    this.activeAttrs = new Map(common.attrs)
    this.activeColors = {...common.colors}
    this.activeProps = {...common.props}
    this.activeFlavour = common.flavour || 'paragraph'
    this.allEditable = !!common.allEditable
    this.selectionJSON = selection.toJSON()
    this.isLinkAble = selection.isInSameBlock && selection.from.type === 'text'
    this.hasTextSelection = selection.isInSameBlock
      && selection.from.type === 'text'
      && !selection.collapsed
      && selection.from.length > 0
    this.cdr.markForCheck()
  }

  private get toolbarHelper() {
    return this.utils || (this._toolbarHelper ||= new TextToolbarHelper(this.doc))
  }
}
