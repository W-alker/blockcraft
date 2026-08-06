// packages/editor/framework/modules/pagination/engine/types.ts

/** 标准纸张名（与 tools/export-manager 的 pdfSizes 对齐）。 */
export type PageSizeName =
  | 'A0' | 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6'
  | 'Letter' | 'Legal' | 'Tabloid';

export interface PageMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** 引擎消费的单个块：已解析策略 + 已测量高度。引擎不碰 DOM。 */
export interface PaginationItem {
  id: string;
  /** border-box 高度（px），含块外边距。manualBreak 块此值被忽略。 */
  height: number;
  /** 高于一整页时是否可在 splitOffsets 处拆开。 */
  breakable: boolean;
  /** 如 heading：不要孤悬页底，与下一块一起下推。 */
  keepWithNext: boolean;
  /** 安全拆分点（块顶起算偏移 px，升序），仅在 oversized && breakable 时使用。 */
  splitOffsets?: number[];
  /**
   * 「优先」拆分点（`splitOffsets` 的子集）：在剩余空间内优先选这些切点，选不到再退回普通切点。
   * 用于表格——优先在不跨越合并单元格的「干净」行边界断页，实在不行（被合并单元格逼着）才切普通边界。
   * 缺省时所有切点等价。
   */
  preferredSplitOffsets?: number[];
  /** 强制新页标记（page-divider），自身不占高度、不进任何一页。 */
  manualBreak?: boolean;
  /**
   * 拆分时**独占新页起**：在 splitOffsets 处拆开前先 commit 当前页，不把首片塞进当前页剩余空间。
   * 表格用——强制拆分的表格从新页顶开始，不与前一页内容拼。文本块不设此项（仍 Word 式填充当前页）。
   */
  splitStartsNewPage?: boolean;
  /**
   * 锁定最大高度（px）：capHeight 块超高时把分页占位锁到 ≤ 一页；媒体可配合 fitScale 整体缩放。
   * 引擎使用已投影的 `height` 定位：普通裁剪块等于 lockHeight，整体 fit 媒体可更小；
   * 这类块始终 ≤ 一页并整块放置。视图层给命中的块增加锁定 class，再通过根级
   * `--bc-page-content-height` 变量设置 max-height；locked+fitted 媒体由 fit 解除裁剪。
   * 缺省 = 不锁定。
   */
  lockHeight?: number;
  /** 图片/视频超高时的等比页内缩放比例；与 lockHeight 一起使用。 */
  fitScale?: number;
  /**
   * 拆分时**续页重复表头**的表头高（px）：带表头（rowHead）的表格跨页拆分时，每个续页（fromOffset>0 的片段）
   * 顶部重复一份表头。引擎据此在续页预留 `repeatHeaderHeight` 给重复表头（行片相应减小，避免行 + 表头溢出页）。
   * 缺省 = 不重复表头。
   */
  repeatHeaderHeight?: number;
}

/** 页面几何：每页可用内容高度。 */
export interface PageGeometry {
  /** 常规页可用内容高（px）。 */
  contentHeight: number;
  /** 首页可用内容高（px），缺省 = contentHeight。 */
  firstPageContentHeight?: number;
}

export interface PageSlotFragment {
  /** 块顶起算的片段起始偏移（px）。 */
  fromOffset: number;
  /** 块顶起算的片段结束偏移（px）。 */
  toOffset: number;
}

export interface PageSlot {
  id: string;
  /** 仅当该块被拆开时存在；整块放置时为 undefined。 */
  fragment?: PageSlotFragment;
}

export interface PageLayout {
  /** 0 起页码。 */
  index: number;
  slots: PageSlot[];
  /** 本页已用内容高（px）。 */
  usedHeight: number;
}

export interface BlockPlacement {
  /** 该块（首个片段）所在页码。 */
  pageIndex: number;
}

export interface PaginationResult {
  pages: PageLayout[];
  /** blockId → 放置信息，供 view 层快速查。 */
  byBlock: Map<string, BlockPlacement>;
}
