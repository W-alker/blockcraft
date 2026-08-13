import {fromEvent, Subscription, takeUntil} from "rxjs";
import {ComponentRef, ViewContainerRef} from "@angular/core";
import {TriggerBtn} from "./widgets/trigger-btn";
import {
  BLOCK_OBJECT_LAYOUT_OPTIONS,
  BlockObjectLayout,
  closetBlockId,
  DocPlugin,
  EventListen,
} from "../../framework";
import {getSelectionCoveredBlockIds} from "../../framework/modules/selection/covered-blocks";
import {isSelectionAlive} from "../../framework/modules/selection/liveness";
import type {InternalDragData} from "../../framework/services/internal-drag.controller";
import {
  BlockControllerPluginOptions,
  BlockControllerPositionResolver,
  BlockMenuActionEvent,
  BlockMenuActionHandler,
  BlockMenuContext,
  BlockMenuResolver,
  BlockMenuSection,
  customToolHandler,
  IContextMenuItem
} from "./types";
import {fixTable} from "../../blocks/table-block/callback";
import {BlockAppearancePickerComponent} from "./widgets/block-appearance-picker";

const TABLE_MENU_NAMES = {
  equalWidth: "table-equal-width",
  rowHead: "table-row-head",
  colHead: "table-col-head",
  fix: 'table-fix',
} as const;

const PLACEMENT_MENU_NAMES = {
  inline: 'block-object-layout-inline',
  topBottom: 'block-object-layout-top-bottom',
  under: 'block-object-layout-under',
  over: 'block-object-layout-over',
} as const

const objectLayoutMenuName = (layout: BlockObjectLayout): string => ({
  inline: PLACEMENT_MENU_NAMES.inline,
  'top-bottom': PLACEMENT_MENU_NAMES.topBottom,
  under: PLACEMENT_MENU_NAMES.under,
  over: PLACEMENT_MENU_NAMES.over,
})[layout]

export class BlockControllerPlugin extends DocPlugin {
  override name = 'block-controller'
  override version = 1.0

  private _vcr!: ViewContainerRef
  private _cpr!: ComponentRef<TriggerBtn>

  private _activeBlock: BlockCraft.BlockComponent | null = null

  private isHidden = false

  private _timer?: number
  private _sub = new Subscription()

  public readonly customTools: IContextMenuItem[]
  private readonly customToolHandler?: customToolHandler
  private readonly blockMenuResolver?: BlockMenuResolver
  private readonly blockMenuActionHandler?: BlockMenuActionHandler
  private readonly positionResolver?: BlockControllerPositionResolver

  constructor(customTools?: IContextMenuItem[], customToolHandler?: customToolHandler)
  constructor(options?: BlockControllerPluginOptions)
  constructor(
    customToolsOrOptions: IContextMenuItem[] | BlockControllerPluginOptions = [],
    customToolHandler?: customToolHandler
  ) {
    super();
    if (Array.isArray(customToolsOrOptions)) {
      this.customTools = customToolsOrOptions
      this.customToolHandler = customToolHandler
      return
    }
    this.customTools = customToolsOrOptions.customTools || []
    this.customToolHandler = customToolsOrOptions.customToolHandler
    this.blockMenuResolver = customToolsOrOptions.blockMenuResolver
    this.blockMenuActionHandler = customToolsOrOptions.blockMenuActionHandler
    this.positionResolver = customToolsOrOptions.positionResolver
  }

  init() {
    this._vcr = this.doc.injector.get(ViewContainerRef)
    this._cpr = this._vcr.createComponent(TriggerBtn, {
      injector: this.doc.injector
    })
    this._cpr.setInput('doc', this.doc)
    this._cpr.setInput('customTools', this.customTools)
    this._cpr.setInput('customToolHandler', this.customToolHandler)
    this._cpr.setInput('blockMenuResolver', this.resolveBlockMenus)
    this._cpr.setInput('blockMenuActionHandler', this.handleBlockMenuAction)
    this._cpr.setInput('positionResolver', this.positionResolver)
    this.doc.root.hostElement.appendChild(this._cpr.location.nativeElement)

    this._sub.add(
      this._cpr.instance.closed
        .pipe(takeUntil(this.doc.onDestroy$))
        .subscribe(() => {
          this.clearTimer()
          // TriggerBtn closes itself from inside the component. Keep the
          // ComponentRef input cache in sync as well, otherwise Angular skips
          // the next setInput when the same block is hovered again.
          this.clearActiveBlock()
        })
    )

    this._sub.add(
      fromEvent<MouseEvent>(this.doc.root.hostElement, 'mouseover')
        .pipe(takeUntil(this.doc.onDestroy$))
        .subscribe(e => {
          if (this.doc.isReadonly || this.isHidden) return
          this.clearTimer()

          const target = e.target as HTMLElement
          if (target === this.doc.root.hostElement // 根元素不响应
            || target === this._activeBlock?.hostElement.parentElement // 防止因为margin导致的在父子块之间来回移动
            || this._cpr.location.nativeElement.contains(target)
          ) return

          const blockId = closetBlockId(target)
          if (!blockId || this._activeBlock?.id === blockId) return
          const block = this.doc.getBlockById(blockId)
          const schema = this.doc.schemas.get(block.flavour)
          const protectedBlock = this.isBlockProtected(block)
          const placementBlock = !!schema?.metadata.placement
          if (
            !schema ||
            !this.isControllerEligible(block) ||
            schema.metadata.isLeaf ||
            (
              block.nodeType === 'block' &&
              !target.isContentEditable &&
              !protectedBlock &&
              !placementBlock
            )
          ) return

          this._timer = setTimeout(() => {
            if (!this.isBlockAlive(block) || !this.isControllerEligible(block)) {
              this.clearTimer()
              return
            }
            this._cpr.setInput('activeBlock', this._activeBlock = block)
            this.clearTimer()
          }, 0)
        })
    )

    this._sub.add(
      this.doc.selection.selectionChange$
        .pipe(takeUntil(this.doc.onDestroy$))
        .subscribe(v => {
          if (this.doc.isReadonly) return
          if (
            this._activeBlock &&
            (
              !this.isBlockAlive(this._activeBlock) ||
              !this.isControllerEligible(this._activeBlock)
            )
          ) {
            this.clearActiveBlock()
          }
          // Cross-block selection: anchor the handle on the first selected block so the
          // user can drag the whole range immediately without re-hovering. Single-block
          // selections still rely on hover to pick the active block.
          const selectedBlock = v ? this.resolveSelectionActiveBlock(v) : null
          if (selectedBlock && this._activeBlock !== selectedBlock) {
            this._cpr.setInput('activeBlock', this._activeBlock = selectedBlock)
          }
          this.isHidden && this._cpr.setInput('hidden', this.isHidden = false)
        })
    )

    this._sub.add(
      this.doc.subscribeReadonlyChange(v => {
        this._cpr.setInput('hidden', this.isHidden = v)
      })
    )
    this.addDraggable()
  }

  private resolveSelectedRangeIds(selection: BlockCraft.Selection): string[] {
    if (!isSelectionAlive(selection as any, this.doc)) return []
    if (selection.isInSameBlock) return []
    const ids = getSelectionCoveredBlockIds(selection, this.doc)
    return ids.length >= 2 ? ids : []
  }

  private resolveSelectionActiveBlock(selection: BlockCraft.Selection): BlockCraft.BlockComponent | null {
    const ids = this.resolveSelectedRangeIds(selection)
    if (!ids.length) return null
    try {
      const block = this.doc.getBlockById(ids[0])
      return this.isBlockAlive(block) && this.isControllerEligible(block)
        ? block
        : null
    } catch {
      return null
    }
  }

  private isBlockAlive(block: BlockCraft.BlockComponent | null | undefined): block is BlockCraft.BlockComponent {
    if (!block) return false
    try {
      return this.doc.getBlockById(block.id) === block
    } catch {
      return false
    }
  }

  private isBlockProtected(block: BlockCraft.BlockComponent): boolean {
    const manager = this.doc.readonlyManager
    return manager
      ? manager.isReadonly(block) || manager.containsReadonly(block)
      : !!block.isReadonly
  }

  private isControllerEligible(block: BlockCraft.BlockComponent): boolean {
    const placement = this.doc.placement
    if (!placement) return true
    return !placement.isPlacementLayout?.(block) &&
      !placement.isInAbsoluteLayout?.(block) &&
      placement.getState?.(block)?.mode !== 'absolute'
  }

  private resolveDragData(activeBlock: BlockCraft.BlockComponent): InternalDragData {
    const sel = this.doc.selection.value
    if (!sel || !isSelectionAlive(sel as any, this.doc) || sel.isInSameBlock) {
      return { kind: 'origin-block', blockId: activeBlock.id }
    }
    if (sel.firstBlock.parentId !== sel.lastBlock.parentId) {
      return { kind: 'origin-block', blockId: activeBlock.id }
    }
    const ids = this.resolveSelectedRangeIds(sel)
    if (!ids.includes(activeBlock.id)) {
      return { kind: 'origin-block', blockId: activeBlock.id }
    }
    return { kind: 'origin-blocks', blockIds: ids }
  }

  // drag handle 拖拽响应
  addDraggable() {
    this._sub.add(
      fromEvent<PointerEvent>(this._cpr.location.nativeElement, 'pointerdown')
        .pipe(takeUntil(this.doc.onDestroy$))
        .subscribe(evt => {
          const activeBlock = this._activeBlock
          if (!activeBlock) return
          if (evt.button !== 0) return
          if (this.doc.isReadonly) return
          if (!this.isBlockAlive(activeBlock)) {
            this.clearActiveBlock()
            return
          }
          if (!this.isControllerEligible(activeBlock)) {
            this.clearActiveBlock()
            return
          }
          if (this.isBlockProtected(activeBlock)) return

          this._cpr.instance.menuDisabled = true
          this._cpr.instance.cdr.detectChanges()

          const dragState$ = this.doc.dragController.state$
          const started =
            (this.doc.dragController.startDrag(
              evt,
              this.resolveDragData(activeBlock),
            ), true)

          if (!started) {
            this._cpr.instance.menuDisabled = false
            this._cpr.instance.cdr.markForCheck()
            return
          }

          // Re-enable menu after drag ends (success or cancel)
          const sub = dragState$
            .pipe(takeUntil(this.doc.onDestroy$))
            .subscribe(state => {
              if (state === 'idle') {
                this._cpr.instance.menuDisabled = false
                sub.unsubscribe()
              }
            })
          this._sub.add(sub)
        })
    )
  }

  @EventListen('selectStart', {flavour: "root"})
  onSelectStart() {
    this._cpr.location.nativeElement.style.pointerEvents = 'none'
  }

  @EventListen('selectEnd', {flavour: "root"})
  onSelectEnd() {
    this._cpr.location.nativeElement.style.pointerEvents = 'auto'
  }

  clearTimer() {
    if (!this._timer) return
    clearTimeout(this._timer)
    this._timer = undefined
  }

  private clearActiveBlock() {
    this._activeBlock = null
    this._cpr.setInput('activeBlock', null)
  }

  private resolveBlockMenus = (ctx: BlockMenuContext): BlockMenuSection[] => {
    const builtinSections = [
      ...this.resolveAppearanceMenu(ctx),
      ...this.resolvePlacementMenu(ctx),
      ...this.resolveTableMenu(ctx),
    ]
    const customSections = this.blockMenuResolver?.(ctx) || []
    return [...builtinSections, ...customSections]
  }

  private handleBlockMenuAction = (event: BlockMenuActionEvent, ctx: BlockMenuContext): boolean => {
    if (this.handlePlacementMenuAction(event, ctx)) return true
    if (this.handleTableMenuAction(event, ctx)) return true
    const customHandled = this.blockMenuActionHandler?.(event, ctx)
    if (customHandled) return true
    return false
  }

  private resolvePlacementMenu(ctx: BlockMenuContext): BlockMenuSection[] {
    const block = ctx.activeBlock
    const current = this.doc.placement.getObjectLayout(block)
    const layoutItems = BLOCK_OBJECT_LAYOUT_OPTIONS
      .filter(option => this.doc.placement.supportsObjectLayout(block, option.value))
      .map(option => ({
        type: 'simple' as const,
        name: objectLayoutMenuName(option.value),
        icon: option.icon,
        label: option.label,
        value: option.value,
        active: current === option.value,
      }))
    if (!layoutItems.length) return []

    const items: BlockMenuSection['items'] = [{
      type: 'dropdown',
      name: 'block-object-layout',
      icon: layoutItems.find(item => item.active)?.icon ?? 'bc_fuwenben-shangxia',
      label: '文字环绕',
      items: layoutItems,
    }]
    return [{
      key: 'block-placement',
      title: '布局',
      items,
    }]
  }

  private handlePlacementMenuAction(event: BlockMenuActionEvent, ctx: BlockMenuContext): boolean {
    const layout = BLOCK_OBJECT_LAYOUT_OPTIONS.find(
      option => objectLayoutMenuName(option.value) === event.item.name,
    )?.value
    if (layout) {
      const handled = this.doc.placement.setObjectLayout(ctx.activeBlock, layout)
      if (
        handled &&
        this.doc.placement.isInAbsoluteLayout?.(ctx.activeBlock.id)
      ) {
        this.clearActiveBlock()
      }
      return handled
    }
    return false
  }

  private resolveAppearanceMenu(ctx: BlockMenuContext): BlockMenuSection[] {
    const block = ctx.activeBlock
    const selection = this.doc.selection.value
    const selectedIds = selection ? this.resolveSelectedRangeIds(selection) : []
    const selectionBlockIds = selectedIds.includes(block.id)
      ? selectedIds
      : [block.id]
    const multiSelection = selectionBlockIds.length > 1
    const targetBlockIds = selectionBlockIds.filter(blockId =>
      this.isAppearanceEligible(blockId, block)
      && (!multiSelection || !this.isAppearanceBlockProtected(blockId))
    )
    if (!targetBlockIds.length) return []
    const readonlyBehavior = multiSelection ? 'allow' as const : 'hide' as const

    return [{
      key: 'block-appearance',
      items: [{
        type: 'dropdown',
        name: 'block-appearance',
        icon: 'bc_sepan',
        label: '颜色',
        menuWidth: 240,
        readonlyBehavior,
        items: [{
          type: 'custom',
          name: 'block-appearance-colors',
          component: BlockAppearancePickerComponent,
          componentInputs: {block, doc: ctx.doc, targetBlockIds, selectionBlockIds},
          readonlyBehavior,
        }],
      }],
    }]
  }

  private isAppearanceEligible(
    blockId: string,
    activeBlock: BlockCraft.BlockComponent,
  ): boolean {
    try {
      const block = blockId === activeBlock.id
        ? activeBlock
        : this.doc.model?.exists?.(blockId)
          ? null
          : this.doc.getBlockById(blockId)
      const nodeType = block?.nodeType ?? this.doc.model?.getNodeType?.(blockId)
      const flavour = block?.flavour ?? this.doc.model?.getFlavour?.(blockId)
      if (nodeType !== 'editable' || !flavour) return false
      const schema = this.doc.schemas.get(flavour, false)
      return !schema?.metadata.isLeaf
        && !['placement-layout', 'render-unit', 'table-row'].includes(flavour)
    } catch {
      return false
    }
  }

  private isAppearanceBlockProtected(blockId: string): boolean {
    if (this.doc.isReadonly) return true
    const manager = this.doc.readonlyManager
    if (!manager) return true
    try {
      return manager.isReadonly(blockId) || manager.containsReadonly(blockId)
    } catch {
      return true
    }
  }

  private resolveTableMenu(ctx: BlockMenuContext): BlockMenuSection[] {
    const table = ctx.findClosestBlock('table') as BlockCraft.IBlockComponents['table'] | null
    if (!table) return []
    return [
      {
        key: 'table-tools',
        title: '表格',
        items: [
          {
            type: 'simple',
            icon: 'bc_xiufubiaoge',
            name: TABLE_MENU_NAMES.fix,
            label: '修复表格'
          },
          {
            type: 'simple',
            icon: "bc_liekuan",
            name: TABLE_MENU_NAMES.equalWidth,
            label: '均分列宽'
          },
          {
            type: 'switch',
            name: TABLE_MENU_NAMES.rowHead,
            icon: 'bc_biaotihang',
            label: '标题行',
            checked: !!table.props.rowHead
          },
          {
            type: 'switch',
            name: TABLE_MENU_NAMES.colHead,
            icon: 'bc_biaotilie',
            label: '标题列',
            checked: !!table.props.colHead
          }
        ]
      }
    ]
  }

  private handleTableMenuAction(event: BlockMenuActionEvent, ctx: BlockMenuContext) {
    const table = ctx.findClosestBlock('table') as BlockCraft.IBlockComponents['table'] | null
    if (!table) return false
    switch (event.item.name) {
      case TABLE_MENU_NAMES.fix:
        fixTable.call(table);
        return true
      case TABLE_MENU_NAMES.equalWidth:
        table.setEqualColumnWidths()
        return true
      case TABLE_MENU_NAMES.rowHead:
        table.toggleHeaderRow()
        return true
      case TABLE_MENU_NAMES.colHead:
        table.toggleHeaderColumn()
        return true
      default:
        return false
    }
  }

  destroy() {
    this.clearTimer()
    this._sub.unsubscribe()
    this._cpr.destroy()
  }

}

export * from "./types"
