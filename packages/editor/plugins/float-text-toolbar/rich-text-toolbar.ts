import {BindHotKey, DocPlugin, UIEventStateContext} from "../../framework";
import {debounceTime, fromEvent, Subject, Subscription, takeUntil} from "rxjs";
import {ComponentRef} from "@angular/core";
import {FloatTextToolbarComponent, IToolbarMenuItem} from "./widgets/toolbar.component";
import {ConnectedPosition, OverlayRef} from "@angular/cdk/overlay";
import {ITextCommonAttrs, TextToolbarUtils} from "./utils";
import {BcFloatToolbarItemComponent} from "../../components";
import {calcFloatToolbarPosition} from "./toolbar-position";
import {isFloatTextToolbarSelection} from "./selection";
import {isSelectionAlive} from "../../framework/modules/selection/liveness";
import {isExternalModalOpen} from "./external-modal";

export interface FloatTextToolbarPluginOptions {
  /** 只控制浮层，保留格式快捷键。默认开启。 */
  enabled?: boolean;
  /**
   * 追加到工具栏末尾的自定义按钮
   */
  extraItems?: IToolbarMenuItem[]

  /** 只读选区专用动作；默认不显示。仍受 enabled 控制，点击前重新检查 visible。 */
  readonlyExtraItems?: IToolbarMenuItem[]

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
  private enabled: boolean;
  private activeCommonAttrs: ITextCommonAttrs = {
    attrs: new Map(),
    colors: {},
    props: {}
  };

  constructor(private options?: FloatTextToolbarPluginOptions) {
    super();
    this.enabled = options?.enabled !== false;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.closeToolbar();
  }

  private _isSelectionReadonly(selection: BlockCraft.Selection) {
    return this.doc.isReadonly || (this.doc.readonlyManager?.isSelectionReadonly(selection) ?? false);
  }

  init() {
    this.utils = new TextToolbarUtils(this.doc);

    this._sub.add(fromEvent(this.doc.scrollContainer?.ownerDocument ?? document, 'focusin').subscribe(() => {
      if (this.toolbarOvr && isExternalModalOpen(this.doc)) this.closeToolbar();
    }));

    this._sub.add(
      this.doc.subscribeReadonlyChange(() => {
        this.toolbarOvr && this.closeToolbar();
      })
    );

    this._sub.add(
      this.doc.selection.changeObserve().pipe(debounceTime(350)).subscribe(() => {
        this.closeToolbar();
        this.openToolbar();
      })
    );

    const stateChange$ = this.doc.readonlyManager?.stateChange$;
    if (stateChange$) {
      this._sub.add(stateChange$.subscribe(() => {
        const selection = this.doc.selection.value;
        if (selection && this._isSelectionReadonly(selection) && this.toolbarOvr) {
          this.closeToolbar();
        }
      }));
    }

    // Close the toolbar whenever an internal block drag starts. During drag the
    // framework suppresses selection recalculation (see
    // DocInternalDragController.setSuppressRecalculate), so selectionChange$ no
    // longer fires while pointer is held — without this hook the toolbar would
    // linger over the drag ghost.
    this._sub.add(
      this.doc.dragController.state$
        .pipe(takeUntil(this.doc.onDestroy$))
        .subscribe(state => {
          if (state !== 'idle' && this.toolbarOvr) this.closeToolbar();
        })
    );
  }

  private visibleExtraItems(selection: BlockCraft.Selection, readonly: boolean): IToolbarMenuItem[] {
    const items = readonly ? this.options?.readonlyExtraItems : this.options?.extraItems;
    return (items ?? []).filter(item => !item.visible || item.visible(selection));
  }

  openToolbar() {
    if (!this.enabled || isExternalModalOpen(this.doc)) return;
    const sel = this.doc.selection.value;
    if (!isFloatTextToolbarSelection(sel) || !isSelectionAlive(sel as any, this.doc)) return;
    const readonly = this._isSelectionReadonly(sel);
    const visibleExtras = this.visibleExtraItems(sel, readonly);
    if (readonly && !visibleExtras.length) return;
    if (!readonly && (sel.firstBlock as any).plainTextOnly && (sel.lastBlock as any).plainTextOnly) return;

    const position = this._calcPosition(sel);
    if (!position) return;
    const { connectElement, connectPositions } = position;

    const { componentRef, overlayRef } = this.doc.overlayService.createConnectedOverlay<FloatTextToolbarComponent>({
      target: connectElement,
      component: FloatTextToolbarComponent,
      positions: connectPositions,
      allowReadonly: readonly
    }, this._closeCpr$);
    this._cpr = componentRef;
    this.toolbarOvr = overlayRef;

    this.activeCommonAttrs = readonly ? {attrs: new Map(), colors: {}, props: {}} : this.utils.getCurrentCommonAttrs(sel);
    this._cpr.setInput('doc', this.doc);
    this._cpr.setInput('readonly', readonly);
    this._cpr.setInput('utils', this.utils);
    this._cpr.setInput('activeAttrs', this.activeCommonAttrs.attrs);
    this._cpr.setInput('activeColors', this.activeCommonAttrs.colors);
    this._cpr.setInput('activeProps', this.activeCommonAttrs.props);
    this._cpr.setInput('activeFlavour', this.activeCommonAttrs.flavour);

    this._cpr.setInput('extraItems', visibleExtras);

    if (this.options?.onExtraItemClick) {
      const handler = this.options.onExtraItemClick;
      this._cpr.instance.onExtraItemClick.pipe(takeUntil(this._closeCpr$)).subscribe(item => {
        // 权限或锁状态可能在展示后变化；不允许旧按钮继续执行。
        const current = this.doc.selection.value;
        if (!isFloatTextToolbarSelection(current) || !isSelectionAlive(current, this.doc)
          || this._isSelectionReadonly(current) !== readonly
          || !this.visibleExtraItems(current, readonly).some(candidate => candidate.name === item.name && candidate.value === item.value)) {
          this.closeToolbar();
          return;
        }
        handler(item, this.doc);
        if (readonly) this.closeToolbar();
      });
    }

    if (readonly) {
      const ownerDocument = connectElement.ownerDocument;
      fromEvent<KeyboardEvent>(ownerDocument, 'keydown').pipe(takeUntil(this._closeCpr$)).subscribe(event => {
        if (event.key === 'Escape') this.closeToolbar();
      });
      fromEvent<PointerEvent>(ownerDocument, 'pointerdown', {capture: true}).pipe(takeUntil(this._closeCpr$)).subscribe(event => {
        if (!overlayRef.overlayElement.contains(event.target as Node)) this.closeToolbar();
      });
      if (ownerDocument.defaultView) fromEvent(ownerDocument.defaultView, 'blur')
        .pipe(takeUntil(this._closeCpr$)).subscribe(() => this.closeToolbar());
    }

    this.doc.selection.nextChangeObserve().pipe(takeUntil(this._closeCpr$)).subscribe(() => {
      this.closeToolbar();
    });
  }

  private _calcPosition(selection: BlockCraft.Selection): {
    connectElement: HTMLElement,
    connectPositions: ConnectedPosition[]
  } | null {
    return calcFloatToolbarPosition(this.doc, selection);
  }

  closeToolbar() {
    this._closeCpr$.next(true);
    this.toolbarOvr?.dispose();
    this.toolbarOvr = undefined;
    this._cpr = undefined;
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
    const selection = this.doc.selection.value;
    if (!selection || this._isSelectionReadonly(selection)) return true;
    // Keyboard actions must not depend on the debounced floating toolbar state.
    this.activeCommonAttrs = this.utils.getCurrentCommonAttrs(selection);
    const value = this.activeCommonAttrs.attrs.has(attrName);
    // @ts-ignore
    this.utils.formatText({ [`a:${attrName}`]: value ? null : true });
    if (this._cpr) {
      value ? this.activeCommonAttrs.attrs.delete(attrName) : this.activeCommonAttrs.attrs.set(attrName, true);
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
