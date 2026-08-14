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
 * Padding uses CSS shorthand arity in one compact Y.Map entry. Background
 * options stay flat so independently edited options do not replace a record.
 */
export interface BlockSurfaceProps extends IBlockProps {
  /** CSS-like 1–4 value padding shorthand in layout px. */
  p?: BlockSurfacePadding | null
  /** Background-image source rendered behind block children. */
  bgi?: string | null
  /** Background-size/fit mode. */
  bgs?: BlockSurfaceImageFit | null
  /** Background x-position as a percentage from 0 to 100. */
  bgx?: number | null
  /** Background y-position as a percentage from 0 to 100. */
  bgy?: number | null
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
const DEFAULT_IMAGE_FIT: BlockSurfaceImageFit = 'cover'
const DEFAULT_IMAGE_POSITION = 50
const DEFAULT_IMAGE_OPACITY = 1
const IMAGE_FITS = new Set<BlockSurfaceImageFit>([
  'cover',
  'contain',
  'stretch',
])

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

  const src = normalizeImageSrc(input['bgi'])
  if (!src) return normalized

  normalized.bgi = src
  normalized.bgs = isImageFit(input['bgs'])
    ? input['bgs']
    : DEFAULT_IMAGE_FIT
  normalized.bgx = boundedNumber(
    input['bgx'],
    0,
    100,
  ) ?? DEFAULT_IMAGE_POSITION
  normalized.bgy = boundedNumber(
    input['bgy'],
    0,
    100,
  ) ?? DEFAULT_IMAGE_POSITION
  normalized.bgo = boundedNumber(
    input['bgo'],
    0,
    1,
  ) ?? DEFAULT_IMAGE_OPACITY

  return normalized
}

/** Resolves omitted values to render-ready defaults without reading the DOM. */
export function resolveBlockSurface(
  input: Readonly<Record<string, unknown>> | null | undefined,
): ResolvedBlockSurface {
  const props = normalizeBlockSurfaceProps(input)
  const src = props.bgi
  const [top, right, bottom, left] = expandPadding(props.p)

  return {
    padding: {
      top,
      right,
      bottom,
      left,
    },
    backgroundImage: src ? {
      src,
      fit: props.bgs ?? DEFAULT_IMAGE_FIT,
      positionX: props.bgx ?? DEFAULT_IMAGE_POSITION,
      positionY: props.bgy ?? DEFAULT_IMAGE_POSITION,
      opacity: props.bgo ?? DEFAULT_IMAGE_OPACITY,
    } : null,
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

function isImageFit(value: unknown): value is BlockSurfaceImageFit {
  return typeof value === 'string' && IMAGE_FITS.has(value as BlockSurfaceImageFit)
}

function normalizeImageSrc(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const src = value.trim()
  if (!src) return null

  const schemeSeparator = src.indexOf(':')
  if (schemeSeparator >= 0) {
    const scheme = src
      .slice(0, schemeSeparator)
      .replace(/[\u0000-\u0020\u007f]/g, '')
      .toLowerCase()
    if (scheme === 'javascript' || scheme === 'vbscript') return null
  }

  return src
}
