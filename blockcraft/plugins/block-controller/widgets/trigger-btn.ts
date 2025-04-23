import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  HostBinding,
  HostListener,
  Input,
  Output,
} from "@angular/core";
import {NgComponentOutlet, NgForOf, NgIf, NgTemplateOutlet} from "@angular/common";
import {Subscription, take} from "rxjs";
import {BcFloatToolbarComponent, BcFloatToolbarItemComponent, BcOverlayTriggerDirective} from "../../../components";
import {BlockNodeType} from "../../../framework/types";
import {IBlockSchemaOptions} from "../../../framework/schema/block-schema";
import {MatIcon} from "@angular/material/icon";
import {nextTick, SimpleValue} from "../../../global";
import {BLOCK_CREATOR_SERVICE_TOKEN} from "../../../framework";

interface IContextMenuItem {
  type: 'tool'
  name: string
  value: SimpleValue
  icon: string
  label: string
}

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

@Component({
  selector: 'div.trigger-btn',
  standalone: true,
  template: `
    <div class="btn" [bcOverlayTrigger]="contextMenuTpl" [positions]="['bottom-left', 'top-left']"
         [disabled]="menuDisabled" (open)="setValidBlockList()"
         [offsetY]="4" [withBackdrop]="false" activeClass="active" [draggable]="draggable">
      <i [class]="['bf_icon', isEmpty ? 'bf_tianjia-2' : 'bf_yidong' ]"></i>
    </div>

    <ng-template #icon let-item>
      <i [class]="item.icon"></i>
    </ng-template>

    <ng-template #svgIcon let-item>
      <mat-icon [svgIcon]="item.svgIcon" style="width: 1em; height: 1em"></mat-icon>
    </ng-template>

    <ng-template #contextMenuTpl>
      <bc-float-toolbar style="display: block; width: 224px;" direction="column">
        @if (activeBlock?.nodeType === BlockNodeType.editable) {
          <h4 class="title">基础</h4>
          <ul class='base-list'>
            <li class="base-list__item" *ngFor="let item of _validBaseBlockList"
                (mousedown)="handleBlockItemClick(item)"
                [title]="item.metadata.description || item.metadata.label"
                [class.active]="activeBlock?.flavour === item.flavour">
              <ng-container
                *ngTemplateOutlet="item.metadata.svgIcon ? svgIcon : icon; context: {$implicit: item.metadata}">
              </ng-container>
            </li>
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
      <bc-float-toolbar direction="column" style="display: block; width: 224px;">
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
          <ng-container
            *ngTemplateOutlet="item.metadata.svgIcon ? svgIcon : icon; context: {$implicit: item.metadata}">
          </ng-container>
          <span>{{ item.metadata.label }}</span>
        </bc-float-toolbar-item>
      }
    </ng-template>
  `,
  styles: [`
    :host {
      z-index: 10000;
      position: absolute;
      padding-right: 8px;
      user-select: none;
      -webkit-user-select: none;
      transition: all ease .2s;
    }

    ::ng-deep mat-icon {
      width: 1em;
      height: 1em;
      font-size: 1em;

      > svg {
        vertical-align: top;
      }
    }

    .btn {
      background-color: #fff;
      box-shadow: 0 0 2px 0 #999;
      border-radius: 4px;
      overflow: hidden;
      cursor: pointer;
      text-align: center;
      color: #999;
      font-size: 16px;
      width: 22px;
      height: 22px;
      line-height: 22px;

      &:hover, &.active {
        background-color: #E6E6E6;
      }
    }

    .title {
      margin: 8px;
      color: #999;
      font-size: 14px;
      font-weight: 600;
      line-height: 140%; /* 19.6px */
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
  imports: [NgIf, NgTemplateOutlet, BcFloatToolbarComponent, BcFloatToolbarItemComponent, NgForOf, MatIcon, BcOverlayTriggerDirective],
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
    this.menuDisabled = this._hidden = val
  }

  @HostBinding()
  protected _hidden = false

  private _activeBlock: BlockCraft.BlockComponent | null = null
  @Input()
  set activeBlock(val: BlockCraft.BlockComponent | null) {
    if (this._activeBlock === val) return
    // this.closeContextMenu()

    this._activeBlock = val
    this._onDestroySub?.unsubscribe()
    this.menuDisabled = true

    if (!this._activeBlock) {
      this.close()
      this.draggable = false
      return
    }

    this.menuDisabled = false

    const schema = this.doc.schemas.get(this._activeBlock.flavour)
    if (schema.metadata.isLeaf) return

    this.setIsEmpty()

    const parentBlock = this._activeBlock.parentBlock
    this.draggable = !!parentBlock?.childrenLength && parentBlock.childrenLength > 1

    this._onDestroySub = this._activeBlock?.onDestroy$.pipe(take(1)).subscribe(() => {
      this.close()
    })

    const {top, left} = this.calcPos()
    this.top = top
    this.left = left
    this.display = 'block'
    this.cdr.markForCheck()
  }

  get activeBlock() {
    return this._activeBlock
  }

  @Output()
  itemClicked = new EventEmitter<{ item: IBlockSchemaOptions, type: 'block' } | {
    type: 'tool',
    item: IContextMenuItem
  }>()

  constructor(
    public cdr: ChangeDetectorRef,
  ) {
  }

  menuDisabled = false
  draggable = true

  ngOnInit() {
    const schemas = this.doc.schemas.getSchemaList()
    this.baseBlockList = schemas.filter(item => item.nodeType === BlockNodeType.editable && !item.metadata.isLeaf)
    this.otherBlockList = schemas.filter(item =>
      (item.nodeType === BlockNodeType.void || item.nodeType === BlockNodeType.block) && !item.metadata.isLeaf && !item.flavour.endsWith('-embed'))
    this.embeddedBlockList = schemas.filter(item => item.flavour.endsWith('-embed'))
  }

  protected readonly BlockNodeType = BlockNodeType;
  protected readonly ALIGN_LIST = ALIGN_LIST;
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

    const left = wrapRect.left - rootRect.left - 28

    if (this.doc.isEditable(this.activeBlock!) && this.activeBlock.containerElement === this.activeBlock.hostElement) {
      const container = this.activeBlock.containerElement
      const rect = container.getBoundingClientRect()
      return {
        top: rect.top - rootRect.top + this.calcLineHeight(container) / 2 - 11 + this.doc.root.hostElement.scrollTop,
        left,
      }
    }

    return {
      top: wrapRect.top - rootRect.top + this.doc.root.hostElement.scrollTop,
      left
    }
  }

  calcLineHeight(ele: HTMLElement) {
    const style = window.getComputedStyle(ele)
    const lineHeight = style.lineHeight
    if (lineHeight === 'normal') {
      const fontSize = style.fontSize
      return parseFloat(fontSize) * 1.2
    }
    return parseFloat(lineHeight)
  }

  @HostBinding('style.top.px')
  private top = 0

  @HostBinding('style.left.px')
  private left = 0

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
    this.display = 'block'
    this.cdr.markForCheck()
    // this.showContextMenu()
  }

  setIsEmpty() {
    // @ts-expect-error
    this.isEmpty = this._activeBlock.flavour === 'paragraph' ? !this._activeBlock.textLength : false
  }

  setValidBlockList() {
    const parentBlockSchema = this.doc.schemas.get(this.activeBlock!.parentBlock!.flavour)
    this._validOtherBlockList = this.otherBlockList.filter(item => this.doc.schemas.isValidChildren(item.flavour, parentBlockSchema))
    this._validBaseBlockList = this.baseBlockList.filter(item => this.doc.schemas.isValidChildren(item.flavour, parentBlockSchema))
    this._validEmbeddedBlockList = this.embeddedBlockList.filter(item => this.doc.schemas.isValidChildren(item.flavour, parentBlockSchema))
  }

  close() {
    this.display = 'none'
    this.activeBlock = null
    // this.closeContextMenu()
    this.cdr.markForCheck()
    // check after NG100
    requestAnimationFrame(() => {
    })
  }

  handleBlockItemClick(item: IBlockSchemaOptions) {
    if (!this.activeBlock) return

    const insertAfter = () => {
      const blockCreator = this.doc.injector.get(BLOCK_CREATOR_SERVICE_TOKEN)
      const targetBlock = this.activeBlock
      blockCreator.getParamsByScheme(item).then(params => {
        if (!targetBlock) return
        const newBlock = this.doc.schemas.createSnapshot(item.flavour, params as any)
        this.doc.crud.insertBlocksAfter(targetBlock, [newBlock])
      })
    }

    const replace = () => {
      const block = this.activeBlock
      if (!block || !this.doc.isEditable(block) || block.flavour === item.flavour) return
      const newBlock = this.doc.schemas.createSnapshot(item.flavour, [block.textDeltas(), block.props])
      this.doc.crud.replaceWithSnapshots(this.activeBlock!.id, [newBlock]).then(() => {
        nextTick().then(() => {
          this.doc.selection.setBlockPosition(newBlock.id, true)
        })
      })
    }

    if (this.isEmpty) {
      if (item.nodeType !== BlockNodeType.editable) {
        insertAfter()
      } else {
        replace()
      }

      this.menuDisabled = true
      nextTick().then(() => {
        this.menuDisabled = false
      })
      return;
    }

    if (this.doc.isEditable(this.activeBlock) && item.nodeType === BlockNodeType.editable) {
      replace()
    } else {
      insertAfter()
    }

    this.menuDisabled = true

    nextTick().then(() => {
      this.menuDisabled = false
    })
  }

  handleToolItemClick(item: IContextMenuItem) {
    switch (item.name) {
      case 'align':
        if (!this.activeBlock || !this.doc.isEditable(this.activeBlock)) return
        this.activeBlock.updateProps({textAlign: item.value as any})
        break
      case 'delete':
        this.activeBlock && this.doc.crud.deleteBlockById(this.activeBlock.id)
        break
    }
  }

}
