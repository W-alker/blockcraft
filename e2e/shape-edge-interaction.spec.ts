import {expect, test, type Page} from '@playwright/test'

test.use({viewport: {width: 1400, height: 1000}})

async function setup(page: Page, options: {scale?: number; rotation?: number; empty?: boolean; nested?: boolean; flow?: boolean} = {}) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, route => route.abort())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  return page.evaluate(options => {
    const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const viewport = document.createElement('div')
    viewport.style.cssText = 'position:fixed;left:40px;top:40px;width:1100px;height:800px;overflow:auto;background:white;z-index:20'
    const mount = document.createElement('div')
    viewport.append(mount)
    document.body.append(viewport)
    const shape = source.schemas.createSnapshot('shape', ['rectangle', options.empty ? '' : '首字文字铺满零边距形状，仍然允许点击与划选。'.repeat(20)])
    Object.assign(shape.props, {width: 300, height: 140, textPadding: '0', textAlignment: 'left top', textAutoFit: 'none', rotation: options.rotation ?? 0})
    const outer = options.nested ? source.schemas.createSnapshot('render-unit', [{}, {width: 500, height: 240}]) : null
    if (outer) outer.children = [shape]
    const root = source.schemas.createSnapshot('root', ['shape-edge', [outer ?? shape]])
    const Drag = source.plugins.find((plugin: any) => plugin.name === 'ObjectDrag').constructor
    const Format = source.plugins.find((plugin: any) => plugin.name === 'object-format-toolbar').constructor
    const doc = new source.constructor({
      ...source.config, yDoc: new source.yDoc.constructor(), docId: root.id,
      plugins: [new Format(), new Drag()], scrollContainer: viewport,
      readonly: false, virtualization: {enabled: false},
    })
    doc.initBySnapshot(root, mount)
    doc.viewScale.attach(mount)
    doc.viewScale.setScale(options.scale ?? 1)
    if (!options.nested && !options.flow) {
      doc.placement.setObjectLayout(shape.id, 'over')
      doc.placement.updateAbsolute(shape.id, {x: 120, y: 140})
    }
    doc.selection.blur()
    doc.crud.undoManager.clearHistory()
    ;(window as any).shapeEdge = {doc, id: shape.id, outerId: outer?.id}
    return shape.id as string
  }, options)
}

async function selected(page: Page) {
  return page.evaluate(() => {
    const {doc, id} = (window as any).shapeEdge
    return doc.selection.value?.anchor.type === 'selected' && doc.selection.value?.head.type === 'selected'
      && doc.selection.value?.firstBlockId === id
  })
}

async function position(page: Page) {
  return page.evaluate(() => {
    const {doc, id} = (window as any).shapeEdge
    const {x, y} = doc.placement.getState(id)
    return {x, y}
  })
}

for (const scale of [0.5, 1, 2]) {
  test(`零边距满文字形状 ${scale}：正文不显框，四边悬停选择及拖动`, async ({page}) => {
    const id = await setup(page, {scale})
    const block = page.locator(`[data-block-id="${id}"]`)
    const controls = block.locator('bc-object-edge-controls')
    const text = block.locator('.shape-text-block')
    await block.locator('.shape-block__shell').hover({position: {x: 150 * scale, y: 60 * scale}})
    await expect(controls).toHaveCSS('opacity', '0')
    expect(await selected(page)).toBeFalsy()
    for (const edge of await controls.locator('button').all()) {
      await edge.hover()
      await expect(controls).toHaveCSS('opacity', '1')
      await expect(edge).toHaveCSS('cursor', 'move')
    }
    // 首字和行尾附近仍由文字负责，不被边缘命中带覆盖。
    const bounds = (await text.boundingBox())!
    const point = {x: bounds.x + 4 * scale, y: bounds.y + 10 * scale}
    expect(await text.evaluate((el, point) => el.contains(document.elementFromPoint(point.x, point.y)), point)).toBe(true)
    await page.mouse.click(point.x, point.y)
    await expect(controls).toHaveCSS('opacity', '0')
    await expect.poll(() => page.evaluate(() => (window as any).shapeEdge.doc.selection.value?.anchor.type)).toBe('text')
    await page.keyboard.press('Shift+ArrowRight')
    await expect.poll(() => page.evaluate(() => document.getSelection()?.toString().length ?? 0)).toBeGreaterThan(0)
    await page.keyboard.press('ArrowRight')
    await page.keyboard.type('EDITOK')
    await expect(text).toContainText('EDITOK')
    const edge = controls.locator('[data-bc-object-entry-edge="east"]')
    await edge.click()
    await expect.poll(() => selected(page)).toBe(true)
    await expect(controls).toBeHidden()
    await expect(block.locator('shape-resizer')).toBeVisible()
    await page.evaluate(() => {
      const {doc} = (window as any).shapeEdge
      doc.selection.blur()
      doc.crud.undoManager.clearHistory()
    })
    const before = await position(page)
    const r = (await edge.boundingBox())!
    const start = {x: r.x + r.width / 2, y: r.y + r.height / 2}
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x + 30 * scale, start.y + 20 * scale, {steps: 6})
    await page.mouse.up()
    await expect.poll(() => position(page)).toEqual({x: before.x + 30, y: before.y + 20})
    await page.evaluate(() => (window as any).shapeEdge.doc.crud.undoManager.undo())
    await expect.poll(() => position(page)).toEqual(before)
  })
}

test('旋转形状边缘命中、键盘选择、只读和打印', async ({page}) => {
  const id = await setup(page, {rotation: 25})
  const block = page.locator(`[data-block-id="${id}"]`)
  const controls = block.locator('bc-object-edge-controls')
  const edge = controls.locator('[data-bc-object-entry-edge="east"]')
  await edge.hover()
  await expect(controls).toHaveCSS('opacity', '1')
  await page.emulateMedia({media: 'print'})
  await expect(controls).toBeHidden()
  await page.emulateMedia({media: 'screen'})
  await edge.click()
  await expect.poll(() => selected(page)).toBe(true)
  await page.evaluate(() => (window as any).shapeEdge.doc.selection.blur())
  await edge.focus()
  await expect(controls).toHaveCSS('opacity', '1')
  await page.keyboard.press('Enter')
  await expect.poll(() => selected(page)).toBe(true)
  await page.evaluate(() => {
    const {doc} = (window as any).shapeEdge
    doc.selection.blur()
    doc.readonlySwitch$.next(true)
  })
  await expect(controls).toHaveCount(0)
})

test('空形状边缘选择不创建文字，正文双击继续创建文字', async ({page}) => {
  const id = await setup(page, {empty: true, flow: true})
  const block = page.locator(`[data-block-id="${id}"]`)
  await block.locator('[data-bc-object-entry-edge="east"]').click()
  await expect.poll(() => selected(page)).toBe(true)
  await expect(block.locator('.shape-text-block')).toHaveCount(0)
  await page.evaluate(() => (window as any).shapeEdge.doc.selection.blur())
  await block.locator('.shape-block__shell').dblclick({position: {x: 150, y: 70}})
  await expect(block.locator('.shape-text-block')).toHaveCount(1)
  await page.keyboard.type('NEW TEXT')
  await expect(block.locator('.shape-text-block')).toContainText('NEW TEXT')
})

test('嵌套形状边缘优先，外层仍保留自己的整块悬停入口', async ({page}) => {
  const id = await setup(page, {nested: true})
  const block = page.locator(`[data-block-id="${id}"]`)
  const outerId = await page.evaluate(() => (window as any).shapeEdge.outerId as string)
  const outer = page.locator(`[data-block-id="${outerId}"]`)
  const outerControls = outer.locator(':scope > bc-object-corner-controls')
  await block.locator('[data-bc-object-entry-edge="east"]').hover()
  await expect(block.locator('bc-object-edge-controls')).toHaveCSS('opacity', '1')
  await expect(outerControls).toHaveCSS('opacity', '0')
  await outer.hover({position: {x: 450, y: 200}})
  await expect(outerControls).toHaveCSS('opacity', '1')
  await expect(block.locator('bc-object-edge-controls')).toHaveCSS('opacity', '0')
})
