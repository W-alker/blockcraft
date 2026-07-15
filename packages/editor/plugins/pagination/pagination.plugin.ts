import {
  BindHotKey,
  DocPlugin,
  UIEventStateContext,
} from '../../framework'
import {getScrollContainer} from '../../global'
import {
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

  constructor(options: PaginationPluginOptions = {}) {
    super()
    const {enabled = false, ...config} = options
    this._enabled = enabled
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
    this._controller?.disable()
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
        ? this._controller?.captureStableLayout() ?? undefined
        : undefined
      const snapshot = this.doc.root.toSnapshot()
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
        ? this._controller?.captureStableLayout() ?? undefined
        : undefined
      const snapshot = this.doc.root.toSnapshot()
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
    this._controller?.destroy()
    this._controller = null
  }

  private _enableController(): void {
    if (!this.doc.isInitialized) {
      this.doc.afterInit(() => {
        if (this._enabled && !this._destroyed) this._enableController()
      })
      return
    }
    if (!this._controller) {
      const scrollContainer = this.doc.config.scrollContainer
        ?? getScrollContainer(this.doc.root.hostElement)
      this._controller = new PaginatedViewController(
        this.doc,
        this._config,
        scrollContainer,
      )
    }
    this._controller.enable()
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
