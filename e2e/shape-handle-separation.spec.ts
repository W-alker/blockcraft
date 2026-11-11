import {expect, test, type Page} from '@playwright/test'

async function setup(page: Page, kind = 'rectangle', absolute = false, scale = 1, custom = false) {
  await page.setViewportSize({width: 1440, height: 1100})
  await page.routeWebSocket('**', socket => socket.close())
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    return ['http:', 'https:'].includes(url.protocol) && !['localhost', '127.0.0.1'].includes(url.hostname)
      ? route.abort() : route.continue()
  })
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  return page.evaluate(async ({kind, absolute, scale, custom}) => {
    const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const viewport = document.createElement('div')
    viewport.style.cssText = 'position:fixed;left:40px;top:60px;width:1100px;height:800px;padding:70px;overflow:auto;background:white;z-index:20'
    const mount = document.createElement('div')
    viewport.append(mount); document.body.append(viewport)
    const Format = source.plugins.find((p: any) => p.name === 'object-format-toolbar').constructor
    const plugin = new Format()
    const Context = source.plugins.find((p: any) => p.name === 'context-menu').constructor
    const doc = new source.constructor({...source.config, yDoc: new source.yDoc.constructor(), plugins: [plugin, new Context()],
      readonly: false, currentUserId: 'point-test', virtualization: {enabled: false}, scrollContainer: viewport})
    const shape = source.schemas.createSnapshot('shape', [kind, '形状控制点'])
    Object.assign(shape.props, {width: 280, height: 160})
    if (custom) shape.props.customGeometry = 'v1|1000 1000|nonzero|f:M0 0L900 100L1000 1000L0 1000Z'
    const other = source.schemas.createSnapshot('text-box', ['另一个对象', {width: 280, height: 100}])
    doc.initBySnapshot({...source.model.toSnapshot(source.rootId), children: [shape, other]}, mount)
    if (absolute) {
      doc.placement.setMode(shape.id, 'absolute')
      doc.placement.updateAbsolute(shape.id, {x: 180, y: 150})
    }
    doc.viewScale.attach(mount); doc.viewScale.setScale(scale)
    await document.fonts.ready
    await doc.navigateToBlock(shape.id)
    doc.root.hostElement.focus()
    for (let i = 0; i < 2; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    doc.selection.selectBlock(shape.id)
    doc.crud.undoManager.clearHistory()
    ;(window as any).__pointShape = {doc, plugin, id: shape.id, other: other.id}
    return shape.id as string
  }, {kind, absolute, scale, custom})
}

async function pointMode(page: Page, block: ReturnType<Page['locator']>, editing: boolean) {
  await block.locator('.shape-block__shell').click({button: 'right', position: {x: 15, y: 80}})
  const menu = page.locator('bc-editor-context-menu')
  const action = menu.getByRole('menuitem', {name: editing ? '编辑顶点' : '完成顶点编辑', exact: true})
  await expect(action.locator('i,cs-icon')).toHaveCount(0)
  await action.click()
  await expect(page.locator('[data-bc-object-format-toolbar]').getByRole('button', {name: /顶点编辑|编辑顶点/})).toHaveCount(0)
}

async function drag(page: Page, locator: ReturnType<Page['locator']>, x: number, y: number) {
  const point = (await locator.boundingBox())!
  await page.mouse.move(point.x + point.width / 2, point.y + point.height / 2)
  await page.mouse.down()
  if (await locator.evaluate(el => el.matches('[data-geometry-handle-id], [data-adjustment-handle-id]'))) await expect(locator).toHaveCSS('cursor', 'crosshair')
  await page.mouse.move(point.x + point.width / 2 + x, point.y + point.height / 2 + y, {steps: 5})
  await page.mouse.up()
}
const props = (page: Page) => page.evaluate(() => {
  const {doc, id} = (window as any).__pointShape
  return {...doc.model.getProps(id)}
})
const undo = (page: Page) => page.evaluate(() => (window as any).__pointShape.doc.crud.undoManager.undo())

for (const kind of ['rectangle', 'rounded-rectangle']) {
  for (const absolute of [false, true]) {
    for (const scale of [0.75, 1, 1.5]) {
      test(`${kind} ${absolute ? 'absolute' : 'flow'} ${scale}x uses finite default controls and explicit point editing`, async ({page}) => {
        const id = await setup(page, kind, absolute, scale)
        const block = page.locator(`[data-block-id="${id}"]`)
        const rail = page.locator('[data-bc-object-format-toolbar]')
        const nodes = block.locator('[data-geometry-handle-id]')
        const handles = block.locator('.shape-resizer__handle')
        const path = block.locator('[data-bc-shape-render-path]').first()
        await expect(handles).toHaveCount(8)
        await expect(handles.first()).toBeVisible()
        await expect(nodes).toHaveCount(0)
        await expect(rail.getByRole('button', {name: /顶点编辑|编辑顶点/})).toHaveCount(0)
        const original = await props(page)
        const originalPath = await path.getAttribute('d')
        // All eight dimension controls remain centered on the original border.
        expect(await handles.evaluateAll(elements => {
          const frame = elements[0].parentElement!.getBoundingClientRect()
          return elements.every(el => {
            const r = el.getBoundingClientRect(), name = el.getAttribute('data-handle')!
            const x = name.includes('west') ? frame.left : name.includes('east') ? frame.right : frame.x + frame.width / 2
            const y = name.includes('north') ? frame.top : name.includes('south') ? frame.bottom : frame.y + frame.height / 2
            return Math.abs(r.x + r.width / 2 - x) < 1 && Math.abs(r.y + r.height / 2 - y) < 1
          })
        })).toBe(true)
        if (kind === 'rectangle') {
          await expect(block.locator('shape-adjustment-editor')).toHaveCount(0)
          await pointMode(page, block, true)
          await expect(nodes.first()).toBeVisible()
          await expect(nodes.first()).toHaveCSS('cursor', 'crosshair')
          await expect(handles.first()).toBeHidden()
          await expect(block.locator('.shape-resizer__frame')).toHaveCSS('outline-style', 'none')
          await expect(block.locator('.shape-resizer__rotate')).toHaveCount(0)
          await expect(block.locator('.shape-resizer__move-edge')).toHaveCount(0)
          expect(await props(page)).toEqual(original)
          await drag(page, nodes.first(), 24 * scale, 16 * scale)
        } else {
          await expect(rail.getByRole('button', {name: '编辑顶点', exact: true})).toHaveCount(0)
          await drag(page, block.locator('[data-adjustment-handle-id]').first(), 24 * scale, 16 * scale)
        }
        await expect(path).not.toHaveAttribute('d', originalPath!)
        const adjusted = await props(page)
        expect([adjusted.width, adjusted.height]).toEqual([original.width, original.height])
        if (kind === 'rectangle') {
          await pointMode(page, block, false)
          await expect(nodes).toHaveCount(0)
          await expect(handles.first()).toBeVisible()
        }
        await undo(page)
        await expect(path).toHaveAttribute('d', originalPath!)
        await page.evaluate(id => (window as any).__pointShape.doc.selection.selectBlock(id), id)
        await drag(page, block.locator('[data-handle="east"]'), 24 * scale, 0)
        await expect.poll(async () => (await props(page)).width).toBeGreaterThan(original.width + 10)
        expect((await props(page)).customGeometry).toEqual(original.customGeometry)
        expect((await props(page)).adjustments).toEqual(original.adjustments)
        await undo(page)
        await expect.poll(async () => (await props(page)).width).toBe(original.width)
      })
    }
  }
}

for (const reason of ['escape', 'selection', 'lock', 'collapse', 'readonly']) {
  test(`point editing exits on ${reason} and retains existing custom contours`, async ({page}) => {
    const id = await setup(page, 'rectangle', false, 1, true)
    const block = page.locator(`[data-block-id="${id}"]`)
    const rail = page.locator('[data-bc-object-format-toolbar]')
    const path = block.locator('[data-bc-shape-render-path]').first()
    const original = await props(page), contour = await path.getAttribute('d')
    await expect(block.locator('shape-geometry-editor')).toHaveCount(0)
    await pointMode(page, block, true)
    await expect(block.locator('shape-geometry-editor')).toBeVisible()
    if (reason === 'escape') {
      // First Escape cancels an in-flight preview; the second leaves the mode.
      const p = (await block.locator('[data-geometry-handle-id]').first().boundingBox())!
      await page.mouse.move(p.x + p.width / 2, p.y + p.height / 2)
      await page.mouse.down()
      await page.mouse.move(p.x + 35, p.y + 20, {steps: 4})
      await expect(path).not.toHaveAttribute('d', contour!)
      await page.keyboard.press('Escape')
      await page.mouse.up()
      await expect(path).toHaveAttribute('d', contour!)
      await expect(block.locator('shape-geometry-editor')).toBeVisible()
      await page.keyboard.press('Escape')
    } else {
      await page.evaluate(reason => {
        const {doc, plugin, id, other} = (window as any).__pointShape
        if (reason === 'selection') doc.selection.selectBlock(other)
        if (reason === 'lock') doc.setBlockReadonly(id, true)
        if (reason === 'readonly') doc.toggleReadonly(true)
        if (reason === 'collapse') plugin.setCollapsed(true)
      }, reason)
    }
    await expect(block.locator('shape-geometry-editor')).toHaveCount(0)
    await expect(path).toHaveAttribute('d', contour!)
    expect(await props(page)).toEqual(original)
    expect(await page.evaluate(() => (window as any).__pointShape.doc.crud.undoManager.isCanUndo())).toBe(false)
  })
}

for (const kind of ['star', 'donut', 'frame', 'snipped-and-rounded-rectangle', 'bookmark', 'ribbon-notched', 'chevron']) {
  test(`${kind} adjusts a bounded parameter, then enters point editing from its context menu`, async ({page}) => {
    const id = await setup(page, kind)
    const block = page.locator(`[data-block-id="${id}"]`)
    const path = block.locator('[data-bc-shape-render-path]').first()
    const initialPath = await path.getAttribute('d')
    const initialProps = await props(page)
    const handle = block.locator('[data-adjustment-handle-id]').first()
    await expect(handle).toBeVisible()
    await drag(page, handle, 24, 20)
    await expect(path).not.toHaveAttribute('d', initialPath!)
    expect((await props(page)).customGeometry).toBeUndefined()
    expect((await props(page)).adjustments).toBeDefined()
    const adjustedPath = await path.getAttribute('d')
    const adjustedProps = await props(page)
    await block.locator('.shape-block__shell').click({button: 'right', position: {x: 15, y: 80}})
    const menu = page.locator('bc-editor-context-menu')
    await expect(menu).toBeVisible()
    await menu.getByRole('menuitem', {name: '编辑顶点', exact: true}).click()
    await expect(block.locator('shape-geometry-editor')).toBeVisible()
    await expect(block.locator('shape-adjustment-editor')).toHaveCount(0)
    await expect(block.locator('.shape-resizer__frame')).toHaveCSS('outline-style', 'none')
    await expect(path).toHaveAttribute('d', adjustedPath!)
    expect(await props(page)).toEqual(adjustedProps)
    await page.keyboard.press('Escape')
    await expect(block.locator('shape-geometry-editor')).toHaveCount(0)
    await expect(block.locator('.shape-resizer__frame')).toHaveCSS('outline-style', 'solid')
    await undo(page)
    await expect(path).toHaveAttribute('d', initialPath!)
    expect(await props(page)).toEqual(initialProps)
  })
}

test('shape surface right click targets that object and can finish point editing through its menu', async ({page}) => {
  const id = await setup(page)
  const block = page.locator(`[data-block-id="${id}"]`)
  const original = await props(page)
  await page.evaluate(() => {
    const {doc, other} = (window as any).__pointShape
    doc.selection.selectBlock(other)
  })
  const open = async () => {
    await block.locator('.shape-block__shell').click({button: 'right', position: {x: 15, y: 80}})
    return page.locator('bc-editor-context-menu')
  }
  let menu = await open()
  await expect(menu.getByRole('menuitem', {name: '编辑顶点', exact: true})).toBeVisible()
  await menu.getByRole('menuitem', {name: '编辑顶点', exact: true}).click()
  await expect(block.locator('shape-geometry-editor')).toBeVisible()
  await expect(block.locator('.shape-resizer__frame')).toHaveCSS('outline-style', 'none')
  menu = await open()
  await expect(menu.getByRole('menuitem', {name: '完成顶点编辑', exact: true})).toBeVisible()
  await menu.getByRole('menuitem', {name: '完成顶点编辑', exact: true}).click()
  await expect(block.locator('shape-geometry-editor')).toHaveCount(0)
  await expect(block.locator('.shape-resizer__frame')).toHaveCSS('outline-style', 'solid')
  expect(await props(page)).toEqual(original)
  await page.evaluate(id => (window as any).__pointShape.doc.setBlockReadonly(id, true), id)
  menu = await open()
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('menuitem', {name: '编辑顶点', exact: true})).toHaveCount(0)
})

test('shape text right click retains its text range and exposes the parent shape action', async ({page}) => {
  const id = await setup(page)
  const block = page.locator(`[data-block-id="${id}"]`)
  const before = await page.evaluate(id => {
    const {doc} = (window as any).__pointShape
    const shape = doc.getBlockById(id)
    const text = shape.firstChildren
    doc.selection.setSelection({blockId: text.id, type: 'text', index: 0, length: 2})
    return doc.selection.value.toJSON()
  }, id)
  await block.locator('.shape-text-block').click({button: 'right', position: {x: 10, y: 5}})
  const menu = page.locator('bc-editor-context-menu')
  await expect(menu.getByRole('menuitem', {name: /^复制/})).toBeEnabled()
  await expect(menu.getByRole('menuitem', {name: '编辑顶点', exact: true})).toBeVisible()
  expect(await page.evaluate(() => (window as any).__pointShape.doc.selection.value.toJSON())).toEqual(before)
  await menu.getByRole('menuitem', {name: '编辑顶点', exact: true}).click()
  await expect(block.locator('shape-geometry-editor')).toBeVisible()
  await expect(block.locator('.shape-resizer__frame')).toHaveCSS('outline-style', 'none')
  if (test.info().project.name === 'chromium') {
    const shell = (await block.locator('.shape-block__shell').boundingBox())!
    await page.screenshot({path: '/tmp/blockcraft-shape-point-mode-final.png', clip: {
      x: shell.x - 12, y: shell.y - 40, width: shell.width + 100, height: shell.height + 80,
    }})
  }
  await page.keyboard.press('Escape')
  await expect(block.locator('shape-geometry-editor')).toHaveCount(0)
})
