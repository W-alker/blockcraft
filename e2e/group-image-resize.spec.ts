import {resolveBlockPosition} from '../packages/editor/framework/services/block-placement/state'
import {expect, test, type Page} from '@playwright/test'

async function mountFixture(page: Page, snapshot?: any, groupInteraction = false) {
  await page.routeWebSocket('**', socket => socket.close())
  // The geometry fixture uses local rasters. The source Demo also contains
  // external iframes, which must not keep layout tests dependent on live sites.
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    const external = ['http:', 'https:'].includes(url.protocol) &&
      !['127.0.0.1', 'localhost'].includes(url.hostname)
    return external ? route.abort() : route.continue()
  })
  await page.route('**/api/worker/link-preview**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: {'access-control-allow-origin': '*'},
    body: JSON.stringify({title: 'Fixture link', description: '', image: ''}),
  }))
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
        ? ['object-format-toolbar', 'ObjectDrag'].map(name =>
          new (source.plugins.find((plugin: any) => plugin.name === name).constructor)())
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
      doc.crud.updateBlockProps(id, {position: `${x} ${y}`})
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
      group: doc.model.exists(ids.groupId) ? doc.model.getProps(ids.groupId) : null,
      sibling: {x: siblingRect.x, y: siblingRect.y, width: siblingRect.width, height: siblingRect.height},
    }
  }, ids)
}

async function dragImage(page: Page, id: string, side: 'left' | 'right', delta: number) {
  await page.evaluate(id => (window as any).__imageResizeDoc.selection.selectBlock(id), id)
  const image = page.locator(`#image-resize-fixture [data-block-id="${id}"] .img-wrapper`)
  await image.hover()
  const handle = image.locator(`[data-handle="south-${side === 'left' ? 'west' : 'east'}"]`)
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

for (const scale of [0.75, 1, 1.5]) {
  test(`floating image exceeds content width and survives layout/history/reopen (scale ${scale})`, async ({page}) => {
    test.setTimeout(60_000)
    const ids = (await mountFixture(page))!
    const id = ids.outsideId
    await page.evaluate(({id, scale}) => {
      const doc = (window as any).__imageResizeDoc
      const mount = doc.root.hostElement.parentElement
      mount.style.width = '500px'
      mount.style.padding = '40px'
      doc.viewScale.attach(mount)
      doc.viewScale.setScale(scale)
      doc.crud.updateBlockProps(id, {wr: 90, ar: 2, position: '0 20'})
    }, {id, scale})
    const read = () => page.evaluate(id => {
      const doc = (window as any).__imageResizeDoc
      const block = doc.getBlockById(id)
      const el = block.imgWrapper.nativeElement
      const content = doc.objectSizing.rootContentElement as HTMLElement
      const style = getComputedStyle(content)
      const layoutBasis = content.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      return {width: parseFloat(getComputedStyle(el).width), basis: block.referenceWidth,
        layoutBasis, props: {...block.props}, maxWidth: getComputedStyle(el).maxWidth}
    }, id)
    // ResizeObserver publishes the new basis asynchronously. Comparing only
    // width/basis can pass while both still refer to the previous root width.
    await expect.poll(async () => {
      const {basis, layoutBasis} = await read()
      return Math.abs(basis - layoutBasis)
    }).toBeLessThan(1)
    await expect.poll(async () => (await read()).width / (await read()).basis).toBeCloseTo(0.9, 2)
    const before = await read()
    await page.evaluate(() => (window as any).__imageResizeDoc.crud.undoManager.clearHistory())
    await dragImage(page, id, 'right', before.basis * 0.4 * scale)
    // Pointer coordinates are quantized to screen pixels in Firefox/WebKit.
    await expect.poll(async () => (await read()).props.wr).toBeCloseTo(130, 0)
    await expect.poll(async () => (await read()).width / (await read()).basis).toBeCloseTo(1.3, 2)
    const savedWr = (await read()).props.wr
    expect((await read()).maxWidth).toBe('none')
    await page.evaluate(() => (window as any).__imageResizeDoc.crud.undoManager.undo())
    await expect.poll(async () => (await read()).props.wr).toBe(90)
    expect(await page.evaluate(() => (window as any).__imageResizeDoc.crud.undoManager.isCanUndo())).toBe(false)
    await page.evaluate(() => (window as any).__imageResizeDoc.crud.undoManager.redo())
    await expect.poll(async () => (await read()).props.wr).toBe(savedWr)

    await page.evaluate(id => (window as any).__imageResizeDoc.placement.setMode(id, 'relative'), id)
    await expect.poll(async () => (await read()).width / (await read()).basis).toBeCloseTo(1, 2)
    expect((await read()).props.wr).toBe(savedWr)
    await page.evaluate(id => (window as any).__imageResizeDoc.placement.setMode(id, 'absolute'), id)
    await expect.poll(async () => (await read()).width / (await read()).basis).toBeCloseTo(1.3, 2)

    const snapshot = await page.evaluate(() => {
      const doc = (window as any).__imageResizeDoc
      return JSON.parse(JSON.stringify(doc.model.toSnapshot(doc.rootId)))
    })
    await mountFixture(page, snapshot)
    await expect.poll(async () => (await read()).width / (await read()).basis).toBeCloseTo(1.3, 2)
  })
}

test('oversized floating image keeps geometry through grouping and ungrouping', async ({page}) => {
  const ids = (await mountFixture(page))!
  await page.evaluate(id => {
    const doc = (window as any).__imageResizeDoc
    doc.crud.updateBlockProps(id, {wr: 150, ar: 2, position: '0 0'})
  }, ids.outsideId)
  const width = () => page.evaluate(id => {
    const doc = (window as any).__imageResizeDoc
    return parseFloat(getComputedStyle(doc.getBlockById(id).imgWrapper.nativeElement).width)
      / doc.objectSizing.rootContentWidth
  }, ids.outsideId)
  await expect.poll(width).toBeCloseTo(1.5, 2)
  const groupId = await page.evaluate(ids => {
    const doc = (window as any).__imageResizeDoc
    doc.placement.ungroup(ids.groupId)
    doc.crud.undoManager.clearHistory()
    return doc.placement.group([ids.imageId, ids.siblingId, ids.outsideId])
  }, ids)
  expect(groupId).toBeTruthy()
  await expect.poll(width).toBeCloseTo(1.5, 2)
  await page.evaluate(groupId => {
    const doc = (window as any).__imageResizeDoc
    doc.crud.undoManager.stopCapturing()
    doc.placement.ungroup(groupId)
  }, groupId)
  await expect.poll(width).toBeCloseTo(1.5, 2)
  await page.evaluate(() => (window as any).__imageResizeDoc.crud.undoManager.undo())
  await expect.poll(width).toBeCloseTo(1.5, 2)
  await page.evaluate(() => (window as any).__imageResizeDoc.crud.undoManager.redo())
  await expect.poll(width).toBeCloseTo(1.5, 2)
})

test('snapshot viewer preserves an oversized floating image', async ({page}) => {
  await mountFixture(page)
  const id = await page.evaluate(() => {
    document.getElementById('image-resize-fixture')!.remove()
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const image = doc.schemas.createSnapshot('image', [{src: '', wr: 150, ar: 2}])
    return doc.placement.insertAbsoluteSnapshot(image, {anchorRect: null}) as string
  })
  await page.getByRole('tab', {name: 'Snapshot Viewer', exact: true}).click()
  const frame = page.locator(`bc-snapshot-viewer [data-block-id="${id}"] .img-wrapper`)
  await expect(frame).toBeVisible()
  await expect.poll(() => frame.evaluate(el => {
    const block = el.closest('[data-block-id]')!
    return el.getBoundingClientRect().width / block.parentElement!.clientWidth
  })).toBeCloseTo(1.5, 2)
})

for (const {flow, count, keyboard} of [
  {flow: false, count: 1, keyboard: false},
  {flow: true, count: 1, keyboard: false},
  {flow: false, count: 1, keyboard: true},
  {flow: true, count: 1, keyboard: true},
  {flow: false, count: 2, keyboard: false},
  {flow: true, count: 2, keyboard: false},
]) {
  test(`${flow ? 'flow' : 'absolute'} group member deletion (${keyboard ? 'keyboard' : `API ${count}`}) restores geometry in one undo and redo`, async ({page}) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const ids = (await mountFixture(page))!
    await page.evaluate(async ({ids, flow}) => {
      const doc = (window as any).__imageResizeDoc
      if (flow) doc.placement.setMode(ids.groupId, 'relative')
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      doc.crud.undoManager.clearHistory()
    }, {ids, flow})
    await expect.poll(async () => (await readGeometry(page, ids)).width).toBeCloseTo(400, 1)
    const capture = () => page.evaluate(ids => {
      const doc = (window as any).__imageResizeDoc
      return [ids.groupId, ids.imageId, ids.siblingId, ids.outsideId].map(id => {
        if (!doc.model.exists(id)) return null
        const block = doc.getBlockById(id)
        if (!block) return null
        const element = block.imgWrapper?.nativeElement ?? block.hostElement
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return {
          id,
          props: doc.model.getProps(id),
          rect: {x: rect.x, y: rect.y, width: rect.width, height: rect.height},
          size: {width: style.width, height: style.height},
        }
      })
    }, ids)
    const before = await capture()
    await page.evaluate(({ids, count, keyboard}) => {
      const doc = (window as any).__imageResizeDoc
      if (keyboard) {
        doc.root.hostElement.focus()
        doc.selection.selectBlock(ids.imageId)
      } else {
        doc.crud.deleteBlocks(ids.groupId, 0, count, true)
      }
      doc.crud.undoManager.stopCapturing()
    }, {ids, count, keyboard})
    if (keyboard) await page.keyboard.press('Delete')
    await expect.poll(async () => (await capture())[1]).toBeNull()
    await expect.poll(async () => (await capture())[0]?.rect.width).toBeCloseTo(count === 1 ? 100 : 400, 1)
    const deleted = await capture()
    expect(deleted[1]).toBeNull()
    if (count === 1) expect(deleted[2]?.rect.width).toBeCloseTo(before[2]!.rect.width, 1)
    else expect(deleted[2]).toBeNull()
    expect(deleted[3]).toEqual(before[3])
    await page.evaluate(() => (window as any).__imageResizeDoc.crud.undoManager.undo())
    await expect.poll(capture).toEqual(before)
    if (keyboard) {
      expect(await page.evaluate(() => (window as any).__imageResizeDoc.selection.value?.anchor.blockId)).toBe(ids.imageId)
    }
    expect(await page.evaluate(() => (window as any).__imageResizeDoc.crud.undoManager.isCanUndo())).toBe(false)
    await page.evaluate(() => (window as any).__imageResizeDoc.crud.undoManager.redo())
    await expect.poll(capture).toEqual(deleted)
    expect(errors).toEqual([])
  })
}

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
    doc.crud.updateBlockProps(ids.imageId, {wr: 100, ar: 2, position: "0 0"})
    doc.crud.updateBlockProps(ids.siblingId, {position: "20 20"})
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
  await expect(edge).toBeVisible()
  const rect = (await edge.boundingBox())!
  // The middle of the edge now owns the group's width resize handle.
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 4)
  await page.mouse.down()
  await page.mouse.move(rect.x + rect.width / 2 + 40, rect.y + rect.height / 4 + 30, {steps: 8})
  await page.mouse.up()
  await expect.poll(async () => resolveBlockPosition((await readGeometry(page, ids)).group.position).x)
    .toBeCloseTo(resolveBlockPosition(before.group.position).x + 40, 1)
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

for (const absolute of [false, true]) {
  for (const scale of [0.75, 1, 1.5]) {
    test(`eight image handles preserve responsive sizing (${absolute ? 'absolute' : 'flow'}, scale ${scale})`, async ({page}) => {
      test.setTimeout(60_000)
      const ids = (await mountFixture(page))!
      const id = ids.outsideId
      await page.evaluate(async ({id, groupId, absolute, scale}) => {
        const doc = (window as any).__imageResizeDoc
        const group = doc.getBlockById(groupId)
        doc.crud.deleteBlocks(group.parentId, group.getIndexOfParent(), 1)
        doc.root.hostElement.parentElement.style.padding = '60px'
        doc.viewScale.attach(doc.root.hostElement.parentElement)
        doc.viewScale.setScale(scale)
        if (!absolute) doc.placement.setMode(id, 'relative')
        doc.crud.updateBlockProps(id, {position: absolute ? '100 80' : null})
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        doc.selection.selectBlock(id)
      }, {id, groupId: ids.groupId, absolute, scale})
      const image = page.locator(`#image-resize-fixture [data-block-id="${id}"] .img-wrapper`)
      await expect(image.locator('.shape-resizer__handle:visible')).toHaveCount(8)
      await expect(image.locator('.shape-resizer__rotate')).toHaveCount(absolute ? 1 : 0)
      const read = () => page.evaluate(id => {
        const doc = (window as any).__imageResizeDoc
        const block = doc.getBlockById(id)
        const el = block.imgWrapper.nativeElement as HTMLElement
        const rect = el.getBoundingClientRect()
        return {
          props: {...doc.model.getProps(id)}, width: rect.width, height: rect.height,
          x: rect.x, y: rect.y, inlineHeight: el.style.height, inlineWidth: el.style.width,
          selected: doc.selection.value?.anchor.blockId === id,
          basis: block.referenceWidth,
        }
      }, id)
      for (const direction of ['north-west', 'north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west']) {
        await page.evaluate(id => {
          const doc = (window as any).__imageResizeDoc
          doc.crud.undoManager.clearHistory()
          doc.selection.selectBlock(id)
        }, id)
        const before = await read()
        const handle = image.locator(`[data-handle="${direction}"]`)
        const box = (await handle.boundingBox())!
        const x = box.x + box.width / 2
        const y = box.y + box.height / 2
        const dx = direction.includes('west') ? -40 : direction.includes('east') ? 40 : 0
        const dy = direction.includes('north') ? -20 : direction.includes('south') ? 20 : 0
        await page.mouse.move(x, y)
        await page.mouse.down()
        await page.mouse.move(x + dx * scale, y + dy * scale, {steps: 5})
        expect((await read()).selected).toBe(true)
        await page.mouse.up()
        const horizontal = direction.includes('west') || direction.includes('east')
        const vertical = direction.includes('north') || direction.includes('south')
        const expectedWidth = before.width + (horizontal ? 40 * scale : 0)
        const expectedHeight = before.height + (vertical ? 20 * scale : 0)
        await expect.poll(async () => (await read()).width, {message: direction + ' before=' + JSON.stringify({...before, props: {...before.props, src: undefined}})}).toBeCloseTo(expectedWidth, 0)
        await expect.poll(async () => (await read()).height).toBeCloseTo(expectedHeight, 0)
        const resized = await read()
        expect(resized.width / resized.height).toBeCloseTo(expectedWidth / expectedHeight, 2)
        expect(resized.props.ar).toBeCloseTo(expectedWidth / expectedHeight, 2)
        if (!(horizontal && vertical)) {
          expect(resized.props.fit).toBe('fill')
          await expect(image.locator('img')).toHaveCSS('object-fit', 'fill')
        }
        expect(resized.props.width).toBeUndefined()
        expect(resized.props.height).toBeUndefined()
        expect(resized.inlineHeight).toBe('')
        if (absolute && direction.includes('west')) expect(resized.x + resized.width).toBeCloseTo(before.x + before.width, 0)
        if (absolute && direction.includes('north')) expect(resized.y + resized.height).toBeCloseTo(before.y + before.height, 0)
        if (!absolute) {
          expect(resized.x).toBeCloseTo(before.x, 0)
          expect(resized.y).toBeCloseTo(before.y, 0)
        }
        await page.evaluate(() => (window as any).__imageResizeDoc.crud.undoManager.undo())
        await expect.poll(async () => (await read()).width).toBeCloseTo(before.width, 0)
        expect((await read()).props).toEqual(before.props)
        expect(await page.evaluate(() => (window as any).__imageResizeDoc.crud.undoManager.isCanUndo())).toBe(false)
        await page.evaluate(() => (window as any).__imageResizeDoc.crud.undoManager.redo())
        await expect.poll(async () => (await read()).width).toBeCloseTo(resized.width, 0)
        await page.evaluate(() => (window as any).__imageResizeDoc.crud.undoManager.undo())
        await expect.poll(async () => (await read()).width).toBeCloseTo(before.width, 0)
      }
      // Commit once, then resize the actual containing document without touching props.
      await dragImage(page, id, 'right', 40 * scale)
      const committed = await read()
      await page.evaluate(() => document.getElementById('image-resize-fixture')!.style.width = '700px')
      await expect.poll(async () => (await read()).basis).toBeLessThan(committed.basis)
      const narrower = await read()
      expect(narrower.props).toEqual(committed.props)
      expect(narrower.width).toBeCloseTo(committed.width * narrower.basis / committed.basis, 0)
      expect(narrower.width / narrower.height).toBeCloseTo(2, 2)
      expect(narrower.inlineHeight).toBe('')
    })
  }
}

test('image resize cancels cleanly and readonly removes handles', async ({page}) => {
  const ids = (await mountFixture(page))!
  const id = ids.outsideId
  await page.evaluate(id => (window as any).__imageResizeDoc.selection.selectBlock(id), id)
  const image = page.locator(`#image-resize-fixture [data-block-id="${id}"] .img-wrapper`)
  const before = await image.boundingBox()
  const props = await page.evaluate(id => ({...(window as any).__imageResizeDoc.model.getProps(id)}), id)
  await image.hover()
  await image.locator('[data-handle="north"]').click()
  expect(await page.evaluate(id => ({...(window as any).__imageResizeDoc.model.getProps(id)}), id)).toEqual(props)
  const box = (await image.locator('[data-handle="east"]').boundingBox())!
  await page.mouse.move(box.x + 5, box.y + 5)
  await page.mouse.down()
  await page.mouse.move(box.x - 40, box.y - 20, {steps: 4})
  await expect(image.locator('img')).toHaveCSS('object-fit', 'fill')
  await page.keyboard.press('Escape')
  await expect(image.locator('img')).toHaveCSS('object-fit', 'contain')
  await page.mouse.up()
  expect(await image.boundingBox()).toEqual(before)
  expect(await page.evaluate(id => ({...(window as any).__imageResizeDoc.model.getProps(id)}), id)).toEqual(props)
  await page.evaluate(() => (window as any).__imageResizeDoc.toggleReadonly(true))
  await expect(image.locator('shape-resizer')).toHaveCount(0)
})

for (const flow of [false, true]) {
  test(`group image edge stretch persists and replays (${flow ? 'flow' : 'absolute'})`, async ({page}, testInfo) => {
    const ids = (await mountFixture(page))!
    await page.evaluate(async ({ids, flow}) => {
      const doc = (window as any).__imageResizeDoc
      if (flow) doc.placement.setMode(ids.groupId, 'relative')
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      const ImagePlugin = source.plugins.find((plugin: any) => plugin.name === 'img-toolbar').constructor
      const plugin = new ImagePlugin()
      plugin.register(doc)
      ;(window as any).__imageResizePlugin = plugin
      doc.selection.selectBlock(ids.imageId)
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      doc.crud.undoManager.clearHistory()
    }, {ids, flow})
    const image = page.locator(`#image-resize-fixture [data-block-id="${ids.imageId}"] .img-wrapper`)
    await expect(image.locator('.shape-resizer__handle:visible')).toHaveCount(8)
    const before = await readGeometry(page, ids)
    await image.hover()
    await image.locator('[data-handle="east"]').hover()
    const edge = (await image.locator('[data-handle="east"]').boundingBox())!
    const x = edge.x + edge.width / 2
    const y = edge.y + edge.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 80, y, {steps: 5})
    await expect(image.locator('img')).toHaveCSS('object-fit', 'fill')
    await page.mouse.up()
    await expect.poll(async () => (await readGeometry(page, ids)).width).toBeCloseTo(480, 1)
    const stretched = await readGeometry(page, ids)
    expect(stretched.height).toBeCloseTo(200, 1)
    expect(stretched.props.ar).toBe(2.4)
    expect(stretched.props.fit).toBe('fill')
    if (!flow && testInfo.project.name === 'chromium') {
      await page.screenshot({path: testInfo.outputPath('image-eight-handles.png')})
    }
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect(stretched.sibling[key]).toBeCloseTo(before.sibling[key], 1)
    }
    expect(await page.evaluate(() => (window as any).__imageResizeDoc.dragController.state)).toBe('idle')
    await page.evaluate(() => (window as any).__imageResizeDoc.crud.undoManager.undo())
    await expect.poll(async () => (await readGeometry(page, ids)).width).toBeCloseTo(before.width, 1)
    expect((await readGeometry(page, ids)).props).toEqual(before.props)
    await page.evaluate(() => (window as any).__imageResizeDoc.crud.undoManager.redo())
    await expect.poll(async () => (await readGeometry(page, ids)).width).toBeCloseTo(stretched.width, 1)
    const snapshot = await page.evaluate(() => {
      const doc = (window as any).__imageResizeDoc
      return doc.model.toSnapshot(doc.rootId)
    })
    await mountFixture(page, snapshot)
    await expect.poll(async () => (await readGeometry(page, ids)).height).toBeCloseTo(200, 1)
    await expect(image.locator('img')).toHaveCSS('object-fit', 'fill')
    expect((await readGeometry(page, ids)).props).toEqual(stretched.props)
  })
}

for (const grouped of [false, true]) {
  test(`image rotation persists and preserves dimensions (${grouped ? 'group' : 'absolute'})`, async ({page}) => {
    const ids = (await mountFixture(page))!
    const id = grouped ? ids.imageId : ids.outsideId
    await page.evaluate(id => {
      const doc = (window as any).__imageResizeDoc
      doc.selection.selectBlock(id)
      doc.crud.undoManager.clearHistory()
    }, id)
    const surface = page.locator(`#image-resize-fixture [data-block-id="${id}"] .img-wrapper`)
    const read = () => page.evaluate(id => {
      const doc = (window as any).__imageResizeDoc
      const el = doc.getBlockById(id).imgWrapper.nativeElement as HTMLElement
      const r = el.getBoundingClientRect()
      return {props: {...doc.model.getProps(id)}, w: parseFloat(getComputedStyle(el).width), h: parseFloat(getComputedStyle(el).height), transform: el.style.transform, x: r.x, y: r.y, width: r.width, height: r.height}
    }, id)
    const before = await read()
    const groupBefore = await readGeometry(page, ids)
    await surface.hover()
    const knob = surface.getByRole('button', {name: '旋转图片', exact: true})
    await knob.hover()
    const k = (await knob.boundingBox())!
    const r = (await surface.boundingBox())!
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2
    const radius = cy - (k.y + k.height / 2)
    await page.mouse.move(k.x + k.width / 2, k.y + k.height / 2)
    await page.mouse.down()
    await page.keyboard.down('Shift')
    await page.mouse.move(cx + radius, cy, {steps: 12})
    await page.mouse.up()
    await page.keyboard.up('Shift')
    await expect.poll(async () => (await read()).props.rotation).toBe(90)
    const rotated = await read()
    expect(rotated.w).toBeCloseTo(before.w, 1)
    expect(rotated.h).toBeCloseTo(before.h, 1)
    expect(rotated.width).toBeCloseTo(before.height, 1)
    expect(rotated.height).toBeCloseTo(before.width, 1)
    expect(rotated.transform).toBe('rotate(90deg)')
    expect(rotated.props.width).toBeUndefined()
    expect(rotated.props.height).toBeUndefined()
    if (grouped) expect((await readGeometry(page, ids)).sibling).toEqual(groupBefore.sibling)
    else {
      expect(rotated.props.wr).toBe(before.props.wr)
      expect(rotated.props.ar).toBe(before.props.ar)
    }
    await page.evaluate(() => (window as any).__imageResizeDoc.crud.undoManager.undo())
    await expect.poll(async () => (await read()).props).toEqual(before.props)
    expect(await page.evaluate(() => (window as any).__imageResizeDoc.crud.undoManager.isCanUndo())).toBe(false)
    await page.evaluate(() => (window as any).__imageResizeDoc.crud.undoManager.redo())
    await expect.poll(async () => (await read()).props).toEqual(rotated.props)
    const snapshot = await page.evaluate(() => {
      const doc = (window as any).__imageResizeDoc
      return doc.model.toSnapshot(doc.rootId)
    })
    await mountFixture(page, snapshot)
    await expect.poll(async () => (await read()).w).toBeCloseTo(before.w, 1)
    expect((await read()).transform).toBe('rotate(90deg)')
  })
}

test('rotated image side resize keeps its opposite anchor and dynamic sizing', async ({page}) => {
  const ids = (await mountFixture(page))!, id = ids.outsideId
  await page.evaluate(({id, groupId}) => {
    const doc = (window as any).__imageResizeDoc
    const group = doc.getBlockById(groupId)
    doc.crud.deleteBlocks(group.parentId, group.getIndexOfParent(), 1)
    doc.placement.updateObjectGeometry(id, {position: '160 160', rotation: 90})
    doc.selection.selectBlock(id)
  }, {id, groupId: ids.groupId})
  const surface = page.locator(`#image-resize-fixture [data-block-id="${id}"] .img-wrapper`)
  await expect(surface).toHaveCSS('transform', 'matrix(0, 1, -1, 0, 0, 0)')
  const before = (await surface.boundingBox())!
  await surface.hover()
  const east = surface.locator('[data-handle="east"]')
  await east.hover()
  const handle = (await east.boundingBox())!
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + 60, {steps: 10})
  await page.mouse.up()
  await expect.poll(async () => (await surface.boundingBox())!.height).toBeCloseTo(before.height + 60, 1)
  const after = (await surface.boundingBox())!
  expect(after.y).toBeCloseTo(before.y, 1)
  expect(after.x).toBeCloseTo(before.x, 1)
  expect(after.width).toBeCloseTo(before.width, 1)
  const props = await page.evaluate(id => ({...(window as any).__imageResizeDoc.model.getProps(id)}), id)
  expect(props.rotation).toBe(90)
  expect(props.fit).toBe('fill')
  await page.evaluate(() => {document.getElementById('image-resize-fixture')!.style.width = '700px'})
  await expect.poll(async () => (await surface.boundingBox())!.height).toBeLessThan(after.height - 10)
  expect(await page.evaluate(id => ({...(window as any).__imageResizeDoc.model.getProps(id)}), id)).toEqual(props)
  await page.evaluate(id => {
    const doc = (window as any).__imageResizeDoc
    doc.selection.selectBlock(id)
  }, id)
  await surface.hover()
  const knob = surface.getByRole('button', {name: '旋转图片', exact: true})
  await knob.hover()
  const k = (await knob.boundingBox())!
  await page.mouse.move(k.x + k.width / 2, k.y + k.height / 2)
  await page.mouse.down()
  await page.mouse.move(k.x - 50, k.y + 80, {steps: 8})
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(surface).toHaveCSS('transform', 'matrix(0, 1, -1, 0, 0, 0)')
  expect(await page.evaluate(id => (window as any).__imageResizeDoc.model.getProps(id).rotation, id)).toBe(90)
  await page.evaluate(id => (window as any).__imageResizeDoc.setBlockReadonly(id, true), id)
  await expect(surface.locator('shape-resizer')).toHaveCount(0)
})

test('flow image hides rotation controls while retaining rotation and eight resize handles', async ({page}) => {
  const ids = (await mountFixture(page))!, id = ids.outsideId
  await page.evaluate(async id => {
    const doc = (window as any).__imageResizeDoc
    doc.placement.updateObjectGeometry(id, {rotation: 30})
    doc.placement.setMode(id, 'relative')
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    doc.selection.selectBlock(id)
  }, id)
  const surface = page.locator(`#image-resize-fixture [data-block-id="${id}"] .img-wrapper`)
  await expect(surface.locator('.shape-resizer__handle:visible')).toHaveCount(8)
  await expect(surface.locator('.shape-resizer__rotate')).toHaveCount(0)
  await expect(surface.locator('.shape-resizer__rotation-stem')).toHaveCount(0)
  expect(await surface.evaluate(el => el.style.transform)).toBe('rotate(30deg)')
  await page.evaluate(id => (window as any).__imageResizeDoc.placement.setMode(id, 'absolute'), id)
  await surface.hover()
  await expect(surface.getByRole('button', {name: '旋转图片', exact: true})).toBeVisible()
  expect(await page.evaluate(id => (window as any).__imageResizeDoc.model.getProps(id).rotation, id)).toBe(30)
  await page.evaluate(id => (window as any).__imageResizeDoc.placement.setMode(id, 'relative'), id)
  await expect(surface.locator('.shape-resizer__rotate')).toHaveCount(0)
  await expect(surface.locator('.shape-resizer__handle:visible')).toHaveCount(8)
})

for (const [rotation, scale] of [[0, 1], [30, 0.75], [0, 1.5]]) {
  test(`unselected absolute image keeps handles while hovering toward rotation (${rotation}deg, scale ${scale})`, async ({page}) => {
    const ids = (await mountFixture(page))!, id = ids.outsideId
    await page.evaluate(async ({id, siblingId, rotation, scale}) => {
      const doc = (window as any).__imageResizeDoc
      doc.placement.updateObjectGeometry(id, {position: '140 220', rotation})
      doc.viewScale.attach(doc.root.hostElement.parentElement)
      doc.viewScale.setScale(scale)
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      doc.selection.selectBlock(siblingId)
    }, {id, siblingId: ids.siblingId, rotation, scale})
    const host = page.locator(`#image-resize-fixture [data-block-id="${id}"]`)
    const surface = host.locator('.img-wrapper')
    const handles = surface.locator('.shape-resizer__handle:visible')
    await expect(host).not.toHaveClass(/\bselected\b/)
    await page.mouse.move(920, 680)
    await expect(handles).toHaveCount(0)
    const before = await page.evaluate(id => ({...(window as any).__imageResizeDoc.model.getProps(id)}), id)
    await surface.hover()
    await expect(handles).toHaveCount(8)
    const r = (await surface.boundingBox())!
    const knob = surface.getByRole('button', {name: '旋转图片', exact: true})
    const k = (await knob.boundingBox())!
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2
    const kx = k.x + k.width / 2, ky = k.y + k.height / 2
    // Each small move must preserve hover, including the gap between frame and knob.
    for (let step = 1; step <= 24; step++) {
      await page.mouse.move(cx + (kx - cx) * step / 24, cy + (ky - cy) * step / 24)
      await expect(handles).toHaveCount(8, {timeout: 500})
    }
    await expect(knob).toBeVisible()
    await expect(host).not.toHaveClass(/\bselected\b/)
    expect(await page.evaluate(id => ({...(window as any).__imageResizeDoc.model.getProps(id)}), id)).toEqual(before)
    expect(await knob.evaluate(button => {
      const rect = button.getBoundingClientRect()
      return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === button
    })).toBe(true)
    await page.mouse.down()
    await page.keyboard.down('Shift')
    await page.mouse.move(cx - (ky - cy), cy + (kx - cx), {steps: 12})
    await page.mouse.up()
    await page.keyboard.up('Shift')
    await expect.poll(() => page.evaluate(id => (window as any).__imageResizeDoc.model.getProps(id).rotation, id)).toBe(rotation + 90)
    const after = await page.evaluate(id => ({...(window as any).__imageResizeDoc.model.getProps(id)}), id)
    expect(after.wr).toBe(before.wr)
    expect(after.ar).toBe(before.ar)
    await page.mouse.move(920, 680)
    await expect(handles).toHaveCount(0)
  })
}

for (const flow of [false, true]) {
  for (const scale of [.75, 1.5]) {
    test(`whole group eight resize handles, preview and one undo (${flow ? 'flow' : 'absolute'}, scale ${scale})`, async ({page}) => {
      test.setTimeout(90_000)
      const ids = (await mountFixture(page, undefined, true))!
      await page.evaluate(async ({ids, flow, scale}) => {
        const doc = (window as any).__imageResizeDoc
        document.getElementById('image-resize-fixture')!.style.height = '900px'
        document.getElementById('image-resize-fixture')!.style.width = '1300px'
        doc.root.hostElement.parentElement.style.padding = '40px'
        doc.viewScale.attach(doc.root.hostElement.parentElement)
        doc.viewScale.setScale(scale)
        if (flow) doc.placement.setMode(ids.groupId, 'relative')
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        doc.selection.selectBlock(ids.groupId)
        doc.crud.undoManager.clearHistory()
      }, {ids, flow, scale})
      const group = page.locator(`#image-resize-fixture [data-block-id="${ids.groupId}"]`)
      const handles = group.locator(':scope > shape-resizer .shape-resizer__handle')
      await expect(handles).toHaveCount(8)
      await expect(group).toHaveCSS('outline-style', 'none')
      await expect(group.locator(':scope > shape-resizer .shape-resizer__frame')).toHaveCSS('outline-style', 'solid')
      await expect(group.locator(':scope > shape-resizer .shape-resizer__frame')).toHaveCSS('outline-offset', '4px')
      await expect(group.locator(':scope > shape-resizer .shape-resizer__rotate')).toHaveCount(0)
      const capture = () => page.evaluate(ids => {
        const doc = (window as any).__imageResizeDoc
        return [ids.groupId, ids.imageId, ids.siblingId].map(id => {
          const block = doc.getBlockById(id)
          const rect = (block.imgWrapper?.nativeElement ?? block.hostElement).getBoundingClientRect()
          return {props: {...doc.model.getProps(id)}, x: rect.x, y: rect.y, width: rect.width, height: rect.height}
        })
      }, ids)
      for (const direction of ['north-west', 'north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west']) {
        const before = await capture()
        const handle = group.locator(`:scope > shape-resizer [data-handle="${direction}"]`)
        const rect = (await handle.boundingBox())!
        const dx = direction.includes('west') ? -40 : direction.includes('east') ? 40 : 0
        const dy = direction.includes('north') ? -30 : direction.includes('south') ? 30 : 0
        await page.mouse.move(rect.x + 5, rect.y + 5)
        await page.mouse.down()
        await page.mouse.move(rect.x + 5 + dx * scale, rect.y + 5 + dy * scale, {steps: 6})
        await page.waitForTimeout(50)
        const preview = await capture()
        expect(preview.map(value => value.props)).toEqual(before.map(value => value.props))
        await page.mouse.up()
        await expect.poll(async () => (await capture())[1].width).toBeCloseTo(preview[1].width, 0)
        const resized = await capture()
        expect(resized[0].props).not.toEqual(before[0].props)
        for (let i = 0; i < resized.length; i++) {
          for (const key of ['x', 'y', 'width', 'height'] as const) expect(resized[i][key]).toBeCloseTo(preview[i][key], 0)
        }
        if (direction.includes('-')) expect(resized[1].width / resized[1].height).toBeCloseTo(2, 3)
        if (!flow && direction.includes('west')) expect(resized[0].x + resized[0].width).toBeCloseTo(before[0].x + before[0].width, 0)
        if (!flow && direction.includes('north')) expect(resized[0].y + resized[0].height).toBeCloseTo(before[0].y + before[0].height, 0)
        if (flow) {
          expect(resized[0].x).toBeCloseTo(before[0].x, 0)
          expect(resized[0].y).toBeCloseTo(before[0].y, 0)
        }
        await page.evaluate(() => (window as any).__imageResizeDoc.crud.undoManager.undo())
        await expect.poll(capture).toEqual(before)
        expect(await page.evaluate(() => (window as any).__imageResizeDoc.crud.undoManager.isCanUndo())).toBe(false)
        await page.evaluate(() => (window as any).__imageResizeDoc.crud.undoManager.redo())
        await expect.poll(capture).toEqual(resized)
        await page.evaluate(() => (window as any).__imageResizeDoc.crud.undoManager.undo())
        await expect.poll(capture).toEqual(before)
      }
    })
  }
}

for (const flow of [false, true]) {
  test(`whole group keeps date and weather proportions through preview and history (${flow ? 'flow' : 'absolute'})`, async ({page}, testInfo) => {
    test.setTimeout(90_000)
    const ids = (await mountFixture(page, undefined, true))!
    const materials = await page.evaluate(async ({ids, flow}) => {
      const doc = (window as any).__imageResizeDoc
      const image = doc.model.toSnapshot(ids.imageId)
      for (const id of [ids.groupId, ids.outsideId]) {
        const parentId = doc.model.getParentId(id)
        doc.crud.deleteBlocks(parentId, doc.model.getChildrenIds(parentId).indexOf(id), 1, true)
      }
      Object.assign(image.props, {wr: 400 / doc.objectSizing.rootContentWidth * 100, ar: 4 / 3})
      const date = doc.schemas.createSnapshot('date-card', [])
      Object.assign(date.props, {date: '2026-10-08', bg: '#f4ecd8'})
      const weather = doc.schemas.createSnapshot('weather', [])
      Object.assign(weather.props, {date: '2026-10-08', frozen: {
        tone: 'sunny', temp: 21, condition: '晴', location: '北京', high: 25, low: 16,
      }})
      const members = [image, date, weather].map(snapshot => doc.placement.insertAbsoluteSnapshot(snapshot, {anchorRect: null}))
      members.forEach((id, index) => doc.crud.updateBlockProps(id, {position: ['100 80', '280 100', '130 310'][index]}))
      const groupId = doc.placement.group(members)
      if (!groupId) throw new Error('Failed to group date and weather')
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      if (flow) doc.placement.setMode(groupId, 'relative')
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      if (doc.placement.getState(groupId).mode !== (flow ? 'relative' : 'absolute')) {
        throw new Error('Unexpected group placement mode')
      }
      doc.selection.selectBlock(groupId)
      doc.crud.undoManager.clearHistory()
      return {groupId, members: members.slice(1)}
    }, {ids, flow})
    const capture = () => page.evaluate(({groupId, members}) => {
      const doc = (window as any).__imageResizeDoc
      return [groupId, ...members].map(id => {
        const host = doc.getBlockById(id).hostElement as HTMLElement
        const rect = host.getBoundingClientRect()
        const frame = host.querySelector<HTMLElement>('[data-bc-selection-interaction-frame]')
        const content = frame?.querySelector<HTMLElement>('.card, .weather-card')
        const contentRect = content?.getBoundingClientRect()
        const label = frame?.querySelector<HTMLElement>('.card__day, .weather-card__temp')
        return {props: {...doc.model.getProps(id)}, x: rect.x, y: rect.y, width: rect.width, height: rect.height,
          unit: frame ? Number.parseFloat(getComputedStyle(frame).getPropertyValue('--u')) : 0,
          contentWidth: contentRect?.width ?? 0, contentHeight: contentRect?.height ?? 0,
          fontSize: label ? Number.parseFloat(getComputedStyle(label).fontSize) : 0}
      })
    }, materials)
    const group = page.locator(`#image-resize-fixture [data-block-id="${materials.groupId}"]`)
    const before = await capture()
    for (const [direction, dx, dy] of [
      ['south-east', 80, 60], ['east', 80, 0], ['south', 0, 60], ['west', 50, 0], ['north', 0, 35],
    ] as const) {
      const handle = (await group.locator(`:scope > shape-resizer [data-handle="${direction}"]`).boundingBox())!
      await page.mouse.move(handle.x + 5, handle.y + 5)
      await page.mouse.down()
      await page.mouse.move(handle.x + 5 + dx, handle.y + 5 + dy, {steps: 6})
      await page.waitForTimeout(50)
      const preview = await capture()
      expect(preview.map(item => item.props)).toEqual(before.map(item => item.props))
      for (let i = 1; i < preview.length; i++) {
        expect(preview[i].width / preview[i].height).toBeCloseTo(before[i].width / before[i].height, 2)
        expect(preview[i].unit / before[i].unit).toBeCloseTo(preview[i].width / before[i].width, 2)
        expect(preview[i].fontSize / before[i].fontSize).toBeCloseTo(preview[i].width / before[i].width, 2)
        expect(preview[i].contentWidth / preview[i].contentHeight).toBeCloseTo(before[i].contentWidth / before[i].contentHeight, 2)
      }
      await page.mouse.up()
      await expect.poll(async () => (await capture())[0].props).not.toEqual(before[0].props)
      const after = await capture()
      for (let i = 1; i < after.length; i++) {
        for (const key of ['x', 'y', 'width', 'height', 'unit', 'contentWidth', 'contentHeight', 'fontSize'] as const) expect(after[i][key]).toBeCloseTo(preview[i][key], 0)
        expect(after[i].props.width / after[i].props.height).toBeCloseTo(before[i].props.width / before[i].props.height, 3)
        expect(after[i].unit / before[i].unit).toBeCloseTo(after[i].width / before[i].width, 2)
      }
      await page.evaluate(() => (window as any).__imageResizeDoc.crud.undoManager.undo())
      await expect.poll(capture).toEqual(before)
      expect(await page.evaluate(() => (window as any).__imageResizeDoc.crud.undoManager.isCanUndo())).toBe(false)
      await page.evaluate(() => (window as any).__imageResizeDoc.crud.undoManager.redo())
      await expect.poll(capture).toEqual(after)
      await page.evaluate(() => (window as any).__imageResizeDoc.crud.undoManager.undo())
      await expect.poll(capture).toEqual(before)
    }
    // Cancellation must restore both the frame and its internal content scale.
    const corner = (await group.locator(':scope > shape-resizer [data-handle="south-east"]').boundingBox())!
    await page.mouse.move(corner.x + 5, corner.y + 5)
    await page.mouse.down()
    await page.mouse.move(corner.x + 85, corner.y + 65, {steps: 6})
    await page.keyboard.press('Escape')
    await page.mouse.up()
    await expect.poll(capture).toEqual(before)
    expect(await page.evaluate(() => (window as any).__imageResizeDoc.crud.undoManager.isCanUndo())).toBe(false)
    // If a concurrent edit renders a new card scale, ending the stale gesture
    // must preserve that value rather than restoring its captured --u.
    await page.mouse.move(corner.x + 5, corner.y + 5)
    await page.mouse.down()
    await page.mouse.move(corner.x + 85, corner.y + 65, {steps: 6})
    const liveProps = await page.evaluate(async ({materials, width, height}) => {
      const doc = (window as any).__imageResizeDoc
      doc.placement.updateObjectGeometry(materials.members[0], {width: width * 1.1, height: height * 1.1})
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      return [materials.groupId, ...materials.members].map(id => ({...doc.model.getProps(id)}))
    }, {materials, width: before[1].props.width, height: before[1].props.height})
    await page.mouse.up()
    const live = await capture()
    expect(live.map(item => item.props)).toEqual(liveProps)
    expect(live[1].unit / before[1].unit).toBeCloseTo(1.1, 2)
    expect(live[1].width / live[1].height).toBeCloseTo(before[1].width / before[1].height, 2)
    expect(live[2]).toEqual(before[2])
    await page.evaluate(() => (window as any).__imageResizeDoc.crud.undoManager.undo())
    await expect.poll(capture).toEqual(before)
    await page.evaluate(() => (window as any).__imageResizeDoc.crud.undoManager.clearHistory())
    await page.mouse.move(corner.x + 5, corner.y + 5)
    await page.mouse.down()
    await page.mouse.move(corner.x + 85, corner.y + 65, {steps: 6})
    await page.mouse.up()
    const resized = await capture()
    await page.mouse.move(920, 680)
    await page.screenshot({path: testInfo.outputPath('date-weather-after-resize.png')})
    const snapshot = await page.evaluate(() => {
      const doc = (window as any).__imageResizeDoc
      return doc.model.toSnapshot(doc.rootId)
    })
    await mountFixture(page, snapshot, true)
    await expect.poll(capture).toEqual(resized)
    if (!flow) {
      await page.evaluate(id => (window as any).__imageResizeDoc.placement.ungroup(id), materials.groupId)
      for (const [index, id] of materials.members.entries()) {
        const member = page.locator(`#image-resize-fixture [data-block-id="${id}"]`)
        const rect = (await member.boundingBox())!
        expect(rect.width / rect.height).toBeCloseTo(before[index + 1].width / before[index + 1].height, 2)
      }
    }
  })
}

test('flow group resizes from its visible box inside a padded narrow container', async ({page}) => {
  const ids = (await mountFixture(page, undefined, true))!
  await page.evaluate(async id => {
    const doc = (window as any).__imageResizeDoc
    if (!doc.placement.setMode(id, 'relative')) throw new Error('Failed to enter flow')
    const container = doc.getBlockById(id).placementContainer as HTMLElement
    container.style.width = '420px'
    container.style.boxSizing = 'border-box'
    container.style.padding = '0 56px'
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    doc.selection.selectBlock(id)
    doc.crud.undoManager.clearHistory()
  }, ids.groupId)
  const group = page.locator(`#image-resize-fixture [data-block-id="${ids.groupId}"]`)
  const capture = () => page.evaluate(ids => {
    const doc = (window as any).__imageResizeDoc
    return [ids.groupId, ids.imageId, ids.siblingId].map(id => {
      const block = doc.getBlockById(id)
      const element = block.imgWrapper?.nativeElement ?? block.hostElement
      const rect = element.getBoundingClientRect()
      return {props: {...doc.model.getProps(id)}, x: rect.x, y: rect.y, width: rect.width, height: rect.height}
    })
  }, ids)
  const before = await capture()
  expect(before[0].props.width).toBeGreaterThan(before[0].width)
  expect(before[0].width).toBeCloseTo(308, 1)
  // Merely pressing a handle must retain oversized model geometry and history.
  await group.locator(':scope > shape-resizer [data-handle="east"]').click()
  expect(await capture()).toEqual(before)
  expect(await page.evaluate(() => (window as any).__imageResizeDoc.crud.undoManager.isCanUndo())).toBe(false)
  for (const [direction, dx, dy] of [
    ['east', -60, 0], ['south', 0, -60], ['south-east', -60, -40],
  ] as const) {
    const rect = (await group.locator(`:scope > shape-resizer [data-handle="${direction}"]`).boundingBox())!
    await page.mouse.move(rect.x + 5, rect.y + 5)
    await page.mouse.down()
    await page.mouse.move(rect.x + 5 + dx, rect.y + 5 + dy, {steps: 6})
    await page.waitForTimeout(50)
    const preview = await capture()
    expect(preview.map(item => item.props)).toEqual(before.map(item => item.props))
    if (dx) expect(preview[0].width).toBeCloseTo(before[0].width + dx, 0)
    if (!dx) expect(preview[0].height).toBeCloseTo(before[0].height + dy, 0)
    await page.mouse.up()
    const after = await capture()
    for (let i = 0; i < after.length; i++) {
      for (const key of ['x', 'y', 'width', 'height'] as const) expect(after[i][key]).toBeCloseTo(preview[i][key], 0)
    }
    expect(after[0].props.width).toBeCloseTo(after[0].width, 1)
    if (direction === 'south-east') {
      expect(after[0].props.width / after[0].props.height)
        .toBeCloseTo(before[0].props.width / before[0].props.height, 3)
      for (let i = 1; i < after.length; i++) expect(after[i].props.ar).toBe(before[i].props.ar)
    }
    await page.evaluate(() => (window as any).__imageResizeDoc.crud.undoManager.undo())
    await expect.poll(capture).toEqual(before)
    expect(await page.evaluate(() => (window as any).__imageResizeDoc.crud.undoManager.isCanUndo())).toBe(false)
    await page.evaluate(() => (window as any).__imageResizeDoc.crud.undoManager.redo())
    await expect.poll(capture).toEqual(after)
    await page.evaluate(() => (window as any).__imageResizeDoc.crud.undoManager.undo())
    await expect.poll(capture).toEqual(before)
    // Cancel and returning to the start point both restore the clipped box.
    for (const cancel of [true, false]) {
      await page.mouse.move(rect.x + 5, rect.y + 5)
      await page.mouse.down()
      await page.mouse.move(rect.x + 5 + dx, rect.y + 5 + dy, {steps: 6})
      if (cancel) await page.keyboard.press('Escape')
      else await page.mouse.move(rect.x + 5, rect.y + 5)
      await page.mouse.up()
      await expect.poll(capture).toEqual(before)
      expect(await page.evaluate(() => (window as any).__imageResizeDoc.crud.undoManager.isCanUndo())).toBe(false)
    }
  }
})

test('whole group resize cancellation, no-op and locked members leave geometry intact', async ({page}) => {
  const ids = (await mountFixture(page, undefined, true))!
  await page.evaluate(id => {
    const doc = (window as any).__imageResizeDoc
    doc.selection.selectBlock(id)
    doc.crud.undoManager.clearHistory()
  }, ids.groupId)
  const group = page.locator(`#image-resize-fixture [data-block-id="${ids.groupId}"]`)
  const before = await readGeometry(page, ids)
  await group.locator(':scope > shape-resizer [data-handle="east"]').click()
  expect(await readGeometry(page, ids)).toEqual(before)
  const handle = (await group.locator(':scope > shape-resizer [data-handle="south-east"]').boundingBox())!
  await page.mouse.move(handle.x + 5, handle.y + 5)
  await page.mouse.down()
  await page.mouse.move(handle.x + 85, handle.y + 65, {steps: 6})
  await page.keyboard.press('Escape')
  await page.mouse.up()
  expect(await readGeometry(page, ids)).toEqual(before)
  expect(await page.evaluate(() => (window as any).__imageResizeDoc.crud.undoManager.isCanUndo())).toBe(false)
  await page.evaluate(id => (window as any).__imageResizeDoc.readonlyManager.set(id, true), ids.siblingId)
  await page.mouse.move(handle.x + 5, handle.y + 5)
  await page.mouse.down()
  await page.mouse.move(handle.x + 85, handle.y + 65, {steps: 6})
  await page.mouse.up()
  expect(await readGeometry(page, ids)).toEqual(before)
  await page.evaluate(() => (window as any).__imageResizeDoc.toggleReadonly(true))
  await expect(group.locator(':scope > shape-resizer')).toHaveCount(0)
})

test('whole group resize survives reopening and ungrouping', async ({page}) => {
  const ids = (await mountFixture(page, undefined, true))!
  await page.evaluate(id => (window as any).__imageResizeDoc.selection.selectBlock(id), ids.groupId)
  const group = page.locator(`#image-resize-fixture [data-block-id="${ids.groupId}"]`)
  const handle = (await group.locator(':scope > shape-resizer [data-handle="south-east"]').boundingBox())!
  await page.mouse.move(handle.x + 5, handle.y + 5)
  await page.mouse.down()
  await page.mouse.move(handle.x + 85, handle.y + 65, {steps: 6})
  await page.mouse.up()
  await expect.poll(async () => (await readGeometry(page, ids)).width).toBeCloseTo(480, 1)
  const resized = await readGeometry(page, ids)
  const snapshot = await page.evaluate(() => {
    const doc = (window as any).__imageResizeDoc
    return doc.model.toSnapshot(doc.rootId)
  })
  await mountFixture(page, snapshot, true)
  await expect.poll(() => readGeometry(page, ids)).toEqual(resized)
  await page.evaluate(id => (window as any).__imageResizeDoc.placement.ungroup(id), ids.groupId)
  await expect.poll(async () => (await readGeometry(page, ids)).width).toBeCloseTo(resized.width, 1)
  const ungrouped = await readGeometry(page, ids)
  expect(ungrouped.height).toBeCloseTo(resized.height, 1)
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    expect(ungrouped.sibling[key]).toBeCloseTo(resized.sibling[key], 1)
  }
})

test('whole group resize discards stale preview after a concurrent member edit', async ({page}) => {
  const ids = (await mountFixture(page, undefined, true))!
  await page.evaluate(id => (window as any).__imageResizeDoc.selection.selectBlock(id), ids.groupId)
  const handle = (await page.locator(`#image-resize-fixture [data-block-id="${ids.groupId}"] > shape-resizer [data-handle="east"]`).boundingBox())!
  await page.mouse.move(handle.x + 5, handle.y + 5)
  await page.mouse.down()
  await page.mouse.move(handle.x + 85, handle.y + 5, {steps: 6})
  const expected = await page.evaluate(ids => {
    const doc = (window as any).__imageResizeDoc
    doc.placement.updateObjectGeometry(doc.getBlockById(ids.imageId), {position: '20 30'})
    return [ids.groupId, ids.imageId, ids.siblingId].map(id => doc.model.getProps(id))
  }, ids)
  await page.mouse.up()
  expect(await page.evaluate(ids => {
    const doc = (window as any).__imageResizeDoc
    return [ids.groupId, ids.imageId, ids.siblingId].map(id => doc.model.getProps(id))
  }, ids)).toEqual(expected)
  await expect.poll(async () => (await readGeometry(page, ids)).width).toBeCloseTo(400, 1)
  expect((await readGeometry(page, ids)).height).toBeCloseTo(200, 1)
})

for (const flow of [false, true]) {
  test(`whole group mixed text and rotated shape keeps native text layout (${flow ? 'flow' : 'absolute'})`, async ({page}) => {
    const ids = (await mountFixture(page, undefined, true))!
    const mixed = await page.evaluate(async ({ids, flow}) => {
      const doc = (window as any).__imageResizeDoc
      document.getElementById('image-resize-fixture')!.style.height = '900px'
      for (const id of [ids.groupId, ids.outsideId]) {
        const parentId = doc.model.getParentId(id)
        doc.crud.deleteBlocks(parentId, doc.model.getChildrenIds(parentId).indexOf(id), 1, true)
      }
      const text = doc.schemas.createSnapshot('text-box', [
        [{insert: '组合中的文字保留字号，框体变窄时自动换行。'.repeat(4), attributes: {'t:fs': 1.25}}],
        {width: 240, height: 160},
      ])
      const shape = doc.schemas.createSnapshot('shape', ['rectangle'])
      Object.assign(shape.props, {width: 100, height: 60, rotation: 33.3})
      const textId = doc.placement.insertAbsoluteSnapshot(text, {anchorRect: null})
      const shapeId = doc.placement.insertAbsoluteSnapshot(shape, {anchorRect: null})
      doc.crud.updateBlockProps(textId, {position: '140 80'})
      doc.crud.updateBlockProps(shapeId, {position: '410 180'})
      const groupId = doc.placement.group([textId, shapeId])
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      if (flow) doc.placement.setMode(groupId, 'relative')
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      if (doc.placement.getState(groupId).mode !== (flow ? 'relative' : 'absolute')) {
        throw new Error('Unexpected group placement mode')
      }
      doc.selection.selectBlock(groupId)
      doc.crud.undoManager.clearHistory()
      return {groupId, textId, shapeId}
    }, {ids, flow})
    const capture = () => page.evaluate(ids => {
      const doc = (window as any).__imageResizeDoc
      const text = doc.getBlockById(ids.textId)
      const paragraph = doc.getBlockById(doc.model.getChildrenIds(ids.textId)[0])
      const content = paragraph.hostElement.querySelector('.bc-element') ?? paragraph.hostElement
      const range = document.createRange()
      range.selectNodeContents(content)
      return {
        objects: [ids.groupId, ids.textId, ids.shapeId].map(id => {
          const host = doc.getBlockById(id).hostElement
          const surface = host.querySelector('[data-bc-object-surface]') ?? host
          const rect = surface.getBoundingClientRect()
          return {props: doc.model.getProps(id), x: rect.x, y: rect.y, width: rect.width, height: rect.height}
        }),
        fontSize: getComputedStyle(content).fontSize,
        lines: new Set(Array.from(range.getClientRects(), rect => Math.round(rect.top))).size,
        text: paragraph.toSnapshot().text,
      }
    }, mixed)
    const group = page.locator(`#image-resize-fixture [data-block-id="${mixed.groupId}"]`)
    for (const direction of ['east', 'south', 'south-east']) {
      const before = await capture()
      const handle = (await group.locator(`:scope > shape-resizer [data-handle="${direction}"]`).boundingBox())!
      const dx = direction.includes('east') ? (direction === 'east' ? -90 : 60) : 0
      const dy = direction.includes('south') ? 40 : 0
      await page.mouse.move(handle.x + 5, handle.y + 5)
      await page.mouse.down()
      await page.mouse.move(handle.x + 5 + dx, handle.y + 5 + dy, {steps: 8})
      await page.waitForTimeout(50)
      const preview = await capture()
      expect(preview.fontSize).toBe(before.fontSize)
      expect(preview.text).toEqual(before.text)
      if (direction === 'east') {
        expect(preview.objects[1].width).toBeLessThan(before.objects[1].width)
        expect(preview.lines).toBeGreaterThan(before.lines)
      }
      await page.mouse.up()
      await expect.poll(async () => (await capture()).objects[1].width).toBeCloseTo(preview.objects[1].width, 1)
      const after = await capture()
      expect(after.fontSize).toBe(before.fontSize)
      expect(after.text).toEqual(before.text)
      expect(after.objects[2].props.rotation).toBe(33.3)
      expect(after.lines).toBe(preview.lines)
      for (let i = 0; i < 3; i++) {
        for (const key of ['x', 'y', 'width', 'height'] as const) expect(after.objects[i][key]).toBeCloseTo(preview.objects[i][key], 0)
      }
      await page.evaluate(() => (window as any).__imageResizeDoc.crud.undoManager.undo())
      await expect.poll(capture).toEqual(before)
      expect(await page.evaluate(() => (window as any).__imageResizeDoc.crud.undoManager.isCanUndo())).toBe(false)
    }
  })
}
