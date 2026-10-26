import {expect, test, type Page} from '@playwright/test'

async function initialize(page: Page) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng?.getComponent(
    document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  return page.evaluate(() => {
    const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const viewport = document.createElement('div')
    viewport.id = 'shape-lock-fixture'
    viewport.style.cssText = 'position:fixed;left:40px;top:40px;width:900px;height:600px;overflow:auto;background:white;z-index:99999'
    const mount = document.createElement('div')
    viewport.append(mount)
    document.body.append(viewport)
    const doc = new source.constructor({
      ...source.config, yDoc: new source.yDoc.constructor(), plugins: [],
      currentUserId: 'shape-test', scrollContainer: viewport,
      readonly: false, virtualization: {enabled: false},
    })
    ;(window as any).__shapeLockDoc = doc
    doc.initBySnapshot({...source.model.toSnapshot(source.rootId), children: []}, mount)
    const shapes = ['rounded-rectangle', 'right-arrow', 'rectangle'].map(kind => {
      const snapshot = doc.schemas.createSnapshot('shape', [kind, '保留形状填充'])
      Object.assign(snapshot.props, {width: 260, height: 120})
      return snapshot
    })
    doc.crud.insertBlockSnapshots(doc.rootId, 0, shapes)
    doc.selection.selectBlock(shapes[0].id)
    return shapes.map(shape => shape.id) as string[]
  })
}

test('locking and document readonly preserve shape contours, fill and saved props', async ({page}, testInfo) => {
  const ids = await initialize(page)
  const shapes = page.locator('#shape-lock-fixture .shape-block')
  const read = () => shapes.evaluateAll(elements => elements.map(element => {
    const path = element.querySelector<SVGPathElement>('[data-bc-shape-render-path]')!
    const bounds = path.getBBox()
    return {d: path.getAttribute('d'), fill: getComputedStyle(path).fill,
      opacity: getComputedStyle(path).fillOpacity, width: bounds.width, height: bounds.height}
  }))
  await expect(shapes).toHaveCount(3)
  const before = await read()
  expect(before.every(shape => shape.width > 0 && shape.height > 0)).toBe(true)
  const props = () => page.evaluate(ids => ids.map(id =>
    (window as any).__shapeLockDoc.model.toSnapshot(id).props), ids)
  const originalProps = await props()
  for (const locked of [true, false, true, false]) {
    await page.evaluate(({ids, locked}) => ids.forEach(id =>
      (window as any).__shapeLockDoc.setBlockReadonly(id, locked)), {ids, locked})
    if (locked) await expect(shapes.first()).toHaveAttribute('data-bc-readonly', 'self')
    else await expect(shapes.first()).not.toHaveAttribute('data-bc-readonly')
    await expect.poll(read).toEqual(before)
    expect(await props()).toEqual(originalProps)
  }
  await page.evaluate(() => (window as any).__shapeLockDoc.toggleReadonly(true))
  await expect(shapes.first().locator('shape-adjustment-editor')).toHaveCount(0)
  await expect.poll(read).toEqual(before)
  await page.locator('#shape-lock-fixture').screenshot({path: testInfo.outputPath('readonly-shapes.png')})
})

test('adjustment cancel restores the contour and commit survives later locking', async ({page}) => {
  const [id] = await initialize(page)
  const block = page.locator(`#shape-lock-fixture [data-block-id="${id}"]`)
  const path = block.locator('[data-bc-shape-render-path]')
  const before = await path.getAttribute('d')
  const drag = async () => {
    const handle = (await block.locator('[data-adjustment-handle-id]').first().boundingBox())!
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
    await page.mouse.down()
    await page.mouse.move(handle.x + handle.width / 2 + 45, handle.y + handle.height / 2, {steps: 4})
    await expect(path).not.toHaveAttribute('d', before!)
  }
  await drag()
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(path).toHaveAttribute('d', before!)
  await drag()
  await page.evaluate(id => (window as any).__shapeLockDoc.setBlockReadonly(id, true), id)
  await expect(block.locator('shape-adjustment-editor')).toHaveCount(0)
  await page.mouse.up()
  await expect(path).toHaveAttribute('d', before!)
  await page.evaluate(id => {
    const doc = (window as any).__shapeLockDoc
    doc.setBlockReadonly(id, false)
    doc.selection.selectBlock(id)
  }, id)
  await expect(block.locator('shape-adjustment-editor')).toBeVisible()
  await drag()
  await page.mouse.up()
  const committed = await path.getAttribute('d')
  expect(committed).not.toBe(before)
  await page.evaluate(id => (window as any).__shapeLockDoc.setBlockReadonly(id, true), id)
  await expect(block.locator('shape-adjustment-editor')).toHaveCount(0)
  await expect(path).toHaveAttribute('d', committed!)
})
