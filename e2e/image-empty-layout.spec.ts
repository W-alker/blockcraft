import {expect, test} from '@playwright/test'

test('empty image hint follows the image frame when its size changes', async ({page}) => {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => {
    const editor = document.querySelector('block-craft-editor')
    return !!editor && !!(window as any).ng?.getComponent(editor)?.doc?.isInitialized
  })

  const imageId = await page.evaluate(() => {
    const editor = document.querySelector('block-craft-editor')!
    const doc = (window as any).ng.getComponent(editor).doc
    const image = doc.schemas.createSnapshot('image', [{src: '', wr: 40, ar: 2}])
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [image])
    return image.id as string
  })

  const frame = page.locator(`[data-block-id="${imageId}"] .img-wrapper`)
  const hint = frame.locator('.upload-hint')
  await expect(hint).toBeVisible()

  const bounds = async () => page.evaluate(id => {
    const image = document.querySelector<HTMLElement>(`[data-block-id="${id}"] .img-wrapper`)!
    const hint = image.querySelector<HTMLElement>('.upload-hint')!
    const outer = image.getBoundingClientRect()
    const inner = hint.getBoundingClientRect()
    return {
      frame: {x: outer.x, y: outer.y, width: outer.width, height: outer.height},
      hint: {x: inner.x, y: inner.y, width: inner.width, height: inner.height},
    }
  }, imageId)

  const before = await bounds()
  expect(before.hint).toEqual(before.frame)

  await page.evaluate(id => {
    const editor = document.querySelector('block-craft-editor')!
    const doc = (window as any).ng.getComponent(editor).doc
    doc.crud.updateBlockProps(id, {wr: 20})
  }, imageId)
  await expect.poll(async () => (await bounds()).frame.width).toBeLessThan(before.frame.width)
  const after = await bounds()
  expect(after.hint).toEqual(after.frame)
  expect(after.frame.height).toBeCloseTo(after.frame.width / 2, 1)
})
