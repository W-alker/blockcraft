import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component, ElementRef,
  EventEmitter,
  HostBinding,
  HostListener,
  Input,
  Output,
} from "@angular/core";
import {NgForOf, NgIf, NgTemplateOutlet} from "@angular/common";
import {Subscription, take} from "rxjs";
import {BcFloatToolbarComponent, BcFloatToolbarItemComponent, BcOverlayTriggerDirective} from "../../../components";
import {BlockNodeType} from "../../../framework";
import {IBlockSchemaOptions} from "../../../framework";
import {MatIcon} from "@angular/material/icon";
import {IS_MAC, nextTick} from "../../../global";
import {BLOCK_CREATOR_SERVICE_TOKEN} from "../../../framework";
import {customToolHandler, IContextMenuItem} from "../types";
import {NzDropDownDirective, NzDropdownMenuComponent} from "ng-zorro-antd/dropdown";
import {parseInt} from "lib0/number";
import {NzTooltipDirective} from "ng-zorro-antd/tooltip";

const ALIGN_LIST: IContextMenuItem[] = [
  {
    name: "align",
    icon: "bc_zuoduiqi",
    label: "左对齐",
    value: undefined,
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
    value: undefined,
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
         [disabled]="menuDisabled" (open)="setValidBlockList()" [delay]="500"
         [withBackdrop]="false" activeClass="active" [draggable]="draggable">
      <div class="btn">
        <ng-container *ngTemplateOutlet="icon; context: {$implicit: activeBlockIcon}"></ng-container>
        <i [class]="['bf_icon', isEmpty ? 'bf_tianjia-2' : 'bf_yidong' ]"></i>
      </div>
<!--      <div class="virtual-hover-area"></div>-->
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
            <i class="bc_icon bc_xinxi" style="cursor: pointer;" nz-tooltip="鼠标停留在内容块选项上一段时间以查看对应快捷键和快速转化语法" [nzTooltipPlacement]="'top'"></i>
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

          @if (activeBlock?.nodeType === BlockNodeType.editable) {
            <bc-float-toolbar-item class="append-more-btn" [bcOverlayTrigger]="alignList" [disabled]="menuDisabled"
                                   [positions]="['right-center']" [offsetX]="2" activeClass="active">
              <i [class]="['bc_icon', 'bc_zuoduiqi']"></i>
              <span>对齐方式</span>
              <i class="bf_icon bf_youjiantou"></i>
            </bc-float-toolbar-item>

            <span class="bc-float-toolbar__divider"></span>
          }

          @for (item of toolList; track item.name) {
            <bc-float-toolbar-item class="append-more-btn" (mousedown)="handleToolItemClick(item)">
              <i [class]="['bc_icon', item.icon]"></i>
              <span>{{ item.label }}</span>
            </bc-float-toolbar-item>
          }

          <span class="bc-float-toolbar__divider"></span>

          <bc-float-toolbar-item class="append-more-btn" [bcOverlayTrigger]="blockAddList" [disabled]="menuDisabled"
                                 [positions]="['right-center']" [offsetX]="2" activeClass="active">
            <i class="bf_icon bf_tianjia"></i>
            <span>在下方添加</span>
            <i class="bf_icon bf_youjiantou"></i>
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

    <ng-template #alignList>
      <bc-float-toolbar direction="column" style="display: block; width: 224px;">
        @for (item of ALIGN_LIST; track item.name) {
          <bc-float-toolbar-item class="align-item" (mousedown)="handleToolItemClick(item)"
                                 [icon]="item.icon" [title]="item.label"
                                 [active]="$any(activeBlock?.props)['textAlign'] === item.value">
            {{ item.label }}
          </bc-float-toolbar-item>
        }
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
  styles: [`
    :host {
      z-index: 10;
      position: absolute;
      user-select: none;
      -webkit-user-select: none;
      transition: all ease .2s;
      top: 0;
      left: 0;

      > * {
        user-select: none;
        -webkit-user-select: none;
      }
    }

    ::ng-deep mat-icon {
      width: 1em;
      height: 1em;
      font-size: 1em;

      > svg {
        vertical-align: top;
      }
    }

    .drag-handle {
      display: flex;
      padding: 4px 18px 4px 0;

      &.active {
        padding-right: 18px;
      }

      &.active {

        .btn {
          background-color: #E6E6E6;
        }

      }

      .btn {
        display: flex;
        gap: 4px;
        align-items: center;
        padding: 0 4px;
        background-color: #fff;
        box-shadow: 0 0 2px 0 #999;
        border-radius: 4px;
        overflow: hidden;
        cursor: pointer;
        text-align: center;
        color: #999;
        font-size: 16px;
        height: 22px;
        line-height: 22px;

        &:hover {
          background-color: #E6E6E6;
        }
      }
    }

    .title {
      margin: 8px;
      color: #999;
      font-size: 14px;
      font-weight: 600;
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .base-list, .common-list {
      margin: 0;
    }

    .base-list {
      display: flex;
      flex-wrap: wrap;
      padding: 8px;
      gap: 8px;

      .base-list__item {
        width: 24px;
        height: 24px;
        border-radius: 4px;
        display: flex;
        justify-content: center;
        align-items: center;
        cursor: pointer;
        transition: all .15s ease-in-out;

        &:hover, &.active {
          background: #f3f3f3;
        }

        > i {
          font-size: 1em;
        }
      }
    }

    bc-float-toolbar-item {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 36px;
      padding: 0 8px;
      border-radius: 4px;
      cursor: pointer;

      &:hover, &.active {
        background-color: #f5f5f5;
        color: inherit;
      }

      > span {
        color: #333;
        font-size: 14px;
        line-height: 20px;
        flex: 1;
      }
    }

    .align-item {
      &.active {
        color: var(--bc-active-color);
      }
    }
  `],
  imports: [NgIf, NgTemplateOutlet, BcFloatToolbarComponent, BcFloatToolbarItemComponent, NgForOf, MatIcon, BcOverlayTriggerDirective, NzDropdownMenuComponent, NzDropDownDirective, NzTooltipDirective],
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
    // this.closeContextMenu()

    this._activeBlock = val
    this._onDestroySub?.unsubscribe()
    this.menuDisabled = true
    this.activeBlockIcon = undefined

    if (!this._activeBlock) {
      this.close()
      this.draggable = false
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

    const parentBlock = this._activeBlock.parentBlock
    this.draggable = !!parentBlock?.childrenLength && parentBlock.childrenLength > 1

    this._onDestroySub = this._activeBlock?.onDestroy$.pipe(take(1)).subscribe(() => {
      this.close()
    })

    const {top, left} = this.calcPos()
    this.display = 'block'
    this.host.nativeElement.style.transform = `
      translate(${left - 44 - 18}px, ${top - 4}px)
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
  draggable = true
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
  protected readonly ALIGN_LIST = ALIGN_LIST;
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
          // + this.calcLineHeight(container) / 2 - 11
          + this.doc.root.hostElement.scrollTop,
        left,
      }
    }

    return {
      top: wrapRect.top - rootRect.top + this.doc.root.hostElement.scrollTop,
      left
    }
  }

  @HostListener('click', ['$event'])
  onClick(event: MouseEvent) {
    event.stopPropagation()
  }

  @HostListener('mousedown', ['$event'])
  onMouse(event: MouseEvent) {
    event.stopPropagation()
    // event.preventDefault()  // If open this line, the btn can't be dragged
  }

  @HostListener('mouseenter', ['$event'])
  onMouseEnter(e: Event) {
    e.stopPropagation()
    this.setIsEmpty()
    this.cdr.markForCheck()
    // this.showContextMenu()
  }

  setIsEmpty() {
    // @ts-expect-error
    this.isEmpty = this._activeBlock.flavour === 'paragraph' ? !this._activeBlock.textLength && !this.activeBlock?.props.heading : false
  }

  setValidBlockList() {
    const parentBlockSchema = this.doc.schemas.get(this.activeBlock!.parentBlock!.flavour)!
    this._validOtherBlockList = this.otherBlockList.filter(item => this.doc.schemas.isValidChildren(item.flavour, parentBlockSchema))
    this._validBaseBlockList = this.baseBlockList.filter(item => this.doc.schemas.isValidChildren(item.flavour, parentBlockSchema))
    this._validEmbeddedBlockList = this.embeddedBlockList.filter(item => this.doc.schemas.isValidChildren(item.flavour, parentBlockSchema))
  }

  close() {
    this.display = 'none'
    this.activeBlock = null
    this.cdr.markForCheck()
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
        this.activeBlock.updateProps({textAlign: item.value as any})
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
          this.activeBlock.updateProps({heading: item.value as any})
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
          this.activeBlock.updateProps({heading: item.value as any})
        }
        break
    }
  }

}

