import {normalizeShapeRotation} from '../shape-block/shape.types'

/** Text-box snapshots omit the unrotated state and store whole degrees. */
export function storeTextBoxRotation(value: number): number | null {
  const rotation = Math.round(normalizeShapeRotation(value))
  return rotation === 360 || rotation === 0 ? null : rotation
}
