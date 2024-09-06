import {Controller, EditableBlock, getCurrentCharacterRange, IPlugin} from "@core";
import {fromEvent, Subscription, take} from "rxjs";
import {ComponentRef, ViewContainerRef} from "@angular/core";
import {FloatTextToolbar} from "./widget/float-text-toolbar";

export class FloatTextToolbarPlugin implements IPlugin {
  name = "float-text-toolbar";
  version = 1.0;

  private _vcr!: ViewContainerRef
  private _cpr?: ComponentRef<FloatTextToolbar>
  private _cprSub?: Subscription

  private timer?: number

  constructor() {
  }

  init(controller: Controller) {
    this._vcr = controller.injector.get(ViewContainerRef)

    fromEvent(document, 'selectionchange')
      .subscribe(() => {

        if (controller.readonly$.value) return
        const sel = window.getSelection()
        if (!sel || sel.isCollapsed || !controller.activeElement) {
          this.timer && clearTimeout(this.timer)
          this._cpr && this.closeToolbar()
          return
        }

        this.timer = setTimeout(() => {
          const sel = window.getSelection()
          if (!sel || sel.isCollapsed || !controller.activeElement) return
          const range = sel.getRangeAt(0)
          const rect = range.getBoundingClientRect()
          this._cpr ? this.moveToolbar(rect.bottom + 4, rect.left) : this.openToolbar(rect.bottom + 4, rect.left, controller)
        }, 300)

      })
  }

  openToolbar(top: number, left: number, controller: Controller) {
    const cpr = this._vcr.createComponent(FloatTextToolbar)
    cpr.instance.top = top
    cpr.instance.left = left
    document.body.appendChild(cpr.location.nativeElement)
    this._cpr = cpr

    const activeBlock = controller.getBlockRef(controller.getFocusingBlockId()!) as EditableBlock
    if(!activeBlock) return

    activeBlock.onDestroy.pipe(take(1)).subscribe(() => {
      this.closeToolbar()
    })

    this._cprSub = this._cpr.instance.itemClick.subscribe((item) => {
      console.log('item click', item)
      const range = getCurrentCharacterRange()
      switch (item.name) {
        case 'align':
          if (item.value === 'left' && !activeBlock.props['textAlign']) break
          activeBlock.props['textAlign'] !== item.value && (activeBlock.props['textAlign'] = item.value)
          break
        case 'italic':
        case 'bold':
        case 'underline':
        case 'strike':
        case 'code':
          controller.applyDeltaToEditableBlock(activeBlock, [
            {retain: range.start},
            {retain: range.end - range.start, attributes: {[`a:${item.name}`]: true}}
          ])
          break
        case 'mark':
          controller.applyDeltaToEditableBlock(activeBlock, [
            {retain: range.start},
            {retain: range.end - range.start, attributes: {'s:bc': item.value + ''}}
          ])
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
