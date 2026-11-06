import {Component, ViewEncapsulation} from '@angular/core'
import {TestBed} from '@angular/core/testing'
import {BlockNodeType, type IBlockSnapshot} from '../../../block-std/types/block.type'
import {createSnapshotRenderer} from '../../../../snapshot-viewer/create-snapshot-renderer'
import {buildPaginatedPrintSurface} from '../../../../tools/export/print-paginator'
import {resolveScreenGeometry} from './pagination-geometry'
import {createStablePaginationLayout} from './stable-pagination-layout'
import {paginate} from '../engine'
import {appendFlowSentinel} from '../../../../tools/export/print-dom'

@Component({standalone: true, template: '', encapsulation: ViewEncapsulation.None,
  styleUrl: '../../../../themes/base.scss'})
class ColumnsPaginationTheme {}

function paragraph(id: string): IBlockSnapshot {
  return {id, flavour: 'paragraph', nodeType: BlockNodeType.editable, meta: {}, props: {}, children: [{insert: '分栏正文'}]}
}

function snapshot(regionMode: 'none' | 'natural' | 'fixed'): IBlockSnapshot {
  return {id: 'columns-root', flavour: 'root', nodeType: BlockNodeType.root, meta: {}, props: {}, children: [
    {id: 'columns', flavour: 'columns', nodeType: BlockNodeType.block, meta: {}, props: {columnCount: 2, columnWidths: [50, 50]}, children: [0, 1].map(i => ({
      id: `column${i}`, flavour: 'column', nodeType: BlockNodeType.block, meta: {}, props: {},
      children: regionMode === 'none'
        ? Array.from({length: 24}, (_, j) => paragraph(`p${i}-${j}`))
        : [{id: `region${i}`, flavour: 'render-unit', nodeType: BlockNodeType.block, meta: {},
          props: regionMode === 'fixed' ? {width: 600, height: 900} : {},
          children: Array.from({length: 24}, (_, j) => paragraph(`p${i}-${j}`))}],
    }))}, paragraph('after'),
  ]}
}

for (const regionMode of ['none', 'natural', 'fixed'] as const) {
  for (const stable of [false, true]) {
    describe(`分栏 ${regionMode} ${stable ? '稳定' : '离线'} 打印`, () => {
      it('测量与最终页盒使用同一正文容量，分栏不覆盖页脚', async () => {
        TestBed.configureTestingModule({imports: [ColumnsPaginationTheme]})
        const fixture = TestBed.createComponent(ColumnsPaginationTheme)
        fixture.detectChanges()
        const offscreen = document.createElement('div')
        offscreen.style.cssText = 'position:absolute;left:-99999px;top:0;width:380px'
        document.body.appendChild(offscreen)
        const renderer = createSnapshotRenderer()
        const data = snapshot(regionMode)
        renderer.render(offscreen, data)
        const root = offscreen.querySelector<HTMLElement>('[data-blockcraft-root="true"]')!
        appendFlowSentinel(root)
        const columns = root.querySelector<HTMLElement>('.columns-block')!
        const config = {pageSize: {width: 400, height: 300}, margins: {top: 20, bottom: 20, left: 10, right: 10}, footer: {center: '页脚', height: 24, distance: 20}}
        const geometry = resolveScreenGeometry(config)
        root.classList.add('bc-paginated')
        root.style.setProperty('--bc-page-content-height', `${geometry.geometry.contentHeight}px`)
        // 屏幕测量不让 root 自身的页面定位样式影响离屏夹具。
        root.style.cssText += ';position:relative;left:0;transform:none;width:380px;margin:0;padding:0;'
        const items = [columns, root.querySelector<HTMLElement>('[data-block-id="after"]')!].map(el => {
          const spacing = parseFloat(getComputedStyle(el).marginBottom) || 0
          return {id: el.dataset['blockId']!, height: el === columns ? geometry.geometry.contentHeight : el.offsetHeight + spacing, trailingSpacing: spacing,
            lockHeight: el === columns ? geometry.geometry.contentHeight : undefined,
            breakable: el !== columns, keepWithNext: false}
        })
        const layout = stable ? createStablePaginationLayout(1, config, geometry, items, paginate(items, geometry.geometry)) : undefined
        root.classList.remove('bc-paginated')
        root.style.removeProperty('--bc-page-content-height')
        expect(columns.offsetHeight).toBeGreaterThan(geometry.geometry.contentHeight)
        const pages = await buildPaginatedPrintSurface(data, config, {
          layout, resourcePolicy: 'strict',
          render: async () => ({root, dispose: () => {renderer.destroy(); offscreen.remove()}}),
        })
        try {
          expect(pages.pageCount).toBe(2)
          const printed = pages.container.querySelector<HTMLElement>('.columns-block')!
          const content = printed.closest<HTMLElement>('.bc-print-content')!
          expect(printed.offsetHeight).toBe(geometry.geometry.contentHeight)
          expect(printed.scrollWidth).toBeLessThanOrEqual(printed.clientWidth + 1)
          expect(printed.getBoundingClientRect().bottom).toBeLessThanOrEqual(content.getBoundingClientRect().bottom + 1)
          expect(printed.querySelectorAll('.paragraph-block').length).toBe(48)
          const scroll = printed.querySelector<HTMLElement>('.column-content')!
          if (regionMode === 'none') {
            expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight)
          } else {
            expect(scroll.scrollHeight).toBeLessThanOrEqual(scroll.clientHeight + 1)
            expect(scroll.scrollWidth).toBeLessThanOrEqual(scroll.clientWidth + 1)
            const region = scroll.querySelector<HTMLElement>('.render-unit-block')!
            const body = region.querySelector<HTMLElement>('.render-unit-content')!
            expect(region.offsetHeight).toBeLessThanOrEqual(scroll.clientHeight - 8)
            expect(body.scrollHeight).toBeGreaterThan(body.clientHeight)
            expect(getComputedStyle(body).overflowY).toBe('auto')
          }
          expect(getComputedStyle(scroll).overflowY).toBe('auto')
          expect(scroll.dataset['bcPrintScrollable']).toBe('true')
        } finally {
          pages.dispose()
          fixture.destroy()
        }
      })
    })
  }
}
