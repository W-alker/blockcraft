import {BindHotKey, BlockNodeType, DocPlugin, POSITION_MAP, UIEventStateContext} from "../../framework";
import {debounceTime, Subject, Subscription, takeUntil} from "rxjs";
import {ComponentRef, Type} from "@angular/core";
import {FloatTextToolbarComponent} from "./widgets/toolbar.component";
import {ConnectedPosition, OverlayRef} from "@angular/cdk/overlay";
import {ITextCommonAttrs, TextToolbarUtils} from "./utils";
import {CommentPad} from "./widgets/comment-pad";

export interface IToolbarConfig {
  withComment?: boolean
  commentComponent?: Type<CommentPad>
}
export class FloatTextToolbarPlugin extends DocPlugin {
  override name = "float-text-toolbar";
  override version = 1.0

  private _sub: Subscription = new Subscription()
  private toolbarOvr?: OverlayRef
  private _cpr?: ComponentRef<FloatTextToolbarComponent>
  private _closeCpr$ = new Subject()

  protected utils!: TextToolbarUtils
  private activeCommonAttrs: ITextCommonAttrs = {
    attrs: new Map(),
    colors: {},
    textAlign: undefined
  }

  constructor(
    private config: IToolbarConfig = {}
  ) {
    super();
  }

  init() {
    this.utils = new TextToolbarUtils(this.doc)

    this._sub = this.doc.selection.selectionChange$.pipe(debounceTime(500)).subscribe(sel => {
      if (this.doc.isReadonly || !sel || sel.collapsed || sel.isAllSelected || sel.isEmpty) return
      if (this.toolbarOvr) this.closeToolbar()
      // @ts-expect-error
      if (sel.firstBlock['plainTextOnly'] && sel.lastBlock['plainTextOnly']) return;
      this.openToolbar()
    })

    this.doc.subscribeReadonlyChange(() => {
      this.toolbarOvr && this.closeToolbar()
    })
  }

  openToolbar() {
    const sel = this.doc.selection.value!

    const {connectElement, connectPositions} = this._calcPosition(sel)

    const {componentRef, overlayRef} = this.doc.overlayService.createConnectedOverlay<FloatTextToolbarComponent>({
      target: connectElement,
      component: FloatTextToolbarComponent,
      positions: connectPositions,
    }, this._closeCpr$, () => {

    })
    this._cpr = componentRef
    this.toolbarOvr = overlayRef

    this.activeCommonAttrs = this.utils.getCurrentCommonAttrs(this.doc.selection.value!)
    this._cpr.setInput('doc', this.doc)
    this._cpr.setInput('config', this.config)
    this._cpr.setInput('utils', this.utils)
    this._cpr.setInput('activeAttrs', this.activeCommonAttrs.attrs)
    this._cpr.setInput('activeColors', this.activeCommonAttrs.colors)
    this._cpr.setInput('activeTextAlign', this.activeCommonAttrs.textAlign)

    this.doc.selection.nextChangeObserve().pipe(takeUntil(this._closeCpr$)).subscribe(() => {
      this.closeToolbar()
    })

  }

  private _calcPosition(selection: BlockCraft.Selection): {
    connectElement: HTMLElement,
    connectPositions: ConnectedPosition[]
  } {
    const isBackward = selection.getDirection() === 'backward'
    const relativeBlock = isBackward ? selection.lastBlock : selection.firstBlock

    const rect = selection.raw.getBoundingClientRect()
    const blockRect = relativeBlock.hostElement.getBoundingClientRect()
    const offsetX = rect.left - blockRect.left

    if (relativeBlock.nodeType !== BlockNodeType.editable) {
      return {
        connectElement: relativeBlock.hostElement,
        connectPositions: isBackward
          ? [{...POSITION_MAP['top-left'], offsetX},
            {...POSITION_MAP['top-right'], offsetX}]
          : [{...POSITION_MAP['bottom-left'], offsetY: 48,},
            {...POSITION_MAP['bottom-right'], offsetY: 48,}]
      }
    }

    const offsetY = isBackward ? rect.top - blockRect.top : rect.bottom - blockRect.bottom

    return {
      connectElement: relativeBlock.hostElement,
      connectPositions: isBackward ?
        [{...POSITION_MAP['top-left'], offsetY: -48 + offsetY, offsetX},
          {...POSITION_MAP['top-right'], offsetY: -48 + offsetY, offsetX}] :
        [{...POSITION_MAP['bottom-left'], offsetY: offsetY + 8, offsetX},
          {...POSITION_MAP['bottom-right'], offsetY: offsetY + 8, offsetX}]
    }
  }

  closeToolbar() {
    this._closeCpr$.next(true)
    this.toolbarOvr?.dispose()
  }

  @BindHotKey({key: 'b', shortKey: true})
  formatBold(ctx: UIEventStateContext) {
    return this.toggleFormatAttr(ctx, 'bold')
  }

  @BindHotKey({key: 'i', shortKey: true})
  formatItalic(ctx: UIEventStateContext) {
    return this.toggleFormatAttr(ctx, 'italic')
  }

  @BindHotKey({key: 'u', shortKey: true})
  formatUnderline(ctx: UIEventStateContext) {
    return this.toggleFormatAttr(ctx, 'underline')
  }

  @BindHotKey({key: 'd', shortKey: true})
  formatStrike(ctx: UIEventStateContext) {
    return this.toggleFormatAttr(ctx, 'strike')
  }

  toggleFormatAttr = (ctx: UIEventStateContext, attrName: string) => {
    ctx.preventDefault()
    const value = this.activeCommonAttrs.attrs.has(attrName)
    // @ts-ignore
    this.utils.formatText({[`a:${attrName}`]: value ? null : true})
    if (this._cpr) {
      value ? this.activeCommonAttrs.attrs.delete(attrName) : this.activeCommonAttrs.attrs.set(attrName, value)
      this._cpr.setInput('activeAttrs', new Set(this.activeCommonAttrs.attrs))
      this._cpr.changeDetectorRef.markForCheck()
    }
    return true
  }

  destroy() {
    this._sub?.unsubscribe()
  }
}

export * from './widgets/comment-pad'
