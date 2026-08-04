// packages/editor/framework/modules/pagination/view/table-break-applier.ts
import {PaginationResult} from "../engine";
import {getTableCellFlowPlan} from "../engine/table-cell-flow-metadata";
import {BlockMeta} from "./item-builder";
import {computeTableBreaks, TableBreak} from "./table-split";
import {
  applyTablePaginationBreaks,
  clearTablePaginationBreaks,
  hasTablePaginationAccess,
} from "./table-pagination-access";

/**
 * 安全取块：`doc.getBlockById` 在块不存在时抛错。稀疏 applier 只查询 mounted
 * 目标，但结构事件和组件销毁仍可能交错，因此缺块必须静默跳过。
 */
function safePaginatedTable(doc: BlockCraft.Doc, id: string): object | null {
  let missing = false;
  try {
    const block = doc.getBlockById(id, () => { missing = true; });
    return missing || !block || !hasTablePaginationAccess(block) ? null : block;
  } catch {
    return null;
  }
}

/**
 * 把引擎拆分结果落到「被拆表格」上：每个 table meta 计算行断点并调 applyPaginationBreaks（幂等）。
 * 跟踪当前有断点的表格 id，下一轮不再拆的表格显式清空——同 GapApplier 的可逆模式，不写 Yjs。
 */
export class TableBreakApplier {
  private _applied = new Map<string, object>();
  private _breaks = new Map<string, TableBreak[]>();
  private _mountedIds: ReadonlySet<string> | null = null;

  constructor(private doc: BlockCraft.Doc) {}

  apply(
    metas: BlockMeta[],
    result: PaginationResult,
    sheetHeightPx: number,
    pageGap: number,
    contentTop = 0,
  ): void {
    const nextBreaks = new Map<string, TableBreak[]>();
    for (const meta of metas) {
      if (!meta.tableRows) continue; // 仅可屏幕拆分的表格
      const breaks = computeTableBreaks(
        meta.id,
        meta.tableRows,
        result,
        sheetHeightPx,
        pageGap,
        getTableCellFlowPlan(meta),
        contentTop,
      );
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
      clearTablePaginationBreaks(table);
      this._applied.delete(id);
    }

    for (const [id, breaks] of this._breaks) {
      if (!this._isMounted(id)) continue;
      const table = safePaginatedTable(this.doc, id);
      const previous = this._applied.get(id);
      if (previous && previous !== table) {
        clearTablePaginationBreaks(previous);
        this._applied.delete(id);
      }
      if (!table) continue;
      applyTablePaginationBreaks(table, breaks);
      // 即使没有行/单元格断点也要跟踪：表格可能只对内部不可拆原子块应用了
      // 局部 page-height lock。分页关闭或虚拟化卸载时仍必须调用 clear 还原该视图态。
      this._applied.set(id, table);
    }
  }

  clear(): void {
    for (const table of this._applied.values()) {
      clearTablePaginationBreaks(table);
    }
    this._applied.clear();
    this._breaks.clear();
  }

  private _isMounted(id: string): boolean {
    return this._mountedIds?.has(id) ?? true;
  }
}
