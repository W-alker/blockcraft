import {
  BindHotKey,
  DocPlugin,
  UIEventStateContext,
} from '../../framework'
import {getScrollContainer} from '../../global'
import {
  PaginationDocumentHeaderOptions,
  PaginationConfig,
} from '../../framework/modules/pagination'
import {PaginatedViewController} from '../../framework/modules/pagination/view/paginated-view.controller'
import {
  buildPrintPages,
  PaginationExportError,
  PaginationPdfOptions,
  PaginationPdfResult,
  PrintPages,
  exportDocumentToPdf,
  printPagesInPage,
  readonlyDocRenderProvider,
} from '../../framework/modules/pagination/export'

export interface PaginationPluginOptions extends PaginationConfig {
  enabled?: boolean
  /** 可选宿主文档头；分页期间自动投影到首页并测量高度。 */
  documentHeader?: PaginationDocumentHeaderOptions
  /**
   * Phase C rollout flag: let the paginated Projection drive sparse root
   * virtualization instead of holding a full-document view lease.
   */
  experimentalSparseView?: boolean
}

/**
 * 分页运行时唯一入口。纯计算与渲染实现位于 framework/modules/pagination，
 * 插件只负责生命周期、启停、配置与打印编排。
 */
export class PaginationPlugin extends DocPlugin {
  override name = 'pagination'

  private _controller: PaginatedViewController | null = null
  private _config: PaginationConfig
  private _enabled: boolean
  private _registered = false
  private _destroyed = false
  private _printing = false
  private _exportQueue: Promise<void> = Promise.resolve()
  private _exportAbort = new AbortController()
  private _releaseFullDocumentViewLease: (() => void) | null = null
  private readonly _experimentalSparseView: boolean
  private readonly _documentHeader?: PaginationDocumentHeaderOptions

  constructor(options: PaginationPluginOptions = {}) {
    super()
    const {
      enabled = false,
      experimentalSparseView = false,
      documentHeader,
      ...config
    } = options
    this._enabled = enabled
    this._experimentalSparseView = experimentalSparseView
    this._documentHeader = documentHeader
    this._config = config
  }

  get enabled(): boolean {
    return this._enabled
  }

  get config(): Readonly<PaginationConfig> {
    return this._config
  }

  override init(): void {
    if (this._exportAbort.signal.aborted) this._exportAbort = new AbortController()
    this._registered = true
    this._destroyed = false
    if (this._enabled) this._enableController()
  }

  enable(): void {
    if (this._destroyed || this._enabled) return
    this._enabled = true
    if (this._registered) this._enableController()
  }

  disable(): void {
    if (!this._enabled) return
    this._enabled = false
    try {
      this._controller?.disable()
    } finally {
      this._releaseFullDocumentViews()
    }
  }

  updateConfig(partial: Partial<PaginationConfig>): void {
    this._config = {
      ...this._config,
      ...partial,
      margins: partial.margins
        ? {...this._config.margins, ...partial.margins}
        : this._config.margins,
    }
    this._controller?.updateConfig(partial)
  }

  recompute(): void {
    if (this._enabled) this._controller?.scheduleRecompute()
  }

  async print(): Promise<void> {
    if (this._printing || !this._registered || !this.doc.isInitialized) return
    this._printing = true
    let pages: PrintPages | null = null
    try {
      const layout = this._enabled
        ? this._captureReusableLayout()
        : undefined
      const snapshot = this._snapshot()
      pages = await buildPrintPages(snapshot, this._config, {
        layout,
        render: readonlyDocRenderProvider(this.doc, snapshot),
      })
      await printPagesInPage(pages, this._config)
    } catch (error) {
      this.doc.logger.warn('pagination print failed: ', error)
    } finally {
      pages?.dispose()
      this._printing = false
    }
  }

  /**
   * 导出与当前分页视图一致的 PDF：浏览器打开打印对话框，宿主 backend 打印当前顶层 WebView。
   * 显式 pagination override 表示按新配置重新排版，不复用屏幕布局。
   */
  exportToPdf(
    suggestedName: string,
    options: PaginationPdfOptions = {},
  ): Promise<PaginationPdfResult> {
    const run = async (): Promise<PaginationPdfResult> => {
      if (!this._registered || !this.doc.isInitialized || this._destroyed) {
        throw new PaginationExportError(
          'layout-not-ready',
          'PaginationPlugin 尚未连接到已初始化的文档',
          {stage: 'layout'},
        )
      }
      // 这两次读取之间不 await：layout 与 snapshot 对应同一个主线程文档版本。
      const layout = !options.pagination && this._enabled
        ? this._captureReusableLayout()
        : undefined
      const snapshot = this._snapshot()
      const config = options.pagination ?? this._config
      const linkedAbort = linkAbortSignals(this._exportAbort.signal, options.signal)
      try {
        return await exportDocumentToPdf(
          this.doc,
          snapshot,
          config,
          suggestedName,
          {...options, signal: linkedAbort.signal},
          layout,
        )
      } finally {
        linkedAbort.dispose()
      }
    }

    const result = this._exportQueue.then(run, run)
    this._exportQueue = result.then(() => undefined, () => undefined)
    return result
  }

  @BindHotKey({key: 'p', shortKey: true})
  onPrintShortcut(ctx: UIEventStateContext) {
    if (!this._enabled || !this._config.printShortcut) return
    ctx.preventDefault()
    ctx.stopPropagation()
    void this.print()
    return true
  }

  override destroy(): void {
    if (this._destroyed) return
    this._destroyed = true
    this._registered = false
    this._enabled = false
    this._exportAbort.abort()
    try {
      this._controller?.destroy()
    } finally {
      this._controller = null
      this._releaseFullDocumentViews()
    }
  }

  private _enableController(): void {
    if (!this.doc.isInitialized) {
      this.doc.afterInit(() => {
        if (this._enabled && !this._destroyed) this._enableController()
      })
      return
    }
    try {
      const sparseView = this._canUseSparseView()
      if (!sparseView) {
        this._releaseFullDocumentViewLease ??=
          this.doc.virtualization?.acquireFullDocumentViewLease() ?? null
      }
      if (!this._controller) {
        const scrollContainer = this.doc.config.scrollContainer
          ?? getScrollContainer(this.doc.root.hostElement)
        this._controller = new PaginatedViewController(
          this.doc,
          this._config,
          scrollContainer,
          undefined,
          {
            sparseView,
            documentHeader: this._documentHeader,
            onSparseViewFailure: error => {
              this._enabled = false
              this._releaseFullDocumentViews()
              this.doc.logger.warn('pagination sparse view disabled: ', error)
              this.doc.messageService?.warn?.('分页布局异常，已恢复连续虚拟布局')
            },
          },
        )
      }
      this._controller.enable()
    } catch (error) {
      this._enabled = false
      try {
        this._controller?.destroy()
      } catch (cleanupError) {
        this.doc.logger.warn('pagination controller rollback failed: ', cleanupError)
      }
      this._controller = null
      this._releaseFullDocumentViews()
      throw error
    }
  }

  private _releaseFullDocumentViews(): void {
    this._releaseFullDocumentViewLease?.()
    this._releaseFullDocumentViewLease = null
  }

  private _canUseSparseView(): boolean {
    const virtualization = this.doc.virtualization
    return this._experimentalSparseView === true &&
      virtualization?.enabled === true
  }

  /**
   * 稀疏分页的离屏几何允许来自模型估算，但打印/PDF 不能静默复用估算断点。
   * 返回 undefined 会让只读导出文档完整挂载并重新测量，得到 exact 布局。
   */
  private _captureReusableLayout(): ReturnType<
    PaginatedViewController['captureStableLayout']
  > extends infer Layout
    ? NonNullable<Layout> | undefined
    : never {
    const layout = this._controller?.captureStableLayout() ?? undefined
    if (!layout || !this._experimentalSparseView) return layout
    return this._controller?.captureShadowLayout()?.exact === false
      ? undefined
      : layout
  }

  private _snapshot() {
    const snapshot = this.doc.exportSnapshot()
    if (!snapshot) {
      throw new PaginationExportError(
        'layout-not-ready',
        '文档模型尚未准备好，无法生成分页快照',
        {stage: 'layout'},
      )
    }
    return snapshot
  }
}

/** 合并插件生命周期取消与调用方取消，兼容没有 AbortSignal.any 的 WebView。 */
function linkAbortSignals(
  lifecycle: AbortSignal,
  caller?: AbortSignal,
): {signal: AbortSignal; dispose(): void} {
  if (!caller) return {signal: lifecycle, dispose: () => undefined}
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (lifecycle.aborted || caller.aborted) {
    abort()
  } else {
    lifecycle.addEventListener('abort', abort, {once: true})
    caller.addEventListener('abort', abort, {once: true})
  }
  return {
    signal: controller.signal,
    dispose: () => {
      lifecycle.removeEventListener('abort', abort)
      caller.removeEventListener('abort', abort)
    },
  }
}

declare global {
  namespace BlockCraft {
    interface IPlugins {
      pagination: PaginationPlugin
    }
  }
}
