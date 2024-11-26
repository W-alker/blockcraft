import {debounceTime, fromEvent, Subscription, take} from "rxjs";
import {ComponentRef, ViewContainerRef} from "@angular/core";
import {FloatTextToolbar} from "./widget/float-text-toolbar";
import {BlockFlowSelection, Controller, EditableBlock, getCurrentCharacterRange, IPlugin, sliceDelta} from "../../core";
import {IToolbarMenuItem} from "./widget/float-text-toolbar.type";

export interface IExpandToolbarItem {
  item: IToolbarMenuItem,
  click?: (item: IToolbarMenuItem, activeBlock: EditableBlock, controller: Controller) => void
}

export class FloatTextToolbarPlugin implements IPlugin {
  name = "float-text-toolbar";
  version = 1.0;

  controller!: Controller;

  // private _oldRangePosition: { top: number, left: number, bottom: number } = {top: 0, left: 0, bottom: 0}
  private _vcr!: ViewContainerRef
  private _cpr?: ComponentRef<FloatTextToolbar>
  private _cprSub?: Subscription

  private timer?: number
  private readonly expandToolbarMenuList?: IToolbarMenuItem[]

  constructor(
    private readonly expandToolbarList?: IExpandToolbarItem[],
  ) {
    this.expandToolbarMenuList = this.expandToolbarList?.map((item, idx) => {
      return {
        ...item.item,
        order: (item.item.order || 8) + idx
      }
    })
  }

  init(controller: Controller) {
    this._vcr = controller.injector.get(ViewContainerRef)
    this.controller = controller

    const isRange = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !controller.activeElement || !sel.toString().replace(/[\u200B\t\n\u3000]/g, '')) return false
      return sel
    }

    fromEvent(document, 'selectionchange').pipe(debounceTime(200))
      .subscribe(() => {
        if (controller.readonly$.value || controller.activeElement?.classList.contains('bf-plain-text-only')) return
        this.timer && clearTimeout(this.timer)

        if (!isRange()) {
          this.closeToolbar()
          return;
        }

        this.timer = setTimeout(() => {
          const range = isRange()
          if (!range) return
          const rect = range.getRangeAt(0).getBoundingClientRect()
          this._cpr ? this.moveToolbar(rect) : this.openToolbar(rect)
        }, 300)

      })
  }

  openToolbar(rect: DOMRect) {
    const activeBlock = this.controller.getBlockRef(this.controller.getFocusingBlockId()!) as EditableBlock
    if (!activeBlock) return

    this._cpr = this._vcr.createComponent(FloatTextToolbar)
    this.expandToolbarList?.length && this._cpr.setInput('expandToolbarList', this.expandToolbarMenuList)

    this.moveToolbar(rect, activeBlock)
    this.controller.rootElement.appendChild(this._cpr.location.nativeElement)

    activeBlock.onDestroy.pipe(take(1)).subscribe(() => {
      this.closeToolbar()
    })

    this._cprSub = this._cpr.instance.itemClick.subscribe((item) => {
      const range = getCurrentCharacterRange(this.controller.activeElement!)
      switch (item.name) {
        case 'align':
          // if (item.value === 'left' && !activeBlock.props['textAlign']) break
          activeBlock.props['textAlign'] !== item.value && activeBlock.setProp('textAlign', item.value as any)
          requestAnimationFrame(() => {
            this.moveToolbar()
          })
          break
        case 'italic':
        case 'bold':
        case 'underline':
        case 'strike':
        case 'code':
        case 'sub':
        case 'sup':
          activeBlock.applyDelta([
            {retain: range.start},
            {
              retain: range.end - range.start,
              attributes: {[`a:${item.name}`]: this._cpr?.instance.activeMenuSet?.has(item.name) ? null : true}
            }
          ])
          break
        case 'c':
        case 'bc':
          activeBlock.applyDelta([
            {retain: range.start},
            {retain: range.end - range.start, attributes: {['s:' + item.name]: item.value ? `${item.value}` : null}}
          ])
          break
        default:
          // 尝试调用扩展的点击事件
          this.expandToolbarList?.find(expandItem => expandItem.item.name === item.name)?.click?.(item, activeBlock, this.controller)
          break
      }
    })
  }

  moveToolbar(rect: DOMRect | undefined = window.getSelection()?.getRangeAt(0)?.getBoundingClientRect(), activeBlock?: EditableBlock) {
    if (!this._cpr || !rect) return
    activeBlock ||= this.controller.getBlockRef(this.controller.getFocusingBlockId()!) as EditableBlock
    if (!activeBlock) return
    const range = getCurrentCharacterRange(this.controller.activeElement!)
    const deltas = sliceDelta(activeBlock.getTextDelta(), range.start, range.end)
    // 获取选中文本的共有属性
    const commonAttrs = deltas.map(d => {
      // @ts-ignore
      return Object.keys(d.attributes || {}).filter(k => k.startsWith('a:') && d.attributes[k]).map(k => {
        return k.slice(2)
      })
    }).reduce((prev, cur) => {
      return prev.filter(v => cur.includes(v))
    })
    this._cpr.setInput('activeMenuSet', new Set(commonAttrs))

    const rootElementRect = this.controller.rootElement.getBoundingClientRect()
    const {top, left, bottom, right} = rect
    if (top > window.innerHeight / 2) {
      this._cpr.instance.top = top - rootElementRect.top - this._cpr.location.nativeElement.clientHeight - 4
    } else {
      this._cpr.instance.top = bottom - rootElementRect.top + 4
    }
    const width = this._cpr.location.nativeElement.clientWidth
    if (left + width > window.innerWidth) {
      this._cpr.setInput('left', right - rootElementRect.left - width)
    } else {
      this._cpr.setInput('left', left - rootElementRect.left)
    }
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
