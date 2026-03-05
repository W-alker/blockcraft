import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component, ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
} from "@angular/core";
import { NgIf, NgTemplateOutlet } from "@angular/common";
import { Subscription, take } from "rxjs";
import { BcFloatToolbarComponent, BcFloatToolbarItemComponent, BcOverlayTriggerDirective } from "../../../components";
import { BlockNodeType } from "../../../framework";
import { IBlockSchemaOptions } from "../../../framework";
import { MatIcon } from "@angular/material/icon";
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

const HEADING_LIST: IContextMenuItem[] = [
  {
    name: "heading",
    value: null,
    icon: "bc_icon bc_wenben",
    label: "普通段落",
    type: 'tool',
    desc: `普通段落`,
  },
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

@Component({
  selector: 'bc-drag-handle',
  standalone: true,
  template: `
    <div class="drag-handle"
         [bcOverlayTrigger]="contextMenuTpl" [positions]="['bottom-left', 'top-left']"
         [bcOverlayDisabled]="menuDisabled" (open)="setValidBlockList()" [delay]="500"
         [withBackdrop]="false" activeClass="active" draggable="true">
      <div class="btn">
        <ng-container *ngTemplateOutlet="icon; context: {$implicit: activeBlockIcon}"></ng-container>
        <i [class]="['bc_icon', isEmpty ? 'bc_tianjia-2' : 'bc_yidong' ]"></i>
      </div>
      <div class="virtual-hover-area" style="padding-left: 4px;"></div>
    </div>

    <ng-template #icon let-item>
      @if (item?.svgIcon) {
        <mat-icon [svgIcon]="item.svgIcon" style="width: 1em; height: 1em"></mat-icon>
      } @else {
        <i [class]="item?.icon" style="color: var(--bc-active-color);"></i>
      }
    </ng-template>

    <ng-template #contextMenuTpl>
      <bc-float-toolbar style="display: block; width: 224px; padding-top: 4px;" direction="column">
        @if (activeBlock?.nodeType === BlockNodeType.editable) {
          <h4 class="title">基础
            <i class="bc_icon bc_xinxi" style="cursor: pointer;"
               nz-tooltip="鼠标停留在内容块选项上一段时间以查看对应快捷键和快速转化语法"
               [nzTooltipPlacement]="'top'"></i>
          </h4>
          <ul class='base-list' (mousedown)="$event.preventDefault()">
            @for (item of HEADING_LIST; track item.value) {
              <li class="base-list__item" [title]="item.desc" (mousedown)="handleToolItemClick(item)"
                  [class.active]="!item.value ? (activeBlock?.flavour === 'paragraph' && !activeBlock?.props?.['heading']) : (activeBlock?.props?.['heading'] || '') + '' === (item.value || '') + ''">
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

        @if (isEmpty) {
          <ng-container *ngTemplateOutlet="moreBlocksTpl"></ng-container>
        } @else {
          <bc-block-menu [items]="primaryToolMenuItems"
                         [embedded]="true"
                         [menuDisabled]="menuDisabled"
                         (itemAction)="handleMenuAction($event)"></bc-block-menu>

          @if (blockMenuSections.length) {
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

          <span class="bc-float-toolbar__divider"></span>

          <bc-float-toolbar-item class="append-more-btn" [expandable]="true" [bcOverlayTrigger]="blockAddList"
                                 [disabled]="menuDisabled"
                                 [bcOverlayDisabled]="menuDisabled"
                                 [positions]="['right-center']" [offsetX]="2">
            <i class="bc_icon bc_tianjia"></i>
            <span>在下方添加</span>
          </bc-float-toolbar-item>
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
  imports: [NgIf, NgTemplateOutlet, BcFloatToolbarComponent, BcFloatToolbarItemComponent, MatIcon, BcOverlayTriggerDirective, NzTooltipDirective, BlockMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.contenteditable]': 'false',
    '[style.display]': 'display',
  }
})
export class TriggerBtn {
  @Input() doc!: BlockCraft.Doc

  @Input()
  set hidden(val: boolean) {
    this.menuDisabled = val
    this.display = val ? 'none' : 'block'
    this.cdr.markForCheck()
  }

  private _activeBlock: BlockCraft.BlockComponent | null = null
  @Input()
  set activeBlock(val: BlockCraft.BlockComponent | null) {
    if (this._activeBlock === val) return

    this._activeBlock = val
    this._onDestroySub?.unsubscribe()
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

    const { top, left } = this.calcPos()
    const position = this.resolveHandlePosition({
      activeBlock: this._activeBlock,
      parentBlock,
      left,
      top
    })
    this.display = 'block'
    this.host.nativeElement.style.transform = `
      translate(${position.x}px, ${position.y}px)
    `
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
    this.toolList = this.toolList.concat(this.customTools)

    const schemas = this.doc.schemas.getSchemaList().filter(v => v.flavour !== 'paragraph')
    this.baseBlockList = schemas.filter(item => item.nodeType === BlockNodeType.editable && !item.metadata.isLeaf)
    this.otherBlockList = schemas.filter(item =>
      (item.nodeType === BlockNodeType.void || item.nodeType === BlockNodeType.block) && !item.metadata.isLeaf && !item.flavour.endsWith('-embed'))
    this.embeddedBlockList = schemas.filter(item => item.flavour.endsWith('-embed'))
  }

  ngOnDestroy() {
    this.close()
  }

  protected readonly BlockNodeType = BlockNodeType;
  protected readonly HEADING_LIST = HEADING_LIST;
  protected baseBlockList: IBlockSchemaOptions[] = []
  protected otherBlockList: IBlockSchemaOptions[] = []
  protected embeddedBlockList: IBlockSchemaOptions[] = []

  protected toolList: IContextMenuItem[] = [
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
    },
    {
      type: 'tool',
      name: 'delete',
      icon: 'bc_shanchu-2',
      value: true,
      label: '删除'
    }
  ]

  protected primaryToolMenuItems: BlockMenuItem[] = []
  protected blockMenuSections: BlockMenuSection[] = []

  protected display = 'none'
  protected isEmpty = false
  private _onDestroySub?: Subscription

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
    const parentBlockSchema = this.doc.schemas.get(this.activeBlock.parentBlock.flavour)!
    this._validOtherBlockList = this.otherBlockList.filter(item => this.doc.schemas.isValidChildren(item.flavour, parentBlockSchema))
    this._validBaseBlockList = this.baseBlockList.filter(item => this.doc.schemas.isValidChildren(item.flavour, parentBlockSchema))
    this._validEmbeddedBlockList = this.embeddedBlockList.filter(item => this.doc.schemas.isValidChildren(item.flavour, parentBlockSchema))
    this.refreshMenuData()
  }

  close() {
    this.display = 'none'
    this.activeBlock = null
    this.cdr.markForCheck()
  }

  private refreshMenuData() {
    this.primaryToolMenuItems = this.buildPrimaryToolMenuItems()
    this.blockMenuSections = this.resolveBlockMenuSections()
  }

  private buildPrimaryToolMenuItems() {
    if (!this.activeBlock || this.isEmpty) return []

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
      items.push({
        type: 'simple',
        name: item.name,
        label: item.label,
        icon: item.icon,
        desc: item.desc,
        value: item.value,
        data: { legacyTool: item }
      })
    })

    return items
  }

  private resolveBlockMenuSections() {
    const ctx = this.createMenuContext()
    if (!ctx || !this.blockMenuResolver) return []
    return (this.blockMenuResolver(ctx) || [])
      .map(section => ({
        ...section,
        items: section.items.filter(item => !item.hidden)
      }))
      .filter(section => section.items.length > 0)
  }

  private createMenuContext(): BlockMenuContext | null {
    const block = this.activeBlock
    if (!block) return null
    return {
      activeBlock: block,
      doc: this.doc,
      findClosestBlock: (flavour) => this.findClosestBlock(block, flavour)
    }
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
    const legacyTool = this.getLegacyTool(event.item)
    if (legacyTool) {
      this.handleToolItemClick(legacyTool)
      nextTick().then(() => {
        this.refreshMenuData()
        this.cdr.markForCheck()
      })
      return
    }

    const ctx = this.createMenuContext()
    if (!ctx || !this.blockMenuActionHandler) return
    const handled = this.blockMenuActionHandler(event, ctx)
    if (!handled) return
    nextTick().then(() => {
      this.refreshMenuData()
      this.cdr.markForCheck()
    })
  }

  private getLegacyTool(item: BlockMenuItem): IContextMenuItem | null {
    if (!("data" in item) || !item.data || typeof item.data !== 'object') return null
    const data = item.data as { legacyTool?: IContextMenuItem }
    return data.legacyTool || null
  }

  handleBlockItemClick(item: IBlockSchemaOptions) {
    if (!this.activeBlock) return

    const insertAfter = () => {
      const blockCreator = this.doc.injector.get(BLOCK_CREATOR_SERVICE_TOKEN)
      const targetBlock = this.activeBlock
      blockCreator.getParamsByScheme(item).then(params => {
        if (!targetBlock || !params) return
        const newBlock = this.doc.schemas.createSnapshot(item.flavour, params as any)
        this.doc.crud.insertBlocksAfter(targetBlock, [newBlock]).then(() => {
          this.doc.selection.setCursorAtBlock(newBlock.id, true)
        })
      })
    }

    const replace = (flavour: BlockCraft.BlockFlavour) => {
      const block = this.activeBlock
      if (!block || !this.doc.isEditable(block) || block.flavour === flavour) return
      const newBlock = this.doc.schemas.createSnapshot(flavour, [block.textDeltas(), {
        ...block.props,
        heading: undefined
      }])
      this.doc.crud.replaceWithSnapshots(this.activeBlock!.id, [newBlock]).then(() => {
        nextTick().then(() => {
          this.doc.selection.setCursorAtBlock(newBlock.id, true)
        })
      })
    }

    if (this.isEmpty) {
      if (item.nodeType !== BlockNodeType.editable) {
        insertAfter()
      } else {
        replace(item.flavour)
      }

      this.menuDisabled = true
      nextTick().then(() => {
        this.menuDisabled = false
      })
      return;
    }

    if (this.doc.isEditable(this.activeBlock) && item.nodeType === BlockNodeType.editable) {
      replace(this.activeBlock.flavour === item.flavour ? 'paragraph' : item.flavour)
    } else {
      insertAfter()
    }

    this.menuDisabled = true

    nextTick().then(() => {
      this.menuDisabled = false
    })
  }

  handleToolItemClick(item: IContextMenuItem) {
    if (this.customToolHandler) {
      const res = this.customToolHandler(item, this.activeBlock, this.doc)
      if (res) {
        this.close()
        return;
      }
    }

    switch (item.name) {
      case 'align':
        if (!this.activeBlock || !this.doc.isEditable(this.activeBlock)) return
        this.activeBlock.updateProps({ textAlign: item.value as any })
        break
      case 'cut': {
        if (!this.activeBlock) return;
        this.doc.clipboard.copyBlocksModel([this.activeBlock.toSnapshot()]).then(() => {
          this.activeBlock && this.doc.crud.deleteBlockById(this.activeBlock.id).then(() => {
            requestAnimationFrame(() => {
              this.doc.selection.recalculate()
            })
            this.doc.messageService.success('已剪切')
          })
          this.close()
        })
      }
        break
      case 'delete':
        this.activeBlock && this.doc.crud.deleteBlockById(this.activeBlock.id).then(() => {
          requestAnimationFrame(() => {
            this.doc.selection.recalculate()
          })
        })
        break
      case 'copy': {
        if (!this.activeBlock) return;
        this.doc.clipboard.copyBlocksModel([this.activeBlock.toSnapshot()]).then(() => {
          this.doc.messageService.success('已复制')
          this.close()
        })
      }
        break
      case 'heading':
        if (!this.activeBlock) return
        if (!this.doc.isEditable(this.activeBlock)) {
          const p = this.doc.schemas.createSnapshot('paragraph', [[], {
            depth: this.activeBlock.props.depth,
            heading: item.value
          }])
          this.doc.crud.insertBlocksAfter(this.activeBlock, [p]).then(() => {
            this.menuDisabled = true
            this.doc.selection.selectOrSetCursorAtBlock(p.id, true)
          })
          return;
        }
        if (this.activeBlock.flavour === 'ordered' && item.value) {
          this.activeBlock.updateProps({ heading: item.value as any })
          return;
        }
        if (this.activeBlock.flavour !== 'paragraph') {
          const p = this.doc.schemas.createSnapshot('paragraph', [this.activeBlock.textDeltas(), {
            ...this.activeBlock.props,
            heading: item.value
          }])
          this.doc.crud.replaceWithSnapshots(this.activeBlock.id, [p]).then(() => {
            this.doc.selection.selectOrSetCursorAtBlock(p.id, true)
          })
        } else {
          this.activeBlock.updateProps({ heading: item.value as any })
        }
        break
    }
  }

}
