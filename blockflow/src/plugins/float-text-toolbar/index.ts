import {Controller, IPlugin} from "@core";
import {filter, fromEvent, merge, throttleTime} from "rxjs";
import {ComponentRef, ViewContainerRef} from "@angular/core";
import {FloatTextToolbar} from "./widget/float-text-toolbar";

export class FloatTextToolbarPlugin implements IPlugin {
  name = "float-text-toolbar";
  version = 1.0;

  private _vcr!: ViewContainerRef
  private _cpr?: ComponentRef<FloatTextToolbar>

  constructor() {
  }

  init(controller: Controller) {
    this._vcr = controller.injector.get(ViewContainerRef)

    merge(
      fromEvent(controller.rootElement, 'mouseup').pipe(throttleTime(200)),
      // @ts-ignore
      fromEvent(controller.rootElement, 'keyup').pipe(filter((e: KeyboardEvent) => e.key === 'ArrowLeft' || e.key === 'ArrowRight'), throttleTime(300))
    )
      // @ts-ignore
      .subscribe((event: MouseEvent | KeyboardEvent) => {
        this._cpr && this.closeToolbar()
        const sel = window.getSelection()
        if (!sel || sel.isCollapsed) return
        const range = sel.getRangeAt(0)
        const rect = range.getBoundingClientRect()
        this.openToolbar(rect.bottom + 4, rect.left)

      })

  }

  openToolbar(top: number, left: number) {
    const cpr = this._vcr.createComponent(FloatTextToolbar)
    cpr.instance.top = top
    cpr.setInput('left', left)
    document.body.appendChild(cpr.location.nativeElement)
    this._cpr = cpr
  }

  closeToolbar() {
    this._cpr?.destroy()
    this._cpr = undefined
  }

  destroy() {

  }

}
