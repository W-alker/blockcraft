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
  let mutationCount = 0
  let resizeCount = 0
  let lastChange = 'observer-init'
  const printBoundaryTargets = isFinalPrintSurface(root)
    ? collectFinalPrintBoundaryTargets(root)
    : null

  const markChanged = (kind: 'mutation' | 'resize', target?: EventTarget | null) => {
    revision++
    lastChange = target instanceof Element
      ? `${kind}:${describeStabilityTarget(target)}`
      : kind
  }
  const mutationObserver = typeof MutationObserver === 'undefined'
    ? null
    : new MutationObserver(records => {
      mutationCount += records.length
      markChanged('mutation', records.at(-1)?.target)
    })
  const ResizeObserverCtor = view?.ResizeObserver ?? globalThis.ResizeObserver
  const resizeObserver = ResizeObserverCtor
    ? new ResizeObserverCtor(entries => {
      resizeCount += entries.length
      markChanged('resize', entries.at(-1)?.target)
    })
    : null

  // DOM 内容仍需整棵树静默：业务块即使保持相同外框，也可能继续替换文字、
  // 状态或媒体属性。MutationObserver 只注册一次，不会产生逐块观察成本。
  mutationObserver?.observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
  })

  if (printBoundaryTargets) {
    // 最终页盒已经完成业务渲染、图片解码和字体等待。这里仅验收会改变物理页
    // 几何的边界盒；超长表格的每个分页 fragment 都包含完整深克隆，若继续观察
    // 所有嵌套 data-block-id，ResizeObserver 规模会退化为
    // O(页数 × 单元格/文字块)，并产生大量不影响页盒的尺寸通知。
    for (const target of printBoundaryTargets) {
      resizeObserver?.observe(target)
    }
  } else {
    resizeObserver?.observe(root)
    for (const block of Array.from(root.querySelectorAll<HTMLElement>('[data-block-id]'))) {
      resizeObserver?.observe(block)
    }
  }

  try {
    while (stableFrames < quietFrames) {
      throwIfPaginationExportAborted(signal)
      if (Date.now() - startedAt >= timeoutMs) {
        const scope = printBoundaryTargets ? '最终打印页盒' : '导出副本文档'
        throw new PaginationExportError(
          'layout-not-ready',
          `${scope}在限定时间内未达到稳定布局（最后变更：${lastChange}，` +
            `mutation ${mutationCount}，resize ${resizeCount}，` +
            `观察边界 ${printBoundaryTargets?.length ?? 'all'}）`,
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

function isFinalPrintSurface(root: HTMLElement): boolean {
  return root.dataset['bcPrintRoot'] === 'true'
    && root.classList.contains('bc-print-root')
}

/**
 * 最终打印树只观察固定页盒、页内直属层以及正文的顶层 slot/fragment。
 * 嵌套表格 cell/block 的自然内容已经在稳定布局校验和资源准备阶段验收；它们的
 * 深克隆不应再次放大 ResizeObserver 数量。
 */
function collectFinalPrintBoundaryTargets(root: HTMLElement): HTMLElement[] {
  const targets = new Set<HTMLElement>([root])
  for (const rawPage of Array.from(root.children)) {
    if (!(rawPage instanceof HTMLElement) || !rawPage.classList.contains('bc-print-page')) {
      continue
    }
    targets.add(rawPage)
    for (const rawLayer of Array.from(rawPage.children)) {
      if (!(rawLayer instanceof HTMLElement)) continue
      targets.add(rawLayer)
      if (!rawLayer.classList.contains('bc-print-content')) continue
      for (const rawSlot of Array.from(rawLayer.children)) {
        if (rawSlot instanceof HTMLElement) targets.add(rawSlot)
      }
    }
  }
  return [...targets]
}

function describeStabilityTarget(target: Element): string {
  const element = target as HTMLElement
  const page = element.closest<HTMLElement>('.bc-print-page')
  const pageIndex = page?.dataset['pageIndex']
  const blockId = element.dataset['blockId']
  const classes = Array.from(element.classList).slice(0, 2).join('.')
  return [
    element.localName,
    classes ? `.${classes}` : '',
    blockId ? `[block=${blockId}]` : '',
    pageIndex != null ? `[page=${pageIndex}]` : '',
  ].join('')
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
