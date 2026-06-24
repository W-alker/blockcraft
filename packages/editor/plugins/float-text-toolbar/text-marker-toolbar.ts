import {DocPlugin} from "../../framework";
import {Subject, Subscription} from "rxjs";
import {ComponentRef} from "@angular/core";
import {OverlayRef} from "@angular/cdk/overlay";
import {ITextCommonAttrs, TextToolbarUtils} from "./utils";
import {TextMarkerComponent} from "./widgets/marker.component";
import {calcFloatToolbarPosition} from "./toolbar-position";

export class TextMarkerPlugin extends DocPlugin {
  override name = "text-marker-toolbar";
  override version = 1.0

  private _sub: Subscription = new Subscription()
  private toolbarOvr?: OverlayRef
  private _cpr?: ComponentRef<TextMarkerComponent>
  private _closeCpr$ = new Subject()

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

  init() {
    this.utils = new TextToolbarUtils(this.doc)

    this.markTextBlockFlavours.forEach(flavour => {
      this.doc.event.add('selectEnd', this.onSelectEnd, {flavour})
    })
    this.colorOnlyFlavours.forEach(flavour => {
      // 同一 flavour 若也在 markTextBlockFlavours 里则跳过，避免重复注册 selectEnd 导致开两个 overlay。
      if (this.markTextBlockFlavours.includes(flavour)) return
      this.doc.event.add('selectEnd', this.onSelectEnd, {flavour})
    })

    this.doc.subscribeReadonlyChange(() => {
      this.toolbarOvr && this.closeToolbar()
    })
  }

  onSelectEnd = () => {
    const sel = this.doc.selection.value!
    if (this.doc.isReadonly || !sel || sel.collapsed || sel.isAllSelected || sel.isEmpty  || !sel.isInSameBlock
      // || this.doc.event.status.isSelecting
    ) {
      if (this.toolbarOvr) this.closeToolbar()
      return;
    }
    // if (!this.markTextBlockFlavours.includes(sel.firstBlock.flavour)) return;
    this.openToolbar()
  }

  openToolbar() {
    const sel = this.doc.selection.value!

    const {connectElement, connectPositions} = calcFloatToolbarPosition(this.doc, sel)

    const {componentRef, overlayRef} = this.doc.overlayService.createConnectedOverlay<TextMarkerComponent>({
      target: connectElement,
      component: TextMarkerComponent,
      positions: connectPositions,
      backdrop: true
    }, this._closeCpr$)
    this._cpr = componentRef
    this.toolbarOvr = overlayRef

    this.activeCommonAttrs = this.utils.getCurrentCommonAttrs(this.doc.selection.value!)
    this._cpr.setInput('doc', this.doc)
    this._cpr.setInput('utils', this.utils)
    this._cpr.setInput('activeAttrs', this.activeCommonAttrs.attrs)
    this._cpr.setInput('activeColors', this.activeCommonAttrs.colors)
    this._cpr.setInput('colorOnly', this.colorOnlyFlavours.includes(sel.firstBlock.flavour))

    // 不订阅 nextChangeObserve 关闭：本工具栏带 backdrop，点击外部由 backdropClick 关闭即可。
    // formatText 染色会塌缩+恢复选区（触发一次 selectionchange），若在此关闭会导致染色后
    // 工具栏消失且不再出现（本插件按 selectEnd 开启，不像 rich-toolbar 那样会自动重开）。
  }

  closeToolbar() {
    this._closeCpr$.next(true)
    this.toolbarOvr?.dispose()
  }

  destroy() {
    // 插件销毁时必须同时关闭 overlay，否则 CDK overlay 残留泄漏。对齐 ImgToolbar。
    this.closeToolbar()
    this._sub?.unsubscribe()
  }
}
