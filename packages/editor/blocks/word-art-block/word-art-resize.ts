import type {
  ShapeResizeBox,
  ShapeResizeHandle,
} from '../shape-block/shape-resizer.component'

const MIN_WIDTH = 48
const MIN_HEIGHT = 32

export function calculateWordArtResize(
  handle: ShapeResizeHandle,
  start: ShapeResizeBox,
  deltaX: number,
  deltaY: number,
  maxWidth = Number.POSITIVE_INFINITY,
): ShapeResizeBox {
  const west = handle.includes('west')
  const east = handle.includes('east')
  const north = handle.includes('north')
  const south = handle.includes('south')
  const isCorner = (west || east) && (north || south)
  const effectiveMaxWidth = Number.isFinite(maxWidth)
    ? Math.max(MIN_WIDTH, maxWidth)
    : Number.POSITIVE_INFINITY

  let width = start.width + (east ? deltaX : west ? -deltaX : 0)
  let height = start.height + (south ? deltaY : north ? -deltaY : 0)

  if (isCorner) {
    const widthScale = width / Math.max(1, start.width)
    const heightScale = height / Math.max(1, start.height)
    const scale = Math.abs(widthScale - 1) >= Math.abs(heightScale - 1)
      ? widthScale
      : heightScale
    const minScale = Math.max(
      MIN_WIDTH / Math.max(1, start.width),
      MIN_HEIGHT / Math.max(1, start.height),
    )
    const maxScale = effectiveMaxWidth / Math.max(1, start.width)
    const normalizedScale = Math.min(maxScale, Math.max(minScale, scale))
    width = start.width * normalizedScale
    height = start.height * normalizedScale
  } else {
    width = Math.min(effectiveMaxWidth, Math.max(MIN_WIDTH, width))
    height = Math.max(MIN_HEIGHT, height)
  }

  return {
    width,
    height,
    offsetX: start.offsetX + (west ? start.width - width : 0),
    offsetY: start.offsetY + (north ? start.height - height : 0),
  }
}
