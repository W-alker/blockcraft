import {decodeCssPicture, encodeCssPicture} from './object-picture'
import type {IBlockProps} from '../types'

export type BlockSurfaceImageFit = 'cover' | 'contain' | 'stretch'
export type BlockSurfacePadding =
  | number
  | [number]
  | [number, number]
  | [number, number, number]
  | [number, number, number, number]

/**
 * Opt-in visual surface fields for container-like blocks.
 *
 * Padding uses CSS shorthand arity in one compact Y.Map entry. Picture
 * source, position and fit share one CSS string; opacity is independent.
 */
export interface BlockSurfaceProps extends IBlockProps {
  /** CSS-like 1–4 value padding shorthand in layout px. */
  p?: BlockSurfacePadding | null
  /** CSS picture background shorthand rendered behind block children. */
  bgi?: string | null
  /** Background image opacity from 0 to 1. */
  bgo?: number | null
}

export interface ResolvedBlockSurfaceImage {
  src: string
  fit: BlockSurfaceImageFit
  positionX: number
  positionY: number
  opacity: number
}

export interface ResolvedBlockSurface {
  padding: {
    top: number
    right: number
    bottom: number
    left: number
  }
  backgroundImage: ResolvedBlockSurfaceImage | null
}

const MAX_PADDING_PX = 1000
/**
 * Keeps only canonical, bounded surface props. Invalid and null values are
 * omitted, matching `updateBlockProps(..., {key: null})` deletion semantics.
 */
export function normalizeBlockSurfaceProps(
  input: Readonly<Record<string, unknown>> | null | undefined,
): BlockSurfaceProps {
  const normalized: BlockSurfaceProps = {}
  if (!input) return normalized

  const padding = normalizePadding(input['p'])
  if (padding !== null) normalized.p = padding

  const picture = decodeCssPicture(input['bgi'])
  if (!picture?.src) return normalized
  normalized.bgi = encodeCssPicture({...picture,
    positionX: Math.round(picture.positionX * 100) / 100,
    positionY: Math.round(picture.positionY * 100) / 100,
  })
  const opacity = Math.round((boundedNumber(input['bgo'], 0, 1) ?? 1) * 100) / 100
  if (opacity !== 1) normalized.bgo = opacity

  return normalized
}

/** Resolves omitted values to render-ready defaults without reading the DOM. */
export function resolveBlockSurface(
  input: Readonly<Record<string, unknown>> | null | undefined,
): ResolvedBlockSurface {
  const props = normalizeBlockSurfaceProps(input)
  const picture = decodeCssPicture(props.bgi)
  const [top, right, bottom, left] = expandPadding(props.p)

  return {
    padding: {
      top,
      right,
      bottom,
      left,
    },
    backgroundImage: picture ? {...picture, opacity: props.bgo ?? 1} : null,
  }
}

export function blockSurfaceImageFitToObjectFit(
  fit: BlockSurfaceImageFit,
): 'cover' | 'contain' | 'fill' {
  return fit === 'stretch' ? 'fill' : fit
}

function boundedNumber(
  value: unknown,
  min: number,
  max: number,
): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.min(max, Math.max(min, value))
}

function normalizePadding(value: unknown): BlockSurfacePadding | null {
  if (typeof value === 'number') {
    return boundedNumber(value, 0, MAX_PADDING_PX)
  }
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) {
    return null
  }

  const values = value.map(item => boundedNumber(item, 0, MAX_PADDING_PX))
  if (values.some(item => item === null)) return null
  const normalizedValues = values as number[]
  const top = normalizedValues[0]!
  const right = normalizedValues[1] ?? top
  const bottom = normalizedValues[2] ?? top
  const left = normalizedValues[3] ?? right
  return compressPadding(top, right, bottom, left)
}

function expandPadding(
  value: BlockSurfacePadding | null | undefined,
): [number, number, number, number] {
  if (typeof value === 'number') return [value, value, value, value]
  if (!value?.length) return [0, 0, 0, 0]
  const [top, second = top, third = top, fourth = second] = value
  const right = second
  const bottom = value.length >= 3 ? third : top
  const left = value.length === 4 ? fourth : right
  return [top, right, bottom, left]
}

function compressPadding(
  top: number,
  right: number,
  bottom: number,
  left: number,
): BlockSurfacePadding {
  if (top === right && top === bottom && top === left) return top
  if (top === bottom && right === left) return [top, right]
  if (right === left) return [top, right, bottom]
  return [top, right, bottom, left]
}
