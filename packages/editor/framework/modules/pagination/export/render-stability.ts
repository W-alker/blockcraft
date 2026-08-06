import {
  PaginationExportError,
  PaginationRenderStabilityOptions,
  throwIfPaginationExportAborted,
} from './pdf-export.types'

const DEFAULT_QUIET_FRAMES = 2
const DEFAULT_TIMEOUT_MS = 10000

/**
 * 等待导出副本的 DOM 与块尺寸连续静默。它只负责通用视觉稳定性；业务数据是否加载完成
 * 由 `PaginationPdfOptions.prepareDocument` 的 Promise 明确表达。
 */
export async function waitForPaginationRenderStable(
  root: HTMLElement,
  options: PaginationRenderStabilityOptions = {},
  signal?: AbortSignal,
): Promise<void> {
  const quietFrames = Math.max(1, Math.floor(options.quietFrames ?? DEFAULT_QUIET_FRAMES))
  const timeoutMs = Math.max(0, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const view = root.ownerDocument.defaultView
  let revision = 0
  let stableFrames = 0
  let lastRevision = -1
  const startedAt = Date.now()

  const markChanged = () => {
    revision++
  }
  const mutationObserver = typeof MutationObserver === 'undefined'
    ? null
    : new MutationObserver(markChanged)
  const ResizeObserverCtor = view?.ResizeObserver ?? globalThis.ResizeObserver
  const resizeObserver = ResizeObserverCtor
    ? new ResizeObserverCtor(markChanged)
    : null

  mutationObserver?.observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
  })
  resizeObserver?.observe(root)
  for (const block of Array.from(root.querySelectorAll<HTMLElement>('[data-block-id]'))) {
    resizeObserver?.observe(block)
  }

  try {
    while (stableFrames < quietFrames) {
      throwIfPaginationExportAborted(signal)
      if (Date.now() - startedAt >= timeoutMs) {
        throw new PaginationExportError(
          'layout-not-ready',
          '导出副本文档在限定时间内未达到稳定布局',
          {stage: 'layout'},
        )
      }
      await nextFrame(view, signal)
      if (revision === lastRevision) {
        stableFrames++
      } else {
        lastRevision = revision
        stableFrames = 0
      }
    }
  } finally {
    mutationObserver?.disconnect()
    resizeObserver?.disconnect()
  }
}

function nextFrame(view: Window | null, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let frameId: number | null = null
    let timerId: ReturnType<typeof setTimeout> | null = null
    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort)
      if (frameId != null) view?.cancelAnimationFrame(frameId)
      if (timerId != null) clearTimeout(timerId)
    }
    const done = () => {
      cleanup()
      resolve()
    }
    const onAbort = () => {
      cleanup()
      reject(new PaginationExportError('aborted', 'PDF export was aborted', {stage: 'layout'}))
    }

    signal?.addEventListener('abort', onAbort, {once: true})
    if (signal?.aborted) {
      onAbort()
      return
    }
    if (view?.requestAnimationFrame) {
      frameId = view.requestAnimationFrame(done)
    } else {
      timerId = setTimeout(done, 16)
    }
  })
}
