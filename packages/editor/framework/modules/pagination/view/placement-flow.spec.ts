import {BlockNodeType, IBlockSnapshot} from '../../../block-std/types/block.type'
import {LiveHeightSource} from './live-height-source'
import {buildPaginationItems} from './item-builder'
import {paginate} from '../engine'
import {resolveScreenGeometry} from './pagination-geometry'
import {createStablePaginationLayout} from './stable-pagination-layout'
import {buildPrintPages} from '../export/print-paginator'

// 真实浏览器布局回归：height:0 + border-box 并不消除继承的 padding。
// 测量仍如实返回物理尺寸；正文分页项边界负责排除定位基础设施。
describe('placement plane flow ownership', () => {
  it('keeps near-full live and printed pages single without clipping absolute objects', async () => {
    const config = {pageSize: {width: 400, height: 300}, margins: {top: 40, right: 40, bottom: 40, left: 40}}
    const geometry = resolveScreenGeometry(config)
    const root = document.createElement('div')
    root.style.cssText = 'position:relative;box-sizing:border-box;width:400px;padding:0 40px 40px'
    const body = document.createElement('div')
    body.dataset['blockId'] = 'body'
    body.style.cssText = 'height:210px;margin:0'
    body.textContent = '正文'
    const plane = document.createElement('div')
    plane.dataset['blockId'] = 'plane'
    plane.setAttribute('data-bc-placement-layout', '')
    plane.style.cssText = 'position:absolute;top:0;left:0;right:0;width:auto;height:0;box-sizing:border-box;padding:inherit;margin:0'
    const container = document.createElement('div')
    container.className = 'children-render-container'
    container.style.cssText = 'position:relative;box-sizing:border-box;width:100%;height:0'
    const object = document.createElement('div')
    object.dataset['blockId'] = 'shape'
    object.dataset['bcPlacement'] = 'absolute'
    object.style.cssText = 'position:absolute;left:20px;top:20px;width:40px;height:40px;background:red'
    container.append(object)
    plane.append(container)
    root.append(body, plane)
    document.body.append(root)
    const blocks = new Map([
      ['body', {hostElement: body, flavour: 'paragraph', nodeType: BlockNodeType.editable}],
      ['plane', {hostElement: plane, flavour: 'placement-layout', nodeType: BlockNodeType.block}],
    ])
    const source = new LiveHeightSource({
      root: {childrenIds: ['body', 'plane']},
      getBlockById: (id: string) => blocks.get(id),
    } as unknown as BlockCraft.Doc)
    let printed: Awaited<ReturnType<typeof buildPrintPages>> | undefined
    try {
      const measurements = source.measure({contentHeight: 220, contentWidth: 320, widowOrphanLines: 2})
      expect(plane.offsetHeight).toBe(40)
      expect(measurements[1].height).toBe(40)
      const items = buildPaginationItems(measurements)
      const result = paginate(items, geometry.geometry)
      expect(result.pages.length).toBe(1)
      expect(result.pages[0].slots.map(slot => slot.id)).toEqual(['body'])
      expect(result.pages[0].usedHeight).toBe(210)
      const snapshot: IBlockSnapshot = {
        id: 'root', flavour: 'root', nodeType: BlockNodeType.root, props: {}, meta: {}, children: [
          {id: 'body', flavour: 'paragraph', nodeType: BlockNodeType.editable, props: {}, meta: {}, children: [{insert: '正文'}]},
          {id: 'plane', flavour: 'placement-layout', nodeType: BlockNodeType.block, props: {}, meta: {}, children: [
            {id: 'shape', flavour: 'shape', nodeType: BlockNodeType.block, props: {position: '20 20', width: 40, height: 40}, meta: {}, children: []},
          ]},
        ],
      }
      printed = await buildPrintPages(snapshot, config, {
        layout: createStablePaginationLayout(1, config, geometry, items, result),
        render: async () => ({root, dispose: () => root.remove()}),
      })
      expect(printed.pageCount).toBe(1)
      expect(printed.container.querySelectorAll('[data-block-id="shape"]').length).toBe(1)
    } finally {
      printed?.dispose()
      source.destroy()
      root.remove()
    }
  })
})
