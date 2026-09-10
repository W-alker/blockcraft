import {resolveScreenGeometry} from '../../modules/pagination/view/pagination-geometry'
import {includePlacementPages, placementPageOrigin} from './page-surface'

describe('absolute object paper bounds', () => {
  const geometry = resolveScreenGeometry({
    pageSize: {width: 600, height: 400},
    margins: {top: 40, right: 40, bottom: 40, left: 40},
    pageGap: 30,
  })

  it('uses the first-page document header exactly once', () => {
    const withHeader = {...geometry, geometry: {...geometry.geometry, firstPageContentHeight: 240}}
    expect(placementPageOrigin(withHeader)).toBe(120)
  })

  it('extends pages without displacing text, and preserves an older snapshot', () => {
    const flow = {pages: [{index: 0, usedHeight: 80, slots: [{id: 'paragraph'}]}], byBlock: new Map()}
    const expanded = includePlacementPages(flow, 920, geometry)
    expect(expanded.pages.length).toBe(3)
    expect(expanded.pages[0]).toBe(flow.pages[0])
    expect(expanded.pages[1].slots).toEqual([])
    expect(flow.pages.length).toBe(1)
    expect(includePlacementPages(flow, 360, geometry)).toBe(flow)
    expect(includePlacementPages(flow, 0, geometry)).toBe(flow)
  })

})
