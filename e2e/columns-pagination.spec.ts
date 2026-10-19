import {expect, test, type Page} from '@playwright/test'

async function setup(page: Page, lines = 24, regionMode?: 'natural' | 'fixed' | 'multiple') {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  return page.evaluate(({lines, regionMode}) => {
    const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const columns = source.schemas.createSnapshot('columns', [2])
    columns.children.forEach((column: any, i: number) => {
      column.children = [source.schemas.createSnapshot('paragraph', [Array(lines).fill(`第${i + 1}栏正文不能占用页脚区域`).join('\n')])]
    })
    if (regionMode) {
      for (const column of columns.children) {
        const region = source.schemas.createSnapshot('render-unit', [{tplRegion: true},
          regionMode === 'fixed' ? {width: 600, height: 900} : {}])
        region.children = column.children
        column.children = [region]
        if (regionMode === 'multiple') {
          const second = source.schemas.createSnapshot('render-unit', [{tplRegion: true}, {}])
          second.children = [source.schemas.createSnapshot('paragraph', [Array(lines).fill('第二个填写区').join('\n')])]
          column.children.push(second)
        }
      }
    }
    const after = source.schemas.createSnapshot('paragraph', ['分栏之后'])
    const viewport = document.createElement('div')
    viewport.style.cssText = 'position:fixed;left:20px;top:30px;width:950px;height:650px;overflow:auto;background:white;z-index:10'
    const mount = document.createElement('div')
    viewport.appendChild(mount)
    document.body.appendChild(viewport)
    const snapshot = source.schemas.createSnapshot('root', ['columns-pagination', [columns, after]])
    const plugin = source.plugins.find((p: any) => p.name === 'pagination')
    const pagination = new plugin.constructor({enabled: true, pageSize: {width: 640, height: 480}, margins: {top: 40, right: 40, bottom: 40, left: 40}, footer: {center: '页脚 {page}', height: 24, distance: 40}})
    const doc = new source.constructor({...source.config, yDoc: new source.yDoc.constructor(), docId: snapshot.id, plugins: [pagination], scrollContainer: viewport, readonly: false, virtualization: {enabled: false}})
    doc.initBySnapshot(snapshot, mount)
    ;(window as any).__columnsPagination = {doc, pagination, viewport, id: columns.id, after: after.id}
    return {columns: columns.id, paragraph: (regionMode ? columns.children[0].children[0].children[0] : columns.children[0].children[0]).id}
  }, {lines, regionMode})
}

async function geometry(page: Page) {
  return page.evaluate(() => {
    const {doc, pagination, id, after, viewport} = (window as any).__columnsPagination
    const layout = pagination.captureStableLayout()
    if (!layout) return null
    const host = doc.getBlockById(id).hostElement as HTMLElement
    const rect = host.getBoundingClientRect()
    const scale = rect.height / host.offsetHeight
    const pageIndex = layout.result.byBlock.get(id).pageIndex
    const sheet = viewport.querySelectorAll('.bc-page-sheet')[pageIndex].getBoundingClientRect()
    return {
      height: rect.height / scale, capacity: layout.geometry.geometry.contentHeight,
      bottom: (rect.bottom - sheet.top) / scale,
      bodyBottom: layout.geometry.sheetHeightPx - layout.geometry.contentBottom,
      afterPage: layout.result.byBlock.get(after)?.pageIndex,
      pageIndex,
      content: Array.from(host.querySelectorAll<HTMLElement>('.column-content')).map(el => ({
        height: el.clientHeight, scrollHeight: el.scrollHeight, overflow: getComputedStyle(el).overflowY,
      })),
      hostOverflow: getComputedStyle(host).overflowY,
    }
  })
}

for (const scale of [.75, 1, 1.25]) {
  test(`${scale * 100}% 超高分栏不侵入页脚，列内滚动可编辑且抓手可命中`, async ({page}, testInfo) => {
    const ids = await setup(page)
    await page.waitForFunction(() => !!(window as any).__columnsPagination.pagination.captureStableLayout())
    await page.evaluate(scale => {
      const {doc, pagination} = (window as any).__columnsPagination
      doc.viewScale.attach(doc.root.hostElement.parentElement)
      doc.viewScale.setScale(scale)
      pagination.recompute()
      doc.crud.undoManager.stopCapturing()
      doc.crud.undoManager.clearHistory()
    }, scale)
    await expect.poll(async () => {const g = await geometry(page); return g && g.bottom <= g.bodyBottom + 1}).toBe(true)
    const state = (await geometry(page))!
    expect(state.height).toBeCloseTo(state.capacity, 0)
    expect(state.afterPage).toBe(state.pageIndex + 1)
    expect(state.hostOverflow).toBe('visible')
    expect(state.content.every(c => c.overflow === 'auto' && c.scrollHeight > c.height + 100)).toBe(true)
    const host = page.locator(`[data-block-id="${ids.columns}"]`)
    const column = host.locator('.column-block').first()
    await column.hover()
    const handle = column.getByRole('button', {name: '拖动子栏'})
    await expect(handle).toHaveCSS('opacity', '1')
    expect(await handle.evaluate(el => {const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))})).toBe(true)
    const content = column.locator('.column-content')
    await content.evaluate(el => {el.scrollTop = el.scrollHeight})
    expect(await content.evaluate(el => el.scrollTop)).toBeGreaterThan(100)
    await page.locator(`[data-block-id="${ids.paragraph}"] c-text`).last().click()
    await page.keyboard.press('End')
    await page.keyboard.insertText('底部仍可输入')
    await expect(column).toContainText('底部仍可输入')
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
    await expect(column).not.toContainText('底部仍可输入')
    await expect.poll(async () => {const g = await geometry(page); return g && g.bottom <= g.bodyBottom + 1}).toBe(true)
    await page.screenshot({path: testInfo.outputPath('columns-footer.png')})
    await page.evaluate(() => (window as any).__columnsPagination.pagination.disable())
    await expect.poll(() => host.evaluate(el => (el as HTMLElement).offsetHeight)).toBeGreaterThan(state.capacity)
    await expect(content).toHaveCSS('overflow-y', 'visible')
  })
}

test('短分栏自然高度不变，正文容量随页眉页脚和纸张变化', async ({page}) => {
  const ids = await setup(page, 2)
  await page.waitForFunction(() => !!(window as any).__columnsPagination.pagination.captureStableLayout())
  const initial = (await geometry(page))!
  expect(initial.height).toBeLessThan(initial.capacity / 2)
  expect(initial.afterPage).toBe(initial.pageIndex)
  expect(initial.content.every(c => c.scrollHeight <= c.height + 1 && c.overflow === 'visible')).toBe(true)
  await page.evaluate(id => {
    const {doc} = (window as any).__columnsPagination
    for (const column of doc.getBlockById(id).getChildrenBlocks()) {
      const paragraph = column.firstChildren
      paragraph.replaceText(0, paragraph.textLength, Array(32).fill('增加内容').join('\n'))
    }
  }, ids.columns)
  await expect.poll(async () => {const g = await geometry(page); return g && Math.abs(g.height - g.capacity) < 1}).toBe(true)
  await page.evaluate(() => (window as any).__columnsPagination.pagination.updateConfig({
    pageSize: {width: 640, height: 420},
    header: {center: '页眉', distance: 30, height: 36},
    footer: {center: '页脚', distance: 20, height: 48},
  }))
  await expect.poll(async () => {const g = await geometry(page); return g && {capacity: g.capacity, height: g.height, bottom: g.bottom, bodyBottom: g.bodyBottom}}).toEqual({capacity: 286, height: 286, bottom: 352, bodyBottom: 352})
  await page.evaluate(id => {
    const {doc} = (window as any).__columnsPagination
    for (const column of doc.getBlockById(id).getChildrenBlocks()) {
      const paragraph = column.firstChildren
      paragraph.replaceText(0, paragraph.textLength, '缩短内容')
    }
  }, ids.columns)
  await expect.poll(async () => (await geometry(page))?.height).toBeLessThan(initial.height)
})

for (const regionMode of ['natural', 'fixed'] as const) {
  test(`${regionMode}: 填写区按栏内可用空间限高，只在填写区内滚动`, async ({page}, testInfo) => {
    const ids = await setup(page, 24, regionMode)
    const host = page.locator(`[data-block-id="${ids.columns}"]`)
    const column = host.locator('.column-content').first()
    const region = column.locator(':scope > .render-unit-block')
    const content = region.locator(':scope > .render-unit-content')
    await page.waitForFunction(() => !!(window as any).__columnsPagination.pagination.captureStableLayout())
    const regionProps = await region.evaluate(el => ({...(window as any).__columnsPagination.doc.getBlockById((el as HTMLElement).dataset['blockId']).props}))
    const fits = () => column.evaluate(el => {
      const host = el.closest<HTMLElement>('.columns-block')!
      const region = el.querySelector<HTMLElement>(':scope > .render-unit-block')!
      const style = getComputedStyle(el)
      return host.scrollWidth <= host.clientWidth + 1
        && el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1
        && region.offsetHeight <= el.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) + 1
    })
    await expect.poll(fits).toBe(true)
    expect(await content.evaluate(el => el.scrollHeight - el.clientHeight)).toBeGreaterThan(100)
    // 改变父容器内边距及页面容量，不能依赖写死的像素补偿。
    await host.evaluate(el => {
      (el as HTMLElement).style.paddingBlock = '17px'
      el.querySelectorAll<HTMLElement>('.column-content').forEach(column => column.style.paddingBlock = '11px')
    })
    await page.evaluate(() => {
      const {doc, pagination} = (window as any).__columnsPagination
      doc.viewScale.attach(doc.root.hostElement.parentElement)
      doc.viewScale.setScale(1.25)
      pagination.updateConfig({pageSize: {width: 640, height: 420}})
      doc.crud.undoManager.stopCapturing()
      doc.crud.undoManager.clearHistory()
    })
    await expect.poll(fits).toBe(true)
    await content.hover()
    await page.mouse.wheel(0, 500)
    await expect.poll(() => content.evaluate(el => el.scrollTop)).toBeGreaterThan(100)
    expect(await column.evaluate(el => el.scrollTop)).toBe(0)
    await page.locator(`[data-block-id="${ids.paragraph}"] c-text`).last().click()
    await page.keyboard.press('End')
    await page.keyboard.insertText('填写区底部输入')
    await expect(content).toContainText('填写区底部输入')
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
    await expect(content).not.toContainText('填写区底部输入')
    await expect.poll(fits).toBe(true)
    expect(await region.evaluate(el => ({...(window as any).__columnsPagination.doc.getBlockById((el as HTMLElement).dataset['blockId']).props}))).toEqual(regionProps)
    await page.screenshot({path: testInfo.outputPath('region-single-scroll.png')})
    if (regionMode === 'natural') {
      await page.evaluate(() => {
        const {doc, id} = (window as any).__columnsPagination
        for (const column of doc.getBlockById(id).getChildrenBlocks()) {
          const paragraph = column.firstChildren.firstChildren
          paragraph.replaceText(0, paragraph.textLength, '缩短内容')
        }
      })
      await expect.poll(() => host.evaluate(el => (el as HTMLElement).offsetHeight)).toBeLessThan(150)
      await expect.poll(fits).toBe(true)
    }
    await page.evaluate(() => (window as any).__columnsPagination.pagination.disable())
    await expect(column).toHaveCSS('overflow-y', 'visible')
    if (regionMode === 'fixed') await expect(region).toHaveCSS('height', '900px')
  })
}

test('多个填写区累计超高时保留分栏滚动，各填写区不挤压', async ({page}) => {
  const ids = await setup(page, 24, 'multiple')
  await page.waitForFunction(() => !!(window as any).__columnsPagination.pagination.captureStableLayout())
  const column = page.locator(`[data-block-id="${ids.columns}"] .column-content`).first()
  expect(await column.evaluate(el => el.scrollHeight - el.clientHeight)).toBeGreaterThan(200)
  const heights = await column.locator(':scope > .render-unit-block').evaluateAll(els => els.map(el => (el as HTMLElement).offsetHeight))
  expect(heights[0]).toBeGreaterThan(300)
  expect(heights[1]).toBeGreaterThan(300)
  await column.evaluate(el => {el.scrollTop = el.scrollHeight})
  expect(await column.evaluate(el => el.scrollTop)).toBeGreaterThan(100)
})
