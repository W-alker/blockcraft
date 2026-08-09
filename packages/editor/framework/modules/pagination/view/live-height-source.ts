// packages/editor/framework/modules/pagination/view/live-height-source.ts
import {Subject} from "rxjs";
import {BlockNodeType} from "../../../block-std/types/block.type";
import {resolveBlockPolicy} from "../engine";
import {
  cloneTableCellFlowPlan,
  TableCellFlowPlan,
} from "../engine/table-cell-flow";
import {setTableCellFlowPlan} from "../engine/table-cell-flow-metadata";
import {BlockMeta} from "./item-builder";
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
  private _naturalDom = new Map<HTMLElement, NaturalDomSnapshot>();
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
    this.invalidateNaturalMeasurements();
  }

  /** 字体/主题/宿主布局上下文变化后，下一轮必须重读未 fit DOM。 */
  invalidateNaturalMeasurements(): void {
    this._naturalDom.clear();
  }

  /** 根据当前 root 子块同步 observe 集合（增 observe、删 unobserve）。 */
  syncObserved(rootIds?: readonly string[]): void {
    const hosts = new Set<Element>(this._childHosts(rootIds));
    for (const el of Array.from(this._observed)) {
      if (!hosts.has(el)) {
        this._ro.unobserve(el);
        this._observed.delete(el);
        this._layoutOwnedBlockSizes.delete(el);
        this._naturalDom.delete(el as HTMLElement);
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
   * 按文档顺序测量 root 顶层块，产出 BlockMeta[]。
   * 表格（实现了分页协作 API）用「自然几何」测高、读行边界：oversized 时产出按行切点，
   * 供引擎在屏幕上跨页拆分。读自然值（排除已施加的占位行）保证不形成测量反馈环。
   */
  measure(
    opts?: MeasureOptions,
    rootIds?: readonly string[],
  ): LivePaginationMeasurement[] {
    const metas: LivePaginationMeasurement[] = [];
    for (const id of rootIds ?? this.doc.root.childrenIds) {
      const block = this._safeBlock(id);
      if (!block) continue;
      const el = block.hostElement;
      const cs = getComputedStyle(el);
      // 忽略 margin-top（它要么是 0，要么是 gap-applier 施加的下推间隙，都不算块自身高度）。
      const currentMarginBottom = parseFloat(cs.marginBottom) || 0;

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
          isHeading: false,
          naturalHeight,
          height,
          trailingSpacing: currentMarginBottom,
          splitOffsets,
          preferredSplitOffsets,
          repeatHeaderHeight,
          tableRows: geom.rows,
        };
        setTableCellFlowPlan(meta, cellFlowPlan);
        metas.push(meta);
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
        metas.push({
          id,
          flavour: block.flavour,
          nodeType: block.nodeType,
          isHeading: false,
          naturalHeight,
          height: fittedHeight,
          trailingSpacing: mb,
          lockHeight: pageMedia && fitScale < 1 ? undefined : opts.contentHeight,
          fitScale: pageMedia && fitScale < 1 ? fitScale : undefined,
        });
        continue;
      }

      if (pageMedia && mediaHeight != null && fitScale < 1) {
        metas.push({
          id,
          flavour: block.flavour,
          nodeType: block.nodeType,
          isHeading: false,
          naturalHeight,
          height: mediaHeight * fitScale + nonMediaStride,
          trailingSpacing: mb,
          fitScale,
        })
        continue
      }

      metas.push({
        id,
        flavour: block.flavour,
        nodeType: block.nodeType,
        isHeading: this._isHeading(block),
        naturalHeight,
        height: naturalHeight,
        trailingSpacing: mb,
      });
    }
    return metas;
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
    if (block?.nodeType !== BlockNodeType.editable) return false;
    // editable-block 暴露 get heading()；兜底读 model.props.heading
    return !!(block.heading ?? block.model?.props?.heading);
  }

  private _handleResize(entries: readonly ResizeObserverEntry[]): void {
    let hasNaturalResize = false;
    for (const entry of entries) {
      const expected = this._layoutOwnedBlockSizes.get(entry.target);
      if (expected === undefined) {
        this._naturalDom.delete(entry.target as HTMLElement)
        hasNaturalResize = true;
        continue;
      }

      // 每个期望值只消费一次；后续变化必须重新进入分页测量。
      this._layoutOwnedBlockSizes.delete(entry.target);
      const actual = resizeEntryBlockSize(entry);
      if (!Number.isFinite(actual) || Math.abs(actual - expected) > 0.5) {
        this._naturalDom.delete(entry.target as HTMLElement)
        hasNaturalResize = true;
      }
    }
    if (hasNaturalResize) this.resize$.next();
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
      cached.contentWidth === contextWidth
    ) {
      return cached
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
      this._naturalDom.set(el, measurement)
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
    this._naturalDom.clear();
    this.resize$.complete();
  }
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
