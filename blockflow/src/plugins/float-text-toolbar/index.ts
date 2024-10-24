import {fromEvent, Subscription, take} from "rxjs";
import {ComponentRef, ViewContainerRef} from "@angular/core";
import {FloatTextToolbar} from "./widget/float-text-toolbar";
import {Controller, EditableBlock, getCurrentCharacterRange, IPlugin} from "../../core";
import {IToolbarMenuItem} from "./widget/float-text-toolbar.type";

export interface IExpandToolbarItem {
  item: IToolbarMenuItem,
  click?: (item: IToolbarMenuItem,  activeBlock: EditableBlock,  controller: Controller,) => void
}
export class FloatTextToolbarPlugin implements IPlugin {
  name = "float-text-toolbar";
  version = 1.0;

  private _vcr!: ViewContainerRef
  private _cpr?: ComponentRef<FloatTextToolbar>
  private _cprSub?: Subscription

  private timer?: number

  constructor(
    private readonly expandToolbarList?: IExpandToolbarItem[],
  ) {
  }

  init(controller: Controller) {
    this._vcr = controller.injector.get(ViewContainerRef)

    fromEvent(document, 'selectionchange')
      .subscribe(() => {

        if (controller.readonly$.value) return
        const sel = window.getSelection()
        if (!sel || sel.isCollapsed || !controller.activeElement || !controller.activeElement.isContentEditable) {
          this.timer && clearTimeout(this.timer)
          this._cpr && this.closeToolbar()
          return
        }

        this.timer = setTimeout(() => {
          const sel = window.getSelection()
          if (!sel || sel.isCollapsed || !controller.activeElement || !sel.toString().replace(/\u200B|\t|\n/g, '')) return
          const range = sel.getRangeAt(0)
          const rect = range.getBoundingClientRect()
          this._cpr ? this.moveToolbar(rect.bottom + 4, rect.left) : this.openToolbar(rect.bottom + 4, rect.left, controller)
        }, 300)

      })
  }

  openToolbar(top: number, left: number, controller: Controller) {
    const activeBlock = controller.getBlockRef(controller.getFocusingBlockId()!) as EditableBlock
    if(!activeBlock || activeBlock.flavour === 'code') return

    const cpr = this._vcr.createComponent(FloatTextToolbar)
    cpr.instance.top = top
    cpr.instance.left = left
    this.expandToolbarList?.length && cpr.setInput('expandToolbarList', this.expandToolbarList?.map(item => item.item))

    document.body.appendChild(cpr.location.nativeElement)
    this._cpr = cpr

    activeBlock.onDestroy.pipe(take(1)).subscribe(() => {
      this.closeToolbar()
    })

    this._cprSub = this._cpr.instance.itemClick.subscribe((item) => {
      const range = getCurrentCharacterRange()
      switch (item.name) {
        case 'align':
          // if (item.value === 'left' && !activeBlock.props['textAlign']) break
          activeBlock.props['textAlign'] !== item.value && activeBlock.setProp('textAlign', item.value as any)
          requestAnimationFrame(() => {
            const rangeRect = window.getSelection()!.getRangeAt(0).getBoundingClientRect()
            this.moveToolbar(rangeRect.bottom + 4, rangeRect.left)
          })
          break
        case 'italic':
        case 'bold':
        case 'underline':
        case 'strike':
        case 'code':
          activeBlock.applyDelta([
            {retain: range.start},
            {retain: range.end - range.start, attributes: {[`a:${item.name}`]: true}}
          ])
          break
        case 'mark':
          activeBlock.applyDelta([
            {retain: range.start},
            {retain: range.end - range.start, attributes: {'s:bc': item.value ? `${item.value}` : null}}
          ])
          break
        default:
          this.expandToolbarList?.find(expandItem => expandItem.item.name === item.name)?.click?.(item, activeBlock, controller)
          break
      }
    })
  }

  moveToolbar(top: number, left: number) {
    if (!this._cpr) return
    this._cpr.instance.top = top
    this._cpr.setInput('left', left)
  }

  closeToolbar() {
    this._cpr?.destroy()
    this._cpr = undefined
    this._cprSub?.unsubscribe()
  }

  destroy() {
    this.closeToolbar()
  }

}
