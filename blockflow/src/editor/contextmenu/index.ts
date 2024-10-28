import {
  ChangeDetectionStrategy, ChangeDetectorRef,
  Component, EmbeddedViewRef,
  EventEmitter,
  HostListener,
  Input,
  Output, TemplateRef, ViewChild, ViewContainerRef,
} from "@angular/core";
import {NgForOf, NgIf, NgTemplateOutlet} from "@angular/common";
import {IContextMenuEvent, IContextMenuItem} from "./type";
import {BaseBlock, BlockSchema, ClipDataWriter, Controller, EditableBlock} from "../../core";
import {FILE_UPLOADER} from "../../blocks";
import {Overlay} from "@angular/cdk/overlay";
import {TemplatePortal} from "@angular/cdk/portal";
import {fromEvent} from "rxjs";
import {MatIconModule} from "@angular/material/icon";
export * from './type'

@Component({
  selector: 'div.bf-contextmenu',
  standalone: true,
  template: `

    <ng-template #icon let-item>
      <i [class]="item.icon"></i>
    </ng-template>

    <ng-template #svgIcon let-item>
      <mat-icon [svgIcon]="item.svgIcon" style="width: 1em; height: 1em"></mat-icon>
    </ng-template>

    <div class="spark-popover__gap"></div>
    <div class="spark-popover__container">
      <ng-container *ngIf="activeBlock.nodeType === 'editable'">
        <h4 class="title">基础</h4>
        <ul class='base-list'>
          <li class="base-list__item" *ngFor="let item of baseBlockList" [title]="item.description || item.label"
              (mousedown)="onMouseDown($event, item, 'block')" [class.active]="activeBlock.flavour === item.flavour">
            <ng-container *ngTemplateOutlet="item.svgIcon ? svgIcon : icon; context: {$implicit: item}">
            </ng-container>
          </li>
        </ul>
        <div class="line"></div>
      </ng-container>

      <ng-container *ngIf="hasContent">
        <ul class="common-list">
          <li class="common-list__item" *ngFor="let item of toolList"
              (mousedown)="onMouseDown($event, item, 'tool')">
            <i [class]="item.icon"></i>
            <span>{{ item.label }}</span>
          </li>
        </ul>
        <div class="line"></div>
      </ng-container>

      <ng-container *ngIf="!hasContent else appendAfter">
        <ng-container *ngTemplateOutlet="moreBlockList"></ng-container>
      </ng-container>

      <ng-template #appendAfter>
        <ul class='common-list'>
          <li class="common-list__item add-block-btn" (mouseenter)="onShowMoreBlock($event)" [class.active]="moreBlockTpr">
            <i class="bf_icon bf_tianjia"></i>
            <span>在下方添加</span>
            <i class="bf_icon bf_youjiantou"></i>
          </li>
        </ul>
      </ng-template>
    </div>

    <ng-template #moreBlockContainer>
      <div class="spark-popover__container spark-popover__more-block" style="max-height: 500px; overflow-y: auto;">
        <ng-container *ngTemplateOutlet="moreBlockList"></ng-container>
      </div>
    </ng-template>

    <ng-template #moreBlockList>
      <h4 class="title" *ngIf="commonBlockList.length">常用</h4>
      <ul class='common-list'>
        <ng-container *ngIf="activeBlock.nodeType !== 'editable'">
          <li class="common-list__item" *ngFor="let item of baseBlockList" [title]="item.description || item.label"
              (mousedown)="onMouseDown($event, item, 'block')">
            <ng-container *ngTemplateOutlet="item.svgIcon ? svgIcon : icon; context: {$implicit: item}">
            </ng-container>
            <span>{{ item.label }}</span>
          </li>
        </ng-container>

        <li class="common-list__item" *ngFor="let item of commonBlockList" [title]="item.description || item.label"
            (mousedown)="onMouseDown($event, item, 'block')">
          <ng-container *ngTemplateOutlet="item.svgIcon ? svgIcon : icon; context: {$implicit: item}">
          </ng-container>
          <span>{{ item.label }}</span>
        </li>
      </ul>
    </ng-template>

    <div class="spark-popover__gap"></div>
  `,
  imports: [NgForOf, NgIf, NgTemplateOutlet, MatIconModule],
  styles: [`
    :host {
      display: block;
    }

    ::ng-deep mat-icon {
      width: 1em;
      height: 1em;
      font-size: 1em;
    }

    ::ng-deep mat-icon > svg {
      vertical-align: top;
    }

    .spark-popover__gap {
      height: 8px;
    }

    .spark-popover__container {
      padding: 8px 0;
      width: 224px;
      background: #fff;
      border-radius: 4px;
      border: 1px solid #E6E6E6;
      box-shadow: 0px 0px 20px 0px rgba(0, 0, 0, 0.10);
    }

    .title {
      margin: 8px 16px 0 16px;
      color: #999;
      font-size: 14px;
      font-weight: 600;
      line-height: 140%; /* 19.6px */
    }

    .line {
      height: 1px;
      background: #f3f3f3;
      width: 100%;
    }

    .base-list, .common-list {
      margin: 0;
    }

    .base-list {
      display: flex;
      flex-wrap: wrap;
      padding: 8px 12px;
      gap: 8px;
    }

    .base-list__item {
      width: 24px;
      height: 24px;
      border-radius: 4px;
      display: flex;
      justify-content: center;
      align-items: center;
      cursor: pointer;
    }

    .base-list__item:hover, .base-list__item.active {
      background: #f3f3f3;
    }

    .base-list__item > i {
      font-size: 16px;
    }

    .common-list {
      padding: 8px;
    }

    .common-list__item {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 36px;
      padding: 0 8px;
      border-radius: 4px;
      cursor: pointer;
    }

    .common-list__item:hover, .common-list__item.active {
      background-color: #f5f5f5;
    }

    .common-list__item > i {
      font-size: 14px;
    }

    .common-list__item > span {
      color: #333;
      font-size: 14px;
      line-height: 20px;
      flex: 1;
    }

    .add-block-btn {
      position: relative;
    }

    .spark-popover__more-block {
    }

  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BlockFlowContextmenu {

  private _activeBlock!: BaseBlock
  @Input({required: true})
  set activeBlock(val: BaseBlock) {
    if (!val) return
    this._activeBlock = val
    this.hasContent = val instanceof EditableBlock && val.flavour === 'paragraph' ? !!val.textLength : true
  }

  get activeBlock() {
    return this._activeBlock
  }

  private _controller!: Controller
  @Input({required: true})
  set controller(val: Controller) {
    if (!val) throw new Error('Controller is required')
    this._controller = val
    const schemas = val.schemas.values().filter(schema => !schema.isLeaf)
    this.baseBlockList = schemas.filter(schema => schema.nodeType === 'editable')
    this.commonBlockList = schemas.filter(schema => schema.nodeType !== 'editable')
  }

  get controller() {
    return this._controller
  }

  @Output() itemClick = new EventEmitter<IContextMenuEvent>()

  constructor(
    private cdr: ChangeDetectorRef,
    private vcr: ViewContainerRef,
    private overlay: Overlay
  ) {
  }

  @ViewChild('moreBlockContainer') moreBlockContainer!: TemplateRef<any>

  protected baseBlockList: IContextMenuItem[] = []
  protected commonBlockList: IContextMenuItem[] = []
  protected toolList: IContextMenuItem[] = [
    {
      flavour: 'cut',
      icon: 'bf_icon bf_jianqie',
      label: '剪切',
    },
    {
      flavour: 'copy',
      icon: 'bf_icon bf_fuzhi',
      label: '复制',
    },
    {
      flavour: 'delete',
      icon: 'bf_icon bf_shanchu-2',
      label: '删除',
    }
  ]

  protected hasContent = false

  protected moreBlockTpr?: EmbeddedViewRef<any>

  @HostListener('click', ['$event'])
  onClick(event: MouseEvent) {
    event.stopPropagation()
  }

  onMouseDown(event: MouseEvent, item: IContextMenuItem, type: 'block' | 'tool') {
    event.preventDefault()
    event.stopPropagation()
    if (type === 'block' && this.activeBlock.nodeType === "editable" && this.activeBlock.flavour === item.flavour) return
    this.onItemClicked({item, type})
    this.itemClick.emit({item, type})
  }

  onItemClicked(value: IContextMenuEvent) {
    const {item, type} = value
    if (type === 'tool') {
      switch (item.flavour) {
        case 'cut':
        case 'copy':
          const model = this.controller.getBlockModel(this.activeBlock!.id)!
          ClipDataWriter.writeModelToClipboard([model]).then(() => {
            item.flavour === 'cut' && this.controller.deleteBlockById(this.activeBlock!.id)
          })
          return
        case 'delete':
          this.controller.deleteBlockById(this.activeBlock!.id)
          return
      }
      return
    }

    const schema = item as BlockSchema
    if (this.activeBlock instanceof EditableBlock && schema.nodeType === 'editable') {
      const deltas = this.activeBlock.getTextDelta()
      const newBlock = this.controller.createBlock(schema.flavour, [deltas, this.activeBlock.props])
      this.controller.replaceWith(this.activeBlock.id, newBlock).then(() => {
        this.controller.setSelection(newBlock.id, 'start')
      })
      return
    }

    const position = this.controller.getBlockPosition(this.activeBlock!.id)

    if (schema.flavour === 'image') {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.multiple = false
      input.click()
      input.onchange = () => {
        const file = input.files![0]
        if (!file) return
        const fileUploader = this.controller.injector.get(FILE_UPLOADER)
        if (!file) throw new Error('file is required')
        fileUploader.uploadImg(file).then((fileUri) => {
          const newBlock = this.controller.createBlock(schema.flavour, [fileUri])
          this.controller.insertBlocks(position.index + 1, [newBlock], position.parentId).then(() => {
            newBlock.nodeType === 'editable' && this.controller.setSelection(newBlock.id, 'start')
          })
        })
      }
      return
    }

    const newBlock = this.controller.createBlock(schema.flavour)
    if (!this.hasContent)
      this.controller.replaceWith(this.activeBlock.id, newBlock).then(() => {
        newBlock.nodeType === 'editable' && this.controller.setSelection(newBlock.id, 'start')
      })
    else
      this.controller.insertBlocks(position.index + 1, [newBlock], position.parentId).then(() => {
        newBlock.nodeType === 'editable' && this.controller.setSelection(newBlock.id, 'start')
      })
  }

  onShowMoreBlock(event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    const target = event.target as HTMLElement
    const positionStrategy = this.overlay.position().flexibleConnectedTo(target)
      .withPositions([
        {originX: 'end', originY: 'top', overlayX: 'start', overlayY: 'top'},
        {originX: 'end', originY: 'bottom', overlayX: 'start', overlayY: 'bottom'},
      ]).withPush(true)
    const ovr = this.overlay.create({
      positionStrategy,
      hasBackdrop: false
    })
    this.moreBlockTpr = ovr.attach(new TemplatePortal(this.moreBlockContainer, this.vcr))
    const tprEl = this.moreBlockTpr.rootNodes[0] as HTMLElement

    const leaveSub = fromEvent<MouseEvent>(target, 'mouseleave')
      .subscribe(e => {
        if (tprEl.contains(e.relatedTarget as HTMLElement)) return
        ovr.dispose()
      })
    const leaveSub2 = fromEvent<MouseEvent>(tprEl, 'mouseleave')
      .subscribe(e => {
        if (target.contains(e.relatedTarget as HTMLElement)) return
        ovr.dispose()
      })

    this.moreBlockTpr.onDestroy(() => {
      leaveSub.unsubscribe()
      leaveSub2.unsubscribe()
      this.moreBlockTpr = undefined
      this.cdr.detectChanges()
    })
  }

}
