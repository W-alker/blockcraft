import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component, ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  ViewChild,
} from "@angular/core";
import { NgTemplateOutlet } from "@angular/common";
import { Subscription, take } from "rxjs";
import { BcFloatToolbarComponent, BcFloatToolbarItemComponent, BcOverlayTriggerDirective } from "../../../components";
import {
  BlockLockError,
  BlockNodeType,
  IBlockSchemaOptions,
  IBlockSnapshot,
} from "../../../framework";
import {getSelectionCoveredBlockIds} from "../../../framework/modules/selection/covered-blocks";
import { IS_MAC, nextTick } from "../../../global";
import { BLOCK_CREATOR_SERVICE_TOKEN } from "../../../framework";
import {
  BlockMenuActionEvent,
  BlockMenuActionHandler,
  BlockControllerPositionResolver,
  BlockMenuContext,
  BlockMenuItem,
  BlockMenuResolver,
  BlockMenuSection,
  customToolHandler,
  IContextMenuItem
} from "../types";
import { parseInt } from "lib0/number";
import { NzTooltipDirective } from "ng-zorro-antd/tooltip";
import { BlockMenuComponent } from "./block-menu";

const ALIGN_LIST: IContextMenuItem[] = [
  {
    name: "align",
    icon: "bc_zuoduiqi",
    label: "左对齐",
    value: 'left',
    type: 'tool'
  },
  {
    name: "align",
    value: "center",
    icon: "bc_juzhongduiqi",
    label: "居中",
    type: 'tool'
  },
  {
    name: "align",
    value: "right",
    icon: "bc_youduiqi",
    label: "右对齐",
    type: 'tool'
  }
]

const NORMAL_PARAGRAPH_ITEM: IContextMenuItem = {
  name: "heading",
  value: null,
  icon: "bc_icon bc_wenben",
  label: "普通段落",
  type: 'tool',
  desc: `普通段落`,
}

const HEADING_LEVEL_LIST: IContextMenuItem[] = [
  {
    name: "heading",
    value: 1,
    icon: "bc_icon bc_biaoti_1",
    label: "一级标题",
    type: 'tool',
    desc: `一级标题(${IS_MAC ? '⌘' : 'Ctrl'} + 1)\nMarkdown: # (空格)`,
  },
  {
    name: "heading",
    value: 2,
    icon: "bc_icon bc_biaoti_2",
    label: "二级标题",
    type: 'tool',
    desc: `二级标题(${IS_MAC ? '⌘' : 'Ctrl'} + 2)\nMarkdown: ## (空格)`,
  },
  {
    name: "heading",
    value: 3,
    icon: "bc_icon bc_biaoti_3",
    label: "三级标题",
    type: 'tool',
    desc: `三级标题(${IS_MAC ? '⌘' : 'Ctrl'} + 3)\nMarkdown: ### (空格)`,
  },
  {
    name: "heading",
    value: 4,
    icon: "bc_icon bc_biaoti_4",
    label: "四级标题",
    type: 'tool',
    desc: `四级标题(${IS_MAC ? '⌘' : 'Ctrl'} + 4)\nMarkdown: #### (空格)`,
  }
]

// 普通段落 + H1–H4. The base-list heading toggle uses HEADING_LEVEL_LIST only:
// clicking an active heading reverts the block to a normal paragraph, so a
// dedicated 普通段落 button is redundant there. The void-block "在下方添加" menu
// still uses the full list, since 普通段落 is the only way to insert a plain
// paragraph (paragraph is filtered out of every block list).
const HEADING_LIST: IContextMenuItem[] = [NORMAL_PARAGRAPH_ITEM, ...HEADING_LEVEL_LIST]

const BUILTIN_TOOL_LIST: IContextMenuItem[] = [
  {
    type: 'tool',
    name: 'cut',
    value: true,
    icon: 'bc_jianqie',
    label: '剪切',
  },
  {
    type: 'tool',
    name: 'copy',
    icon: 'bc_fuzhi',
    value: true,
    label: '复制',
    readonlyBehavior: 'allow',
  },
  {
    type: 'tool',
    name: 'delete',
    icon: 'bc_shanchu-2',
    value: true,
    label: '删除'
  }
]

@Component({
  selector: 'bc-drag-handle',
  standalone: true,
  template: `
    <div class="drag-handle"
         #menuTrigger="bcOverlayTrigger"
         [bcOverlayTrigger]="contextMenuTpl" [positions]="['bottom-left', 'top-left']"
         [bcOverlayDisabled]="menuDisabled" (open)="setValidBlockList()" [delay]="500"
         [withBackdrop]="false" activeClass="active"
         style="touch-action: none;">
      <div class="btn">
        <ng-container *ngTemplateOutlet="icon; context: {$implicit: activeBlockIcon}"></ng-container>
        <i [class]="['bc_icon', isEmpty ? 'bc_tianjia-2' : 'bc_yidong' ]"></i>
      </div>
      <div class="virtual-hover-area" style="padding-left: 4px;"></div>
    </div>

    <ng-template #icon let-item>
      @if (item?.svgIcon) {
        <svg class="bc-block-svg-icon" aria-hidden="true">
          <use [attr.href]="'#' + item.svgIcon"
               [attr.xlink:href]="'#' + item.svgIcon"></use>
        </svg>
      } @else {
        <i [class]="item?.icon" style="color: var(--bc-active-color);"></i>
      }
    </ng-template>

    <ng-template #contextMenuTpl>
      <bc-float-toolbar style="display: block; width: 224px; padding-top: 4px;"
                        styles="max-height: 60vh; overflow-y: auto;"
                        direction="column">
        @if (!isMultiSelection && !activeBlockProtected && activeBlock?.nodeType === BlockNodeType.editable) {
          <h4 class="title">基础
            <i class="bc_icon bc_xinxi" style="cursor: pointer;"
               nz-tooltip="鼠标停留在内容块选项上一段时间以查看对应快捷键和快速转化语法"
               [nzTooltipPlacement]="'top'"></i>
          </h4>
          <ul class='base-list' (mousedown)="$event.preventDefault()">
            @for (item of HEADING_LEVEL_LIST; track item.value) {
              <li class="base-list__item" [title]="item.desc" (mousedown)="handleToolItemClick(item)"
                  [class.active]="(activeBlock?.props?.['heading'] || '') + '' === (item.value || '') + ''">
                <i [class]="item.icon"></i>
              </li>
            }

            @for (item of _validBaseBlockList; track item.flavour) {
              <li class="base-list__item"
                  (mousedown)="handleBlockItemClick(item)"
                  [title]="item.metadata.description || item.metadata.label"
                  [class.active]="activeBlock?.flavour === item.flavour">
                <ng-container *ngTemplateOutlet="icon; context: {$implicit: item.metadata}">
                </ng-container>
              </li>
            }
          </ul>
          <span class="bc-float-toolbar__divider"></span>
        }

        @if (isEmpty && !activeBlockProtected) {
          <ng-container *ngTemplateOutlet="moreBlocksTpl"></ng-container>
        } @else {
          <bc-block-menu [items]="primaryToolMenuItems"
                         [embedded]="true"
                         [menuDisabled]="menuDisabled"
                         (itemAction)="handleMenuAction($event)"></bc-block-menu>

          @if (!isMultiSelection && blockMenuSections.length) {
            <span class="bc-float-toolbar__divider"></span>
            @for (section of blockMenuSections; track section.key) {
              @if (section.title) {
                <h4 class="title">{{ section.title }}</h4>
              }
              <bc-block-menu [items]="section.items"
                             [embedded]="true"
                             [menuDisabled]="menuDisabled"
                             (itemAction)="handleMenuAction($event)"></bc-block-menu>
              @if (!$last) {
                <span class="bc-float-toolbar__divider"></span>
              }
            }
          }

          @if (!isMultiSelection && !activeBlockProtected) {
            <span class="bc-float-toolbar__divider"></span>

            <bc-float-toolbar-item class="append-more-btn" [expandable]="true" [bcOverlayTrigger]="blockAddList"
                                   [disabled]="menuDisabled"
                                   [bcOverlayDisabled]="menuDisabled"
                                   [positions]="['right-center']" [offsetX]="2">
              <i class="bc_icon bc_tianjia"></i>
              <span>在下方添加</span>
            </bc-float-toolbar-item>
          }
        }
      </bc-float-toolbar>
    </ng-template>

    <ng-template #blockAddList>
      <bc-float-toolbar direction="column" styles="width: 224px; max-height: 70vh; overflow-y: auto;">
        @if (activeBlock?.nodeType !== BlockNodeType.editable) {
          <h4 class="title">基础</h4>
          @for (item of HEADING_LIST; track item.value) {
            <bc-float-toolbar-item [title]="item.desc || item.label"
                                   (mousedown)="handleToolItemClick(item)">
              <ng-container *ngTemplateOutlet="icon; context: {$implicit: item}">
              </ng-container>
              <span>{{ item.label }}</span>
            </bc-float-toolbar-item>
          }
          <ng-container
            *ngTemplateOutlet="otherBlockListTpl; context: { $implicit: _validBaseBlockList }"></ng-container>
        }
        <ng-container *ngTemplateOutlet="moreBlocksTpl"></ng-container>
      </bc-float-toolbar>
    </ng-template>

    <ng-template #moreBlocksTpl>
      <h4 class="title">常用</h4>
      <ng-container *ngTemplateOutlet="otherBlockListTpl; context: { $implicit: _validOtherBlockList }"></ng-container>
      @if (_validEmbeddedBlockList.length) {
        <h4 class="title">内嵌网页</h4>
        <ng-container
          *ngTemplateOutlet="otherBlockListTpl; context: { $implicit: _validEmbeddedBlockList }"></ng-container>
      }
    </ng-template>

    <ng-template let-items #otherBlockListTpl>
      @for (item of items; track item.flavour) {
        <bc-float-toolbar-item [title]="item.metadata.description || item.metadata.label"
                               (mousedown)="handleBlockItemClick(item)">
          <ng-container *ngTemplateOutlet="icon; context: {$implicit: item.metadata}">
          </ng-container>
          <span>{{ item.metadata.label }}</span>
        </bc-float-toolbar-item>
      }
    </ng-template>
  `,
  styleUrls: ['./trigger-btn.scss'],
  imports: [NgTemplateOutlet, BcFloatToolbarComponent, BcFloatToolbarItemComponent, BcOverlayTriggerDirective, NzTooltipDirective, BlockMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.contenteditable]': 'false',
    '[style.display]': 'display',
  }
})
export class TriggerBtn {
  @Input() doc!: BlockCraft.Doc

  @ViewChild('menuTrigger', {read: BcOverlayTriggerDirective})
  private menuTrigger?: BcOverlayTriggerDirective

  @Input()
  set hidden(val: boolean) {
    this._hidden = val
    this.menuDisabled = val
    this.display = val || !this._activeBlock ? 'none' : 'block'
    this.cdr.markForCheck()
  }

  private _activeBlock: BlockCraft.BlockComponent | null = null
  private _hidden = false
  private _destroyed = false

  @Input()
  set activeBlock(val: BlockCraft.BlockComponent | null) {
    if (this._activeBlock === val) return

    this._activeBlock = val
    this._onDestroySub?.unsubscribe()
    this._readonlyStateSub.unsubscribe()
    this._readonlyStateSub = new Subscription()
    this.menuDisabled = true
    this.activeBlockIcon = undefined

    if (!this._activeBlock) {
      this.primaryToolMenuItems = []
      this.blockMenuSections = []
      this.display = 'none'
      this.menuDisabled = false
      this.cdr.markForCheck()
      return
    }

    this.menuDisabled = false

    const schema = this.doc.schemas.get(this._activeBlock.flavour)!
    if (schema.metadata.isLeaf) return
    const heading = this._activeBlock.props.heading
    this.activeBlockIcon = {
      svgIcon: heading ? undefined : schema.metadata.svgIcon,
      icon: heading ? HEADING_LIST.find(v => v.value === (typeof heading === 'string' ? parseInt(heading) : heading))?.icon : schema.metadata.icon
    }

    this.setIsEmpty()
    this.refreshMenuData()

    const parentBlock = this._activeBlock.parentBlock

    this._onDestroySub = this._activeBlock.onDestroy$.pipe(take(1)).subscribe(() => {
      this.close()
    })

    const readonlyStreams = this.doc as unknown as {
      onMetaUpdate$?: {subscribe(fn: (event: {transactions: Array<{changes: Map<string, unknown>}>}) => void): Subscription}
      model?: {structureChange$?: {subscribe(fn: () => void): Subscription}}
    }
    if (readonlyStreams.onMetaUpdate$) {
      this._readonlyStateSub.add(readonlyStreams.onMetaUpdate$.subscribe(event => {
        if (!event.transactions.some(transaction => transaction.changes.has('lock'))) return
        this.refreshMenuData()
        this.cdr.markForCheck()
      }))
    }
    if (readonlyStreams.model?.structureChange$) {
      this._readonlyStateSub.add(readonlyStreams.model.structureChange$.subscribe(() => {
        this.refreshMenuData()
        this.cdr.markForCheck()
      }))
    }

    const { top, left } = this.calcPos()
    const position = this.resolveHandlePosition({
      activeBlock: this._activeBlock,
      parentBlock,
      left,
      top
    })
    const host = this.host.nativeElement
    host.style.transform = ''
    host.style.left = `${position.x}px`
    host.style.top = `${position.y}px`
    this.display = this._hidden ? 'none' : 'block'
    this.cdr.markForCheck()
  }

  get activeBlock() {
    return this._activeBlock
  }

  @Input()
  customTools: IContextMenuItem[] = []

  @Input()
  customToolHandler?: customToolHandler

  @Input()
  blockMenuResolver?: BlockMenuResolver

  @Input()
  blockMenuActionHandler?: BlockMenuActionHandler

  @Input()
  positionResolver?: BlockControllerPositionResolver

  @Output()
  itemClicked = new EventEmitter<{ item: IBlockSchemaOptions, type: 'block' } | {
    type: 'tool',
    item: IContextMenuItem
  }>()

  @Output()
  closed = new EventEmitter<void>()

  constructor(
    public cdr: ChangeDetectorRef,
    private host: ElementRef<HTMLElement>,
  ) {
  }

  menuDisabled = false
  activeBlockIcon?: {
    icon?: string
    svgIcon?: string
    color?: string
  }

  ngOnInit() {
    this._destroyed = false
    this.toolList = this.toolList.concat(this.customTools)

    const schemas = this.doc.schemas.getSchemaList().filter(v => v.flavour !== 'paragraph')
    this.baseBlockList = schemas.filter(item => item.nodeType === BlockNodeType.editable && !item.metadata.isLeaf && !item.metadata.hideInInsertMenu)
    this.otherBlockList = schemas.filter(item =>
      (item.nodeType === BlockNodeType.void || item.nodeType === BlockNodeType.block) && !item.metadata.isLeaf && !item.metadata.hideInInsertMenu && !item.flavour.endsWith('-embed'))
    this.embeddedBlockList = schemas.filter(item => item.flavour.endsWith('-embed'))
  }

  ngOnDestroy() {
    this._destroyed = true
    this._readonlyStateSub.unsubscribe()
    this.close()
  }

  protected readonly BlockNodeType = BlockNodeType;
  protected readonly HEADING_LIST = HEADING_LIST;
  protected readonly HEADING_LEVEL_LIST = HEADING_LEVEL_LIST;
  protected baseBlockList: IBlockSchemaOptions[] = []
  protected otherBlockList: IBlockSchemaOptions[] = []
  protected embeddedBlockList: IBlockSchemaOptions[] = []

  protected toolList: IContextMenuItem[] = [...BUILTIN_TOOL_LIST]

  protected primaryToolMenuItems: BlockMenuItem[] = []
  protected blockMenuSections: BlockMenuSection[] = []

  protected display = 'none'
  protected isEmpty = false
  private _isMultiSelection = false
  private _onDestroySub?: Subscription
  private _readonlyStateSub = new Subscription()

  protected _validBaseBlockList: IBlockSchemaOptions[] = []
  protected _validOtherBlockList: IBlockSchemaOptions[] = []
  protected _validEmbeddedBlockList: IBlockSchemaOptions[] = []

  private calcPos() {
    const rootRect = this.doc.root.hostElement.getBoundingClientRect()
    const wrapRect = this.activeBlock!.hostElement.getBoundingClientRect()

    const left = wrapRect.left - rootRect.left

    if (this.doc.isEditable(this.activeBlock!) && this.activeBlock.containerElement === this.activeBlock.hostElement) {
      const container = this.activeBlock.containerElement
      const rect = container.getBoundingClientRect()
      return {
        top: rect.top - rootRect.top
          + this.doc.root.hostElement.scrollTop,
        left,
      }
    }

    return {
      top: wrapRect.top - rootRect.top + this.doc.root.hostElement.scrollTop,
      left
    }
  }

  private resolveHandlePosition(ctx: {
    activeBlock: BlockCraft.BlockComponent
    parentBlock: BlockCraft.BlockComponent | null
    left: number
    top: number
  }) {
    if (this.positionResolver) {
      return this.positionResolver(ctx)
    }
    if(ctx.activeBlock.flavour === 'table') {
      return {
        x: ctx.left - 44 - 18,
        y: ctx.top - 12
      }
    }
    const marginLeft = ctx.parentBlock && ['table-cell', 'column'].includes(ctx.parentBlock.flavour) ? 18 : 8
    return {
      x: ctx.left - 44 - marginLeft,
      y: ctx.top - 4
    }
  }

  @HostListener('click', ['$event'])
  onClick(event: MouseEvent) {
    event.stopPropagation()
  }

  @HostListener('mousedown', ['$event'])
  onMouse(event: MouseEvent) {
    event.stopPropagation()
  }

  @HostListener('mouseenter', ['$event'])
  onMouseEnter(e: Event) {
    e.stopPropagation()
    this.setIsEmpty()
    this.refreshMenuData()
    this.cdr.markForCheck()
  }

  setIsEmpty() {
    if (!this._activeBlock) {
      this.isEmpty = false
      return
    }
    // @ts-expect-error paragraph block has textLength
    this.isEmpty = this._activeBlock.flavour === 'paragraph' ? !this._activeBlock.textLength && !this.activeBlock?.props.heading : false
  }

  setValidBlockList() {
    if (!this.activeBlock?.parentBlock) return
    if (!this.isBlockAlive(this.activeBlock)) {
      this.close()
      return
    }
    const parentId = this.activeBlock.parentBlock.id
    this._validOtherBlockList = this.otherBlockList.filter(item => this.doc.canInsertChild(parentId, item.flavour))
    this._validBaseBlockList = this.baseBlockList.filter(item => this.doc.canInsertChild(parentId, item.flavour))
    this._validEmbeddedBlockList = this.embeddedBlockList.filter(item => this.doc.canInsertChild(parentId, item.flavour))
    this.refreshMenuData()
  }

  protected get isMultiSelection() {
    return this._isMultiSelection
  }

  private computeIsMultiSelection(): boolean {
    const sel = this.doc.selection.value
    if (!sel || sel.isInSameBlock || !this._activeBlock) return false
    try {
      const ids = this.getSelectedBlockIds(sel)
      return ids.length >= 2 && ids.includes(this._activeBlock.id)
    } catch {
      return false
    }
  }

  private getSelectedBlockIds(sel = this.doc.selection.value): string[] {
    if (!sel) return []
    return getSelectionCoveredBlockIds(sel, this.doc)
  }

  // Resolve the selected block ids for a multi-block menu action. Returns null
  // when the selection is no longer a valid (>=2 block) range — e.g. a concurrent
  // remote edit collapsed it or deleted one of the blocks — so the caller falls
  // back to the single-block path on activeBlock.
  private resolveMultiActionIds(): string[] | null {
    try {
      const ids = this.getSelectedBlockIds()
      if (ids.length < 2) return null
      if (typeof (this.doc as any).model?.exists === 'function') {
        if (ids.some(id => !this.doc.model.exists(id))) return null
      } else {
        ids.forEach(id => this.doc.getBlockById(id))
      }
      return ids
    } catch {
      return null
    }
  }

  private resolveMultiActionSnapshots(ids: readonly string[]): IBlockSnapshot[] | null {
    const snapshots: IBlockSnapshot[] = []
    for (const id of ids) {
      const snapshot = this.doc.model.toSnapshot(id)
      if (!snapshot) return null
      snapshots.push(snapshot)
    }
    return snapshots
  }

  close() {
    this.menuTrigger?.closePanel()
    this.display = 'none'
    this.activeBlock = null
    this.closed.emit()
    this.cdr.markForCheck()
  }

  private isBlockAlive(block: BlockCraft.BlockComponent | null | undefined): block is BlockCraft.BlockComponent {
    if (!block) return false
    const model = this.doc.model as {exists?: (blockId: string) => boolean} | undefined
    if (model?.exists && !model.exists(block.id)) return false
    try {
      const liveBlock = this.doc.getBlockById(block.id)
      if (model?.exists && !model.exists(block.id)) return false
      return liveBlock === block
    } catch {
      return false
    }
  }

  private restoreMenuEnabledOnNextTick() {
    void nextTick().then(() => {
      if (this._destroyed) return
      this.menuDisabled = false
      this.cdr.markForCheck()
    })
  }

  private refreshMenuDataOnNextTick() {
    void nextTick().then(() => {
      if (this._destroyed) return
      this.refreshMenuData()
      this.cdr.markForCheck()
    })
  }

  private refreshMenuData() {
    if (this._activeBlock && !this.isBlockAlive(this._activeBlock)) {
      this.close()
      return
    }
    this._isMultiSelection = this.computeIsMultiSelection()
    this.primaryToolMenuItems = this.buildPrimaryToolMenuItems()
    this.blockMenuSections = this.resolveBlockMenuSections()
  }

  protected get activeBlockReadonly() {
    return this.getActiveReadonlyResolution().readonly
  }

  protected get activeBlockProtected() {
    const block = this.activeBlock
    if (!block || !this.isBlockAlive(block)) return false
    const manager = this.doc.readonlyManager
    return this.getActiveReadonlyResolution().readonly
      || !!manager?.containsReadonly(block)
  }

  private getActiveReadonlyResolution() {
    const block = this.activeBlock
    if (!block || !this.isBlockAlive(block)) {
      return {readonly: false, source: null, lockUserId: null, lockKind: null}
    }
    const lockUserId = typeof block.meta?.lock === 'string' ? block.meta.lock : null
    return this.doc.readonlyManager?.resolve(block) ?? {
      readonly: !!block.isReadonly,
      source: block.readonlySource ?? null,
      lockUserId,
      lockKind: lockUserId
        ? block.meta?.lockKind === 'template' ? 'template' : 'user'
        : null,
    }
  }

  private buildReadonlySwitchItem(): BlockMenuItem {
    const block = this.activeBlock!
    const manager = this.doc.readonlyManager
    const resolution = this.getActiveReadonlyResolution()
    const explicit = manager?.isExplicitReadonly(block) ?? !!block.isExplicitReadonly
    const inheritedOnly = resolution.readonly && !explicit
    const canToggle = explicit
      ? !!manager?.canUnlock(block)
      : !!manager?.canLock(block)
    const hasCurrentUser = this.hasCurrentUserId()
    const desc = inheritedOnly
      ? '由上级内容块锁定'
      : canToggle
        ? undefined
        : hasCurrentUser && explicit
          ? resolution.lockKind === 'template'
            ? '模板内容已锁定'
            : '由其他用户锁定'
          : '未识别当前用户'
    return {
      type: 'switch',
      name: 'block-readonly',
      label: '锁定内容块',
      icon: 'bc_quanxian',
      checked: resolution.readonly,
      disabled: inheritedOnly || !canToggle,
      desc,
      readonlyBehavior: 'allow',
    }
  }

  private hasCurrentUserId(): boolean {
    return !!this.doc.readonlyManager?.currentUserId
  }

  private buildLegacyToolItem(item: IContextMenuItem): BlockMenuItem {
    return {
      type: 'simple',
      name: item.name,
      label: item.label,
      icon: item.icon,
      svgIcon: item.svgIcon,
      desc: item.desc,
      value: item.value,
      readonlyBehavior: item.readonlyBehavior,
      data: {legacyTool: item},
    }
  }

  private isMultiSelectionProtected(): boolean {
    if (!this._isMultiSelection) return false
    try {
      return this.getSelectedBlockIds().some(blockId =>
        this.doc.readonlyManager?.isReadonly(blockId)
        || this.doc.readonlyManager?.containsReadonly(blockId)
      )
    } catch {
      return true
    }
  }

  private buildPrimaryToolMenuItems() {
    if (!this.activeBlock) return []

    if (this._isMultiSelection) {
      // 多块模式：仅剪切/复制/删除，无 align 下拉、无 customTools
      const tools = this.isMultiSelectionProtected()
        ? BUILTIN_TOOL_LIST.filter(item => item.name === 'copy')
        : BUILTIN_TOOL_LIST
      return tools.map(item => this.buildLegacyToolItem(item))
    }

    if (this.activeBlockProtected) {
      const copy = BUILTIN_TOOL_LIST.find(item => item.name === 'copy')!
      const readonlyAllowedCustomTools = this.toolList.filter(item =>
        !BUILTIN_TOOL_LIST.includes(item) && item.readonlyBehavior === 'allow'
      )
      return [
        this.buildLegacyToolItem(copy),
        this.buildReadonlySwitchItem(),
        ...readonlyAllowedCustomTools.map(item => this.buildLegacyToolItem(item)),
      ]
    }

    const items: BlockMenuItem[] = []
    if (this.activeBlock.nodeType === BlockNodeType.editable) {
      items.push({
        type: 'dropdown',
        name: 'align-menu',
        icon: 'bc_zuoduiqi',
        label: '对齐方式',
        items: ALIGN_LIST.map(item => ({
          type: 'simple',
          name: item.name,
          label: item.label,
          icon: item.icon,
          value: item.value,
          active: (this.activeBlock?.props as any)['textAlign'] === item.value,
          data: { legacyTool: item }
        }))
      })
      items.push({
        type: 'divider',
        name: 'tool-align-divider'
      })
    }

    this.toolList.forEach(item => {
      items.push(this.buildLegacyToolItem(item))
    })

    items.push(this.buildReadonlySwitchItem())

    return items
  }

  private resolveBlockMenuSections() {
    const ctx = this.createMenuContext()
    if (!ctx || !this.blockMenuResolver) return []
    return (this.blockMenuResolver(ctx) || [])
      .map(section => ({
        ...section,
        items: section.items
          .map(item => this.applyReadonlyBehavior(item, ctx.readonly.readonly || this.activeBlockProtected))
          .filter(item => !item.hidden)
      }))
      .filter(section => section.items.length > 0)
  }

  private createMenuContext(): BlockMenuContext | null {
    const block = this.activeBlock
    if (!block) return null
    if (!this.isBlockAlive(block)) {
      this.close()
      return null
    }
    return {
      activeBlock: block,
      doc: this.doc,
      readonly: this.getActiveReadonlyResolution(),
      findClosestBlock: (flavour) => this.findClosestBlock(block, flavour)
    }
  }

  private applyReadonlyBehavior(item: BlockMenuItem, readonly: boolean): BlockMenuItem {
    if (!readonly) return item
    const behavior = item.readonlyBehavior ?? 'disable'
    if (behavior === 'hide') return {...item, hidden: true}
    if (item.type === 'divider') {
      return behavior === 'allow' ? item : {...item, hidden: true}
    }
    if (behavior === 'disable') return {...item, disabled: true}
    if (item.type === 'dropdown') {
      return {
        ...item,
        items: item.items
          .map(child => this.applyReadonlyBehavior(child, true))
          .filter(child => !child.hidden),
      }
    }
    return item
  }

  private findClosestBlock(start: BlockCraft.BlockComponent | null, flavour: BlockCraft.BlockFlavour | string) {
    let current = start
    while (current) {
      if (current.flavour === flavour) return current
      current = current.parentBlock
    }
    return null
  }

  handleMenuAction(event: BlockMenuActionEvent) {
    if (event.item.name === 'block-readonly') {
      const block = this.activeBlock
      if (!this.isBlockAlive(block)) return
      const explicit = this.doc.readonlyManager.isExplicitReadonly(block)
      const resolution = this.doc.readonlyManager.resolve(block)
      if (resolution.readonly && !explicit) return
      try {
        this.doc.setBlockReadonly(block, !explicit)
      } catch (error) {
        if (!(error instanceof BlockLockError)) throw error
        this.doc.messageService.warn(this.getBlockLockErrorMessage(error))
      }
      this.refreshMenuDataOnNextTick()
      return
    }

    if (this.activeBlockProtected && event.item.readonlyBehavior !== 'allow') return
    const legacyTool = this.getLegacyTool(event.item)
    if (legacyTool) {
      this.handleToolItemClick(legacyTool)
      this.refreshMenuDataOnNextTick()
      return
    }

    const ctx = this.createMenuContext()
    if (!ctx || !this.blockMenuActionHandler) return
    const handled = this.blockMenuActionHandler(event, ctx)
    if (!handled) return
    this.refreshMenuDataOnNextTick()
  }

  private getBlockLockErrorMessage(error: BlockLockError): string {
    switch (error.reason) {
      case 'missing-user':
        return '未识别当前用户，无法操作锁'
      case 'inherited':
        return '请在上级内容块解除锁定'
      case 'root':
        return '根内容块不能锁定'
      case 'owned-by-other':
        return '无法覆盖其他用户的锁'
      case 'unauthorized':
        return '无权解除其他用户的锁'
    }
  }

  private getLegacyTool(item: BlockMenuItem): IContextMenuItem | null {
    if (!("data" in item) || !item.data || typeof item.data !== 'object') return null
    const data = item.data as { legacyTool?: IContextMenuItem }
    return data.legacyTool || null
  }

  handleBlockItemClick(item: IBlockSchemaOptions) {
    if (!this.activeBlock) return
    if (this.activeBlockProtected) return

    const insertAfter = () => {
      const blockCreator = this.doc.injector.get(BLOCK_CREATOR_SERVICE_TOKEN)
      const targetBlock = this.activeBlock
      blockCreator.getParamsByScheme(item).then(params => {
        if (this._destroyed || !this.isBlockAlive(targetBlock) || !params) return
        const newBlock = this.doc.schemas.createSnapshot(item.flavour, params as any)
        void this.doc.chain()
          .insertAfterSnapshots(targetBlock, [newBlock])
          .setCursorAtBlock(newBlock.id, true)
          .run()
      })
    }

    const replace = (flavour: BlockCraft.BlockFlavour) => {
      const block = this.activeBlock
      if (!this.isBlockAlive(block) || !this.doc.isEditable(block) || block.flavour === flavour) return
      const newBlock = this.doc.schemas.createSnapshot(flavour, [block.textDeltas(), {
        ...block.props,
        heading: undefined
      }])
      void this.doc.chain()
        .replaceWithSnapshots(block.id, [newBlock])
        .nextTick()
        .setCursorAtBlock(newBlock.id, true)
        .run()
    }

    if (this.isEmpty) {
      if (item.nodeType !== BlockNodeType.editable) {
        insertAfter()
      } else {
        replace(item.flavour)
      }

      this.menuDisabled = true
      this.restoreMenuEnabledOnNextTick()
      return;
    }

    if (!this.isBlockAlive(this.activeBlock)) {
      this.close()
      return
    }

    if (this.doc.isEditable(this.activeBlock) && item.nodeType === BlockNodeType.editable) {
      replace(this.activeBlock.flavour === item.flavour ? 'paragraph' : item.flavour)
    } else {
      insertAfter()
    }

    this.menuDisabled = true

    this.restoreMenuEnabledOnNextTick()
  }

  handleToolItemClick(item: IContextMenuItem) {
    const activeBlock = this.activeBlock
    if (!this.isBlockAlive(activeBlock)) {
      this.close()
      return
    }

    if (this.activeBlockProtected && item.name !== 'copy' && item.readonlyBehavior !== 'allow') return

    if (this.customToolHandler) {
      const res = this.customToolHandler(item, activeBlock, this.doc)
      if (res) {
        this.close()
        return;
      }
    }

    switch (item.name) {
      case 'align':
        if (!this.isBlockAlive(this.activeBlock) || !this.doc.isEditable(this.activeBlock)) return
        this.activeBlock.updateProps({ textAlign: item.value as any })
        break
      case 'cut': {
        if (this._isMultiSelection) {
          const ids = this.resolveMultiActionIds()
          if (ids) {
            const snapshots = this.resolveMultiActionSnapshots(ids)
            if (!snapshots) {
              this.close()
              return
            }
            this.doc.clipboard.copyBlocksModel(snapshots)
              .then(() => {
                void this.doc.chain()
                  .transact(() => ids.forEach(id => this.doc.crud.deleteBlockById(id)))
                  .animationFrame()
                  .recalculateSelection()
                  .tap(() => {
                    this.doc.messageService.success('已剪切')
                    this.close()
                  })
                  .run()
              })
              .catch(err => {
                this.doc.logger.warn('block-controller multi cut failed', err)
                this.close()
              })
            return
          }
          // multi-selection collapsed → fall through to single-block cut
        }
        const block = this.activeBlock
        if (!this.isBlockAlive(block)) return;
        this.doc.clipboard.copyBlocksModel([block.toSnapshot()]).then(() => {
          if (this._destroyed) return
          if (this.isBlockAlive(block)) {
            void this.doc.chain()
              .deleteById(block.id)
              .animationFrame()
              .recalculateSelection()
              .tap(() => {
                this.doc.messageService.success('已剪切')
              })
              .run()
          }
          this.close()
        })
      }
        break
      case 'delete':
        if (this._isMultiSelection) {
          const ids = this.resolveMultiActionIds()
          if (ids) {
            void this.doc.chain()
              .transact(() => ids.forEach(id => this.doc.crud.deleteBlockById(id)))
              .animationFrame()
              .recalculateSelection()
              .tap(() => this.close())
              .run()
            return
          }
          // multi-selection collapsed → fall through to single-block delete
        }
        const block = this.activeBlock
        if (this.isBlockAlive(block)) {
          void this.doc.chain()
            .deleteById(block.id)
            .animationFrame()
            .recalculateSelection()
            .run()
        }
        break
      case 'copy': {
        if (this._isMultiSelection) {
          const ids = this.resolveMultiActionIds()
          if (ids) {
            const snapshots = this.resolveMultiActionSnapshots(ids)
            if (!snapshots) {
              this.close()
              return
            }
            this.doc.clipboard.copyBlocksModel(snapshots)
              .then(() => {
                this.doc.messageService.success('已复制')
                this.close()
              })
              .catch(err => {
                this.doc.logger.warn('block-controller multi copy failed', err)
                this.close()
              })
            return
          }
          // multi-selection collapsed → fall through to single-block copy
        }
        const block = this.activeBlock
        if (!this.isBlockAlive(block)) return;
        this.doc.clipboard.copyBlocksModel([block.toSnapshot()]).then(() => {
          if (this._destroyed) return
          this.doc.messageService.success('已复制')
          this.close()
        })
      }
        break
      case 'heading': {
        const block = this.activeBlock
        if (!this.isBlockAlive(block)) return
        if (!this.doc.isEditable(block)) {
          const p = this.doc.schemas.createSnapshot('paragraph', [[], {
            depth: block.props.depth,
            heading: item.value
          }])
          void this.doc.chain()
            .insertAfterSnapshots(block, [p])
            .tap(() => {
              this.menuDisabled = true
            })
            .selectOrSetCursorAtBlock(p.id, true)
            .run()
          return;
        }
        // Clicking the already-active heading toggles the block back to a normal
        // paragraph. Mirrors the template's `active` highlight condition: only
        // H1–H4 toggle off (item.value truthy); the explicit "普通段落" entry
        // (item.value === null) always reverts.
        const isActiveHeading = !!item.value
          && (block.props.heading || '') + '' === (item.value || '') + ''
        const targetHeading = isActiveHeading ? null : item.value
        if (block.flavour === 'ordered' && item.value) {
          block.updateProps({ heading: targetHeading as any })
          return;
        }
        if (block.flavour !== 'paragraph') {
          const p = this.doc.schemas.createSnapshot('paragraph', [block.textDeltas(), {
            ...block.props,
            heading: targetHeading
          }])
          void this.doc.chain()
            .replaceWithSnapshots(block.id, [p])
            .selectOrSetCursorAtBlock(p.id, true)
            .run()
        } else {
          block.updateProps({ heading: targetHeading as any })
        }
        break
      }
    }
  }

}
