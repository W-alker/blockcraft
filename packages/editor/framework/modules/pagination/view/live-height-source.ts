// packages/editor/framework/modules/pagination/view/live-height-source.ts
import {Subject} from "rxjs";
import {BlockNodeType} from "../../../block-std/types/block.type";
import {BlockMeta, TableRowGeom} from "./item-builder";
import {rowSplitOffsets} from "./split-points";

/** 与 table.block.ts 的分页协作方法做结构化对接（不直接 import 块，保持框架→块解耦）。 */
interface PaginatedTableBlock {
  getPaginationGeometry(): {naturalHeight: number; headerHeight: number; rows: TableRowGeom[]};
  applyPaginationBreaks(breaks: Array<{beforeRowId: string; gap: number}>): void;
  clearPaginationBreaks(): void;
}

function asPaginatedTable(block: any): PaginatedTableBlock | null {
  return block && typeof block.getPaginationGeometry === 'function' ? block as PaginatedTableBlock : null;
}

/** 测量时传入：每页内容高（判定 oversized）+ widow/orphan 最少行。 */
export interface MeasureOptions {
  contentHeight: number;
  widowOrphanLines: number;
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

  constructor(private doc: BlockCraft.Doc) {
    this._ro = new ResizeObserver(() => this.resize$.next());
  }

  /** 根据当前 root 子块同步 observe 集合（增 observe、删 unobserve）。 */
  syncObserved(): void {
    const hosts = new Set<Element>(this._childHosts());
    for (const el of Array.from(this._observed)) {
      if (!hosts.has(el)) {
        this._ro.unobserve(el);
        this._observed.delete(el);
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
  measure(opts?: MeasureOptions): BlockMeta[] {
    const metas: BlockMeta[] = [];
    for (const id of this.doc.root.childrenIds) {
      const block = this.doc.getBlockById(id);
      if (!block) continue;
      const el = block.hostElement;
      const cs = getComputedStyle(el);
      // 忽略 margin-top（它要么是 0，要么是 gap-applier 施加的下推间隙，都不算块自身高度）。
      const mb = parseFloat(cs.marginBottom) || 0;

      const table = asPaginatedTable(block);
      if (table && opts) {
        const geom = table.getPaginationGeometry();
        const height = geom.naturalHeight + mb;
        // 表格按「整表最大高度」keep-together：能放进一整页就整块走（放不下当前页剩余则跳下一页），
        // **只有整表高过一整页才带按行切点、拆分**——不再 Word 式拆开填当前页。
        let splitOffsets: number[] | undefined;
        let preferredSplitOffsets: number[] | undefined;
        let repeatHeaderHeight: number | undefined;
        if (geom.rows.length && height > opts.contentHeight) {
          const bottoms = geom.rows.map(r => r.bottom);
          // splitOffsets = 可断边界，**排除带内容合并单元格内部**（这类不可拆、拆开必溢出页底 → keep-together）；
          // 空合并单元格内部仍可断（续段为空、不溢出）。无内容合并时与 widowOrphanCuts 等价。
          const splittable = rowSplitOffsets(bottoms, geom.rows.map(r => r.coveredByContentMerge ?? false), opts.widowOrphanLines);
          if (splittable.length) splitOffsets = splittable;
          // 优先「干净」边界（不跨任何合并单元格）；引擎优先选这些、实在不行才切空合并单元格的边界。
          const clean = rowSplitOffsets(bottoms, geom.rows.map(r => r.coveredFromAbove), opts.widowOrphanLines);
          if (clean.length) preferredSplitOffsets = clean;
          // [临时禁用 2026-06-30] 续页重复表头复制 bug 较多，先关掉（屏幕不插表头克隆、引擎不预留续页表头高）。
          // 恢复：取消下行注释 + table.block.ts applyPaginationBreaks 的克隆插入 + print-paginator.ts 的表头高读取。
          // if (geom.headerHeight > 0) repeatHeaderHeight = geom.headerHeight;
        }
        metas.push({
          id, flavour: block.flavour, nodeType: block.nodeType,
          isHeading: false, height, splitOffsets, preferredSplitOffsets, repeatHeaderHeight, tableRows: geom.rows,
        });
        continue;
      }

      // capHeight 块（图片/视频/嵌入等原子块 + 代码块）超高时锁定最大高度到一页内、裁剪不溢出（不缩放）。
      // 自然高度用 scrollHeight：HeightLockApplier 施加的 max-height + overflow:hidden 会裁剪 offsetHeight，
      // 但 scrollHeight 仍是未裁剪的完整内容高，**对已锁定状态不变** → 无测量反馈环（不会锁/解锁来回抖）。
      const capHeight = block.nodeType === BlockNodeType.void || block.flavour === 'code';
      // Safari 中带固定高度子卡片的 iframe block 可能由 overflow 绘制：顶层 host.offsetHeight 只含
      // 品牌/链接（约 55px），而 host.scrollHeight 才包含屏幕上实际可见的整张卡片（约 464px）。
      // 原子块分页必须消费可见自然高度，否则 live 布局会与只读打印面分歧。
      const naturalHeight = capHeight
        ? Math.max(el.offsetHeight, el.scrollHeight)
        : el.offsetHeight;
      if (capHeight && opts && opts.contentHeight > 0 && naturalHeight > opts.contentHeight) {
        metas.push({
          id,
          flavour: block.flavour,
          nodeType: block.nodeType,
          isHeading: false,
          height: opts.contentHeight,            // 锁定后整块占一页
          lockHeight: opts.contentHeight,
        });
        continue;
      }

      metas.push({
        id,
        flavour: block.flavour,
        nodeType: block.nodeType,
        isHeading: this._isHeading(block),
        height: naturalHeight + mb,
      });
    }
    return metas;
  }

  private _childHosts(): HTMLElement[] {
    const hosts: HTMLElement[] = [];
    for (const id of this.doc.root.childrenIds) {
      const el = this.doc.getBlockById(id)?.hostElement;
      if (el) hosts.push(el);
    }
    return hosts;
  }

  private _isHeading(block: any): boolean {
    if (block?.nodeType !== BlockNodeType.editable) return false;
    // editable-block 暴露 get heading()；兜底读 model.props.heading
    return !!(block.heading ?? block.model?.props?.heading);
  }

  destroy(): void {
    this._ro.disconnect();
    this._observed.clear();
    this.resize$.complete();
  }
}
