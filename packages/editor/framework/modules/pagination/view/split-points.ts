// packages/editor/framework/modules/pagination/view/split-points.ts
//
// 超大块（高过一整页）的安全拆分点：仅对 oversized && breakable 块惰性调用，
// 用 Range.getClientRects()（文本行盒）/ <tr>（表格行）测出「块顶起算的安全切点（px）」，
// 交给纯引擎在跨页处切片，避免 PDF 导出时 overflow:hidden 把超大块尾部直接截断丢内容。
//
// 放在 view/（DOM 测量层，与 live-height-source 同层），保持 engine/ 纯逻辑无 DOM 的不变量。
//
// 跨浏览器注意：getClientRects() 在缩放下有亚像素抖动，按「垂直重叠」聚类成行（容差 1px）；
// 偏移以块 border-box 顶（getBoundingClientRect().top）为原点，故落在 (0, offsetHeight) 内，
// 严格小于引擎用的块总高（offsetHeight + marginBottom），是合法内部切点。

export interface SplitPointsOptions {
  /** 拆分时每侧至少保留的行/行盒数（widow/orphan 控制），默认 2。 */
  widowOrphanLines?: number;
}

const DEFAULT_WIDOW_ORPHAN = 2;
/** 行聚类容差（px）：同一行内不同字号行盒底边的亚像素差异。真实行间距远大于此。 */
const LINE_MERGE_TOLERANCE = 1;

interface LineBox {
  top: number;
  bottom: number;
}

/**
 * 计算块的安全拆分偏移（块 border-box 顶起算 px，升序、严格在 (0, 高) 内）。
 * - `table`：按 `<tr>` 底边（按行拆，表头重复留 v2）。
 * - 其它 editable（paragraph / blockquote / caption / list / code / mermaid-textarea…）：按文本行盒底边。
 * 过滤 widow/orphan：保证每侧 ≥ `widowOrphanLines` 行。
 * 测不到（无内容 / 单行 / 行数不足两侧最小行）→ 返回 `[]`，引擎退化为原子（v1 允许溢出）。
 */
export function computeSplitOffsets(el: HTMLElement, flavour: string, opts: SplitPointsOptions = {}): number[] {
  const minLines = Math.max(1, Math.floor(opts.widowOrphanLines ?? DEFAULT_WIDOW_ORPHAN));
  if (flavour === 'table') return computeTableSplitOffsets(el, opts).all;
  return widowOrphanCuts(lineBottoms(el, el.getBoundingClientRect().top), minLines);
}

/**
 * 表格按行切点（导出侧从渲染 DOM 读）。返回：
 * - `all`：所有行边界（widow/orphan 过滤）；跨合并单元格的边界也在内（断在此会拆分该合并单元格）。
 * - `preferred`：「干净」行边界（不跨合并单元格）；引擎优先选这些，实在不行才切跨合并的边界。
 * 用本表自身的 `HTMLTableElement.rows`（不含嵌套表行）而非 querySelectorAll('tr')，对未来放开嵌套也稳健。
 */
export function computeTableSplitOffsets(el: HTMLElement, opts: SplitPointsOptions = {}): {all: number[]; preferred: number[]} {
  const minLines = Math.max(1, Math.floor(opts.widowOrphanLines ?? DEFAULT_WIDOW_ORPHAN));
  const originTop = el.getBoundingClientRect().top;
  const tableEl = el.querySelector('table') as HTMLTableElement | null;
  const rows = (tableEl ? Array.from(tableEl.rows) : Array.from(el.querySelectorAll('tr'))) as HTMLElement[];
  const bottoms = rows.map(r => Math.round(r.getBoundingClientRect().bottom - originTop));
  return {
    // all = 可断边界，**排除带内容合并单元格内部**（无法跨页拆、拆开必溢出 → keep-together），与屏幕一致；
    // 空合并单元格内部仍可断。无内容合并时与 widowOrphanCuts 等价。
    all: rowSplitOffsets(bottoms, domRowContentCoverage(rows), minLines),
    preferred: rowSplitOffsets(bottoms, domRowCoverage(rows), minLines),
  };
}

/**
 * 逐行判定「该行是否被上方某个**带内容**的 rowspan 单元格覆盖」（渲染 DOM 版，对标屏幕 `cell.hasContent`）。
 * 带内容竖向合并单元格无法跨页拆（内容流不进空续段、必溢出），故其内部边界完全不可断 → keep-together。
 * 「带内容」= 去零宽空格后有文本，或含媒体/void 元素。
 */
function domRowContentCoverage(rows: HTMLElement[]): boolean[] {
  const n = rows.length;
  const covered = new Array<boolean>(n).fill(false);
  for (let r = 0; r < n; r++) {
    for (const cell of Array.from(rows[r].children)) {
      if (cell.tagName !== 'TD' && cell.tagName !== 'TH') continue;
      const rs = parseInt(cell.getAttribute('rowspan') || '1', 10) || 1;
      if (rs <= 1) continue;
      const hasContent = (cell.textContent || '').replace(/[​\s]/g, '').length > 0
        || !!cell.querySelector('img, video, audio, iframe, canvas, [data-node-type="void"]');
      if (!hasContent) continue;
      for (let rr = r + 1; rr < r + rs && rr < n; rr++) covered[rr] = true;
    }
  }
  return covered;
}

/**
 * 逐行判定「该行是否被上方某个 rowspan 单元格覆盖」（来自渲染 DOM 的 <td rowspan>）。
 * `covered[r] === true` ⇔ 存在起始于 <r 行、rowspan 延伸到 r 行的单元格 → 边界 r 被合并单元格跨越，不可切。
 * 只需布尔（任意列被覆盖即可），无需精确列定位，故对 colspan 不敏感、实现简单稳健。
 */
function domRowCoverage(rows: HTMLElement[]): boolean[] {
  const n = rows.length;
  const covered = new Array<boolean>(n).fill(false);
  for (let r = 0; r < n; r++) {
    for (const cell of Array.from(rows[r].children)) {
      if (cell.tagName !== 'TD' && cell.tagName !== 'TH') continue;
      const rs = parseInt(cell.getAttribute('rowspan') || '1', 10) || 1;
      for (let rr = r + 1; rr < r + rs && rr < n; rr++) covered[rr] = true;
    }
  }
  return covered;
}

/**
 * 文本行盒底边（块顶起算 px，升序）。按垂直重叠把行盒聚类成行。
 * 逐个后代文本节点取 Range.getClientRects()（每个换行片段一个 rect）——比对整个 host
 * selectNodeContents 更稳：后者在含块级子节点/嵌套结构时各浏览器返回不一致（实测可能为空）。
 */
function lineBottoms(el: HTMLElement, originTop: number): number[] {
  const doc = el.ownerDocument;
  const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const rects: DOMRect[] = [];
  let node = walker.nextNode();
  while (node) {
    if ((node.nodeValue ?? '').trim()) {
      const range = doc.createRange();
      range.selectNodeContents(node);
      for (const r of Array.from(range.getClientRects())) {
        if (r.height > 0 && r.width > 0) rects.push(r);
      }
    }
    node = walker.nextNode();
  }

  const sorted = rects.slice().sort((a, b) => a.top - b.top || a.bottom - b.bottom);
  const lines: LineBox[] = [];
  for (const r of sorted) {
    const last = lines[lines.length - 1];
    // top 落在当前行底边之上（容差）= 与该行垂直重叠 → 并入同一行，取最大底边。
    if (last && r.top < last.bottom - LINE_MERGE_TOLERANCE) {
      last.bottom = Math.max(last.bottom, r.bottom);
      last.top = Math.min(last.top, r.top);
    } else {
      lines.push({top: r.top, bottom: r.bottom});
    }
  }
  return lines.map(l => Math.round(l.bottom - originTop));
}

/**
 * 行底边数组 → 合法切点。在第 k 行后切（1 ≤ k ≤ L-1）= 偏移 bottoms[k-1]，
 * 上方 k 行、下方 L-k 行。要求两侧 ≥ minLines → minLines ≤ k ≤ L-minLines。
 * 故有效下标区间 [minLines-1, L-minLines-1]；L < 2*minLines 时无合法切点。
 * 末行底边（= 块内容底）永远被排除，结果都是严格内部切点。
 *
 * 导出供单测：纯整数运算，是 widow/orphan 语义的真相来源。
 */
export function widowOrphanCuts(bottoms: number[], minLines: number): number[] {
  const L = bottoms.length;
  if (L < 2 * minLines) return [];
  const out: number[] = [];
  for (let i = minLines - 1; i <= L - minLines - 1; i++) {
    if (bottoms[i] > 0) out.push(bottoms[i]);
  }
  return out;
}

/**
 * 表格按行切点：在 widow/orphan 窗口内，**额外跳过被合并单元格（rowspan）跨越的边界**。
 * - `bottoms[i]`：第 i 行底边（块顶起算 px，升序）。
 * - `coveredFromAbove[r]`：第 r 行是否被起始于更上方的 rowspan 单元格覆盖（边界 r 被跨越）。
 * 在第 i 行底切 = 边界 i+1；若 `coveredFromAbove[i+1]` 为真，则该处切会把合并单元格腰斩，跳过。
 *
 * `coveredFromAbove` 全 false 时等价于 {@link widowOrphanCuts}。纯逻辑、可单测。
 */
export function rowSplitOffsets(bottoms: number[], coveredFromAbove: boolean[], minLines: number): number[] {
  const L = bottoms.length;
  if (L < 2 * minLines) return [];
  const out: number[] = [];
  for (let i = minLines - 1; i <= L - minLines - 1; i++) {
    if (coveredFromAbove[i + 1]) continue; // 边界 i+1 被 rowspan 跨越 → 不可切
    if (bottoms[i] > 0) out.push(bottoms[i]);
  }
  return out;
}
