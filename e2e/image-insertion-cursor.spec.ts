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
  const fixture = await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const canvas = document.createElement('canvas')
    canvas.width = 240
    canvas.height = 120
    canvas.getContext('2d')!.fillRect(0, 0, 240, 120)
    const paragraph = doc.schemas.createSnapshot('paragraph', [[]])
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [paragraph])
    doc.selection.setCursorAtBlock(paragraph.id, true)
    ;(window as any).__insertImageDataUrl = canvas.toDataURL()
    return {paragraphId: paragraph.id as string, data: canvas.toDataURL().split(',')[1] as string}
  })
  await page.route('**/cursor-insert.png', route => route.fulfill({contentType: 'image/png', body: Buffer.from(fixture.data, 'base64')}))
  return fixture
}

async function expectAfterImage(page: Page) {
  const read = () => page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const selection = doc.selection.value
    return {type: selection?.anchor.type, side: selection?.anchor.side,
      flavour: selection ? doc.model.getFlavour(selection.anchor.blockId) : null}
  })
  await expect.poll(read).toEqual({type: 'gap', side: 'after', flavour: 'image'})
  const id = await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.selection.value.anchor.blockId as string)
  const image = page.locator(`[data-block-id="${id}"]`)
  await expect(image).not.toHaveClass(/selected/)
  await expect.poll(() => image.evaluate(() => document.getSelection()?.anchorNode?.parentElement?.getAttribute('data-block-gap-side'))).toBe('after')
  return id
}

for (const entry of ['toolbar', 'slash', 'block-menu'] as const) {
  test(`${entry} image insertion places the caret after the image and supports typing/history`, async ({page}) => {
    const {paragraphId} = await initialize(page)
    if (entry === 'toolbar') await page.getByRole('button', {name: '插入图片', exact: true}).click()
    else if (entry === 'slash') {
      await page.keyboard.type('/')
      const menu = page.locator('block-transformer-contextmenu')
      await expect(menu).toBeVisible()
      await menu.getByRole('option').filter({has: page.locator('.list__label', {hasText: /^图片$/})}).click()
    } else {
      await page.evaluate(id => {
        const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
        doc.dndService.onInsertNewBlock('image', {}, doc.getBlockById(id), 'after')
      }, paragraphId)
    }
    const creator = page.locator('media-creator')
    await creator.locator('input[type="text"]').fill('http://127.0.0.1:8081/cursor-insert.png')
    await creator.getByRole('button', {name: '确定', exact: true}).click()
    await expect(creator).toHaveCount(0)
    const imageId = await expectAfterImage(page)
    await page.keyboard.insertText('next')
    await expect.poll(() => page.evaluate(imageId => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      return doc.model.getText(doc.model.getNextSiblingId(imageId))
    }, imageId)).toBe('next')
    await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.crud.undoManager.undo())
    expect(await expectAfterImage(page)).toBe(imageId)
    await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.crud.undoManager.redo())
    await expect(page.locator(`[data-block-id="${imageId}"]`)).toBeVisible()
  })
}

for (const entry of ['paste', 'file-drop', 'empty-image'] as const) {
  test(`${entry} focuses after insertion without refocusing on upload completion`, async ({page}) => {
    const {paragraphId, data} = await initialize(page)
    await page.evaluate(() => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      const service = doc.plugins.find((plugin: any) => plugin.name === 'img-toolbar').fileService
      service.uploadImg = () => new Promise(resolve => { (window as any).__finishImageUpload = resolve })
    })
    if (entry === 'empty-image') {
      const id = await page.evaluate(() => {
        const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
        const image = doc.schemas.createSnapshot('image', [''])
        doc.crud.insertBlockSnapshots(doc.rootId, 0, [image])
        return image.id as string
      })
      const chooser = page.waitForEvent('filechooser')
      await page.locator(`[data-block-id="${id}"] .upload-hint`).click()
      await (await chooser).setFiles({name: 'image.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64')})
    } else {
      await page.evaluate(async ({entry, paragraphId}) => {
        const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
        const blob = await (await fetch((window as any).__insertImageDataUrl)).blob()
        const transfer = new DataTransfer()
        transfer.items.add(new File([blob], 'image.png', {type: 'image/png'}))
        if (entry === 'file-drop') doc.dndService.onInsertFiles(transfer.files, doc.getBlockById(paragraphId), 'after')
        else {
          const event = new ClipboardEvent('paste', {bubbles: true, cancelable: true})
          Object.defineProperty(event, 'clipboardData', {value: transfer})
          doc.getBlockById(paragraphId).hostElement.dispatchEvent(event)
        }
      }, {entry, paragraphId})
    }
    const imageId = await expectAfterImage(page)
    await page.keyboard.insertText('next')
    await expect.poll(() => page.evaluate(() => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      return doc.model.getText(doc.selection.value?.anchor.blockId)
    })).toBe('next')
    await page.evaluate(() => (window as any).__finishImageUpload('http://127.0.0.1:8081/cursor-insert.png'))
    await expect(page.locator(`[data-block-id="${imageId}"] img`)).toHaveAttribute('src', 'http://127.0.0.1:8081/cursor-insert.png')
    expect(await page.evaluate(() => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      return doc.selection.value.anchor.type
    })).toBe('text')
  })
}
