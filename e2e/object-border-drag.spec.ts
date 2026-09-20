import {expect, test, type Page} from '@playwright/test'

type ObjectFlavour = 'shape' | 'text-box' | 'word-art'

async function createObject(page: Page, flavour: ObjectFlavour): Promise<string> {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng
    ?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  return page.evaluate(async flavour => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const props = {width: 280, height: 160}
    const snapshot = doc.schemas.createSnapshot(flavour, flavour === 'shape'
      ? ['diamond']
      : ['边框拖拽测试', props])
    snapshot.props = {...snapshot.props, ...props}
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot])
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    doc.placement.setMode(doc.getBlockById(snapshot.id), 'absolute')
    doc.placement.updateAbsolute(snapshot.id, {x: 100, y: 100})
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    const block = doc.getBlockById(snapshot.id)
    block.hostElement.scrollIntoView({block: 'center'})
    doc.selection.selectBlock(block)
    doc.crud.undoManager.clearHistory()
    return snapshot.id
  }, flavour)
}

async function position(page: Page, id: string) {
  return page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const {x, y} = doc.placement.getState(id)
    return {x, y}
  }, id)
}

async function selectObject(page: Page, id: string): Promise<void> {
  await page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.selection.selectBlock(doc.getBlockById(id))
  }, id)
  await expect(page.locator(`[data-block-id="${id}"] .shape-resizer__frame`)).toBeVisible()
}

for (const flavour of ['shape', 'text-box', 'word-art'] as const) {
  test(`${flavour} moves from all four selection borders without resizing`, async ({page}) => {
    const id = await createObject(page, flavour)
    const block = page.locator(`[data-block-id="${id}"]`)
    const frame = block.locator('.shape-resizer__frame')
    await expect(frame).toBeVisible()
    for (const edge of ['north', 'east', 'south', 'west']) {
      await selectObject(page, id)
      const before = (await frame.boundingBox())!
      const origin = await position(page, id)
      // Hit the visible outline between handles, including its outer half.
      const x = edge === 'west' ? before.x - 2 : edge === 'east'
        ? before.x + before.width + 2 : before.x + before.width / 4
      const y = edge === 'north' ? before.y - 2 : edge === 'south'
        ? before.y + before.height + 2 : before.y + before.height / 4
      expect(await page.evaluate(({x, y}) => {
        const target = document.elementFromPoint(x, y)!
        return {edge: target.getAttribute('data-move-edge'), cursor: getComputedStyle(target).cursor}
      }, {x, y})).toEqual({edge, cursor: 'move'})
      await page.mouse.move(x, y)
      await page.mouse.down()
      await page.mouse.move(x + 32, y + 24, {steps: 5})
      await page.mouse.up()
      await expect.poll(() => position(page, id)).toEqual({x: origin.x + 32, y: origin.y + 24})
      await selectObject(page, id)
      const after = (await frame.boundingBox())!
      expect(after.x).toBeCloseTo(before.x + 32, 0)
      expect(after.y).toBeCloseTo(before.y + 24, 0)
      expect(after.width).toBeCloseTo(before.width, 0)
      expect(after.height).toBeCloseTo(before.height, 0)
      await expect(block.locator('.shape-resizer__handle:visible')).toHaveCount(8)
    }
  })
}

test('shape border movement supports cancellation and a single undo/redo', async ({page}) => {
  const id = await createObject(page, 'shape')
  const block = page.locator(`[data-block-id="${id}"]`)
  const surface = block.locator('[data-bc-object-surface]')
  const before = (await surface.boundingBox())!
  const origin = await position(page, id)
  const startDrag = async () => {
    await selectObject(page, id)
    const box = (await block.locator('.shape-resizer__frame').boundingBox())!
    const x = box.x + box.width / 4
    const y = box.y - 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 32, y + 24, {steps: 5})
    await expect.poll(async () => (await surface.boundingBox())!.x).toBeCloseTo(before.x + 32, 0)
  }
  await startDrag()
  await page.keyboard.press('Escape')
  await page.mouse.up()
  expect(await position(page, id)).toEqual(origin)
  await expect.poll(async () => (await surface.boundingBox())!.x).toBeCloseTo(before.x, 0)

  await startDrag()
  await page.mouse.up()
  await expect.poll(() => position(page, id)).toEqual({x: origin.x + 32, y: origin.y + 24})
  await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.crud.undoManager.undo()
  })
  await expect.poll(() => position(page, id)).toEqual(origin)
  await expect.poll(async () => (await surface.boundingBox())!.x).toBeCloseTo(before.x, 0)
  expect(await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    return doc.crud.undoManager.isCanUndo()
  })).toBe(false)
  await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.crud.undoManager.redo()
  })
  await expect.poll(() => position(page, id)).toEqual({x: origin.x + 32, y: origin.y + 24})
})

test('shape resize, rotation and double-click text editing keep their own gestures', async ({page}) => {
  const id = await createObject(page, 'shape')
  const block = page.locator(`[data-block-id="${id}"]`)
  const origin = await position(page, id)
  // Diamond vertex controls occupy the side midpoints; use a resize corner.
  const resize = (await block.locator('[data-handle="south-east"]').boundingBox())!
  await page.mouse.move(resize.x + resize.width / 2, resize.y + resize.height / 2)
  await page.mouse.down()
  await page.mouse.move(resize.x + resize.width / 2 + 40, resize.y + resize.height / 2, {steps: 5})
  await page.mouse.up()
  await expect.poll(() => block.locator('[data-bc-object-surface]').evaluate(element => element.getBoundingClientRect().width)).toBeCloseTo(320, 0)
  expect(await position(page, id)).toEqual(origin)

  const rotate = (await block.locator('.shape-resizer__rotate').boundingBox())!
  await page.mouse.move(rotate.x + rotate.width / 2, rotate.y + rotate.height / 2)
  await page.mouse.down()
  await page.mouse.move(rotate.x + 65, rotate.y + 30, {steps: 5})
  await page.mouse.up()
  await expect.poll(() => page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    return doc.getBlockById(id).props.rotation ?? 0
  }, id)).not.toBe(0)
  expect(await position(page, id)).toEqual(origin)
  await expect(block.locator('.shape-text-block')).toHaveCount(0)

  // A click still selects the empty shape; only double-click creates its text.
  const shell = block.locator('.shape-block__shell')
  await shell.click()
  await expect(block.locator('.shape-text-block')).toHaveCount(0)
  await shell.dblclick()
  const text = block.locator('.shape-text-block')
  await expect(text).toHaveCount(1)
  await page.keyboard.type('shape text')
  await expect(text).toContainText('shape text')
  await text.dblclick()
  await expect(block.locator('.shape-text-block')).toHaveCount(1)
})
