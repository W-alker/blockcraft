import type {DeltaInsertEmbed} from '../types'
import type {EmbedConverter} from './index'
import {
  imageResourcePlaceholderAdapter,
  ResourcePlaceholderController,
} from '../../../global/resource-placeholder'
import {INLINE_IMAGE_INTRINSIC_SIZE_EVENT} from './image-embed-events'

export const INLINE_IMAGE_EMBED_KEY = 'image'
const INLINE_IMAGE_SHELL_CLASS = 'bc-inline-image-shell'
const INLINE_IMAGE_FRAME_CLASS = 'bc-inline-image-frame'
const INLINE_IMAGE_CLASS = 'bc-inline-image'
export const DEFAULT_INLINE_IMAGE_WIDTH = 320
export const DEFAULT_INLINE_IMAGE_HEIGHT = 240
export const DEFAULT_INLINE_IMAGE_WRAP_GAP = 12
const inlineImageControllers =
  new WeakMap<HTMLElement, ResourcePlaceholderController>()

export type InlineImageWrapSide = 'auto' | 'left' | 'right'

export interface InlineImageWrapOptions {
  wrap?: true
  side?: InlineImageWrapSide
  /** Normalized horizontal start in the owning editable container. */
  x?: number
  /** Uniform square-wrap distance in CSS pixels. */
  gap?: number
}

export interface InlineImageData extends InlineImageWrapOptions {
  src: string
  width?: number
  height?: number
}

const finiteNumber = (value: unknown): number | undefined => {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const positiveNumber = (value: unknown): number | undefined => {
  const parsed = finiteNumber(value)
  return parsed !== undefined && parsed > 0 ? parsed : undefined
}

const nonNegativeNumber = (value: unknown): number | undefined => {
  const parsed = finiteNumber(value)
  return parsed !== undefined && parsed >= 0 ? parsed : undefined
}

const normalizedWrapSide = (value: unknown): InlineImageWrapSide | undefined =>
  value === 'auto' || value === 'left' || value === 'right'
    ? value
    : undefined

export function normalizeInlineImageWrapOptions(
  value: Partial<InlineImageWrapOptions> | undefined,
): InlineImageWrapOptions {
  if (value?.wrap !== true) return {}
  const x = finiteNumber(value.x)
  const gap = nonNegativeNumber(value.gap)
  return {
    wrap: true,
    side: normalizedWrapSide(value.side) ?? 'auto',
    x: Math.min(1, Math.max(0, x ?? 0)),
    ...(gap === undefined ? {} : {gap}),
  }
}

export function createInlineImageDelta(
  src: unknown,
  width?: unknown,
  height?: unknown,
  wrapOptions?: Partial<InlineImageWrapOptions>,
): DeltaInsertEmbed | null {
  if (typeof src !== 'string' || !src.trim()) return null

  const normalizedWidth = positiveNumber(width)
  const normalizedHeight = positiveNumber(height)
  const normalizedWrap = normalizeInlineImageWrapOptions(wrapOptions)
  const attributes = {
    ...(normalizedWidth === undefined ? {} : {width: normalizedWidth}),
    ...(normalizedHeight === undefined ? {} : {height: normalizedHeight}),
    ...normalizedWrap,
  }

  return {
    insert: {[INLINE_IMAGE_EMBED_KEY]: src},
    ...(Object.keys(attributes).length ? {attributes} : {}),
  }
}

export function readInlineImageDelta(delta: DeltaInsertEmbed): InlineImageData {
  const rawSrc = delta.insert[INLINE_IMAGE_EMBED_KEY]
  const width = positiveNumber(delta.attributes?.['width'])
  const height = positiveNumber(delta.attributes?.['height'])
  const wrap = normalizeInlineImageWrapOptions({
    wrap: delta.attributes?.['wrap'] === true ? true : undefined,
    side: delta.attributes?.['side'] as InlineImageWrapSide | undefined,
    x: finiteNumber(delta.attributes?.['x']),
    gap: nonNegativeNumber(delta.attributes?.['gap']),
  })

  return {
    src: typeof rawSrc === 'string' ? rawSrc : '',
    ...(width === undefined ? {} : {width}),
    ...(height === undefined ? {} : {height}),
    ...wrap,
  }
}

export const inlineImageEmbedConverter: EmbedConverter = {
  toView: delta => {
    const data = readInlineImageDelta(delta)
    const shell = document.createElement('span')
    const frame = document.createElement('span')
    const image = document.createElement('img')
    const width = data.width ?? DEFAULT_INLINE_IMAGE_WIDTH
    const height = data.height ??
      (data.width == null
        ? DEFAULT_INLINE_IMAGE_HEIGHT
        : data.width * DEFAULT_INLINE_IMAGE_HEIGHT / DEFAULT_INLINE_IMAGE_WIDTH)
    shell.classList.add(INLINE_IMAGE_SHELL_CLASS)
    shell.dataset['bcInlineImage'] = 'true'
    frame.classList.add(INLINE_IMAGE_FRAME_CLASS)
    frame.style.width = `${width}px`
    frame.style.aspectRatio = `${width} / ${height}`
    if (data.wrap) {
      shell.dataset['bcInlineFloat'] = 'true'
      shell.dataset['bcInlineImageLayout'] = 'wrap'
      shell.dataset['bcInlineImageWrapSide'] = data.side ?? 'auto'
      shell.dataset['bcInlineImageWrapX'] = String(data.x ?? 0)
      if (data.gap !== undefined) {
        shell.dataset['bcInlineImageWrapGap'] = String(data.gap)
      }
      shell.dataset['bcInlineImageWidth'] = String(width)
      shell.dataset['bcInlineImageHeight'] = String(height)
    } else {
      shell.style.width = `${width}px`
      shell.style.aspectRatio = `${width} / ${height}`
    }
    image.classList.add(INLINE_IMAGE_CLASS)
    image.alt = ''
    if (data.src) image.setAttribute('src', data.src)
    if (data.width !== undefined) image.setAttribute('width', String(data.width))
    if (data.height !== undefined) image.setAttribute('height', String(data.height))
    frame.appendChild(image)
    shell.appendChild(frame)
    const controller = new ResourcePlaceholderController(frame, {
      onIntrinsicSize: size => {
        if (data.width != null && data.height != null) return
        shell.dispatchEvent(new CustomEvent(INLINE_IMAGE_INTRINSIC_SIZE_EVENT, {
          bubbles: true,
          composed: true,
          detail: {
            src: data.src,
            width: size.width,
            height: size.height,
          },
        }))
      },
    })
    controller.bind({
      element: image,
      adapter: imageResourcePlaceholderAdapter,
      resourceKey: data.src,
    })
    inlineImageControllers.set(shell, controller)
    return shell
  },
  toDelta: element => {
    const shell = element.matches(`.${INLINE_IMAGE_SHELL_CLASS}`)
      ? element
      : element.closest<HTMLElement>(`.${INLINE_IMAGE_SHELL_CLASS}`) ??
        element.querySelector<HTMLElement>(`.${INLINE_IMAGE_SHELL_CLASS}`)
    const image = element instanceof HTMLImageElement
      ? element
      : element.querySelector<HTMLImageElement>(`img.${INLINE_IMAGE_CLASS}`)
    return createInlineImageDelta(
      image?.getAttribute('src') || '',
      image?.getAttribute('width'),
      image?.getAttribute('height'),
      shell?.dataset['bcInlineImageLayout'] === 'wrap'
        ? {
            wrap: true,
            side: shell.dataset['bcInlineImageWrapSide'] as
              InlineImageWrapSide | undefined,
            x: finiteNumber(shell.dataset['bcInlineImageWrapX']),
            gap: nonNegativeNumber(shell.dataset['bcInlineImageWrapGap']),
          }
        : undefined,
    ) ?? {insert: {[INLINE_IMAGE_EMBED_KEY]: ''}}
  },
  onDestroy: element => {
    inlineImageControllers.get(element)?.destroy()
    inlineImageControllers.delete(element)
  },
}

export function withDefaultEmbedConverters(
  configured: [string, EmbedConverter][] = [],
): [string, EmbedConverter][] {
  return [...new Map<string, EmbedConverter>([
    [INLINE_IMAGE_EMBED_KEY, inlineImageEmbedConverter],
    ...configured,
  ])]
}
