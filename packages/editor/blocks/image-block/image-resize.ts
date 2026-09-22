import type {ShapeResizeBox, ShapeResizeHandle} from '../shape-block/shape-resizer.component'

/** 图片四角等比缩放、四边独立调宽高，始终以对边/对角为锚点。 */
export const calculateImageResize = (
  handle: ShapeResizeHandle, start: ShapeResizeBox, deltaX: number, deltaY: number,
  maxWidth = Number.POSITIVE_INFINITY, rotation = 0,
): ShapeResizeBox => {
  const limit = Number.isFinite(maxWidth) ? Math.max(1, maxWidth) : Infinity
  // A nested image's CSS max-width can be narrower than its ratio-based inline
  // width. Its measured height already belongs to that visible, clamped box.
  start = {...start, width: Math.min(start.width, limit)}
  const west = handle.includes('west')
  const east = handle.includes('east')
  const north = handle.includes('north')
  const south = handle.includes('south')
  const horizontal = west || east
  const vertical = north || south
  const widthScale = 1 + (east ? deltaX : west ? -deltaX : 0) / start.width
  const heightScale = 1 + (south ? deltaY : north ? -deltaY : 0) / start.height
  const corner = horizontal && vertical
  const scale = Math.abs(widthScale - 1) >= Math.abs(heightScale - 1) ? widthScale : heightScale
  const width = horizontal
    ? Math.min(limit, Math.max(Math.min(30, limit), start.width * (corner ? scale : widthScale)))
    : start.width
  const height = corner
    ? width * start.height / start.width
    : vertical ? Math.max(30, start.height * heightScale) : start.height
  // CSS rotates around the changing box center. Compensate in local coordinates;
  // ShapeResizer then rotates this offset into the placement plane.
  const radians = rotation * Math.PI / 180
  const halfWidthDelta = (width - start.width) / 2
  const halfHeightDelta = (height - start.height) / 2
  const centerX = (1 - Math.cos(radians)) * halfWidthDelta - Math.sin(radians) * halfHeightDelta
  const centerY = Math.sin(radians) * halfWidthDelta + (1 - Math.cos(radians)) * halfHeightDelta
  return {
    width,
    height,
    offsetX: start.offsetX + (west ? start.width - width : 0) + centerX,
    offsetY: start.offsetY + (north ? start.height - height : 0) + centerY,
  }
}
