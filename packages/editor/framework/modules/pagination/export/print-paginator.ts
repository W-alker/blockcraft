// packages/editor/framework/modules/pagination/export/print-paginator.ts
import {createSnapshotRenderer} from "../../../../snapshot-viewer";
import {IBlockSnapshot} from "../../../block-std/types/block.type";
import {
  isManualBreak,
  fitsOversizedMedia,
  paginate,
  PageSlotFragment,
  PaginationItem,
  resolveBlockPolicy,
} from "../engine";
import {
  TableCellFlowAnchor,
  TableCellFlowPlan,
} from "../engine/table-cell-flow";
import {getTableCellFlowPlan} from "../engine/table-cell-flow-metadata";
import {PageChrome, PaginationConfig} from "../pagination.types";
import {resolveScreenGeometry} from "../view/pagination-geometry";
import {resolveChromeSegments} from "../view/chrome-tokens";
import {
  measureBlockContentWidth,
  measureBlockVisualHeight,
} from '../view/block-visual-height'
import {computeSplitOffsets, computeTableSplitOffsets} from "../view/split-points";
import {StablePaginationLayout} from "../view/stable-pagination-layout";
import {
  PaginationExportError,
  PaginationExportWarning,
  PaginationRenderStabilityOptions,
  PaginationResourcePolicy,
} from "./pdf-export.types";
import {appendFlowSentinel} from './print-dom';
import {finalizeWordArtVectorsForPrint} from './print-word-art'
import {preparePrintResources} from "./print-resources";
import {waitForPaginationRenderStable} from './render-stability'
import {resolvePrintPageDimensions} from './print-page-geometry'

/**
 * 打印内容渲染来源：在指定内容宽下离屏渲染快照，返回承载已渲染顶层块（带 `data-block-id`）的根元素
 * 与清理函数。`buildPrintPages` 据此把块搬进逐页 A4 页盒。
 */
export interface PrintRenderResult {
  root: HTMLElement;
  dispose(): void;
  /**
   * 不属于文档 block snapshot、但属于首页正文流的宿主内容（例如文档标题区）。
   *
   * 屏幕分页先把它作为 documentHeader 测入 firstPageContentHeight；打印面必须消费
   * 同一个稳定布局，并把同一 DOM 放回首页正文流，不能再伪造成普通 block 后重新分页。
   */
  leadingContent?: {
    element: HTMLElement;
    gap?: number;
  };
  /**
   * 返回打印正文起点之前、仅首页存在的渲染高度。
   *
   * 宿主若把屏幕上的 document header 作为导出副本的合成首块插入 flow，
   * placement-layout 的 y=0 仍然属于 header 之后的正文原点。该值必须在资源稳定后
   * 重新测量，所以使用 resolver，而不是 render() 返回时就冻结一次高度。
   */
  resolvePlacementOriginOffset?(): number;
  /**
   * 分页视图中 placement-layout 相对分页 root 的实际 Y 原点（layout px）。
   *
   * `PaginationConfig` 只能推导理论内容起点；宿主 documentHeader、页面 surface
   * 或主题若改变了最终 formatting context，导出必须消费隔离分页视图已经投影出的
   * 真实原点，不能再用同一组配置重复猜一次。
   */
  placementOriginY?: number;
}

export type PrintRenderProvider = (contentWidthPx: number) => Promise<PrintRenderResult>;

export interface PrintPages {
  /** 包含 N 个 `.bc-print-page` 的容器（已挂到 document.body 的离屏位置）。 */
  container: HTMLElement;
  pages: HTMLElement[];
  pageCount: number;
  /** 浏览器 `@page` / slot / page box 共用的物理 CSS 尺寸。 */
  pageWidthCss: string;
  pageHeightCss: string;
  /** 单页像素尺寸（供宿主原生打印后端记录纸面几何）。 */
  pageWidthPx: number;
  pageHeightPx: number;
  /** 纸张点尺寸（pt，供原生打印后端使用）。 */
  pageWidthPt: number;
  pageHeightPt: number;
  /** 当前分页视图布局版本；重新排版或旧兼容路径没有该值。 */
  layoutRevision?: number;
  /** best-effort 资源/几何降级信息。 */
  warnings?: PaginationExportWarning[];
  /** 清理离屏 DOM + snapshot renderer。 */
  dispose(): void;
}

export interface BuildPrintPagesOverride {
  /** @deprecated 兼容入口；新 WYSIWYG 路径应传 layout，避免二次 paginate。 */
  items?: PaginationItem[];
  /** 当前分页视图捕获的稳定布局。存在时直接消费 result，不重新分页。 */
  layout?: StablePaginationLayout;
  /** 内容渲染来源；WYSIWYG 路径必须传 readonlyDocRenderProvider。 */
  render?: PrintRenderProvider;
  resourcePolicy?: PaginationResourcePolicy;
  signal?: AbortSignal;
  stability?: PaginationRenderStabilityOptions;
}

const PLACEMENT_LAYOUT_FLAVOUR = 'placement-layout';

/**
 * 由快照 + 分页配置构建「逐页 A4 页容器」的打印 DOM：
 * - snapshot-viewer 离屏渲染（纯 DOM、非 contenteditable，规避 WKWebView 克隆 bug）；
 * - 在页面内容宽下测量顶层块高度，跑分页引擎（块感知、防分割、识别 page-divider 强制分页）；
 * - 把每页的块搬进真实 A4 页盒，页眉/页脚/页码逐页烘焙。
 *
 * 产物可被浏览器打印 iframe 或当前顶层 WebView 的宿主原生打印后端消费。
 */
export async function buildPrintPages(
  snapshot: IBlockSnapshot,
  config: PaginationConfig,
  override?: BuildPrintPagesOverride,
): Promise<PrintPages> {
  return buildPaginatedPrintSurface(snapshot, config, override);
}

/** 构建统一分页打印面；屏幕稳定布局、浏览器打印与宿主原生打印共用该入口。 */
export async function buildPaginatedPrintSurface(
  snapshot: IBlockSnapshot,
  config: PaginationConfig,
  override?: BuildPrintPagesOverride,
): Promise<PrintPages> {
  const effectiveConfig = override?.layout?.config ?? config;
  const geom = override?.layout?.geometry ?? resolveScreenGeometry(effectiveConfig);
  const {
    sheetWidthPx,
    sheetHeightPx,
    margins,
    headerHeight,
    footerHeight,
  } = geom;
  const headerDistance = geom.headerDistance ?? margins.top;
  const footerDistance = geom.footerDistance ?? margins.bottom;
  const contentTop = geom.contentTop ?? margins.top + headerHeight;
  const contentBottom = geom.contentBottom ?? margins.bottom + footerHeight;
  const contentWidthPx = sheetWidthPx - margins.left - margins.right;

  // pt 尺寸（宿主打印元数据）：命名纸张回到标准 pt，自定义按 px≈pt 处理。
  const printPage = resolvePrintPageDimensions(effectiveConfig);

  // 1) 渲染内容（内容宽）：默认离屏 snapshot-viewer；或调用方提供的 render（如只读编辑器渲染）。
  let renderRoot: HTMLElement;
  let disposeRender: () => void;
  let resolvePlacementOriginOffset: (() => number) | undefined;
  let capturedPlacementOriginY: number | undefined;
  let leadingContent: PrintRenderResult['leadingContent'];
  let leadingStage: {root: HTMLElement; host: HTMLElement} | undefined;
  if (override?.render) {
    const r = await override.render(contentWidthPx);
    renderRoot = r.root;
    disposeRender = r.dispose;
    resolvePlacementOriginOffset = r.resolvePlacementOriginOffset;
    capturedPlacementOriginY = r.placementOriginY;
    leadingContent = r.leadingContent;
  } else {
    const offscreen = document.createElement('div');
    offscreen.setAttribute('data-bc-print-offscreen', 'true');
    offscreen.style.cssText =
      `position:absolute; left:-99999px; top:0; width:${contentWidthPx}px; pointer-events:none;`;
    document.body.appendChild(offscreen);
    const renderer = createSnapshotRenderer({resourcePolicy: 'eager'});
    renderer.render(offscreen, snapshot);
    await waitForRender(offscreen);
    renderRoot = (offscreen.querySelector('[data-blockcraft-root]') as HTMLElement | null) ?? offscreen;
    disposeRender = () => {
      offscreen.remove();
      renderer.destroy();
    };
  }

  // live 分页 root 尾部含编辑器/分页辅助节点，因此末块不会命中
  // `[data-block-id]:last-child { margin-bottom: 0 }`。自定义 render provider 却可能
  // 直接返回 disable 分页后的纯文档 root，若到搬入页盒后才补哨兵，稳定布局
  // 校验时已经丢了末块间距。在资源稳定和任何测量之前统一根结构。
  appendFlowSentinel(renderRoot);

  if (leadingContent) {
    // Header 必须先在“最终纸盒 + 最终正文宽度”里完成资源等待和高度测量。
    // 若在宿主导出窗（通常约 800px）里先读 offsetHeight，再搬进 A4 正文宽，
    // 长标题会在搬入后才换行，稳定布局校验反而比较了错误的几何。
    leadingStage = stageLeadingContent(
      leadingContent.element,
      printPage,
      contentTop,
      margins,
    );
  }

  let warnings: PaginationExportWarning[] = [];
  try {
    const prepared = await preparePrintResources(renderRoot, {
      resourcePolicy: override?.resourcePolicy,
      signal: override?.signal,
    });
    warnings = prepared.warnings;
    await waitForPaginationRenderStable(renderRoot, override?.stability, override?.signal)
    if (leadingContent) {
      const preparedLeading = await preparePrintResources(leadingContent.element, {
        resourcePolicy: override?.resourcePolicy,
        signal: override?.signal,
      });
      warnings.push(...preparedLeading.warnings);
      await waitForPaginationRenderStable(
        leadingContent.element,
        override?.stability,
        override?.signal,
      );
    }
  } catch (error) {
    if (
      override?.resourcePolicy === 'best-effort'
      && error instanceof PaginationExportError
      && error.code === 'layout-not-ready'
    ) {
      warnings.push({
        code: error.code,
        message: error.message,
        ...error.context,
      })
    } else {
      leadingStage?.root.remove();
      disposeRender();
      throw error;
    }
  }

  // 2) 顶层块 id → 渲染 DOM（始终建立，用于把块搬进页盒）。按唯一 id 在渲染根内查找，
  //    兼容两种渲染源（snapshot-viewer 的 data-blockcraft-root 直接子级 / 只读 doc 的嵌套结构）。
  const topSnapshots = (snapshot.children as IBlockSnapshot[]) ?? [];
  const elById = new Map<string, HTMLElement>();
  for (const blk of topSnapshots) {
    const el = renderRoot.querySelector(`[data-block-id="${blk.id}"]`) as HTMLElement | null;
    if (el) elById.set(blk.id, el);
  }
  // placement-layout 是 root 尾部的零高基础设施节点，但它的绝对定位子块使用的是
  // 整个分页画布的连续坐标，而不是“该节点所在 slot”的页内坐标。它不能像普通块
  // 一样随 slot 搬到最后一页；打印阶段会在每个纸盒内投影同一全局平面。
  const placementPlaneIds = new Set(
    topSnapshots
      .filter(block => block.flavour === PLACEMENT_LAYOUT_FLAVOUR)
      .map(block => block.id),
  );
  try {
    for (const block of topSnapshots) {
      if (
        block.flavour === PLACEMENT_LAYOUT_FLAVOUR
        && Array.isArray(block.children)
        && block.children.length > 0
        && !elById.has(block.id)
      ) {
        reportLayoutDivergence(
          block.id,
          '只读打印面缺少包含绝对定位内容的 placement-layout',
          override?.resourcePolicy ?? 'strict',
          warnings,
        );
      }
    }
  } catch (error) {
    leadingStage?.root.remove();
    disposeRender();
    throw error;
  }
  const placementPlanes = Array.from(placementPlaneIds, id => elById.get(id))
    .filter((element): element is HTMLElement => !!element);

  // 分页 items：优先用调用方传入的（屏幕 live 测量，保证打印断点 == 屏幕所见）；
  // 否则就地测离屏渲染高度（无 live 编辑器的纯导出路径，行为同前）。
  const measuredItems: readonly PaginationItem[] = override?.layout?.items
    ?? override?.items
    ?? measureItemsFromDom(
      topSnapshots,
      elById,
      geom.geometry.contentHeight,
      contentWidthPx,
      effectiveConfig,
    );
  // 没有 live layout 的隔离导出会在这里重新 paginate；此时也必须彻底排除零高
  // placement 基础设施，避免它影响尾页归属/页数。若调用方传入稳定 result，result
  // 中的旧 slot 仍可保留，构页时会跳过并由全局平面投影替代。
  const items = measuredItems.filter(item => !placementPlaneIds.has(item.id));
  const itemById = new Map(items.map(item => [item.id, item]));

  // 只读打印 DOM 没有 live TableBlockComponent；按稳定快照里的同一组锚点插入“压缩页缝”——
  // 只补齐各列在同一页片段中的高度差，不包含屏幕纸间距。这样表格 DOM 的线性高度正好等于
  // tableCellFlowPlan.paginationHeight，下面通用 fragment window 可直接复用同一 from/toOffset。
  for (const item of items) {
    const tableCellFlowPlan = getTableCellFlowPlan(item);
    if (!tableCellFlowPlan) continue;
    const element = elById.get(item.id);
    if (element) applyPrintTableCellFlowProjection(element, tableCellFlowPlan);
  }

  // 3) 分页
  const result = override?.layout?.result ?? paginate([...items], geom.geometry);

  if (override?.layout) {
    try {
      validateStableLayout(
        items,
        result,
        topSnapshots,
        elById,
        override.resourcePolicy ?? 'strict',
        warnings,
      );
    } catch (error) {
      leadingStage?.root.remove();
      disposeRender();
      throw error;
    }
  }

  // capHeight 块只在确实超页时标记；媒体优先 fit，其余块由主题按页面内容高变量裁剪。
  const lockedIds = new Set<string>();
  const fitScaleById = new Map<string, number>();
  // 带表头表格的续页重复表头高：续页片段（fromOffset>0）顶部多渲一份表头窗口。
  const repeatHeaderById = new Map<string, number>();
  for (const it of items) {
    if (it.lockHeight != null && it.lockHeight > 0) lockedIds.add(it.id);
    if (it.fitScale != null && it.fitScale > 0 && it.fitScale < 1) fitScaleById.set(it.id, it.fitScale);
    if (it.repeatHeaderHeight != null && it.repeatHeaderHeight > 0) repeatHeaderById.set(it.id, it.repeatHeaderHeight);
  }

  // 4) 构建逐页 A4 容器，把块搬进去
  const container = document.createElement('div');
  container.className = 'bc-print-root';
  container.setAttribute('data-bc-print-root', 'true');
  container.style.cssText = `position:absolute; left:-99999px; top:0;`;

  const pageEls: HTMLElement[] = [];
  const total = result.pages.length;
  const geometryLeadingHeight = Math.max(
    0,
    geom.geometry.contentHeight
      - (geom.geometry.firstPageContentHeight ?? geom.geometry.contentHeight),
  );
  const leadingContentGap = leadingContent && Number.isFinite(leadingContent.gap)
    ? Math.max(0, leadingContent.gap ?? 0)
    : 0;
  const resolvedRenderedLeadingHeight = leadingContent
    ? leadingContent.element.offsetHeight + leadingContentGap
    : resolvePlacementOriginOffset?.() ?? 0;
  const renderedLeadingHeight = Number.isFinite(resolvedRenderedLeadingHeight)
    ? Math.max(0, resolvedRenderedLeadingHeight)
    : 0;
  if (
    leadingContent
    && override?.layout
    && Math.abs(geometryLeadingHeight - renderedLeadingHeight) > 2
  ) {
    container.remove();
    leadingStage?.root.remove();
    disposeRender();
    throw new PaginationExportError(
      'layout-diverged',
      `首页宿主内容高度 ${renderedLeadingHeight}px 与稳定分页布局 ${geometryLeadingHeight}px 不一致`,
      {stage: 'layout'},
    );
  }
  // 稳定布局是页断点的唯一来源；无稳定布局的兼容路径才使用渲染器测量值。
  const firstPageLeadingHeight = override?.layout
    ? geometryLeadingHeight
    : Math.max(geometryLeadingHeight, renderedLeadingHeight);
  const fallbackPlacementOriginY = contentTop + firstPageLeadingHeight;
  const stablePlacementOriginY = override?.layout?.placementOriginY;
  // 稳定布局和 placement 原点必须来自同一个同步捕获版本。render provider 的值仅
  // 保留给尚未升级 stable-layout 契约的宿主；最后才回退到理论页边距/leading 推导。
  const placementOriginY = Number.isFinite(stablePlacementOriginY)
    ? Math.max(0, stablePlacementOriginY ?? fallbackPlacementOriginY)
    : Number.isFinite(capturedPlacementOriginY)
      ? Math.max(0, capturedPlacementOriginY ?? fallbackPlacementOriginY)
      : fallbackPlacementOriginY;
  const screenPageStride = sheetHeightPx + geom.pageGap;
  for (const page of result.pages) {
    const pageEl = document.createElement('div');
    pageEl.className = 'bc-print-page';
    pageEl.style.cssText =
      `position:relative; box-sizing:border-box; overflow:hidden; background:#fff;` +
      `width:${printPage.widthCss}; height:${printPage.heightCss};`;
    appendPrintOnlyStyles(pageEl);

    const pageNo = page.index + 1;
    if (headerHeight > 0) {
      pageEl.appendChild(buildChrome(effectiveConfig.header, pageNo, total, headerDistance, headerHeight, margins));
    }
    if (footerHeight > 0) {
      const top = sheetHeightPx - footerDistance - footerHeight;
      pageEl.appendChild(buildChrome(effectiveConfig.footer, pageNo, total, top, footerHeight, margins));
    }

    // 内容区：用 data-blockcraft-root 包裹，保留主题后代选择器样式
    const content = document.createElement('div');
    content.setAttribute('data-blockcraft-root', 'true');
    // 复用主题中的 under(0) / flow(1) / over(2) 层级契约。没有这个标记时，
    // 克隆进来的 placement plane 会退回普通 DOM 绘制顺序，under 对象也可能盖住正文。
    content.setAttribute('data-bc-placement-container', '');
    content.className = 'readonly bc-print-content';
    // stable geometry 的 firstPageContentHeight 已经扣除了宿主 documentHeader。
    // 即使通用只读 provider 无法重建该宿主 DOM，正文也必须保留同一首页起点；
    // 否则 flow 会上移而 placement plane 仍停在 header 后，所有绝对块统一错位。
    const pageLeadingHeight = page.index === 0 && (
      leadingContent || (override?.layout && geometryLeadingHeight > 0)
    )
      ? firstPageLeadingHeight
      : 0;
    content.style.cssText =
      // base.scss 给所有 BlockCraft root 声明了 width:100%。绝对定位元素若同时带
      // left/right/width:100%，CSS 会忽略 right，使正文从左边距开始后仍占满整张纸，
      // 最终恰好多出一个右边距并在纸张边缘被裁掉。打印 root 必须显式 width:auto，
      // 让 left + right 成为正文宽度的唯一几何来源。
      `position:absolute; z-index:1; box-sizing:border-box; width:auto; min-width:0; max-width:none; min-height:0; padding:0; overflow:visible;` +
      `top:${contentTop + pageLeadingHeight}px; left:${margins.left}px; right:${margins.right}px;` +
      `bottom:${contentBottom}px;`;
    // 屏幕分页允许块的阴影、抓手和业务控件伸入页边距，最终只在纸张边缘裁剪。
    // 打印不能在正文区左右边界直接 overflow:hidden，否则所有块右缘都会少一截。
    // 分片窗口和锁高块各自负责内容裁剪，最后统一由 pageEl 在纸张边缘裁剪。
    content.style.setProperty('--bc-page-content-height', `${geom.geometry.contentHeight}px`);
    if (page.index === 0 && leadingContent) {
      const leadingHost = leadingStage?.host ?? document.createElement('div');
      leadingHost.className = 'bc-print-leading-content';
      leadingHost.style.cssText =
        `position:absolute; z-index:2; box-sizing:border-box; overflow:visible;` +
        `top:${contentTop}px; left:${margins.left}px; right:${margins.right}px;` +
        `height:${Math.max(0, firstPageLeadingHeight - leadingContentGap)}px;`;
      leadingContent.element.style.margin = '0';
      leadingHost.appendChild(leadingContent.element);
      pageEl.appendChild(leadingHost);
      leadingStage?.root.remove();
      leadingStage = undefined;
    }
    for (const slot of page.slots) {
      // placement-layout 在分页结果中是一个位于 root 尾部的零高 slot；其页归属不代表
      // 子块的视觉页归属。下面统一按全局 placement 坐标投影，避免整面被搬到末页。
      if (placementPlaneIds.has(slot.id)) continue;
      const el = elById.get(slot.id);
      if (!el) continue;
      if (slot.fragment) {
        // 续页（fromOffset>0）：带表头表格在 body 片段前多渲一份表头窗口（裁出 [0, headerH] = 表头行）。
        const headerH = repeatHeaderById.get(slot.id) ?? 0;
        if (slot.fragment.fromOffset > 0 && headerH > 0) {
          content.appendChild(buildFragmentWindow(el, {fromOffset: 0, toOffset: headerH}));
        }
        // 拆开的超大块：同块会落在多页，每个片段克隆一份，裁出 [fromOffset, toOffset] 纵向切片。
        content.appendChild(buildFragmentWindow(
          el,
          slot.fragment,
          itemById.get(slot.id)
            ? getTableCellFlowPlan(itemById.get(slot.id)!)
            : undefined,
        ));
      } else {
        // live paginated root 对所有直接 block 统一 margin-top:0；打印页重父后也必须
        // 固化同一约束，否则测量忽略的 margin-top 会在页盒内重新出现并下推内容。
        el.style.marginTop = '0';
        el.classList.toggle('bc-page-height-locked', lockedIds.has(slot.id));
        const fitScale = fitScaleById.get(slot.id);
        el.classList.toggle('bc-page-height-fitted', fitScale != null);
        if (fitScale != null) el.style.setProperty('--bc-page-fit-scale', `${fitScale}`);
        else el.style.removeProperty('--bc-page-fit-scale');
        // capHeight 块由锁定 class 约束；带 fitScale 的媒体/原子块改为整体缩放。
        content.appendChild(el); // 整块：搬移（从离屏 root 移走，DOM 节点唯一）
      }
    }
    appendPlacementPlanes(
      content,
      placementPlanes,
      placementOriginY
        - contentTop
        - pageLeadingHeight
        - page.index * screenPageStride,
      -margins.left,
      sheetWidthPx,
    );
    // live root 尾部存在编辑器辅助节点，因此最后一个顶层块不会命中
    // `[data-block-id]:last-child { margin-bottom: 0 }`。打印面没有这些辅助节点，
    // 补一个不参与布局的结构哨兵，确保逐页搬移后仍保留分页计算时的块间距。
    appendFlowSentinel(content);
    pageEl.appendChild(content);
    container.appendChild(pageEl);
    pageEls.push(pageEl);
  }

  document.body.appendChild(container);

  // WordArt 的 SVG 必须在只读渲染和布局稳定阶段已经完成。页盒组装后
  // 只验收并复用同一 SVG 节点；不允许从最终纸面重读 Range/DOMRect 或重建。
  try {
    finalizeWordArtVectorsForPrint(container);
  } catch (error) {
    container.remove();
    leadingStage?.root.remove();
    disposeRender();
    throw error;
  }

  return {
    container,
    pages: pageEls,
    pageCount: total,
    pageWidthCss: printPage.widthCss,
    pageHeightCss: printPage.heightCss,
    pageWidthPx: printPage.widthPx,
    pageHeightPx: printPage.heightPx,
    pageWidthPt: printPage.widthPt,
    pageHeightPt: printPage.heightPt,
    layoutRevision: override?.layout?.revision,
    warnings,
    // 渲染源（snapshot-viewer 离屏 div / 只读 doc）在内容被搬进页盒后于 dispose 统一清理。
    // 注意：只读 doc 的块组件由其 doc 持有，dispose（destroy doc）会销毁这些已搬走的节点——
    // 故必须在 window.print() 之后再 dispose。
    dispose: () => {
      container.remove();
      leadingStage?.root.remove();
      disposeRender();
    },
  };
}

/** 在与最终打印页完全相同的宽度上下文中挂载首页宿主内容。 */
function stageLeadingContent(
  element: HTMLElement,
  page: ReturnType<typeof resolvePrintPageDimensions>,
  contentTop: number,
  margins: {top: number; right: number; bottom: number; left: number},
): {root: HTMLElement; host: HTMLElement} {
  const root = document.createElement('div');
  root.className = 'bc-print-root bc-print-leading-stage';
  root.style.cssText = 'position:absolute;left:-99999px;top:0;pointer-events:none;';

  const pageElement = document.createElement('div');
  pageElement.className = 'bc-print-page';
  pageElement.style.cssText =
    `position:relative;box-sizing:border-box;overflow:hidden;` +
    `width:${page.widthCss};height:${page.heightCss};`;

  const host = document.createElement('div');
  host.className = 'bc-print-leading-content';
  host.style.cssText =
    `position:absolute;z-index:2;box-sizing:border-box;overflow:visible;` +
    `top:${contentTop}px;left:${margins.left}px;right:${margins.right}px;`;
  element.style.margin = '0';
  host.appendChild(element);
  pageElement.appendChild(host);
  root.appendChild(pageElement);
  document.body.appendChild(root);
  return {root, host};
}

/**
 * 把 root 级 absolute placement 平面投影到单张打印纸。
 *
 * placement.y 属于分页屏幕的连续坐标系，其中每页步长包含纸高和屏幕 pageGap；
 * 打印纸盒没有 pageGap，因此每页克隆保持子块原始 y，只整体反向平移对应步长。
 * 首页文档头通过 firstPageLeadingHeight 占据同一连续坐标，必须一并补回。
 */
function appendPlacementPlanes(
  content: HTMLElement,
  sources: readonly HTMLElement[],
  top: number,
  left: number,
  width: number,
): void {
  for (const source of sources) {
    const plane = source.cloneNode(true) as HTMLElement;
    plane.setAttribute('data-bc-print-placement-plane', 'true');
    plane.style.top = `${top}px`;
    // live placement.x 是相对整张分页 root（含左右 padding）的百分比；打印正文盒仅有
    // content width。把 plane 向左扩回整张纸，才能让 x=0/50/100% 与屏幕保持同一坐标系。
    plane.style.left = `${left}px`;
    plane.style.right = 'auto';
    plane.style.width = `${width}px`;
    content.appendChild(plane);
  }
}

/** WebKit 通过伪元素透明化滚动条；保留原轨道尺寸，避免打印几何漂移。 */
function appendPrintOnlyStyles(page: HTMLElement): void {
  const style = document.createElement('style');
  style.setAttribute('data-bc-print-style', 'true');
  style.textContent = `
    .bc-print-content [data-bc-print-scrollable="true"]::-webkit-scrollbar {
      background: transparent !important;
    }
    .bc-print-content [data-bc-print-scrollable="true"]::-webkit-scrollbar-track,
    .bc-print-content [data-bc-print-scrollable="true"]::-webkit-scrollbar-thumb,
    .bc-print-content [data-bc-print-scrollable="true"]::-webkit-scrollbar-corner {
      background: transparent !important;
      border-color: transparent !important;
    }
  `;
  page.appendChild(style);
}

function validateStableLayout(
  items: readonly PaginationItem[],
  result: StablePaginationLayout['result'],
  topSnapshots: readonly IBlockSnapshot[],
  elById: Map<string, HTMLElement>,
  policy: PaginationResourcePolicy,
  warnings: PaginationExportWarning[],
): void {
  const tolerance = 2;
  const capHeightById = new Map(
    topSnapshots.map(block => [
      block.id,
      resolveBlockPolicy({
        flavour: block.flavour,
        nodeType: block.nodeType,
        isHeading: !!(block.props && (block.props as any).heading),
      }).capHeight,
    ]),
  );
  const maxFragmentById = new Map<string, number>();
  for (const page of result.pages) {
    for (const slot of page.slots) {
      if (slot.fragment) {
        maxFragmentById.set(slot.id, Math.max(maxFragmentById.get(slot.id) ?? 0, slot.fragment.toOffset));
      }
    }
  }

  for (const item of items) {
    if (item.manualBreak) continue;
    const el = elById.get(item.id);
    if (!el) {
      reportLayoutDivergence(item.id, '只读打印面缺少分页布局中的块', policy, warnings);
      continue;
    }
    const maxFragment = maxFragmentById.get(item.id);
    const style = getComputedStyle(el);
    const naturalHeight = measureBlockVisualHeight(
      el,
      capHeightById.get(item.id) ?? false,
      style,
    );
    const marginBottom = parseFloat(style.marginBottom) || 0;
    if (maxFragment != null && maxFragment > naturalHeight + marginBottom + tolerance) {
      reportLayoutDivergence(item.id, '只读打印面的块高度不足以覆盖当前分页片段', policy, warnings);
      continue;
    }
    // 未 fit 的 capHeight 块使用裁剪后页高，不能与自然 scrollHeight 做等值比较。
    // 媒体同时带 fitScale 时并不裁剪（locked+fitted 主题会解除 max-height），
    // 必须继续校验整体缩放后的视觉高，防止图片/caption 少载静默通过。
    if (item.lockHeight != null && item.fitScale == null) continue;
    // live layout 会在分页前把“仅超宽”的不可拆块高度按同一 fitScale 缩放；此时
    // readonly DOM 仍是自然尺寸，class/zoom 要到构页阶段才应用。校验必须比较缩放后
    // 的视觉高度，否则所有 width-only fitted 业务块都会被 strict 误判为 layout-diverged。
    const renderedHeight = (naturalHeight + marginBottom) * (item.fitScale ?? 1);
    if (Math.abs(renderedHeight - item.height) > tolerance) {
      const overflowY = style.overflowY || style.overflow || 'visible';
      const scale = item.fitScale ?? 1;
      reportLayoutDivergence(
        item.id,
        `只读打印面块 ${item.id} 高 ${renderedHeight}px`
          + `（内容 ${naturalHeight}px + 尾距 ${marginBottom}px，`
          + `offset ${el.offsetHeight}px / scroll ${el.scrollHeight}px，`
          + `overflow-y ${overflowY}${scale === 1 ? '' : `，缩放 ${scale}`}）`
          + `与分页视图 ${item.height}px 不一致`,
        policy,
        warnings,
      );
    }
  }
}

function reportLayoutDivergence(
  blockId: string,
  message: string,
  policy: PaginationResourcePolicy,
  warnings: PaginationExportWarning[],
): void {
  const context = {stage: 'layout' as const, blockId};
  if (policy === 'strict') {
    throw new PaginationExportError('layout-diverged', message, context);
  }
  warnings.push({code: 'layout-diverged', message, ...context});
}

/**
 * 就地测量离屏渲染的顶层块高度 + 惰性测安全切点，装配 PaginationItem[]。
 * 仅在调用方未传入 `override.items` 时使用（纯导出路径：无 live 编辑器可复用其测量）。
 * - 文本块（段落/列表/代码…）：仅高过一整页时拆（keep-together，整块下推优先）；
 * - 表格：总是带切点，塞不进当前页剩余时按行填满本页再续（Word 式）；优先「干净」行边界，
 *   跨合并单元格的边界排在 preferred 之外、实在不行才切（裁剪窗口切片该合并单元格，内容不丢）。
 */
function measureItemsFromDom(
  topSnapshots: IBlockSnapshot[],
  elById: Map<string, HTMLElement>,
  regularContentHeight: number,
  contentWidth: number,
  config: PaginationConfig,
): PaginationItem[] {
  const items: PaginationItem[] = [];
  for (const blk of topSnapshots) {
    const el = elById.get(blk.id) ?? null;
    const cs = el ? getComputedStyle(el) : null;
    const mb = cs ? parseFloat(cs.marginBottom) || 0 : 0;
    const isHeading = !!(blk.props && (blk.props as any).heading);
    const policy = resolveBlockPolicy({flavour: blk.flavour, nodeType: blk.nodeType, isHeading});
    const visualContentHeight = el
      ? measureBlockVisualHeight(el, policy.capHeight, cs!)
      : 0;
    const height = visualContentHeight + mb;

    let splitOffsets: number[] | undefined;
    let preferredSplitOffsets: number[] | undefined;
    let repeatHeaderHeight: number | undefined;
    if (el && policy.breakable && blk.flavour === 'table' && height > regularContentHeight) {
      // 表格 keep-together：只有整表高过一整页才带按行切点拆分（与屏幕 live-height-source 一致）。
      const t = computeTableSplitOffsets(el, {widowOrphanLines: config.widowOrphanLines});
      if (t.all.length) splitOffsets = t.all;
      if (t.preferred.length) preferredSplitOffsets = t.preferred;
      // [临时禁用 2026-06-30] 续页重复表头复制 bug 较多，先关掉（不读续页表头高 → 打印续页不渲表头窗口）。
      // 恢复：取消下面 4 行注释。
      // if (el.classList.contains('row-head')) {
      //   const firstRow = el.querySelector('tbody > tr') as HTMLElement | null;
      //   if (firstRow && firstRow.offsetHeight > 0) repeatHeaderHeight = firstRow.offsetHeight;
      // }
    } else if (el && policy.breakable && blk.flavour !== 'table' && height > regularContentHeight) {
      const offsets = computeSplitOffsets(el, blk.flavour, {widowOrphanLines: config.widowOrphanLines});
      if (offsets.length) splitOffsets = offsets;
    }

    // capHeight 块超高 → 锁定分页占位到一页内；图片/视频整体 fit，其余原子块保留裁剪策略。
    // visible overflow 属于块的外部视觉高度；hidden/clip/scroll overflow 只属于块内部。
    let lockHeight: number | undefined;
    const naturalStride = height
    const naturalWidth = el ? measureBlockContentWidth(el, contentWidth) : 0
    const widthScale = el
      && !policy.breakable
      && naturalWidth > contentWidth + 0.5
        ? contentWidth / naturalWidth
        : 1
    const heightScale = policy.capHeight
      && fitsOversizedMedia(blk.flavour)
      && visualContentHeight > regularContentHeight
        ? regularContentHeight / naturalStride
        : 1
    const fitScale = Math.max(0.01, Math.min(1, widthScale, heightScale))
    let effHeight = fitScale < 1 ? naturalStride * fitScale : height;
    if (policy.capHeight && visualContentHeight > regularContentHeight && regularContentHeight > 0) {
      lockHeight = regularContentHeight;
      effHeight = fitsOversizedMedia(blk.flavour)
        ? Math.min(regularContentHeight, effHeight)
        : regularContentHeight;
    }

    items.push({
      id: blk.id,
      height: effHeight,
      breakable: policy.breakable,
      keepWithNext: policy.keepWithNext,
      splitOffsets,
      preferredSplitOffsets,
      lockHeight,
      fitScale: fitScale < 1 ? fitScale : undefined,
      repeatHeaderHeight,
      splitStartsNewPage: blk.flavour === 'table' || undefined, // 表格拆分独占新页起
      manualBreak: isManualBreak(blk.flavour),
    });
  }
  return items;
}

/** 构建页眉/页脚元素（左/中/右三段 + {page}/{total} 替换），绝对定位在页边距带内。 */
function buildChrome(
  chrome: PageChrome | undefined,
  page: number,
  total: number,
  top: number,
  height: number,
  margins: {left: number; right: number},
): HTMLElement {
  const segs = resolveChromeSegments(chrome, page, total);
  const el = document.createElement('div');
  el.className = 'bc-print-chrome';
  el.style.cssText =
    `position:absolute; display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:8px;` +
    `top:${top}px; height:${height}px; left:${margins.left}px; right:${margins.right}px;` +
    `font-size:var(--bc-page-chrome-fs,12px); line-height:1.2; color:var(--bc-page-chrome-color,#9b9b97);` +
    `white-space:nowrap; overflow:hidden;`;
  const mk = (txt: string | undefined, align: string): HTMLElement => {
    const sp = document.createElement('span');
    sp.style.textAlign = align;
    sp.textContent = txt || '';
    return sp;
  };
  el.appendChild(mk(segs.left, 'left'));
  el.appendChild(mk(segs.center, 'center'));
  el.appendChild(mk(segs.right, 'right'));
  return el;
}

/**
 * 把一个超大块的纵向切片 [fromOffset, toOffset] 裁进固定高的窗口：
 * 窗口 overflow:hidden 限定可见高，内部克隆整块并 translateY(-fromOffset) 上移露出对应片段。
 * 克隆（非搬移）：同块的不同片段要分别出现在多页。margin 归零，确保 translate 以 border-box 顶对齐。
 */
function buildFragmentWindow(
  el: HTMLElement,
  frag: PageSlotFragment,
  cellFlowPlan?: TableCellFlowPlan,
): HTMLElement {
  const height = frag.toOffset - frag.fromOffset;
  const win = document.createElement('div');
  win.className = 'bc-print-frag';
  win.style.cssText = `position:relative; overflow:hidden; height:${height}px;`;

  const clone = el.cloneNode(true) as HTMLElement;
  clone.style.marginTop = '0';
  clone.style.marginBottom = '0';
  clone.style.transform = `translateY(${-frag.fromOffset}px)`;
  win.appendChild(clone);
  if (cellFlowPlan) decorateTableCellFlowFragment(win, el, frag, cellFlowPlan);
  return win;
}

function applyPrintTableCellFlowProjection(
  tableRoot: HTMLElement,
  plan: TableCellFlowPlan,
): void {
  for (const segment of plan.segments) {
    const pageBreak = segment.breakAfter;
    if (pageBreak?.kind !== 'cell-flow') continue;
    for (const continuation of pageBreak.continuations) {
      const padding = Math.max(0, segment.height - continuation.pageOffset);
      if (padding <= 0.01) continue;
      const cell = tableRoot.querySelector<HTMLElement>(
        `[data-block-id="${continuation.cellId}"]`,
      );
      if (!cell) continue;
      const marker = document.createElement('div');
      marker.setAttribute('data-bc-print-cell-flow-pad', 'true');
      marker.setAttribute('aria-hidden', 'true');
      marker.style.cssText =
        `display:block;height:${padding}px;margin:0;padding:0;` +
        `pointer-events:none;user-select:none;-webkit-user-select:none;`;
      insertPrintCellFlowMarker(cell, continuation.anchor, marker);
    }
  }
}

function insertPrintCellFlowMarker(
  cell: HTMLElement,
  anchor: TableCellFlowAnchor,
  marker: HTMLElement,
): void {
  const wrapper = cell.querySelector<HTMLElement>(
    ':scope > .table-cell__children-wrapper',
  ) ?? cell;
  if (anchor.kind === 'cell-end') return;
  if (anchor.kind === 'cell-start') {
    wrapper.insertBefore(marker, wrapper.firstChild);
    return;
  }

  const block = cell.querySelector<HTMLElement>(
    `[data-block-id="${anchor.blockId}"]`,
  );
  if (!block) return;
  if (anchor.kind === 'block') {
    block.parentNode?.insertBefore(marker, block);
    return;
  }

  const inlineAnchor = splitReadonlyInlineAtOffset(block, anchor.offset);
  if (inlineAnchor?.parentNode) {
    inlineAnchor.parentNode.insertBefore(marker, inlineAnchor);
  }
}

/** 在只读打印克隆里按 Y.Text offset 拆一个 c-element；该 DOM 不回写模型，也无需撤销。 */
function splitReadonlyInlineAtOffset(
  block: HTMLElement,
  offset: number,
): Node | null {
  const firstInline = block.querySelector<HTMLElement>('c-element');
  const container = firstInline?.parentElement;
  if (!container) return null;
  const elements = Array.from(container.children)
    .filter((element): element is HTMLElement => element.localName === 'c-element');
  let remaining = Math.max(0, offset);

  for (const element of elements) {
    const textNode = element.querySelector('c-text')?.firstChild;
    const isBreak = element.classList.contains('bc-end-break');
    const length = textNode instanceof Text
      ? textNode.data.length
      : isBreak ? 0 : 1;
    if (remaining === 0) return element;
    if (textNode instanceof Text && remaining < length) {
      const right = element.cloneNode(true) as HTMLElement;
      const rightText = right.querySelector('c-text')?.firstChild;
      if (!(rightText instanceof Text)) return null;
      rightText.data = textNode.data.slice(remaining);
      textNode.data = textNode.data.slice(0, remaining);
      element.after(right);
      return right;
    }
    remaining -= length;
  }
  return elements.find(element => element.classList.contains('bc-end-break'))
    ?? null;
}

function decorateTableCellFlowFragment(
  win: HTMLElement,
  source: HTMLElement,
  fragment: PageSlotFragment,
  plan: TableCellFlowPlan,
): void {
  const table = source.querySelector<HTMLElement>('table');
  if (!table) return;
  const sourceRect = source.getBoundingClientRect();
  const tableRect = table.getBoundingClientRect();
  const left = Math.max(0, tableRect.left - sourceRect.left);
  const width = table.offsetWidth || tableRect.width;
  const addEdge = (side: 'top' | 'bottom') => {
    const edge = document.createElement('div');
    edge.className = `bc-print-table-flow-edge bc-print-table-flow-edge--${side}`;
    edge.setAttribute('aria-hidden', 'true');
    edge.style.cssText =
      `position:absolute;left:${left}px;width:${width}px;height:1px;${side}:0;` +
      `background:var(--bc-table-border-color,var(--bc-border-color,#d9d9d9));` +
      `pointer-events:none;z-index:2;`;
    win.appendChild(edge);
  };
  if (fragment.fromOffset > 0) addEdge('top');
  if (fragment.toOffset < plan.paginationHeight) addEdge('bottom');
}

/** 等待离屏内容的图片/字体加载、布局稳定。 */
async function waitForRender(container: HTMLElement): Promise<void> {
  const imgs = Array.from(container.querySelectorAll('img'));
  await Promise.all(
    imgs.map(img =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>(res => {
            img.addEventListener('load', () => res(), {once: true});
            img.addEventListener('error', () => res(), {once: true});
          }),
    ),
  );
  try {
    await (document as any).fonts?.ready;
  } catch {
    /* ignore */
  }
  await new Promise<void>(res => requestAnimationFrame(() => res()));
}
