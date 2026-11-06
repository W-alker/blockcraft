import {expect, test, type Page} from '@playwright/test'

test.use({viewport: {width: 1440, height: 1000}})

async function setup(page: Page, flavour: string, absolute: boolean, rotation = 0) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng
    ?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  return page.evaluate(async ({flavour, absolute, rotation}) => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const snapshot = doc.schemas.createSnapshot(flavour, flavour === 'shape'
      ? ['rectangle'] : ['拖动时显示实际范围', {width: 280, height: 160}])
    snapshot.props = {...snapshot.props, width: 280, height: 160, rotation,
      fill: 'none', outline: 'none'}
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot])
    await doc.navigateToBlock(snapshot.id)
    if (absolute) {
      doc.placement.setMode(snapshot.id, 'absolute')
      doc.placement.updateAbsolute(snapshot.id, {x: 100, y: 100})
      await doc.navigateToBlock(snapshot.id)
    }
    doc.selection.blur()
    doc.crud.undoManager.clearHistory()
    return snapshot.id as string
  }, {flavour, absolute, rotation})
}

async function state(page: Page, id: string) {
  return page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const block = doc.getBlockById(id)
    return {dragging: doc.placement.isDragging || doc.dragController.isDragging,
      props: {...block.props}, selection: doc.selection.value?.toJSON() ?? null}
  }, id)
}

for (const flavour of ['text-box', 'word-art', 'shape']) {
  for (const absolute of [false, true]) {
    test(`${flavour} ${absolute ? '浮动' : '流式'}拖动中显示实际边界，取消后清理`, async ({page}, testInfo) => {
      const id = await setup(page, flavour, absolute, absolute ? 15 : 0)
      const block = page.locator(`[data-block-id="${id}"]`)
      const surface = block.locator(':scope > [data-bc-object-surface]')
      await block.hover()
      const handle = flavour === 'shape' ? surface : block.locator('[data-bc-object-entry-edge="north"]')
      const box = (await handle.boundingBox())!
      const x = box.x + box.width / 2, y = box.y + box.height / 2
      const before = (await surface.boundingBox())!
      const initial = await state(page, id)
      await page.mouse.move(x, y)
      await page.mouse.down()
      await page.mouse.move(x + 40, y + 30, {steps: 5})
      await expect.poll(async () => (await state(page, id)).dragging).toBe(true)
      await expect(surface).toHaveCSS('outline-style', 'solid')
      await expect(surface).toHaveCSS('outline-width', '2px')
      // The outline belongs to the transformed surface, not an unrotated host.
      const during = (await surface.boundingBox())!
      expect(during.width).toBeCloseTo(before.width, 0)
      expect(during.height).toBeCloseTo(before.height, 0)
      expect(during.x).toBeCloseTo(before.x + (absolute ? 40 : 0), 0)
      expect(during.y).toBeCloseTo(before.y + (absolute ? 30 : 0), 0)
      expect((await state(page, id)).props).toEqual(initial.props)
      expect((await state(page, id)).selection).toBeNull()
      if (flavour === 'text-box' && absolute) {
        await page.screenshot({path: testInfo.outputPath('transparent-text-box-drag.png')})
      }
      await page.keyboard.press('Escape')
      await page.mouse.up()
      await expect(block).not.toHaveClass(/bc-drag-source/)
      await expect(surface).toHaveCSS('outline-style', 'none')
      expect((await state(page, id)).props).toEqual(initial.props)
      expect((await surface.boundingBox())!.x).toBeCloseTo(before.x, 0)
    })
  }
}

test('侧边抓手排序透明文本框时显示轮廓', async ({page}) => {
  const id = await setup(page, 'text-box', false)
  const block = page.locator(`[data-block-id="${id}"]`)
  await block.hover({position: {x: 3, y: 3}})
  const controller = page.locator('block-craft-editor bc-drag-handle')
  await expect.poll(() => controller.evaluate(element =>
    (window as any).ng.getComponent(element).activeBlock?.id)).toBe(id)
  const button = controller.locator('.btn')
  const box = (await button.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + 100, box.y + 50, {steps: 5})
  await expect(block.locator(':scope > [data-bc-object-surface]')).toHaveCSS('outline-width', '2px')
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(block).not.toHaveClass(/bc-drag-source/)
})

test('缩放下拖动轮廓跟随文本框，打印隐藏，释放后可撤销重做', async ({page}) => {
  const id = await setup(page, 'text-box', true)
  await page.evaluate(async id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.viewScale.setScale(.75)
    await doc.navigateToBlock(id)
  }, id)
  const block = page.locator(`[data-block-id="${id}"]`)
  const surface = block.locator(':scope > [data-bc-object-surface]')
  await block.hover()
  const handle = (await block.locator('[data-bc-object-entry-edge="north"]').boundingBox())!
  const before = (await surface.boundingBox())!
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(handle.x + handle.width / 2 + 45, handle.y + handle.height / 2 + 30, {steps: 5})
  await expect(surface).toHaveCSS('outline-style', 'solid')
  // CSS zoom can quantize the computed width differently between engines.
  await expect.poll(() => surface.evaluate(element => parseFloat(getComputedStyle(element).outlineWidth))).toBeGreaterThan(0)
  await expect(block).toHaveCSS('opacity', '1')
  await expect.poll(async () => (await surface.boundingBox())!.x).toBeCloseTo(before.x + 45, 0)
  await page.emulateMedia({media: 'print'})
  await expect(surface).toHaveCSS('outline-style', 'none')
  await page.emulateMedia({media: 'screen'})
  await expect(surface).toHaveCSS('outline-style', 'solid')
  await page.mouse.up()
  await expect(block).not.toHaveClass(/bc-drag-source/)
  await expect(surface).toHaveCSS('outline-style', 'none')
  await expect.poll(async () => (await surface.boundingBox())!.x).toBeCloseTo(before.x + 45, 0)
  for (const action of ['undo', 'redo'] as const) {
    await page.evaluate(action => (window as any).ng.getComponent(document.querySelector('block-craft-editor'))
      .doc.crud.undoManager[action](), action)
    await expect.poll(async () => (await surface.boundingBox())!.x).toBeCloseTo(before.x + (action === 'undo' ? 0 : 45), 0)
  }
})
