import {TEXT_MARKER_INTERACTION} from './interaction-config'
export {TEXT_MARKER_INTERACTION} from './interaction-config'
import {DocPlugin, type EditableBlockComponent} from "../../framework";
import {debounceTime, fromEvent, Subject, Subscription, take, takeUntil} from "rxjs";
import {ComponentRef} from "@angular/core";
import {OverlayRef} from "@angular/cdk/overlay";
import {ITextCommonAttrs, TextToolbarUtils} from "./utils";
import {TextMarkerComponent} from "./widgets/marker.component";
import {calcFloatToolbarPosition} from "./toolbar-position";
import {isFloatTextToolbarSelection} from "./selection";
import {isSelectionAlive} from "../../framework/modules/selection/liveness";
import {isExternalModalOpen} from "./external-modal";

export class TextMarkerPlugin extends DocPlugin {
  override readonly interactionConfigs = [TEXT_MARKER_INTERACTION]
  override name = "text-marker-toolbar";
  override version = 1.0

  private _sub: Subscription = new Subscription()
  private toolbarOvr?: OverlayRef
  private _cpr?: ComponentRef<TextMarkerComponent>
  private _closeCpr$?: Subject<void>
  private _toolbarRange?: {blockId: string; start: number; end: number}
  private _destroyed = false

  protected utils!: TextToolbarUtils
  private activeCommonAttrs: ITextCommonAttrs = {
    attrs: new Map(),
    colors: {},
    props: {}
  }

  constructor(
    protected readonly markTextBlockFlavours: BlockCraft.BlockFlavour[],
    // 仅颜色工具栏的 flavour（如 'code'）：选区会弹出工具栏但只显示调色板，
    // 隐藏加粗/斜体/下划线/删除线。与 markTextBlockFlavours 互斥，重复项会被忽略。
    protected readonly colorOnlyFlavours: BlockCraft.BlockFlavour[] = []
  ) {
    super();
  }

  private _isSelectionReadonly(selection: BlockCraft.Selection) {
    return this.doc.readonlyManager?.isSelectionReadonly(selection) ?? this.doc.isReadonly
  }

  init() {
    this.utils = new TextToolbarUtils(this.doc)
    this._sub.add(this.doc.interaction?.policyChanges$.subscribe(() => {
      if (this.doc.interaction.get(TEXT_MARKER_INTERACTION).enabled === false) this.closeToolbar()
    }))

    this._sub.add(fromEvent(this.doc.scrollContainer?.ownerDocument ?? document, 'focusin').subscribe(() => {
      if (this.toolbarOvr && isExternalModalOpen(this.doc)) this.closeToolbar()
    }))

    new Set([...this.markTextBlockFlavours, ...this.colorOnlyFlavours]).forEach(flavour => {
      this._sub.add(this.doc.event.add('selectEnd', this.onSelectEnd, {flavour}))
      // Scoped handlers run before InputTransformer's global composition owner.
      // Dismiss presentation only; the existing session still owns all IME input.
      this._sub.add(this.doc.event.add('compositionStart', () => this.closeToolbar(), {flavour}))
    })

    this._sub.add(
      this.doc.subscribeReadonlyChange(() => {
        this.toolbarOvr && this.closeToolbar()
      })
    )

    const stateChange$ = this.doc.readonlyManager?.stateChange$
    if (stateChange$) {
      this._sub.add(stateChange$.subscribe(() => {
        const selection = this.doc.selection.value
        if (selection && this._isSelectionReadonly(selection) && this.toolbarOvr) {
          this.closeToolbar()
        }
      }))
    }
  }

  onSelectEnd = () => {
    this.openToolbar()
  }

  private _canShow(selection: BlockCraft.Selection | null): selection is BlockCraft.Selection {
    if (this.doc.interaction?.get(TEXT_MARKER_INTERACTION).enabled === false || this._destroyed || this.doc.isReadonly || isExternalModalOpen(this.doc) ||
      !isFloatTextToolbarSelection(selection) || !selection.isInSameBlock ||
      !isSelectionAlive(selection, this.doc) || this._isSelectionReadonly(selection)) return false
    const session = this.doc.inputManger?.compositionSession
    return !this.doc.event?.status?.isComposing &&
      !(session?.activeBlockId === selection.firstBlock.id && !session.isIdle)
  }

  private _matchesRange(selection: BlockCraft.Selection): boolean {
    const range = this._toolbarRange
    return !!range && selection.start.type === 'text' && selection.end.type === 'text' &&
      selection.start.blockId === range.blockId && selection.end.blockId === range.blockId &&
      selection.start.offset === range.start && selection.end.offset === range.end
  }

  openToolbar() {
    const sel = this.doc.selection.value
    if (!this._canShow(sel)) {
      this.closeToolbar()
      return
    }
    // Native selectionchange and keyup can both finish the same selection.
    // Reuse its toolbar, including the restored range after a color operation.
    if (this.toolbarOvr?.hasAttached() && this._matchesRange(sel)) {
      this._updateToolbar(sel)
      return
    }
    this.closeToolbar()

    const position = calcFloatToolbarPosition(this.doc, sel)
    if (!position) return
    const {connectElement, connectPositions} = position

    const close$ = new Subject<void>()
    this._closeCpr$ = close$
    this._toolbarRange = {
      blockId: sel.firstBlock.id,
      start: sel.start.type === 'text' ? sel.start.offset : 0,
      end: sel.end.type === 'text' ? sel.end.offset : 0,
    }
    const {componentRef, overlayRef} = this.doc.overlayService.createConnectedOverlay<TextMarkerComponent>({
      target: connectElement,
      component: TextMarkerComponent,
      positions: connectPositions,
      backdrop: true
    }, close$, () => {
      // A backdrop, disconnected anchor or document teardown can close the
      // service-owned overlay without calling the plugin's explicit close.
      if (this._closeCpr$ !== close$) return
      this._closeCpr$ = undefined
      this._toolbarRange = undefined
      this.toolbarOvr = undefined
      this._cpr = undefined
    })
    if (this._closeCpr$ !== close$) return
    this._cpr = componentRef
    this.toolbarOvr = overlayRef
    this._updateToolbar(sel)

    overlayRef.detachments().pipe(take(1), takeUntil(close$)).subscribe(() => {
      if (this._closeCpr$ === close$) this.closeToolbar()
    })
    // A format transaction can clear and synchronously restore the same model
    // range. Inspect its settled value, rather than closing on that transient null.
    this.doc.selection.changeObserve().pipe(debounceTime(0), takeUntil(close$)).subscribe(() => {
      const current = this.doc.selection.value
      if (!this._canShow(current) || !this._matchesRange(current)) this.closeToolbar()
    })
    const block = sel.firstBlock as EditableBlockComponent
    block.onTextChange?.pipe(takeUntil(close$)).subscribe(event => {
      if (event.op.some(op => op.insert != null || op.delete != null)) this.closeToolbar()
    })
  }

  private _updateToolbar(selection: BlockCraft.Selection): void {
    if (!this._cpr) return
    this.activeCommonAttrs = this.utils.getCurrentCommonAttrs(selection)
    this._cpr.setInput('doc', this.doc)
    this._cpr.setInput('utils', this.utils)
    this._cpr.setInput('activeAttrs', this.activeCommonAttrs.attrs)
    this._cpr.setInput('activeColors', this.activeCommonAttrs.colors)
    this._cpr.setInput('colorOnly', this.colorOnlyFlavours.includes(selection.firstBlock.flavour))
  }

  closeToolbar() {
    const close$ = this._closeCpr$
    const overlay = this.toolbarOvr
    this._closeCpr$ = undefined
    this._toolbarRange = undefined
    this.toolbarOvr = undefined
    this._cpr = undefined
    if (close$) {
      close$.next()
      close$.complete()
    } else {
      overlay?.dispose()
    }
  }

  destroy() {
    this._destroyed = true
    // 插件销毁时必须同时关闭 overlay，否则 CDK overlay 残留泄漏。对齐 ImgToolbar。
    this.closeToolbar()
    this._sub?.unsubscribe()
  }
}
