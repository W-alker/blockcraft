import {expect, test, type Page} from '@playwright/test'

async function createCallout(page: Page, kind: 'short' | 'paragraphs' | 'long-text', sparse = false) {
  await page.goto('/')
  const ids = await page.evaluate(async ({kind, sparse}) => {
    const editor = (window as any).ng.getComponent(document.querySelector('block-craft-editor'))
    const doc = editor.doc
    const paragraph = (text: string) => doc.schemas.createSnapshot('paragraph', [text])
    const content = Array.from({length: kind === 'short' ? 5 : 24}, (_, i) => `第${i + 1}段高亮内容，检查跨页完整性。`)
    const children = kind === 'long-text' ? [paragraph(content.join('\n'))] : content.map(paragraph)
    const callout = doc.schemas.createSnapshot('callout', [])
    callout.children = children
    const lead = paragraph(Array.from({length: 5}, (_, i) => `前文第${i + 1}行`).join('\n'))
    const after = paragraph('高亮块之后')
    const root = doc.schemas.createSnapshot('root', [editor.rootId, [lead, callout, after]])
    ;(window as any).ng.getComponent(document.querySelector('playground-home')).ensureEditorInitialized(root)
    await doc.navigateToBlock(callout.id)
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    const pagination = doc.plugins.find((p: any) => p.name === 'pagination')
    pagination.disable()
    pagination._controller?.destroy()
    pagination._controller = null
    pagination._experimentalSparseView = sparse
    pagination.updateConfig({pageSize: {width: 640, height: 400}, margins: {top: 40, right: 40, bottom: 40, left: 40}, pageGap: 24})
    pagination.enable()
    ;(window as any).__calloutTest = {doc, pagination, id: callout.id, lead: lead.id, after: after.id}
    return {callout: callout.id, last: children[children.length - 1].id}
  }, {kind, sparse})
  await page.waitForFunction(() => !!(window as any).__calloutTest.pagination.captureStableLayout())
  return ids
}

async function geometry(page: Page) {
  return page.evaluate(() => {
    const {doc, pagination, id, lead, after} = (window as any).__calloutTest
    const layout = pagination.captureStableLayout()
    if (!layout) return null
    const host = doc.getBlockById(id).hostElement as HTMLElement
    const masks = Array.from(host.querySelectorAll('[data-bc-region-pagination-mask]')).map(el => el.getBoundingClientRect())
    const rects: DOMRect[] = []
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT)
    let node: Node | null
    while ((node = walker.nextNode())) {
      if (!node.parentElement?.closest('c-text') || !node.textContent?.trim()) continue
      const text = node as Text
      for (let i = 0; i < text.length; i++) {
        if (/[\n\r\u200b-\u200d\ufeff]/.test(text.data[i])) continue
        const range = document.createRange()
        range.setStart(text, i)
        range.setEnd(text, i + 1)
        rects.push(...Array.from(range.getClientRects()).filter(r => r.width > .5 && r.height > 1))
      }
    }
    const afterRect = doc.getBlockById(after).hostElement.getBoundingClientRect()
    return {
      fragments: layout.result.pages.flatMap((p: any) => p.slots.filter((s: any) => s.id === id).map((s: any) => ({page: p.index, fragment: s.fragment}))),
      leadPage: layout.result.byBlock.get(lead)?.pageIndex,
      masks: masks.length, rects: rects.length,
      intersections: rects.filter(r => masks.some(m => Math.min(r.bottom, m.bottom) - Math.max(r.top, m.top) > 1)).length,
      afterPage: Array.from(document.querySelectorAll('.bc-page-sheet')).findIndex(sheet => {const r = sheet.getBoundingClientRect(); return afterRect.top >= r.top && afterRect.top < r.bottom}),
      expectedAfterPage: layout.result.byBlock.get(after)?.pageIndex,
      prefix: host.querySelector('.callout-block-prefix')?.textContent?.trim(),
      clip: getComputedStyle(host).clipPath,
    }
  })
}

test('不超过一页的高亮块整体下移；容量足够时保留在当前页', async ({page}) => {
  await createCallout(page, 'short')
  const state = (await geometry(page))!
  expect(state.fragments).toHaveLength(1)
  expect(state.fragments[0].fragment).toBeUndefined()
  expect(state.fragments[0].page).toBeGreaterThan(state.leadPage)
  expect(state.masks).toBe(0)
  await page.evaluate(() => (window as any).__calloutTest.pagination.updateConfig({pageSize: {width: 640, height: 1000}}))
  await expect.poll(async () => {const s = await geometry(page); return s && s.fragments[0].page === s.leadPage}).toBe(true)
})

for (const kind of ['paragraphs', 'long-text'] as const) {
  test(`${kind} 超页高亮块先下移再拆分，文字与后续块位置正确`, async ({page}) => {
    await createCallout(page, kind)
    await expect.poll(async () => (await geometry(page))?.masks).toBeGreaterThan(0)
    const state = (await geometry(page))!
    expect(state.fragments.length).toBeGreaterThan(1)
    expect(state.fragments[0].page).toBeGreaterThan(state.leadPage)
    expect(state.intersections).toBe(0)
    expect(state.rects).toBeGreaterThan(100)
    expect(state.afterPage).toBe(state.expectedAfterPage)
    expect(state.prefix).toBe('📢')
    expect(state.clip).not.toBe('none')
  })
}

for (const {scale, sparse} of [{scale: .75, sparse: false}, {scale: 1.25, sparse: true}]) {
  test(`${scale * 100}% ${sparse ? '稀疏' : '完整'}布局续页输入、撤销和关闭分页`, async ({page}, testInfo) => {
    await page.setViewportSize({width: 1900, height: 1200})
    const ids = await createCallout(page, 'paragraphs', sparse)
    await page.evaluate(scale => {
      const {doc, pagination} = (window as any).__calloutTest
      doc.viewScale.attach(document.querySelector('.playground-scale-surface'))
      doc.viewScale.setScale(scale)
      pagination.recompute()
      doc.crud.undoManager.stopCapturing()
      doc.crud.undoManager.clearHistory()
    }, scale)
    await expect.poll(async () => (await geometry(page))?.masks).toBeGreaterThan(0)
    const last = page.locator(`[data-block-id="${ids.last}"]`)
    await last.click()
    await page.keyboard.press('End')
    await page.keyboard.insertText('续页输入验证')
    await expect(last).toContainText('续页输入验证')
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
    await expect(last).not.toContainText('续页输入验证')
    await expect.poll(async () => (await geometry(page))?.intersections).toBe(0)
    const host = page.locator(`[data-block-id="${ids.callout}"]`)
    const mask = host.locator('[data-bc-region-pagination-mask]').first()
    await expect(() => mask.scrollIntoViewIfNeeded()).toPass({timeout: 10000})
    const points = await mask.evaluate(el => {
      const m = el.getBoundingClientRect()
      const host = el.parentElement!.getBoundingClientRect()
      const sheets = Array.from(document.querySelectorAll('.bc-page-sheet')).map(s => s.getBoundingClientRect())
      const sheet = sheets.find(s => s.top < m.top && s.bottom > m.top)!
      const next = sheets.find(s => s.top > sheet.bottom)!
      return [sheet.bottom - 10, sheet.bottom + 2, next.top - 2, next.top + 10].flatMap(y => [
        {x: host.left + host.width / 2, y}, {x: sheet.left + 12, y},
      ])
    })
    const screenshot = await page.screenshot({path: testInfo.outputPath('callout-transparent-pagination.png'), scale: 'css'})
    const pixels = await page.evaluate(async ({base64, points}) => {
      const image = new Image()
      image.src = `data:image/png;base64,${base64}`
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.width; canvas.height = image.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(image, 0, 0)
      return points.map(p => Array.from(ctx.getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data))
    }, {base64: screenshot.toString('base64'), points})
    for (let i = 0; i < pixels.length; i += 2) expect(pixels[i]).toEqual(pixels[i + 1])
    await page.evaluate(() => (window as any).__calloutTest.pagination.disable())
    await expect(host).not.toHaveAttribute('data-bc-region-pagination-flow', '')
    await expect(host).toHaveCSS('clip-path', 'none')
    expect(await host.locator('[data-bc-region-pagination-mask], [data-bc-region-pagination-spacer]').count()).toBe(0)
    await expect(host.locator('.callout-block-prefix')).toHaveText('📢')
  })
}
