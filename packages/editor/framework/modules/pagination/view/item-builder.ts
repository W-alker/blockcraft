// packages/editor/framework/modules/pagination/view/item-builder.ts
import {BlockNodeType} from "../../../block-std/types/block.type";
import {isManualBreak, PaginationItem, resolveBlockPolicy} from "../engine";

/** 表格行的自然几何（相对表格 host 顶，已扣除分页占位高度），用于把切点映射回行。 */
export interface TableRowGeom {
  id: string;
  top: number;
  bottom: number;
  /** 该行是否被上方 rowspan 单元格覆盖（其顶边界被合并单元格跨越，断在此会拆分该合并单元格）。 */
  coveredFromAbove: boolean;
  /**
   * 该行是否被上方**带内容**的合并单元格覆盖。带内容的竖向合并单元格无法跨页拆分——内容全留在首段、
   * 无法流入续段（空单元格），拆开必溢出页底。故这类边界**完全不可断**（连 splitOffsets 都不收），
   * 让带内容合并单元格 keep-together（整体跳页）；空合并单元格（如分类标签）仍可拆（续段为空、不溢出）。
   */
  coveredByContentMerge?: boolean;
}

/** 单个顶层块的分页元数据（由 LiveHeightSource 从 DOM/组件读出）。 */
export interface BlockMeta {
  id: string;
  flavour: string;
  nodeType: BlockNodeType;
  isHeading: boolean;
  /** 已含块外边距的高度（px）。表格为自然高度（不含占位行）+ marginBottom。 */
  height: number;
  /** 安全切点（块顶起算 px，已过 widow/orphan）。表格=所有行边界；文本=行盒边界。 */
  splitOffsets?: number[];
  /** 优先切点（splitOffsets 子集）：表格的「干净」行边界（不跨合并单元格），引擎优先选。 */
  preferredSplitOffsets?: number[];
  /** 仅可屏幕拆分的表格：行自然几何，供切点→断点行映射。 */
  tableRows?: TableRowGeom[];
  /** 锁定最大高度（px）：capHeight 块超高时由高度源算出，视图层据此增量标记锁定 class。 */
  lockHeight?: number;
  /** 续页重复表头高（px）：带表头（rowHead）的表格跨页拆分时由高度源算出，引擎据此预留、渲染层据此插表头。 */
  repeatHeaderHeight?: number;
}

/** 块元数据 → 引擎 PaginationItem[]（套 P0 策略 + 手动分页符识别 + 屏幕拆分切点）。 */
export function buildPaginationItems(metas: BlockMeta[]): PaginationItem[] {
  return metas.map(m => {
    // 只取引擎需要的 breakable / keepWithNext；capHeight 是策略层信号（高度源据此算 lockHeight），不进 item。
    const {breakable, keepWithNext} = resolveBlockPolicy({flavour: m.flavour, nodeType: m.nodeType, isHeading: m.isHeading});
    const item: PaginationItem = {
      id: m.id,
      height: m.height,
      breakable,
      keepWithNext,
      manualBreak: isManualBreak(m.flavour),
    };
    if (m.splitOffsets) item.splitOffsets = m.splitOffsets; // 可拆块才带切点
    if (m.preferredSplitOffsets) item.preferredSplitOffsets = m.preferredSplitOffsets;
    if (m.lockHeight != null) item.lockHeight = m.lockHeight; // capHeight 块的锁定高度
    if (m.flavour === 'table') item.splitStartsNewPage = true; // 表格拆分独占新页起
    if (m.repeatHeaderHeight != null && m.repeatHeaderHeight > 0) item.repeatHeaderHeight = m.repeatHeaderHeight;
    return item;
  });
}
