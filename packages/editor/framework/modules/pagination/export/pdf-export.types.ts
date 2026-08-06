import {PaginationConfig} from '../pagination.types'

export type PaginationResourcePolicy = 'strict' | 'best-effort'

export type PaginationExportStage =
  | 'layout'
  | 'resource'
  | 'print'
  | 'host'

export type PaginationExportErrorCode =
  | 'layout-not-ready'
  | 'layout-diverged'
  | 'resource-timeout'
  | 'unsupported-resource'
  | 'print-failed'
  | 'host-print-failed'
  | 'aborted'

export interface PaginationExportContext {
  stage?: PaginationExportStage
  page?: number
  blockId?: string
  resourceUrl?: string
}

export interface PaginationExportWarning extends PaginationExportContext {
  code: PaginationExportErrorCode
  message: string
}

export class PaginationExportError extends Error {
  override readonly name = 'PaginationExportError'

  constructor(
    readonly code: PaginationExportErrorCode,
    message: string,
    readonly context: PaginationExportContext = {},
    cause?: unknown,
  ) {
    super(message)
    if (cause !== undefined) (this as Error & {cause?: unknown}).cause = cause
  }
}

export interface PaginationPdfOptions {
  /** 显式传入表示按另一套配置重新排版；省略时优先复用当前分页视图。 */
  pagination?: PaginationConfig
  /** 默认 strict：资源或布局无法稳定时失败；best-effort 会生成 warning 并继续。 */
  resourcePolicy?: PaginationResourcePolicy
  /** 取消资源等待或宿主打印。 */
  signal?: AbortSignal
  /**
   * 只读导出副本文档初始化后、分页测量前执行。宿主可在这里触发业务块重新取数，
   * 并在业务视图达到可测量状态后 resolve；回调只会收到隔离副本，绝不会收到 live doc。
   */
  prepareDocument?: PaginationPrintDocumentPreparer
  /** 业务准备完成后的通用 DOM/尺寸静默等待配置。 */
  stability?: PaginationRenderStabilityOptions
  /** 省略时打开浏览器打印对话框；传入时由当前顶层 WebView 的宿主原生打印能力接管。 */
  backend?: PaginationPdfHostBackend
}

export interface PaginationPrintDocumentContext {
  /** 基于同步快照新建的 readonly、无插件、非协作文档。 */
  doc: BlockCraft.Doc
  /** 对应只读副本文档的渲染根。 */
  root: HTMLElement
  signal?: AbortSignal
}

export type PaginationPrintDocumentPreparer = (
  context: PaginationPrintDocumentContext,
) => void | Promise<void>

export interface PaginationRenderStabilityOptions {
  /** DOM/尺寸不再变化后至少等待多少帧；默认 2。 */
  quietFrames?: number
  /** 最长等待时间；默认 10 秒。 */
  timeoutMs?: number
}

export interface PaginationPdfResult {
  output: 'browser-print' | 'host'
  status: 'completed' | 'saved' | 'cancelled'
  pageCount: number
  layoutRevision?: number
  warnings: readonly PaginationExportWarning[]
  /** 仅宿主后端可返回保存路径。 */
  path?: string
}

export interface PaginationPdfHostContext {
  suggestedName: string
  mimeType: 'application/pdf'
  pageCount: number
  layoutRevision?: number
  warnings: readonly PaginationExportWarning[]
  config: Readonly<PaginationConfig>
  page: {
    widthPx: number
    heightPx: number
    widthPt: number
    heightPt: number
  }
  /** 当前顶层 WebView 中已挂载、仅在 print media 可见的分页根。 */
  printRoot: HTMLElement
  signal?: AbortSignal
}

export interface PaginationPdfHostResult {
  status: 'saved' | 'cancelled'
  path?: string
}

/**
 * 宿主原生 PDF 后端。调用期间当前顶层 WebView 已安装确定性分页打印面；
 * Tauri 实现应选择绝对路径后调用 WKWebView/WebView2 的原生 PDF 打印命令。
 */
export type PaginationPdfHostBackend = (
  context: PaginationPdfHostContext,
) => Promise<PaginationPdfHostResult>

export function throwIfPaginationExportAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  throw new PaginationExportError('aborted', 'PDF export was aborted', {stage: 'resource'})
}
