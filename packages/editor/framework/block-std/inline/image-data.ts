import type {DeltaInsertEmbed} from '@ccc/blockcraft/framework/model'
import {finiteNumber, positiveNumber, nonNegativeNumber} from './image-numbers'

export const INLINE_IMAGE_EMBED_KEY = 'image'
export const DEFAULT_INLINE_IMAGE_WIDTH = 320
export const DEFAULT_INLINE_IMAGE_HEIGHT = 240
export const DEFAULT_INLINE_IMAGE_WRAP_GAP = 12

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
