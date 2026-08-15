import {resolveObjectDimensions} from '../block-object-sizing.manager'
import {resolveBlockPosition} from './state'

export interface PlacementObjectGeometry {
  id: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  flavour: string
  props: Record<string, unknown>
}

export interface PlacementObjectVisualBounds {
  left: number
  top: number
  right: number
  bottom: number
  centerX: number
  centerY: number
  width: number
  height: number
}

interface ResolvePlacementObjectGeometryOptions {
  props?: Record<string, unknown>
  referenceWidth?: number
}

const finiteNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const finitePositive = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null

export const roundPlacementGeometry = (value: number): number => {
  const rounded = Math.round(value * 1000) / 1000
  return Object.is(rounded, -0) ? 0 : rounded
}

/**
 * Resolve one absolute object's model geometry without requiring a mounted
 * component or reading DOM. Responsive objects use the supplied placement
 * plane width; fixed objects use their persisted pixel frame.
 */
export function resolvePlacementObjectGeometry(
  doc: BlockCraft.Doc,
  blockId: string,
  options: ResolvePlacementObjectGeometryOptions = {},
): PlacementObjectGeometry | null {
  const flavour = doc.model.getFlavour(blockId)
  if (!flavour) return null
  const capability = doc.schemas.get(flavour, false)?.metadata.placement
  if (!capability?.modes.includes('absolute')) return null
  const props = options.props ??
    doc.model.getProps(blockId) as Record<string, unknown>
  const position = resolveBlockPosition(props['position'])
  const objectSizing = doc.objectSizing.getCapability(flavour)
  const dimensions = objectSizing
    ? resolveObjectDimensions(
        props,
        options.referenceWidth ?? doc.objectSizing.rootContentWidth,
        objectSizing,
      )
    : null
  const width = dimensions?.width ?? finitePositive(props['width'])
  const height = dimensions?.height ?? finitePositive(props['height'])
  if (width === null || height === null) return null
  return {
    id: blockId,
    flavour,
    props,
    ...position,
    width,
    height,
    rotation: finiteNumber(props['rotation']),
  }
}

/** Rotation-aware axis-aligned visual bounds around the object's center. */
export function resolvePlacementObjectVisualBounds(
  object: PlacementObjectGeometry,
): PlacementObjectVisualBounds {
  const radians = object.rotation * Math.PI / 180
  const cos = Math.abs(Math.cos(radians))
  const sin = Math.abs(Math.sin(radians))
  const width = object.width * cos + object.height * sin
  const height = object.width * sin + object.height * cos
  const left = object.x + (object.width - width) / 2
  const top = object.y + (object.height - height) / 2
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    centerX: object.x + object.width / 2,
    centerY: object.y + object.height / 2,
    width,
    height,
  }
}

export function resolvePlacementObjectsVisualBounds(
  objects: readonly PlacementObjectGeometry[],
): PlacementObjectVisualBounds | null {
  if (!objects.length) return null
  let left = Number.POSITIVE_INFINITY
  let top = Number.POSITIVE_INFINITY
  let right = Number.NEGATIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY
  objects.forEach(object => {
    const bounds = resolvePlacementObjectVisualBounds(object)
    left = Math.min(left, bounds.left)
    top = Math.min(top, bounds.top)
    right = Math.max(right, bounds.right)
    bottom = Math.max(bottom, bounds.bottom)
  })
  return {
    left,
    top,
    right,
    bottom,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
    width: right - left,
    height: bottom - top,
  }
}
