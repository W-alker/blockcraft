import {fromEvent, take, takeUntil} from "rxjs";
import {ComponentRef, ViewContainerRef} from "@angular/core";
import {TriggerBtn} from "./widgets/trigger-btn";
import {closetBlockId, DocPlugin, EventListen} from "../../framework";
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

const TABLE_MENU_NAMES = {
  equalWidth: "table-equal-width",
  rowHead: "table-row-head",
  colHead: "table-col-head",
} as const;

export class BlockControllerPlugin extends DocPlugin {
  override name = 'block-controller'
  override version = 1.0

  private _vcr!: ViewContainerRef
  private _cpr!: ComponentRef<TriggerBtn>

  private _activeBlock: BlockCraft.BlockComponent | null = null

  private isHidden = false

  private _timer?: number

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

    fromEvent<MouseEvent>(this.doc.root.hostElement, 'mouseover').pipe(takeUntil(this.doc.onDestroy$)).subscribe(e => {
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
        this._cpr.setInput('activeBlock', this._activeBlock = block)
        this.clearTimer()
      }, 0)
    })

    this.doc.selection.selectionChange$.pipe(takeUntil(this.doc.onDestroy$)).subscribe(v => {
      if (this.doc.isReadonly) return
      if (v?.to) {
        this._cpr.setInput('activeBlock', this._activeBlock = null)
        this._cpr.setInput('hidden', this.isHidden = true)
      } else {
        this.isHidden && this._cpr.setInput('hidden', this.isHidden = false)
      }
    })

    this.doc.subscribeReadonlyChange(v => {
      this._cpr.setInput('hidden', this.isHidden = v)
    })
    this.addDraggable()
  }

  // drag handle 拖拽响应
  addDraggable() {

    fromEvent<DragEvent>(this._cpr.location.nativeElement, 'dragstart').pipe(takeUntil(this.doc.onDestroy$))
      .subscribe(evt => {
        if (!this._activeBlock) return

        const hostElement = this._activeBlock.hostElement

        this._cpr.instance.menuDisabled = true
        this._cpr.instance.cdr.detectChanges()
        hostElement.style.opacity = '0.5'
        hostElement.style.pointerEvents = 'none'

        evt.dataTransfer?.setDragImage(this._activeBlock.hostElement, 0, 0);

        this.doc.dndService.startDrag(evt, [{dragDataType: 'origin-block', dragData: this._activeBlock.id}])

        fromEvent(this._cpr.location.nativeElement, 'dragend').pipe(take(1)).subscribe(() => {
          this._cpr.instance.menuDisabled = false
          hostElement.style.opacity = ''
          hostElement.style.pointerEvents = ''
        })
      })
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
    this._cpr.destroy()
  }

}

export * from "./types"
