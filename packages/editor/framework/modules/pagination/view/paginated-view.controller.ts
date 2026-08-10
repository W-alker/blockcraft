// packages/editor/framework/modules/pagination/view/paginated-view.controller.ts
import {fromEvent, Subscription} from "rxjs";
import {performanceTest} from "../../../../global";
import {isNativeInputTarget} from "../../../utils";
import {paginate, PaginationItem} from "../engine";
import {cloneTableCellFlowPlan} from "../engine/table-cell-flow";
import {
  getTableCellFlowPlan,
  setTableCellFlowPlan,
} from "../engine/table-cell-flow-metadata";
import {
  PaginationLayoutCoordinator,
  PaginationLayoutState,
} from "../layout/pagination-layout-coordinator";
import {
  comparePaginationShadow,
  shadowMismatchSignature,
} from "../layout/pagination-shadow-comparator";
import {
  PaginationConfig,
  PaginationDocumentHeaderOptions,
  ResolvedPaginationGeometry,
} from "../pagination.types";
import {resolveScreenGeometry} from "./pagination-geometry";
import {computeBackdropHeight, computeBlockGaps, computeSheetRects} from "./sheet-layout";
import {BlockMeta, buildPaginationItems} from "./item-builder";
import {LiveHeightSource, type MeasureOptions} from "./live-height-source";
import {PageFrameLayer} from "./page-frame-layer";
import {GapApplier} from "./gap-applier";
import {TableBreakApplier} from "./table-break-applier";
import {HeightLockApplier} from "./height-lock-applier";
import {createStablePaginationLayout, StablePaginationLayout} from "./stable-pagination-layout";
import {registerRootLayoutProjection} from "../../virtualization/root-virtualization-manager";
import {DocumentHeaderLayer} from './document-header-layer';
import {InlineBreakApplier} from './inline-break-applier';
import {cloneInlinePaginationBreakPlan} from './inline-break-plan';

interface FontLoadingEventTarget {
  addEventListener(type: "loadingdone", listener: EventListener): void;
  removeEventListener(type: "loadingdone", listener: EventListener): void;
}

/** @internal Phase C rollout controls; PaginationPlugin owns the public flag. */
export interface PaginatedViewControllerOptions {
  readonly sparseView?: boolean;
  readonly onSparseViewFailure?: (error: unknown) => void;
  readonly documentHeader?: PaginationDocumentHeaderOptions;
}

export class PaginatedViewController {
  private _config: PaginationConfig;
  private _geom: ResolvedPaginationGeometry;
  private _heightSource: LiveHeightSource;
  private _frameLayer: PageFrameLayer;
  private _documentHeaderLayer: DocumentHeaderLayer | null = null;
  private _documentHeaderHeight = 0;
  private _gapApplier: GapApplier;
  private _tableBreaks: TableBreakApplier;
  private _inlineBreaks: InlineBreakApplier;
  private _heightLockApplier: HeightLockApplier;
  private _subs = new Subscription();
  private _containerRO: ResizeObserver | null = null;
  private _rafId = 0;
  private _pendingRecomputeKind: 'none' | 'mounted-measurement' | 'full' = 'none';
  private _compositionRecomputePending = false;
  private _sparseProjectionUpdateDeferred = false;
  private _enabled = false;
  private _destroyed = false;
  private _layoutRevision = 0;
  private _stableLayout: StablePaginationLayout | null = null;
  private _stableLayoutReusableForExport = false;
  private _shadowLayout: PaginationLayoutState | null = null;
  private _lastShadowMismatchSignature: string | null = null;
  private _lastShadowErrorSignature: string | null = null;
  private _fontEpoch = 0;
  private _theme: string;
  private _fontEventTarget: FontLoadingEventTarget | null = null;
  private _releaseLayoutProjection: (() => void) | null = null;
  private _sparseFailureCount = 0;
  private _inlineProjectionFailureCount = 0;
  private _pendingSparseContainerStyles = false;
  /** 上一轮会直接改变根块 border-box 的分页投影，用于覆盖本轮的移除操作。 */
  private _layoutOwnedRootIds = new Set<string>();
  private readonly _onFontsLoadingDone: EventListener = () => {
    if (!this._enabled) return;
    this._fontEpoch++;
    this._heightSource.invalidateNaturalMeasurements();
    this._runShadowMutation('font-context', () => this._syncMeasureContext());
    this.scheduleRecompute();
  };

  private readonly _layoutSurface: HTMLElement;

  constructor(
    private doc: BlockCraft.Doc,
    config: PaginationConfig,
    private scrollContainer: HTMLElement,
    private readonly layoutCoordinator = new PaginationLayoutCoordinator(doc),
    private readonly options: PaginatedViewControllerOptions = {},
  ) {
    this._config = config;
    this._geom = resolveScreenGeometry(config);
    this._theme = doc.theme;
    this._heightSource = new LiveHeightSource(doc);
    // 滚动视口可以是 root 外层的任意祖先（例如它还包含文档头）。
    // 页框必须和 root 共享定位面，否则两者会分别相对不同的坐标原点。
    this._layoutSurface = doc.root.hostElement.parentElement ?? scrollContainer;
    this._frameLayer = new PageFrameLayer(this._layoutSurface);
    if (options.documentHeader) {
      this._documentHeaderLayer = new DocumentHeaderLayer(
        this._layoutSurface,
        doc.root.hostElement,
        options.documentHeader,
        height => this._onDocumentHeaderHeightChange(height),
      );
    }
    this._gapApplier = new GapApplier(doc);
    this._tableBreaks = new TableBreakApplier(doc);
    this._inlineBreaks = new InlineBreakApplier(doc);
    this._heightLockApplier = new HeightLockApplier(doc);
  }

  /** 当前配置（含未显式传入的字段为 undefined，几何默认值见 resolveScreenGeometry）。 */
  get config(): PaginationConfig {
    return this._config;
  }

  /** @internal Export must fall back to readonly remeasurement when false. */
  get canReuseStableLayoutForExport(): boolean {
    return this._stableLayoutReusableForExport
      && !this._isCompositionInProgress();
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
    this._refreshGeometry();
    if (this._enabled) {
      this._layoutDocumentHeader();
      if (this.options.sparseView) {
        // Defer the CSS geometry mutation until after virtualization captures
        // the old-coordinate anchor from projection.willChange$.
        this._pendingSparseContainerStyles = true;
      } else {
        this._applyContainerStyles();
      }
      this._runShadowMutation('config-context', () => this._syncMeasureContext());
      this.scheduleRecompute();
    }
  }

  enable(): void {
    if (this._destroyed || this._enabled) return;
    this._enabled = true;

    this.doc.ngZone.runOutsideAngular(() => {
      this._mountDocumentHeader();
      if (!this.options.sparseView) {
        this._applyContainerStyles();
        this._frameLayer.mount();
      }
      this._syncMountedViews(this._mountedRootIds());
      this._theme = this.doc.theme;
      this._runShadowMutation('enable-context', () => {
        this.layoutCoordinator.syncRootOrder();
        this._syncMeasureContext();
      });
      this._addFontListener();

      this._subs.add(
        this._heightSource.resize$
          // scheduleRecompute 自身已经是 trailing rAF 合并器。这里再套一层
          // animationFrameScheduler 会把结构删除的直接调度和尺寸通知拆到相邻两帧，
          // 恰好造成跨页单元格删除后的二次重排与可见抖动。
          .subscribe(() => this.scheduleRecompute()),
      );
      const objectSizing = this.doc.objectSizing;
      if (objectSizing?.widthChange$) {
        this._subs.add(
          objectSizing.widthChange$.subscribe(() => {
            this._heightSource.invalidateNaturalMeasurements();
            this._runShadowMutation('object-sizing-change', () =>
              this.layoutCoordinator.refreshObjectSizingEstimates(),
            );
            this.scheduleRecompute();
          }),
        );
      }
      const layoutMetricsChange$ = this.doc.layoutMetrics?.change$;
      if (layoutMetricsChange$) {
        this._subs.add(
          layoutMetricsChange$.subscribe(() => {
            this._heightSource.invalidateNaturalMeasurements();
            this._runShadowMutation('layout-metrics-change', () =>
              this.layoutCoordinator.refreshObjectSizingEstimates(),
            );
            this.scheduleRecompute();
          }),
        );
      }
      this._subs.add(
        this.doc.model.contentChange$.subscribe(change => {
          this._heightSource.clearLayoutOwnedResize();
          this._inlineBreaks.invalidate(
            this._rootIdsForChangedBlocks(change.blockIds),
          );
          this._shadowLayout = null;
          this._runShadowMutation('content-change', () =>
            this.layoutCoordinator.applyContentChange(change),
          );
          // InlineRuntime 会在任意文本/格式 Delta 前撤销零模型长度分页页缝。
          // 即使新旧自然 border-box 等高，也必须在下一帧重放分页投影；不能只依赖
          // ResizeObserver。scheduleRecompute 自身会把同帧内容变化合并为一次。
          this.scheduleRecompute();
        }),
      );
      this._subs.add(
        this.doc.model.structureChange$.subscribe(change => {
          this._heightSource.clearLayoutOwnedResize();
          this._inlineBreaks.invalidate(
            change.affectedRootIds ?? this._mountedRootIds(),
          );
          this._runShadowMutation('structure-change', () =>
            this.layoutCoordinator.applyStructureChange(change),
          );
          this._syncMountedViews(this._mountedRootIds());
          this.scheduleRecompute();
        }),
      );
      this._subs.add(
        this.doc.themeChange$.subscribe(() => {
          this._theme = this.doc.theme;
          this._heightSource.invalidateNaturalMeasurements();
          this._runShadowMutation('theme-context', () => this._syncMeasureContext());
          this.scheduleRecompute();
        }),
      );
      // Phase B 中该视图信号只同步 ResizeObserver；重算由 ModelGraph.structureChange$ 调度。
      this._subs.add(
        this.doc.onChildrenUpdate$.subscribe(() => {
          const mountedRootIds = this._mountedRootIds();
          const needsMeasurement = this._syncMountedViews(mountedRootIds);
          if (this.options.sparseView && needsMeasurement) {
            this._scheduleMountedMeasurement(mountedRootIds);
          }
        }),
      );
      const viewChange$ = this.doc.virtualization?.viewChange$;
      if (viewChange$) {
        this._subs.add(
          viewChange$.subscribe(change => {
            const needsMeasurement = this._syncMountedViews(change.mountedRootIds);
            if (this.options.sparseView && needsMeasurement) {
              this._scheduleMountedMeasurement(change.mountedRootIds);
            }
          }),
        );
      }
      this._containerRO = new ResizeObserver(() => this.scheduleRecompute());
      this._containerRO.observe(this.scrollContainer);
      this._subs.add(
        fromEvent<CompositionEvent>(
          this.doc.root.hostElement,
          'compositionend',
        ).subscribe(event => {
          if (isNativeInputTarget(event.target)) return;
          this._flushCompositionRecompute();
        }),
      );

      if (this.options.sparseView) {
        this._activateSparseLayout();
      } else {
        this.scheduleRecompute();
      }
    });
  }

  /**
   * 用当前 live 测量同步算出分页 items（与屏幕展示同源、不产生副作用）。
   * 供打印复用 → 打印断点 == 屏幕所见（含 embed/媒体块按 live 高度定断点）。
   */
  computePrintItems(): PaginationItem[] {
    if (this._isCompositionInProgress()) {
      return clonePaginationItems(this._stableLayout?.items ?? []);
    }
    const previousInlineIds = this._inlineBreaks.layoutOwnedIds;
    const restoreInlineBreaks = this._inlineBreaks.suspend();
    try {
      const metas = this._heightSource.measure(this._measureOptions());
      return buildPaginationItems(metas);
    } finally {
      restoreInlineBreaks();
      this._heightSource.captureLayoutOwnedResize(new Set([
        ...previousInlineIds,
        ...this._inlineBreaks.layoutOwnedIds,
      ]));
    }
  }

  /**
   * 同步刷新并捕获当前分页视图使用的纯布局数据。调用返回前不会让出事件循环，
   * 调用方可紧接着读取 snapshot，使布局与文档内容属于同一个主线程版本。
   */
  captureStableLayout(): StablePaginationLayout | null {
    if (!this._enabled) return null;
    // 导出捕获是同步屏障：ResizeObserver 的投递可能仍排在本帧后面，不能让最新
    // documentHeader 高度落在 layout/snapshot 之后。先主动测量，回调会同步刷新 geometry。
    this._documentHeaderLayer?.measure();
    // 业务块可在不改变 host border-box 的情况下异步改变内部 scrollWidth。
    // ResizeObserver 不会为这类变化投递，因此导出同步屏障必须强制丢弃
    // fit 前快照，在用户确认稳定的当前 DOM 上重读一次自然几何。
    this._heightSource.invalidateNaturalMeasurements();
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = 0;
    this._pendingRecomputeKind = 'none';
    this._stableLayoutReusableForExport = false;
    this._shadowLayout = null;
    const layout = this._recompute(false);
    if (!layout) return null;
    const {geometry} = layout;
    const firstPageExtraTop = geometry.geometry.firstPageContentHeight == null
      ? 0
      : Math.max(
        0,
        geometry.geometry.contentHeight
          - geometry.geometry.firstPageContentHeight,
      );
    const contentTop = geometry.contentTop
      ?? geometry.margins.top + geometry.headerHeight;
    // placement x/y 是分页模型的固定 layout px，不是视觉 DOM 的测量结果。
    // DOMRect 会受宿主 padding、CSS zoom、WebView 缩放和 transform 影响；把它重新
    // 换算成布局数据会让同一 PaginationConfig 在页面与导出窗口得到不同原点。
    return {
      ...layout,
      placementOriginX: geometry.margins.left,
      placementOriginY: contentTop + firstPageExtraTop,
      placementWidth: Math.max(
        1,
        geometry.sheetWidthPx
          - geometry.margins.left
          - geometry.margins.right,
      ),
    };
  }

  /** @internal Phase B diagnostic snapshot; never drives the live view. */
  captureShadowLayout(): PaginationLayoutState | null {
    return this._shadowLayout;
  }

  scheduleRecompute(): void {
    this._queueRecompute('full');
  }

  private _scheduleMountedMeasurement(rootIds: readonly string[]): void {
    this._heightSource.markMountedMeasurementQueued(rootIds);
    this._queueRecompute('mounted-measurement');
  }

  private _queueRecompute(kind: 'mounted-measurement' | 'full'): void {
    if (!this._enabled) return;
    if (kind === 'full') {
      this._pendingRecomputeKind = 'full';
      this._stableLayoutReusableForExport = false;
      this._shadowLayout = null;
    } else if (this._pendingRecomputeKind === 'none') {
      this._pendingRecomputeKind = 'mounted-measurement';
    } else if (this._pendingRecomputeKind === 'full' && this._rafId) {
      // The already queued full pass measures the latest mounted window too.
      return;
    }
    if (this._isCompositionInProgress()) {
      this._compositionRecomputePending = true;
      if (kind === 'full' && this.options.sparseView) {
        this._sparseProjectionUpdateDeferred = true;
      }
      if (this._rafId) cancelAnimationFrame(this._rafId);
      this._rafId = 0;
      return;
    }
    this._compositionRecomputePending = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = requestAnimationFrame(() => {
      this._rafId = 0;
      const pendingKind = this._pendingRecomputeKind;
      this._pendingRecomputeKind = 'none';
      this._recompute(pendingKind === 'mounted-measurement');
    });
  }

  @performanceTest('pagination view recompute', 16)
  private _recompute(mountedMeasurementOnly = false): StablePaginationLayout | null {
    if (!this._enabled) return null;
    // IME 组合期间 DOM 含浏览器管理的临时文本节点；此时重建分页投影会破坏组合范围。
    // 表格选区实体化可能替换 compositionstart 的宿主，使原生状态提前复位；
    // 模型会话覆盖 active/committing 全周期，必须同时作为分页重排的权威门禁。
    if (this._isCompositionInProgress()) {
      this._compositionRecomputePending = true;
      this._pendingRecomputeKind = 'full';
      if (this.options.sparseView) {
        this._sparseProjectionUpdateDeferred = true;
      }
      return this._stableLayout;
    }
    if (!mountedMeasurementOnly) {
      this._stableLayoutReusableForExport = false;
    }
    const previousInlineIds = this._inlineBreaks.layoutOwnedIds;
    const inlineUpdate = this._inlineBreaks.beginUpdate();
    let inlineUpdateCommitted = false;
    try {
      let measurementRevision: number | null = null;
      try {
        // Root order is synchronized on enable and by the model structure
        // subscription. Re-reading every model seed here would turn a mounted
        // window change back into an O(total roots) scroll path.
        this._syncMeasureContext();
        measurementRevision = this.layoutCoordinator.geometryRevision;
      } catch (error) {
        this._failShadow('prepare', error);
      }

      if (this.options.sparseView) {
        const sparseLayout = this._recomputeSparse(
          measurementRevision,
          mountedMeasurementOnly,
        );
        if (sparseLayout) {
          inlineUpdate.commit();
          inlineUpdateCommitted = true;
        }
        return sparseLayout;
      }

      // measure() 已忽略 margin-top（gap），无需先清空 gap——少一次「清空→强制回流→重设」的布局抖动，
      // 同时保留浏览器原生 overflow-anchor 对视口上方内容变化的滚动补偿（实测能稳住编辑滚动）。
      const metas = this._heightSource.measure(this._measureOptions());
      const items = buildPaginationItems(metas);
      const result = paginate(items, this._geom.geometry);
      const initialLayout = createStablePaginationLayout(
        ++this._layoutRevision,
        this._config,
        this._geom,
        items,
        result,
      );
      const published = this._publishLayoutWithInlineFallback(
        initialLayout,
        metas,
      );
      this._stableLayout = published.layout;
      this._stableLayoutReusableForExport = !published.inlineProjectionFailed;

      // Phase B shadow 永远最后运行，任何失败都不能阻断上面的 legacy DOM 输出。
      if (published.inlineProjectionFailed) {
        this._shadowLayout = null;
      } else if (measurementRevision !== null) {
        this._reconcileShadow(
          published.layout,
          published.metas,
          measurementRevision,
        );
      }
      inlineUpdate.commit();
      inlineUpdateCommitted = true;
      return published.layout;
    } finally {
      // 只有完整发布成功才提交新行内投影；任一后续 applier 抛错时恢复
      // 旧 stable 对应的页缝，避免数据快照与 live DOM 各处于一版。
      if (!inlineUpdateCommitted) {
        inlineUpdate.rollback();
        this._handleInlineProjectionFailures(
          this._inlineBreaks.syncMounted(this._mountedRootIds()),
        );
      }
      this._heightSource.captureLayoutOwnedResize(new Set([
        ...previousInlineIds,
        ...this._inlineBreaks.layoutOwnedIds,
      ]));
    }
  }

  private _isCompositionInProgress(): boolean {
    return !!this.doc.event?.status?.isComposing
      || !(this.doc.inputManger?.compositionSession?.isIdle ?? true);
  }

  private _flushCompositionRecompute(): void {
    // CompositionControl 在插件之前注册于同一 root；本监听器必须留在 bubble
    // 阶段，等它同步完成 Y.Text 写入、规范 DOM 重建、光标恢复和 session.end()。
    // 部分 Zone/WebKit 组合会在 capture/bubble 之间执行 microtask checkpoint，
    // 因此不能在 capture 阶段预先排这个 microtask。
    queueMicrotask(() => {
      if (!this._enabled) return;
      if (this._isCompositionInProgress()) {
        this._compositionRecomputePending = true;
        return;
      }
      // 每次被编辑器接管的 compositionend 都保证存在一次恢复。仅依赖 pending 会漏掉
      // 等高文本提交，因为它不一定产生 ResizeObserver 通知；如果提交路径已排好一帧，
      // 则直接复用，避免同一 compositionend 重复取消/创建动画帧。
      const hadDeferredRecompute = this._compositionRecomputePending;
      this._compositionRecomputePending = false;
      if (!hadDeferredRecompute && this._rafId) return;
      this.scheduleRecompute();
    });
  }

  private _activateSparseLayout(): void {
    try {
      this.layoutCoordinator.syncRootOrder();
      this._syncMeasureContext();
      const state = this.layoutCoordinator.compute(this._config, this._geom);
      const layout = this._stableLayoutFromState(state);
      const virtualization = this.doc.virtualization;
      if (!virtualization?.enabled) {
        throw new Error('Sparse pagination requires root virtualization');
      }
      this._releaseLayoutProjection = registerRootLayoutProjection(
        virtualization,
        state.projection,
        {
          beforeActivate: () => {
            try {
              this._applyContainerStyles();
              this._frameLayer.mount();
            } catch (error) {
              this._clearPaginationView();
              throw error;
            }
          },
          beforeDeactivate: () => this._clearPaginationView(),
          isValidationDeferred: () =>
            this._sparseProjectionUpdateDeferred ||
            this._isCompositionInProgress(),
          onInvalid: error => {
            this.disable();
            this.options.onSparseViewFailure?.(error);
          },
        },
      );
      if (state.projection.willChange$) {
        this._subs.add(
          state.projection.willChange$.subscribe(() => {
            if (!this._pendingSparseContainerStyles || !this._enabled) return;
            this._applyContainerStyles();
            this._pendingSparseContainerStyles = false;
          }),
        );
      }
      const published = this._publishLayoutWithInlineFallback(
        layout,
        this._metasFromState(state),
      );
      this._shadowLayout = published.inlineProjectionFailed
        ? {...state, exact: false}
        : state;
      this._stableLayout = published.layout;
      this._stableLayoutReusableForExport = !published.inlineProjectionFailed
        && state.exact;
      this.scheduleRecompute();
    } catch (error) {
      const releaseLayoutProjection = this._releaseLayoutProjection;
      this._releaseLayoutProjection = null;
      releaseLayoutProjection?.();
      this._clearPaginationView();
      throw error;
    }
  }

  private _recomputeSparse(
    measurementRevision: number | null,
    mountedMeasurementOnly: boolean,
  ): StablePaginationLayout | null {
    try {
      if (measurementRevision === null) {
        throw new Error('Sparse pagination measurement revision is unavailable');
      }
      if (this._pendingSparseContainerStyles) {
        // The updated measure context has already invalidated natural geometry.
        // Commit an estimated projection first; its willChange$ applies the new
        // page CSS after virtualization captures the old scroll anchor. Measure
        // mounted roots against the new width on the following frame.
        const state = this.layoutCoordinator.compute(this._config, this._geom, {
          forceProjectionUpdate: true,
        });
        this._sparseProjectionUpdateDeferred = false;
        const layout = this._stableLayoutFromState(state);
        const published = this._publishLayoutWithInlineFallback(
          layout,
          this._metasFromState(state),
        );
        this._shadowLayout = published.inlineProjectionFailed
          ? {...state, exact: false}
          : state;
        this._stableLayout = published.layout;
        this._stableLayoutReusableForExport = !published.inlineProjectionFailed
          && state.exact;
        this._sparseFailureCount = 0;
        this.scheduleRecompute();
        return published.layout;
      }
      const mountedIds = this._mountedRootIds();
      this._syncMountedViews(mountedIds);
      const measurements = this._heightSource.measure(
        this._measureOptions(),
        mountedIds,
      );
      const measuredIds = new Set(measurements.map(measurement => measurement.id));
      const missingMountedIds = mountedIds.filter(id => !measuredIds.has(id));
      if (missingMountedIds.length) {
        throw new Error(
          `Mounted pagination hosts are not measurable yet: ${missingMountedIds.join(', ')}`,
        );
      }
      const applied = this.layoutCoordinator.applyMeasured(
        measurements,
        measurementRevision,
        this._heightSource.measurementEpoch,
      );
      if (!applied.accepted) {
        this.scheduleRecompute();
        return null;
      }
      if (
        mountedMeasurementOnly
        && !applied.changed
        && !this._sparseProjectionUpdateDeferred
      ) {
        // Retained/recreated DOM confirmed the geometry already stored in the
        // index. The surrounding inline transaction rolls back its temporary
        // natural-measurement suspension; no paginate/publish/anchor cycle is
        // needed for this window change.
        this._sparseFailureCount = 0;
        return null;
      }

      const state = this.layoutCoordinator.compute(this._config, this._geom, {
        // A structure-changing IME can return the model to geometry equal to
        // the last stable layout. Publish one completion revision anyway so
        // virtualization resumes its deferred root-order validation.
        forceProjectionUpdate: this._sparseProjectionUpdateDeferred,
      });
      this._sparseProjectionUpdateDeferred = false;
      const layout = this._stableLayoutFromState(state);
      const published = this._publishLayoutWithInlineFallback(
        layout,
        this._metasFromState(state),
      );
      this._shadowLayout = published.inlineProjectionFailed
        ? {...state, exact: false}
        : state;
      this._stableLayout = published.layout;
      this._stableLayoutReusableForExport = !published.inlineProjectionFailed
        && state.exact;
      this._sparseFailureCount = 0;
      return published.layout;
    } catch (error) {
      this._sparseFailureCount++;
      if (this._sparseFailureCount < 3) {
        this._warn('paginationSparseReconcileError: ', {
          attempt: this._sparseFailureCount,
          error,
        });
        this.scheduleRecompute();
        return null;
      }
      this._sparseFailureCount = 0;
      const releaseLayoutProjection = this._releaseLayoutProjection;
      this._releaseLayoutProjection = null;
      releaseLayoutProjection?.();
      this.disable();
      this.options.onSparseViewFailure?.(error);
      return null;
    }
  }

  private _stableLayoutFromState(
    state: PaginationLayoutState,
  ): StablePaginationLayout {
    return createStablePaginationLayout(
      ++this._layoutRevision,
      this._config,
      this._geom,
      state.items,
      state.result,
    );
  }

  private _metasFromState(state: PaginationLayoutState): BlockMeta[] {
    return state.entries.map(entry => {
      // fitScale 只能来自完整 DOM 对流式图片/视频 wrapper 的确定测量。
      // 不从 lockHeight/flavour 反推，避免形状、绝对定位媒体或稀疏估算被整块缩放。
      const fitScale = entry.fitScale
      const meta: BlockMeta = {
        id: entry.blockId,
        flavour: entry.flavour,
        nodeType: entry.nodeType,
        isHeading: entry.isHeading,
        height: entry.tableCellFlowPlan?.paginationHeight
          ?? (entry.lockHeight != null && fitScale == null
            ? entry.lockHeight
            : entry.effectiveHeight),
        splitOffsets: entry.splitOffsets ? [...entry.splitOffsets] : undefined,
        // Estimated/dirty sparse entries may retain their old plan only to keep
        // offscreen extent stable. Never replay those anchors into a remounted
        // Runtime before its current DOM has been measured again.
        inlineBreakPlan: entry.source === 'measured'
          ? cloneInlinePaginationBreakPlan(entry.inlineBreakPlan)
          : undefined,
        preferredSplitOffsets: entry.preferredSplitOffsets
          ? [...entry.preferredSplitOffsets]
          : undefined,
        tableRows: entry.tableRows?.map(row => ({...row})),
        lockHeight: entry.lockHeight,
        fitScale,
        repeatHeaderHeight: entry.repeatHeaderHeight,
      };
      if (entry.trailingSpacing != null) meta.trailingSpacing = entry.trailingSpacing;
      setTableCellFlowPlan(
        meta,
        entry.tableCellFlowPlan
          ? cloneTableCellFlowPlan(entry.tableCellFlowPlan)
          : undefined,
      );
      return meta;
    });
  }

  /**
   * Publish the requested layout, but never keep a fragmented stable result if
   * its mounted InlineRuntime cannot materialize the matching continuation
   * gaps. Failed text roots are republished atomically and retried a bounded
   * number of frames. The atomic result keeps the live screen coherent, but is
   * marked non-reusable so export performs a complete readonly reflow.
   */
  private _publishLayoutWithInlineFallback<TMeta extends BlockMeta>(
    layout: StablePaginationLayout,
    metas: TMeta[],
  ): {
    layout: StablePaginationLayout;
    metas: TMeta[];
    inlineProjectionFailed: boolean;
  } {
    let publishedLayout = layout;
    let publishedMetas = metas;
    const failedIds = new Set<string>();
    const maximumAttempts = Math.max(
      2,
      metas.filter(meta => meta.inlineBreakPlan).length + 1,
    );

    for (let attempt = 0; attempt < maximumAttempts; attempt++) {
      const failures = this._applyLayoutView(publishedLayout, publishedMetas);
      let hasNewFailure = false;
      for (const id of failures) {
        if (failedIds.has(id)) continue;
        failedIds.add(id);
        hasNewFailure = true;
      }
      if (!hasNewFailure) break;

      publishedMetas = publishedMetas.map(meta => failedIds.has(meta.id)
        ? {
            ...meta,
            splitOffsets: undefined,
            preferredSplitOffsets: undefined,
            inlineBreakPlan: undefined,
          } as TMeta
        : meta,
      );
      const fallbackItems = buildPaginationItems(publishedMetas).map(item =>
        failedIds.has(item.id)
          ? {
              ...item,
              breakable: false,
              splitOffsets: undefined,
              preferredSplitOffsets: undefined,
            }
          : item,
      );
      const fallbackResult = paginate(fallbackItems, this._geom.geometry);
      publishedLayout = createStablePaginationLayout(
        ++this._layoutRevision,
        this._config,
        this._geom,
        fallbackItems,
        fallbackResult,
      );
    }

    if (!failedIds.size) {
      this._inlineProjectionFailureCount = 0;
    } else {
      this._inlineProjectionFailureCount++;
      if (this._inlineProjectionFailureCount < 3) {
        this.scheduleRecompute();
      } else if (this._inlineProjectionFailureCount === 3) {
        this._warn('paginationInlineProjectionFallback: ', {
          attempts: this._inlineProjectionFailureCount,
          blockIds: [...failedIds],
        });
      }
    }

    return {
      layout: publishedLayout,
      metas: publishedMetas,
      inlineProjectionFailed: failedIds.size > 0,
    };
  }

  private _applyLayoutView(
    layout: StablePaginationLayout,
    metas: BlockMeta[],
  ): ReadonlySet<string> {
    const result = layout.result;
    const lockedIds = new Set<string>();
    const fitScales = new Map<string, number>();
    const nextLayoutOwnedIds = new Set<string>();
    for (const meta of metas) {
      if (meta.lockHeight != null && meta.lockHeight > 0) {
        lockedIds.add(meta.id);
        nextLayoutOwnedIds.add(meta.id);
      }
      if (meta.fitScale != null) {
        fitScales.set(meta.id, meta.fitScale);
        // 媒体 wrapper 的 max-size 会改变宿主 border-box，属于分页投影自有 resize。
        nextLayoutOwnedIds.add(meta.id);
      }
      // 小表格不会插断点 DOM，不需要为它增加一次最终尺寸读取。
      if (
        meta.flavour === 'table'
        && meta.height > this._geom.geometry.contentHeight
      ) {
        nextLayoutOwnedIds.add(meta.id);
      }
      if (meta.inlineBreakPlan) nextLayoutOwnedIds.add(meta.id);
    }
    const layoutOwnedIds = new Set([
      ...this._layoutOwnedRootIds,
      ...nextLayoutOwnedIds,
    ]);
    this._heightLockApplier.apply(lockedIds, fitScales);

    const rects = computeSheetRects(result.pages.length, this._geom.sheetHeightPx, this._geom.pageGap);
    const totalHeight = computeBackdropHeight(result.pages.length, this._geom.sheetHeightPx, this._geom.pageGap);
    this._frameLayer.render({
      rects,
      sheetWidthPx: this._geom.sheetWidthPx,
      totalHeight,
      margins: this._geom.margins,
      headerHeight: this._geom.headerHeight,
      footerHeight: this._geom.footerHeight,
      headerDistance: this._geom.headerDistance ?? this._geom.margins.top,
      footerDistance: this._geom.footerDistance ?? this._geom.margins.bottom,
      header: this._config.header,
      footer: this._config.footer,
    });

    const gaps = computeBlockGaps(result, this._geom.sheetHeightPx, this._geom.pageGap);
    this._gapApplier.apply(gaps);
    this._tableBreaks.apply(
      metas,
      result,
      this._geom.sheetHeightPx,
      this._geom.pageGap,
      this._geom.contentTop ?? this._geom.margins.top + this._geom.headerHeight,
    );
    // Inline projection commits last: if table projection throws, the surrounding
    // update transaction can still restore the previously published text gaps.
    const inlineProjectionFailures = this._inlineBreaks.apply(
      metas,
      result,
      this._geom.sheetHeightPx,
      this._geom.pageGap,
      this._geom.contentTop ?? this._geom.margins.top + this._geom.headerHeight,
    );
    // 文本页缝、表格断点/单元格流投影和高度锁会改变根块 border-box。登记提交后的
    // 最终尺寸，避免它们的异步 ResizeObserver 回声再启动一轮分页。
    this._heightSource.captureLayoutOwnedResize(layoutOwnedIds);
    this._layoutOwnedRootIds = nextLayoutOwnedIds;
    return inlineProjectionFailures;
  }

  private _mountedRootIds(): readonly string[] {
    try {
      if (this.doc.virtualization?.enabled) {
        return this.doc.vm.getMountedRootChildIds();
      }
      return this.doc.model.getChildrenIds(this.doc.rootId);
    } catch {
      return [...this.doc.root.childrenIds];
    }
  }

  private _rootIdsForChangedBlocks(
    blockIds: readonly string[],
  ): readonly string[] {
    const rootIds = new Set<string>();
    for (const blockId of blockIds) {
      try {
        const path = this.doc.model.getPath(blockId);
        if (path?.[0] === this.doc.rootId && path[1]) rootIds.add(path[1]);
      } catch {
        // A concurrent delete may remove the path before notification delivery.
      }
    }
    return [...rootIds];
  }

  private _syncMountedViews(mountedRootIds: readonly string[]): boolean {
    const needsMeasurement = !!this.options.sparseView
      && this._heightSource.hasUnmeasuredMountedRoots(
        mountedRootIds,
        this._measureOptions(),
      );
    this._heightSource.syncObserved(mountedRootIds);
    this._gapApplier.syncMounted(mountedRootIds);
    const inlineFailures = this._inlineBreaks.syncMounted(mountedRootIds);
    this._tableBreaks.syncMounted(mountedRootIds);
    this._heightLockApplier.syncMounted(mountedRootIds);
    this._handleInlineProjectionFailures(inlineFailures);
    return needsMeasurement;
  }

  private _handleInlineProjectionFailures(failures: ReadonlySet<string>): void {
    if (!failures.size) return;
    this._stableLayoutReusableForExport = false;
    if (this._shadowLayout) {
      this._shadowLayout = {...this._shadowLayout, exact: false};
    }
    this.scheduleRecompute();
  }

  private _reconcileShadow(
    legacy: StablePaginationLayout,
    measurements: ReturnType<LiveHeightSource["measure"]>,
    measurementRevision: number,
  ): void {
    let stage = 'apply-measured';
    try {
      const applied = this.layoutCoordinator.applyMeasured(
        measurements,
        measurementRevision,
        this._heightSource.measurementEpoch,
      );
      if (!applied.accepted) {
        this._shadowLayout = null;
        this._lastShadowMismatchSignature = null;
        this._lastShadowErrorSignature = null;
        this.scheduleRecompute();
        return;
      }

      stage = 'compute';
      const shadow = this.layoutCoordinator.compute(this._config, this._geom);
      stage = 'compare';
      const mismatches = comparePaginationShadow(legacy, measurements, shadow);

      this._shadowLayout = shadow;
      this._lastShadowErrorSignature = null;
      if (!mismatches.length) {
        this._lastShadowMismatchSignature = null;
        return;
      }

      stage = 'signature';
      const signature = this._createShadowMismatchSignature(mismatches);
      if (signature === this._lastShadowMismatchSignature) return;
      this._lastShadowMismatchSignature = signature;
      stage = 'logger';
      this._warn('paginationShadowMismatch: ', {
        legacyRevision: legacy.revision,
        shadowRevision: shadow.revision,
        mismatches,
      });
    } catch (error) {
      this._failShadow(stage, error);
    }
  }

  private _createShadowMismatchSignature(
    mismatches: ReturnType<typeof comparePaginationShadow>,
  ): string {
    return shadowMismatchSignature(mismatches);
  }

  private _syncMeasureContext(): void {
    const contentWidth = this._contentWidth();
    this.layoutCoordinator.updateMeasureContext({
      contentWidth,
      contentHeight: this._geom.geometry.contentHeight,
      widowOrphanLines: this._config.widowOrphanLines ?? 2,
      theme: this._theme,
      fontEpoch: this._fontEpoch,
      rendererRevision: 0,
    });
    this.layoutCoordinator.setRequiredMeasurementEpoch(
      this._heightSource.measurementEpoch,
    );
  }

  private _measureOptions(): MeasureOptions {
    return {
      contentHeight: this._geom.geometry.contentHeight,
      contentWidth: this._contentWidth(),
      widowOrphanLines: this._config.widowOrphanLines ?? 2,
    };
  }

  private _contentWidth(): number {
    return Math.max(
      1,
      this._geom.sheetWidthPx - this._geom.margins.left - this._geom.margins.right,
    )
  }

  private _refreshGeometry(): void {
    const extraTop = this._documentHeaderExtraTop();
    this._geom = resolveScreenGeometry(this._config, {firstPageExtraTop: extraTop});
  }

  private _documentHeaderLayout(): {top: number; width: number} {
    return {
      top: 24 + this._documentHeaderTop(),
      width: Math.max(
        1,
        this._geom.sheetWidthPx - this._geom.margins.left - this._geom.margins.right,
      ),
    };
  }

  private _documentHeaderTop(): number {
    if (this.options.documentHeader?.placement !== 'top-margin') {
      return this._geom.contentTop ?? this._geom.margins.top + this._geom.headerHeight;
    }
    const topInset = this.options.documentHeader.topInset ?? 20;
    return Number.isFinite(topInset) && topInset >= 0 ? topInset : 20;
  }

  private _documentHeaderExtraTop(): number {
    if (this._documentHeaderHeight <= 0) return 0;
    const gap = this._documentHeaderLayer?.gap ?? 0;
    if (this.options.documentHeader?.placement !== 'top-margin') {
      return this._documentHeaderHeight + gap;
    }
    const bodyTop = this._geom.contentTop ?? this._geom.margins.top + this._geom.headerHeight;
    const headerEnd = this._documentHeaderTop() + this._documentHeaderHeight + gap;
    return Math.max(0, headerEnd - bodyTop);
  }

  private _mountDocumentHeader(): void {
    const layer = this._documentHeaderLayer;
    if (!layer) return;
    layer.mount(this._documentHeaderLayout());
    this._documentHeaderHeight = layer.measure();
    this._refreshGeometry();
    layer.updateLayout(this._documentHeaderLayout());
  }

  private _layoutDocumentHeader(): void {
    this._documentHeaderLayer?.updateLayout(this._documentHeaderLayout());
  }

  private _onDocumentHeaderHeightChange(height: number): void {
    if (Math.abs(height - this._documentHeaderHeight) < 0.5) return;
    this._documentHeaderHeight = height;
    this._refreshGeometry();
    if (!this._enabled) return;
    if (this.options.sparseView && !this._releaseLayoutProjection) return;
    this._applyContainerStyles();
    this._runShadowMutation('document-header-height', () => this._syncMeasureContext());
    this.scheduleRecompute();
  }

  private _runShadowMutation(stage: string, mutation: () => void): void {
    try {
      mutation();
    } catch (error) {
      this._failShadow(stage, error);
    }
  }

  private _failShadow(stage: string, error: unknown): void {
    this._shadowLayout = null;
    this._lastShadowMismatchSignature = null;
    let message = 'Unprintable shadow error';
    try {
      const rawMessage = error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);
      message = rawMessage.slice(0, 500);
    } catch {
      // Keep the bounded fallback above; hostile values must not escape diagnostics.
    }
    const signature = `${stage}|${message}`;
    if (signature === this._lastShadowErrorSignature) return;
    this._lastShadowErrorSignature = signature;
    this._warn('paginationShadowLayoutError: ', {stage, message});
  }

  private _warn(message: string, detail: unknown): void {
    try {
      const logger = (
        this.doc as unknown as {
          logger?: {warn?: (message: string, detail: unknown) => void};
        }
      ).logger;
      logger?.warn?.(message, detail);
    } catch {
      // Shadow diagnostics must never enter the authoritative legacy path.
    }
  }

  private _addFontListener(): void {
    if (this._fontEventTarget) return;
    try {
      const fonts = (
        this.scrollContainer.ownerDocument as unknown as {
          fonts?: Partial<FontLoadingEventTarget>;
        }
      ).fonts;
      if (
        !fonts ||
        typeof fonts.addEventListener !== 'function' ||
        typeof fonts.removeEventListener !== 'function'
      ) {
        return;
      }
      const target = fonts as FontLoadingEventTarget;
      target.addEventListener('loadingdone', this._onFontsLoadingDone);
      this._fontEventTarget = target;
    } catch (error) {
      this._failShadow('font-listener-add', error);
    }
  }

  private _removeFontListener(): void {
    const target = this._fontEventTarget;
    this._fontEventTarget = null;
    if (!target) return;
    try {
      target.removeEventListener('loadingdone', this._onFontsLoadingDone);
    } catch (error) {
      this._failShadow('font-listener-remove', error);
    }
  }

  private _applyContainerStyles(): void {
    const root = this.doc.root.hostElement;
    const {sheetWidthPx, margins} = this._geom;
    root.classList.add('bc-paginated');
    root.style.setProperty('--bc-page-width', `${sheetWidthPx}px`);
    // Chromium 会在 flex 子项宽过容器时把 align-items:center 安全回退到 start，
    // 而 absolute backdrop 仍以 50% 居中，导致 root 与纸张中线相差半个溢出宽。
    // surface 至少保持一张纸宽，让正文 root、header 与 page sheet 永远共享中线。
    this._layoutSurface.style.setProperty('--bc-page-width', `${sheetWidthPx}px`);
    root.style.setProperty('--bc-page-content-height', `${this._geom.geometry.contentHeight}px`);
    // 宿主文档头始终处于 root 外部。整个 root 从第一页正文起点开始，header
    // 高度只影响首页容量；普通块和 placement plane 不再各自重复补偿 header。
    const documentHeaderOffset = this._documentHeaderExtraTop();
    const contentOriginY = (this._geom.contentTop ?? margins.top + this._geom.headerHeight) + documentHeaderOffset;
    root.style.setProperty('--bc-page-root-offset-top', `${contentOriginY}px`);
    root.style.setProperty('--bc-page-margin-top', '0px');
    root.style.setProperty('--bc-placement-content-origin-y', '0px');
    root.style.setProperty(
      '--bc-page-margin-bottom',
      `${this._geom.contentBottom ?? margins.bottom + this._geom.footerHeight}px`,
    );
    root.style.setProperty('--bc-page-margin-right', `${margins.right}px`);
    root.style.setProperty('--bc-page-margin-left', `${margins.left}px`);
    this.scrollContainer.classList.add('bc-paginated-scroll');
    this._layoutDocumentHeader();
  }

  private _removeContainerStyles(): void {
    const root = this.doc.root.hostElement;
    root.classList.remove('bc-paginated');
    ['--bc-page-width', '--bc-page-content-height', '--bc-page-root-offset-top', '--bc-page-margin-top', '--bc-page-margin-right', '--bc-page-margin-bottom', '--bc-page-margin-left', '--bc-placement-content-origin-y']
      .forEach(p => root.style.removeProperty(p));
    this._layoutSurface.style.removeProperty('--bc-page-width');
    this.scrollContainer.classList.remove('bc-paginated-scroll');
  }

  disable(): void {
    if (!this._enabled) return;
    this._enabled = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = 0;
    this._pendingRecomputeKind = 'none';
    this._subs.unsubscribe();
    this._subs = new Subscription();
    this._containerRO?.disconnect();
    this._containerRO = null;
    this._removeFontListener();
    this._heightSource.clearLayoutOwnedResize();
    const releaseLayoutProjection = this._releaseLayoutProjection;
    this._releaseLayoutProjection = null;
    releaseLayoutProjection?.();
    this._clearPaginationView();
    this._stableLayout = null;
    this._stableLayoutReusableForExport = false;
    this._shadowLayout = null;
    this._compositionRecomputePending = false;
    this._sparseProjectionUpdateDeferred = false;
    this._sparseFailureCount = 0;
    this._inlineProjectionFailureCount = 0;
    this._pendingSparseContainerStyles = false;
    this._layoutOwnedRootIds.clear();
    this._lastShadowMismatchSignature = null;
    this._lastShadowErrorSignature = null;
  }

  private _clearPaginationView(): void {
    this._gapApplier.clear();
    this._inlineBreaks.clear();
    this._tableBreaks.clear();
    this._heightLockApplier.clear();
    this._frameLayer.destroy();
    this._documentHeaderLayer?.destroy();
    this._removeContainerStyles();
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this.disable();
    this._heightSource.destroy();
    this._gapApplier.destroy();
    this._inlineBreaks.destroy();
    this._heightLockApplier.destroy();
    try {
      this.layoutCoordinator.dispose();
    } catch (error) {
      this._failShadow('dispose', error);
    }
  }
}

function clonePaginationItems(items: readonly PaginationItem[]): PaginationItem[] {
  return items.map(item => {
    const clone: PaginationItem = {
      ...item,
      splitOffsets: item.splitOffsets ? [...item.splitOffsets] : undefined,
      preferredSplitOffsets: item.preferredSplitOffsets
        ? [...item.preferredSplitOffsets]
        : undefined,
    };
    const tableCellFlowPlan = getTableCellFlowPlan(item);
    if (tableCellFlowPlan) {
      setTableCellFlowPlan(clone, cloneTableCellFlowPlan(tableCellFlowPlan));
    }
    return clone;
  });
}
