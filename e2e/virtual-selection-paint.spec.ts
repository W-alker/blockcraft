import {expect, test, type Page} from '@playwright/test'

async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    for (let i = 0; i < 12; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  })
}

async function openFixture(page: Page, readonly = false): Promise<void> {
  await page.setViewportSize({width: 1100, height: 850})
  await page.route('**/*', route => /^(localhost|127\.0\.0\.1)$/.test(new URL(route.request().url()).hostname)
    ? route.continue() : route.abort())
  await page.goto('/', {waitUntil: 'domcontentloaded'})
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  await page.evaluate(readonly => {
    const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const viewport = document.createElement('div')
    viewport.id = 'selection-paint-fixture'
    viewport.style.cssText = 'position:fixed;inset:30px;width:850px;height:740px;overflow:auto;background:white;z-index:99999'
    const mount = document.createElement('div')
    viewport.appendChild(mount)
    document.body.appendChild(viewport)
    // A deterministic native highlight color makes actual paint testable across
    // engines, without snapshotting platform fonts or simulating block fills.
    const style = document.createElement('style')
    style.textContent = '#selection-paint-fixture ::selection {background:rgb(70,130,240) !important;color:black !important}'
    viewport.appendChild(style)
    const sourcePagination = source.plugins.find((plugin: any) => plugin.name === 'pagination')
    const pagination = new sourcePagination.constructor({
      enabled: false, experimentalSparseView: true, pageSize: 'A4',
      margins: {top: 72, right: 72, bottom: 72, left: 72},
    })
    const paragraphs = Array.from({length: 100}, (_, index) => source.schemas.createSnapshot('paragraph', [
      [{insert: `Paragraph ${index + 1} selected content; scrolling should preserve this highlight.`}],
    ]))
    const snapshot = source.schemas.createSnapshot('root', ['selection-paint-root', paragraphs])
    const doc = new source.constructor({
      ...source.config, yDoc: new source.yDoc.constructor(), docId: snapshot.id,
      plugins: [pagination], scrollContainer: viewport, readonly,
      virtualization: {enabled: true, overscanViewports: 1, segmentMergeGap: 2, retainedViewLimit: 12, estimatedHeights: {paragraph: 40}},
    })
    ;(window as any).selectionPaintFixture = {doc, paragraphs, viewport}
    doc.initBySnapshot(snapshot, mount)
    pagination.enable()
  }, readonly)
  await settle(page)
}

async function highlightedFraction(page: Page, id: string): Promise<number> {
  const box = await page.locator(`#selection-paint-fixture [data-block-id="${id}"]`).boundingBox()
  expect(box).not.toBeNull()
  // page.screenshot does not scroll/focus the block or repair its selection.
  const png = await page.screenshot({clip: box!})
  return page.evaluate(async base64 => {
    const image = new Image()
    image.src = `data:image/png;base64,${base64}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')!
    context.drawImage(image, 0, 0)
    const {data} = context.getImageData(0, 0, image.width, image.height)
    let blue = 0
    for (let i = 0; i < data.length; i += 4) {
      if (Math.abs(data[i] - 70) < 5 && Math.abs(data[i + 1] - 130) < 5 && Math.abs(data[i + 2] - 240) < 5) blue++
    }
    return blue / (image.width * image.height)
  }, png.toString('base64'))
}

for (const variant of ['forward', 'backward', 'readonly'] as const) {
  test(`virtual remount repaints intermediate native selection (${variant})`, async ({page}) => {
    await openFixture(page, variant === 'readonly')
    const initial = await page.evaluate(async backward => {
      const {doc, paragraphs, viewport} = (window as any).selectionPaintFixture
      await doc.navigateToBlock(paragraphs[70].id)
      const start = {type: 'text', blockId: paragraphs[0].id, offset: 4}
      const end = {type: 'text', blockId: paragraphs[70].id, offset: 15}
      doc.selection.replay({anchor: backward ? end : start, head: backward ? start : end, commonParent: doc.root.id})
      viewport.scrollTop = 0
      return {model: doc.selection.value.toJSON(), middleId: paragraphs[2].id}
    }, variant === 'backward')
    await settle(page)
    expect(await highlightedFraction(page, initial.middleId)).toBeGreaterThan(0.2)
    for (let trip = 0; trip < 2; trip++) {
      await page.evaluate(() => {
        const {viewport} = (window as any).selectionPaintFixture
        viewport.scrollTop = viewport.scrollHeight - 1000
      })
      await settle(page)
      await expect(page.locator(`[data-block-id="${initial.middleId}"]`)).toHaveCount(0)
      await page.evaluate(() => { (window as any).selectionPaintFixture.viewport.scrollTop = 0 })
      await settle(page)
      expect(await highlightedFraction(page, initial.middleId)).toBeGreaterThan(0.2)
      const state = await page.evaluate(() => {
        const {doc, viewport} = (window as any).selectionPaintFixture
        const native = getSelection()!
        return {
          model: doc.selection.value.toJSON(), mounted: doc.vm.getMountedRootChildIds().length,
          top: viewport.scrollTop, anchorOffset: native.anchorOffset, headOffset: native.focusOffset,
          anchorId: native.anchorNode?.parentElement?.closest('[data-block-id]')?.getAttribute('data-block-id'),
          headId: native.focusNode?.parentElement?.closest('[data-block-id]')?.getAttribute('data-block-id'),
        }
      })
      expect(state.model).toEqual(initial.model)
      expect(state.mounted).toBeLessThan(80)
      expect(state.top).toBe(0)
      expect(state.anchorId).toBe(initial.model.anchor.blockId)
      expect(state.headId).toBe(initial.model.head.blockId)
      expect(state.anchorOffset).toBe(initial.model.anchor.offset)
      expect(state.headOffset).toBe(initial.model.head.offset)
    }
    await page.evaluate(() => {
      const {doc, paragraphs} = (window as any).selectionPaintFixture
      const point = {type: 'text', blockId: paragraphs[0].id, offset: 2}
      doc.selection.replay({anchor: point, head: point, commonParent: paragraphs[0].id})
    })
    await settle(page)
    expect(await highlightedFraction(page, initial.middleId)).toBe(0)
  })
}

test('full-document selection skips placement planes and preserves actual object chrome', async ({page}) => {
  await openFixture(page)
  const ids = await page.evaluate(() => {
    const {doc} = (window as any).selectionPaintFixture
    const rect = doc.root.hostElement.getBoundingClientRect()
    const shapeId = doc.placement.insertAbsoluteSnapshot(doc.schemas.createSnapshot('shape', ['rectangle']), {
      anchorRect: new DOMRect(rect.left + 80, rect.top + 130, 180, 100), layer: 'over',
    })
    const wordArtId = doc.placement.insertAbsoluteSnapshot(doc.schemas.createSnapshot('word-art', ['Selection']), {
      anchorRect: new DOMRect(rect.left + 300, rect.top + 150, 220, 90), layer: 'over',
    })
    return {shapeId, wordArtId}
  })
  await settle(page)
  await page.evaluate(() => {
    const {doc} = (window as any).selectionPaintFixture
    doc.selection.selectAllChildren(doc.root)
  })
  await settle(page)
  const planes = page.locator('#selection-paint-fixture .placement-layout-block')
  expect(await planes.count()).toBeGreaterThan(0)
  for (const plane of await planes.all()) {
    await expect(plane).not.toHaveClass(/\bselected\b|\bfocused\b/)
    expect(await plane.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
  }
  await expect(page.locator(`[data-block-id="${ids.shapeId}"]`)).toHaveClass(/\bselected\b/)
  await expect(page.locator(`[data-block-id="${ids.wordArtId}"]`)).toHaveClass(/\bfocused\b/)
  await page.evaluate(() => (window as any).selectionPaintFixture.doc.selection.blur())
  await expect(page.locator(`[data-block-id="${ids.shapeId}"]`)).not.toHaveClass(/\bselected\b/)
  await expect(page.locator(`[data-block-id="${ids.wordArtId}"]`)).not.toHaveClass(/\bfocused\b/)
})
