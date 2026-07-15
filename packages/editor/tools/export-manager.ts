import {downloadFile} from "../global";
// @ts-ignore
import domtoimage from 'dom-to-image-more'
import {ClipboardDataType, DOC_ADAPTER_SERVICE_TOKEN} from "../framework";
import {
  exportDocumentToPdf,
  PaginationPdfOptions,
  PaginationPdfResult,
} from "../framework/modules/pagination/export";
import {PaginationConfig} from "../framework/modules/pagination/pagination.types";
import {PaginationPlugin} from "../plugins/pagination";

interface CorsImgOptions {
  url: string; // eg: https://cors-anywhere.herokuapp.com/
  method: 'get' | 'post';
  headers?: Record<string, string>;
  data?: Record<string, any>;
}

interface RenderOptions {
  /**
   * Should return true if passed node should be included in the output
   * (excluding node means excluding its children as well). Not called on the root node.
   */
  filter?: (node: Node) => boolean;

  /**
   * Callback function which is called when the Document has been cloned for rendering,
   * can be used to modify the contents that will be rendered without affecting the original source document.
   */
  onclone?: (clonedDocument: Document) => void;

  /** Color for the background, any valid CSS color value. */
  bgcolor?: string;

  /** Width to be applied to node before rendering. */
  width?: number;

  /** Height to be applied to node before rendering. */
  height?: number;

  /** An object whose properties will be copied to node's style before rendering. */
  style?: Partial<CSSStyleDeclaration>;

  /** A Number between 0 and 1 indicating image quality (applicable to JPEG only), defaults to 1.0. */
  quality?: number;

  /** A Number multiplier to scale up the canvas before rendering to reduce fuzzy images, defaults to 1.0. */
  scale?: number;

  /** DataURL to use as a placeholder for failed images. */
  imagePlaceholder?: string;

  /** Set to true to cache bust by appending the time to the request URL. */
  cacheBust?: boolean;

  /** Set to 'strict' or 'relaxed' to select style caching rules. */
  styleCaching?: 'strict' | 'relaxed';

  /** Set to false to disable use of default styles of elements. */
  copyDefaultStyles?: boolean;

  /** Set to true to disable font embedding into the SVG output. */
  disableEmbedFonts?: boolean;

  /** When the image is restricted by the server from cross-domain requests, proxy options. */
  corsImg?: CorsImgOptions;

  /** Callback for adjustClonedNode event (to allow adjusting clone's properties). */
  adjustClonedNode?: (clonedNode: HTMLElement) => void;

  /** Should return true if passed propertyName should be included in the output */
  filterStyles?: (propertyName: string) => boolean;
}

const DOC_EXPORT_OPTIONS = {
  filter: (node: Node) => {
    if (node instanceof HTMLElement && ['bc-drag-handle', 'blockcraft-cursor'].includes(node.localName)) {
      return false;
    }
    return true;
  },
  quality: 1.0
}

const pdfSizes = {
  A0: {width: 2384, height: 3370},
  A1: {width: 1684, height: 2384},
  A2: {width: 1191, height: 1684},
  A3: {width: 842, height: 1191},
  A4: {width: 595, height: 842},   // 📄 常用标准
  A5: {width: 420, height: 595},
  A6: {width: 298, height: 420},
  Letter: {width: 612, height: 792}, // 🇺🇸 美国标准
  Legal: {width: 612, height: 1008},
  Tabloid: {width: 792, height: 1224},
};

type PdfSizeName = keyof typeof pdfSizes;

export class DocExportManager {

  constructor(private doc: BlockCraft.Doc, private exportOptions: RenderOptions = DOC_EXPORT_OPTIONS) {
  }

  async exportToJson(name: string) {
    const json = this.doc.root.toSnapshot()
    const jsonStr = JSON.stringify(json, null, 2); // 格式化输出
    const blob = new Blob([jsonStr], {type: 'application/json'})
    await downloadFile(blob, name)
  }

  async exportToMarkdown(name: string) {
    try {
      const mdAdapter = this.doc.injector.get(DOC_ADAPTER_SERVICE_TOKEN)?.getAdapter(ClipboardDataType.RTF)
      if (!mdAdapter) return
      const text = await mdAdapter.fromSnapshot(this.doc.root.toSnapshot())
      const blob = new Blob([text], {type: 'text/markdown'})
      await downloadFile(blob, name)
    } catch (e) {
      this.doc.logger.error('export to markdown failed', e)
    }
  }

  async exportToJpeg(name: string, options?: Pick<RenderOptions, 'scale' | 'bgcolor'>) {
    const canvas = await this._toCanvas(options);
    const dataUrl = canvas.toDataURL('image/jpeg');
    await downloadFile(dataUrl, name);
  }

  protected async _toCanvas(options?: Pick<RenderOptions, 'scale' | 'bgcolor' | 'width' | 'height'>) {
    const dom = this.doc.scrollContainer!
    const scale = options?.scale || 1
    const canvas: HTMLCanvasElement = await domtoimage.toCanvas(dom, {
      ...DOC_EXPORT_OPTIONS,
      ...this.exportOptions,
      ...options,
      width: dom.scrollWidth * scale,
      height: dom.scrollHeight * scale,
      style: {
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
      },
    });
    return canvas
  }

  /**
   * 导出为 PDF（引擎分页、块感知防分割、页眉/页脚/页码）。
   *
   * 浏览器默认打开系统打印对话框；Tauri 等宿主传入 backend，在当前顶层导出 WebView 中
   * 调用 WKWebView/WebView2 原生 PDF 打印。正文不经过 DOM 栅格化。
   *
   * 不传 pagination 时优先复用启用中的 PaginationPlugin 当前稳定布局；显式 pagination 表示重新排版。
   */
  async exportToPdf(name: string, options?: PaginationPdfOptions & {
    /** @deprecated 新分页引擎始终按块策略分页；保留此字段仅用于源码兼容。 */
    paging?: boolean
    /** @deprecated 块间距由分页测量结果决定；保留此字段仅用于源码兼容。 */
    blockMargin?: number
    /** 分页配置覆盖（纸张/方向/边距/页眉页脚）。 */
    pagination?: PaginationConfig
    /** @deprecated 旧字段，等价于 pagination.pageSize。 */
    pdfPageSize?: PdfSizeName
  }): Promise<PaginationPdfResult> {
    const plugin = this._paginationPlugin()
    const explicitPagination = options?.pagination
      ?? (options?.pdfPageSize ? {pageSize: options.pdfPageSize} : undefined)
    const exportOptions: PaginationPdfOptions = {
      pagination: explicitPagination,
      resourcePolicy: options?.resourcePolicy,
      signal: options?.signal,
      backend: options?.backend,
    }
    if (plugin) return plugin.exportToPdf(name, exportOptions)

    const config = explicitPagination ?? {pageSize: 'A4'}
    const snapshot = this.doc.root.toSnapshot()
    return exportDocumentToPdf(this.doc, snapshot, config, name, exportOptions)
  }

  /**
   * @deprecated 使用 exportToPdf()。保留为浏览器打印源码兼容别名。
   */
  async printPdf(options?: {
    pagination?: PaginationConfig
    pdfPageSize?: PdfSizeName
  }): Promise<PaginationPdfResult> {
    return this.exportToPdf('document.pdf', options)
  }

  private _paginationPlugin(): PaginationPlugin | undefined {
    return this.doc.plugins.find(
      candidate => candidate instanceof PaginationPlugin,
    ) as PaginationPlugin | undefined
  }
}
