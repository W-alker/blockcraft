import type {BlockObjectFormatCapability} from '../../../block-std/block/object-format'
import {resolvePlacementObjectsVisualBounds, type PlacementObjectGeometry} from './object-geometry'

/** Package-internal, model-only geometry shared by the command and its preview. */
export interface ObjectGroupResizeMember extends PlacementObjectGeometry {
  format?: BlockObjectFormatCapability | null
}

export function scaleObjectGroupMembers(
  objects: readonly ObjectGroupResizeMember[], sx: number, sy: number,
): PlacementObjectGeometry[] | null {
  if (![sx, sy].every(value => Number.isFinite(value) && value > 0)) return null
  const scaled: PlacementObjectGeometry[] = []
  for (const object of objects) {
    // Preserve native rotation. Nonuniform stretching projects the requested
    // global scales onto each local axis; no skew/affine field is persisted.
    const radians = object.rotation * Math.PI / 180
    const cos = Math.cos(radians)
    const sin = Math.sin(radians)
    let widthScale = Math.hypot(sx * cos, sy * sin)
    let heightScale = Math.hypot(sx * sin, sy * cos)
    // These cards draw their entire content with one width-derived unit. Keep
    // their original aspect ratio inside a stretched group as on their own
    // resizers; fitting the smaller axis avoids stretching the frame away from
    // the content. Other native objects retain independent axis resizing.
    if (object.flavour === 'date-card' || object.flavour === 'weather') {
      widthScale = heightScale = Math.min(widthScale, heightScale)
    }
    const width = object.width * widthScale
    const height = object.height * heightScale
    const format = object.format
    if (format?.features.geometry && (width < 48 - .001 || height < 32 - .001 ||
      (format.kind === 'text-box' && (width > 2000 + .001 || height > 2000 + .001)))) return null
    if (![width, height].every(value => Number.isFinite(value) && value > 0)) return null
    scaled.push({...object, width, height,
      x: (object.x + object.width / 2) * sx - width / 2,
      y: (object.y + object.height / 2) * sy - height / 2,
    })
  }
  return scaled
}

export function objectGroupResizeBounds(
  objects: readonly PlacementObjectGeometry[], preserveOrigin: boolean,
) {
  const bounds = resolvePlacementObjectsVisualBounds(objects)
  if (!bounds) return null
  return preserveOrigin
    ? {...bounds, left: 0, top: 0, right: Math.max(1, bounds.right), bottom: Math.max(1, bounds.bottom)}
    : bounds
}
