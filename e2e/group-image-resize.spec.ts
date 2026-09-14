import {expect, test, type Page} from '@playwright/test'

async function mountFixture(page: Page, snapshot?: any) {
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => {
    const editor = document.querySelector('block-craft-editor')
    return !!editor && !!(window as any).ng?.getComponent(editor)?.doc?.isInitialized
  })
  return page.evaluate(snapshot => {
    const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const viewport = document.createElement('div')
    viewport.id = 'image-resize-fixture'
    viewport.style.cssText = 'position:fixed;left:40px;top:40px;width:900px;height:700px;overflow:auto;background:white;z-index:99999'
    const mount = document.createElement('div')
    viewport.appendChild(mount)
    document.body.appendChild(viewport)
    const root = snapshot ?? {...source.model.toSnapshot(source.rootId), children: []}
    const doc = new source.constructor({
      ...source.config,
      yDoc: new source.yDoc.constructor(),
      plugins: [],
      scrollContainer: viewport,
      readonly: false,
      virtualization: {enabled: false},
    })
    ;(window as any).__imageResizeDoc = doc
    doc.initBySnapshot(root, mount)
    if (snapshot) return null

    // A local raster avoids resource timing and network dependencies.
    const canvas = document.createElement('canvas')
    canvas.width = 400
    canvas.height = 200
    const context = canvas.getContext('2d')!
    context.fillStyle = '#4488cc'
    context.fillRect(0, 0, 400, 200)
    const src = canvas.toDataURL()
    const insertImage = (width: number, x: number, y: number) => {
      const image = doc.schemas.createSnapshot('image', [{src, wr: width / doc.objectSizing.rootContentWidth * 100, ar: 2}])
      const id = doc.placement.insertAbsoluteSnapshot(image, {anchorRect: null})
      doc.crud.updateBlockProps(id, {position: {x, y}})
      return id
    }
    const imageId = insertImage(400, 140, 80)
    const siblingId = insertImage(100, 390, 330)
    const groupId = doc.placement.group([imageId, siblingId])
    if (!groupId) throw new Error('Failed to create image group')
    const outsideId = insertImage(200, 140, 450)
    return {imageId, siblingId, groupId, outsideId}
  }, snapshot)
}

async function readGeometry(page: Page, ids: {imageId: string; siblingId: string; groupId: string}) {
  return page.evaluate(ids => {
    const doc = (window as any).__imageResizeDoc
    const image = doc.getBlockById(ids.imageId)
    const sibling = doc.getBlockById(ids.siblingId)
    const rect = image.imgWrapper.nativeElement.getBoundingClientRect()
    const siblingRect = sibling.imgWrapper.nativeElement.getBoundingClientRect()
    return {
      width: rect.width,
      height: rect.height,
      right: rect.right,
      computedWidth: parseFloat(getComputedStyle(image.imgWrapper.nativeElement).width),
      modelWidth: image.objectDimensions.width,
      props: doc.model.getProps(ids.imageId),
      group: doc.model.getProps(ids.groupId),
      sibling: {x: siblingRect.x, y: siblingRect.y, width: siblingRect.width, height: siblingRect.height},
    }
  }, ids)
}

async function dragImage(page: Page, id: string, side: 'left' | 'right', delta: number) {
  const image = page.locator(`#image-resize-fixture [data-block-id="${id}"] .img-wrapper`)
  await image.hover()
  const handle = image.locator(`.block-resizer__bar--${side}`)
  const rect = await handle.boundingBox()
  if (!rect) throw new Error('Missing image resize handle')
  const x = rect.x + rect.width / 2
  const y = rect.y + rect.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + delta, y, {steps: 8})
  await page.mouse.up()
}

test.use({viewport: {width: 1400, height: 1000}})

for (const {side, flow} of [
  {side: 'left', flow: false},
  {side: 'right', flow: false},
  {side: 'right', flow: true},
] as const) {
  test(`${flow ? 'flow' : 'absolute'} group image ${side} resize persists beyond the old group width`, async ({page}) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const ids = (await mountFixture(page))!
    if (flow) {
      await page.evaluate(async id => {
        ;(window as any).__imageResizeDoc.placement.setMode(id, 'relative')
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      }, ids.groupId)
    }
    await expect.poll(async () => (await readGeometry(page, ids)).width).toBeCloseTo(400, 1)
    const before = await readGeometry(page, ids)
    await page.evaluate(id => {
      const doc = (window as any).__imageResizeDoc
      doc.crud.undoManager.stopCapturing()
      doc.selection.selectBlock(id)
    }, ids.groupId)

    await dragImage(page, ids.imageId, side, side === 'left' ? -100 : 100)
    await expect.poll(async () => (await readGeometry(page, ids)).modelWidth).toBeCloseTo(500, 1)
    const expanded = await readGeometry(page, ids)
    expect(expanded.width).toBeCloseTo(500, 1)
    expect(expanded.computedWidth).toBeCloseTo(500, 1)
    expect(expanded.height).toBeCloseTo(250, 1)
    expect(expanded.group.width).toBeCloseTo(before.group.width + 100, 1)
    expect(expanded.sibling).toEqual(before.sibling)
    expect(expanded.props.wr).toBe(100)
    expect(expanded.props.width).toBeUndefined()
    expect(expanded.props.height).toBeUndefined()
    if (side === 'left') expect(expanded.right).toBeCloseTo(before.right, 1)

    await page.evaluate(() => (window as any).__imageResizeDoc.crud.undoManager.undo())
    await expect.poll(async () => (await readGeometry(page, ids)).width).toBeCloseTo(400, 1)
    expect((await readGeometry(page, ids)).group).toEqual(before.group)
    await page.evaluate(() => (window as any).__imageResizeDoc.crud.undoManager.redo())
    await expect.poll(async () => (await readGeometry(page, ids)).width).toBeCloseTo(500, 1)

    const snapshot = await page.evaluate(() => {
      const doc = (window as any).__imageResizeDoc
      return doc.model.toSnapshot(doc.rootId)
    })
    // A full navigation recreates both the document and DOM from saved props.
    await mountFixture(page, snapshot)
    await expect.poll(async () => (await readGeometry(page, ids)).width).toBeCloseTo(500, 1)
    expect((await readGeometry(page, ids)).props).toEqual(expanded.props)

    await dragImage(page, ids.imageId, 'right', -200)
    await expect.poll(async () => (await readGeometry(page, ids)).modelWidth).toBeCloseTo(300, 1)
    expect((await readGeometry(page, ids)).width).toBeCloseTo(300, 1)
    expect((await readGeometry(page, ids)).sibling.width).toBeCloseTo(100, 1)
    expect(errors).toEqual([])
  })
}

test('ungrouped image retains ordinary ratio sizing', async ({page}) => {
  const ids = (await mountFixture(page))!
  const image = page.locator(`#image-resize-fixture [data-block-id="${ids.outsideId}"] .img-wrapper`)
  await expect.poll(async () => (await image.boundingBox())?.width).toBeCloseTo(200, 1)
  await dragImage(page, ids.outsideId, 'right', 100)
  await expect.poll(() => page.evaluate(id => {
    return (window as any).__imageResizeDoc.getBlockById(id).objectDimensions.width
  }, ids.outsideId)).toBeCloseTo(300, 1)
  expect((await image.boundingBox())!.width).toBeCloseTo(300, 1)
})
