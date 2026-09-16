import {expect, test, type Page} from '@playwright/test'

const runtimeErrors = new WeakMap<Page, string[]>()
test.beforeEach(({page}) => {
  const errors: string[] = []
  runtimeErrors.set(page, errors)
  page.on('pageerror', error => errors.push(error.message))
})
test.afterEach(({page}) => expect(runtimeErrors.get(page)).toEqual([]))

async function setup(page: Page) {
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => {
    const element = document.querySelector('block-craft-editor')
    return !!element && !!(window as any).ng?.getComponent(element)?.doc?.isInitialized
  })
  return page.evaluate(async () => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    ;(window as any).__placementDoc = doc
    doc.crud.deleteBlocks(doc.rootId, 0, doc.model.getChildrenIds(doc.rootId).length)
    const shape = doc.schemas.createSnapshot('shape', ['rectangle'])
    shape.props = {...shape.props, width: 140, height: 100}
    const id = doc.placement.insertAbsoluteSnapshot(shape, {anchorRect: null})
    doc.crud.updateBlockProps(id, {position: "80 2400"})
    const paragraph = doc.schemas.createSnapshot('paragraph', [[{insert: '对象应当被纸面承载，正文保持在原位。'}]])
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [paragraph])
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    return {id, paragraphId: paragraph.id}
  })
}

async function paginate(page: Page, sparse: boolean) {
  await page.evaluate(sparse => {
    const doc = (window as any).__placementDoc
    const plugin = doc.plugins.find((item: any) => item.name === 'pagination')
    plugin.disable()
    plugin._controller?.destroy()
    plugin._controller = null
    plugin._experimentalSparseView = sparse
    plugin.updateConfig({pageSize: {width: 600, height: 400},
      margins: {top: 40, right: 40, bottom: 40, left: 40}, pageGap: 30,
      experimentalSparseView: sparse})
    plugin.enable()
    plugin.recompute()
    ;(window as any).__placementPagination = plugin
  }, sparse)
}

async function pageGap(page: Page) {
  return page.evaluate(() => {
    const g = (window as any).__placementPagination._controller._geom
    const origin = g.contentTop + g.geometry.contentHeight - (g.geometry.firstPageContentHeight ?? g.geometry.contentHeight)
    return {gapY: g.sheetHeightPx - origin + 5, snapY: g.sheetHeightPx + g.pageGap - origin}
  })
}

async function coveredByExtent(page: Page, id: string) {
  return page.evaluate(id => {
    const doc = (window as any).__placementDoc
    const block = doc.getBlockById(id)
    const rect = block.hostElement.getBoundingClientRect()
    return Math.max(...[...document.querySelectorAll('.bc-page-sheet')].map(sheet => sheet.getBoundingClientRect().bottom)) >= rect.bottom - 1
  }, id)
}

test('flow extent grows and shrinks without moving text or rewriting object coordinates', async ({page}) => {
  const {id, paragraphId} = await setup(page)
  await page.evaluate(ids => (window as any).__placementDoc.virtualization.acquireBlockViewLease(ids), [id, paragraphId])
  const state = () => page.evaluate(({id, paragraphId}) => {
    const doc = (window as any).__placementDoc
    const root = doc.root.hostElement.getBoundingClientRect()
    const block = doc.getBlockById(id).hostElement.getBoundingClientRect()
    const text = doc.getBlockById(paragraphId).hostElement.getBoundingClientRect()
    return {contained: root.bottom >= block.bottom, height: root.height, textY: text.top - root.top}
  }, {id, paragraphId})
  await expect.poll(async () => (await state()).contained).toBe(true)
  const initial = await state()
  await page.evaluate(id => (window as any).__placementDoc.crud.updateBlockProps(id, {position: "80 100"}), id)
  await expect.poll(async () => (await state()).height).toBeLessThan(initial.height - 1000)
  expect((await state()).textY).toBeCloseTo(initial.textY, 0)
})

for (const sparse of [false, true]) {
  test(`pagination carries tail objects and gap objects, then returns to flow (${sparse ? 'sparse' : 'full'})`, async ({page}) => {
    const {id} = await setup(page)
    await paginate(page, sparse)
    await expect.poll(() => page.locator('.bc-page-sheet').count()).toBeGreaterThanOrEqual(6)
    await page.evaluate(async id => {
      const doc = (window as any).__placementDoc
      await doc.navigateToBlock(id)
    }, id)
    await expect.poll(() => coveredByExtent(page, id)).toBe(true)
    const {gapY} = await pageGap(page)
    await page.evaluate(({id, gapY}) => (window as any).__placementDoc.crud.updateBlockProps(id, {position: `80 ${gapY}`}), {id, gapY})
    await page.evaluate(id => (window as any).__placementDoc.navigateToBlock(id), id)
    await expect.poll(() => coveredByExtent(page, id)).toBe(true)
    expect(await page.evaluate(id => (window as any).__placementDoc.placement.getState(id).y, id)).toBe(gapY)
    await page.evaluate(() => (window as any).__placementPagination.disable())
    await expect.poll(() => page.evaluate(id => (window as any).__placementDoc.getBlockById(id).placementTop, id)).toBe(gapY)
    expect(await page.evaluate(id => (window as any).__placementDoc.placement.getState(id).y, id)).toBe(gapY)
  })
}

test('drag preview and drop preserve free page-gap coordinates; undo restores the position', async ({page}) => {
  const {id} = await setup(page)
  await page.evaluate(id => (window as any).__placementDoc.crud.updateBlockProps(id, {position: "80 100"}), id)
  await paginate(page, false)
  await page.evaluate(id => (window as any).__placementDoc.navigateToBlock(id), id)
  const block = page.locator(`[data-block-id="${id}"]`)
  await expect(block).toBeVisible()
  const {gapY} = await pageGap(page)
  await page.evaluate(({id, gapY}) => {
    const doc = (window as any).__placementDoc
    doc.crud.undoManager.stopCapturing()
    const block = doc.getBlockById(id)
    const rect = block.hostElement.getBoundingClientRect()
    doc.placement.startDrag(new PointerEvent('pointerdown', {
      pointerId: 71, button: 0, clientX: rect.left + 10, clientY: rect.top + 10,
    }), block)
    window.dispatchEvent(new PointerEvent('pointermove', {
      pointerId: 71, clientX: rect.left + 10, clientY: rect.top + 10 + gapY - 100,
    }))
  }, {id, gapY})
  await expect.poll(() => coveredByExtent(page, id)).toBe(true)
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', {pointerId: 71})))
  await expect.poll(() => page.evaluate(id => (window as any).__placementDoc.placement.getState(id).y, id)).toBe(gapY)
  await expect.poll(() => coveredByExtent(page, id)).toBe(true)
  await page.evaluate(() => (window as any).__placementDoc.crud.undoManager.undo())
  await expect.poll(() => page.evaluate(id => (window as any).__placementDoc.placement.getState(id).y, id)).toBe(100)
})

test('rotated groups retain coordinates and document extent at 75% and 150% scale', async ({page}) => {
  const {id} = await setup(page)
  const groupId = await page.evaluate(id => {
    const doc = (window as any).__placementDoc
    doc.crud.updateBlockProps(id, {position: "40 100"})
    const second = doc.schemas.createSnapshot('shape', ['rectangle'])
    second.props = {...second.props, width: 100, height: 80}
    const secondId = doc.placement.insertAbsoluteSnapshot(second, {anchorRect: null})
    doc.crud.updateBlockProps(secondId, {position: "200 100"})
    const groupId = doc.placement.group([id, secondId])
    if (!groupId) throw new Error('group creation failed')
    doc.crud.updateBlockProps(groupId, {rotation: 90})
    return groupId
  }, id)
  await paginate(page, true)
  const {gapY} = await pageGap(page)
  await page.evaluate(({groupId, gapY}) => {
    const doc = (window as any).__placementDoc
    // A remote transaction follows the same model event path and does not need a mounted view.
    doc.yDoc.transact(() => doc.crud.getYBlock(groupId).get('props').set('position', {x: 80, y: gapY}), 'remote-regression')
  }, {groupId, gapY})
  for (const scale of [0.75, 1.5]) {
    await page.evaluate(({groupId, scale}) => {
      const doc = (window as any).__placementDoc
      doc.viewScale.setScale(scale)
      return doc.navigateToBlock(groupId)
    }, {groupId, scale})
    await expect.poll(() => coveredByExtent(page, groupId)).toBe(true)
  }
  expect(await page.evaluate(groupId => (window as any).__placementDoc.placement.getState(groupId).y, groupId)).toBe(gapY)
})

test('image and caption extend the document without snapping; flow follows responsive width', async ({page}) => {
  await setup(page)
  const imageId = await page.evaluate(() => {
    const doc = (window as any).__placementDoc
    const image = doc.schemas.createSnapshot('image', [{
      src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Xw4ZAAAAAElFTkSuQmCC',
      wr: 30, ar: 1,
    }, undefined, undefined, '图片说明也必须完整留在纸面内'])
    const id = doc.placement.insertAbsoluteSnapshot(image, {anchorRect: null})
    doc.crud.updateBlockProps(id, {position: "40 2300"})
    return id
  })
  await paginate(page, true)
  const {gapY} = await pageGap(page)
  await page.evaluate(({imageId, gapY}) => {
    const doc = (window as any).__placementDoc
    doc.crud.updateBlockProps(imageId, {position: `40 ${gapY - 130}`})
    return doc.navigateToBlock(imageId)
  }, {imageId, gapY})
  await expect.poll(() => coveredByExtent(page, imageId)).toBe(true)
  await page.evaluate(() => (window as any).__placementPagination.disable())
  await page.setViewportSize({width: 1050, height: 800})
  await page.evaluate(imageId => (window as any).__placementDoc.navigateToBlock(imageId), imageId)
  await expect.poll(() => page.evaluate(imageId => {
    const doc = (window as any).__placementDoc
    return doc.root.hostElement.getBoundingClientRect().bottom
      >= doc.getBlockById(imageId).hostElement.getBoundingClientRect().bottom
  }, imageId)).toBe(true)
})

test('cancelling a drag removes preview-only pages and keeps the model position', async ({page}) => {
  const {id} = await setup(page)
  await page.evaluate(id => (window as any).__placementDoc.crud.updateBlockProps(id, {position: "80 50"}), id)
  await paginate(page, false)
  await expect.poll(() => page.locator('.bc-page-sheet').count()).toBe(1)
  await page.evaluate(id => {
    const doc = (window as any).__placementDoc
    const block = doc.getBlockById(id)
    const rect = block.hostElement.getBoundingClientRect()
    doc.placement.startDrag(new PointerEvent('pointerdown', {
      pointerId: 72, button: 0, clientX: rect.left + 10, clientY: rect.top + 10,
    }), block)
    window.dispatchEvent(new PointerEvent('pointermove', {
      pointerId: 72, clientX: rect.left + 10, clientY: rect.top + 910,
    }))
  }, id)
  await expect.poll(() => page.locator('.bc-page-sheet').count()).toBeGreaterThan(1)
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', {pointerId: 72})))
  await expect.poll(() => page.locator('.bc-page-sheet').count()).toBe(1)
  expect(await page.evaluate(id => (window as any).__placementDoc.placement.getState(id).y, id)).toBe(50)
})

for (const mode of ['flow', 'full', 'sparse'] as const) {
  test(`free dragging can cross content and paper edges in the scroll container (${mode})`, async ({page}) => {
    await page.setViewportSize({width: 1440, height: 1000})
    const {id} = await setup(page)
    await page.evaluate(id => (window as any).__placementDoc.crud.updateBlockProps(id, {position: "80 100"}), id)
    if (mode !== 'flow') await paginate(page, mode === 'sparse')
    for (const scale of [0.75, 1.5]) {
      await page.evaluate(({id, scale}) => {
        const doc = (window as any).__placementDoc
        doc.viewScale.setScale(scale)
        return doc.navigateToBlock(id)
      }, {id, scale})
      for (const edge of ['right', 'left', 'top'] as const) {
        const result = await page.evaluate(({id, scale, edge}) => {
          const doc = (window as any).__placementDoc
          const block = doc.getBlockById(id)
          const rect = block.hostElement.getBoundingClientRect()
          const scroll = doc.scrollContainer.getBoundingClientRect()
          const targetX = edge === 'right' ? scroll.right - 20 : edge === 'left' ? scroll.left + 20 : rect.left + 10
          const targetY = edge === 'top' ? scroll.top + 20 : rect.top + 10
          const startX = rect.left + 10
          const original = {...doc.model.getProps(id).position}
          doc.placement.startDrag(new PointerEvent('pointerdown', {
            pointerId: 73, button: 0, clientX: startX, clientY: rect.top + 10,
          }), block)
          window.dispatchEvent(new PointerEvent('pointermove', {
            pointerId: 73, clientX: targetX, clientY: targetY,
          }))
          const previewRect = block.hostElement.getBoundingClientRect()
          const preview = previewRect.left
          window.dispatchEvent(new PointerEvent('pointerup', {pointerId: 73}))
          return {actual: doc.placement.getState(id).x,
            expected: original.x + (targetX - startX) / scale,
            preview, expectedPreview: rect.left + targetX - startX,
            rendered: block.placementLeft, actualY: doc.placement.getState(id).y,
            expectedY: original.y + (targetY - rect.top - 10) / scale,
            renderedY: block.placementTop, previewY: previewRect.top, expectedPreviewY: targetY - 10}
        }, {id, scale, edge})
        expect(result.actual).toBeCloseTo(result.expected, 1)
        expect(result.rendered).toBeCloseTo(result.expected, 1)
        expect(result.preview).toBeCloseTo(result.expectedPreview, 1)
        expect(result.actualY).toBeCloseTo(result.expectedY, 1)
        expect(result.renderedY).toBeCloseTo(result.expectedY, 1)
        expect(result.previewY).toBeCloseTo(result.expectedPreviewY, 1)
      }
    }
  })
}
