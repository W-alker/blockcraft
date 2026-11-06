import {normalizeObjectTextStyle, storeObjectTextStyle, type BlockObjectFormatCapability} from '../../../block-std/block/object-format'
import {MIN_FORMATTED_OBJECT_SIZE, MAX_FORMATTED_OBJECT_SIZE} from '../../../block-std/block/object-format/geometry-limits'
import {resolvePlacementObjectsVisualBounds, type PlacementObjectGeometry} from './object-geometry'

/** Package-internal, model-only geometry shared by the command and its preview. */
export interface ObjectGroupResizeMember extends PlacementObjectGeometry {
  format?: BlockObjectFormatCapability | null
}

/** Match standalone WordArt: uniform/corner scaling changes type size, side stretching does not. */
export function createObjectGroupFontScale(objects: readonly ObjectGroupResizeMember[]) {
  const fonts = objects.flatMap(object => object.format?.kind === 'word-art'
    ? [{id: object.id, style: normalizeObjectTextStyle(object.props, object.format.defaults.textStyle)}] : [])
  return (sx: number, sy: number): Map<string, {fontSize: number; textFont: string}> => {
    const scaled = new Map<string, {fontSize: number; textFont: string}>()
    if (![sx, sy].every(value => Number.isFinite(value) && value > 0) ||
      sx === 1 || sy === 1 || Math.abs(sx - sy) > .0001) return scaled
    for (const {id, style} of fonts) {
      // Share the existing font bounds, precision, weight and italic storage.
      const textFont = storeObjectTextStyle({...style, fontSize: style.fontSize * sx}).textFont
      scaled.set(id, {fontSize: Number.parseFloat(textFont), textFont})
    }
    return scaled
  }
}

/** Cache local-axis constraints once per gesture; pointer frames stay O(members). */
export function createObjectGroupScaleConstraint(objects: readonly ObjectGroupResizeMember[]) {
  const axes = objects.flatMap(object => {
    if (!object.format?.features.geometry) return []
    const radians = object.rotation * Math.PI / 180
    const cos2 = Math.cos(radians) ** 2
    const sin2 = Math.sin(radians) ** 2
    return [
      {x: cos2, y: sin2, min: (MIN_FORMATTED_OBJECT_SIZE / object.width) ** 2, max: (MAX_FORMATTED_OBJECT_SIZE / object.width) ** 2},
      {x: sin2, y: cos2, min: (MIN_FORMATTED_OBJECT_SIZE / object.height) ** 2, max: (MAX_FORMATTED_OBJECT_SIZE / object.height) ** 2},
    ]
  })
  return (sx: number, sy: number) => {
    let progress = 1
    let limit: 'min' | 'max' | null = null
    const dx = sx - 1
    const dy = sy - 1
    for (const axis of axes) {
      // Along the gesture ray, each squared local scale is a quadratic.
      // Its first boundary intersection preserves corner proportions and the
      // untouched axis of side handles, including rotated members.
      const a = axis.x * dx * dx + axis.y * dy * dy
      const b = 2 * (axis.x * dx + axis.y * dy)
      if (a === 0) continue
      const minimumAt = Math.max(0, Math.min(progress, -b / (2 * a)))
      if (a * minimumAt * minimumAt + b * minimumAt + 1 < axis.min - 1e-12) {
        const root = (-b - Math.sqrt(Math.max(0, b * b - 4 * a * (1 - axis.min)))) / (2 * a)
        progress = Math.max(0, Math.min(progress, root))
        limit = 'min'
      }
      if (a * progress * progress + b * progress + 1 > axis.max + 1e-12) {
        const root = (-b + Math.sqrt(Math.max(0, b * b - 4 * a * (1 - axis.max)))) / (2 * a)
        progress = Math.max(0, Math.min(progress, root))
        limit = 'max'
      }
    }
    return progress === 1 ? {sx, sy, limit: null}
      : {sx: 1 + dx * progress, sy: 1 + dy * progress, limit}
  }
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
    if (format?.features.geometry && (width < MIN_FORMATTED_OBJECT_SIZE - .001 || height < MIN_FORMATTED_OBJECT_SIZE - .001 ||
      width > MAX_FORMATTED_OBJECT_SIZE + .001 || height > MAX_FORMATTED_OBJECT_SIZE + .001)) return null
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
