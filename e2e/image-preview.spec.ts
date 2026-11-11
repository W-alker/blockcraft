import {expect, test, type Page} from '@playwright/test'

async function mountImage(page: Page, layout: 'top-bottom' | 'over' | 'under', readonly = false) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    return ['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname)
      ? route.abort() : route.continue()
  })
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  const id = await page.evaluate(({layout, readonly}) => {
    const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const viewport = document.createElement('div')
    viewport.id = 'image-preview-fixture'
    viewport.style.cssText = 'position:fixed;left:40px;top:40px;width:900px;height:700px;overflow:auto;background:white;z-index:1000'
    const mount = document.createElement('div')
    viewport.append(mount)
    document.body.append(viewport)
    const doc = new source.constructor({
      ...source.config,
      yDoc: new source.yDoc.constructor(),
      plugins: ['img-toolbar', 'ObjectDrag'].map(name =>
        new (source.plugins.find((plugin: any) => plugin.name === name).constructor)()),
      scrollContainer: viewport,
      readonly: false,
      virtualization: {enabled: false},
    })
    doc.initBySnapshot({...source.model.toSnapshot(source.rootId), children: []}, mount)
    ;(window as any).__imagePreviewDoc = doc
    const canvas = document.createElement('canvas')
    canvas.width = 240
    canvas.height = 120
    canvas.getContext('2d')!.fillRect(0, 0, 240, 120)
    const image = doc.schemas.createSnapshot('image', [{src: canvas.toDataURL(), wr: 30, ar: 2}])
    if (layout === 'top-bottom') doc.crud.insertBlockSnapshots(doc.rootId, 0, [image])
    else {
      doc.placement.insertAbsoluteSnapshot(image, {anchorRect: null, layer: layout})
      doc.crud.updateBlockProps(image.id, {position: '60 40'})
    }
    doc.toggleReadonly(readonly)
    doc.crud.undoManager.clearHistory()
    return image.id as string
  }, {layout, readonly})
  const frame = page.locator(`#image-preview-fixture [data-block-id="${id}"] .img-wrapper`)
  await expect(frame).toHaveAttribute('data-bc-resource-state', 'ready')
  return {id, frame}
}

for (const {layout, readonly} of [
  {layout: 'over', readonly: false},
  {layout: 'under', readonly: false},
  {layout: 'over', readonly: true},
  {layout: 'top-bottom', readonly: false},
  {layout: 'top-bottom', readonly: true},
] as const) {
  test(`${layout} image opens and closes preview (${readonly ? 'readonly' : 'editable'})`, async ({page}) => {
    const {id, frame} = await mountImage(page, layout, readonly)
    const before = await page.evaluate(id => ({...(window as any).__imagePreviewDoc.model.getProps(id)}), id)
    // Use real pointer input: dispatchEvent('dblclick') skips pointer capture.
    await frame.dblclick()
    const preview = page.locator('.viewer-container')
    await expect(preview).toBeVisible()
    await expect(preview.locator('.viewer-canvas img')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(preview).toBeHidden()
    expect(await page.evaluate(id => ({...(window as any).__imagePreviewDoc.model.getProps(id)}), id)).toEqual(before)
    expect(await page.evaluate(() => (window as any).__imagePreviewDoc.crud.undoManager.isCanUndo())).toBe(false)
  })
}

test('floating image still selects, drags and undoes before preview', async ({page}) => {
  const {id, frame} = await mountImage(page, 'over')
  await frame.click()
  expect(await page.evaluate(() => (window as any).__imagePreviewDoc.selection.value?.firstBlockId)).toBe(id)
  const before = await page.evaluate(id => (window as any).__imagePreviewDoc.model.getProps(id).position, id)
  const box = (await frame.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 45, box.y + box.height / 2 + 25, {steps: 5})
  await page.mouse.up()
  await expect.poll(() => page.evaluate(id => (window as any).__imagePreviewDoc.model.getProps(id).position, id)).not.toBe(before)
  await page.evaluate(() => (window as any).__imagePreviewDoc.crud.undoManager.undo())
  await expect.poll(() => page.evaluate(id => (window as any).__imagePreviewDoc.model.getProps(id).position, id)).toBe(before)
  await frame.dblclick()
  await expect(page.locator('.viewer-container')).toBeVisible()
})
