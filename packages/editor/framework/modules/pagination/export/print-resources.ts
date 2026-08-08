import {
  PaginationExportError,
  PaginationExportWarning,
  PaginationResourcePolicy,
  throwIfPaginationExportAborted,
} from './pdf-export.types'

export interface PreparePrintResourcesOptions {
  resourcePolicy?: PaginationResourcePolicy
  signal?: AbortSignal
  timeoutMs?: number
}

export interface PreparedPrintResources {
  warnings: PaginationExportWarning[]
}

const DEFAULT_RESOURCE_TIMEOUT = 10000

/**
 * 等待打印 DOM 的稳定资源，并把 canvas/video 等瞬态表面固化为普通图片。
 * 该函数只接收离屏打印副本，绝不能传入 live 编辑器根。
 */
export async function preparePrintResources(
  root: HTMLElement,
  options: PreparePrintResourcesOptions = {},
): Promise<PreparedPrintResources> {
  const policy = options.resourcePolicy ?? 'strict'
  const signal = options.signal
  const timeoutMs = Math.max(0, options.timeoutMs ?? DEFAULT_RESOURCE_TIMEOUT)
  const warnings: PaginationExportWarning[] = []

  throwIfPaginationExportAborted(signal)
  stripEditingState(root)

  for (const canvas of Array.from(root.querySelectorAll('canvas'))) {
    throwIfPaginationExportAborted(signal)
    try {
      const img = document.createElement('img')
      img.src = canvas.toDataURL('image/png')
      img.width = canvas.width
      img.height = canvas.height
      img.style.cssText = canvas.style.cssText
      canvas.replaceWith(img)
    } catch (error) {
      handleUnsupported(canvas, '无法读取 canvas 位图（可能被跨域资源污染）', policy, warnings, error)
    }
  }

  for (const video of Array.from(root.querySelectorAll('video'))) {
    throwIfPaginationExportAborted(signal)
    if (!video.poster) {
      handleUnsupported(video, '动态视频没有 poster，无法确定性导出', policy, warnings)
      continue
    }
    const img = document.createElement('img')
    img.src = video.poster
    img.style.cssText = video.style.cssText
    img.width = video.clientWidth
    img.height = video.clientHeight
    video.replaceWith(img)
  }

  // 动态资源先固化为 img/placeholder，再统一等待新生成的 poster 图片与原图片。
  await waitForImages(root, timeoutMs, policy, warnings, signal)
  await waitForFonts(timeoutMs, policy, warnings, signal)
  await settleFrames(signal)

  return {warnings}
}

function stripEditingState(root: HTMLElement): void {
  const excluded = [
    'blockcraft-cursor',
    '.blockcraft-cursor',
    'bc-drag-handle',
    '.drag-handle',
    '.bc-float-toolbar',
    '.code-block .btn-collapse',
    '[data-bc-print-exclude="true"]',
  ].join(',')
  root.querySelectorAll(excluded).forEach(node => node.remove())

  // block-gap 是 WebKit 光标锚点，不属于文档内容。用 display:none 而不是 remove：
  // 业务块可能依赖 :first-child/:last-child 结构选择器，删节点会让只读副本
  // 与 live DOM 出现新的样式分支。隐藏后它们不再扩大 scrollWidth，结构语义仍保持。
  root.querySelectorAll<HTMLElement>('[data-block-zero-space="true"]')
    .forEach(el => {
      el.style.setProperty('display', 'none', 'important')
      el.style.setProperty('pointer-events', 'none', 'important')
    })

  // 表格结构控件会参与其自然几何，不能 remove；只关闭绘制与交互，保持分页测量不变。
  const geometryChrome = [
    'table-row-bar',
    'table-col-bar',
    '.table-menu-anchor',
    '.table-col-resize-bar',
    '.bc-table-fullscreen-btn',
    '.bc-table-fullscreen-menu',
    '.resize-bar-btm',
  ].join(',')
  root.querySelectorAll<HTMLElement>(geometryChrome).forEach(el => {
    el.style.setProperty('visibility', 'hidden', 'important')
    el.style.setProperty('pointer-events', 'none', 'important')
  })

  // 滚动容器仍需保留裁剪/排版能力，但纸面不应出现浏览器或 WebView 的滚动条。
  root.querySelectorAll<HTMLElement>('.bc-scrollable-container, .table-scrollable')
    .forEach(el => {
      el.setAttribute('data-bc-print-scrollable', 'true')
      // 透明化而不是 width:none/display:none：传统滚动条会占布局空间，移除轨道会改变块高。
      el.style.setProperty('scrollbar-color', 'transparent transparent', 'important')
    })

  const stateClasses = [
    'selected',
    'selecting',
    'is-selecting-cell',
    'bc-table-cell-selected',
    'bc-drag-source',
    'drag-over',
  ]
  root.querySelectorAll<HTMLElement>(stateClasses.map(name => `.${name}`).join(','))
    .forEach(el => el.classList.remove(...stateClasses))
}

async function waitForImages(
  root: HTMLElement,
  timeoutMs: number,
  policy: PaginationResourcePolicy,
  warnings: PaginationExportWarning[],
  signal?: AbortSignal,
): Promise<void> {
  await Promise.all(Array.from(root.querySelectorAll('img')).map(async img => {
    // 离屏打印树永远不会进入视口；保留 lazy 会让部分浏览器/WebView 永不发起请求。
    img.loading = 'eager'
    if (img.complete) {
      if (img.naturalWidth === 0 && img.currentSrc) {
        handleResourceFailure(img, '图片加载失败', policy, warnings, img.currentSrc)
      }
    } else {
      try {
        await waitForImage(img, timeoutMs, signal)
      } catch (error) {
        if (error instanceof PaginationExportError) throw error
        handleResourceFailure(
          img,
          '图片资源等待超时或加载失败',
          policy,
          warnings,
          img.currentSrc || img.src,
          error,
        )
        return
      }
    }
    if (typeof img.decode !== 'function' || !(img.currentSrc || img.src)) return
    try {
      await raceWithTimeout(img.decode(), timeoutMs, signal)
    } catch (error) {
      if (error instanceof PaginationExportError && error.code === 'aborted') {
        throw error
      }
      handleResourceFailure(
        img,
        '图片资源解码失败或超时',
        policy,
        warnings,
        img.currentSrc || img.src,
        error,
      )
    }
  }))
}

function waitForImage(img: HTMLImageElement, timeoutMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let done = false
    const finish = (error?: unknown) => {
      if (done) return
      done = true
      clearTimeout(timer)
      img.removeEventListener('load', onLoad)
      img.removeEventListener('error', onError)
      signal?.removeEventListener('abort', onAbort)
      error ? reject(error) : resolve()
    }
    const onLoad = () => finish()
    const onError = () => finish(new Error('image load failed'))
    const onAbort = () => finish(new PaginationExportError('aborted', 'PDF export was aborted', {stage: 'resource'}))
    const timer = setTimeout(() => finish(new Error('image load timeout')), timeoutMs)
    img.addEventListener('load', onLoad, {once: true})
    img.addEventListener('error', onError, {once: true})
    signal?.addEventListener('abort', onAbort, {once: true})
    // `complete` 可能在调用方首次检查与监听器注册之间翻转；监听完成后必须
    // 再读一次，避免已完成的离屏图片丢失 load/error 事件并误等到超时。
    if (signal?.aborted) onAbort()
    else if (img.complete) {
      img.naturalWidth > 0 ? onLoad() : onError()
    }
  })
}

async function waitForFonts(
  timeoutMs: number,
  policy: PaginationResourcePolicy,
  warnings: PaginationExportWarning[],
  signal?: AbortSignal,
): Promise<void> {
  const fonts = (document as Document & {fonts?: FontFaceSet}).fonts
  if (!fonts) return
  try {
    await raceWithTimeout(fonts.ready.then(() => undefined), timeoutMs, signal)
  } catch (error) {
    if (error instanceof PaginationExportError && error.code === 'aborted') throw error
    const warning: PaginationExportWarning = {
      code: 'resource-timeout',
      stage: 'resource',
      message: '字体资源未在导出时限内稳定',
    }
    if (policy === 'strict') {
      throw new PaginationExportError(warning.code, warning.message, warning, error)
    }
    warnings.push(warning)
  }
}

function raceWithTimeout<T>(promise: Promise<T>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let done = false
    const finish = (fn: () => void) => {
      if (done) return
      done = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      fn()
    }
    const onAbort = () => finish(() => reject(
      new PaginationExportError('aborted', 'PDF export was aborted', {stage: 'resource'}),
    ))
    const timer = setTimeout(() => finish(() => reject(new Error('resource timeout'))), timeoutMs)
    signal?.addEventListener('abort', onAbort, {once: true})
    promise.then(value => finish(() => resolve(value)), error => finish(() => reject(error)))
  })
}

async function settleFrames(signal?: AbortSignal): Promise<void> {
  for (let i = 0; i < 2; i++) {
    throwIfPaginationExportAborted(signal)
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  }
  throwIfPaginationExportAborted(signal)
}

function handleResourceFailure(
  node: Element,
  message: string,
  policy: PaginationResourcePolicy,
  warnings: PaginationExportWarning[],
  resourceUrl?: string,
  cause?: unknown,
): void {
  const context = {stage: 'resource' as const, blockId: blockIdOf(node), resourceUrl}
  if (policy === 'strict') {
    throw new PaginationExportError('resource-timeout', message, context, cause)
  }
  warnings.push({code: 'resource-timeout', message, ...context})
}

function handleUnsupported(
  node: Element,
  message: string,
  policy: PaginationResourcePolicy,
  warnings: PaginationExportWarning[],
  cause?: unknown,
): void {
  const context = {
    stage: 'resource' as const,
    blockId: blockIdOf(node),
    resourceUrl: resourceUrlOf(node),
  }
  if (policy === 'strict') {
    throw new PaginationExportError('unsupported-resource', message, context, cause)
  }
  warnings.push({code: 'unsupported-resource', message, ...context})
  const placeholder = document.createElement('div')
  placeholder.className = 'bc-print-resource-placeholder'
  placeholder.textContent = '此内容无法在当前环境中导出'
  if (node instanceof HTMLElement) {
    placeholder.style.width = `${node.clientWidth}px`
    placeholder.style.height = `${node.clientHeight}px`
  }
  node.replaceWith(placeholder)
}

function blockIdOf(node: Element): string | undefined {
  return node.closest<HTMLElement>('[data-block-id]')?.dataset['blockId']
}

function resourceUrlOf(node: Element): string | undefined {
  if (node instanceof HTMLIFrameElement) return node.src || undefined
  if (node instanceof HTMLVideoElement) return node.currentSrc || node.src || undefined
  if (node instanceof HTMLImageElement) return node.currentSrc || node.src || undefined
  return undefined
}
