import {expect, test, type Page} from '@playwright/test'

async function setup(page: Page) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  return page.evaluate(async () => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const box = doc.schemas.createSnapshot('text-box', ['个性化正文', {width: 360, height: 150}])
    const canvas = document.createElement('canvas'); canvas.width = 280; canvas.height = 120
    const image = doc.schemas.createSnapshot('image', [{src: canvas.toDataURL(), wr: 35, ar: 2}])
    image.children = [doc.schemas.createSnapshot('caption', ['独立图片说明'])]
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [box, image])
    await doc.navigateToBlock(box.id)
    doc.selection.blur(); doc.crud.undoManager.clearHistory()
    return {box: box.id, image: image.id}
  })
}
async function configure(page: Page, overrides: object, preset = 'mixed') {
  expect(await page.evaluate(({preset, overrides}) => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    return doc.interaction.configure({preset, overrides})
  }, {preset, overrides})).toBe(true)
}

test('debug overrides activate independent content toolbars without changing the preset or selection', async ({page}, testInfo) => {
  const ids = await setup(page)
  const box = page.locator(`[data-block-id="${ids.box}"]`)
  const text = box.locator('.edit-container').first()
  const panel = page.getByTestId('interaction-mode-debug')
  await panel.locator('summary').click()
  await text.click()
  const before = await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    return {selection: doc.selection.value.toJSON(), data: JSON.stringify(doc.yDoc.getMap('blocks').toJSON())}
  })
  await panel.getByRole('combobox', {name: '对象内部选区工具栏', exact: true}).selectOption('true')
  await expect(page.locator('bc-object-format-toolbar')).toBeVisible()
  await expect(panel.getByRole('combobox', {name: '编辑模式', exact: true})).toHaveValue('mixed')
  expect(await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    return {selection: doc.selection.value.toJSON(), data: JSON.stringify(doc.yDoc.getMap('blocks').toJSON())}
  })).toEqual(before)
  const caption = page.locator(`[data-block-id="${ids.image}"] .edit-container`).first()
  await caption.click()
  await expect(page.locator('bc-image-toolbar')).toHaveCount(0)
  await panel.getByRole('combobox', {name: '图片说明选区工具栏', exact: true}).selectOption('true')
  await expect(page.locator('bc-image-toolbar')).toBeVisible()
  await panel.getByRole('combobox', {name: '对象内部选区工具栏', exact: true}).selectOption('false')
  await expect(page.locator('bc-image-toolbar')).toBeVisible()
  await text.click()
  await expect(page.locator('bc-object-format-toolbar')).toHaveCount(0)
  await page.keyboard.type('EDIT')
  await expect(text).toContainText('EDIT')
  await panel.getByRole('button', {name: '恢复当前预设', exact: true}).click()
  await expect(panel.getByRole('combobox', {name: '图片说明选区工具栏', exact: true})).toHaveValue('inherit')
  await expect(panel.locator('summary')).not.toContainText('已自定义')
  await page.setViewportSize({width: 390, height: 844})
  const option = panel.getByRole('combobox', {name: '对象内部选区工具栏', exact: true})
  await option.scrollIntoViewIfNeeded()
  const bounds = (await option.boundingBox())!
  expect(bounds.x >= 0 && bounds.x + bounds.width <= 390).toBe(true)
  await page.screenshot({path: testInfo.outputPath('custom-interaction-narrow.png')})
})

test('hover and content handles are independent, layout visibility wins, and same-preset reset works', async ({page}) => {
  const ids = await setup(page)
  const box = page.locator(`[data-block-id="${ids.box}"]`)
  const corner = box.locator('bc-object-corner-controls')
  await configure(page, {native: {hoverControls: false}}, 'design')
  await box.hover()
  await expect(corner).toHaveCSS('opacity', '0')
  await box.locator('.edit-container').first().click()
  await expect(box.locator('shape-resizer')).toBeVisible()
  await configure(page, {native: {hoverControls: false, contentResizeHandles: false}}, 'design')
  await expect(box.locator('shape-resizer')).toBeHidden()
  await expect(corner).toBeVisible()
  await configure(page, {native: {layoutControls: false, contentResizeHandles: true}}, 'design')
  await expect(corner).toBeHidden()
  await expect(box.locator('shape-resizer')).toBeHidden()
  await expect(page.locator('bc-object-format-toolbar')).toBeVisible()
  await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.interaction.set('design'))
  await expect(box.locator('shape-resizer')).toBeVisible()
  expect(await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.interaction.overrides)).toEqual({})
})

test('visible controls do not grant object movement, text and enabled movement keep working', async ({page}) => {
  const ids = await setup(page)
  await page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.placement.setMode(id, 'absolute')
    doc.selection.selectBlock(doc.getBlockById(id)); doc.root.hostElement.focus()
    doc.crud.undoManager.clearHistory()
  }, ids.box)
  const box = page.locator(`[data-block-id="${ids.box}"]`)
  const position = () => page.evaluate(id => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.model.getProps(id).position, ids.box)
  await configure(page, {native: {moveExistingBlocks: false}}, 'design')
  const before = await position()
  await expect(box.locator('shape-resizer')).toBeVisible()
  await page.keyboard.press('ArrowRight')
  expect(await position()).toEqual(before)
  expect(await page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    return doc.placement.startDrag(new PointerEvent('pointerdown', {button: 0}), id)
  }, ids.box)).toBe(false)
  await configure(page, {}, 'design')
  await page.keyboard.press('ArrowRight')
  await expect.poll(position).not.toEqual(before)
  const text = box.locator('.edit-container').first()
  await text.click()
  await configure(page, {native: {moveExistingBlocks: false}}, 'design')
  await page.keyboard.type('TEXT')
  await expect(text).toContainText('TEXT')
})

test('group outline and group toolbar can be configured separately without inheriting member selection', async ({page}) => {
  await setup(page)
  const id = await page.evaluate(async () => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const child = doc.schemas.createSnapshot('text-box', ['组合成员文字', {width: 280, height: 100, position: '30 30'}])
    const group = doc.schemas.createSnapshot('object-group', [{width: 520, height: 220}, [child]])
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [group])
    await doc.navigateToBlock(group.id)
    return group.id
  })
  const group = page.locator(`[data-block-id="${id}"]`)
  await configure(page, {native: {groupOutline: false}}, 'design')
  await group.click({position: {x: 450, y: 190}})
  await expect(page.locator('bc-object-group-toolbar')).toBeVisible()
  await expect(group).toHaveCSS('outline-style', 'none')
  await expect(group.locator(':scope > shape-resizer > .shape-resizer__frame')).toHaveCSS('outline-style', 'none')
  await configure(page, {plugins: {groupToolbar: {enabled: false}}}, 'design')
  await expect(page.locator('bc-object-group-toolbar')).toHaveCount(0)
  await expect(group.locator(':scope > shape-resizer > .shape-resizer__frame')).not.toHaveCSS('outline-style', 'none')
  await configure(page, {}, 'design')
  await group.locator('.edit-container').first().click()
  await expect(page.locator('bc-object-group-toolbar')).toHaveCount(0)
  await expect(page.locator('bc-object-format-toolbar')).toBeVisible()
})
