import {fromEvent, merge, Subscription, take, takeUntil} from "rxjs";
import {ComponentRef, ViewContainerRef} from "@angular/core";
import {FloatTextToolbar} from "./widget/float-text-toolbar";
import {Controller, DeltaOperation, EditableBlock, getCommonAttributesFromDelta, IPlugin, sliceDelta} from "../../core";
import {IToolbarMenuItem} from "./widget/float-text-toolbar.type";
import {BlockFlowCursor} from "../../blockflow-cursor";
import {ComponentPortal} from "@angular/cdk/portal";
import {LinkInputPad} from "./widget/link-input-pad";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";
import {Overlay} from "@angular/cdk/overlay";

export interface IExpandToolbarItem extends IToolbarMenuItem {
  children?: IExpandToolbarItem[]
  click?: (item: IToolbarMenuItem, activeBlock: EditableBlock, controller: Controller) => void
}

const markMenu = {
  name: "mark",
  icon: "bf_jihaobi",
  intro: "高亮颜色",
  activeColor: null,
  activeBgColor: null,
}

const ALIGN_LIST: IToolbarMenuItem = {
  name: "align",
  value: "left",
  icon: "bf_suojinheduiqi",
  intro: "文字方向",
  children: [
    {
      name: "align",
      icon: "bf_icon bf_zuoduiqi",
      intro: "左对齐",
      value: "left",
    },
    {
      name: "align",
      value: "center",
      icon: "bf_icon bf_juzhongduiqi",
      intro: "居中",
    },
    {
      name: "align",
      value: "right",
      icon: "bf_icon bf_youduiqi",
      intro: "右对齐",
    }
  ],
  order: 0,
}

const DEFAULT_MENU_LIST: IToolbarMenuItem[] = [
  ALIGN_LIST,
  {
    name: "bold",
    icon: "bf_jiacu",
    intro: "加粗",
    value: true,
    order: 1,
    divide: true
  },
  {
    name: "strike",
    icon: "bf_shanchuxian",
    intro: "删除线",
    value: true,
    order: 1
  },
  {
    name: "underline",
    icon: "bf_xiahuaxian",
    intro: "下划线",
    value: true,
    order: 1
  },
  {
    name: "italic",
    icon: "bf_xieti",
    intro: "斜体",
    value: true,
    order: 1
  },
  {
    name: "code",
    icon: "bf_daimakuai",
    intro: "代码",
    value: true,
    order: 1
  },
  {
    name: "sup",
    icon: "bf_shangbiao",
    intro: "上标",
    value: true,
    order: 1
  },
  {
    name: "sub",
    icon: "bf_xiabiao",
    intro: "代码",
    value: true,
    order: 1
  },
  {
    name: "link",
    icon: 'bf_lianjie',
    intro: "链接",
    value: true,
    order: 1
  }
]

export class FloatTextToolbarPlugin implements IPlugin {
  name = "float-text-toolbar";
  version = 1.0;

  controller!: Controller;

  // private _oldRangePosition: { top: number, left: number, bottom: number } = {top: 0, left: 0, bottom: 0}
  private _vcr!: ViewContainerRef
  private _cpr?: ComponentRef<FloatTextToolbar>
  private _cprSub?: Subscription

  private timer?: number

  private readonly expandToolbarMenuList?: IExpandToolbarItem[]

  constructor(
    private expandToolbarList?: IExpandToolbarItem[],
  ) {
    this.expandToolbarMenuList = this.expandToolbarList?.map((item, idx) => {
      return {
        ...item,
        order: (item.order || 2) + idx
      }
    })
  }

  init(controller: Controller) {
    this._vcr = controller.injector.get(ViewContainerRef)
    this.controller = controller

    const isRange = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !controller.activeElement || !sel.toString().replace(/[\u200B\t\n\r\u3000]/g, '')) return false
      return sel
    }

    fromEvent(document, 'selectionchange').pipe(takeUntil(controller.root.onDestroy))
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
    this._cpr.setInput('toolbarMenuList', DEFAULT_MENU_LIST.concat(this.expandToolbarMenuList || []))

    this.moveToolbar(rect, activeBlock)
    this.controller.rootElement.appendChild(this._cpr.location.nativeElement)

    activeBlock.onDestroy.pipe(take(1)).subscribe(() => {
      this.closeToolbar()
    })

    this._cprSub = this._cpr.instance.itemClick.subscribe((item) => {
      const range = this.controller.selection.getCurrentCharacterRange()
      switch (item.name) {
        case 'align':
          // if (item.value === 'left' && !activeBlock.props['textAlign']) break
          ALIGN_LIST.value = item.value
          this._cpr?.instance.cdRef.detectChanges()
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
        case 'link':
          this.onLink();
          break
        default: {
          // 尝试调用扩展的点击事件
          const findItem = this.expandToolbarMenuList?.find(item => item.name === item.name)!
          if (findItem.value === item.value)
            return findItem.click?.(findItem, activeBlock, this.controller)
          if (!findItem.children) return
          const findChild = findItem.children.find(v => v.value === item.value)
          if (!findChild) return
          findChild.click?.(findChild, activeBlock, this.controller)
        }
          break
      }
    })
  }

  moveToolbar(rect: DOMRect | undefined = window.getSelection()?.getRangeAt(0)?.getBoundingClientRect(), activeBlock?: EditableBlock) {
    if (!this._cpr || !rect) return
    activeBlock ||= this.controller.root.activeBlock as EditableBlock
    if (!activeBlock) return
    const range = this.controller.selection.getCurrentCharacterRange()
    const commonAttrs = getCommonAttributesFromDelta(sliceDelta(activeBlock.getTextDelta(), range.start, range.end))
    console.log(commonAttrs)
    const activeFormat = Object.keys(commonAttrs).filter(key => key.startsWith('a:')).map(key => key.slice(2))
    const activeMark = {
      ...markMenu,
      activeColor: commonAttrs['s:c'] ?? null,
      activeBgColor: commonAttrs['s:bc'] ?? null
    }
    this._cpr.setInput('activeMenuSet', new Set(activeFormat))
    this._cpr.setInput('markMenu', activeMark)

    const rootElementRect = this.controller.rootElement.getBoundingClientRect()
    const {top, left, bottom, right, width} = rect
    const _top = top > window.innerHeight / 2 ? top - rootElementRect.top - 36 : bottom - rootElementRect.top + 4
    if (left - rootElementRect.left > rootElementRect.width / 2) {
      this._cpr.setInput('style', `top: ${_top}px; left: ${left - rootElementRect.left + width}px; transform: translateX(-100%);`)
    } else {
      this._cpr.setInput('style', `top: ${_top}px; left: ${left - rootElementRect.left}px;`)
    }
  }

  closeToolbar() {
    this._cpr?.destroy()
    this._cpr = undefined
    this._cprSub?.unsubscribe()
  }

  onLink() {
    const overlay = this.controller.injector.get(Overlay)
    const sel = this.controller.selection.getSelection()
    if (!sel || sel.isAtRoot) return
    const range = document.getSelection()!.getRangeAt(0)
    const rect = range.getBoundingClientRect()

    const bRange = sel.blockRange

    const virCursor = BlockFlowCursor.createVirtualRange(sel.blockId, bRange.start, bRange.end)
    const positionStrategy = overlay.position().global().top(rect.bottom + 'px').left(rect.left + 'px')
    const portal = new ComponentPortal(LinkInputPad)
    const ovr = overlay.create({
      positionStrategy,
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop',
    })

    const close = () => {
      ovr.dispose()
      virCursor.remove()
      this.controller.selection.setSelection(sel.blockId, sel.blockRange.start, sel.blockRange.end)
    }
    const cpr = ovr.attach(portal)
    merge(ovr.backdropClick(), cpr.instance.onCancel).pipe(takeUntilDestroyed(cpr.instance.destroyRef)).subscribe(close)
    cpr.instance.onConfirm.pipe(takeUntilDestroyed(cpr.instance.destroyRef)).subscribe((url: string) => {
      close()
      const deltas: DeltaOperation[] = []
      if (bRange.start > 0) {
        deltas.push({retain: bRange.start})
      }
      deltas.push({delete: bRange.end - bRange.start})
      deltas.push({
        insert: {link: range.toString()},
        attributes: {'d:href': url}
      })
      const bRef = this.controller.getBlockRef(sel.blockId) as EditableBlock
      bRef.applyDelta(deltas)
    })
  }

  destroy() {
    this.closeToolbar()
  }

}
