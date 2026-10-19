import {expect, test, type Page} from '@playwright/test'

async function createRegion(page: Page, kind: 'paragraphs' | 'long-text' | 'nested' | 'table' | 'large-gap' | 'short-paragraphs' | 'short-text' = 'paragraphs', fixed = false, sparse = false) {
  await page.goto('/')
  const ids = await page.evaluate(async ({kind, fixed, sparse}) => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const paragraph = (text: string) => doc.schemas.createSnapshot('paragraph', [text])
    const content = Array.from({length: kind.startsWith('short-') ? 6 : 24}, (_, i) => kind.startsWith('short-') ? `短填写内容${i + 1}` : `第${i + 1}段填写内容，用于检查跨页后文字完整。`)
    const children = (kind === 'long-text' || kind === 'short-text') ? [paragraph(content.join('\n'))] : content.map(paragraph)
    const region = doc.schemas.createSnapshot('render-unit', [{tplRegion: true}, {
      p: [16, 20], border: '2px solid #333', backColor: '#eef5ff',
      ...(fixed ? {width: 480, height: 140} : {}),
    }])
    if (kind === 'nested') {
      const nested = doc.schemas.createSnapshot('render-unit', [{}, {p: [10, 12], border: '1px solid #467'}])
      nested.children = children
      region.children = [paragraph('外层填写区开头'), nested, paragraph('外层填写区结尾')]
    } else if (kind === 'table') {
      const table = doc.schemas.createSnapshot('table', [16, 2])
      table.children.forEach((row: any, i: number) => row.children.forEach((cell: any, j: number) => {
        cell.children = [paragraph(`第${i + 1}行第${j + 1}列`)]
      }))
      region.children = [paragraph('表格填写区'), table, paragraph('表格之后的填写内容')]
    } else if (kind === 'large-gap') {
      region.children = [paragraph('填写区开头'), paragraph(content.slice(0, 9).join('\n')), paragraph(content.slice(9, 18).join('\n'))]
    } else region.children = children
    const lead = paragraph(kind.startsWith('short-') ? Array(8).fill('填写区之前').join('\n') : '填写区之前')
    const after = paragraph('填写区之后')
    const editor = (window as any).ng.getComponent(document.querySelector('block-craft-editor'))
    const root = doc.schemas.createSnapshot('root', [editor.rootId, [lead, region, after]])
    ;(window as any).ng.getComponent(document.querySelector('playground-home')).ensureEditorInitialized(root)
    await doc.navigateToBlock(region.id)
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    const pagination = doc.plugins.find((p: any) => p.name === 'pagination')
    pagination.disable()
    pagination._controller?.destroy()
    pagination._controller = null
    pagination._experimentalSparseView = sparse
    pagination.updateConfig({pageSize: {width: 640, height: 400}, margins: {top: 40, right: 40, bottom: 40, left: 40}, pageGap: 24})
    pagination.enable()
    ;(window as any).__regionTest = {doc, pagination, region: region.id, after: after.id, lead: lead.id}
    return {region: region.id, first: children[0].id, last: children[children.length - 1].id}
  }, {kind, fixed, sparse})
  await page.waitForFunction(() => {
    const {pagination} = (window as any).__regionTest
    const layout = pagination.captureStableLayout()
    return !!layout
  })
  return ids
}

async function samplePixels(page: Page, points: Array<{x: number; y: number}>) {
  const screenshot = await page.screenshot({scale: 'css'})
  return page.evaluate(async ({base64, points}) => {
    const image = new Image()
    image.src = `data:image/png;base64,${base64}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')!
    context.drawImage(image, 0, 0)
    return points.map(({x, y}) => Array.from(context.getImageData(Math.floor(x), Math.floor(y), 1, 1).data))
  }, {base64: screenshot.toString('base64'), points})
}

for (const scale of [0.75, 1.25]) {
  test(`长分割区透明，${scale * 100}% 页缝透出真实纸张阴影`, async ({page}, testInfo) => {
    await page.setViewportSize({width: 1400, height: 1200})
    const ids = await createRegion(page, 'large-gap', true)
    await page.evaluate(scale => {
      const {doc, pagination} = (window as any).__regionTest
      doc.viewScale.attach(document.querySelector('.playground-scale-surface'))
      doc.viewScale.setScale(scale)
      pagination.recompute()
    }, scale)
    await expect.poll(async () => (await geometry(page)).masks).toBeGreaterThan(0)
    const points = await page.evaluate(() => {
      const {doc, region: id} = (window as any).__regionTest
      const region = doc.getBlockById(id).hostElement as HTMLElement
      const bounds = region.getBoundingClientRect()
      const mask = region.querySelector('[data-bc-region-pagination-mask]')!.getBoundingClientRect()
      const sheet = Array.from(document.querySelectorAll('.bc-page-sheet')).map(el => el.getBoundingClientRect())
        .find(rect => rect.top < mask.top && rect.bottom > mask.top)!
      const nextSheet = Array.from(document.querySelectorAll('.bc-page-sheet')).map(el => el.getBoundingClientRect())
        .find(rect => rect.top > sheet.bottom)!
      return {blank: mask.height, points: [
        {x: bounds.left + 8, y: bounds.top + 8},
        {x: bounds.left + 8, y: mask.top + 10},
        {x: bounds.left + bounds.width / 2, y: sheet.bottom + 2},
        {x: sheet.left + 12, y: sheet.bottom + 2},
        {x: bounds.left + bounds.width / 2, y: nextSheet.top - 2},
        {x: sheet.left + 12, y: nextSheet.top - 2},
        {x: bounds.left + 8, y: sheet.bottom - 10},
        {x: sheet.left + 12, y: sheet.bottom - 10},
        {x: bounds.left + 8, y: nextSheet.top + 10},
        {x: sheet.left + 12, y: nextSheet.top + 10},
      ]}
    })
    expect(points.blank).toBeGreaterThan(80 * scale)
    const [fill, blank, shadow, reference, lowerShadow, lowerReference, footer, footerReference, header, headerReference] = await samplePixels(page, points.points)
    expect(fill).not.toEqual([255, 255, 255, 255])
    expect(blank).toEqual(footerReference)
    expect(shadow).toEqual(reference)
    expect(lowerShadow).toEqual(lowerReference)
    expect(footer).toEqual(footerReference)
    expect(header).toEqual(headerReference)

    // 外伸的真实抓手仍完整绘制：与临时关闭 透明裁切 时的外侧像素相同。
    const handle = page.locator(`[data-block-id="${ids.region}"] > .render-unit-block__object-handle`)
    await page.locator(`[data-block-id="${ids.region}"] .paragraph-block`).first().hover()
    await expect(handle).toHaveCSS('opacity', '1')
    await handle.hover()
    const handlePoints = await handle.evaluate(el => {
      const r = el.getBoundingClientRect()
      const top = el.parentElement!.getBoundingClientRect().top
      return Array.from({length: 16}, (_, x) => ({x: r.left + (x + 1) * r.width / 17, y: top - 2}))
    })
    const withMask = await samplePixels(page, handlePoints)
    const original = await page.evaluate(() => {
      const {doc, region} = (window as any).__regionTest
      const style = doc.getBlockById(region).hostElement.style
      const value = style.getPropertyValue('--bc-region-pagination-clip')
      style.setProperty('--bc-region-pagination-clip', 'none')
      return value
    })
    const withoutMask = await samplePixels(page, handlePoints)
    expect(Math.max(...withMask.flatMap((pixel, i) => pixel.map((channel, j) => Math.abs(channel - withoutMask[i][j]))))).toBeLessThanOrEqual(1)
    await page.evaluate(value => {
      const {doc, region} = (window as any).__regionTest
      doc.getBlockById(region).hostElement.style.setProperty('--bc-region-pagination-clip', value)
    }, original)
    await page.mouse.move(0, 0)
    await page.screenshot({path: testInfo.outputPath('region-transparent-gap.png')})
  })
}

test('填写区透明页缝不裁切表格全屏编辑面', async ({page}) => {
  await createRegion(page, 'table')
  await expect.poll(async () => (await geometry(page)).masks).toBeGreaterThan(0)
  const region = page.locator('.render-unit-block').first()
  expect(await region.evaluate(el => getComputedStyle(el).clipPath)).not.toBe('none')
  await page.evaluate(() => {
    const {doc, region} = (window as any).__regionTest
    const table = doc.getBlockById(region).getChildrenBlocks().find((b: any) => b.flavour === 'table')
    table.setFullscreen(true)
  })
  await expect(region).toHaveCSS('clip-path', 'none')
  await page.keyboard.press('Escape')
  await expect.poll(() => region.evaluate(el => getComputedStyle(el).clipPath)).not.toBe('none')
})

async function geometry(page: Page) {
  return page.evaluate(() => {
    const {doc, pagination, region: id, after} = (window as any).__regionTest
    const layout = pagination.captureStableLayout()
    const region = doc.getBlockById(id).hostElement as HTMLElement
    const content = region.querySelector(':scope > .render-unit-content') as HTMLElement
    const masks = Array.from(region.querySelectorAll<HTMLElement>('[data-bc-region-pagination-mask]')).map(el => el.getBoundingClientRect())
    const bounds = region.getBoundingClientRect()
    const maskEdgeError = Math.max(0, ...masks.map(mask => Math.max(Math.abs(mask.left - bounds.left), Math.abs(mask.right - bounds.right))))
    const rects: DOMRect[] = []
    const walker = document.createTreeWalker(region, NodeFilter.SHOW_TEXT)
    let node: Node | null
    while ((node = walker.nextNode())) {
      if (!(node.parentElement?.closest('c-text')) || !node.textContent?.trim()) continue
      const text = node as Text
      for (let i = 0; i < text.length; i++) {
        if (/[\n\r\u200b-\u200d\ufeff]/.test(text.data[i])) continue
        const range = document.createRange()
        range.setStart(text, i)
        range.setEnd(text, i + 1)
        rects.push(...Array.from(range.getClientRects()).filter(r => r.width > .5 && r.height > 1))
      }
    }
    const intersections = rects.filter(r => masks.some(m => Math.min(r.bottom, m.bottom) - Math.max(r.top, m.top) > 1)).length
    const fragments = layout.result.pages.flatMap((p: any) => p.slots.filter((s: any) => s.id === id).map((s: any) => ({page: p.index, fragment: s.fragment})))
    const expectedAfterPage = layout.result.byBlock.get(after)?.pageIndex
    const afterRect = doc.getBlockById(after).hostElement.getBoundingClientRect()
    return {
      fragments, masks: masks.length, intersections, rects: rects.length, maskEdgeError,
      scrollHeight: content.scrollHeight, contentHeight: content.clientHeight,
      overflow: getComputedStyle(content).overflowY,
      afterPage: Array.from(document.querySelectorAll('.bc-page-sheet')).findIndex(sheet => {const r = sheet.getBoundingClientRect(); return afterRect.top >= r.top && afterRect.top < r.bottom}), expectedAfterPage,
      height: region.offsetHeight, styleHeight: region.style.height,
      scale: region.getBoundingClientRect().width / region.offsetWidth,
    }
  })
}

for (const kind of ['paragraphs', 'long-text', 'nested', 'table'] as const) {
  test(`${kind} 填写区跨页，正文不被页缝遮住且后续块位置正确`, async ({page}) => {
    await createRegion(page, kind)
    await expect.poll(async () => (await geometry(page)).masks).toBeGreaterThan(0)
    const state = await geometry(page)
    expect(state.fragments.length).toBeGreaterThan(1)
    expect(state.intersections).toBe(0)
    expect(state.maskEdgeError).toBeLessThan(0.1)
    expect(state.rects).toBeGreaterThan(100)
    expect(state.afterPage).toBe(state.expectedAfterPage)
    expect(state.overflow).toBe('visible')
    expect(state.scrollHeight).toBeLessThanOrEqual(state.contentHeight + 1)
  })
}

test('固定高度分页展开，续页真实点击输入与撤销，关闭分页恢复固定尺寸', async ({page}) => {
  const ids = await createRegion(page, 'paragraphs', true)
  await expect.poll(async () => (await geometry(page)).masks).toBeGreaterThan(0)
  const before = await geometry(page)
  expect(before.height).toBeGreaterThan(400)
  expect(before.styleHeight).toBe('140px')
  const last = page.locator(`[data-block-id="${ids.last}"]`)
  await page.evaluate(() => {const {doc} = (window as any).__regionTest; doc.crud.undoManager.stopCapturing(); doc.crud.undoManager.clearHistory()})
  await last.click()
  await page.keyboard.press('End')
  await page.keyboard.insertText('续页输入验证')
  await expect(last).toContainText('续页输入验证')
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
  await expect(last).not.toContainText('续页输入验证')
  expect((await geometry(page)).intersections).toBe(0)
  await page.evaluate(() => (window as any).__regionTest.pagination.disable())
  const region = page.locator(`[data-block-id="${ids.region}"]`)
  await expect.poll(() => region.evaluate(el => (el as HTMLElement).offsetHeight)).toBe(140)
  expect(await region.locator('[data-bc-region-pagination-mask], [data-bc-region-pagination-spacer], [data-bc-inline-pagination-gap]').count()).toBe(0)
})

for (const {scale, sparse} of [{scale: 0.75, sparse: false}, {scale: 1.25, sparse: true}]) {
  test(`长文本在 ${scale * 100}% 缩放及 ${sparse ? '稀疏' : '完整'}布局下续页编辑`, async ({page}, testInfo) => {
    await page.setViewportSize({width: 1200, height: 1000})
    const ids = await createRegion(page, 'long-text', true, sparse)
    await page.evaluate(scale => {
      const {doc, pagination} = (window as any).__regionTest
      doc.viewScale.attach(document.querySelector('.playground-scale-surface'))
      doc.viewScale.setScale(scale)
      pagination.recompute()
      doc.crud.undoManager.stopCapturing()
      doc.crud.undoManager.clearHistory()
    }, scale)
    await expect.poll(async () => (await geometry(page)).masks).toBeGreaterThan(0)
    await expect.poll(async () => (await geometry(page)).intersections).toBe(0)
    expect((await geometry(page)).scale).toBeCloseTo(scale, 2)
    expect((await geometry(page)).maskEdgeError).toBeLessThan(0.1)
    await page.screenshot({path: testInfo.outputPath('region-pagination.png')})
    const last = page.locator(`[data-block-id="${ids.last}"]`)
    await last.locator('c-text').last().click()
    await page.keyboard.press('End')
    await page.keyboard.insertText('长文本续页验证')
    await expect(last).toContainText('长文本续页验证')
    await expect.poll(async () => (await geometry(page)).intersections).toBe(0)
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
    await expect(last).not.toContainText('长文本续页验证')
    await expect.poll(async () => (await geometry(page)).intersections).toBe(0)
    const state = await geometry(page)
    expect(state.afterPage).toBe(state.expectedAfterPage)
  })
}

for (const kind of ['short-paragraphs', 'short-text'] as const) {
  test(`${kind} 不足一页的填写区优先拆分利用当前页，固定高度不影响规则`, async ({page}) => {
    const ids = await createRegion(page, kind, true)
    await expect.poll(async () => (await geometry(page)).fragments.length).toBe(2)
    const state = await geometry(page)
    const leadPage = await page.evaluate(() => {
      const {pagination, lead} = (window as any).__regionTest
      return pagination.captureStableLayout().result.byBlock.get(lead).pageIndex
    })
    expect(state.fragments.map(fragment => fragment.page)).toEqual([leadPage, leadPage + 1])
    expect(state.intersections).toBe(0)
    expect(state.afterPage).toBe(state.expectedAfterPage)
    expect(await page.evaluate(() => {
      const {pagination, region} = (window as any).__regionTest
      const layout = pagination.captureStableLayout()
      return layout.items.find((item: any) => item.id === region).height <= layout.geometry.geometry.contentHeight
    })).toBe(true)
    const last = page.locator(`[data-block-id="${ids.last}"]`)
    await last.locator('c-text').last().click()
    await page.keyboard.press('End')
    await page.keyboard.insertText('短填写区续页输入')
    await expect(last).toContainText('短填写区续页输入')
  })
}
