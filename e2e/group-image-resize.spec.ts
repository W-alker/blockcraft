import {expect, test, type Page} from '@playwright/test'

async function mountFixture(page: Page, snapshot?: any, groupInteraction = false) {
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => {
    const editor = document.querySelector('block-craft-editor')
    return !!editor && !!(window as any).ng?.getComponent(editor)?.doc?.isInitialized
  })
  return page.evaluate(({snapshot, groupInteraction}) => {
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
      plugins: groupInteraction
        ? [new (source.plugins.find((plugin: any) => plugin.name === 'object-format-toolbar').constructor)()]
        : [],
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
  }, {snapshot, groupInteraction})
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

for (const flow of [true, false]) {
  test(`${flow ? 'flow' : 'absolute'} group whitespace opens its toolbar and preserves layout actions`, async ({page}) => {
    const ids = (await mountFixture(page, undefined, true))!
    await page.evaluate(({id, flow}) => {
      const doc = (window as any).__imageResizeDoc
      document.getElementById('image-resize-fixture')!.style.zIndex = '999'
      if (flow) doc.placement.setMode(id, 'relative')
      doc.selection.blur()
    }, {id: ids.groupId, flow})
    const group = page.locator(`#image-resize-fixture [data-block-id="${ids.groupId}"]`)
    // Between the first image's bottom (200) and the second image's top (250).
    await group.locator(':scope > .object-group-block__children').click({position: {x: 60, y: 225}})
    await expect(group).toHaveClass(/selected/)
    const toolbar = page.locator('bc-object-group-toolbar')
    await expect(toolbar).toBeVisible()
    await expect(toolbar.getByRole('button', {name: '上下型', exact: true}))
      .toHaveAttribute('aria-pressed', `${flow}`)
    const ungroup = toolbar.getByRole('button', {name: '取消组合', exact: true})
    if (flow) await expect(ungroup).toBeDisabled()
    else await expect(ungroup).toBeEnabled()
    if (flow) {
      await expect(toolbar.getByRole('button', {name: '上移一层', exact: true})).toBeDisabled()
      await expect(toolbar.getByRole('button', {name: '下移一层', exact: true})).toBeDisabled()
    }
    await page.evaluate(id => (window as any).__imageResizeDoc.selection.selectBlock(id), ids.imageId)
    await expect(toolbar).toHaveCount(0)
    await group.locator(':scope > .object-group-block__children').click({position: {x: 60, y: 225}})
    await expect(toolbar).toBeVisible()
    await toolbar.getByRole('button', {name: flow ? '浮于文字上方' : '上下型', exact: true}).click()
    await expect.poll(() => page.evaluate(id =>
      (window as any).__imageResizeDoc.placement.getObjectLayout(id), ids.groupId,
    )).toBe(flow ? 'over' : 'top-bottom')
    // Layout commands close the current toolbar; another blank click reopens it.
    await group.locator(':scope > .object-group-block__children').click({position: {x: 60, y: 225}})
    await expect(toolbar).toBeVisible()
    await expect(toolbar.getByRole('button', {name: '上下型', exact: true}))
      .toHaveAttribute('aria-pressed', `${!flow}`)
  })
}

test('group frame stays outside the full-width content plane in absolute and flow layouts', async ({page}) => {
  const ids = (await mountFixture(page))!
  const fullWidth = await page.evaluate(ids => {
    const doc = (window as any).__imageResizeDoc
    doc.placement.ungroup(ids.groupId)
    const width = doc.objectSizing.rootContentWidth
    doc.crud.updateBlockProps(ids.imageId, {wr: 100, ar: 2, position: {x: 0, y: 0}})
    doc.crud.updateBlockProps(ids.siblingId, {position: {x: 20, y: 20}})
    return width
  }, ids)
  await expect.poll(async () => (await page.locator(
    `#image-resize-fixture [data-block-id="${ids.imageId}"] .img-wrapper`,
  ).boundingBox())?.width).toBeCloseTo(fullWidth, 1)
  ids.groupId = await page.evaluate(ids => {
    const doc = (window as any).__imageResizeDoc
    return doc.placement.group([ids.imageId, ids.siblingId])
  }, ids)

  for (const flow of [false, true]) {
    await page.evaluate(({id, flow}) => {
      const doc = (window as any).__imageResizeDoc
      if (flow) doc.placement.setMode(id, 'relative')
      doc.selection.selectBlock(id)
    }, {id: ids.groupId, flow})
    await expect.poll(async () => (await readGeometry(page, ids)).width).toBeCloseTo(fullWidth, 1)
    const geometry = await page.evaluate(ids => {
      const doc = (window as any).__imageResizeDoc
      const group = doc.getBlockById(ids.groupId).hostElement as HTMLElement
      const content = group.querySelector<HTMLElement>('.object-group-block__children')!
      const rect = group.getBoundingClientRect()
      const contentRect = content.getBoundingClientRect()
      const style = getComputedStyle(group)
      const edge = group.querySelector<HTMLElement>('[data-move-edge="east"]')!
      return {
        groupWidth: rect.width,
        contentWidth: contentRect.width,
        offsetX: contentRect.left - rect.left,
        offsetY: contentRect.top - rect.top,
        padding: style.padding,
        outlineOffset: style.outlineOffset,
        edgeDisplay: getComputedStyle(edge).display,
        edgeCenter: edge.getBoundingClientRect().x + edge.getBoundingClientRect().width / 2 - rect.right,
        referenceWidth: doc.objectSizing.getReferenceWidth(ids.imageId),
      }
    }, ids)
    expect(geometry.groupWidth).toBeCloseTo(fullWidth, 1)
    expect(geometry.contentWidth).toBeCloseTo(fullWidth, 1)
    expect(geometry.referenceWidth).toBeCloseTo(fullWidth, 1)
    expect(geometry.offsetX).toBe(0)
    expect(geometry.offsetY).toBe(0)
    expect(geometry.padding).toBe('0px')
    expect(geometry.outlineOffset).toBe('4px')
    if (flow) expect(geometry.edgeDisplay).toBe('none')
    else expect(geometry.edgeCenter).toBeCloseTo(4, 1)
  }
})

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

test('external group frame drags all members and ungroup preserves their visual geometry', async ({page}) => {
  const ids = (await mountFixture(page, undefined, true))!
  await expect.poll(async () => (await readGeometry(page, ids)).width).toBeCloseTo(400, 1)
  await page.evaluate(id => (window as any).__imageResizeDoc.selection.selectBlock(id), ids.groupId)
  const before = await readGeometry(page, ids)
  const edge = page.locator(`#image-resize-fixture [data-block-id="${ids.groupId}"] [data-move-edge="east"]`)
  const rect = (await edge.boundingBox())!
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2)
  await page.mouse.down()
  await page.mouse.move(rect.x + rect.width / 2 + 40, rect.y + rect.height / 2 + 30, {steps: 8})
  await page.mouse.up()
  await expect.poll(async () => (await readGeometry(page, ids)).group.position.x)
    .toBeCloseTo(before.group.position.x + 40, 1)
  const moved = await readGeometry(page, ids)
  expect(moved.width).toBeCloseTo(before.width, 1)
  expect(moved.sibling.x).toBeCloseTo(before.sibling.x + 40, 1)
  expect(moved.sibling.y).toBeCloseTo(before.sibling.y + 30, 1)
  const readFrames = () => page.evaluate(ids => {
    const doc = (window as any).__imageResizeDoc
    return [ids.imageId, ids.siblingId].map(id => {
      const frame = doc.getBlockById(id).imgWrapper.nativeElement.getBoundingClientRect()
      return {x: frame.x, y: frame.y, width: frame.width, height: frame.height}
    })
  }, ids)
  const groupedFrames = await readFrames()
  await page.evaluate(id => (window as any).__imageResizeDoc.placement.ungroup(id), ids.groupId)
  await expect.poll(async () => {
    const frames = await readFrames()
    return Math.max(...frames.flatMap((frame, index) =>
      (['x', 'y', 'width', 'height'] as const).map(key =>
        Math.abs(frame[key] - groupedFrames[index][key]),
      ),
    ))
  }).toBeLessThan(0.05) // CSS subpixels and persisted ratio rounding.
})
