import {expect, test, type Page} from '@playwright/test'

async function initialize(page: Page) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    return ['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname)
      ? route.abort() : route.continue()
  })
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
}

async function geometry(page: Page, id: string) {
  return page.locator(`[data-block-id="${id}"]`).evaluate(host => {
    const rect = (element: Element) => {
      const {left, right, top, bottom, width, height} = element.getBoundingClientRect()
      return {left, right, top, bottom, width, height}
    }
    const selection = document.getSelection()
    return {
      host: rect(host),
      image: rect(host.querySelector('.img-wrapper')!),
      before: rect(host.querySelector(':scope > [data-block-gap-side="before"]')!),
      after: rect(host.querySelector(':scope > [data-block-gap-side="after"]')!),
      nativeSide: selection?.anchorNode?.parentElement?.getAttribute('data-block-gap-side'),
    }
  })
}

test('image gap anchors follow the visual frame across alignment, width and view scale', async ({page}) => {
  await initialize(page)
  const id = await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const canvas = document.createElement('canvas')
    canvas.width = 240
    canvas.height = 120
    const image = doc.schemas.createSnapshot('image', [{src: canvas.toDataURL(), wr: 25, ar: 2}])
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [image])
    return image.id as string
  })
  const block = page.locator(`[data-block-id="${id}"]`)
  await expect(block.locator('.img-wrapper')).toHaveAttribute('data-bc-resource-state', 'ready')
  for (const scale of [1, .75, 1.5]) {
    for (const align of [null, 'center', 'right']) {
      for (const wr of [25, 60, 100]) {
        await page.evaluate(({id, scale, align, wr}) => {
          const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
          doc.viewScale.setScale(scale)
          doc.crud.updateBlockProps(id, {align, wr})
          doc.selection.setGapCursor(id, 'after')
        }, {id, scale, align, wr})
        await block.scrollIntoViewIfNeeded()
        await expect.poll(async () => {
          const {after, image} = await geometry(page, id)
          return Math.abs(after.left - image.right - scale)
        }).toBeLessThan(.6)
        const bounds = await geometry(page, id)
        expect(Math.abs(bounds.before.left - bounds.image.left + 2 * scale)).toBeLessThan(.6)
        expect(bounds.nativeSide).toBe('after')
        if (wr < 100) expect(bounds.host.width).toBeGreaterThan(bounds.image.width + 30)
        if (align === 'center') expect(Math.abs((bounds.image.left + bounds.image.right) - (bounds.host.left + bounds.host.right))).toBeLessThan(1)
        else if (align === 'right') expect(Math.abs(bounds.image.right - bounds.host.right)).toBeLessThan(.6)
        else expect(Math.abs(bounds.image.left - bounds.host.left)).toBeLessThan(.6)
      }
    }
  }
})

test('narrow column image gaps support clicks, typing, undo and resize previews', async ({page}) => {
  await initialize(page)
  const {id, parentId} = await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const canvas = document.createElement('canvas')
    canvas.width = 240
    canvas.height = 120
    const image = doc.schemas.createSnapshot('image', [{src: canvas.toDataURL(), wr: 15, ar: 2}, null, null, '图片说明'])
    const table = doc.schemas.createSnapshot('table', [1, 1])
    table.props.colWidths = [260]
    const cell = table.children[0].children[0]
    cell.children = [image]
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [table])
    return {id: image.id as string, parentId: cell.id as string}
  })
  const block = page.locator(`[data-block-id="${id}"]`)
  const image = block.locator('.img-wrapper')
  await expect(image).toHaveAttribute('data-bc-resource-state', 'ready')
  await block.scrollIntoViewIfNeeded()
  const before = await geometry(page, id)
  // Table gaps stay just inside the content edge to avoid its overflow clip.
  expect(Math.abs(before.after.right - before.image.right)).toBeLessThan(.6)
  await page.mouse.click(before.image.right + 15, before.image.top + before.image.height / 2)
  await expect.poll(async () => (await geometry(page, id)).nativeSide).toBe('after')

  await page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.crud.undoManager.clearHistory()
    doc.selection.setGapCursor(id, 'before')
  }, id)
  await page.keyboard.press('Enter')
  const children = () => page.evaluate(parentId => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    return doc.model.getChildrenIds(parentId).map((childId: string) => ({id: childId, flavour: doc.model.getFlavour(childId)}))
  }, parentId)
  await expect.poll(children).toEqual([{id: expect.any(String), flavour: 'paragraph'}, {id, flavour: 'image'}])
  await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.crud.undoManager.undo())
  await expect.poll(children).toEqual([{id, flavour: 'image'}])
  await page.evaluate(id => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.selection.setGapCursor(id, 'after'), id)
  await page.keyboard.insertText('after image')
  await expect.poll(children).toEqual([{id, flavour: 'image'}, {id: expect.any(String), flavour: 'paragraph'}])
  await expect.poll(() => page.evaluate(parentId => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    return doc.model.getText(doc.model.getChildrenIds(parentId)[1])
  }, parentId)).toBe('after image')
  // WebKit may retain InlineRuntime's zero-width caret anchor before the text.
  await expect(block.locator('..').locator('.paragraph-block')).toHaveText(/after image$/)
  await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.crud.undoManager.undo())
  await expect.poll(children).toEqual([{id, flavour: 'image'}])

  await page.evaluate(id => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.selection.selectBlock(id), id)
  const grip = image.locator('[data-handle="east"]')
  const box = (await grip.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 35, box.y + box.height / 2, {steps: 5})
  await expect.poll(async () => (await geometry(page, id)).image.width).toBeGreaterThan(before.image.width + 30)
  const preview = await geometry(page, id)
  expect(Math.abs(preview.after.right - preview.image.right)).toBeLessThan(.6)
  await page.mouse.up()
  const committed = await geometry(page, id)
  expect(Math.abs(committed.after.right - committed.image.right)).toBeLessThan(.6)
})
