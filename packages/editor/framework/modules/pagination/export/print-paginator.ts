// packages/editor/framework/modules/pagination/export/print-paginator.ts
import {createSnapshotRenderer} from "../../../../snapshot-viewer";
import {IBlockSnapshot} from "../../../block-std/types/block.type";
import {
  isManualBreak,
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
import {resolveChromeInlineContent, resolveChromeSegments} from "../view/chrome-tokens";
import {applyChromeAppearance, createChromeSegmentElement} from "../view/chrome-content";
import {
  measureBlockContentWidth,
  measureBlockVisualHeight,
} from '../view/block-visual-height'
import {computeSplitOffsets, computeTableSplitOffsets} from "../view/split-points";
import {StablePaginationLayout} from "../view/stable-pagination-layout";
import {
  applyPageMediaFit,
  canFitPageMedia,
  clearPageMediaFit,
  measureNaturalPageMedia,
} from '../view/page-media-fit'
import {
  PaginationExportError,
  PaginationExportWarning,
  PaginationRenderStabilityOptions,
  PaginationResourcePolicy,
} from "./pdf-export.types";
import {appendFlowSentinel} from './print-dom';
import {finalizeWordArtCssForPrint} from './print-word-art'
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
   * 分页稳定屏障内捕获的 root placement 平面。
   *
   * 宿主若会在 render provider 中关闭分页、调整 root 宽度或重建只读视图，必须在
   * 这些切换之前调用 `captureStablePrintPlacementPlanes()`，并把结果原样返回。
   * 打印构页优先消费该快照，不再从切换后的 `root` 重新读取 absolute block DOM。
   */
  placementPlanes?: readonly StablePrintPlacementPlane[];
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
   * 分页视图中 placement content box 相对纸面的实际 Y 原点（layout px）。
   * 仅用于校验只读渲染仍遵守统一 content-box 契约，不参与打印定位补偿。
   */
  placementOriginY?: number;
  /** placement content box 相对纸张左缘的原点与宽度；仅作一致性校验。 */
  placementOriginX?: number;
  placementWidth?: number;
}

/** 块内真实对象面在稳定 plane / host 坐标系中的可视边界（layout px）。 */
export interface StablePrintPlacementVisualSurfaceBounds {
  contentLeft: number;
  contentTop: number;
  hostLeft: number;
  hostTop: number;
  width: number;
  height: number;
  transform: string;
}

/** placement block 在稳定 plane content-box 坐标系中的可视边界（layout px）。 */
export interface StablePrintPlacementBlockBounds {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  transform: string;
  visualSurface?: StablePrintPlacementVisualSurfaceBounds;
}

/**
 * 分页稳定阶段捕获的 placement plane DOM 与逐块几何清单。
 * `element` 是 detached clone，后续编辑器状态切换不会再改写它。
 */
export interface StablePrintPlacementPlane {
  id: string;
  element: HTMLElement;
  blocks: readonly StablePrintPlacementBlockBounds[];
}

/**
 * 在分页稳定屏障内一次性捕获 root placement 平面。
 *
 * 捕获为 O(absolute blocks)，并把 absolute host 的 layout box 固化到 clone 上；
 * manifest 则保存相对 plane content-box、已抵消宿主 zoom/transform 的可视 bounds。
 */
export function captureStablePrintPlacementPlanes(
  root: HTMLElement,
): StablePrintPlacementPlane[] {
  const planes = Array.from(
    root.querySelectorAll<HTMLElement>(':scope > [data-bc-placement-layout]'),
  );
  return planes.map(source => captureStablePrintPlacementPlane(source));
}

export type PrintRenderProvider = (contentWidthPx: number) => Promise<PrintRenderResult>;

export interface PrintPages {
  /** 包含 N 个 `.bc-print-page` 的容器（已在 document.body 的隐藏构页层完成布局）。 */
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

type ResolvedPrintPlacementPlane = {
  id: string;
  element: HTMLElement;
  blocks?: readonly StablePrintPlacementBlockBounds[];
};

type ProjectedPrintPlacementPlane = {
  element: HTMLElement;
  expectedTop: number;
  blocks?: readonly StablePrintPlacementBlockBounds[];
};

let printSurfaceSequence = 0;

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
  let capturedPlacementOriginX: number | undefined;
  let capturedPlacementWidth: number | undefined;
  let capturedPlacementPlanes: readonly StablePrintPlacementPlane[] | undefined;
  let leadingContent: PrintRenderResult['leadingContent'];
  let leadingStage: {root: HTMLElement; host: HTMLElement} | undefined;
  if (override?.render) {
    const r = await override.render(contentWidthPx);
    renderRoot = r.root;
    disposeRender = r.dispose;
    resolvePlacementOriginOffset = r.resolvePlacementOriginOffset;
    capturedPlacementOriginY = r.placementOriginY;
    capturedPlacementOriginX = r.placementOriginX;
    capturedPlacementWidth = r.placementWidth;
    capturedPlacementPlanes = r.placementPlanes;
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
  const topSnapshotById = new Map(topSnapshots.map(block => [block.id, block]));
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
  const capturedPlacementPlaneById = capturedPlacementPlanes == null
    ? undefined
    : new Map(capturedPlacementPlanes.map(plane => [plane.id, plane]));
  const placementPlanes: ResolvedPrintPlacementPlane[] = Array.from(
    placementPlaneIds,
    id => {
      const captured = capturedPlacementPlaneById?.get(id);
      if (captured) return captured;
      // 一旦 provider 显式交付稳定快照，它就是 placement DOM 的唯一来源；缺失时
      // 不能悄悄回退到状态切换后的 root，否则会重新引入逐块几何漂移。
      if (capturedPlacementPlaneById) return undefined;
      const element = elById.get(id);
      return element ? {id, element} : undefined;
    },
  ).filter((plane): plane is ResolvedPrintPlacementPlane => !!plane);
  try {
    for (const block of topSnapshots) {
      if (
        block.flavour === PLACEMENT_LAYOUT_FLAVOUR
        && Array.isArray(block.children)
        && block.children.length > 0
        && !placementPlanes.some(plane => plane.id === block.id)
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
  const hasPlacementContent = topSnapshots.some(block =>
    block.flavour === PLACEMENT_LAYOUT_FLAVOUR
      && Array.isArray(block.children)
      && block.children.length > 0,
  );

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

  // `:last-child` 会随只读副本追加哨兵、逐页重父而变化，不能再让打印 DOM
  // 重新决定块尾距。稳定布局已把同帧的 trailingSpacing 计入 item.height；
  // 在任何复验和构页前把它固化回块 host，保证内容变化仍会被严格校验。
  normalizeStableTrailingSpacing(items, elById);

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
    const block = topSnapshotById.get(it.id);
    const element = elById.get(it.id);
    if (
      block &&
      element &&
      canFitPageMedia(element, block.flavour) &&
      it.fitScale != null &&
      it.fitScale > 0 &&
      it.fitScale < 1
    ) {
      fitScaleById.set(it.id, it.fitScale);
    }
    if (it.repeatHeaderHeight != null && it.repeatHeaderHeight > 0) repeatHeaderById.set(it.id, it.repeatHeaderHeight);
  }

  // 4) 构建逐页 A4 容器，把块搬进去
  const container = document.createElement('div');
  container.className = 'bc-print-root';
  container.setAttribute('data-bc-print-root', 'true');
  // WebKit 对极远负坐标中的 absolute containing block 存在坐标量化差异：父盒与
  // 零高子平面可能落入不同的内部坐标范围。构页阶段改在视口原点完成真实布局，
  // 用 visibility 隐藏；mount 后由 print mirror 的 display 规则接管可见性。
  container.style.cssText =
    'position:absolute; left:0; top:0; visibility:hidden; pointer-events:none;';

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
  // flow、live 分页和打印面必须共用同一个 root content-box 坐标系。
  // 稳定布局捕获值只用于验收该契约，绝不能反向驱动打印 CSS；否则宿主缩放、
  // 只读窗口或小数像素产生的测量误差会被固化成所有 absolute block 的整体偏移。
  if (hasPlacementContent) {
    try {
      validatePlacementContentBoxGeometry({
        expectedX: margins.left,
        expectedY: contentTop + firstPageLeadingHeight,
        expectedWidth: contentWidthPx,
        stableX: override?.layout?.placementOriginX,
        stableY: override?.layout?.placementOriginY,
        stableWidth: override?.layout?.placementWidth,
        capturedX: capturedPlacementOriginX,
        capturedY: capturedPlacementOriginY,
        capturedWidth: capturedPlacementWidth,
        policy: override?.resourcePolicy ?? 'strict',
        warnings,
      });
    } catch (error) {
      container.remove();
      leadingStage?.root.remove();
      disposeRender();
      throw error;
    }
  }
  const screenPageStride = sheetHeightPx + geom.pageGap;
  const printCloneNamespace = `bc-print-${++printSurfaceSequence}`;
  const placementPlaneProjections: ProjectedPrintPlacementPlane[] = [];
  const stablePlacementProjections: Array<{
    plane: HTMLElement;
    blocks: readonly StablePrintPlacementBlockBounds[];
  }> = [];
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
    // 这是 placement plane 的唯一 containing block。宿主主题即便带 !important
    // root 规则，也不能把它退回 static/整纸宽；否则 absolute x/y 会相对 page。
    content.style.setProperty('position', 'absolute', 'important');
    content.style.setProperty('box-sizing', 'border-box', 'important');
    content.style.setProperty('width', 'auto', 'important');
    content.style.setProperty('min-width', '0px', 'important');
    content.style.setProperty('max-width', 'none', 'important');
    content.style.setProperty('padding', '0px', 'important');
    content.style.setProperty('top', `${contentTop + pageLeadingHeight}px`, 'important');
    content.style.setProperty('left', `${margins.left}px`, 'important');
    content.style.setProperty('right', `${margins.right}px`, 'important');
    content.style.setProperty('bottom', `${contentBottom}px`, 'important');
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
        const locked = lockedIds.has(slot.id);
        const fitScale = fitScaleById.get(slot.id);
        el.classList.remove('bc-page-height-fitted');
        el.style.removeProperty('--bc-page-fit-scale');
        el.classList.toggle('bc-page-height-locked', locked && fitScale == null);
        if (fitScale != null) applyPageMediaFit(el, fitScale);
        else clearPageMediaFit(el);
        // 非媒体 capHeight 块仍由锁定 class 约束；图片/视频只限制其媒体 wrapper。
        content.appendChild(el); // 整块：搬移（从离屏 root 移走，DOM 节点唯一）
      }
    }
    const projectedPlanes = appendPlacementPlanes(
      content,
      placementPlanes,
      page.index === 0
        ? 0
        : firstPageLeadingHeight - page.index * screenPageStride,
    );
    placementPlaneProjections.push(...projectedPlanes);
    // 每页使用同一个规范 plane，只需验收第一页即可把复杂度保持在 O(objects)。
    if (page.index === 0) {
      for (const projected of projectedPlanes) {
        if (projected.blocks) {
          stablePlacementProjections.push({
            plane: projected.element,
            blocks: projected.blocks,
          });
        }
      }
    }
    // live root 尾部存在编辑器辅助节点，因此最后一个顶层块不会命中
    // `[data-block-id]:last-child { margin-bottom: 0 }`。打印面没有这些辅助节点，
    // 补一个不参与布局的结构哨兵，确保逐页搬移后仍保留分页计算时的块间距。
    appendFlowSentinel(content);
    pageEl.appendChild(content);
    namespacePrintSvgIds(pageEl, `${printCloneNamespace}-p${page.index}`);
    container.appendChild(pageEl);
    pageEls.push(pageEl);
  }

  document.body.appendChild(container);

  try {
    const preparedFinal = await preparePrintResources(container, {
      resourcePolicy: override?.resourcePolicy,
      signal: override?.signal,
    });
    warnings.push(...preparedFinal.warnings);
    await waitForPaginationRenderStable(
      container,
      override?.stability,
      override?.signal,
    );
    validateProjectedPlacementPlanes(
      placementPlaneProjections,
      override?.resourcePolicy ?? 'strict',
      warnings,
    );
    validateStablePlacementPlanes(
      stablePlacementProjections,
      override?.resourcePolicy ?? 'strict',
      warnings,
    );
  } catch (error) {
    container.remove();
    leadingStage?.root.remove();
    disposeRender();
    throw error;
  }

  // WordArt 保留稳定 clone 的真实文字/字体盒，只在最终纸面写入确定性 CSS 视觉参数。
  // 禁止在这里读取 Range/DOMRect 或生成 SVG，避免 WebKit SVG text baseline 漂移。
  try {
    finalizeWordArtCssForPrint(container);
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
 * position.y 属于分页屏幕的连续坐标系，其中每页步长包含纸高和屏幕 pageGap；
 * 打印纸盒没有 pageGap，因此每页克隆保持子块原始 y，只整体反向平移对应步长。
 * 首页文档头通过 firstPageLeadingHeight 占据同一连续坐标，必须一并补回。
 */
function appendPlacementPlanes(
  content: HTMLElement,
  sources: readonly ResolvedPrintPlacementPlane[],
  top: number,
): ProjectedPrintPlacementPlane[] {
  const projected: ProjectedPrintPlacementPlane[] = [];
  for (const source of sources) {
    // 不复用 Angular placement host：其 class、宿主绑定或视图缩放都只属于捕获
    // 环境。打印阶段建立一个无状态 canonical wrapper，只复用已经稳定化的内容树。
    const capturedHost = source.element.cloneNode(true) as HTMLElement;
    const capturedContent = resolvePlacementPlaneContent(capturedHost);
    const plane = document.createElement('div');
    plane.dataset['blockId'] = source.id;
    plane.setAttribute('data-bc-placement-layout', '');
    plane.setAttribute('data-bc-placement-layer-bridge', '');
    plane.appendChild(capturedContent === capturedHost
      ? wrapLegacyPlacementContent(capturedHost)
      : capturedContent);
    plane.setAttribute('data-bc-print-placement-plane', 'true');
    // position.x/y 是相对 root content box 的固定 layout px。打印正文盒本身就是
    // 该 content box，因此克隆面必须规范化为 0/0 并直接占满内容宽；纸面原点测量值
    // 只用于上游一致性校验，不能再作为补偿量写回这里。
    normalizeProjectedPlacementPlane(plane, top);
    content.appendChild(plane);
    projected.push({element: plane, expectedTop: top, blocks: source.blocks});
  }
  return projected;
}

function wrapLegacyPlacementContent(host: HTMLElement): HTMLElement {
  const content = document.createElement('div');
  content.className = 'children-render-container';
  while (host.firstChild) content.appendChild(host.firstChild);
  return content;
}

function normalizeProjectedPlacementPlane(
  plane: HTMLElement,
  top: number,
): void {
  const setFixed = (
    element: HTMLElement,
    property: string,
    value: string,
  ): void => element.style.setProperty(property, value, 'important');
  const normalizeBox = (
    element: HTMLElement,
    position: 'absolute' | 'relative',
    resolvedTop: number,
  ): void => {
    setFixed(element, 'position', position);
    setFixed(element, 'inset', 'auto');
    setFixed(element, 'top', `${resolvedTop}px`);
    setFixed(element, 'left', '0px');
    setFixed(element, 'right', 'auto');
    setFixed(element, 'bottom', 'auto');
    setFixed(element, 'width', '100%');
    setFixed(element, 'height', '0px');
    setFixed(element, 'inline-size', '100%');
    setFixed(element, 'block-size', '0px');
    setFixed(element, 'min-width', '0px');
    setFixed(element, 'min-height', '0px');
    setFixed(element, 'max-width', 'none');
    setFixed(element, 'max-height', 'none');
    setFixed(element, 'box-sizing', 'border-box');
    setFixed(element, 'margin', '0px');
    setFixed(element, 'padding', '0px');
    setFixed(element, 'border', '0px');
    setFixed(element, 'transform', 'none');
    setFixed(element, 'translate', 'none');
    setFixed(element, 'rotate', 'none');
    setFixed(element, 'scale', 'none');
    // 打印 placement plane 的契约恒为 100% layout scale。宿主分页 surface 的
    // 视图缩放只允许在捕获边界用于把 DOMRect 还原成 layout px，不能进入最终
    // wrapper；绝对块自身合法的 fit/zoom 仍由冻结几何与各自样式保留。
    setFixed(element, 'zoom', '1');
    setFixed(element, 'overflow', 'visible');
  };

  normalizeBox(plane, 'absolute', top);
  const content = resolvePlacementPlaneContent(plane);
  if (content !== plane) normalizeBox(content, 'relative', 0);
}

function namespacePrintSvgIds(root: HTMLElement, namespace: string): void {
  const svgs = Array.from(root.querySelectorAll<SVGSVGElement>('svg'));
  svgs.forEach((svg, svgIndex) => {
    const idMap = new Map<string, string>();
    const idElements = Array.from(svg.querySelectorAll<SVGElement>('[id]'));
    idElements.forEach((element, idIndex) => {
      const previous = element.id;
      if (!previous) return;
      const stableToken = previous.replace(/[^a-zA-Z0-9_.:-]/g, '-');
      const next = `${namespace}-s${svgIndex}-i${idIndex}-${stableToken}`;
      if (!idMap.has(previous)) idMap.set(previous, next);
      element.id = next;
    });
    if (idMap.size === 0) return;

    const descendants = [svg, ...Array.from(svg.querySelectorAll<SVGElement>('*'))];
    for (const element of descendants) {
      for (const attribute of Array.from(element.attributes)) {
        const rewritten = rewritePrintSvgReference(
          attribute.value,
          idMap,
          attribute.localName === 'href',
        );
        if (rewritten !== attribute.value) {
          element.setAttributeNS(attribute.namespaceURI, attribute.name, rewritten);
        }
      }
      if (element.localName === 'style' && element.textContent) {
        element.textContent = rewritePrintSvgReference(
          element.textContent,
          idMap,
          false,
        );
      }
    }
  });
}

function rewritePrintSvgReference(
  value: string,
  idMap: ReadonlyMap<string, string>,
  allowExactHash: boolean,
): string {
  const exact = allowExactHash ? /^#([^\s]+)$/.exec(value) : null;
  if (exact) {
    const replacement = idMap.get(exact[1]!);
    if (replacement) return `#${replacement}`;
  }
  return value.replace(
    /url\(\s*(["']?)#([^\s)"']+)\1\s*\)/g,
    (match, quote: string, id: string) => {
      const replacement = idMap.get(id);
      return replacement ? `url(${quote}#${replacement}${quote})` : match;
    },
  );
}

function captureStablePrintPlacementPlane(
  source: HTMLElement,
): StablePrintPlacementPlane {
  const id = source.dataset['blockId'];
  if (!id) {
    throw new PaginationExportError(
      'layout-not-ready',
      '稳定分页 placement-layout 缺少 data-block-id',
      {stage: 'layout'},
    );
  }
  const sourceContent = resolvePlacementPlaneContent(source);
  const sourceBox = resolvePlacementContentVisualBox(sourceContent, id);
  const clone = source.cloneNode(true) as HTMLElement;
  stabilizeCapturedPlacementMedia(source, clone, id);
  const cloneContent = resolvePlacementPlaneContent(clone);
  const sourceBlocks = resolveDirectPlacementBlocks(sourceContent);
  const cloneBlocks = resolveDirectPlacementBlocks(cloneContent);
  const blocks: StablePrintPlacementBlockBounds[] = [];

  for (let index = 0; index < sourceBlocks.length; index += 1) {
    const sourceBlock = sourceBlocks[index]!;
    const blockId = sourceBlock.dataset['blockId'];
    if (!blockId) {
      throw new PaginationExportError(
        'layout-not-ready',
        `稳定分页 placement-layout ${id} 含缺少 data-block-id 的绝对定位块`,
        {stage: 'layout', blockId: id},
      );
    }
    const cloneBlock = cloneBlocks[index];
    if (!cloneBlock) {
      throw new PaginationExportError(
        'layout-not-ready',
        `稳定分页 placement-layout ${id} 无法克隆绝对定位块 ${blockId}`,
        {stage: 'layout', blockId},
      );
    }
    const computed = getComputedStyle(sourceBlock);
    const bounds = readPlacementBlockVisualBounds(
      sourceBlock,
      sourceBox,
      blockId,
      readPlacementTransformSignature(computed),
    );
    const visualSurface = resolvePlacementVisualSurface(sourceBlock, blockId);
    if (visualSurface) {
      bounds.visualSurface = readPlacementVisualSurfaceBounds(
        visualSurface,
        sourceBlock,
        sourceBox,
      );
    }
    freezePlacementBlockLayout(
      sourceBlock,
      cloneBlock,
      sourceContent,
      computed,
      bounds,
    );
    blocks.push(bounds);
  }

  return {id, element: clone, blocks};
}

function resolvePlacementPlaneContent(plane: HTMLElement): HTMLElement {
  const direct = Array.from(plane.children).find(
    (child): child is HTMLElement =>
      child instanceof HTMLElement
      && child.classList.contains('children-render-container'),
  );
  return direct ?? plane;
}

function resolveDirectPlacementBlocks(content: HTMLElement): HTMLElement[] {
  return Array.from(content.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement
      && child.dataset['bcPlacement'] === 'absolute'
      && child.hasAttribute('data-block-id'),
  );
}

function resolvePlacementVisualSurface(
  block: HTMLElement,
  blockId: string,
): HTMLElement | undefined {
  const belongsToBlock = (candidate: HTMLElement): boolean =>
    candidate.closest<HTMLElement>('[data-block-id]') === block;
  const marked = Array.from(
    block.querySelectorAll<HTMLElement>('[data-bc-print-visual-surface]'),
  ).filter(belongsToBlock);
  if (marked.length > 1) {
    throw new PaginationExportError(
      'layout-not-ready',
      `绝对定位块 ${blockId} 含多个打印视觉面`,
      {stage: 'layout', blockId},
    );
  }
  if (marked[0]) return marked[0];

  // 兼容尚未升级标记的 provider；只接受当前 absolute host 自己的对象盒，
  // 绝不穿透到嵌套 block 的 surface。
  const legacy = Array.from(block.querySelectorAll<HTMLElement>([
    '.image-block__container > .img-wrapper',
    '.shape-block__shell',
    '.word-art-block__surface',
  ].join(','))).filter(belongsToBlock);
  return legacy.length === 1 ? legacy[0] : undefined;
}

type PlacementContentVisualBox = {
  originX: number;
  originY: number;
  scaleX: number;
  scaleY: number;
};

function resolvePlacementContentVisualBox(
  content: HTMLElement,
  blockId: string,
): PlacementContentVisualBox {
  const rect = content.getBoundingClientRect();
  const computed = getComputedStyle(content);
  assertAxisAlignedPlacementContext(content, blockId);
  const scaleX = resolvePlacementAxisScale(content, 'width');
  const scaleY = resolvePlacementAxisScale(content, 'height');
  const borderLeft = parseFloat(computed.borderLeftWidth) || 0;
  const borderTop = parseFloat(computed.borderTopWidth) || 0;
  const paddingLeft = parseFloat(computed.paddingLeft) || 0;
  const paddingTop = parseFloat(computed.paddingTop) || 0;
  if (
    !Number.isFinite(scaleX) || scaleX <= 0
    || !Number.isFinite(scaleY) || scaleY <= 0
  ) {
    throw new PaginationExportError(
      'layout-not-ready',
      `稳定分页 placement-layout ${blockId} 的 content box 尚不可测量`,
      {stage: 'layout', blockId},
    );
  }
  return {
    originX: rect.left + (borderLeft + paddingLeft) * scaleX,
    originY: rect.top + (borderTop + paddingTop) * scaleY,
    scaleX,
    scaleY,
  };
}

function resolvePlacementAxisScale(
  content: HTMLElement,
  axis: 'width' | 'height',
): number {
  for (
    let element: HTMLElement | null = content;
    element;
    element = element.parentElement
  ) {
    const computed = getComputedStyle(element);
    const layoutSize = readLayoutBorderBoxSize(element, computed, axis);
    const visualSize = axis === 'width'
      ? element.getBoundingClientRect().width
      : element.getBoundingClientRect().height;
    if (layoutSize > 0.000001 && visualSize > 0.000001) {
      return visualSize / layoutSize;
    }
  }
  return 0;
}

function assertAxisAlignedPlacementContext(
  content: HTMLElement,
  blockId: string,
): void {
  const epsilon = 0.000001;
  for (let element: HTMLElement | null = content; element; element = element.parentElement) {
    const computed = getComputedStyle(element);
    const perspective = computed.perspective.trim();
    if (perspective !== '' && perspective !== 'none' && parseFloat(perspective) !== 0) {
      throwUnsupportedPlacementTransform(blockId, element, 'perspective');
    }

    const rotate = computed.getPropertyValue('rotate').trim();
    if (rotate !== '' && rotate !== 'none' && !isZeroCssRotation(rotate)) {
      throwUnsupportedPlacementTransform(blockId, element, 'rotate');
    }
    const scale = computed.getPropertyValue('scale').trim();
    if (scale !== '' && scale !== 'none') {
      const values = scale.split(/\s+/).map(value => parseFloat(value));
      if (
        values.length > 3
        || values.some(value => !Number.isFinite(value))
        || (values[0] ?? 0) <= 0
        || (values[1] ?? values[0] ?? 0) <= 0
        || (values[2] != null && Math.abs(values[2] - 1) > epsilon)
      ) {
        throwUnsupportedPlacementTransform(blockId, element, 'scale');
      }
    }

    const transform = computed.transform.trim();
    if (transform === '' || transform === 'none') continue;
    const Matrix = element.ownerDocument.defaultView?.DOMMatrixReadOnly;
    if (!Matrix) {
      throwUnsupportedPlacementTransform(blockId, element, 'transform');
    }
    let matrix: DOMMatrixReadOnly;
    try {
      matrix = new Matrix(transform);
    } catch {
      throwUnsupportedPlacementTransform(blockId, element, 'transform');
    }
    if (
      !matrix.is2D
      || Math.abs(matrix.m12) > epsilon
      || Math.abs(matrix.m21) > epsilon
      || matrix.m11 <= 0
      || matrix.m22 <= 0
    ) {
      throwUnsupportedPlacementTransform(blockId, element, 'rotate/skew/3d');
    }
  }
}

function isZeroCssRotation(value: string): boolean {
  const parts = value.split(/\s+/);
  const angle = parts[parts.length - 1] ?? value;
  if (angle.endsWith('deg')) return Math.abs(parseFloat(angle)) < 0.000001;
  if (angle.endsWith('rad')) return Math.abs(parseFloat(angle)) < 0.000001;
  if (angle.endsWith('turn')) return Math.abs(parseFloat(angle)) < 0.000001;
  return false;
}

function throwUnsupportedPlacementTransform(
  blockId: string,
  element: HTMLElement,
  kind: string,
): never {
  const label = element === element.ownerDocument.documentElement
    ? 'documentElement'
    : element.dataset['blockId'] || element.className || element.localName;
  throw new PaginationExportError(
    'layout-not-ready',
    `稳定分页 placement-layout ${blockId} 的 ${label} 含不可轴对齐 ${kind} 变换`,
    {stage: 'layout', blockId},
  );
}

function stabilizeCapturedPlacementMedia(
  source: HTMLElement,
  clone: HTMLElement,
  planeId: string,
): void {
  const sourceImages = Array.from(source.querySelectorAll('img'));
  const cloneImages = Array.from(clone.querySelectorAll('img'));
  sourceImages.forEach((sourceImage, index) => {
    const cloneImage = cloneImages[index];
    if (!cloneImage) return;
    const resolvedSource = sourceImage.currentSrc || sourceImage.src;
    if (resolvedSource) cloneImage.src = resolvedSource;
    cloneImage.removeAttribute('srcset');
    cloneImage.removeAttribute('sizes');
    cloneImage.loading = 'eager';
  });

  const sourceCanvases = Array.from(source.querySelectorAll('canvas'));
  const cloneCanvases = Array.from(clone.querySelectorAll('canvas'));
  sourceCanvases.forEach((sourceCanvas, index) => {
    const cloneCanvas = cloneCanvases[index];
    if (!cloneCanvas) return;
    try {
      const image = createStaticMediaImage(
        cloneCanvas,
        sourceCanvas.toDataURL('image/png'),
      );
      image.width = sourceCanvas.width;
      image.height = sourceCanvas.height;
      cloneCanvas.replaceWith(image);
    } catch (error) {
      throw new PaginationExportError(
        'layout-not-ready',
        `稳定分页 placement-layout ${planeId} 无法固化 canvas 位图`,
        {stage: 'layout', blockId: planeId},
        error,
      );
    }
  });

  const sourceVideos = Array.from(source.querySelectorAll('video'));
  const cloneVideos = Array.from(clone.querySelectorAll('video'));
  sourceVideos.forEach((sourceVideo, index) => {
    const cloneVideo = cloneVideos[index];
    if (!cloneVideo || !sourceVideo.poster) return;
    const image = createStaticMediaImage(cloneVideo, sourceVideo.poster);
    image.width = sourceVideo.clientWidth || sourceVideo.width;
    image.height = sourceVideo.clientHeight || sourceVideo.height;
    cloneVideo.replaceWith(image);
  });
}

function createStaticMediaImage(
  source: HTMLElement,
  src: string,
): HTMLImageElement {
  const image = source.ownerDocument.createElement('img');
  for (const attribute of Array.from(source.attributes)) {
    if (['src', 'srcset', 'sizes', 'poster'].includes(attribute.name)) continue;
    image.setAttribute(attribute.name, attribute.value);
  }
  image.src = src;
  image.loading = 'eager';
  image.decoding = 'sync';
  image.draggable = false;
  return image;
}

function readPlacementBlockVisualBounds(
  block: HTMLElement,
  box: PlacementContentVisualBox,
  id: string,
  transform: string,
): StablePrintPlacementBlockBounds {
  const rect = block.getBoundingClientRect();
  return {
    id,
    left: (rect.left - box.originX) / box.scaleX,
    top: (rect.top - box.originY) / box.scaleY,
    width: rect.width / box.scaleX,
    height: rect.height / box.scaleY,
    transform,
  };
}

function readPlacementVisualSurfaceBounds(
  surface: HTMLElement,
  host: HTMLElement,
  box: PlacementContentVisualBox,
): StablePrintPlacementVisualSurfaceBounds {
  const surfaceRect = surface.getBoundingClientRect();
  const hostRect = host.getBoundingClientRect();
  return {
    contentLeft: (surfaceRect.left - box.originX) / box.scaleX,
    contentTop: (surfaceRect.top - box.originY) / box.scaleY,
    hostLeft: (surfaceRect.left - hostRect.left) / box.scaleX,
    hostTop: (surfaceRect.top - hostRect.top) / box.scaleY,
    width: surfaceRect.width / box.scaleX,
    height: surfaceRect.height / box.scaleY,
    transform: readPlacementTransformSignature(getComputedStyle(surface)),
  };
}

function freezePlacementBlockLayout(
  source: HTMLElement,
  clone: HTMLElement,
  content: HTMLElement,
  computed: CSSStyleDeclaration,
  bounds: StablePrintPlacementBlockBounds,
): void {
  const width = readLayoutBorderBoxSize(source, computed, 'width');
  const height = readLayoutBorderBoxSize(source, computed, 'height');
  const origin = resolveUntransformedPlacementOrigin(
    source,
    content,
    bounds,
    width,
    height,
    computed,
  );
  const setFixed = (property: string, value: string): void => {
    clone.style.setProperty(property, value, 'important');
  };

  // 先清掉所有物理/逻辑 inset，再按稳定 content-box 坐标写回。否则 provider
  // 交付的 clone 仍可能受旧 right/bottom、百分比 inset 或响应式 max-size 约束。
  setFixed('inset', 'auto');
  setFixed('inset-inline', 'auto');
  setFixed('inset-block', 'auto');
  setFixed('right', 'auto');
  setFixed('bottom', 'auto');
  setFixed('position', 'absolute');
  setFixed('left', `${origin.left}px`);
  setFixed('top', `${origin.top}px`);
  setFixed('width', `${width}px`);
  setFixed('height', `${height}px`);
  const verticalWriting = computed.writingMode.startsWith('vertical');
  setFixed('inline-size', `${verticalWriting ? height : width}px`);
  setFixed('block-size', `${verticalWriting ? width : height}px`);
  setFixed('min-width', '0px');
  setFixed('min-height', '0px');
  setFixed('max-width', 'none');
  setFixed('max-height', 'none');
  setFixed('min-inline-size', '0px');
  setFixed('min-block-size', '0px');
  setFixed('max-inline-size', 'none');
  setFixed('max-block-size', 'none');
  setFixed('box-sizing', 'border-box');
  setFixed('aspect-ratio', 'auto');
  setFixed('margin', '0px');
  setFixed('transform', computed.transform === 'none' ? 'none' : computed.transform);
  setFixed('transform-origin', computed.transformOrigin);
  setFixed('translate', computed.getPropertyValue('translate') || 'none');
  setFixed('rotate', computed.getPropertyValue('rotate') || 'none');
  setFixed('scale', computed.getPropertyValue('scale') || 'none');
  setFixed('animation', 'none');
  setFixed('transition', 'none');
}

function resolveUntransformedPlacementOrigin(
  source: HTMLElement,
  content: HTMLElement,
  bounds: StablePrintPlacementBlockBounds,
  width: number,
  height: number,
  computed: CSSStyleDeclaration,
): {left: number; top: number} {
  const hasIndividualTransform = ['translate', 'rotate', 'scale'].some(property => {
    const value = computed.getPropertyValue(property).trim();
    return value !== '' && value !== 'none';
  });
  if (hasIndividualTransform) {
    if (source.offsetParent === content) {
      return {left: source.offsetLeft, top: source.offsetTop};
    }
    throw new PaginationExportError(
      'layout-not-ready',
      `绝对定位块 ${bounds.id} 的独立变换无法解析到 placement content box 坐标`,
      {stage: 'layout', blockId: bounds.id},
    );
  }
  const transform = computed.transform;
  if (!transform || transform === 'none') {
    return {left: bounds.left, top: bounds.top};
  }
  try {
    const Matrix = source.ownerDocument.defaultView?.DOMMatrixReadOnly
      ?? DOMMatrixReadOnly;
    const matrix = new Matrix(transform);
    const [originX, originY] = computed.transformOrigin
      .split(/\s+/)
      .slice(0, 2)
      .map(value => parseFloat(value) || 0);
    const corners = [
      [0, 0],
      [width, 0],
      [0, height],
      [width, height],
    ] as const;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    for (const [x, y] of corners) {
      const localX = x - originX!;
      const localY = y - originY!;
      const transformedW = matrix.m14 * localX
        + matrix.m24 * localY
        + matrix.m44;
      const divisor = Math.abs(transformedW) > 0.000001 ? transformedW : 1;
      const transformedX = originX! + (
        matrix.m11 * localX + matrix.m21 * localY + matrix.m41
      ) / divisor;
      const transformedY = originY! + (
        matrix.m12 * localX + matrix.m22 * localY + matrix.m42
      ) / divisor;
      minX = Math.min(minX, transformedX);
      minY = Math.min(minY, transformedY);
    }
    if (Number.isFinite(minX) && Number.isFinite(minY)) {
      return {left: bounds.left - minX, top: bounds.top - minY};
    }
  } catch {
    // Older WebViews may not expose DOMMatrixReadOnly. The standard plane makes
    // the content container the offset parent, so keep that exact fallback only.
  }
  if (source.offsetParent === content) {
    return {left: source.offsetLeft, top: source.offsetTop};
  }
  throw new PaginationExportError(
    'layout-not-ready',
    `绝对定位块 ${bounds.id} 无法解析到 placement content box 坐标`,
    {stage: 'layout', blockId: bounds.id},
  );
}

function readPlacementTransformSignature(computed: CSSStyleDeclaration): string {
  return [
    computed.transform || 'none',
    computed.getPropertyValue('translate') || 'none',
    computed.getPropertyValue('rotate') || 'none',
    computed.getPropertyValue('scale') || 'none',
  ].join('|');
}

function readLayoutBorderBoxSize(
  element: HTMLElement,
  computed: CSSStyleDeclaration,
  axis: 'width' | 'height',
): number {
  const value = parseFloat(axis === 'width' ? computed.width : computed.height);
  if (Number.isFinite(value)) {
    if (computed.boxSizing === 'border-box') return Math.max(0, value);
    const startPadding = parseFloat(
      axis === 'width' ? computed.paddingLeft : computed.paddingTop,
    ) || 0;
    const endPadding = parseFloat(
      axis === 'width' ? computed.paddingRight : computed.paddingBottom,
    ) || 0;
    const startBorder = parseFloat(
      axis === 'width' ? computed.borderLeftWidth : computed.borderTopWidth,
    ) || 0;
    const endBorder = parseFloat(
      axis === 'width' ? computed.borderRightWidth : computed.borderBottomWidth,
    ) || 0;
    return Math.max(
      0,
      value + startPadding + endPadding + startBorder + endBorder,
    );
  }
  return axis === 'width' ? element.offsetWidth : element.offsetHeight;
}

function validateProjectedPlacementPlanes(
  projections: readonly ProjectedPrintPlacementPlane[],
  policy: PaginationResourcePolicy,
  warnings: PaginationExportWarning[],
): void {
  const tolerance = 1;
  for (const projection of projections) {
    const plane = projection.element;
    const content = plane.parentElement;
    const planeId = plane.dataset['blockId'] ?? 'placement-layout';
    if (!content) {
      reportLayoutDivergence(
        planeId,
        `打印 placement plane ${planeId} 未挂载到正文 content box`,
        policy,
        warnings,
      );
      continue;
    }
    const planeRect = plane.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    const actualLeft = planeRect.left - contentRect.left;
    const actualTop = planeRect.top - contentRect.top;
    const ownsContainingBlock = plane.offsetParent === content;
    const diverged = (
      !ownsContainingBlock
      || Math.abs(actualLeft) > tolerance
      || Math.abs(actualTop - projection.expectedTop) > tolerance
      || Math.abs(planeRect.width - contentRect.width) > tolerance
    );
    if (!diverged) continue;
    reportLayoutDivergence(
      planeId,
      `打印 placement plane ${planeId} 未规范化到 content box：`
        + `期望 {left:0.00, top:${formatGeometry(projection.expectedTop)}, `
        + `width:${formatGeometry(contentRect.width)}, offsetParent:content}；打印 `
        + `{left:${formatGeometry(actualLeft)}, top:${formatGeometry(actualTop)}, `
        + `width:${formatGeometry(planeRect.width)}, offsetParent:`
        + `${plane.offsetParent === content ? 'content' : 'other'}}`,
      policy,
      warnings,
    );
  }
}

function validateStablePlacementPlanes(
  projections: readonly {
    plane: HTMLElement;
    blocks: readonly StablePrintPlacementBlockBounds[];
  }[],
  policy: PaginationResourcePolicy,
  warnings: PaginationExportWarning[],
): void {
  const tolerance = 1;
  for (const projection of projections) {
    const content = resolvePlacementPlaneContent(projection.plane);
    const box = resolvePlacementContentVisualBox(
      content,
      projection.plane.dataset['blockId'] ?? 'placement-layout',
    );
    const renderedById = new Map(
      resolveDirectPlacementBlocks(content).map(block => [
        block.dataset['blockId']!,
        block,
      ]),
    );
    for (const expected of projection.blocks) {
      const rendered = renderedById.get(expected.id);
      if (!rendered) {
        reportLayoutDivergence(
          expected.id,
          `打印 placement plane 缺少稳定分页中的绝对定位块 ${expected.id}`,
          policy,
          warnings,
        );
        continue;
      }
      const computed = getComputedStyle(rendered);
      const actual = readPlacementBlockVisualBounds(
        rendered,
        box,
        expected.id,
        readPlacementTransformSignature(computed),
      );
      const geometryDiverged = (
        Math.abs(actual.left - expected.left) > tolerance
        || Math.abs(actual.top - expected.top) > tolerance
        || Math.abs(actual.width - expected.width) > tolerance
        || Math.abs(actual.height - expected.height) > tolerance
      );
      const transformDiverged = actual.transform !== expected.transform;
      if (geometryDiverged || transformDiverged) {
        reportLayoutDivergence(
          expected.id,
          `打印绝对定位块 ${expected.id} 几何与稳定分页不一致：`
            + `稳定 {left:${formatGeometry(expected.left)}, top:${formatGeometry(expected.top)}, `
            + `width:${formatGeometry(expected.width)}, height:${formatGeometry(expected.height)}, `
            + `transform:${expected.transform}}；打印 `
            + `{left:${formatGeometry(actual.left)}, top:${formatGeometry(actual.top)}, `
            + `width:${formatGeometry(actual.width)}, height:${formatGeometry(actual.height)}, `
            + `transform:${actual.transform}}`,
          policy,
          warnings,
        );
      }

      if (!expected.visualSurface) continue;
      let surface: HTMLElement | undefined;
      try {
        surface = resolvePlacementVisualSurface(rendered, expected.id);
      } catch {
        surface = undefined;
      }
      if (!surface) {
        reportLayoutDivergence(
          expected.id,
          `打印绝对定位块 ${expected.id} 缺少稳定分页中的真实视觉面`,
          policy,
          warnings,
        );
        continue;
      }
      const actualSurface = readPlacementVisualSurfaceBounds(
        surface,
        rendered,
        box,
      );
      const surfaceDiverged = (
        Math.abs(actualSurface.contentLeft - expected.visualSurface.contentLeft) > tolerance
        || Math.abs(actualSurface.contentTop - expected.visualSurface.contentTop) > tolerance
        || Math.abs(actualSurface.hostLeft - expected.visualSurface.hostLeft) > tolerance
        || Math.abs(actualSurface.hostTop - expected.visualSurface.hostTop) > tolerance
        || Math.abs(actualSurface.width - expected.visualSurface.width) > tolerance
        || Math.abs(actualSurface.height - expected.visualSurface.height) > tolerance
        || actualSurface.transform !== expected.visualSurface.transform
      );
      if (!surfaceDiverged) continue;
      reportLayoutDivergence(
        expected.id,
        `打印绝对定位块 ${expected.id} 的真实视觉面与稳定分页不一致：`
          + `稳定 {contentLeft:${formatGeometry(expected.visualSurface.contentLeft)}, `
          + `contentTop:${formatGeometry(expected.visualSurface.contentTop)}, `
          + `hostLeft:${formatGeometry(expected.visualSurface.hostLeft)}, `
          + `hostTop:${formatGeometry(expected.visualSurface.hostTop)}, `
          + `width:${formatGeometry(expected.visualSurface.width)}, `
          + `height:${formatGeometry(expected.visualSurface.height)}, `
          + `transform:${expected.visualSurface.transform}}；打印 `
          + `{contentLeft:${formatGeometry(actualSurface.contentLeft)}, `
          + `contentTop:${formatGeometry(actualSurface.contentTop)}, `
          + `hostLeft:${formatGeometry(actualSurface.hostLeft)}, `
          + `hostTop:${formatGeometry(actualSurface.hostTop)}, `
          + `width:${formatGeometry(actualSurface.width)}, `
          + `height:${formatGeometry(actualSurface.height)}, `
          + `transform:${actualSurface.transform}}`,
        policy,
        warnings,
      );
    }
  }
}

function formatGeometry(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : String(value);
}

function validatePlacementContentBoxGeometry(input: {
  expectedX: number;
  expectedY: number;
  expectedWidth: number;
  stableX?: number;
  stableY?: number;
  stableWidth?: number;
  capturedX?: number;
  capturedY?: number;
  capturedWidth?: number;
  policy: PaginationResourcePolicy;
  warnings: PaginationExportWarning[];
}): void {
  const tolerance = 2;
  const checks = [
    ['稳定分页原点 X', input.stableX, input.expectedX],
    ['稳定分页原点 Y', input.stableY, input.expectedY],
    ['稳定分页内容宽', input.stableWidth, input.expectedWidth],
    ['只读打印原点 X', input.capturedX, input.expectedX],
    ['只读打印原点 Y', input.capturedY, input.expectedY],
    ['只读打印内容宽', input.capturedWidth, input.expectedWidth],
  ] as const;
  for (const [label, actual, expected] of checks) {
    if (!Number.isFinite(actual) || Math.abs(actual! - expected) <= tolerance) continue;
    reportLayoutDivergence(
      'placement-layout',
      `${label} ${actual}px 与 root content box ${expected}px 不一致`,
      input.policy,
      input.warnings,
    );
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
    .bc-print-content [data-bc-print-word-art-css="true"] *,
    .bc-print-leading-content [data-bc-print-word-art-css="true"] * {
      font: inherit !important;
      letter-spacing: inherit !important;
      color: inherit !important;
      -webkit-text-fill-color: inherit !important;
      -webkit-text-stroke: inherit !important;
      text-shadow: inherit !important;
      background: none !important;
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
    const marginBottom = item.trailingSpacing
      ?? (parseFloat(style.marginBottom) || 0);
    if (maxFragment != null && maxFragment > naturalHeight + marginBottom + tolerance) {
      reportLayoutDivergence(item.id, '只读打印面的块高度不足以覆盖当前分页片段', policy, warnings);
      continue;
    }
    // 未 fit 的 capHeight 块使用裁剪后页高，不能与自然 scrollHeight 做等值比较。
    // 图片/视频 fit 只缩小媒体 wrapper，caption/尾距保持自然尺寸。
    if (item.lockHeight != null && item.fitScale == null) continue;
    const media = item.fitScale != null ? measureNaturalPageMedia(el) : null;
    const mediaHeight = media?.height ?? 0;
    const naturalStride = naturalHeight + marginBottom;
    const renderedHeight = item.fitScale != null && mediaHeight > 0
      ? naturalStride - mediaHeight + mediaHeight * item.fitScale
      : naturalStride;
    if (Math.abs(renderedHeight - item.height) > tolerance) {
      const overflowY = style.overflowY || style.overflow || 'visible';
      const scale = item.fitScale ?? 1;
      reportLayoutDivergence(
        item.id,
        `只读打印面块 ${item.id} 高 ${renderedHeight}px`
          + `（内容 ${naturalHeight}px + 尾距 ${marginBottom}px，`
          + `offset ${el.offsetHeight}px / scroll ${el.scrollHeight}px，`
          + `overflow-y ${overflowY}${scale === 1 ? '' : `，媒体约束比例 ${scale}`}）`
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

    // capHeight 块超高 → 图片/视频限制媒体 wrapper，其余原子块保留裁剪策略。
    // visible overflow 属于块的外部视觉高度；hidden/clip/scroll overflow 只属于块内部。
    let lockHeight: number | undefined;
    const naturalStride = height
    const pageMedia = !!el && canFitPageMedia(el, blk.flavour)
    const media = pageMedia && el ? measureNaturalPageMedia(el) : null
    const mediaHeight = media?.height ?? 0
    const nonMediaStride = mediaHeight > 0 ? Math.max(0, naturalStride - mediaHeight) : 0
    const naturalWidth = media?.width ?? (el ? measureBlockContentWidth(el, contentWidth) : 0)
    const widthScale = pageMedia
      && !policy.breakable
      && naturalWidth > contentWidth + 0.5
        ? contentWidth / naturalWidth
        : 1
    const heightScale = pageMedia
      && mediaHeight > 0
      && naturalStride > regularContentHeight
        ? Math.max(0.01, regularContentHeight - nonMediaStride) / mediaHeight
        : 1
    const fitScale = Math.max(0.01, Math.min(1, widthScale, heightScale))
    let effHeight = pageMedia && mediaHeight > 0 && fitScale < 1
      ? mediaHeight * fitScale + nonMediaStride
      : height;
    if (policy.capHeight && visualContentHeight > regularContentHeight && regularContentHeight > 0) {
      lockHeight = pageMedia && fitScale < 1 ? undefined : regularContentHeight;
      if (!pageMedia) effHeight = regularContentHeight;
    }

    items.push({
      id: blk.id,
      height: effHeight,
      trailingSpacing: mb,
      breakable: policy.breakable,
      keepWithNext: policy.keepWithNext,
      splitOffsets,
      preferredSplitOffsets,
      lockHeight,
      fitScale: pageMedia && fitScale < 1 ? fitScale : undefined,
      repeatHeaderHeight,
      splitStartsNewPage: blk.flavour === 'table' || undefined, // 表格拆分独占新页起
      manualBreak: isManualBreak(blk.flavour),
    });
  }
  return items;
}

function normalizeStableTrailingSpacing(
  items: readonly PaginationItem[],
  elById: ReadonlyMap<string, HTMLElement>,
): void {
  for (const item of items) {
    if (item.trailingSpacing == null) continue;
    const element = elById.get(item.id);
    if (!element) continue;
    const spacing = Number.isFinite(item.trailingSpacing)
      ? item.trailingSpacing
      : 0;
    element.style.setProperty('margin-bottom', `${spacing}px`, 'important');
  }
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
  applyChromeAppearance(el, chrome);
  el.appendChild(createChromeSegmentElement({
    className: 'bc-page-chrome-left', text: segs.left,
    content: resolveChromeInlineContent(chrome?.content?.left, page, total), align: 'left',
  }));
  el.appendChild(createChromeSegmentElement({
    className: 'bc-page-chrome-center', text: segs.center,
    content: resolveChromeInlineContent(chrome?.content?.center, page, total), align: 'center',
  }));
  el.appendChild(createChromeSegmentElement({
    className: 'bc-page-chrome-right', text: segs.right,
    content: resolveChromeInlineContent(chrome?.content?.right, page, total), align: 'right',
  }));
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
