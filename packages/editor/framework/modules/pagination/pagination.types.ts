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
  /** 高度（px），参与每页 contentHeight 计算。缺省时若有任一段文本则用默认高度（24px）。 */
  height?: number;
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
