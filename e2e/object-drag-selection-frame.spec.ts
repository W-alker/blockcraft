import {expect, test, type Page, type Locator} from '@playwright/test'

async function setup(page: Page, flavour: string, absolute: boolean, scale: number) {
  await page.setViewportSize({width: 1440, height: 1000})
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  return page.evaluate(async ({flavour, absolute, scale}) => {
    const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const viewport = document.createElement('div')
    viewport.id = 'drag-frame-fixture'
    viewport.style.cssText = 'position:fixed;left:40px;top:50px;width:1100px;height:800px;overflow:auto;background:white;z-index:20;padding:60px'
    const mount = document.createElement('div')
    viewport.append(mount); document.body.append(viewport)
    const kind = flavour === 'object-group' ? 'text-box' : flavour
    const src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"><rect width="240" height="120" fill="#84bdf5"/></svg>')
    const args = kind === 'image' ? [{src, wr: 30, ar: 2}]
      : kind === 'sticker' ? ['sunburst']
      : kind === 'shape' ? ['rectangle', '拖拽边界']
      : kind === 'render-unit' ? [{tplRegion: true}, {width: 280, height: 140}]
      : ['拖拽边界', {width: 280, height: 140}]
    const first = source.schemas.createSnapshot(kind, args)
    if (kind === 'shape') Object.assign(first.props, {width: 280, height: 140, fill: 'none', outline: 'none'})
    const second = source.schemas.createSnapshot('text-box', ['组合成员', {width: 120, height: 100}])
    const tail = source.schemas.createSnapshot('paragraph', ['拖拽排序的落点正文'])
    const Format = source.plugins.find((p: any) => p.name === 'object-format-toolbar').constructor
    const Drag = source.plugins.find((p: any) => p.name === 'ObjectDrag').constructor
    const Controller = source.plugins.find((p: any) => p.name === 'block-controller').constructor
    const plugins = [new Format(), new Drag(), ...(flavour === 'object-group' && !absolute ? [new Controller()] : [])]
    const doc = new source.constructor({...source.config, yDoc: new source.yDoc.constructor(), plugins,
      interactionMode: 'design', readonly: false, virtualization: {enabled: false}, scrollContainer: viewport})
    doc.initBySnapshot({...source.model.toSnapshot(source.rootId), children: flavour === 'object-group' ? [first, second, tail] : [first, tail]}, mount)
    let id = first.id
    if (flavour === 'object-group') {
      for (const [index, block] of [first, second].entries()) {
        doc.placement.setMode(block.id, 'absolute')
        doc.placement.updateAbsolute(block.id, {x: 120 + index * 310, y: 160})
      }
      id = doc.placement.group([first.id, second.id])
      if (!id) throw new Error('Cannot create group')
      if (!absolute) doc.placement.setMode(id, 'relative')
    } else if (absolute) {
      doc.placement.setMode(id, 'absolute')
      doc.placement.updateAbsolute(id, {x: 120, y: 160})
    }
    if (absolute && flavour !== 'object-group') doc.placement.updateObjectGeometry(id, {rotation: 17})
    doc.viewScale.attach(mount); doc.viewScale.setScale(scale)
    await document.fonts.ready
    await doc.navigateToBlock(id)
    doc.root.hostElement.focus()
    for (let i = 0; i < 2; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    doc.selection.selectBlock(id)
    doc.crud.undoManager.clearHistory()
    ;(window as any).dragFrameFixture = {doc, id}
    return id as string
  }, {flavour, absolute, scale})
}

async function paint(frame: Locator) {
  return frame.evaluate(element => {
    const css = getComputedStyle(element), r = element.getBoundingClientRect()
    return {width: css.outlineWidth, offset: css.outlineOffset, color: css.outlineColor,
      style: css.outlineStyle, box: [r.x, r.y, r.width, r.height]}
  })
}

for (const flavour of ['text-box', 'word-art', 'shape', 'image', 'sticker', 'object-group', 'render-unit']) {
  for (const absolute of flavour === 'render-unit' ? [false] : [false, true]) {
    for (const scale of [.75, 1, 1.5]) {
      test(`${flavour} ${absolute ? 'absolute' : 'flow'} ${scale}x: dragging reuses selected frame without controls`, async ({page}) => {
        const id = await setup(page, flavour, absolute, scale)
        const block = page.locator(`[data-block-id="${id}"]`)
        const resizer = flavour === 'object-group' || flavour === 'render-unit'
          ? block.locator(':scope > shape-resizer')
          : block.locator(flavour === 'image' ? ':scope > .image-block__container > .img-wrapper > shape-resizer'
            : ':scope > :is([data-bc-object-surface], [data-bc-print-visual-surface]) > shape-resizer')
        const frame = resizer.locator(':scope > .shape-resizer__frame')
        await expect(frame).toBeVisible()
        const selected = await paint(frame)
        expect(selected.style).toBe('solid')
        const before = await page.evaluate(id => (window as any).dragFrameFixture.doc.model.toSnapshot(id), id)
        let handle: Locator
        if (flavour === 'render-unit') {
          await page.getByRole('button', {name: '初始化', exact: true}).focus()
          await page.evaluate(async () => {
            for (let i = 0; i < 2; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
            ;(window as any).dragFrameFixture.doc.selection.blur()
          })
          await block.hover({position: {x: 70 * scale, y: 50 * scale}})
          handle = block.locator(':scope > bc-object-corner-controls [data-bc-object-floating-handle]')
        } else if (flavour === 'object-group' && !absolute) {
          // Flow groups use the ordinary block grip; their own border hit areas
          // intentionally belong only to absolute placement.
          await block.hover({position: {x: 295 * scale, y: 60 * scale}})
          const controller = page.locator('#drag-frame-fixture bc-drag-handle')
          await expect.poll(() => controller.evaluate(element => (window as any).ng.getComponent(element).activeBlock?.id)).toBe(id)
          handle = controller.locator('.btn')
        } else if (flavour === 'object-group') {
          handle = block.locator(':scope > .object-group-block__move-edge[data-move-edge="north"]')
        } else if (flavour === 'text-box' || flavour === 'word-art' || flavour === 'shape') {
          handle = frame.locator('[data-move-edge="north"]')
        } else {
          handle = block.locator(flavour === 'image' ? '.img-wrapper' : '[data-bc-object-drag-surface]').first()
        }
        const point = await handle.evaluate(element => {
          const r = element.getBoundingClientRect()
          // A rotated thin edge occupies only a diagonal inside its bounding
          // box. Hit-test the actual edge, avoiding resize knobs and text.
          for (const fx of [.24, .76, .12, .88]) {
            for (let fy = .05; fy < 1; fy += .05) {
              const x = r.x + r.width * fx, y = r.y + r.height * fy
              if (element.contains(document.elementFromPoint(x, y))) return {x, y}
            }
          }
          return null
        })
        expect(point).not.toBeNull()
        const {x, y} = point!
        await page.mouse.move(x, y)
        await page.mouse.down()
        await page.mouse.move(x + 36, y + 27, {steps: 6})
        await expect(block).toHaveClass(/bc-drag-source/)
        await expect(frame).toBeVisible()
        const dragged = await paint(frame)
        expect({...dragged, box: undefined}).toEqual({...selected, box: undefined})
        dragged.box.forEach((value, i) => expect(value).toBeCloseTo(selected.box[i] + (absolute && i < 2 ? [36, 27][i] : 0), 0))
        expect(await frame.locator('button, .shape-resizer__move-edge, .shape-resizer__rotation-stem').evaluateAll(elements =>
          elements.every(element => getComputedStyle(element).display === 'none'))).toBe(true)
        expect(await page.evaluate(() => (window as any).dragFrameFixture.doc.selection.value)).toBeNull()
        expect(await page.evaluate(id => (window as any).dragFrameFixture.doc.model.toSnapshot(id), id)).toEqual(before)
        // Authored surface borders stay separate; no duplicate temporary outline.
        if (['text-box', 'word-art', 'shape', 'sticker'].includes(flavour)) {
          await expect(block.locator(':scope > :is([data-bc-object-surface], [data-bc-print-visual-surface])')).toHaveCSS('outline-style', 'none')
        }
        if (flavour === 'image' || flavour === 'object-group') await expect(block).toHaveCSS('outline-style', 'none')
        if (flavour === 'object-group') {
          await expect(block.locator('.object-group-block__children shape-resizer:visible')).toHaveCount(0)
        }
        if (flavour === 'text-box' && absolute && scale === 1) {
          await page.screenshot({path: '/tmp/blockcraft-drag-selected-frame.png'})
          await page.emulateMedia({media: 'print'})
          await expect(frame).toBeHidden()
          await page.emulateMedia({media: 'screen'})
          await expect(frame).toBeVisible()
        }
        await page.keyboard.press('Escape')
        await page.mouse.up()
        await expect(block).not.toHaveClass(/bc-drag-source/)
        expect(await page.evaluate(id => (window as any).dragFrameFixture.doc.model.toSnapshot(id), id)).toEqual(before)
        await page.evaluate(id => (window as any).dragFrameFixture.doc.selection.selectBlock(id), id)
        await expect(frame.locator('.shape-resizer__handle:visible')).toHaveCount(8)
        expect((await paint(frame)).box).toEqual(selected.box)
      })
    }
  }
}
