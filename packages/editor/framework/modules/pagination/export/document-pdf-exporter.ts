import {IBlockSnapshot} from '../../../block-std/types/block.type'
import {PaginationConfig} from '../pagination.types'
import {StablePaginationLayout} from '../view/stable-pagination-layout'
import {
  PaginationExportError,
  PaginationPdfOptions,
  PaginationPdfResult,
  throwIfPaginationExportAborted,
} from './pdf-export.types'
import {mountPrintPagesInPage, printPagesInPage} from './print-live'
import {buildPaginatedPrintSurface, PrintPages} from './print-paginator'
import {readonlyDocRenderProvider} from './print-readonly-render'

/**
 * 从真实只读 BlockCraft 组件构建固定分页打印面，并交给浏览器或宿主原生打印后端。
 * snapshot 与 layout 由调用方在第一次 await 前同步捕获，保证属于同一文档版本。
 */
export async function exportDocumentToPdf(
  doc: BlockCraft.Doc,
  snapshot: IBlockSnapshot,
  config: PaginationConfig,
  suggestedName: string,
  options: PaginationPdfOptions = {},
  layout?: StablePaginationLayout,
): Promise<PaginationPdfResult> {
  const effectiveConfig = layout?.config ?? config
  const pages = await buildPaginatedPrintSurface(snapshot, effectiveConfig, {
    layout,
    render: readonlyDocRenderProvider(doc, snapshot, options),
    resourcePolicy: options.resourcePolicy,
    signal: options.signal,
    stability: options.stability,
  })

  return exportPrintPagesToPdf(pages, effectiveConfig, suggestedName, options)
}

/** 消费已经构建的页盒；无论成功、取消或失败都释放打印镜像与页盒。 */
export async function exportPrintPagesToPdf(
  pages: PrintPages,
  config: PaginationConfig,
  suggestedName: string,
  options: PaginationPdfOptions = {},
): Promise<PaginationPdfResult> {
  try {
    throwIfPaginationExportAborted(options.signal)
    if (!options.backend) {
      try {
        // 默认在当前顶层文档安装 print mirror。0×0 iframe 会改变 vw/container-query
        // 等响应式上下文，使业务块在打印前发生第二次布局并产生横向裁剪。
        await printPagesInPage(pages, config)
      } catch (error) {
        throw new PaginationExportError(
          'print-failed',
          '浏览器打印失败',
          {stage: 'print'},
          error,
        )
      }
      return {
        output: 'browser-print',
        status: 'completed',
        pageCount: pages.pageCount,
        layoutRevision: pages.layoutRevision,
        warnings: pages.warnings ?? [],
      }
    }

    const mirror = await mountPrintPagesInPage(pages, config)
    try {
      throwIfPaginationExportAborted(options.signal)
      let hostResult
      try {
        hostResult = await options.backend({
          suggestedName,
          mimeType: 'application/pdf',
          pageCount: pages.pageCount,
          layoutRevision: pages.layoutRevision,
          warnings: pages.warnings ?? [],
          config,
          page: {
            widthPx: pages.pageWidthPx,
            heightPx: pages.pageHeightPx,
            widthPt: pages.pageWidthPt,
            heightPt: pages.pageHeightPt,
          },
          printRoot: mirror.printRoot,
          signal: options.signal,
        })
      } catch (error) {
        if (error instanceof PaginationExportError) throw error
        throw new PaginationExportError(
          'host-print-failed',
          '宿主原生 PDF 打印失败',
          {stage: 'host'},
          error,
        )
      }
      return {
        output: 'host',
        status: hostResult.status,
        path: hostResult.path,
        pageCount: pages.pageCount,
        layoutRevision: pages.layoutRevision,
        warnings: pages.warnings ?? [],
      }
    } finally {
      mirror.dispose()
    }
  } finally {
    pages.dispose()
  }
}
