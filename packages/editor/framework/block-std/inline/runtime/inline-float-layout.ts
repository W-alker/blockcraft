import {
  DEFAULT_INLINE_IMAGE_HEIGHT,
  DEFAULT_INLINE_IMAGE_WIDTH,
  DEFAULT_INLINE_IMAGE_WRAP_GAP,
  InlineImageWrapSide,
} from '../image-embed'

export const INLINE_FLOAT_OWNER_ATTRIBUTE = 'data-bc-inline-float-owner'
export const INLINE_FLOAT_PREVIEW_ATTRIBUTE = 'data-bc-inline-float-preview'
export const DEFAULT_INLINE_WRAP_MIN_TEXT_WIDTH = 96

export interface InlineFloatGeometryInput {
  containerWidth: number
  imageWidth: number
  imageHeight: number
  x?: number
  side?: InlineImageWrapSide
  gap?: number
  minTextWidth?: number
}

export interface InlineFloatGeometry {
  containerWidth: number
  resolvedTextSide: Exclude<InlineImageWrapSide, 'auto'>
  floatDirection: 'left' | 'right'
  imageX: number
  normalizedX: number
  imageWidth: number
  imageHeight: number
  exclusionWidth: number
  exclusionHeight: number
  frameLeft: number
  availableTextWidth: number
}

const finite = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const positive = (value: unknown, fallback: number): number => {
  const parsed = finite(value, fallback)
  return parsed > 0 ? parsed : fallback
}

const nonNegative = (value: unknown, fallback: number): number =>
  Math.max(0, finite(value, fallback))

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const normalizeSide = (
  value: unknown,
): InlineImageWrapSide =>
  value === 'left' || value === 'right' ? value : 'auto'

export function resolveInlineFloatGeometry(
  input: InlineFloatGeometryInput,
): InlineFloatGeometry {
  const containerWidth = nonNegative(input.containerWidth, 0)
  if (containerWidth <= 0) {
    return {
      containerWidth: 0,
      resolvedTextSide: 'right',
      floatDirection: 'left',
      imageX: 0,
      normalizedX: 0,
      imageWidth: 0,
      imageHeight: 0,
      exclusionWidth: 0,
      exclusionHeight: 0,
      frameLeft: 0,
      availableTextWidth: 0,
    }
  }

  const sourceWidth = positive(input.imageWidth, DEFAULT_INLINE_IMAGE_WIDTH)
  const sourceHeight = positive(input.imageHeight, DEFAULT_INLINE_IMAGE_HEIGHT)
  const imageWidth = Math.min(sourceWidth, containerWidth)
  const imageHeight = sourceHeight * imageWidth / sourceWidth
  const gap = nonNegative(input.gap, DEFAULT_INLINE_IMAGE_WRAP_GAP)
  const minTextWidth = Math.min(
    containerWidth,
    positive(input.minTextWidth, DEFAULT_INLINE_WRAP_MIN_TEXT_WIDTH),
  )
  const normalizedStart = clamp(finite(input.x, 0), 0, 1)
  const maxImageX = Math.max(0, containerWidth - imageWidth)
  let imageX = clamp(
    normalizedStart * containerWidth,
    0,
    maxImageX,
  )

  const widerSide =
    imageX - gap >= containerWidth - imageX - imageWidth - gap
      ? 'left'
      : 'right'
  const requestedSide = normalizeSide(input.side)
  const resolvedTextSide =
    requestedSide === 'auto' ? widerSide : requestedSide
  const canReserveText =
    containerWidth - imageWidth - gap >= minTextWidth

  if (canReserveText && resolvedTextSide === 'right') {
    imageX = Math.min(
      imageX,
      containerWidth - imageWidth - gap - minTextWidth,
    )
  } else if (canReserveText && resolvedTextSide === 'left') {
    imageX = Math.max(imageX, gap + minTextWidth)
  }
  imageX = clamp(imageX, 0, maxImageX)

  const exclusionWidth = resolvedTextSide === 'right'
    ? clamp(imageX + imageWidth + gap, 0, containerWidth)
    : clamp(containerWidth - imageX + gap, 0, containerWidth)
  const shellStart = resolvedTextSide === 'right'
    ? 0
    : containerWidth - exclusionWidth

  return {
    containerWidth,
    resolvedTextSide,
    floatDirection: resolvedTextSide === 'right' ? 'left' : 'right',
    imageX,
    normalizedX: containerWidth > 0 ? imageX / containerWidth : 0,
    imageWidth,
    imageHeight,
    exclusionWidth,
    exclusionHeight: imageHeight + gap,
    frameLeft: imageX - shellStart,
    availableTextWidth: Math.max(0, containerWidth - exclusionWidth),
  }
}

const datasetNumber = (
  shell: HTMLElement,
  key: string,
  fallback: number,
): number => {
  const parsed = Number(shell.dataset[key])
  return Number.isFinite(parsed) ? parsed : fallback
}

export function readInlineImageFloatInput(
  shell: HTMLElement,
  containerWidth: number,
): InlineFloatGeometryInput {
  return {
    containerWidth,
    imageWidth: datasetNumber(
      shell,
      'bcInlineImageWidth',
      DEFAULT_INLINE_IMAGE_WIDTH,
    ),
    imageHeight: datasetNumber(
      shell,
      'bcInlineImageHeight',
      DEFAULT_INLINE_IMAGE_HEIGHT,
    ),
    x: datasetNumber(shell, 'bcInlineImageWrapX', 0),
    side: normalizeSide(shell.dataset['bcInlineImageWrapSide']),
    gap: datasetNumber(
      shell,
      'bcInlineImageWrapGap',
      DEFAULT_INLINE_IMAGE_WRAP_GAP,
    ),
  }
}

export function applyInlineImageFloatLayout(
  shell: HTMLElement,
  input: InlineFloatGeometryInput,
): InlineFloatGeometry {
  const geometry = resolveInlineFloatGeometry(input)
  const frame = shell.querySelector<HTMLElement>('.bc-inline-image-frame')

  shell.dataset['bcInlineImageResolvedTextSide'] =
    geometry.resolvedTextSide
  shell.style.setProperty('--bc-inline-image-x', `${geometry.imageX}px`)
  shell.style.setProperty(
    '--bc-inline-image-width',
    `${geometry.imageWidth}px`,
  )
  shell.style.setProperty(
    '--bc-inline-image-height',
    `${geometry.imageHeight}px`,
  )
  shell.style.setProperty(
    '--bc-inline-image-exclusion-width',
    `${geometry.exclusionWidth}px`,
  )
  shell.style.setProperty(
    '--bc-inline-image-exclusion-height',
    `${geometry.exclusionHeight}px`,
  )
  shell.style.cssFloat = geometry.containerWidth > 0
    ? geometry.floatDirection
    : 'none'
  shell.style.width = `${geometry.exclusionWidth}px`
  shell.style.height = `${geometry.exclusionHeight}px`
  shell.style.removeProperty('aspect-ratio')

  if (frame) {
    frame.style.left = `${geometry.frameLeft}px`
    frame.style.width = `${geometry.imageWidth}px`
    frame.style.height = `${geometry.imageHeight}px`
    frame.style.aspectRatio =
      `${geometry.imageWidth} / ${geometry.imageHeight}`
  }
  return geometry
}

export class InlineFloatLayoutController {
  private _resizeObserver?: ResizeObserver
  private _scheduledFrame?: number
  private _lastObservedWidth?: number
  private _destroyed = false

  constructor(readonly container: HTMLElement) {}

  sync(): void {
    if (this._destroyed) return
    const shells = this._shells()
    const hasFloats = shells.length > 0
    this.container.toggleAttribute(INLINE_FLOAT_OWNER_ATTRIBUTE, hasFloats)

    if (!hasFloats) {
      this._disconnectObserver()
      return
    }
    this._ensureObserver()
    this.refresh(shells)
  }

  refresh(shells = this._shells()): void {
    if (this._destroyed || !shells.length) return
    const width =
      this.container.clientWidth ||
      this.container.getBoundingClientRect().width
    for (const shell of shells) {
      if (shell.hasAttribute(INLINE_FLOAT_PREVIEW_ATTRIBUTE)) continue
      applyInlineImageFloatLayout(
        shell,
        readInlineImageFloatInput(shell, width),
      )
    }
  }

  destroy(): void {
    if (this._destroyed) return
    this._destroyed = true
    this.container.removeAttribute(INLINE_FLOAT_OWNER_ATTRIBUTE)
    this._disconnectObserver()
  }

  private _shells(): HTMLElement[] {
    return Array.from(
      this.container.querySelectorAll<HTMLElement>(
        '[data-bc-inline-float][data-bc-inline-image-layout="wrap"]',
      ),
    )
  }

  private _ensureObserver(): void {
    if (
      this._resizeObserver ||
      typeof ResizeObserver === 'undefined'
    ) {
      return
    }
    this._resizeObserver = new ResizeObserver(entries => {
      const observedWidth = entries.find(
        entry => entry.target === this.container,
      )?.contentRect.width
      if (
        typeof observedWidth === 'number' &&
        Number.isFinite(observedWidth)
      ) {
        if (
          this._lastObservedWidth !== undefined &&
          Math.abs(this._lastObservedWidth - observedWidth) < .5
        ) {
          return
        }
        this._lastObservedWidth = observedWidth
      }
      if (this._scheduledFrame !== undefined) return
      if (typeof requestAnimationFrame === 'undefined') {
        this.refresh()
        return
      }
      this._scheduledFrame = requestAnimationFrame(() => {
        this._scheduledFrame = undefined
        this.refresh()
      })
    })
    this._resizeObserver.observe(this.container)
  }

  private _disconnectObserver(): void {
    this._resizeObserver?.disconnect()
    this._resizeObserver = undefined
    this._lastObservedWidth = undefined
    if (
      this._scheduledFrame !== undefined &&
      typeof cancelAnimationFrame !== 'undefined'
    ) {
      cancelAnimationFrame(this._scheduledFrame)
    }
    this._scheduledFrame = undefined
  }
}
