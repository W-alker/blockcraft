// packages/editor/framework/modules/pagination/engine/pagination-engine.ts
import {BlockPlacement, PageGeometry, PageLayout, PageSlot, PaginationItem, PaginationResult} from "./types";

/** 候选切点：splitOffsets ∪ {total}，严格 (0,total]，升序去重。块末尾 total 永远是合法切点。 */
function candidateCuts(splitOffsets: number[] | undefined, total: number): number[] {
  const set = new Set<number>();
  for (const o of splitOffsets ?? []) {
    if (o > 0 && o < total) set.add(o);
  }
  set.add(total);
  return Array.from(set).sort((a, b) => a - b);
}

/**
 * 在 (fragStart, limit] 中选切点，优先级：
 *   1. 区间内最大的「优先」切点（preferred，如不跨合并单元格的干净行边界）；
 *   2. 退而求其次：区间内最大的普通切点；
 *   3. 区间内无候选：> fragStart 的最小候选（保证进展，允许溢出）；
 *   4. 再无：total。
 * cuts 已升序；preferredSet 为 preferred 切点集合（总含 total，因 candidateCuts 无条件加 total）。
 */
function pickCut(cuts: number[], preferredSet: Set<number>, fragStart: number, limit: number, total: number): number {
  let best = -1;
  let bestPreferred = -1;
  let smallestBeyond = -1;
  for (const c of cuts) {
    if (c <= fragStart) continue;
    if (smallestBeyond < 0) smallestBeyond = c; // 升序：首个 > fragStart 即最小
    if (c <= limit) {
      if (c > best) best = c;
      if (preferredSet.has(c) && c > bestPreferred) bestPreferred = c;
    }
  }
  if (bestPreferred > 0) return bestPreferred; // 优先干净边界
  if (best > 0) return best;
  if (smallestBeyond > 0) return smallestBeyond;
  return total;
}

/** 从 from 起的首个非 manualBreak 块。 */
function nextContentItem(items: PaginationItem[], from: number): PaginationItem | undefined {
  for (let i = from; i < items.length; i++) {
    if (!items[i].manualBreak) return items[i];
  }
  return undefined;
}

/**
 * 块感知分页。纯函数，不碰 DOM/Yjs。
 * - 放得下 → 放；放不下整块 → 下推到下一页（不切断普通块）；
 * - 超大可拆块 → 在 splitOffsets 安全切点跨页拆；
 * - 超大原子块 → 独占新页、v1 允许溢出；
 * - manualBreak（page-divider）→ 强制新页，自身不占高度、不进任何一页；
 * - 空输入 → 单个空页。
 */
export function paginate(items: PaginationItem[], geometry: PageGeometry): PaginationResult {
  const firstH = geometry.firstPageContentHeight ?? geometry.contentHeight;
  const regularH = geometry.contentHeight;

  const pages: PageLayout[] = [];
  const byBlock = new Map<string, BlockPlacement>();

  let slots: PageSlot[] = [];
  let cursor = 0;

  const capacity = (): number => (pages.length === 0 ? firstH : regularH);

  const commit = (): void => {
    pages.push({index: pages.length, slots, usedHeight: cursor});
    slots = [];
    cursor = 0;
  };

  const recordFirstPage = (id: string): void => {
    if (!byBlock.has(id)) byBlock.set(id, {pageIndex: pages.length});
  };

  for (let i = 0; i < items.length; i++) {
    const it = items[i];

    if (it.manualBreak) {
      if (slots.length > 0) commit();
      continue;
    }

    // keepWithNext 前瞻：当前块放得下、但其后剩余装不下下一块、且二者合计能装一页 → 一起下推
    if (it.keepWithNext && it.height <= capacity() - cursor && slots.length > 0) {
      const next = nextContentItem(items, i + 1);
      const remainingAfter = capacity() - cursor - it.height;
      if (next && next.height > remainingAfter && it.height + next.height <= capacity()) {
        commit();
      }
    }

    const remaining = capacity() - cursor;

    // 情况1：整块放得下
    if (it.height <= remaining) {
      recordFirstPage(it.id);
      slots.push({id: it.id});
      cursor += it.height;
      continue;
    }

    // 情况3a：可拆块跨页拆。两种触发：
    //   ① 本身高过一整页（必须拆）；
    //   ② 本页剩余空间内存在安全切点 → 就地拆开填满本页再续下页（Word 式填充，不浪费页底空白）。
    // 仅 ① 时 ② 也可能为假（剩余太小放不下最小安全片），那就走情况2 整块下推。
    const safeCutFitsRemaining = it.breakable
      && (it.splitOffsets?.some(o => o > 0 && o <= remaining) ?? false);
    if (it.breakable && (it.height > capacity() || safeCutFitsRemaining)) {
      // 拆分独占新页起（表格）：当前页已有内容则先 commit，让被拆块从新页顶开始、不拼前一页剩余。
      if (it.splitStartsNewPage && slots.length > 0) commit();
      const total = it.height;
      const cuts = candidateCuts(it.splitOffsets, total);
      // 优先切点集合：在合法区间内优先选这些（表格的「干净」行边界），选不到再退普通切点。
      const preferredSet = new Set(candidateCuts(it.preferredSplitOffsets, total));
      const headerH = it.repeatHeaderHeight ?? 0; // 带表头表格：续页重复表头高
      let fragStart = 0;
      let guard = 0;
      while (fragStart < total) {
        if (guard++ > cuts.length * 2 + 8) break; // 终止守卫（理论不触发）
        // 续页（fromOffset>0）预留重复表头高 → 行片可用空间相应减小，避免「行 + 重复表头」溢出页。
        // 首片（fragStart=0）含原表头（行0），不额外预留。
        const headerReserve = fragStart > 0 ? headerH : 0;
        const avail = capacity() - cursor - headerReserve;
        const cut = pickCut(cuts, preferredSet, fragStart, fragStart + avail, total);
        // pickCut 区间内有候选时片段必 ≤ avail；否则返回越界候选（片段 > avail）。
        const fits = cut - fragStart <= avail;
        if (!fits && slots.length > 0) {
          // 当前页（已有内容/已满）放不下任何安全片 → 换页重试，不把超额片塞进去
          commit();
          continue;
        }
        // fits；或空页强切（单片 > 整页，溢出接受，保证进展）
        if (fragStart === 0) recordFirstPage(it.id);
        slots.push({id: it.id, fragment: {fromOffset: fragStart, toOffset: cut}});
        cursor += (cut - fragStart) + headerReserve; // usedHeight 含续页重复表头
        fragStart = cut;
        if (fragStart < total) commit();
      }
      continue;
    }

    // 情况2：放不下整块、且不在剩余空间内安全拆 → 整块下推到下一页（keep-together）
    if (it.height <= capacity()) {
      if (slots.length > 0) commit();
      recordFirstPage(it.id);
      slots.push({id: it.id});
      cursor = it.height;
      continue;
    }

    // 情况3b：超大原子块（不可拆，v1 允许溢出）→ 独占新页起，占满一页逼下个块换页
    if (slots.length > 0) commit();
    recordFirstPage(it.id);
    slots.push({id: it.id});
    cursor = capacity();
  }

  if (slots.length > 0 || pages.length === 0) commit();

  return {pages, byBlock};
}
