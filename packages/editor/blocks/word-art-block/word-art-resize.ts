import type {
  ShapeResizeBox,
  ShapeResizeHandle,
} from '../shape-block/shape-resizer.component'
import {calculateFormattedObjectResize} from '../shape-block/shape-resize'

export function calculateWordArtResize(
  handle: ShapeResizeHandle,
  start: ShapeResizeBox,
  deltaX: number,
  deltaY: number,
  maxWidth = Number.POSITIVE_INFINITY,
): ShapeResizeBox {
  return calculateFormattedObjectResize(handle, start, deltaX, deltaY, maxWidth, true)
}
