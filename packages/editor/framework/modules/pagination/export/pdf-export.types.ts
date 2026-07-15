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
  /** 省略时打开浏览器打印对话框；传入时由当前顶层 WebView 的宿主原生打印能力接管。 */
  backend?: PaginationPdfHostBackend
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
