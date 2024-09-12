import {ChangeDetectionStrategy, Component, EventEmitter, HostListener, Input, Output,} from "@angular/core";
import {NgForOf, NgIf} from "@angular/common";
import {BaseBlock, BlockSchema, ClipDataWriter, Controller, EditableBlock} from "@core";
import {IContextMenuEvent, IContextMenuItem} from "./type";
import {FILE_UPLOADER} from "@blocks/image";

@Component({
  selector: 'div.bf-contextmenu',
  standalone: true,
  template: `
    <div class="spark-popover__gap"></div>
    <div class="spark-popover__container">
      <ng-container *ngIf="activeBlock.nodeType === 'editable' ">
        <h4 class="title">基础</h4>
        <ul class='base-list'>
          <li class="base-list__item" *ngFor="let item of baseBlockList" [title]="item.description"
              (mousedown)="onMouseDown($event, item, 'block')" [class.active]="activeBlock.flavour === item.flavour">
            <i [class]="item.icon"></i>
          </li>
        </ul>
      </ng-container>

      <ng-container *ngIf="hasContent">
        <div class="line"></div>
        <ul class="common-list">
          <li class="common-list__item" *ngFor="let item of toolList"
              (mousedown)="onMouseDown($event, item, 'tool')">
            <i [class]="item.icon"></i>
            <span>{{ item.label }}</span>
          </li>
        </ul>
        <div class="line"></div>
      </ng-container>

      <h4 class="title" *ngIf="commonBlockList.length">常用</h4>
      <ul class='common-list'>
        <li class="common-list__item" *ngFor="let item of commonBlockList"
            (mousedown)="onMouseDown($event, item, 'block')">
          <i [class]="item.icon"></i>
          <span>{{ item.label }}</span>
        </li>
      </ul>
    </div>
    <div class="spark-popover__gap"></div>
  `,
  imports: [NgForOf, NgIf],
  styles: [`
    @keyframes bf_scale {
      from {
        transform: scale(0.3);
      }
      to {
        transform: scale(1);
      }
    }

    :host {
      position: absolute;
      animation: bf_scale 0.2s;
      transform-origin: top left;
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

    .common-list__item:hover {
      background-color: #f5f5f5;
    }

    .common-list__item > i {
      font-size: 14px;
    }

    .common-list__item > span {
      color: #333;
      font-size: 14px;
      line-height: 20px;
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
    this.hasContent = val instanceof EditableBlock ? !!val.textLength : false
  }

  get activeBlock() {
    return this._activeBlock
  }

  private _controller!: Controller
  @Input({required: true})
  set controller(val: Controller) {
    if (!val) throw new Error('Controller is required')
    this._controller = val
    const schemas = val.schemas.values()
    this.baseBlockList = schemas.filter(schema => schema.nodeType === 'editable')
    this.commonBlockList = schemas.filter(schema => schema.nodeType !== 'editable')
  }

  get controller() {
    return this._controller
  }

  protected baseBlockList: IContextMenuItem[] = []
  protected commonBlockList: IContextMenuItem[] = []
  protected toolList: IContextMenuItem[] = [
    {
      flavour: 'cut',
      icon: 'icon-cut',
      label: '剪切',
    },
    {
      flavour: 'copy',
      icon: 'editor editor-xuqiuwendang_fuzhi',
      label: '复制',
    },
    {
      flavour: 'delete',
      icon: 'editor editor-delete_01',
      label: '删除',
    }
  ]

  @Output() itemClick = new EventEmitter<IContextMenuEvent>()

  protected hasContent = false

  @HostListener('click', ['$event'])
  onClick(event: MouseEvent) {
    event.stopPropagation()
  }

  onMouseDown(event: MouseEvent, item: IContextMenuItem, type: 'block' | 'tool') {
    event.preventDefault()
    event.stopPropagation()
    if (type === 'block' && this.activeBlock.flavour === item.flavour) return
    this.onItemClicked({item, type})
    this.itemClick.emit({item, type})
  }

  onItemClicked(value: IContextMenuEvent) {
    const {item, type} = value
    if (type === 'tool') {
      switch (item.flavour) {
        case 'cut':
        case 'copy':
          const model = this.controller.docManager.queryBlockModel(this.activeBlock!.id)!
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
      const newBlock = this.controller.createBlock(schema.flavour, deltas)
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
        if(!file) return
        const fileUploader = this.controller.injector.get(FILE_UPLOADER)
        if(!file) throw new Error('file is required')
        fileUploader.upload(file).then((fileUri) => {
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

}
