import {
  ChangeDetectionStrategy, ChangeDetectorRef,
  Component, ElementRef, HostBinding,
  HostListener,
  Input,
} from "@angular/core";
import {NgIf, NgTemplateOutlet} from "@angular/common";
import {filter, fromEvent, merge, Subscription, take, takeUntil} from "rxjs";
import {Overlay, OverlayRef} from "@angular/cdk/overlay";
import {ComponentPortal} from "@angular/cdk/portal";
import {BlockFlowContextmenu, IContextMenuComponent} from "../../../editor";
import {BaseBlock, Controller, EditableBlock} from "../../../core";

@Component({
  selector: 'div.trigger-btn',
  standalone: true,
  template: `
    <div class="btn">
      <i [class]="['bf_icon', hasContent ? 'bf_yidong' : 'bf_tianjia-2']"></i>
    </div>
  `,
  styles: [`
    :host {
      z-index: 100;
      position: absolute;
      padding-right: 8px;
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
    }

    .btn:hover {
      background-color: #E6E6E6;
    }
  `],
  imports: [NgIf, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.contenteditable]': 'false',
    '[style.display]': 'display',
  }
})
export class TriggerBtn {
  @Input({required: true})
  set contextmenu(c: IContextMenuComponent) {
    this.contextmenuPortal = new ComponentPortal(c)
  }

  @Input() controller!: Controller

  constructor(
    private host: ElementRef<HTMLElement>,
    public cdr: ChangeDetectorRef,
    private overlay: Overlay,
  ) {
  }

  protected display = 'none'
  protected hasContent = false
  protected activeBlock?: BaseBlock<any>

  private _onDestroySub?: Subscription

  protected _activeBlockWrap?: HTMLElement
  @Input()
  set activeBlockWrap(val: HTMLElement) {
    if (this._activeBlockWrap === val) return
    this.closeContextMenu()
    this._activeBlockWrap = val
    this._onDestroySub?.unsubscribe()
    if (!val) {
      this.close()
      return
    }

    this.activeBlock = this.controller.getBlockRef(val.getAttribute('data-block-id')!)!
    this.hasContent = this.activeBlock instanceof EditableBlock ? !!this._activeBlockWrap.textContent : true

    this._onDestroySub = this.activeBlock.onDestroy.pipe(take(1)).subscribe(() => {
      this.close()
    })

    const {top, left} = this.calcPos()
    this.top = top
    this.left = left
    this.display = 'block'
    this.cdr.markForCheck()
  }

  private contextmenuPortal!: ComponentPortal<BlockFlowContextmenu>
  private ovr: OverlayRef | undefined

  private calcPos() {
    const rootRect = this.controller.rootElement.getBoundingClientRect()
    const wrapRect = this.activeBlock!.hostEl.nativeElement.getBoundingClientRect()

    const left = wrapRect.left - rootRect.left - 28

    if (this.activeBlock instanceof EditableBlock && this.activeBlock.containerEle === this.activeBlock.hostEl.nativeElement) {
      const container = this.activeBlock.containerEle
      const rect = container.getBoundingClientRect()
      return {
        top: rect.top - rootRect.top + this.calcLineHeight(container) / 2 - 11,
        left,
      }
    }

    return {
      top: wrapRect.top - rootRect.top,
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
    this.hasContent = this.activeBlock instanceof EditableBlock ? !!this._activeBlockWrap!.textContent : true
    this.display = 'block'
    this.cdr.markForCheck()
    this.showContextMenu()
  }

  showContextMenu() {
    if (this.ovr) return
    const positionStrategy = this.overlay.position().flexibleConnectedTo(this.host)
      .withPositions([
        {originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top'},
        {originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom'},
      ])
      .withPush(true)
    this.ovr = this.overlay.create({positionStrategy})
    const cpr = this.ovr.attach(this.contextmenuPortal)
    cpr.setInput('activeBlock', this.activeBlock)
    cpr.setInput('controller', this.controller)

    merge(
      fromEvent(document, 'click').pipe(take(1)),
      fromEvent(document, 'selectionchange').pipe(take(1)),
      fromEvent<MouseEvent>(cpr.location.nativeElement, 'mouseleave').pipe(filter(e => !(e.relatedTarget as HTMLElement).closest('.cdk-overlay-pane'))),
      fromEvent<MouseEvent>(this.host.nativeElement, 'mouseleave').pipe(filter(e => !(e.relatedTarget as HTMLElement).closest('.cdk-overlay-pane')))
    ).pipe(takeUntil(cpr.instance.destroy)).subscribe(() => {
      this.ovr?.dispose()
      this.ovr = undefined
    })
  }

  closeContextMenu() {
    this.ovr?.dispose()
    this.ovr = undefined
  }

  close() {
    this.display = 'none'
    this.activeBlock = undefined
    this._activeBlockWrap = undefined
    this.closeContextMenu()
    this.cdr.markForCheck()
    // check after NG100
    requestAnimationFrame(() => {
    })
  }

}
