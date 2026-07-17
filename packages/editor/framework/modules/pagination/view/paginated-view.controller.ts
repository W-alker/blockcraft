// packages/editor/framework/modules/pagination/view/paginated-view.controller.ts
import {animationFrameScheduler, Subscription} from "rxjs";
import {throttleTime} from "rxjs/operators";
import {performanceTest} from "../../../../global";
import {paginate, PaginationItem} from "../engine";
import {PaginationConfig, ResolvedPaginationGeometry} from "../pagination.types";
import {resolveScreenGeometry} from "./pagination-geometry";
import {computeBackdropHeight, computeBlockGaps, computeSheetRects} from "./sheet-layout";
import {buildPaginationItems} from "./item-builder";
import {LiveHeightSource} from "./live-height-source";
import {PageFrameLayer} from "./page-frame-layer";
import {GapApplier} from "./gap-applier";
import {TableBreakApplier} from "./table-break-applier";
import {HeightLockApplier} from "./height-lock-applier";
import {createStablePaginationLayout, StablePaginationLayout} from "./stable-pagination-layout";

export class PaginatedViewController {
  private _config: PaginationConfig;
  private _geom: ResolvedPaginationGeometry;
  private _heightSource: LiveHeightSource;
  private _frameLayer: PageFrameLayer;
  private _gapApplier: GapApplier;
  private _tableBreaks: TableBreakApplier;
  private _heightLockApplier: HeightLockApplier;
  private _subs = new Subscription();
  private _containerRO: ResizeObserver | null = null;
  private _rafId = 0;
  private _enabled = false;
  private _layoutRevision = 0;
  private _stableLayout: StablePaginationLayout | null = null;

  constructor(
    private doc: BlockCraft.Doc,
    config: PaginationConfig,
    private scrollContainer: HTMLElement,
  ) {
    this._config = config;
    this._geom = resolveScreenGeometry(config);
    this._heightSource = new LiveHeightSource(doc);
    this._frameLayer = new PageFrameLayer(scrollContainer);
    this._gapApplier = new GapApplier(doc);
    this._tableBreaks = new TableBreakApplier(doc);
    this._heightLockApplier = new HeightLockApplier(doc);
  }

  /** 当前配置（含未显式传入的字段为 undefined，几何默认值见 resolveScreenGeometry）。 */
  get config(): PaginationConfig {
    return this._config;
  }

  /**
   * 运行时改配置（换纸张/方向/边距/纸间距/页眉页脚）。合并后重算几何、重排版式。
   * margins / header / footer 为浅合并：传入对象整体替换该字段。
   */
  updateConfig(partial: Partial<PaginationConfig>): void {
    this._config = {
      ...this._config,
      ...partial,
      margins: partial.margins
        ? {...this._config.margins, ...partial.margins}
        : this._config.margins,
    };
    this._geom = resolveScreenGeometry(this._config);
    if (this._enabled) {
      this._applyContainerStyles();
      this.scheduleRecompute();
    }
  }

  enable(): void {
    if (this._enabled) return;
    this._enabled = true;

    this.doc.ngZone.runOutsideAngular(() => {
      this._applyContainerStyles();
      this._frameLayer.mount();
      this._heightSource.syncObserved();

      this._subs.add(
        this._heightSource.resize$
          .pipe(throttleTime(0, animationFrameScheduler, {leading: false, trailing: true}))
          .subscribe(() => this.scheduleRecompute()),
      );
      this._subs.add(
        this.doc.onChildrenUpdate$.subscribe(() => {
          this._heightSource.syncObserved();
          this.scheduleRecompute();
        }),
      );
      // 属性变更也要重排：合并/取消合并单元格（rowspan/display）、列宽、对齐等只改 props，
      // **不触发 onChildrenUpdate$**，且空单元格合并不改行高（ResizeObserver 也不响应）→ 不重算 → 视图卡在旧分页
      //（用户实测：刚合并跨页空单元格视图错位，选中表格触发别的重排后才正确）。订阅 onPropsUpdate$ 补上。
      // scheduleRecompute 走 rAF 合并，一帧内多次 props 变更只重算一次；打字走 onTextUpdate$、不在此列。
      this._subs.add(
        this.doc.onPropsUpdate$.subscribe(() => this.scheduleRecompute()),
      );
      this._containerRO = new ResizeObserver(() => this.scheduleRecompute());
      this._containerRO.observe(this.scrollContainer);

      this.scheduleRecompute();
    });
  }

  /**
   * 用当前 live 测量同步算出分页 items（与屏幕展示同源、不产生副作用）。
   * 供打印复用 → 打印断点 == 屏幕所见（含 embed/媒体块按 live 高度定断点）。
   */
  computePrintItems(): PaginationItem[] {
    const metas = this._heightSource.measure({
      contentHeight: this._geom.geometry.contentHeight,
      widowOrphanLines: this._config.widowOrphanLines ?? 2,
    });
    return buildPaginationItems(metas);
  }

  /**
   * 同步刷新并捕获当前分页视图使用的纯布局数据。调用返回前不会让出事件循环，
   * 调用方可紧接着读取 snapshot，使布局与文档内容属于同一个主线程版本。
   */
  captureStableLayout(): StablePaginationLayout | null {
    if (!this._enabled) return null;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = 0;
    return this._recompute();
  }

  scheduleRecompute(): void {
    if (!this._enabled) return;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = requestAnimationFrame(() => {
      this._rafId = 0;
      this._recompute();
    });
  }

  @performanceTest('pagination view recompute', 16)
  private _recompute(): StablePaginationLayout | null {
    if (!this._enabled) return null;
    // measure() 已忽略 margin-top（gap），无需先清空 gap——少一次「清空→强制回流→重设」的布局抖动，
    // 同时保留浏览器原生 overflow-anchor 对视口上方内容变化的滚动补偿（实测能稳住编辑滚动）。
    const metas = this._heightSource.measure({
      contentHeight: this._geom.geometry.contentHeight,
      widowOrphanLines: this._config.widowOrphanLines ?? 2,
    });
    const items = buildPaginationItems(metas);
    const result = paginate(items, this._geom.geometry);
    const layout = createStablePaginationLayout(
      ++this._layoutRevision,
      this._config,
      this._geom,
      items,
      result,
    );
    this._stableLayout = layout;

    const lockedIds = new Set<string>();
    for (const meta of metas) {
      if (meta.lockHeight != null && meta.lockHeight > 0) lockedIds.add(meta.id);
    }
    this._heightLockApplier.apply(lockedIds);

    const rects = computeSheetRects(result.pages.length, this._geom.sheetHeightPx, this._geom.pageGap);
    const totalHeight = computeBackdropHeight(result.pages.length, this._geom.sheetHeightPx, this._geom.pageGap);
    this._frameLayer.render({
      rects,
      sheetWidthPx: this._geom.sheetWidthPx,
      totalHeight,
      margins: this._geom.margins,
      headerHeight: this._geom.headerHeight,
      footerHeight: this._geom.footerHeight,
      header: this._config.header,
      footer: this._config.footer,
    });

    const gaps = computeBlockGaps(result, this._geom.sheetHeightPx, this._geom.pageGap);
    this._gapApplier.apply(gaps);

    // 表格按行跨页：把引擎拆分结果落成表格内的视图层页缝（占位行 + 行栏对齐）。
    this._tableBreaks.apply(metas, result, this._geom.sheetHeightPx, this._geom.pageGap);
    return layout;
  }

  private _applyContainerStyles(): void {
    const root = this.doc.root.hostElement;
    const {sheetWidthPx, margins, headerHeight, footerHeight} = this._geom;
    root.classList.add('bc-paginated');
    root.style.setProperty('--bc-page-width', `${sheetWidthPx}px`);
    root.style.setProperty('--bc-page-content-height', `${this._geom.geometry.contentHeight}px`);
    // 正文上下内边距要把页眉/页脚带也让出来，使首块落在「页边距 + 页眉」之下、
    // 与背景层里 header 之下的内容区顶对齐（contentHeight 已扣除页眉/页脚）。
    root.style.setProperty('--bc-page-margin-top', `${margins.top + headerHeight}px`);
    root.style.setProperty('--bc-page-margin-bottom', `${margins.bottom + footerHeight}px`);
    root.style.setProperty('--bc-page-margin-right', `${margins.right}px`);
    root.style.setProperty('--bc-page-margin-left', `${margins.left}px`);
    this.scrollContainer.classList.add('bc-paginated-scroll');
  }

  private _removeContainerStyles(): void {
    const root = this.doc.root.hostElement;
    root.classList.remove('bc-paginated');
    ['--bc-page-width', '--bc-page-content-height', '--bc-page-margin-top', '--bc-page-margin-right', '--bc-page-margin-bottom', '--bc-page-margin-left']
      .forEach(p => root.style.removeProperty(p));
    this.scrollContainer.classList.remove('bc-paginated-scroll');
  }

  disable(): void {
    if (!this._enabled) return;
    this._enabled = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = 0;
    this._subs.unsubscribe();
    this._subs = new Subscription();
    this._containerRO?.disconnect();
    this._containerRO = null;
    this._gapApplier.clear();
    this._tableBreaks.clear();
    this._heightLockApplier.clear();
    this._frameLayer.destroy();
    this._removeContainerStyles();
    this._stableLayout = null;
  }

  destroy(): void {
    this.disable();
    this._heightSource.destroy();
    this._gapApplier.destroy();
    this._heightLockApplier.destroy();
  }
}
