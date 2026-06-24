import {BindHotKey, BlockNodeType, DocPlugin, EventListen, UIEventStateContext} from "../../framework";
import {debounceTime, Subject, Subscription, takeUntil} from "rxjs";
import {ComponentRef, Type} from "@angular/core";
import {FloatTextToolbarComponent, IToolbarMenuItem} from "./widgets/toolbar.component";
import {ConnectedPosition, OverlayRef} from "@angular/cdk/overlay";
import {ITextCommonAttrs, TextToolbarUtils} from "./utils";
import {debounce} from "../../global";
import {BcFloatToolbarItemComponent} from "../../components";
import {calcFloatToolbarPosition} from "./toolbar-position";

export interface FloatTextToolbarPluginOptions {
  /**
   * 追加到工具栏末尾的自定义按钮
   */
  extraItems?: IToolbarMenuItem[]

  /**
   * 自定义按钮点击回调。返回 true 表示已处理。
   */
  onExtraItemClick?: (item: BcFloatToolbarItemComponent, doc: BlockCraft.Doc) => boolean
}

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

  constructor(private options?: FloatTextToolbarPluginOptions) {
    super();
  }

  init() {
    this.utils = new TextToolbarUtils(this.doc);

    this.doc.subscribeReadonlyChange(() => {
      this.toolbarOvr && this.closeToolbar();
    });

    this.doc.selection.changeObserve().subscribe(debounce(sel => {
      if (this.doc.isReadonly || !sel || sel.collapsed || sel.isAllSelected || sel.isEmpty) return;
      if (this.toolbarOvr) this.closeToolbar();
      if (sel.firstBlock['plainTextOnly'] && sel.lastBlock['plainTextOnly']) return;
      this.openToolbar();
    }, 350));

    // Close the toolbar whenever an internal block drag starts. During drag the
    // framework suppresses selection recalculation (see
    // DocInternalDragController.setSuppressRecalculate), so selectionChange$ no
    // longer fires while pointer is held — without this hook the toolbar would
    // linger over the drag ghost.
    this.doc.dragController.state$
      .pipe(takeUntil(this.doc.onDestroy$))
      .subscribe(state => {
        if (state !== 'idle' && this.toolbarOvr) this.closeToolbar();
      });
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

    if (this.options?.extraItems?.length) {
      const visibleExtras = this.options.extraItems.filter(
        item => !item.visible || item.visible(sel)
      );
      if (visibleExtras.length) {
        this._cpr.setInput('extraItems', visibleExtras);
      }
    }

    if (this.options?.onExtraItemClick) {
      const handler = this.options.onExtraItemClick;
      this._cpr.instance.onExtraItemClick.pipe(takeUntil(this._closeCpr$)).subscribe(item => {
        handler(item, this.doc);
      });
    }

    this.doc.selection.nextChangeObserve().pipe(takeUntil(this._closeCpr$)).subscribe(() => {
      this.closeToolbar();
    });
  }

  private _calcPosition(selection: BlockCraft.Selection): {
    connectElement: HTMLElement,
    connectPositions: ConnectedPosition[]
  } {
    return calcFloatToolbarPosition(this.doc, selection);
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
    // 插件销毁（含文档销毁/远端删块导致选区清空连锁）时必须同时关闭 overlay，
    // 否则 CDK overlay 残留在 body 下继续监听 scroll/resize，造成内存泄漏。
    // 对齐 ImgToolbar 的正确实现。
    this.closeToolbar();
    this._sub?.unsubscribe();
  }
}

export * from './widgets/comment-pad'
