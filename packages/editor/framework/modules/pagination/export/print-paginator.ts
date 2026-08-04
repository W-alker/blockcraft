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
import {resolveChromeSegments} from "../view/chrome-tokens";
import {computeSplitOffsets, computeTableSplitOffsets} from "../view/split-points";
import {StablePaginationLayout} from "../view/stable-pagination-layout";
import {PaginationExportError, PaginationExportWarning, PaginationResourcePolicy} from "./pdf-export.types";
import {appendFlowSentinel} from './print-dom';
import {preparePrintResources} from "./print-resources";

/**
 * 打印内容渲染来源：在指定内容宽下离屏渲染快照，返回承载已渲染顶层块（带 `data-block-id`）的根元素
 * 与清理函数。`buildPrintPages` 据此把块搬进逐页 A4 页盒。
 */
export type PrintRenderProvider = (contentWidthPx: number) => Promise<{root: HTMLElement; dispose(): void}>;

export interface PrintPages {
  /** 包含 N 个 `.bc-print-page` 的容器（已挂到 document.body 的离屏位置）。 */
  container: HTMLElement;
  pages: HTMLElement[];
  pageCount: number;
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
}

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
  const {sheetWidthPx, sheetHeightPx, margins, headerHeight, footerHeight} = geom;
  const contentWidthPx = sheetWidthPx - margins.left - margins.right;

  // pt 尺寸（宿主打印元数据）：命名纸张回到标准 pt，自定义按 px≈pt 处理。
  const ptDims = pagePtDimensions(effectiveConfig);

  // 1) 渲染内容（内容宽）：默认离屏 snapshot-viewer；或调用方提供的 render（如只读编辑器渲染）。
  let renderRoot: HTMLElement;
  let disposeRender: () => void;
  if (override?.render) {
    const r = await override.render(contentWidthPx);
    renderRoot = r.root;
    disposeRender = r.dispose;
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

  let warnings: PaginationExportWarning[] = [];
  try {
    const prepared = await preparePrintResources(renderRoot, {
      resourcePolicy: override?.resourcePolicy,
      signal: override?.signal,
    });
    warnings = prepared.warnings;
  } catch (error) {
    disposeRender();
    throw error;
  }

  // 2) 顶层块 id → 渲染 DOM（始终建立，用于把块搬进页盒）。按唯一 id 在渲染根内查找，
  //    兼容两种渲染源（snapshot-viewer 的 data-blockcraft-root 直接子级 / 只读 doc 的嵌套结构）。
  const topSnapshots = (snapshot.children as IBlockSnapshot[]) ?? [];
  const elById = new Map<string, HTMLElement>();
  for (const blk of topSnapshots) {
    const el = renderRoot.querySelector(`[data-block-id="${blk.id}"]`) as HTMLElement | null;
    if (el) elById.set(blk.id, el);
  }

  // 分页 items：优先用调用方传入的（屏幕 live 测量，保证打印断点 == 屏幕所见）；
  // 否则就地测离屏渲染高度（无 live 编辑器的纯导出路径，行为同前）。
  const items: readonly PaginationItem[] = override?.layout?.items
    ?? override?.items
    ?? measureItemsFromDom(topSnapshots, elById, geom.geometry.contentHeight, effectiveConfig);
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
      validateStableLayout(items, result, elById, override.resourcePolicy ?? 'strict', warnings);
    } catch (error) {
      disposeRender();
      throw error;
    }
  }

  // capHeight 块只在确实超页时标记，由主题按页面内容高变量裁剪。
  const lockedIds = new Set<string>();
  // 带表头表格的续页重复表头高：续页片段（fromOffset>0）顶部多渲一份表头窗口。
  const repeatHeaderById = new Map<string, number>();
  for (const it of items) {
    if (it.lockHeight != null && it.lockHeight > 0) lockedIds.add(it.id);
    if (it.repeatHeaderHeight != null && it.repeatHeaderHeight > 0) repeatHeaderById.set(it.id, it.repeatHeaderHeight);
  }

  // 4) 构建逐页 A4 容器，把块搬进去
  const container = document.createElement('div');
  container.className = 'bc-print-root';
  container.setAttribute('data-bc-print-root', 'true');
  container.style.cssText = `position:absolute; left:-99999px; top:0;`;

  const pageEls: HTMLElement[] = [];
  const total = result.pages.length;
  for (const page of result.pages) {
    const pageEl = document.createElement('div');
    pageEl.className = 'bc-print-page';
    pageEl.style.cssText =
      `position:relative; box-sizing:border-box; overflow:hidden; background:#fff;` +
      `width:${sheetWidthPx}px; height:${sheetHeightPx}px;`;
    appendPrintOnlyStyles(pageEl);

    const pageNo = page.index + 1;
    if (headerHeight > 0) {
      pageEl.appendChild(buildChrome(effectiveConfig.header, pageNo, total, margins.top, headerHeight, margins));
    }
    if (footerHeight > 0) {
      const top = sheetHeightPx - margins.bottom - footerHeight;
      pageEl.appendChild(buildChrome(effectiveConfig.footer, pageNo, total, top, footerHeight, margins));
    }

    // 内容区：用 data-blockcraft-root 包裹，保留主题后代选择器样式
    const content = document.createElement('div');
    content.setAttribute('data-blockcraft-root', 'true');
    content.className = 'readonly bc-print-content';
    content.style.cssText =
      `position:absolute; box-sizing:border-box; min-height:0; padding:0; overflow:hidden;` +
      `top:${margins.top + headerHeight}px; left:${margins.left}px; right:${margins.right}px;` +
      `bottom:${margins.bottom + footerHeight}px;`;
    content.style.setProperty('--bc-page-content-height', `${geom.geometry.contentHeight}px`);
    for (const slot of page.slots) {
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
        el.classList.toggle('bc-page-height-locked', lockedIds.has(slot.id));
        // capHeight 块由锁定 class + 页面内容高变量统一裁剪。
        content.appendChild(el); // 整块：搬移（从离屏 root 移走，DOM 节点唯一）
      }
    }
    // live root 尾部存在编辑器辅助节点，因此最后一个顶层块不会命中
    // `[data-block-id]:last-child { margin-bottom: 0 }`。打印面没有这些辅助节点，
    // 补一个不参与布局的结构哨兵，确保逐页搬移后仍保留分页计算时的块间距。
    appendFlowSentinel(content);
    pageEl.appendChild(content);
    container.appendChild(pageEl);
    pageEls.push(pageEl);
  }

  document.body.appendChild(container);

  return {
    container,
    pages: pageEls,
    pageCount: total,
    pageWidthPx: sheetWidthPx,
    pageHeightPx: sheetHeightPx,
    pageWidthPt: ptDims.width,
    pageHeightPt: ptDims.height,
    layoutRevision: override?.layout?.revision,
    warnings,
    // 渲染源（snapshot-viewer 离屏 div / 只读 doc）在内容被搬进页盒后于 dispose 统一清理。
    // 注意：只读 doc 的块组件由其 doc 持有，dispose（destroy doc）会销毁这些已搬走的节点——
    // 故必须在 window.print() 之后再 dispose。
    dispose: () => {
      container.remove();
      disposeRender();
    },
  };
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
  elById: Map<string, HTMLElement>,
  policy: PaginationResourcePolicy,
  warnings: PaginationExportWarning[],
): void {
  const tolerance = 2;
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
    const naturalHeight = Math.max(el.offsetHeight, el.scrollHeight);
    const marginBottom = parseFloat(getComputedStyle(el).marginBottom) || 0;
    if (maxFragment != null && maxFragment > naturalHeight + marginBottom + tolerance) {
      reportLayoutDivergence(item.id, '只读打印面的块高度不足以覆盖当前分页片段', policy, warnings);
      continue;
    }
    // capHeight 的 stable height 是裁剪后的页高，不能与自然 scrollHeight 做等值比较。
    if (item.lockHeight != null) continue;
    const renderedHeight = el.offsetHeight + marginBottom;
    if (Math.abs(renderedHeight - item.height) > tolerance) {
      reportLayoutDivergence(
        item.id,
        `只读打印面块高 ${renderedHeight}px 与分页视图 ${item.height}px 不一致`,
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
  config: PaginationConfig,
): PaginationItem[] {
  const items: PaginationItem[] = [];
  for (const blk of topSnapshots) {
    const el = elById.get(blk.id) ?? null;
    const cs = el ? getComputedStyle(el) : null;
    const mb = cs ? parseFloat(cs.marginBottom) || 0 : 0;
    const isHeading = !!(blk.props && (blk.props as any).heading);
    const policy = resolveBlockPolicy({flavour: blk.flavour, nodeType: blk.nodeType, isHeading});
    const height = el ? el.offsetHeight + mb : 0;

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

    // capHeight 块（图片/视频/嵌入等原子块 + 代码块）超高 → 锁定最大高度到一页内、整块占一页（裁剪不缩放）。
    // 离屏导出渲染是一次性、无 max-height 施加，offsetHeight 即自然高度。
    const oh = el ? el.scrollHeight : 0;
    let lockHeight: number | undefined;
    let effHeight = height;
    if (policy.capHeight && oh > regularContentHeight && regularContentHeight > 0) {
      lockHeight = regularContentHeight;
      effHeight = regularContentHeight;
    }

    items.push({
      id: blk.id,
      height: effHeight,
      breakable: policy.breakable,
      keepWithNext: policy.keepWithNext,
      splitOffsets,
      preferredSplitOffsets,
      lockHeight,
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

/** 纸张 pt 尺寸（宿主原生打印后端用）。命名纸张取标准 pt；自定义 px 直接当 pt。 */
function pagePtDimensions(config: PaginationConfig): {width: number; height: number} {
  const PT: Record<string, {width: number; height: number}> = {
    A0: {width: 2384, height: 3370}, A1: {width: 1684, height: 2384}, A2: {width: 1191, height: 1684},
    A3: {width: 842, height: 1191}, A4: {width: 595, height: 842}, A5: {width: 420, height: 595},
    A6: {width: 298, height: 420}, Letter: {width: 612, height: 792}, Legal: {width: 612, height: 1008},
    Tabloid: {width: 792, height: 1224},
  };
  const size = config.pageSize ?? 'A4';
  let base = typeof size === 'string' ? (PT[size] ?? PT['A4']) : {width: size.width, height: size.height};
  if (config.orientation === 'landscape') base = {width: base.height, height: base.width};
  return base;
}
