// packages/editor/framework/modules/pagination/pagination.types.ts
import {PageGeometry, PageMargins, PageSizeName} from "./engine";

/**
 * 页眉/页脚的三段文本。
 *
 * 支持 `{page}` / `{total}`，以及带数字样式的
 * `{page:roman-upper}` / `{page:roman-lower}` / `{page:chinese}`；`total`
 * 使用相同语法。
 */
export interface PageChromeSegments {
  left?: string;
  center?: string;
  right?: string;
}

/** 页眉/页脚结构化文本项；宿主仍负责把业务参数解析成最终文本。 */
export interface PageChromeTextContent {
  kind: 'text';
  text: string;
  /** `muted` 使用页眉/页脚次要文字颜色。 */
  tone?: 'default' | 'muted';
}

/** 页眉/页脚结构化图片项。 */
export interface PageChromeImageContent {
  kind: 'image';
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  maxWidth?: number;
  borderRadius?: number;
}

export type PageChromeContentItem = PageChromeTextContent | PageChromeImageContent;

/** 单个左/中/右区域的结构化行内内容。 */
export interface PageChromeInlineContent {
  items: readonly PageChromeContentItem[];
  /** 项间距（px），默认 4。 */
  gap?: number;
}

export interface PageChromeContentSegments {
  left?: PageChromeInlineContent;
  center?: PageChromeInlineContent;
  right?: PageChromeInlineContent;
}

/** 页眉或页脚配置。 */
export interface PageChrome extends PageChromeSegments {
  /**
   * 可序列化的结构化内容；某一区域存在有效 content 时覆盖同区域纯文本。
   * 文本项同样支持 `{page}` / `{total}` token。
   */
  content?: PageChromeContentSegments;
  /** 可选分隔线；`top` 常用于页脚，`bottom` 常用于页眉。 */
  separator?: 'top' | 'bottom';
  /**
   * 页眉距纸张顶部、或页脚距纸张底部的距离（px）。
   *
   * 缺省时沿用对应的上/下页边距，以保持旧配置的布局结果。页眉/页脚会尽量
   * 放在页边距带内；只有越过正文起点时，超出的部分才会压缩正文区。
   */
  distance?: number;
  /**
   * 高度（px）。仅当页眉/页脚越过正文页边距时，越界部分参与 contentHeight 计算。
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
  /** 页眉距纸张顶部的解析值（px）。 */
  headerDistance?: number;
  /** 页脚距纸张底部的解析值（px）。 */
  footerDistance?: number;
  /** 正文相对纸张顶部的实际起点（px，已处理页眉与页边距重叠）。 */
  contentTop?: number;
  /** 正文相对纸张底部的实际留白（px，已处理页脚与页边距重叠）。 */
  contentBottom?: number;
  /** 引擎用的每页可用内容高（px，已扣除正文边距及页眉/页脚越界部分）。 */
  geometry: PageGeometry;
}
