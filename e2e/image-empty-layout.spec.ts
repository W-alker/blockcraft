import {expect, test} from '@playwright/test'

test('empty image preserves authored ratio through compact flow, floating and loaded states', async ({page}) => {
  await page.routeWebSocket('**', socket => socket.close())
  // This layout test does not need the Demo's external embeds or resources.
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    const external = ['http:', 'https:'].includes(url.protocol) &&
      !['127.0.0.1', 'localhost'].includes(url.hostname)
    return external ? route.abort() : route.continue()
  })
  await page.route('**/api/worker/link-preview**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: '{}',
  }))
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
    const inner = hint?.getBoundingClientRect()
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    return {
      frame: {x: outer.x, y: outer.y, width: outer.width, height: outer.height},
      hint: inner ? {x: inner.x, y: inner.y, width: inner.width, height: inner.height} : null,
      props: {...doc.model.getProps(id)},
    }
  }, imageId)

  const before = await bounds()
  expect(before.hint).toEqual(before.frame)
  expect(before.frame.height).toBe(80)

  await page.evaluate(id => {
    const editor = document.querySelector('block-craft-editor')!
    const doc = (window as any).ng.getComponent(editor).doc
    doc.crud.updateBlockProps(id, {wr: 20})
  }, imageId)
  await expect.poll(async () => (await bounds()).frame.width).toBeLessThan(before.frame.width)
  const after = await bounds()
  expect(after.hint).toEqual(after.frame)
  expect(after.frame.height).toBe(80)
  expect(after.props).toMatchObject({wr: 20, ar: 2, src: ''})

  const expectRatioFrame = async () => {
    await expect.poll(async () => {
      const {frame} = await bounds()
      return Math.abs(frame.height - frame.width / 2)
    }).toBeLessThan(0.1)
  }
  await page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.placement.setMode(id, 'absolute')
  }, imageId)
  await expectRatioFrame()
  const floating = await bounds()
  expect(floating.hint).toEqual(floating.frame)
  expect(floating.props).toMatchObject({wr: 20, ar: 2, src: ''})

  await page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.placement.setMode(id, 'relative')
    const canvas = document.createElement('canvas')
    canvas.width = 200
    canvas.height = 100
    doc.crud.updateBlockProps(id, {src: canvas.toDataURL()})
  }, imageId)
  await expect(hint).toHaveCount(0)
  await expect(frame).toHaveAttribute('data-bc-resource-state', 'ready')
  await expectRatioFrame()
  expect((await bounds()).props).toMatchObject({wr: 20, ar: 2})

  await page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.crud.updateBlockProps(id, {src: ''})
  }, imageId)
  await expect(hint).toBeVisible()
  await expect.poll(async () => (await bounds()).frame.height).toBe(80)
  expect((await bounds()).props).toMatchObject({wr: 20, ar: 2, src: ''})
})
