import {downloadFile} from "../global";
import {
  ClipboardDataType,
  DOC_ADAPTER_SERVICE_TOKEN,
  RevisionConflictError,
} from "../framework";
import {
  exportDocumentToPdf,
  PaginationPdfOptions,
  PaginationPdfResult,
} from "../framework/modules/pagination/export";
import {PaginationConfig} from "../framework/modules/pagination/pagination.types";
import {PaginationPlugin} from "../plugins/pagination";

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

  constructor(private doc: BlockCraft.Doc) {
  }

  async exportToJson(name: string) {
    const json = this._snapshot()
    const jsonStr = JSON.stringify(json, null, 2); // 格式化输出
    const blob = new Blob([jsonStr], {type: 'application/json'})
    await downloadFile(blob, name)
  }

  async exportToMarkdown(name: string) {
    try {
      const mdAdapter = this.doc.injector.get(DOC_ADAPTER_SERVICE_TOKEN)?.getAdapter(ClipboardDataType.MARKDOWN)
      if (!mdAdapter) return
      const text = await mdAdapter.fromSnapshot(this._snapshot())
      const blob = new Blob([text], {type: 'text/markdown'})
      await downloadFile(blob, name)
    } catch (e) {
      this.doc.logger.error('export to markdown failed', e)
      if (e instanceof RevisionConflictError) throw e
    }
  }

  async exportToHtml(name: string) {
    try {
      const htmlAdapter = this.doc.injector.get(DOC_ADAPTER_SERVICE_TOKEN)?.getAdapter(ClipboardDataType.HTML)
      if (!htmlAdapter) return
      const text = await htmlAdapter.fromSnapshot(this._snapshot())
      const blob = new Blob([text], {type: 'text/html'})
      await downloadFile(blob, name)
    } catch (e) {
      this.doc.logger.error('export to html failed', e)
      if (e instanceof RevisionConflictError) throw e
    }
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
    const snapshot = this._snapshot()
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

  private _snapshot() {
    return this.doc.revisions.projectFinalSnapshot()
  }
}
