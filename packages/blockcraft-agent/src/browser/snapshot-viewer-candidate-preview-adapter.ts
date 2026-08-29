import {
  createSnapshotRenderer,
  type SnapshotViewerOptions,
} from '@ccc/blockcraft'
import type {
  DocumentAgentCandidatePreviewAdapter,
} from '../blockcraft/blockcraft-editor-agent'

export interface SnapshotViewerCandidatePreviewAdapterOptions {
  viewerOptions?: SnapshotViewerOptions
  surfaceWidth?: number
  maxImageWidth?: number
  maxImageHeight?: number
  maxDomNodes?: number
  cropPadding?: number
  background?: string
}

const TRANSPARENT_PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='

/** Browser fallback adapter. Native hosts may replace it with a WebView capture backend. */
export function createSnapshotViewerCandidatePreviewAdapter(
  options: SnapshotViewerCandidatePreviewAdapterOptions = {},
): DocumentAgentCandidatePreviewAdapter {
  return {
    async render(request, renderOptions) {
      const signal = renderOptions?.signal
      throwIfAborted(signal)
      if (typeof document === 'undefined' || !document.body) {
        throw new Error('Candidate preview requires a browser document.')
      }

      const mount = document.createElement('div')
      const surface = document.createElement('div')
      const renderer = createSnapshotRenderer(options.viewerOptions ?? {})
      const warnings = new Set<string>()
      const surfaceWidth = clampInteger(
        options.surfaceWidth,
        Math.min(960, Math.max(640, document.documentElement.clientWidth - 80)),
        320,
        1_600,
      )

      mount.setAttribute('aria-hidden', 'true')
      Object.assign(mount.style, {
        position: 'fixed',
        inset: '0 auto auto 0',
        transform: 'translateX(-300vw)',
        pointerEvents: 'none',
        zIndex: '-2147483648',
      })
      surface.className = 'bc-snapshot-viewer bc-agent-candidate-preview'
      Object.assign(surface.style, {
        boxSizing: 'border-box',
        width: `${surfaceWidth}px`,
        minHeight: '1px',
        padding: '24px',
        color: 'var(--bc-text-color, #172033)',
        background: options.background ?? '#ffffff',
      })
      mount.append(surface)
      document.body.append(mount)

      try {
        renderer.render(surface, request.snapshot)
        await settleSnapshotRender(surface, signal, warnings)
        const nodeCount = surface.querySelectorAll('*').length + 1
        const maxDomNodes = clampInteger(options.maxDomNodes, 3_000, 100, 10_000)
        if (nodeCount > maxDomNodes) {
          throw new Error(`Candidate preview DOM exceeds the ${maxDomNodes} node budget.`)
        }

        const crop = resolveCandidateCrop(
          surface,
          request.affectedBlockIds,
          clampInteger(options.cropPadding, 28, 0, 160),
        )
        const raster = await rasterizeElement(surface, crop, {
          maxWidth: clampInteger(options.maxImageWidth, 1_600, 320, 4_096),
          maxHeight: clampInteger(options.maxImageHeight, 1_600, 320, 4_096),
          background: options.background ?? '#ffffff',
          signal,
          warnings,
        })
        return {
          candidatePreviewVersion: 1,
          image: {
            type: 'image',
            mimeType: 'image/png',
            name: `blockcraft-candidate-${request.attempt}.png`,
            dataUrl: raster.dataUrl,
            width: raster.width,
            height: raster.height,
            purpose: 'candidate-preview',
          },
          rendererId: 'blockcraft-agent.snapshot-viewer.foreign-object-v1',
          capturedBlockIds: crop.capturedBlockIds,
          warnings: [...warnings],
        }
      } finally {
        renderer.destroy()
        mount.remove()
      }
    },
  }
}

type CandidateCrop = {
  x: number
  y: number
  width: number
  height: number
  surfaceWidth: number
  surfaceHeight: number
  capturedBlockIds: readonly string[]
}

function resolveCandidateCrop(
  surface: HTMLElement,
  affectedBlockIds: readonly string[],
  padding: number,
): CandidateCrop {
  const surfaceRect = surface.getBoundingClientRect()
  const affected = new Set(affectedBlockIds)
  const targetElements = Array.from(
    surface.querySelectorAll<HTMLElement>('[data-block-id]'),
  ).filter(element => affected.has(element.dataset['blockId'] ?? ''))
  const visibleTargets = targetElements
    .map(element => ({element, rect: element.getBoundingClientRect()}))
    .filter(({rect}) => rect.width > 0 && rect.height > 0)
  const fallback = surface.firstElementChild instanceof HTMLElement
    ? surface.firstElementChild.getBoundingClientRect()
    : surfaceRect
  const rects = visibleTargets.length ? visibleTargets.map(item => item.rect) : [fallback]
  const minLeft = Math.min(...rects.map(rect => rect.left))
  const minTop = Math.min(...rects.map(rect => rect.top))
  const maxRight = Math.max(...rects.map(rect => rect.right))
  const maxBottom = Math.max(...rects.map(rect => rect.bottom))
  const surfaceWidth = Math.max(1, Math.ceil(surface.scrollWidth), Math.ceil(surfaceRect.width))
  const surfaceHeight = Math.max(1, Math.ceil(surface.scrollHeight), Math.ceil(surfaceRect.height))
  const x = Math.max(0, Math.floor(minLeft - surfaceRect.left - padding))
  const y = Math.max(0, Math.floor(minTop - surfaceRect.top - padding))
  const right = Math.min(surfaceWidth, Math.ceil(maxRight - surfaceRect.left + padding))
  const bottom = Math.min(surfaceHeight, Math.ceil(maxBottom - surfaceRect.top + padding))

  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
    surfaceWidth,
    surfaceHeight,
    capturedBlockIds: visibleTargets
      .map(({element}) => element.dataset['blockId'])
      .filter((value): value is string => !!value),
  }
}

async function settleSnapshotRender(
  surface: HTMLElement,
  signal: AbortSignal | undefined,
  warnings: Set<string>,
): Promise<void> {
  await nextFrame(signal)
  await nextFrame(signal)
  const fonts = surface.ownerDocument.fonts
  if (fonts?.ready) {
    await withTimeout(fonts.ready.then(() => undefined), 1_500, signal)
  }
  const images = Array.from(surface.querySelectorAll('img'))
  await Promise.all(images.slice(0, 40).map(image =>
    withTimeout(image.decode?.().catch(() => undefined) ?? Promise.resolve(), 1_500, signal),
  ))
  const pendingMermaid = (): HTMLElement[] => Array.from(
    surface.querySelectorAll<HTMLElement>('.mermaid-block:not([data-mode="text"]) .graph-con'),
  ).filter(element => !element.textContent?.trim() && !element.querySelector('svg'))
  if (pendingMermaid().length) {
    await waitUntil(() => pendingMermaid().length === 0, 3_000, signal)
    if (pendingMermaid().length) warnings.add('Mermaid 增强未在预览时限内完成。')
  }
  throwIfAborted(signal)
}

async function rasterizeElement(
  surface: HTMLElement,
  crop: CandidateCrop,
  options: {
    maxWidth: number
    maxHeight: number
    background: string
    signal?: AbortSignal
    warnings: Set<string>
  },
): Promise<{dataUrl: string; width: number; height: number}> {
  const clone = cloneForRaster(surface, options.warnings)
  clone.style.width = `${crop.surfaceWidth}px`
  clone.style.height = `${crop.surfaceHeight}px`
  clone.style.minHeight = '0'
  clone.style.margin = '0'
  clone.style.transform = `translate(${-crop.x}px, ${-crop.y}px)`
  clone.style.transformOrigin = 'top left'

  const scale = Math.min(
    1,
    options.maxWidth / crop.width,
    options.maxHeight / crop.height,
  )
  const width = Math.max(1, Math.round(crop.width * scale))
  const height = Math.max(1, Math.round(crop.height * scale))
  const serialized = new XMLSerializer().serializeToString(clone)
  if (serialized.length > 4_000_000) {
    throw new Error('Candidate preview serialized DOM exceeds the 4 MB budget.')
  }
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
      `viewBox="0 0 ${crop.width} ${crop.height}">`,
    `<foreignObject width="${crop.width}" height="${crop.height}">`,
    serialized,
    '</foreignObject>',
    '</svg>',
  ].join('')
  // Chromium treats an SVG foreignObject loaded through a blob: URL as an
  // origin-tainting resource even when every nested asset is safe. An inline
  // data URL keeps the self-contained DOM image exportable as PNG.
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  try {
    const image = await loadImage(url, options.signal)
    throwIfAborted(options.signal)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas 2D is unavailable.')
    context.fillStyle = options.background
    context.fillRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)
    return {dataUrl: canvas.toDataURL('image/png'), width, height}
  } catch (error) {
    throw new Error(
      'The browser could not rasterize the isolated Snapshot Viewer surface.',
      {cause: error},
    )
  }
}

function cloneForRaster(surface: HTMLElement, warnings: Set<string>): HTMLElement {
  const clone = surface.cloneNode(true) as HTMLElement
  const sourceNodes = [surface, ...Array.from(surface.querySelectorAll<HTMLElement>('*'))]
  const cloneNodes = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>('*'))]
  sourceNodes.forEach((source, index) => {
    const target = cloneNodes[index]
    if (!target) return
    copyComputedStyle(source, target, warnings)
    copyElementState(source, target, warnings)
  })
  sourceNodes.forEach((source, index) => {
    const target = cloneNodes[index]
    if (!target) return
    materializePseudoElement(source, target, '::before', true, warnings)
    materializePseudoElement(source, target, '::after', false, warnings)
  })
  clone.querySelectorAll('script, iframe, video, audio').forEach(element => element.remove())
  return clone
}

function copyComputedStyle(
  source: Element,
  target: HTMLElement,
  warnings: Set<string>,
  pseudo?: '::before' | '::after',
): void {
  const computed = getComputedStyle(source, pseudo)
  target.removeAttribute('style')
  for (let index = 0; index < computed.length; index++) {
    const property = computed[index]
    const value = computed.getPropertyValue(property)
    if (containsUnsafeResource(value, source.ownerDocument.baseURI)) {
      warnings.add('跨域样式资源未写入候选预览。')
      continue
    }
    if (property.startsWith('animation') || property.startsWith('transition')) continue
    target.style.setProperty(property, value, computed.getPropertyPriority(property))
  }
}

function copyElementState(
  source: HTMLElement,
  target: HTMLElement,
  warnings: Set<string>,
): void {
  if (source instanceof HTMLInputElement && target instanceof HTMLInputElement) {
    target.setAttribute('value', source.value)
    if (source.checked) target.setAttribute('checked', '')
  } else if (source instanceof HTMLTextAreaElement && target instanceof HTMLTextAreaElement) {
    target.textContent = source.value
  } else if (source instanceof HTMLCanvasElement && target instanceof HTMLCanvasElement) {
    try {
      target.style.backgroundImage = `url("${source.toDataURL('image/png')}")`
      target.style.backgroundSize = '100% 100%'
    } catch {
      warnings.add('Canvas 内容无法安全写入候选预览。')
    }
  }

  if (source instanceof HTMLImageElement && target instanceof HTMLImageElement) {
    if (!isSafeResourceUrl(source.currentSrc || source.src, source.ownerDocument.baseURI)) {
      target.src = TRANSPARENT_PIXEL
      target.alt = source.alt || '跨域图片'
      target.style.background = '#eef1f6'
      warnings.add('跨域图片已用占位区域替代。')
    }
  }
  for (const attribute of ['src', 'href', 'xlink:href']) {
    const value = target.getAttribute(attribute)
    if (value && !isSafeResourceUrl(value, source.ownerDocument.baseURI)) {
      target.removeAttribute(attribute)
      warnings.add('跨域媒体链接未写入候选预览。')
    }
  }
}

function materializePseudoElement(
  source: HTMLElement,
  target: HTMLElement,
  pseudo: '::before' | '::after',
  prepend: boolean,
  warnings: Set<string>,
): void {
  const computed = getComputedStyle(source, pseudo)
  const content = parseCssContent(computed.content)
  if (!content) return
  const materialized = document.createElement('span')
  materialized.setAttribute('aria-hidden', 'true')
  materialized.textContent = content
  copyComputedStyle(source, materialized, warnings, pseudo)
  materialized.style.removeProperty('content')
  if (prepend) target.prepend(materialized)
  else target.append(materialized)
}

function parseCssContent(value: string): string | null {
  if (!value || value === 'none' || value === 'normal' || value.startsWith('url(')) return null
  const quote = value[0]
  if ((quote !== '"' && quote !== "'") || value.at(-1) !== quote) return null
  return value.slice(1, -1)
    .replace(/\\([0-9a-f]{1,6})\s?/gi, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/\\(["'\\])/g, '$1')
}

function containsUnsafeResource(value: string, baseUrl: string): boolean {
  const matches = value.matchAll(/url\((['"]?)(.*?)\1\)/gi)
  for (const match of matches) {
    if (!isSafeResourceUrl(match[2], baseUrl)) return true
  }
  return false
}

function isSafeResourceUrl(value: string, baseUrl: string): boolean {
  const trimmed = value.trim()
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return true
  }
  try {
    return new URL(trimmed, baseUrl).origin === new URL(baseUrl).origin
  } catch {
    return false
  }
}

function loadImage(url: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  if (signal?.aborted) return Promise.reject(createAbortError())
  return new Promise((resolve, reject) => {
    const image = new Image()
    const abort = () => finish(() => reject(createAbortError()))
    const finish = (callback: () => void): void => {
      image.onload = null
      image.onerror = null
      signal?.removeEventListener('abort', abort)
      callback()
    }
    image.onload = () => finish(() => resolve(image))
    image.onerror = () => finish(() => reject(new Error('SVG image decode failed.')))
    signal?.addEventListener('abort', abort, {once: true})
    image.src = url
  })
}

function nextFrame(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(createAbortError())
  return new Promise((resolve, reject) => {
    const abort = () => {
      cancelAnimationFrame(frame)
      reject(createAbortError())
    }
    const frame = requestAnimationFrame(() => {
      signal?.removeEventListener('abort', abort)
      resolve()
    })
    signal?.addEventListener('abort', abort, {once: true})
  })
}

async function withTimeout<T>(
  promise: Promise<T>,
  milliseconds: number,
  signal?: AbortSignal,
): Promise<T | undefined> {
  if (signal?.aborted) throw createAbortError()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(() => resolve(undefined)), milliseconds)
    const abort = () => finish(() => reject(createAbortError()))
    const finish = (callback: () => void): void => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      callback()
    }
    signal?.addEventListener('abort', abort, {once: true})
    promise.then(value => finish(() => resolve(value)), error => finish(() => reject(error)))
  })
}

async function waitUntil(
  predicate: () => boolean,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<boolean> {
  const deadline = performance.now() + timeoutMs
  while (!predicate() && performance.now() < deadline) {
    await delay(50, signal)
  }
  return predicate()
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(createAbortError())
  return new Promise((resolve, reject) => {
    const abort = () => finish(() => reject(createAbortError()))
    const timer = setTimeout(() => finish(resolve), milliseconds)
    const finish = (callback: () => void): void => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      callback()
    }
    signal?.addEventListener('abort', abort, {once: true})
  })
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createAbortError()
}

function createAbortError(): DOMException {
  return new DOMException('Candidate preview aborted.', 'AbortError')
}

function clampInteger(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.floor(value)))
}
