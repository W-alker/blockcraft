import {getShapeDefinition} from './shape-definitions'
import {resolveShapeAdjustmentProjection} from './shape-adjustments'
import {createDefaultEditableShapeGeometry, serializeCustomShapeGeometry} from './shape-geometry'
import {createEditableShapeGeometryFromDefinition} from './shape-path-parser'
import type {ShapeAdjustmentValues, ShapeKind, SerializedCustomShapeGeometry} from './shape.types'

/** Cold snapshot/commit boundary: catalogue-equivalent geometry needs no override. */
export function compactShapeGeometryOverride(
  value: unknown, shape: ShapeKind, adjustments?: ShapeAdjustmentValues,
): SerializedCustomShapeGeometry | undefined {
  const serialized = serializeCustomShapeGeometry(value)
  if (!serialized) return undefined
  const definition = getShapeDefinition(shape)
  const adjusted = resolveShapeAdjustmentProjection(shape, adjustments)
  const preset = adjusted
    ? createEditableShapeGeometryFromDefinition({...definition, path: adjusted.path, detailPath: undefined})
    : createDefaultEditableShapeGeometry(shape) ?? createEditableShapeGeometryFromDefinition(definition)
  return serialized === serializeCustomShapeGeometry(preset) ? undefined : serialized
}
