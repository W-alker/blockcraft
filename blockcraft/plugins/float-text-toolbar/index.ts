import {DocPlugin} from "../../framework";
import {debounceTime, fromEvent, Subscription, takeUntil} from "rxjs";
import {ComponentRef} from "@angular/core";
import {FloatTextToolbarComponent} from "./toolbar.component";
import {ComponentPortal} from "@angular/cdk/portal";
import {POSITION_MAP} from "../../components";
import {Overlay, OverlayRef} from "@angular/cdk/overlay";

export class FloatTextToolbarPlugin extends DocPlugin {
  override name = "float-text-toolbar";
  override version = 1.0

  private _sub: Subscription = new Subscription()
  private toolbarOvr?: OverlayRef
  private _cpr?: ComponentRef<FloatTextToolbarComponent>
  private _cprSub?: Subscription

  init() {
    // this._sub.add(fromEvent(this.doc.root.hostElement, 'selectstart').pipe(takeUntil(this.doc.root.onDestroy$))
    //   .subscribe(() => {
    //     this.closeToolbar()
    //
    //     fromEvent(document, 'mouseup').pipe(take(1)).subscribe(() => {
    //       const sel = this.doc.selection.value
    //       if (sel && !sel.collapsed) this.openToolbar()
    //
    //
    //     })
    //   }))

    this._sub = this.doc.selection.selectionChange$.pipe(debounceTime(500)).subscribe(sel => {
      if (this.toolbarOvr) this.closeToolbar()
      if (!sel || sel.collapsed || sel.isAllSelected) return

      this.openToolbar()
    })
  }

  openToolbar() {
    const sel = this.doc.selection.value!

    const overlay = this.doc.injector.get(Overlay)
    const portal = new ComponentPortal(FloatTextToolbarComponent)

    const {x, y} = this.calcOffset(sel)
    this.toolbarOvr = overlay.create({
      positionStrategy: overlay.position().flexibleConnectedTo(sel.firstBlock.hostElement).withPositions([
        {...POSITION_MAP['top-left'], offsetY: -48 + y, offsetX: x},
        {...POSITION_MAP['top-right'], offsetY: -48 + y},
        {...POSITION_MAP['bottom-left'], offsetY: 44, offsetX: x},
        {...POSITION_MAP['bottom-right'], offsetY: 44},
      ]),
      scrollStrategy: overlay.scrollStrategies.close(),
    })

    this._cpr = this.toolbarOvr.attach(portal)
    this._cpr.setInput('doc', this.doc)

    this.doc.selection.nextChangeObserve().pipe(takeUntil(this._cpr.instance.onDestroy)).subscribe(() => {
      this.closeToolbar()
    })

    fromEvent(this.doc.root.hostElement, 'scroll').pipe(takeUntil(this._cpr.instance.onDestroy))
      .subscribe(() => {
        if (this.toolbarOvr) {
          this.toolbarOvr.updatePosition()
          return
        }
      })
  }

  calcOffset(selection: BlockCraft.Selection) {
    const rect = selection.raw.getBoundingClientRect()
    const blockRect = selection.firstBlock.hostElement.getBoundingClientRect()
    // const rootElementRect = this.doc.root.hostElement.getBoundingClientRect()
    return {
      x: rect.left - blockRect.left,
      y: rect.top - blockRect.top
    }

    // const {top, left, bottom, right, width} = rect
    // const _top = top > window.innerHeight / 2 ? top - rootElementRect.top - 36 : bottom - rootElementRect.top + 4
    // if (left - rootElementRect.left > rootElementRect.width / 2) {
    //   return `top: ${_top}px; left: ${left - rootElementRect.left + width}px; `
    // }
  }

  moveToolbar() {
    if (!this._cpr) return
    const selection = this.doc.selection.value!
    const rect = selection.raw.getBoundingClientRect()
    // if (!activeBlock) return
    // const range = this.controller.selection.getCurrentCharacterRange()
    // const commonAttrs = getCommonAttributesFromDelta(sliceDelta(activeBlock.getTextDelta(), range.start, range.end))
    // console.log(commonAttrs)
    // const activeFormat = Object.keys(commonAttrs).filter(key => key.startsWith('a:')).map(key => key.slice(2))
    // const activeMark = {
    //   ...markMenu,
    //   activeColor: commonAttrs['s:c'] ?? null,
    //   activeBgColor: commonAttrs['s:bc'] ?? null
    // }
    // this._cpr.setInput('activeMenuSet', new Set(activeFormat))
    // this._cpr.setInput('markMenu', activeMark)

    const rootElementRect = this.doc.root.hostElement.getBoundingClientRect()
    const {top, left, bottom, right, width} = rect
    const _top = top > window.innerHeight / 2 ? top - rootElementRect.top - 36 : bottom - rootElementRect.top + 4
    if (left - rootElementRect.left > rootElementRect.width / 2) {
      this._cpr.setInput('style', `top: ${_top}px; left: ${left - rootElementRect.left + width}px; `)
    } else {
      this._cpr.setInput('style', `top: ${_top}px; left: ${left - rootElementRect.left}px;`)
    }
  }

  closeToolbar() {
    this._cpr?.destroy()
    this._cpr = undefined
    this._cprSub?.unsubscribe()
  }

  destroy() {
    this._sub?.unsubscribe()
  }
}
