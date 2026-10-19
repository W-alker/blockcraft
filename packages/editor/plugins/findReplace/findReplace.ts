import {BindHotKey, DocPlugin, UIEventStateContext} from "../../framework";
import {FindReplaceDialog} from "./widgets/find-replace-dialog";
import {Subject, takeUntil} from "rxjs";
import {OverlayRef} from "@angular/cdk/overlay";
import {FindReplaceHelper} from "./find-replace.helper";

export interface FindReplacePluginOptions {
  /**
   * Whether Cmd/Ctrl+F opens BlockCraft's bundled dialog.
   *
   * Disable this when a host provides its own presentation layer and drives
   * the public {@link FindReplaceHelper} exposed by this plugin.
   */
  defaultDialog?: boolean
}

export class FindReplacePlugin extends DocPlugin {
  override name = "findReplace";

  /** Public helper — consumers can use this to drive find/replace without UI. */
  helper!: FindReplaceHelper

  private _overlayRef: OverlayRef | null = null
  private _closeDialog$ = new Subject()

  constructor(private readonly options: FindReplacePluginOptions = {}) {
    super()
  }

  init() {
    this.helper = new FindReplaceHelper(this.doc)
    this.helper.listen()
  }

  @BindHotKey({key: 'f', shortKey: true}, {flavour: "root"})
  startFind(ctx: UIEventStateContext) {
    if (this.options.defaultDialog === false) return false
    const evt = ctx.getDefaultEvent()
    evt.preventDefault()
    evt.stopPropagation()
    if (this._overlayRef) return true

    const {componentRef: cpr, overlayRef} = this.doc.overlayService.createGlobalOverlay<FindReplaceDialog>({
      component: FindReplaceDialog,
      top: '8px',
      end: '8px',
    }, this._closeDialog$, () => {
      this._overlayRef = null
    })

    cpr.setInput('doc', this.doc)
    cpr.setInput('helper', this.helper)
    cpr.instance.onClose.pipe(takeUntil((this._closeDialog$))).subscribe(() => {
      this._closeDialog$.next(true)
    })

    this._overlayRef = overlayRef
    return true
  }

  destroy() {
    this._closeDialog$.next(true)
    this.helper.destroy()
  }
}
