// packages/editor/framework/modules/pagination/pagination.types.ts
import {PageGeometry, PageMargins, PageSizeName} from "./engine";

/** 页眉/页脚的三段文本（支持 `{page}` / `{total}` 占位符）。 */
export interface PageChromeSegments {
  left?: string;
  center?: string;
  right?: string;
}

/** 页眉或页脚配置。 */
export interface PageChrome extends PageChromeSegments {
  /**
   * 高度（px），参与每页 contentHeight 计算。
   * 缺省、非有限值或负数在存在文本时使用默认高度（24px）。
   */
  height?: number;
}

export type PaginationElementTarget =
  | HTMLElement
  | (() => HTMLElement | null);

/** 宿主自定义的首页文档头；只属于 live 布局，不写入 Yjs。 */
export interface PaginationDocumentHeaderOptions {
  /** 直接元素或延迟解析器；启用分页时元素必须已连接 DOM。 */
  element: PaginationElementTarget;
  /** 文档头与首个文档块的间距（px），默认 0。 */
  gap?: number;
  /**
   * `content`（默认）把文档头排在正文上边距之后；`top-margin` 把它放进
   * 首页上边距，并只扣除超出正文起点的部分，避免宿主标题与页边距重复留白。
   */
  placement?: 'content' | 'top-margin';
  /** `top-margin` 下相对纸张顶部的距离（px），默认 20。 */
  topInset?: number;
}

/** 分页计算、视图与导出共享的配置；启用状态由 PaginationPlugin 单独管理。 */
export interface PaginationConfig {
  /** 命名纸张（pt，内部转 px）或自定义像素尺寸。默认 'A4'。 */
  pageSize?: PageSizeName | {width: number; height: number};
  /** 默认 'portrait'。 */
  orientation?: 'portrait' | 'landscape';
  /** 页边距（px）。缺省每边 72px（约 0.75in @96dpi）。 */
  margins?: Partial<PageMargins>;
  /** 屏幕上相邻纸张间距（px）。默认 24。 */
  pageGap?: number;
  /** 页眉（左/中/右三段，支持 `{page}` / `{total}`）。省略 = 无页眉。 */
  header?: PageChrome;
  /** 页脚（左/中/右三段，支持 `{page}` / `{total}`）。省略 = 无页脚。 */
  footer?: PageChrome;
  /** 拆超大块时每侧最少行（widow/orphan，PDF 导出 split-points 用；屏幕分页 v1 不拆）。默认 2。 */
  widowOrphanLines?: number;
  /**
   * 是否拦截原生打印快捷键（Cmd+P / Ctrl+P）改打印「与导出一致的确定性分页页盒」。
   * 默认 `false`（不拦截，保留浏览器原生打印行为，避免意外劫持快捷键）。
   * 置 `true` 时，启用中的 PaginationPlugin 会把 Cmd/Ctrl+P 转发给 `plugin.print()`。
   * 无论此项与否，`plugin.print()` 始终可编程调用。
   */
  printShortcut?: boolean;
}

/** 由 PaginationConfig 解析出的屏幕像素几何 + 引擎 PageGeometry。 */
export interface ResolvedPaginationGeometry {
  /** 单张纸宽（px）。 */
  sheetWidthPx: number;
  /** 单张纸高（px）。 */
  sheetHeightPx: number;
  margins: PageMargins;
  /** 屏幕纸间距（px）。 */
  pageGap: number;
  /** 页眉高度（px，无页眉 = 0）。 */
  headerHeight: number;
  /** 页脚高度（px，无页脚 = 0）。 */
  footerHeight: number;
  /** 引擎用的每页可用内容高（px，已扣除页眉/页脚）。 */
  geometry: PageGeometry;
}
