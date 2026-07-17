import type {DeltaInsertEmbed} from '../types'
import type {EmbedConverter} from './index'

export const INLINE_IMAGE_EMBED_KEY = 'image'
const INLINE_IMAGE_SHELL_CLASS = 'bc-inline-image-shell'
const INLINE_IMAGE_CLASS = 'bc-inline-image'

export interface InlineImageData {
  src: string
  width?: number
  height?: number
}

const positiveNumber = (value: unknown): number | undefined => {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

export function createInlineImageDelta(
  src: unknown,
  width?: unknown,
  height?: unknown,
): DeltaInsertEmbed | null {
  if (typeof src !== 'string' || !src.trim()) return null

  const normalizedWidth = positiveNumber(width)
  const normalizedHeight = positiveNumber(height)
  const attributes = {
    ...(normalizedWidth === undefined ? {} : {width: normalizedWidth}),
    ...(normalizedHeight === undefined ? {} : {height: normalizedHeight}),
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

  return {
    src: typeof rawSrc === 'string' ? rawSrc : '',
    ...(width === undefined ? {} : {width}),
    ...(height === undefined ? {} : {height}),
  }
}

export const inlineImageEmbedConverter: EmbedConverter = {
  toView: delta => {
    const data = readInlineImageDelta(delta)
    const shell = document.createElement('span')
    const image = document.createElement('img')
    shell.classList.add(INLINE_IMAGE_SHELL_CLASS)
    shell.dataset['bcInlineImage'] = 'true'
    image.classList.add(INLINE_IMAGE_CLASS)
    image.alt = ''
    if (data.src) image.setAttribute('src', data.src)
    if (data.width !== undefined) image.setAttribute('width', String(data.width))
    if (data.height !== undefined) image.setAttribute('height', String(data.height))
    shell.appendChild(image)
    return shell
  },
  toDelta: element => {
    const image = element instanceof HTMLImageElement
      ? element
      : element.querySelector<HTMLImageElement>(`img.${INLINE_IMAGE_CLASS}`)
    return createInlineImageDelta(
      image?.getAttribute('src') || '',
      image?.getAttribute('width'),
      image?.getAttribute('height'),
    ) ?? {insert: {[INLINE_IMAGE_EMBED_KEY]: ''}}
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
