import {BindHotKey, BlockNodeType, DocPlugin, EventListen, POSITION_MAP, UIEventStateContext} from "../../framework";
import {debounceTime, Subject, Subscription, takeUntil} from "rxjs";
import {ComponentRef, Type} from "@angular/core";
import {FloatTextToolbarComponent} from "./widgets/toolbar.component";
import {ConnectedPosition, OverlayRef} from "@angular/cdk/overlay";
import {ITextCommonAttrs, TextToolbarUtils} from "./utils";
import {debounce} from "../../global";

export class FloatTextToolbarPlugin extends DocPlugin {
  override name = 'float-text-toolbar';
  override version = 1.0;

  private _sub: Subscription = new Subscription();
  private toolbarOvr?: OverlayRef;
  private _cpr?: ComponentRef<FloatTextToolbarComponent>;
  private _closeCpr$ = new Subject();

  protected utils!: TextToolbarUtils;
  private activeCommonAttrs: ITextCommonAttrs = {
    attrs: new Map(),
    colors: {},
    props: {}
  };

  constructor() {
    super();
  }

  init() {
    this.utils = new TextToolbarUtils(this.doc);

    this.doc.subscribeReadonlyChange(() => {
      this.toolbarOvr && this.closeToolbar();
    });

    this.doc.selection.changeObserve().subscribe(debounce(sel => {
      if (this.doc.isReadonly || !sel || sel.kind === 'block' || sel.kind === 'table' || sel.collapsed || sel.isAllSelected || sel.isEmpty) return;
      if (this.toolbarOvr) this.closeToolbar();
      if (sel.firstBlock['plainTextOnly'] && sel.lastBlock['plainTextOnly']) return;
      this.openToolbar();
    }, 350));
  }

  // @EventListen('selectEnd', { flavour: 'root' })
  // onSelectedEnd() {
  //     const sel = this.doc.selection.value!;
  //
  // }

  openToolbar() {
    const sel = this.doc.selection.value!;

    const { connectElement, connectPositions } = this._calcPosition(sel);

    const { componentRef, overlayRef } = this.doc.overlayService.createConnectedOverlay<FloatTextToolbarComponent>({
      target: connectElement,
      component: FloatTextToolbarComponent,
      positions: connectPositions
    }, this._closeCpr$);
    this._cpr = componentRef;
    this.toolbarOvr = overlayRef;

    this.activeCommonAttrs = this.utils.getCurrentCommonAttrs(this.doc.selection.value!);
    this._cpr.setInput('doc', this.doc);
    this._cpr.setInput('utils', this.utils);
    this._cpr.setInput('activeAttrs', this.activeCommonAttrs.attrs);
    this._cpr.setInput('activeColors', this.activeCommonAttrs.colors);
    this._cpr.setInput('activeProps', this.activeCommonAttrs.props);
    this._cpr.setInput('activeFlavour', this.activeCommonAttrs.flavour);

    this.doc.selection.nextChangeObserve().pipe(takeUntil(this._closeCpr$)).subscribe(() => {
      this.closeToolbar();
    });
  }

  private _calcPosition(selection: BlockCraft.Selection): {
    connectElement: HTMLElement,
    connectPositions: ConnectedPosition[]
  } {
    // 光标是向前还是向后
    const isForward = selection.getDirection() === 'forward';
    const relativeBlock = isForward ? selection.lastBlock : selection.firstBlock;

    let rect: DOMRect
    if(relativeBlock.nodeType !== 'editable') {
      rect = relativeBlock.hostElement.getBoundingClientRect();
    } else {
      const selRect = selection.raw.getClientRects();
      rect = selection.kind === 'text' && selection.isInSameBlock ? selRect[0] : (isForward ? selRect[selRect.length - 1] : selRect[0]);
    }
    const blockRect = relativeBlock.hostElement.getBoundingClientRect();

    let relativeXPos = 'left';
    let offsetX = 0;
    if (rect.left + 420 > document.body.offsetWidth - 80) {
      relativeXPos = 'right';
      offsetX = rect.right - blockRect.right - 420;
    } else {
      offsetX = rect.left - blockRect.left
    }

    let relativeYPos = 'top';
    let offsetY = 0;
    if (((selection.kind !== 'text' || !selection.isInSameBlock) && isForward)
      ? rect.bottom + 48 < this.doc.scrollContainer!.getBoundingClientRect().bottom
      : rect.top - 48 < this.doc.scrollContainer!.getBoundingClientRect().top) {
      relativeYPos = 'bottom';
      offsetY = 8 + rect.bottom - blockRect.bottom;
    } else {
      offsetY = -48 + rect.top - blockRect.top;
    }

    return {
      connectElement: relativeBlock.hostElement,
      connectPositions:
      // @ts-ignore
        [{ ...POSITION_MAP[relativeYPos + '-' + relativeXPos], offsetX: offsetX, offsetY: offsetY }]
    };
  }

  closeToolbar() {
    this._closeCpr$.next(true);
    this.toolbarOvr?.dispose();
  }

  @BindHotKey({ key: 'b', shortKey: true })
  formatBold(ctx: UIEventStateContext) {
    return this.toggleFormatAttr(ctx, 'bold');
  }

  @BindHotKey({ key: 'i', shortKey: true })
  formatItalic(ctx: UIEventStateContext) {
    return this.toggleFormatAttr(ctx, 'italic');
  }

  @BindHotKey({ key: 'u', shortKey: true })
  formatUnderline(ctx: UIEventStateContext) {
    return this.toggleFormatAttr(ctx, 'underline');
  }

  @BindHotKey({ key: 'd', shortKey: true })
  formatStrike(ctx: UIEventStateContext) {
    return this.toggleFormatAttr(ctx, 'strike');
  }

  @BindHotKey({ key: 'e', shortKey: true })
  formatCode(ctx: UIEventStateContext) {
    return this.toggleFormatAttr(ctx, 'code');
  }

  toggleFormatAttr = (ctx: UIEventStateContext, attrName: string) => {
    ctx.preventDefault();
    const value = this.activeCommonAttrs.attrs.has(attrName);
    // @ts-ignore
    this.utils.formatText({ [`a:${attrName}`]: value ? null : true });
    if (this._cpr) {
      value ? this.activeCommonAttrs.attrs.delete(attrName) : this.activeCommonAttrs.attrs.set(attrName, value);
      this._cpr.setInput('activeAttrs', this.activeCommonAttrs.attrs);
      this._cpr.changeDetectorRef.markForCheck();
    }
    return true;
  };

  destroy() {
    this._sub?.unsubscribe();
  }
}

export * from './widgets/comment-pad'
