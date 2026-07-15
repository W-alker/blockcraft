// packages/editor/framework/modules/pagination/view/table-break-applier.ts
import {PaginationResult} from "../engine";
import {BlockMeta} from "./item-builder";
import {computeTableBreaks} from "./table-split";

interface PaginatedTableBlock {
  applyPaginationBreaks(breaks: Array<{beforeRowId: string; gap: number}>): void;
  clearPaginationBreaks(): void;
}

function asPaginatedTable(block: any): PaginatedTableBlock | null {
  return block && typeof block.applyPaginationBreaks === 'function' ? block as PaginatedTableBlock : null;
}

/**
 * 安全取块：`doc.getBlockById` 在块不存在时**抛错**（不是返回 null）。本 applier 的 `_broken` 集合
 * 持有上一轮的表格 id，若该表格已被删除/撤销/替换，下一轮 cleanup 调 getBlockById 会抛错并**炸掉整个
 * _recompute**——而此前的 apply 已改过 DOM，触发 ResizeObserver → 再次 _recompute → 再抛 → 疯狂重算。
 * 用 onError 短路 + try 兜底，缺块时静默跳过。
 */
function safePaginatedTable(doc: BlockCraft.Doc, id: string): PaginatedTableBlock | null {
  let missing = false;
  try {
    const block = doc.getBlockById(id, () => { missing = true; });
    return missing ? null : asPaginatedTable(block);
  } catch {
    return null;
  }
}

/**
 * 把引擎拆分结果落到「被拆表格」上：每个 table meta 计算行断点并调 applyPaginationBreaks（幂等）。
 * 跟踪当前有断点的表格 id，下一轮不再拆的表格显式清空——同 GapApplier 的可逆模式，不写 Yjs。
 */
export class TableBreakApplier {
  private _broken = new Set<string>();

  constructor(private doc: BlockCraft.Doc) {}

  apply(metas: BlockMeta[], result: PaginationResult, sheetHeightPx: number, pageGap: number): void {
    const nextBroken = new Set<string>();
    for (const meta of metas) {
      if (!meta.tableRows) continue; // 仅可屏幕拆分的表格
      const block = safePaginatedTable(this.doc, meta.id);
      if (!block) continue;
      const breaks = computeTableBreaks(meta.id, meta.tableRows, result, sheetHeightPx, pageGap);
      block.applyPaginationBreaks(breaks);
      if (breaks.length) nextBroken.add(meta.id);
    }
    // 上一轮拆了、这一轮不在结果里的表格 → 清空残留占位行（块可能已被删除，safePaginatedTable 兜底）
    for (const id of this._broken) {
      if (!nextBroken.has(id)) {
        safePaginatedTable(this.doc, id)?.clearPaginationBreaks();
      }
    }
    this._broken = nextBroken;
  }

  clear(): void {
    for (const id of this._broken) {
      safePaginatedTable(this.doc, id)?.clearPaginationBreaks();
    }
    this._broken.clear();
  }
}
