import {expect, test, type Page} from '@playwright/test'

async function createTextBox(page: Page, absolute: boolean): Promise<string> {
  // These geometry checks must not share document mutations with other tabs.
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng
    ?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  return page.evaluate(async absolute => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const snapshot = doc.schemas.createSnapshot('text-box', ['缩放后继续编辑', {width: 360, height: 180}])
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot])
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    const block = doc.getBlockById(snapshot.id)
    if (absolute) doc.placement.setMode(block, 'absolute')
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    block.hostElement.scrollIntoView({block: 'center'})
    doc.selection.selectBlock(block)
    return snapshot.id
  }, absolute)
}

async function expectObjectSelection(page: Page, id: string): Promise<void> {
  const block = page.locator(`.text-box-block[data-block-id="${id}"]`)
  await expect(block).toHaveClass(/\bselected\b/)
  await expect(block.locator('.shape-resizer__handle:visible')).toHaveCount(8)
  await expect.poll(() => page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const selection = doc.selection.value
    return selection?.anchor.blockId === id && selection?.head.blockId === id &&
      selection?.anchor.type === 'selected' && selection?.head.type === 'selected'
  }, id)).toBe(true)
}

for (const absolute of [false, true]) {
  const mode = absolute ? 'absolute' : 'flow'

  test(`${mode} text-box keeps all handles through slow width resize and rotation`, async ({page}) => {
    const id = await createTextBox(page, absolute)
    const block = page.locator(`.text-box-block[data-block-id="${id}"]`)
    const surface = block.locator('.text-box-block__surface')
    await expectObjectSelection(page, id)

    for (const side of ['east', 'west']) {
      const before = (await surface.boundingBox())!
      const handle = (await block.locator(`[data-handle="${side}"]`).boundingBox())!
      const x = handle.x + handle.width / 2
      const y = handle.y + handle.height / 2
      await page.mouse.move(x, y)
      await page.mouse.down()
      // Outlast programmatic selection suppression: a held gesture must stay
      // selected, rather than recovering only after pointerup.
      await page.waitForTimeout(150)
      await expectObjectSelection(page, id)
      await page.mouse.move(x + 40, y, {steps: 5})
      await page.waitForTimeout(150)
      await expectObjectSelection(page, id)
      const delta = side === 'east' ? 40 : -40
      await expect.poll(async () => (await surface.boundingBox())!.width)
        .toBeCloseTo(before.width + delta, 0)
      await page.mouse.up()
      await expectObjectSelection(page, id)
      await expect.poll(() => page.evaluate(id => {
        const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
        return doc.getBlockById(id).props.width
      }, id)).toBeCloseTo(before.width + delta, 0)
    }

    const rotate = (await block.locator('.shape-resizer__rotate').boundingBox())!
    await page.mouse.move(rotate.x + rotate.width / 2, rotate.y + rotate.height / 2)
    await page.mouse.down()
    await page.mouse.move(rotate.x + 65, rotate.y + 30, {steps: 5})
    await page.waitForTimeout(150)
    await expectObjectSelection(page, id)
    await page.mouse.up()
    await expectObjectSelection(page, id)
    await expect.poll(() => page.evaluate(id => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      return doc.getBlockById(id).props.rotation ?? 0
    }, id)).not.toBe(0)
  })

  test(`${mode} text-box cancels resize and releases selection to text editing`, async ({page}) => {
    const id = await createTextBox(page, absolute)
    const block = page.locator(`.text-box-block[data-block-id="${id}"]`)
    const surface = block.locator('.text-box-block__surface')
    await expectObjectSelection(page, id)
    const before = (await surface.boundingBox())!
    const handle = (await block.locator('[data-handle="east"]').boundingBox())!
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
    await page.mouse.down()
    await page.mouse.move(handle.x + 65, handle.y + handle.height / 2, {steps: 5})
    await expect.poll(async () => (await surface.boundingBox())!.width).toBeGreaterThan(before.width + 30)
    await page.keyboard.press('Escape')
    await page.mouse.up()
    await expect.poll(async () => (await surface.boundingBox())!.width).toBeCloseTo(before.width, 0)
    await expectObjectSelection(page, id)

    const paragraph = block.locator('.text-box-block__content [data-node-type="editable"]').first()
    await paragraph.click({position: {x: 20, y: 10}})
    await expect.poll(() => page.evaluate(() => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      return doc.selection.value?.anchor.type
    })).toBe('text')
    await expect(block.locator('.shape-resizer__handle:visible')).toHaveCount(0)
    await page.keyboard.type('typing')
    await expect(paragraph).toContainText('typing')
  })

  test(`${mode} text-box corner preview keeps the selection chrome on its surface`, async ({page}) => {
    const id = await createTextBox(page, absolute)
    const block = page.locator(`.text-box-block[data-block-id="${id}"]`)
    const surface = block.locator('.text-box-block__surface')
    const before = (await surface.boundingBox())!
    const handle = (await block.locator('[data-handle="north-west"]').boundingBox())!
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
    await page.mouse.down()
    await page.mouse.move(handle.x + handle.width / 2 + 60, handle.y + handle.height / 2 - 30, {steps: 5})
    await page.waitForTimeout(150)
    await expectObjectSelection(page, id)
    // The generic selected host fill must not remain at its old coordinates.
    await expect(block).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    const preview = (await surface.boundingBox())!
    const frame = (await block.locator('.shape-resizer__frame').boundingBox())!
    expect(preview.width).toBeCloseTo(before.width - 60, 0)
    expect(preview.height).toBeCloseTo(before.height + 30, 0)
    expect(preview.x).toBeCloseTo(before.x + (absolute ? 60 : 0), 0)
    expect(preview.y).toBeCloseTo(before.y - (absolute ? 30 : 0), 0)
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect(frame[key]).toBeCloseTo(preview[key], 0)
    }
    await page.mouse.up()
    await expectObjectSelection(page, id)
    const committed = (await surface.boundingBox())!
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect(committed[key]).toBeCloseTo(preview[key], 0)
    }
  })
}
