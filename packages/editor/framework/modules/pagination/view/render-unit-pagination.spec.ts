import {Component, ViewEncapsulation} from '@angular/core'
import {TestBed} from '@angular/core/testing'
import {buildPaginatedPrintSurface} from '../../../../tools/export/print-paginator'
import {createStablePaginationLayout} from './stable-pagination-layout'
import {resolveScreenGeometry} from './pagination-geometry'
import {BlockNodeType} from '@ccc/blockcraft/framework/model'
import type {IBlockSnapshot} from '../../../block-std/types/block.type'
import {paginate} from '@ccc/blockcraft/framework/modules/pagination/engine'
import {registerInlinePaginationAccess} from '../../../block-std/inline/runtime/inline-pagination-access'
import {InlineBreakApplier} from './inline-break-applier'
import {measureContainerBreakPlan, syncContainerPaginationFlow} from './container-pagination'

describe('填写区分页投影', () => {
  let root: HTMLElement
  let region: any
  let blocks: Map<string, any>
  let releases: Array<() => void>
  let applier: InlineBreakApplier

  function block(id: string, flavour = 'paragraph', height = 100): any {
    const hostElement = document.createElement('div')
    hostElement.className = `${flavour}-block`
    hostElement.dataset['blockId'] = id
    hostElement.style.height = `${height}px`
    const value = {
      id, flavour, hostElement,
      nodeType: flavour === 'paragraph' ? BlockNodeType.editable : BlockNodeType.block,
      getChildrenBlocks: () => [],
    }
    blocks.set(id, value)
    return value
  }

  beforeEach(() => {
    blocks = new Map()
    releases = []
    root = document.createElement('div')
    root.style.cssText = 'width:400px;position:absolute;top:0;left:0'
    document.body.appendChild(root)
    region = block('region', 'render-unit', 600)
    root.appendChild(region.hostElement)
    const content = document.createElement('div')
    content.className = 'render-unit-content'
    region.hostElement.appendChild(content)
    const children = Array.from({length: 6}, (_, index) => block(`p${index}`))
    children.forEach(child => content.appendChild(child.hostElement))
    region.getChildrenBlocks = () => children
    const doc = {getBlockById: (id: string) => blocks.get(id)} as BlockCraft.Doc
    applier = new InlineBreakApplier(doc)
  })

  afterEach(() => {
    applier.destroy()
    releases.forEach(release => release())
    root.remove()
  })

  it('子块没有文本行锚点时仍保留块边界', () => {
    const plan = measureContainerBreakPlan(region, {contentHeight: 250, widowOrphanLines: 2})!
    expect(plan.points.map(point => [point.layoutOffset, point.blockId, point.textOffset]))
      .toEqual([100, 200, 300, 400, 500].map((y, i) => [y, `p${i + 1}`, 0]))
  })

  it('不足一页的填写区也收集短子文本的安全行锚点', () => {
    const child = blocks.get('p0')
    child.hostElement.style.height = '200px'
    child.containerElement = child.hostElement
    child.runtime = {}
    region.hostElement.style.height = '200px'
    region.getChildrenBlocks = () => [child]
    region.hostElement.querySelector('.render-unit-content').replaceChildren(child.hostElement)
    releases.push(registerInlinePaginationAccess(child.runtime, {
      apply: () => true, clear: () => {},
      measureLineStarts: () => [50, 100, 150].map((top, i) => ({top, offset: (i + 1) * 10, visualGuardHeight: 20})),
    }))
    const plan = measureContainerBreakPlan(region, {contentHeight: 250, widowOrphanLines: 2})!
    expect(plan.points).toEqual([{layoutOffset: 100, blockId: 'p0', textOffset: 20}])
  })

  it('子块断点可暂停、回滚，清理后原 DOM 顺序及尺寸不变', () => {
    region.hostElement.style.setProperty('--bc-region-pagination-clip', 'none', 'important')
    const plan = measureContainerBreakPlan(region, {contentHeight: 250, widowOrphanLines: 2})!
    const meta = {id: 'region', flavour: 'render-unit', nodeType: BlockNodeType.block, isHeading: false,
      height: 600, splitOffsets: plan.points.map(point => point.layoutOffset), inlineBreakPlan: plan}
    const result = paginate([{id: 'region', height: 600, breakable: true, keepWithNext: false, splitOffsets: meta.splitOffsets}], {contentHeight: 250})
    expect(applier.apply([meta], result, 300, 20).size).toBe(0)
    expect(root.querySelectorAll('[data-bc-region-pagination-mask]').length).toBe(2)
    const mask = root.querySelector('[data-bc-region-pagination-mask]') as HTMLElement
    expect(mask.style.height).toBe('120px')
    expect(mask.style.top).toBe('200px')
    expect(getComputedStyle(mask).backgroundColor).toBe('rgba(0, 0, 0, 0)')
    expect(region.hostElement.style.getPropertyValue('--bc-region-pagination-clip')).toContain('-100vmax 200px')
    expect(root.querySelectorAll('[data-bc-region-pagination-spacer]').length).toBe(2)
    const update = applier.beginUpdate()
    expect(root.querySelectorAll('[data-bc-region-pagination-spacer]').length).toBe(0)
    expect(region.hostElement.style.getPropertyValue('--bc-region-pagination-clip')).toBe('none')
    update.rollback()
    expect(root.querySelectorAll('[data-bc-region-pagination-spacer]').length).toBe(2)
    applier.clear()
    expect(root.querySelectorAll('[data-bc-region-pagination-mask]').length).toBe(0)
    expect(region.hostElement.style.getPropertyValue('--bc-region-pagination-clip')).toBe('none')
    expect(region.hostElement.style.getPropertyPriority('--bc-region-pagination-clip')).toBe('important')
    expect(region.hostElement.querySelector('.render-unit-content').children.length).toBe(6)
  })

  it('长子文本使用子块自己的文本锚点，异步重渲染会撤销整个区域投影', () => {
    const child = blocks.get('p0')
    child.hostElement.style.height = '600px'
    child.containerElement = child.hostElement
    child.runtime = {}
    let invalidate: (() => void) | undefined
    const apply = jasmine.createSpy('apply').and.returnValue(true)
    const clear = jasmine.createSpy('clear')
    releases.push(registerInlinePaginationAccess(child.runtime, {
      apply, clear,
      measureLineStarts: () => [100, 200, 300, 400, 500].map((top, i) => ({top, offset: (i + 1) * 10, visualGuardHeight: 20})),
      subscribeProjectionInvalidated: listener => { invalidate = listener; return () => {invalidate = undefined} },
    }))
    region.getChildrenBlocks = () => [child]
    region.hostElement.querySelector('.render-unit-content').replaceChildren(child.hostElement)
    const plan = measureContainerBreakPlan(region, {contentHeight: 250, widowOrphanLines: 2})!
    expect(plan.points.every(point => point.blockId === 'p0' && point.textOffset > 0)).toBeTrue()
    const meta = {id: 'region', flavour: 'render-unit', nodeType: BlockNodeType.block, isHeading: false,
      height: 600, splitOffsets: plan.points.map(point => point.layoutOffset), inlineBreakPlan: plan}
    const result = paginate([{id: 'region', height: 600, breakable: true, keepWithNext: false, splitOffsets: meta.splitOffsets}], {contentHeight: 250})
    expect(applier.apply([meta], result, 300, 20).size).toBe(0)
    expect(apply.calls.mostRecent().args[0][0].offset).toBe(20)
    invalidate!()
    expect(clear).toHaveBeenCalled()
    expect(root.querySelectorAll('[data-bc-region-pagination-mask]').length).toBe(0)
    expect(region.hostElement.style.getPropertyValue('--bc-region-pagination-clip')).toBe('')
  })

  it('高亮块按外层内边距测量子块，并可回滚透明页缝', () => {
    region.flavour = 'callout'
    region.hostElement.className = 'callout-block'
    region.hostElement.style.cssText = 'height:auto;border:2px solid;position:relative'
    const content = region.hostElement.firstElementChild as HTMLElement
    content.className = 'callout-content'
    const wrapper = document.createElement('div')
    wrapper.className = 'bc-block-content'
    wrapper.style.cssText = 'display:flex;padding:16px'
    const prefix = document.createElement('span')
    prefix.textContent = '📢'
    wrapper.append(prefix, content)
    region.hostElement.appendChild(wrapper)
    syncContainerPaginationFlow(root)
    const plan = measureContainerBreakPlan(region, {contentHeight: 250, widowOrphanLines: 2})!
    expect(plan.points.map(point => point.layoutOffset)).toEqual([118, 218, 318, 418, 518])
    const meta = {id: 'region', flavour: 'callout', nodeType: BlockNodeType.block, isHeading: false,
      height: 636, splitOffsets: plan.points.map(point => point.layoutOffset), inlineBreakPlan: plan}
    const result = paginate([{id: 'region', height: 636, breakable: true, keepWithNext: false,
      splitOffsets: meta.splitOffsets}], {contentHeight: 250})
    expect(applier.apply([meta], result, 300, 20).size).toBe(0)
    expect(root.querySelectorAll('[data-bc-region-pagination-mask]').length).toBe(2)
    expect(content.children.length).toBe(8)
    const transaction = applier.beginUpdate()
    expect(content.children.length).toBe(6)
    transaction.rollback()
    expect(content.children.length).toBe(8)
    applier.clear()
    expect(content.children.length).toBe(6)
    expect(prefix.textContent).toBe('📢')
    expect(region.hostElement.style.getPropertyValue('--bc-region-pagination-clip')).toBe('')
  })

  it('填写区移入其他原子容器时撤销自然展开标记', () => {
    syncContainerPaginationFlow(root)
    expect(region.hostElement.hasAttribute('data-bc-region-pagination-flow')).toBeTrue()
    const column = block('column', 'column')
    root.appendChild(column.hostElement)
    column.hostElement.appendChild(region.hostElement)
    syncContainerPaginationFlow(root)
    expect(region.hostElement.hasAttribute('data-bc-region-pagination-flow')).toBeFalse()
  })
})

@Component({standalone: true, template: '', encapsulation: ViewEncapsulation.None,
  styleUrl: '../../../../themes/base.scss'})
class RegionPaginationTheme {}

describe('填写区稳定打印与离线导出', () => {
  for (const short of [false, true]) for (const flavour of ['render-unit', 'callout'] as const) for (const stable of [false, true]) {
    it(`${short ? '短块' : '长块'} ${flavour} ${stable ? '稳定布局' : '离线 DOM 测量'}保留全部片段`, async () => {
      TestBed.configureTestingModule({imports: [RegionPaginationTheme]})
      const fixture = TestBed.createComponent(RegionPaginationTheme)
      fixture.detectChanges()
      const offscreen = document.createElement('div')
      offscreen.dataset['blockcraftRoot'] = 'true'
      offscreen.style.cssText = 'position:absolute;left:-99999px;top:0;width:380px;padding:0;margin:0;'
      const host = document.createElement('div')
      host.className = flavour === 'callout' ? 'callout-block' : 'render-unit-block render-unit-sized'
      host.dataset['blockId'] = 'printed-region'
      host.style.cssText = 'width:380px;height:90px;margin:0;'
      const content = document.createElement('div')
      content.className = 'render-unit-content'
      const children = Array.from({length: short ? 2 : 12}, (_, index) => {
        const child = document.createElement('div')
        child.className = 'paragraph-block'
        child.dataset['nodeType'] = 'editable'
        child.dataset['blockId'] = `print-p${index}`
        child.style.cssText = 'height:80px;margin:0;'
        child.textContent = `打印填写段落 ${index}`
        content.appendChild(child)
        return {id: child.dataset['blockId']!, flavour: 'paragraph' as const, nodeType: BlockNodeType.editable as const,
          meta: {}, props: {}, children: [{insert: child.textContent}]}
      })
      if (flavour === 'callout') {
        host.style.height = 'auto'
        content.className = 'callout-content'
        const wrapper = document.createElement('div')
        wrapper.className = 'bc-block-content'
        const prefix = document.createElement('span')
        prefix.className = 'callout-block-prefix'
        prefix.textContent = '📢'
        wrapper.append(prefix, content)
        host.appendChild(wrapper)
      } else host.appendChild(content)
      if (short) {
        const lead = document.createElement('div')
        lead.dataset['blockId'] = 'lead'
        lead.style.cssText = 'height:100px;margin:0;'
        lead.textContent = '前置内容'
        offscreen.appendChild(lead)
      }
      offscreen.appendChild(host)
      document.body.appendChild(offscreen)
      const leadSnapshots: IBlockSnapshot[] = short ? [{id: 'lead', flavour: 'paragraph', nodeType: BlockNodeType.editable, meta: {}, props: {}, children: [{insert: '前置内容'}]}] : []
      const snapshot = {id: 'root-print', flavour: 'root', nodeType: BlockNodeType.root,
        meta: {}, props: {}, children: [...leadSnapshots, {id: 'printed-region', flavour,
          nodeType: BlockNodeType.block, meta: {}, props: {width: 380, height: 90}, children}]} satisfies IBlockSnapshot
      const config = {pageSize: {width: 400, height: 220}, margins: {top: 10, right: 10, bottom: 10, left: 10}}
      const geometry = resolveScreenGeometry(config)
      syncContainerPaginationFlow(offscreen)
      const inset = content.getBoundingClientRect().top - host.getBoundingClientRect().top
      const height = host.offsetHeight
      const items = [...(short ? [{id: 'lead', height: 100, trailingSpacing: 0, breakable: false, keepWithNext: false}] : []), {id: 'printed-region', height, trailingSpacing: 0, breakable: true, keepWithNext: false,
        splitToFillPage: flavour === 'render-unit', splitStartsNewPage: flavour === 'callout',
        splitOffsets: Array.from({length: short ? 1 : 11}, (_, index) => inset + (index + 1) * 80)}]
      const layout = stable ? createStablePaginationLayout(1, config, geometry, items, paginate(items, geometry.geometry)) : undefined
      const pages = await buildPaginatedPrintSurface(snapshot, config, {
        layout, resourcePolicy: 'strict',
        render: async () => ({root: offscreen, dispose: () => offscreen.remove()}),
      })
      try {
        expect(pages.pageCount).toBe(short ? 2 : 6)
        if (short) {
          const firstContent = pages.container.querySelector('.bc-print-content')!
          expect(!!firstContent.querySelector('[data-block-id="printed-region"]')).toBe(flavour === 'render-unit')
        }
        const fragments = Array.from(pages.container.querySelectorAll<HTMLElement>('.bc-print-frag'))
        if (!fragments.length) fragments.push(pages.container.querySelector<HTMLElement>('[data-block-id="printed-region"]')!)
        expect(fragments.reduce((sum, fragment) => sum + fragment.offsetHeight, 0)).toBe(height)
        const visibleIds: string[] = []
        for (const fragment of fragments) {
          const window = fragment.getBoundingClientRect()
          for (const block of Array.from(fragment.querySelectorAll<HTMLElement>('.paragraph-block'))) {
            const rect = block.getBoundingClientRect()
            if (rect.top >= window.top - 1 && rect.bottom <= window.bottom + 1) visibleIds.push(block.dataset['blockId']!)
          }
        }
        expect(visibleIds).toEqual(children.map(child => child.id))
        expect(snapshot.children[snapshot.children.length - 1].props['height']).toBe(90)
      } finally {
        pages.dispose()
        fixture.destroy()
      }
    })
  }
})
