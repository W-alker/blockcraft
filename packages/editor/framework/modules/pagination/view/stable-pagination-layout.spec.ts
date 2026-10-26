import {PaginationResult} from '../engine'
import {PaginationConfig, ResolvedPaginationGeometry} from '../pagination.types'
import {createStablePaginationLayout} from './stable-pagination-layout'

describe('StablePaginationLayout', () => {
  it('copies config, items, fragments and placement maps', () => {
    const config: PaginationConfig = {
      pageSize: {width: 400, height: 600},
      margins: {top: 72, left: 36},
      header: {
        left: 'title',
        content: {
          left: {
            gap: 4,
            items: [
              {kind: 'image', src: 'data:image/png;base64,logo', height: 20},
              {kind: 'text', text: 'brand'},
            ],
          },
        },
      },
    }
    const geometry: ResolvedPaginationGeometry = {
      sheetWidthPx: 400,
      sheetHeightPx: 600,
      margins: {top: 72, right: 36, bottom: 72, left: 36},
      pageGap: 24,
      headerHeight: 24,
      footerHeight: 0,
      geometry: {contentHeight: 432},
    }
    const items = [{
      id: 'table',
      height: 240,
      breakable: true,
      keepWithNext: false,
      splitOffsets: [120, 240],
      preferredSplitOffsets: [120],
    }]
    const result: PaginationResult = {
      pages: [
        {index: 0, usedHeight: 120, slots: [{id: 'table', fragment: {fromOffset: 0, toOffset: 120}}]},
        {index: 1, usedHeight: 120, slots: [{id: 'table', fragment: {fromOffset: 120, toOffset: 240}}]},
      ],
      byBlock: new Map([['table', {pageIndex: 0}]]),
    }

    const layout = createStablePaginationLayout(7, config, geometry, items, result)

    config.margins!.top = 999
    ;(config.pageSize as {width: number; height: number}).width = 999
    ;(config.header!.content!.left!.items[1] as {kind: 'text'; text: string}).text = 'mutated'
    items[0]!.splitOffsets!.push(999)
    result.pages[0]!.slots[0]!.fragment!.toOffset = 999
    result.byBlock.set('later', {pageIndex: 9})

    expect(layout.revision).toBe(7)
    expect(layout.config.margins!.top).toBe(72)
    expect((layout.config.pageSize as {width: number}).width).toBe(400)
    expect(layout.config.header!.content!.left!.items[1]).toEqual({kind: 'text', text: 'brand'})
    expect(layout.items[0]!.splitOffsets).toEqual([120, 240])
    expect(layout.items[0]!.preferredSplitOffsets).toEqual([120])
    expect(layout.result.pages[0]!.slots[0]!.fragment!.toOffset).toBe(120)
    expect(layout.result.byBlock.has('later')).toBeFalse()
  })
})
