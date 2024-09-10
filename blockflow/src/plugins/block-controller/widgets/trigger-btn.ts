import {
  ChangeDetectionStrategy, ChangeDetectorRef,
  Component, HostBinding,
  HostListener,
  Input,
} from "@angular/core";
import {BaseBlock, BlockSchema, Controller, ClipDataWriter, EditableBlock} from "@core";
import {SparkPopover} from "./spark-popover";
import {NgIf} from "@angular/common";
import {ISparkEvent, ISparkItem} from "./spark-item.type";
import {take} from "rxjs";

const calcLineHeight = (wrap: HTMLElement) => {
  const computedStyle = window.getComputedStyle(wrap)
  return computedStyle.lineHeight !== 'normal'
    ? parseFloat(computedStyle.lineHeight)
    : parseFloat(computedStyle.fontSize) * 1.5
}
@Component({
  selector: 'div.trigger-btn',
  standalone: true,
  template: `
    <div class="btn">
      <i [class]="['editor', hasContent ? 'editor-drag' : 'editor-add']"></i>
    </div>
    <div class="spark-popover" [baseBlockList]="baseSparkList" [commonBlockList]="commonSparkList"
         [toolList]="toolSparkList" [hasContent]="hasContent" [activeBlock]="activeBlock"
         *ngIf="showPopover && activeBlock" (itemClick)="onItemClicked($event)"></div>
  `,
  styles: [`
    :host {
      z-index: 100;
      position: absolute;
      padding-right: 8px;
      animation: fadeIn 0.1s;
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }

    .btn {
      width: 22px;
      height: 22px;
      background-color: #fff;
      box-shadow: 0 0 2px 0 #999;
      border-radius: 4px;
      overflow: hidden;
      cursor: pointer;
      text-align: center;
      line-height: 22px;
      color: #999;
    }

    .btn:hover {
      background-color: #E6E6E6;
    }
  `],
  imports: [SparkPopover, NgIf],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TriggerBtn {

  protected _controller!: Controller
  @Input()
  set controller(val: Controller) {
    if (!val) return
    this._controller = val
    const schemas = val.schemaStore.values()
    this.baseSparkList = schemas.filter(schema => schema.nodeType === 'editable')
    this.commonSparkList = schemas.filter(schema => schema.nodeType !== 'editable')
  }

  get controller() {
    return this._controller
  }

  constructor(
    public cdr: ChangeDetectorRef
  ) {
  }

  protected hasContent = false
  protected activeBlock?: BaseBlock
  // protected mutationObserver = new MutationObserver(() => {
  //   if (!this.activeBlock) return
  //   const b = !!(this.activeBlock as EditableBlock).textLength
  //   if (this.hasContent !== b) {
  //     this.hasContent = b
  //     this.cdr.detectChanges()
  //   }
  // })

  protected _activeBlockWrap?: HTMLElement
  @Input()
  set activeBlockWrap(val: HTMLElement) {
    // console.log('set activeBlockWrap', val)
    if (this._activeBlockWrap === val) return
    this._activeBlockWrap = val
    if (!val) {
      this.close()
      return
    }

    this.activeBlock = this.controller.getBlockRef(val.getAttribute('data-block-id')!)!
    this.hasContent = this.activeBlock instanceof EditableBlock ? !!this._activeBlockWrap.textContent : true

    this.activeBlock.onDestroy.pipe(take(1)).subscribe(() => {
        this.close()
    })

    this.display = 'block'
    const {top, left} = this.calcPos()
    this.top = top
    this.left = left
    // this.mutationObserver.disconnect()
    // if (this.activeBlock instanceof EditableBlock) {
    //   this.mutationObserver.observe(this.activeBlock.containerEle, {
    //     childList: true,
    //     subtree: true,
    //     characterData: true
    //   })
    // }
  }

  private calcPos() {
    const rootRect = this.controller.rootElement.getBoundingClientRect()

    if (this.activeBlock instanceof EditableBlock) {
      const container = this.activeBlock.containerEle
      const rect = container.getBoundingClientRect()
      return {
        top: rect.top - rootRect.top + calcLineHeight(container) / 2 - 11,
        left: rect.left - rootRect.left - 28
      }
    }

    const rect = this._activeBlockWrap!.getBoundingClientRect()
    return {
      top: rect.top - rootRect.top + rect.height / 2 - 11,
      left: rect.left - rootRect.left - 28
    }
  }

  showPopover = false
  protected baseSparkList: BlockSchema[] = []
  protected commonSparkList: BlockSchema[] = []
  protected toolSparkList: ISparkItem[] = [
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

  @HostBinding('style.display')
  private display = 'none'

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
    // event.preventDefault()
  }

  @HostListener('mouseenter', ['$event'])
  onMouseEnter(e: Event) {
    e.stopPropagation()
    this.hasContent = this.activeBlock instanceof EditableBlock ? !!this._activeBlockWrap!.textContent : true
    this.display = 'block'
    this.showPopover = true
  }

  @HostListener('mouseleave', ['$event'])
  onMouseLeave(e: Event) {
    e.stopPropagation()
    this.close()
  }

  close() {
    this.display = 'none'
    this.showPopover = false
    this.activeBlock = undefined
    this._activeBlockWrap = undefined
    // this.mutationObserver.disconnect()
  }

  onItemClicked(value: ISparkEvent) {
    const {item, type} = value

    if (type === 'tool') {
      switch (item.flavour) {
        case 'cut':
        case 'copy':
          const model = this.controller.docManager.queryBlockModel(this.activeBlock!.id)!
          ClipDataWriter.writeModelToClipboard([model]).then(() => {
            item.flavour === 'cut' && this.controller.deleteBlockById(this.activeBlock!.id)
            this.close()
          })
          return
        case 'delete':
          this.controller.deleteBlockById(this.activeBlock!.id)
          this.close()
          return
      }
      return
    }

    const schema = item as BlockSchema
    if (this.activeBlock instanceof EditableBlock && schema.nodeType === 'editable') {
      const deltas = this.activeBlock.getTextDelta()
      const newBlock = this.controller.schemaStore.create(schema.flavour, deltas)
      this.controller.replaceWith(this.activeBlock.id, newBlock).then(() => {
        this.close()
        this.controller.setSelection(newBlock.id, 'start')
      })
    } else {
      const position = this.controller.getBlockPosition(this.activeBlock!.id)
      const newBlock = this.controller.schemaStore.create(schema.flavour)
      this.controller.insertBlocks(position.index + 1, [newBlock], position.parentId).then(() => {
        this.close()
        newBlock.nodeType === 'editable' && this.controller.setSelection(newBlock.id, 'start')
      })
    }
  }

  protected readonly eval = eval;
}
