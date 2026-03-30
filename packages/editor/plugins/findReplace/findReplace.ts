import {BindHotKey, DocPlugin, UIEventStateContext} from "../../framework";
import {FindReplaceDialog} from "./widgets/find-replace-dialog";
import {Subject, takeUntil} from "rxjs";
import {OverlayRef} from "@angular/cdk/overlay";
import {FindReplaceHelper} from "./find-replace.helper";

export class FindReplacePlugin extends DocPlugin {
  override name = "findReplace";

  /** Public helper — consumers can use this to drive find/replace without UI. */
  helper!: FindReplaceHelper

  private _overlayRef: OverlayRef | null = null
  private _closeDialog$ = new Subject()

  init() {
    this.helper = new FindReplaceHelper(this.doc)
    this.helper.listen()
  }

  @BindHotKey({key: 'f', shortKey: true}, {flavour: "root"})
  startFind(ctx: UIEventStateContext) {
    const evt = ctx.getDefaultEvent()
    evt.preventDefault()
    evt.stopPropagation()
    if (this._overlayRef) return

    const {componentRef: cpr, overlayRef} = this.doc.overlayService.createGlobalOverlay<FindReplaceDialog>({
      component: FindReplaceDialog,
      top: '8px',
      end: '8px',
    }, this._closeDialog$, () => {
      this._overlayRef = null
    })

    cpr.setInput('doc', this.doc)
    cpr.instance.onClose.pipe(takeUntil((this._closeDialog$))).subscribe(() => {
      this._closeDialog$.next(true)
    })

    this._overlayRef = overlayRef
  }

  destroy() {
    this.helper.destroy()
  }
}
