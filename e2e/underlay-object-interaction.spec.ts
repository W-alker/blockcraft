import {expect, test, type Page} from '@playwright/test'

test.use({viewport: {width: 1600, height: 1000}})

async function setup(page: Page, flavour = 'image', rotation = 0, scale = 1) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng
    ?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  return page.evaluate(async ({flavour, rotation, scale}) => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const canvas = document.createElement('canvas')
    canvas.width = 280
    canvas.height = 160
    const context = canvas.getContext('2d')!
    context.fillStyle = '#4488cc'
    context.fillRect(0, 0, 280, 160)
    const snapshot = doc.schemas.createSnapshot(flavour, flavour === 'image'
      ? [{src: canvas.toDataURL(), wr: 280 / doc.objectSizing.rootContentWidth * 100, ar: 280 / 160}]
      : flavour === 'shape' ? ['rectangle'] : ['文字下方对象'])
    if (flavour !== 'image') snapshot.props = {...snapshot.props, width: 280, height: 160}
    snapshot.props.rotation = rotation
    const id = doc.placement.insertAbsoluteSnapshot(snapshot, {anchorRect: null, layer: 'under'})
    doc.crud.updateBlockProps(id, {position: '80 100'})
    const paragraph = doc.schemas.createSnapshot('paragraph', [[{insert: '正文仍可编辑。'.repeat(350)}]])
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [paragraph])
    doc.viewScale.setScale(scale)
    await doc.navigateToBlock(id)
    doc.selection.blur()
    doc.crud.undoManager.clearHistory()
    return {id: id as string, paragraphId: paragraph.id as string}
  }, {flavour, rotation, scale})
}

async function state(page: Page, id: string) {
  return page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    return {...doc.placement.getState(id), props: {...doc.model.getProps(id)}}
  }, id)
}

async function selectFromCoveredEdge(page: Page, id: string) {
  const host = page.locator(`[data-block-id="${id}"]`)
  const rect = (await host.boundingBox())!
  const x = rect.x + 1, y = rect.y + rect.height / 3
  // The recovery path must receive a real event targeted at the covering text.
  expect(await page.evaluate(({x, y, id}) =>
    document.elementFromPoint(x, y)?.closest('[data-block-id]')?.getAttribute('data-block-id') !== id,
  {x, y, id})).toBe(true)
  await page.mouse.click(x, y)
  await expect(host).toHaveClass(/selected/)
}

test('covered image edge starts movement in the same gesture, with undo and cancellation', async ({page}) => {
  const {id} = await setup(page)
  const rect = (await page.locator(`[data-block-id="${id}"]`).boundingBox())!
  const before = await state(page, id)
  const x = rect.x + 1, y = rect.y + rect.height / 3
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 40, y + 30, {steps: 6})
  await page.mouse.up()
  await expect.poll(async () => (await state(page, id)).x).toBe(before.x + 40)
  expect((await state(page, id)).layer).toBe('under')
  await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.crud.undoManager.undo())
  await expect.poll(() => state(page, id)).toEqual(before)
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 40, y + 30, {steps: 6})
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect.poll(() => state(page, id)).toEqual(before)
})

for (const flavour of ['image', 'shape', 'text-box', 'word-art']) {
  test(`${flavour}: selected underlay handles are reachable above text without raising the object`, async ({page}) => {
    const {id, paragraphId} = await setup(page, flavour)
    await selectFromCoveredEdge(page, id)
    const handle = page.locator(`[data-bc-underlay-chrome="${id}"] [data-handle="south-east"]`)
    await expect(handle).toBeVisible()
    expect(await handle.evaluate(button => {
      const rect = button.getBoundingClientRect()
      return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === button
    })).toBe(true)
    const before = await state(page, id)
    await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.crud.undoManager.clearHistory())
    const rect = (await handle.boundingBox())!
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2)
    await page.mouse.down()
    await page.mouse.move(rect.x + rect.width / 2 + 40, rect.y + rect.height / 2 + 24, {steps: 8})
    await page.mouse.up()
    await expect.poll(async () => (await state(page, id)).props).not.toEqual(before.props)
    expect((await state(page, id)).layer).toBe('under')
    const object = page.locator(`[data-block-id="${id}"]`)
    expect(await object.evaluate(element => {
      const rect = element.getBoundingClientRect()
      return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
        ?.closest('[data-block-id]')?.getAttribute('data-block-id')
    })).toBe(paragraphId)
    // WordArt's existing instance transaction origin is not tracked by Undo;
    // the same failure was verified with its ordinary foreground controls.
    if (flavour !== 'word-art') {
      await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.crud.undoManager.undo())
      await expect.poll(() => state(page, id)).toEqual(before)
    }
    await page.locator(`[data-block-id="${paragraphId}"]`).click({position: {x: 160, y: 120}})
    await expect(page.locator('[data-bc-underlay-chrome]')).toHaveCount(0)
    await page.keyboard.type('正文输入')
    await expect(page.locator(`[data-block-id="${paragraphId}"]`)).toContainText('正文输入')
  })
}

for (const scale of [0.75, 1.5]) {
  test(`rotated underlay controls follow scale ${scale}, scrolling and rotation`, async ({page}) => {
    const {id} = await setup(page, 'image', 30, scale)
    await page.evaluate(id => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      doc.selection.selectBlock(id)
    }, id)
    const chrome = page.locator(`[data-bc-underlay-chrome="${id}"]`)
    const handles = chrome.locator('[data-handle]')
    await expect(handles).toHaveCount(8)
    for (const handle of await handles.all()) {
      expect(await handle.evaluate(button => {
        const r = button.getBoundingClientRect()
        return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === button
      })).toBe(true)
    }
    const aligned = () => page.evaluate(id => {
      const surface = document.querySelector(`[data-block-id="${id}"] .img-wrapper`)!.getBoundingClientRect()
      const frame = document.querySelector(`[data-bc-underlay-chrome="${id}"] .shape-resizer__frame`)!.getBoundingClientRect()
      return Math.max(Math.abs(surface.x - frame.x), Math.abs(surface.y - frame.y),
        Math.abs(surface.width - frame.width), Math.abs(surface.height - frame.height))
    }, id)
    await expect.poll(aligned).toBeLessThan(1)
    await page.evaluate(() => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      doc.scrollContainer.scrollTop += 40
    })
    await expect.poll(aligned).toBeLessThan(1)
    const r = (await page.locator(`[data-block-id="${id}"] .img-wrapper`).boundingBox())!
    const knob = (await chrome.locator('.shape-resizer__rotate').boundingBox())!
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2
    const x = knob.x + knob.width / 2, y = knob.y + knob.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.keyboard.down('Shift')
    await page.mouse.move(cx - (y - cy), cy + (x - cx), {steps: 12})
    await page.mouse.up()
    await page.keyboard.up('Shift')
    await expect.poll(async () => (await state(page, id)).props.rotation).toBe(120)
    await expect.poll(aligned).toBeLessThan(1)
    await page.evaluate(id => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      doc.placement.setLayer(id, 'over')
    }, id)
    await expect(chrome).toHaveCount(0)
    await expect(page.locator(`[data-block-id="${id}"] shape-resizer`)).toHaveCount(1)
  })
}

test('underlay controls close on readonly and document destruction', async ({page}) => {
  const {id} = await setup(page)
  await selectFromCoveredEdge(page, id)
  await expect(page.locator(`[data-bc-underlay-chrome="${id}"]`)).toHaveCount(1)
  const before = await state(page, id)
  await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.toggleReadonly(true)
  })
  await expect(page.locator('[data-bc-underlay-chrome]')).toHaveCount(0)
  expect(await state(page, id)).toEqual(before)
  await page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.toggleReadonly(false)
    doc.selection.selectBlock(id)
  }, id)
  await expect(page.locator(`[data-bc-underlay-chrome="${id}"]`)).toHaveCount(1)
  await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.destroy())
  await expect(page.locator('[data-bc-underlay-chrome]')).toHaveCount(0)
})

test('a selected image inside an underlay group keeps its original resize and group undo', async ({page}) => {
  const {id} = await setup(page)
  const groupId = await page.evaluate(async id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const sibling = doc.schemas.createSnapshot('shape', ['rectangle'])
    sibling.props = {...sibling.props, width: 100, height: 60}
    const siblingId = doc.placement.insertAbsoluteSnapshot(sibling, {anchorRect: null, layer: 'under'})
    doc.crud.updateBlockProps(siblingId, {position: '450 100'})
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const groupId = doc.placement.group([id, siblingId])
    if (!groupId) throw new Error('Failed to group underlay objects')
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    doc.selection.selectBlock(id)
    doc.crud.undoManager.clearHistory()
    return groupId as string
  }, id)
  const handle = page.locator(`[data-bc-underlay-chrome="${id}"] [data-handle="south-east"]`)
  await expect(handle).toBeVisible()
  const before = await state(page, id)
  const groupBefore = await state(page, groupId)
  const r = (await handle.boundingBox())!
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2)
  await page.mouse.down()
  await page.mouse.move(r.x + r.width / 2 + 40, r.y + r.height / 2 + 24, {steps: 8})
  await page.mouse.up()
  await expect.poll(async () => (await state(page, id)).props).not.toEqual(before.props)
  await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.crud.undoManager.undo())
  await expect.poll(() => state(page, id)).toEqual(before)
  await expect.poll(() => state(page, groupId)).toEqual(groupBefore)
})

test('a selected underlay text box moves from its lifted border', async ({page}) => {
  const {id} = await setup(page, 'text-box')
  await selectFromCoveredEdge(page, id)
  const edge = page.locator(`[data-bc-underlay-chrome="${id}"] [data-move-edge="north"]`)
  await expect(edge).toBeVisible()
  const before = await state(page, id)
  const r = (await edge.boundingBox())!
  const x = r.x + r.width / 4, y = r.y + r.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 40, y + 30, {steps: 6})
  await page.mouse.up()
  await expect.poll(async () => (await state(page, id)).x).toBe(before.x + 40)
  await expect.poll(async () => (await state(page, id)).y).toBe(before.y + 30)
  expect((await state(page, id)).props.width).toBe(before.props.width)
  expect((await state(page, id)).props.height).toBe(before.props.height)
})

test('a rotated underlay image is recovered from its visible edge', async ({page}) => {
  const {id} = await setup(page, 'image', 30)
  const point = await page.locator(`[data-block-id="${id}"] .img-wrapper`).evaluate(surface => {
    const r = surface.getBoundingClientRect()
    const x = -surface.clientWidth / 4, y = -surface.clientHeight / 2 + 1
    const angle = Math.PI / 6
    return {x: r.x + r.width / 2 + x * Math.cos(angle) - y * Math.sin(angle),
      y: r.y + r.height / 2 + x * Math.sin(angle) + y * Math.cos(angle)}
  })
  await page.mouse.click(point.x, point.y)
  await expect(page.locator(`[data-block-id="${id}"]`)).toHaveClass(/selected/)
  await expect(page.locator(`[data-bc-underlay-chrome="${id}"] [data-handle]`)).toHaveCount(8)
})

test('underlay controls follow theme changes and remain absent from print', async ({page}) => {
  const {id} = await setup(page)
  await selectFromCoveredEdge(page, id)
  const chrome = page.locator(`[data-bc-underlay-chrome="${id}"]`)
  await expect(chrome).toBeVisible()
  await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.toggleTheme('dark'))
  await expect.poll(() => page.evaluate(id => {
    const surface = document.querySelector(`[data-block-id="${id}"] .img-wrapper`)!
    const pane = document.querySelector(`[data-bc-underlay-chrome="${id}"]`)!
    return getComputedStyle(surface).getPropertyValue('--bc-bg-primary') ===
      getComputedStyle(pane).getPropertyValue('--bc-bg-primary')
  }, id)).toBe(true)
  await page.emulateMedia({media: 'print'})
  await expect(chrome).toBeHidden()
  await page.emulateMedia({media: 'screen'})
  await expect(chrome).toBeVisible()
})
