import {fromEvent, Subscription, takeUntil} from "rxjs";
import {ComponentRef, ViewContainerRef} from "@angular/core";
import {TriggerBtn} from "./widgets/trigger-btn";
import {closetBlockId, DocPlugin, EventListen} from "../../framework";
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

const TABLE_MENU_NAMES = {
  equalWidth: "table-equal-width",
  rowHead: "table-row-head",
  colHead: "table-col-head",
  fix: 'table-fix',
} as const;

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
          if (!schema || schema.metadata.isLeaf || (block.nodeType === 'block' && !target.isContentEditable)) return

          this._timer = setTimeout(() => {
            if (!this.isBlockAlive(block)) {
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
          if (this._activeBlock && !this.isBlockAlive(this._activeBlock)) {
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
      return this.isBlockAlive(block) ? block : null
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

          this._cpr.instance.menuDisabled = true
          this._cpr.instance.cdr.detectChanges()

          const data = this.resolveDragData(activeBlock)
          this.doc.dragController.startDrag(evt, data)

          // Re-enable menu after drag ends (success or cancel)
          const sub = this.doc.dragController.state$
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
    const builtinSections = this.resolveTableMenu(ctx)
    const customSections = this.blockMenuResolver?.(ctx) || []
    return [...builtinSections, ...customSections]
  }

  private handleBlockMenuAction = (event: BlockMenuActionEvent, ctx: BlockMenuContext): boolean => {
    const customHandled = this.blockMenuActionHandler?.(event, ctx)
    if (customHandled) return true
    return this.handleTableMenuAction(event, ctx)
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
