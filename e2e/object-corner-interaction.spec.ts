import {expect, test, type Page} from '@playwright/test'

test.use({viewport: {width: 1400, height: 1000}})

async function setup(page: Page, flavour: string, scale: number, nested = false, rotation = 0, dense = true) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, route => route.abort())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng
    ?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  return page.evaluate(({flavour, scale, nested, rotation, dense}) => {
    const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const viewport = document.createElement('div')
    viewport.style.cssText = 'position:fixed;left:40px;top:50px;width:1100px;height:800px;overflow:auto;background:white;z-index:10'
    const mount = document.createElement('div')
    viewport.appendChild(mount)
    document.body.appendChild(viewport)
    const target = source.schemas.createSnapshot(flavour, flavour === 'render-unit'
      ? [{tplRegion: true}, {width: 300, height: 160}]
      : ['Text selection remains editable', {width: 300, height: 160, rotation}])
    const region = nested ? source.schemas.createSnapshot('render-unit', [
      {}, {width: 500, height: 180},
    ]) : null
    if (region) {
      region.children = [target, ...Array.from({length: 20}, (_, i) =>
        source.schemas.createSnapshot('paragraph', [`区域内滚动内容 ${i + 1}`]))]
    }
    const lead = source.schemas.createSnapshot('paragraph', [Array(6).fill('区域外正文').join('\n')])
    const snapshot = source.schemas.createSnapshot('root', ['corner-interaction', region ? [lead, region] : [target]])
    const Drag = source.plugins.find((plugin: any) => plugin.name === 'ObjectDrag').constructor
    const Format = source.plugins.find((plugin: any) => plugin.name === 'object-format-toolbar').constructor
    const doc = new source.constructor({
      ...source.config, yDoc: new source.yDoc.constructor(), docId: snapshot.id,
      plugins: [new Format(), new Drag()], scrollContainer: viewport, readonly: false,
      virtualization: {enabled: false},
    })
    doc.initBySnapshot(snapshot, mount)
    doc.viewScale.attach(mount)
    doc.viewScale.setScale(scale)
    if (flavour !== 'render-unit' && !nested) {
      doc.placement.setObjectLayout(target.id, 'over')
      doc.placement.updateAbsolute(target.id, {x: 100, y: 160})
      // 后插入的对象位于更高绘制顺序，与目标顶边紧贴。
      if (dense) {
        const neighbor = doc.schemas.createSnapshot('text-box', ['', {width: 300, height: 100}])
        const neighborId = doc.placement.insertAbsoluteSnapshot(neighbor, {anchorRect: null})
        doc.placement.updateAbsolute(neighborId, {x: 100, y: 60})
      }
    }
    doc.selection.blur()
    doc.crud.undoManager.clearHistory()
    ;(window as any).cornerInteraction = {doc, targetId: target.id, regionId: region?.id}
    return target.id as string
  }, {flavour, scale, nested, rotation, dense})
}

async function position(page: Page) {
  return page.evaluate(() => {
    const {doc, targetId} = (window as any).cornerInteraction
    const {x, y} = doc.placement.getState(targetId)
    return {x, y}
  })
}

async function selectedObject(page: Page) {
  return page.evaluate(() => {
    const {doc} = (window as any).cornerInteraction
    const selection = doc.selection.value
    return selection?.anchor.type === 'selected' && selection?.head.type === 'selected'
      ? selection.firstBlockId : null
  })
}

for (const flavour of ['text-box', 'word-art']) {
  for (const scale of [0.5, 1, 2]) {
    test(`${flavour} at ${scale}: 整块悬停仅显示边框和顶部抓手，紧邻对象仍可沿边选择与拖动`, async ({page}) => {
      const id = await setup(page, flavour, scale)
      const block = page.locator(`[data-block-id="${id}"]`)
      const controls = block.locator('bc-object-corner-controls')
      const floatingHandle = controls.locator('[data-bc-object-floating-handle]')
      await block.hover({position: {x: 150 * scale, y: 80 * scale}})
      await expect(controls.locator('[data-bc-object-corner]')).toHaveCount(0)
      await expect(controls).toHaveCSS('outline-style', 'dashed')
      await expect(floatingHandle).toBeVisible()
      await expect(floatingHandle).toHaveCSS('width', '24px')
      await expect(floatingHandle).toHaveCSS('height', '14px')
      if (flavour === 'text-box' && scale === 1 && test.info().project.name === 'webkit') {
        await page.screenshot({path: test.info().outputPath('corner-hover.png'), clip: {x: 40, y: 50, width: 1100, height: 650}})
      }
      expect(await selectedObject(page)).toBeNull()
      const before = await position(page)
      const entry = controls.locator('[data-bc-object-entry-edge="east"]')
      const box = (await entry.boundingBox())!
      const x = box.x + box.width / 2
      const y = box.y + box.height / 2
      const hit = await entry.evaluate((el, point) => {
        const hit = document.elementFromPoint(point.x, point.y)
        return {matches: el.contains(hit), entry: el.outerHTML, hit: hit?.outerHTML.slice(0, 250)}
      }, {x, y})
      expect(hit.matches, JSON.stringify(hit)).toBe(true)
      await page.mouse.move(x, y)
      await page.mouse.down()
      await page.mouse.move(x + 32 * scale, y + 24 * scale, {steps: 6})
      await expect(floatingHandle).toBeHidden()
      await page.mouse.up()
      await expect.poll(() => position(page)).toEqual({
        x: expect.closeTo(before.x + 32, 0), y: expect.closeTo(before.y + 24, 0),
      })
      await page.evaluate(() => {
        const {doc} = (window as any).cornerInteraction
        doc.crud.undoManager.undo()
        doc.selection.blur()
      })
      await expect.poll(() => position(page)).toEqual(before)
      await block.hover({position: {x: 150 * scale, y: 80 * scale}})
      await entry.click()
      await expect.poll(() => selectedObject(page)).toBe(id)
      await expect(block.locator('shape-resizer')).toBeVisible()
    })
  }

  test(`${flavour}: 顶部抓手点击选择、拖动移动，选中后隐藏轻量入口`, async ({page}) => {
    const id = await setup(page, flavour, 1, false, 0, false)
    const block = page.locator(`[data-block-id="${id}"]`)
    const handle = block.locator('[data-bc-object-floating-handle]')
    await block.hover()
    await expect(block.locator('[data-bc-object-corner]')).toHaveCount(0)
    await expect(handle).toBeVisible()
    await handle.click()
    await expect.poll(() => selectedObject(page)).toBe(id)
    await expect(handle).toBeHidden()
    await page.evaluate(() => (window as any).cornerInteraction.doc.selection.blur())
    await block.hover()
    const before = await position(page)
    const box = (await handle.boundingBox())!
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 32, y + 24, {steps: 6})
    await page.mouse.up()
    await expect.poll(() => position(page)).toEqual({x: before.x + 32, y: before.y + 24})
    await page.evaluate(() => (window as any).cornerInteraction.doc.crud.undoManager.undo())
    await expect.poll(() => position(page)).toEqual(before)
  })

  test(`${flavour}: 文字点击和划选保持编辑，聚焦显示顶部抓手，支持键盘选择`, async ({page}) => {
    const id = await setup(page, flavour, 1)
    const block = page.locator(`[data-block-id="${id}"]`)
    const editor = block.locator(flavour === 'text-box' ? '.text-box-block__content' : '.word-art-block__editor')
    const controls = block.locator('bc-object-corner-controls')
    const handle = controls.locator('[data-bc-object-floating-handle]')
    await editor.click()
    await page.mouse.move(20, 20)
    await expect(handle).toBeVisible()
    await expect(editor).toHaveAttribute('contenteditable', 'true')
    expect(await selectedObject(page)).toBeNull()
    await page.keyboard.press('Home')
    await page.keyboard.press('Shift+ArrowRight')
    await expect.poll(() => page.evaluate(() => document.getSelection()?.toString().length ?? 0)).toBeGreaterThan(0)
    await page.keyboard.press('ArrowRight')
    await page.keyboard.type('EDITOK')
    await expect(block).toContainText('EDITOK')
    await controls.locator('[data-bc-object-floating-handle]').focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => selectedObject(page)).toBe(id)
    await page.evaluate(() => (window as any).cornerInteraction.doc.selection.blur())
    await block.hover()
    await handle.focus()
    await expect(handle).toBeFocused()
    await page.keyboard.press('Space')
    await expect.poll(() => selectedObject(page)).toBe(id)
    await expect(handle).toBeHidden()
  })

  test(`${flavour}: 旋转后的顶部抓手可点击，打印和只读隐藏入口`, async ({page}) => {
    const id = await setup(page, flavour, 1, false, 15, false)
    const block = page.locator(`[data-block-id="${id}"]`)
    const handle = block.locator('[data-bc-object-floating-handle]')
    await block.hover()
    await expect(handle).toBeVisible()
    await page.emulateMedia({media: 'print'})
    await expect(handle).toBeHidden()
    await page.emulateMedia({media: 'screen'})
    await block.hover()
    await handle.click()
    await expect.poll(() => selectedObject(page)).toBe(id)
    await page.evaluate(() => {
      const {doc} = (window as any).cornerInteraction
      doc.selection.blur()
      doc.readonlySwitch$.next(true)
    })
    await block.hover()
    await expect(handle).toBeHidden()
  })
}

test('填写区顶部抓手只选中和缩放，不新增移动能力', async ({page}) => {
  const id = await setup(page, 'render-unit', 1)
  const block = page.locator(`[data-block-id="${id}"]`)
  await block.hover({position: {x: 150, y: 80}})
  const controls = block.locator(':scope > bc-object-corner-controls')
  await expect(controls.locator('[data-bc-object-corner]')).toHaveCount(0)
  await expect(controls.locator('[data-bc-object-entry-edge]')).toHaveCount(0)
  await expect(controls.locator('[data-bc-object-floating-handle]')).not.toHaveAttribute('data-bc-object-drag-handle')
  await controls.locator('[data-bc-object-floating-handle]').click()
  await expect(block).toHaveClass(/selected/)
  await page.evaluate(() => (window as any).cornerInteraction.doc.selection.blur())
  await block.hover({position: {x: 150, y: 80}})
  await controls.locator('[data-bc-object-floating-handle]').focus()
  await page.keyboard.press('Enter')
  await expect(block).toHaveClass(/selected/)
  await expect(block.locator('shape-resizer')).toBeVisible()
  expect(await page.evaluate(() => {
    const {doc, targetId} = (window as any).cornerInteraction
    return [doc.placement.supports(targetId, 'relative'), doc.placement.supports(targetId, 'absolute')]
  })).toEqual([false, false])
})

test('嵌套文本框悬停只显示最近对象的轻量入口，正文仍可编辑', async ({page}) => {
  const id = await setup(page, 'text-box', 1, true)
  const block = page.locator(`[data-block-id="${id}"]`)
  const outerId = await page.evaluate(() => (window as any).cornerInteraction.regionId as string)
  const outerControls = page.locator(`[data-block-id="${outerId}"] > bc-object-corner-controls`)
  await block.locator('.text-box-block__content').hover()
  await expect(block.locator('[data-bc-object-floating-handle]')).toBeVisible()
  await expect(outerControls.locator('[data-bc-object-floating-handle]')).toBeHidden()
  await block.locator('c-text').first().click()
  await expect.poll(() => page.evaluate(() => {
    const {doc, targetId} = (window as any).cornerInteraction
    return {type: doc.selection.value?.anchor.type,
      withinTarget: doc.selection.value?.anchor.blockId === doc.getBlockById(targetId).firstChildren.id}
  })).toEqual({type: 'text', withinTarget: true})
  await page.keyboard.type('NESTED')
  await expect(block).toContainText('NESTED')
})
