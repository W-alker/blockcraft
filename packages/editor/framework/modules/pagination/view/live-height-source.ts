// packages/editor/framework/modules/pagination/view/live-height-source.ts
import {Subject} from "rxjs";
import {BlockNodeType} from "../../../block-std/types/block.type";
import {resolveBlockPolicy} from "../engine";
import {
  cloneTableCellFlowPlan,
  TableCellFlowPlan,
} from "../engine/table-cell-flow";
import {
  getTableCellFlowPlan,
  setTableCellFlowPlan,
} from "../engine/table-cell-flow-metadata";
import {isPaginationHeading} from '../layout/pagination-heading'
import {BlockMeta} from "./item-builder";
import {
  cloneInlinePaginationBreakPlan,
  createInlinePaginationBreakPlan,
  InlinePaginationBreakPlan,
  visualDistanceToHostLayout,
} from './inline-break-plan'
import {measureInlinePaginationLineStarts} from '../../../block-std/inline/runtime/inline-pagination-access'
import {
  canFitPageMedia,
  hasPageMediaFit,
  resolvePageMediaSurface,
  suspendPageMediaFit,
} from './page-media-fit'
import {
  measureBlockContentWidth,
  measureBlockVisualHeight,
} from './block-visual-height'
import {rowSplitOffsets} from "./split-points";
import {
  measureTablePaginationGeometry,
  TablePaginationMeasureOptions,
} from "./table-pagination-access";

/** 测量时传入：每页内容高（判定 oversized）+ widow/orphan 最少行。 */
export interface MeasureOptions extends TablePaginationMeasureOptions {
  /** 当前分页正文宽度；流式图片/视频主体超过它时约束媒体 wrapper。 */
  contentWidth?: number
}

/** @internal Live DOM measurement consumed by pagination shadow geometry. */
export interface LivePaginationMeasurement extends BlockMeta {
  /** Unlocked full block stride, including margin-bottom and excluding margin-top. */
  naturalHeight: number;
}

interface NaturalDomSnapshot {
  width: number
  renderedHeight: number
  marginBottom: number
  mediaSurfaceWidth: number | null
  mediaSurfaceHeight: number | null
  contentWidth: number | null
}

interface NaturalDomCacheEntry {
  epoch: number
  snapshot: NaturalDomSnapshot
}

interface MeasurementOptionsKey {
  contentHeight: number | null
  contentWidth: number | null
  widowOrphanLines: number | null
}

interface CompletedMeasurement {
  blockId: string
  epoch: number
  options: MeasurementOptionsKey
  borderBoxSize: number
  value: LivePaginationMeasurement
}

const MIN_INLINE_LINE_SAMPLES = 64
const INLINE_LINE_SAMPLES_PER_PAGE = 8
const MAX_INLINE_LINE_SAMPLES = 2048

/**
 * 自有 ResizeObserver（BlockActiveTracker 的 heightMap 是 private 不可复用）。
 * 观测 root 顶层块 host，测量「offsetHeight + 上下外边距」作为块高度，
 * 并从块组件读 flavour/nodeType/heading 装配 BlockMeta[]。
 *
 * 关键：ResizeObserver 用 border-box，不含 margin，故 gap-applier 改 margin-top 不会触发它（无反馈环）；
 * measure() 只算 margin-bottom、忽略 margin-top（分页模式下顶层块自然 margin-top=0，唯一的 margin-top
 * 是 gap-applier 的下推间隙、不是块自身高度），因此 controller 无需在测量前清空 gap——避免每次重排的布局抖动。
 */
export class LiveHeightSource {
  readonly resize$ = new Subject<void>();
  private _ro: ResizeObserver;
  private _observed = new Set<Element>();
  /** Newly observed hosts receive one RO delivery even without a resize. */
  private _pendingInitialResize = new WeakSet<Element>();
  /**
   * 分页投影本身会改变表格/高度锁定块的 border-box。ResizeObserver 的通知晚于
   * 同步 DOM 提交到达，因此单纯用“正在 apply”的布尔锁挡不住下一帧反馈。
   *
   * 这里记录本轮分页提交后的最终尺寸：observer 若看到的正是该尺寸，说明只是
   * 自有投影回声；若尺寸不同，仍按真实内容变化继续重算。
   */
  private _layoutOwnedBlockSizes = new Map<Element, number>();
  /**
   * 分页媒体 max-size 约束前的顶层块自然 DOM 几何。ResizeObserver 会在约束
   * image/video wrapper 后再次触发；自然快照阻止分页输出反向成为下一轮输入。
   */
  private _naturalDom = new WeakMap<HTMLElement, NaturalDomCacheEntry>();
  /**
   * 已完成的自然分页测量，以 host identity 为弱键跨 detach/reattach 复用。
   * 模型内容、字体/主题/分页正文上下文变化时推进 epoch；新 HTMLElement
   * 天然 cache miss，因此不会把旧组件的几何投给重建后的视图。
   */
  private _completedMeasurements = new WeakMap<HTMLElement, CompletedMeasurement>();
  private _measurementEpoch = 0;
  /**
   * capHeight 块最近一次未被页高裁剪的可见高度。
   *
   * 代码块加锁后会通过 flex 把内部滚动容器压到一页内，导致宿主的 scrollHeight
   * 也随之降到页高；若直接拿这个受约束值判断 oversized，就会在锁定/解锁之间
   * 形成 ResizeObserver 反馈环。缓存只参与“仍顶满锁定高度”的状态；真实渲染高度
   * 一旦低于页高，立即以新值覆盖，因此缩小块仍能正常解锁。
   */
  private _lastUncappedHeights = new WeakMap<HTMLElement, number>();

  constructor(private doc: BlockCraft.Doc) {
    this._ro = new ResizeObserver(entries => this._handleResize(entries));
  }

  /** @internal 当前自然测量世代；只表示新鲜度，不等同于分页几何 revision。 */
  get measurementEpoch(): number {
    return this._measurementEpoch;
  }

  /**
   * 在分页视图完成 DOM 提交后登记其最终 border-box，过滤异步到达的自反馈。
   * 只读取会被分页投影直接改高的根块，避免为普通段落增加额外布局读取。
   */
  captureLayoutOwnedResize(rootIds: Iterable<string>): void {
    for (const id of rootIds) {
      const el = this._safeBlock(id)?.hostElement as HTMLElement | undefined;
      if (!el || !this._observed.has(el)) continue;
      // ResizeObserver borderBoxSize/offsetHeight 都是 layout px；BCR 在 CSS
      // zoom 下是 visual px。两端必须使用同一坐标系，否则分页自有 fit 会被
      // 误判成新的自然 resize，再启动一轮重排。
      const height = el.offsetHeight;
      if (Number.isFinite(height) && height >= 0) {
        this._layoutOwnedBlockSizes.set(el, height);
      }
    }
  }

  /** 模型内容已经变化；后续 resize 必须重新作为自然尺寸输入处理。 */
  clearLayoutOwnedResize(): void {
    this._layoutOwnedBlockSizes.clear();
    // 模型变化使此前排队的 cold-host 初始通知不再是无害回声。
    // 必须让它进入 resize$，清理尚未消费的分页投影尺寸。
    this._pendingInitialResize = new WeakSet();
    this.invalidateNaturalMeasurements();
  }

  /** 字体/主题/宿主布局上下文变化后，下一轮必须重读未 fit DOM。 */
  invalidateNaturalMeasurements(): void {
    this._measurementEpoch++;
  }

  /**
   * Revision presentation changed without a block-model mutation. Drop only
   * the affected mounted measurements so the next coalesced pagination pass
   * remeasures canonical DOM without invalidating every root in the document.
   */
  invalidateMeasurements(rootIds: Iterable<string>): void {
    for (const id of new Set(rootIds)) {
      const host = this._safeBlock(id)?.hostElement as HTMLElement | undefined;
      if (!host) continue;
      this._naturalDom.delete(host);
      this._completedMeasurements.delete(host);
      this._pendingInitialResize.delete(host);
      this._layoutOwnedBlockSizes.delete(host);
      this._lastUncappedHeights.delete(host);
    }
  }

  /**
   * @internal 当前 mounted roots 是否还有未完成、上下文过期或 host 已替换的测量。
   * 调用不读取布局；真实尺寸变化仍由 ResizeObserver 使对应 host cache 失效。
   */
  hasUnmeasuredMountedRoots(
    rootIds: readonly string[],
    opts?: MeasureOptions,
  ): boolean {
    const options = measurementOptionsKey(opts);
    for (const id of rootIds) {
      const host = this._safeBlock(id)?.hostElement as HTMLElement | undefined;
      if (!host || !this._hasReusableMeasurement(id, host, options)) return true;
    }
    return false;
  }

  /** 根据当前 root 子块同步 observe 集合（增 observe、删 unobserve）。 */
  syncObserved(rootIds?: readonly string[]): void {
    const hosts = new Set<Element>(this._childHosts(rootIds));
    for (const el of Array.from(this._observed)) {
      if (!hosts.has(el)) {
        this._ro.unobserve(el);
        this._observed.delete(el);
        this._pendingInitialResize.delete(el);
        this._layoutOwnedBlockSizes.delete(el);
      }
    }
    for (const el of hosts) {
      if (!this._observed.has(el)) {
        this._ro.observe(el, {box: 'border-box'});
        this._observed.add(el);
      }
    }
  }

  /**
   * @internal controller 已为这些未测 host 排入 mounted-window measurement。
   * 仅此时首个 RO 初始通知可被该测量兜底，不能升级为 full recompute。
   */
  markMountedMeasurementQueued(rootIds: readonly string[]): void {
    for (const host of this._childHosts(rootIds)) {
      if (
        this._observed.has(host)
        && !this._completedMeasurements.has(host)
      ) {
        this._pendingInitialResize.add(host);
      }
    }
  }

  /**
   * 按文档顺序测量 root 顶层块，产出 BlockMeta[]。
   * 表格（实现了分页协作 API）用「自然几何」测高、读行边界：oversized 时产出按行切点，
   * 供引擎在屏幕上跨页拆分。读自然值（排除已施加的占位行）保证不形成测量反馈环。
   */
  measure(
    opts?: MeasureOptions,
    rootIds?: readonly string[],
  ): LivePaginationMeasurement[] {
    const metas: LivePaginationMeasurement[] = [];
    const options = measurementOptionsKey(opts);
    for (const id of rootIds ?? this.doc.root.childrenIds) {
      const block = this._safeBlock(id);
      if (!block) continue;
      const el = block.hostElement as HTMLElement;
      const cached = this._cachedMeasurement(id, el, options);
      if (cached) {
        metas.push(cached);
        continue;
      }
      const cs = getComputedStyle(el);
      // 忽略 margin-top（它要么是 0，要么是 gap-applier 施加的下推间隙，都不算块自身高度）。
      const currentMarginBottom = parseFloat(cs.marginBottom) || 0;

      // A resolved whole-block revision stays in the canonical tree but is not
      // a visual pagination slot. `display:none` must suppress its authored
      // margin as well as its border box, otherwise a zero-height phantom gap
      // survives in the live page model.
      if (cs.display === 'none') {
        this._appendMeasurement(metas, id, el, options, {
          id,
          flavour: block.flavour,
          nodeType: block.nodeType,
          isHeading: this._isHeading(block),
          naturalHeight: 0,
          height: 0,
          trailingSpacing: 0,
        });
        continue;
      }

      const geom = measureTablePaginationGeometry(block, opts);
      if (geom) {
        const naturalHeight = geom.naturalHeight + currentMarginBottom;
        const cellFlowPlan = geom.cellFlowPlan
          ? appendTrailingHeight(geom.cellFlowPlan, currentMarginBottom)
          : undefined;
        const height = cellFlowPlan?.paginationHeight ?? naturalHeight;
        // 表格按「整表最大高度」keep-together：能放进一整页就整块走（放不下当前页剩余则跳下一页），
        // **只有整表高过一整页才带按行切点、拆分**——不再 Word 式拆开填当前页。
        let splitOffsets: number[] | undefined;
        let preferredSplitOffsets: number[] | undefined;
        let repeatHeaderHeight: number | undefined;
        if (opts && geom.rows.length && height > opts.contentHeight) {
          if (cellFlowPlan) {
            splitOffsets = [...cellFlowPlan.splitOffsets];
            preferredSplitOffsets = cellFlowPlan.segments
              .filter(segment => segment.breakAfter?.kind === 'row')
              .map(segment => segment.toOffset);
          } else {
            const bottoms = geom.rows.map(r => r.bottom);
          // splitOffsets = 可断边界，**排除带内容合并单元格内部**（这类不可拆、拆开必溢出页底 → keep-together）；
          // 空合并单元格内部仍可断（续段为空、不溢出）。无内容合并时与 widowOrphanCuts 等价。
            const splittable = rowSplitOffsets(bottoms, geom.rows.map(r => r.coveredByContentMerge ?? false), opts.widowOrphanLines);
            if (splittable.length) splitOffsets = splittable;
          // 优先「干净」边界（不跨任何合并单元格）；引擎优先选这些、实在不行才切空合并单元格的边界。
            const clean = rowSplitOffsets(bottoms, geom.rows.map(r => r.coveredFromAbove), opts.widowOrphanLines);
            if (clean.length) preferredSplitOffsets = clean;
          }
          // [临时禁用 2026-06-30] 续页重复表头复制 bug 较多，先关掉（屏幕不插表头克隆、引擎不预留续页表头高）。
          // 恢复：取消下行注释 + table.block.ts applyPaginationBreaks 的克隆插入 + print-paginator.ts 的表头高读取。
          // if (geom.headerHeight > 0) repeatHeaderHeight = geom.headerHeight;
        }
        const meta: LivePaginationMeasurement = {
          id,
          flavour: block.flavour,
          nodeType: block.nodeType,
          isHeading: this._isHeading(block),
          naturalHeight,
          height,
          trailingSpacing: currentMarginBottom,
          splitOffsets,
          preferredSplitOffsets,
          repeatHeaderHeight,
          tableRows: geom.rows,
        };
        setTableCellFlowPlan(meta, cellFlowPlan);
        this._appendMeasurement(metas, id, el, options, meta);
        continue;
      }

      // capHeight 块超高时锁定分页占位到一页内；图片/视频只约束媒体 wrapper。
      // 通常 scrollHeight 能保留未裁剪的完整内容高；代码块的 flex 内滚动布局会让它在锁定后
      // 一起降到页高，因此再由 _resolveCapHeight 保留最后一次未受约束的高度，阻断锁/解锁反馈环。
      const policy = resolveBlockPolicy({
        flavour: block.flavour,
        nodeType: block.nodeType,
      });
      const capHeight = policy.capHeight;
      const naturalDom = this._measureNaturalDom(el, capHeight, opts?.contentWidth)
      const mb = naturalDom.marginBottom
      // Safari 中带固定高度子卡片的 iframe block 可能由 visible overflow 绘制：顶层
      // host.offsetHeight 只含品牌/链接，而 scrollHeight 才覆盖屏幕上实际可见的整张卡片。
      // hidden/clip/scroll 宿主的溢出则不可见，不能把内部 scrollHeight 算进页槽。
      const renderedHeight = naturalDom.renderedHeight
      const domNaturalContentHeight = capHeight
        ? this._resolveCapHeight(el, renderedHeight, opts?.contentHeight)
        : renderedHeight;
      const objectDimensions = block.flavour === 'image'
        ? this.doc.objectSizing?.resolve(block.flavour, block.props)
        : null
      const naturalContentHeight = objectDimensions
        ? this._resolveImageNaturalHeight(
            el,
            objectDimensions.height,
            domNaturalContentHeight,
            naturalDom.mediaSurfaceHeight,
          )
        : domNaturalContentHeight
      const naturalHeight = naturalContentHeight + mb;
      const pageMedia = canFitPageMedia(el, block.flavour)
      const mediaHeight = pageMedia
        ? naturalDom.mediaSurfaceHeight ?? naturalContentHeight
        : null
      const nonMediaStride = mediaHeight != null
        ? Math.max(0, naturalHeight - mediaHeight)
        : 0
      // 图片主体几何由 wr/ar + rootContentWidth 唯一决定；视频读取实际 wrapper。
      const naturalWidth = pageMedia
        ? naturalDom.mediaSurfaceWidth ?? naturalDom.width
        : objectDimensions
        ? Math.min(
            objectDimensions.width,
            opts?.contentWidth ?? objectDimensions.width,
          )
        : naturalDom.width
      const widthScale = pageMedia
        && !policy.breakable
        && opts?.contentWidth != null
        && opts.contentWidth > 0
        && naturalWidth > opts.contentWidth + 0.5
          ? opts.contentWidth / naturalWidth
          : 1
      const heightScale = pageMedia
        && mediaHeight != null
        && mediaHeight > 0
        && opts
        && opts.contentHeight > 0
        && naturalHeight > opts.contentHeight
          ? Math.max(0.01, opts.contentHeight - nonMediaStride) / mediaHeight
          : 1
      const fitScale = Math.max(0.01, Math.min(1, widthScale, heightScale))
      if (capHeight && opts && opts.contentHeight > 0 && naturalContentHeight > opts.contentHeight) {
        // 图片/视频只约束媒体 wrapper，caption/尾距保持正常字号和自然高度。
        const fittedHeight = pageMedia && mediaHeight != null && fitScale < 1
          ? mediaHeight * fitScale + nonMediaStride
          : opts.contentHeight
        this._appendMeasurement(metas, id, el, options, {
          id,
          flavour: block.flavour,
          nodeType: block.nodeType,
          isHeading: this._isHeading(block),
          naturalHeight,
          height: fittedHeight,
          trailingSpacing: mb,
          lockHeight: pageMedia && fitScale < 1 ? undefined : opts.contentHeight,
          fitScale: pageMedia && fitScale < 1 ? fitScale : undefined,
        });
        continue;
      }

      if (pageMedia && mediaHeight != null && fitScale < 1) {
        this._appendMeasurement(metas, id, el, options, {
          id,
          flavour: block.flavour,
          nodeType: block.nodeType,
          isHeading: this._isHeading(block),
          naturalHeight,
          height: mediaHeight * fitScale + nonMediaStride,
          trailingSpacing: mb,
          fitScale,
        })
        continue
      }

      this._appendMeasurement(metas, id, el, options, {
        id,
        flavour: block.flavour,
        nodeType: block.nodeType,
        isHeading: this._isHeading(block),
        naturalHeight,
        height: naturalHeight,
        trailingSpacing: mb,
        ...this._measureInlineBreakMetadata(
          block,
          el,
          naturalHeight,
          policy.breakable,
          opts,
        ),
      });
    }
    return metas;
  }

  private _cachedMeasurement(
    blockId: string,
    host: HTMLElement,
    options: MeasurementOptionsKey,
  ): LivePaginationMeasurement | null {
    if (!this._hasReusableMeasurement(blockId, host, options)) return null;
    return cloneLivePaginationMeasurement(
      this._completedMeasurements.get(host)!.value,
    );
  }

  private _hasReusableMeasurement(
    blockId: string,
    host: HTMLElement,
    options: MeasurementOptionsKey,
  ): boolean {
    const cached = this._completedMeasurements.get(host);
    return !!cached
      && cached.blockId === blockId
      && cached.epoch === this._measurementEpoch
      && measurementOptionsEqual(cached.options, options)
  }

  private _appendMeasurement(
    target: LivePaginationMeasurement[],
    blockId: string,
    host: HTMLElement,
    options: MeasurementOptionsKey,
    value: LivePaginationMeasurement,
  ): void {
    const cachedValue = cloneLivePaginationMeasurement(value);
    this._completedMeasurements.set(host, {
      blockId,
      epoch: this._measurementEpoch,
      options,
      borderBoxSize: host.offsetHeight,
      value: cachedValue,
    });
    this._pendingInitialResize.delete(host);
    target.push(value);
  }

  private _childHosts(rootIds?: readonly string[]): HTMLElement[] {
    const hosts: HTMLElement[] = [];
    for (const id of rootIds ?? this.doc.root.childrenIds) {
      const el = this._safeBlock(id)?.hostElement;
      if (el) hosts.push(el);
    }
    return hosts;
  }

  private _safeBlock(id: string): any | null {
    let missing = false;
    try {
      const block = this.doc.getBlockById(id, () => { missing = true; });
      return missing ? null : block;
    } catch {
      return null;
    }
  }

  private _isHeading(block: any): boolean {
    // editable-block 暴露 get heading()；兜底读 model.props.heading
    return isPaginationHeading({
      nodeType: block?.nodeType,
      heading: block?.heading ?? block?.model?.props?.heading,
      plainTextOnly: block?.plainTextOnly === true,
    });
  }

  /**
   * Measure visual lines only for a supported editable block that is genuinely
   * taller than a full page. Ordinary paragraphs stay on the cheap height-only
   * path and therefore keep their whole-block pagination semantics.
   */
  private _measureInlineBreakMetadata(
    block: any,
    host: HTMLElement,
    naturalHeight: number,
    breakable: boolean,
    opts?: MeasureOptions,
  ): Pick<BlockMeta, 'inlineBreakPlan' | 'splitOffsets'> {
    if (
      !opts
      || !breakable
      || opts.contentHeight <= 0
      || naturalHeight <= opts.contentHeight
      || block?.nodeType !== BlockNodeType.editable
    ) {
      return {}
    }

    let runtime: object | null = null
    let container: HTMLElement | null = null
    try {
      runtime = block.runtime ?? null
      container = block.containerElement ?? null
    } catch {
      return {}
    }
    if (!runtime || !container || !container.isConnected) return {}

    const requestedSamples = Math.min(
      MAX_INLINE_LINE_SAMPLES,
      Math.max(
        MIN_INLINE_LINE_SAMPLES,
        Math.ceil(naturalHeight / opts.contentHeight)
          * INLINE_LINE_SAMPLES_PER_PAGE,
      ),
    )
    const lines = measureInlinePaginationLineStarts(runtime, requestedSamples)
    if (!lines.length) return {}

    const minimum = Math.max(1, Math.floor(opts.widowOrphanLines))
    const totalLines = lines.length + 1
    const strictLines = lines.filter((_line, index) => {
      const boundaryLine = index + 1
      return boundaryLine >= minimum
        && totalLines - boundaryLine >= minimum
    })
    // A genuinely oversized paragraph must not fall back to atomic overflow
    // solely because 2/2 aesthetics remove every cut. Relax to 1/1 only when
    // the strict set is empty.
    const usableLines = strictLines.length ? strictLines : lines
    const hostRect = host.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const hostLayoutHeight = host.offsetHeight
    const plan = createInlinePaginationBreakPlan(
      usableLines.map(line => ({
        layoutOffset: visualDistanceToHostLayout(
          containerRect.top - hostRect.top + line.top,
          hostRect.height,
          hostLayoutHeight,
        ),
        textOffset: line.offset,
      })),
      naturalHeight,
    )
    return breakPlanMetadata(plan)
  }

  private _handleResize(entries: readonly ResizeObserverEntry[]): void {
    let hasNaturalResize = false;
    for (const entry of entries) {
      const host = entry.target as HTMLElement;
      const actual = resizeEntryBlockSize(entry);
      const isInitialDelivery = this._pendingInitialResize.delete(entry.target);
      const expected = this._layoutOwnedBlockSizes.get(entry.target);
      if (expected !== undefined) {
        // 每个期望值只消费一次；后续变化必须重新进入分页测量。
        this._layoutOwnedBlockSizes.delete(entry.target);
        if (Number.isFinite(actual) && Math.abs(actual - expected) <= 0.5) {
          this._updateCachedBorderBoxSize(host, actual);
          continue;
        }
        this._invalidateHostMeasurement(host);
        hasNaturalResize = true;
        continue;
      }

      const completed = this._completedMeasurements.get(host);
      if (
        completed
        && completed.epoch === this._measurementEpoch
        && Number.isFinite(actual)
        && Math.abs(actual - completed.borderBoxSize) <= 0.5
      ) {
        // ResizeObserver 在重新 observe retained host 时仍会投递一次初始值。
        // 同一 host、同一最终 border-box 不代表自然布局变化，保留完成态即可。
        completed.borderBoxSize = actual;
        continue;
      }

      if (isInitialDelivery && !completed) {
        // A cold/new host is already queued for mounted-window measurement by
        // the controller. Its mandatory initial RO delivery must not promote
        // that O(mounted) verification into a full pagination recompute.
        continue;
      }

      this._invalidateHostMeasurement(host);
      hasNaturalResize = true;
    }
    if (hasNaturalResize) this.resize$.next();
  }

  private _updateCachedBorderBoxSize(host: HTMLElement, value: number): void {
    const completed = this._completedMeasurements.get(host);
    if (completed?.epoch === this._measurementEpoch) {
      completed.borderBoxSize = value;
    }
  }

  private _invalidateHostMeasurement(host: HTMLElement): void {
    this._naturalDom.delete(host);
    this._completedMeasurements.delete(host);
  }

  private _resolveCapHeight(
    el: HTMLElement,
    renderedHeight: number,
    contentHeight?: number,
  ): number {
    const isSaturatedLock = el.classList.contains('bc-page-height-locked')
      && contentHeight != null
      && contentHeight > 0
      && renderedHeight >= contentHeight - 1;

    if (isSaturatedLock) {
      return Math.max(renderedHeight, this._lastUncappedHeights.get(el) ?? renderedHeight);
    }

    this._lastUncappedHeights.set(el, renderedHeight);
    return renderedHeight;
  }

  private _measureNaturalDom(
    el: HTMLElement,
    capHeight: boolean,
    contentWidth?: number,
  ): NaturalDomSnapshot {
    const contextWidth = Number.isFinite(contentWidth) && contentWidth! > 0
      ? contentWidth!
      : null
    const fitted = hasPageMediaFit(el)
    const cached = this._naturalDom.get(el)
    if (
      fitted &&
      cached &&
      cached.epoch === this._measurementEpoch &&
      cached.snapshot.contentWidth === contextWidth
    ) {
      return cached.snapshot
    }

    // 虚拟渲染 reattach 时 HeightLockApplier 可能先把上一轮媒体 max-size 状态
    // 投影到新宿主；高宽必须在同一个未约束状态中读取。
    const locked = fitted && el.classList.contains('bc-page-height-locked')
    if (locked) el.classList.remove('bc-page-height-locked')
    let measurement: NaturalDomSnapshot
    try {
      measurement = suspendPageMediaFit(el, () => {
        const style = getComputedStyle(el)
        const surface = resolvePageMediaSurface(el)
        return {
          width: measureBlockContentWidth(el, contentWidth),
          renderedHeight: measureBlockVisualHeight(el, capHeight, style),
          marginBottom: parseFloat(style.marginBottom) || 0,
          mediaSurfaceWidth: surface
            ? Math.max(surface.offsetWidth, surface.scrollWidth)
            : null,
          mediaSurfaceHeight: surface
            ? Math.max(surface.offsetHeight, surface.scrollHeight)
            : null,
          contentWidth: contextWidth,
        }
      })
    } finally {
      if (locked) el.classList.add('bc-page-height-locked')
    }
    if (measurement.width > 0) {
      this._naturalDom.set(el, {
        epoch: this._measurementEpoch,
        snapshot: measurement,
      })
    }
    return measurement
  }

  private _resolveImageNaturalHeight(
    host: HTMLElement,
    modelHeight: number,
    domNaturalHeight: number,
    measuredWrapperHeight: number | null,
  ): number {
    if (!Number.isFinite(modelHeight) || modelHeight <= 0) {
      return domNaturalHeight
    }
    const wrapper = host.querySelector<HTMLElement>('.img-wrapper')
    if (!wrapper) return modelHeight
    const wrapperHeight = measuredWrapperHeight
      ?? Math.max(wrapper.offsetHeight, wrapper.scrollHeight)
    const extraHeight = Number.isFinite(wrapperHeight) && wrapperHeight > 0
      ? Math.max(0, domNaturalHeight - wrapperHeight)
      : 0
    return modelHeight + extraHeight
  }

  destroy(): void {
    this._ro.disconnect();
    this._observed.clear();
    this._layoutOwnedBlockSizes.clear();
    this._naturalDom = new WeakMap();
    this._completedMeasurements = new WeakMap();
    this._pendingInitialResize = new WeakSet();
    this.resize$.complete();
  }
}

function measurementOptionsKey(opts?: MeasureOptions): MeasurementOptionsKey {
  return {
    contentHeight: finiteOption(opts?.contentHeight),
    contentWidth: finiteOption(opts?.contentWidth),
    widowOrphanLines: finiteOption(opts?.widowOrphanLines),
  }
}

function finiteOption(value: number | undefined): number | null {
  return Number.isFinite(value) ? value! : null
}

function measurementOptionsEqual(
  left: MeasurementOptionsKey,
  right: MeasurementOptionsKey,
): boolean {
  return left.contentHeight === right.contentHeight
    && left.contentWidth === right.contentWidth
    && left.widowOrphanLines === right.widowOrphanLines
}

function cloneLivePaginationMeasurement(
  source: LivePaginationMeasurement,
): LivePaginationMeasurement {
  const clone: LivePaginationMeasurement = {
    ...source,
    splitOffsets: source.splitOffsets ? [...source.splitOffsets] : undefined,
    inlineBreakPlan: cloneInlinePaginationBreakPlan(source.inlineBreakPlan),
    preferredSplitOffsets: source.preferredSplitOffsets
      ? [...source.preferredSplitOffsets]
      : undefined,
    tableRows: source.tableRows?.map(row => ({...row})),
  }
  const cellFlowPlan = getTableCellFlowPlan(source)
  setTableCellFlowPlan(
    clone,
    cellFlowPlan ? cloneTableCellFlowPlan(cellFlowPlan) : undefined,
  )
  return clone
}

function resizeEntryBlockSize(entry: ResizeObserverEntry): number {
  const borderBox = entry.borderBoxSize as unknown as
    | readonly ResizeObserverSize[]
    | ResizeObserverSize
    | undefined;
  const size = Array.isArray(borderBox) ? borderBox[0] : borderBox;
  if (size && Number.isFinite(size.blockSize)) return size.blockSize;
  return entry.target.getBoundingClientRect().height;
}

function breakPlanMetadata(
  plan: InlinePaginationBreakPlan | undefined,
): Pick<BlockMeta, 'inlineBreakPlan' | 'splitOffsets'> {
  if (!plan) return {}
  return {
    inlineBreakPlan: plan,
    splitOffsets: plan.points.map(point => point.layoutOffset),
  }
}

function appendTrailingHeight(
  source: TableCellFlowPlan,
  trailing: number,
): TableCellFlowPlan {
  const plan = cloneTableCellFlowPlan(source);
  if (trailing <= 0 || !plan.segments.length) return plan;
  const last = plan.segments[plan.segments.length - 1];
  last.height += trailing;
  last.toOffset += trailing;
  plan.paginationHeight += trailing;
  return plan;
}
