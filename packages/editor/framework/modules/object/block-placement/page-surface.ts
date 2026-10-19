import type {PaginationResult} from '@ccc/blockcraft/framework/modules/pagination/engine'
import type {ResolvedPaginationGeometry} from '../../pagination/pagination.types'

/** Placement coordinates exclude the first page's body/header origin. */
export function placementPageOrigin(geometry: ResolvedPaginationGeometry): number {
  return (geometry.contentTop ?? geometry.margins.top + geometry.headerHeight)
    + Math.max(0, geometry.geometry.contentHeight
      - (geometry.geometry.firstPageContentHeight ?? geometry.geometry.contentHeight))
}

/** Extend the canvas only; never insert flow items or mutate an earlier snapshot. */
export function includePlacementPages(
  result: PaginationResult,
  bottom: number,
  geometry: ResolvedPaginationGeometry,
): PaginationResult {
  if (!(bottom > 0) || !Number.isFinite(bottom)) return result
  const stride = geometry.sheetHeightPx + geometry.pageGap
  const count = Math.max(1, Math.ceil(
    (placementPageOrigin(geometry) + bottom + geometry.pageGap - 0.01) / stride,
  ))
  if (count <= result.pages.length) return result
  const pages = [...result.pages]
  while (pages.length < count) {
    pages.push({index: pages.length, usedHeight: 0, slots: []})
  }
  return {...result, pages}
}
