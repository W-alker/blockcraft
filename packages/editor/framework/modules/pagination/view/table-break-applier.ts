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
 * 安全取块：`doc.getBlockById` 在块不存在时抛错。稀疏 applier 只查询 mounted
 * 目标，但结构事件和组件销毁仍可能交错，因此缺块必须静默跳过。
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
  private _applied = new Map<string, PaginatedTableBlock>();
  private _breaks = new Map<string, Array<{beforeRowId: string; gap: number}>>();
  private _mountedIds: ReadonlySet<string> | null = null;

  constructor(private doc: BlockCraft.Doc) {}

  apply(metas: BlockMeta[], result: PaginationResult, sheetHeightPx: number, pageGap: number): void {
    const nextBreaks = new Map<string, Array<{beforeRowId: string; gap: number}>>();
    for (const meta of metas) {
      if (!meta.tableRows) continue; // 仅可屏幕拆分的表格
      const breaks = computeTableBreaks(meta.id, meta.tableRows, result, sheetHeightPx, pageGap);
      nextBreaks.set(meta.id, breaks);
    }
    this._breaks = nextBreaks;
    this._reconcile();
  }

  syncMounted(mountedRootIds: readonly string[]): void {
    this._mountedIds = new Set(mountedRootIds);
    this._reconcile();
  }

  private _reconcile(): void {
    for (const [id, table] of this._applied) {
      if (this._breaks.has(id) && this._isMounted(id)) continue;
      table.clearPaginationBreaks();
      this._applied.delete(id);
    }

    for (const [id, breaks] of this._breaks) {
      if (!this._isMounted(id)) continue;
      const table = safePaginatedTable(this.doc, id);
      const previous = this._applied.get(id);
      if (previous && previous !== table) {
        previous.clearPaginationBreaks();
        this._applied.delete(id);
      }
      if (!table) continue;
      table.applyPaginationBreaks(breaks);
      if (breaks.length) this._applied.set(id, table);
      else this._applied.delete(id);
    }
  }

  clear(): void {
    for (const table of this._applied.values()) {
      table.clearPaginationBreaks();
    }
    this._applied.clear();
    this._breaks.clear();
  }

  private _isMounted(id: string): boolean {
    return this._mountedIds?.has(id) ?? true;
  }
}
