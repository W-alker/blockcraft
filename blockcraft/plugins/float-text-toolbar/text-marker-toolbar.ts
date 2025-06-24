import {BindHotKey, BlockNodeType, DocPlugin, POSITION_MAP, UIEventStateContext} from "../../framework";
import {debounceTime, Subject, Subscription, takeUntil} from "rxjs";
import {ComponentRef, Type} from "@angular/core";
import {ConnectedPosition, OverlayRef} from "@angular/cdk/overlay";
import {ITextCommonAttrs, TextToolbarUtils} from "./utils";
import {TextMarkerComponent} from "./widgets/marker.component";

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
    protected readonly markTextBlockFlavours: BlockCraft.BlockFlavour[]
  ) {
    super();
  }

  init() {
    this.utils = new TextToolbarUtils(this.doc)

    this._sub = this.doc.selection.selectionChange$.pipe(debounceTime(500)).subscribe(sel => {
      if (this.doc.isReadonly || !sel || sel.collapsed || sel.isAllSelected || sel.isEmpty || this.doc.event.status.isSelecting || !sel.isInSameBlock) {
        if (this.toolbarOvr) this.closeToolbar()
        return;
      }
      if (!this.markTextBlockFlavours.includes(sel.firstBlock.flavour)) return;
      this.openToolbar()
    })

    this.doc.subscribeReadonlyChange(() => {
      this.toolbarOvr && this.closeToolbar()
    })
  }

  openToolbar() {
    const sel = this.doc.selection.value!

    const {connectElement, connectPositions} = this._calcPosition(sel)

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

  destroy() {
    this._sub?.unsubscribe()
  }
}
