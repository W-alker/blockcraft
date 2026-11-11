import {MIN_FORMATTED_OBJECT_SIZE as MIN_SIZE, MAX_FORMATTED_OBJECT_SIZE as MAX_SIZE} from '../../framework/block-std/block/object-format/geometry-limits'
import type {ShapeResizeBox, ShapeResizeHandle} from './shape-resizer.component'

/** Native text/shape frame policy; other users of ShapeResizer keep their own limits. */
export function calculateFormattedObjectResize(
  handle: ShapeResizeHandle, start: ShapeResizeBox, dx: number, dy: number,
  maxWidth = Infinity, keepCornerRatio = false,
): ShapeResizeBox {
  const west = handle.includes('west'), east = handle.includes('east')
  const north = handle.includes('north'), south = handle.includes('south')
  const limit = Number.isFinite(maxWidth) ? Math.min(MAX_SIZE, Math.max(MIN_SIZE, maxWidth)) : MAX_SIZE
  let width = start.width + (east ? dx : west ? -dx : 0)
  let height = start.height + (south ? dy : north ? -dy : 0)
  if (keepCornerRatio && (west || east) && (north || south)) {
    const sx = width / start.width, sy = height / start.height
    const scale = Math.min(limit / start.width, MAX_SIZE / start.height,
      Math.max(MIN_SIZE / start.width, MIN_SIZE / start.height,
        Math.abs(sx - 1) >= Math.abs(sy - 1) ? sx : sy))
    width = start.width * scale
    height = start.height * scale
  } else {
    width = Math.min(limit, Math.max(MIN_SIZE, width))
    height = Math.min(MAX_SIZE, Math.max(MIN_SIZE, height))
  }
  return {
    width, height,
    offsetX: start.offsetX + (west ? start.width - width : 0),
    offsetY: start.offsetY + (north ? start.height - height : 0),
  }
}
