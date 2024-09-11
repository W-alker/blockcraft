import {
  ChangeDetectionStrategy, ChangeDetectorRef,
  Component, HostBinding,
  HostListener,
  Input,
} from "@angular/core";
import {BaseBlock, Controller, EditableBlock} from "@core";
import {NgIf} from "@angular/common";
import {take} from "rxjs";
import {BlockFlowContextmenu} from "@editor";

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
    <div class="bf-contextmenu" [controller]="controller" [activeBlock]="activeBlock"
         *ngIf="showPopover && activeBlock" (itemClick)="close()"></div>
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
  imports: [BlockFlowContextmenu, NgIf],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TriggerBtn {

  @Input() controller!: Controller

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

}
