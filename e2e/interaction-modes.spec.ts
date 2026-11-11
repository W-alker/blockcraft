import {expect, test, type Page} from '@playwright/test'

async function setup(page: Page, absolute = false) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng
    ?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  await page.getByTestId('interaction-mode-debug').locator('summary').click()
  return page.evaluate(async absolute => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const box = doc.schemas.createSnapshot('text-box', ['模式切换测试文字', {width: 360, height: 160}])
    const paragraph = doc.schemas.createSnapshot('paragraph', ['连续写作与对象编排'])
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [box, paragraph])
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    if (absolute) doc.placement.setMode(doc.getBlockById(box.id), 'absolute')
    await doc.navigateToBlock(box.id)
    doc.selection.blur()
    doc.crud.undoManager.clearHistory()
    return {box: box.id, paragraph: paragraph.id}
  }, absolute)
}

async function mode(page: Page, value: string) {
  await page.getByRole('combobox', {name: '编辑模式', exact: true}).selectOption(value)
  await expect(page.locator('[data-blockcraft-root="true"]')).toHaveAttribute('data-bc-interaction-mode', value)
}

async function selection(page: Page) {
  return page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const value = doc.selection.value
    return value ? {type: value.anchor.type, id: value.anchor.blockId} : null
  })
}

test('mixed and immersive keep direct text editing; modes do not mutate document or history', async ({page}, testInfo) => {
  const ids = await setup(page)
  const box = page.locator(`[data-block-id="${ids.box}"]`)
  const text = box.locator('.edit-container').first()
  await text.click()
  await expect.poll(async () => (await selection(page))?.type).toBe('text')
  const selectionBefore = await page.evaluate(() => (window as any).ng
    .getComponent(document.querySelector('block-craft-editor')).doc.selection.value.toJSON())
  const before = await page.evaluate(ids => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const fullBefore = JSON.stringify(doc.yDoc.getMap('blocks').toJSON())
    for (const value of ['immersive', 'design', 'mixed']) doc.interactionMode.set(value)
    if (JSON.stringify(doc.yDoc.getMap('blocks').toJSON()) !== fullBefore) throw new Error('Mode switch mutated document')
    return [doc.model.toSnapshot(ids.box), doc.model.toSnapshot(ids.paragraph)]
  }, ids)
  for (const value of ['immersive', 'design', 'mixed']) await mode(page, value)
  expect(await page.evaluate(() => (window as any).ng
    .getComponent(document.querySelector('block-craft-editor')).doc.selection.value?.toJSON())).toEqual(selectionBefore)
  expect(await page.evaluate(ids => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    return {blocks: [doc.model.toSnapshot(ids.box), doc.model.toSnapshot(ids.paragraph)], undo: doc.crud.undoManager.isCanUndo()}
  }, ids)).toEqual({blocks: before, undo: false})
  await mode(page, 'immersive')
  await box.hover()
  await expect(box.locator('bc-object-corner-controls')).toBeHidden()
  await text.click()
  await expect.poll(async () => (await selection(page))?.type).toBe('text')
  await page.keyboard.type('X')
  await expect(text).toContainText('X')
  await mode(page, 'mixed')
  await box.hover()
  await expect(box.locator('bc-object-corner-controls')).toBeVisible()
  await page.screenshot({path: testInfo.outputPath('mixed-desktop.png')})
  await page.setViewportSize({width: 390, height: 844})
  const panel = page.getByTestId('interaction-mode-debug')
  const picker = panel.getByRole('combobox', {name: '编辑模式', exact: true})
  await expect(page.locator('bc-fixed-toolbar').getByRole('combobox', {name: '编辑模式', exact: true})).toHaveCount(0)
  await picker.scrollIntoViewIfNeeded()
  await expect(picker).toBeVisible()
  await expect.poll(async () => {
    const bounds = (await picker.boundingBox())!
    return bounds.x >= 0 && bounds.x + bounds.width <= 390
  }).toBe(true)
  await panel.screenshot({path: testInfo.outputPath('mode-debug-narrow.png')})
})

test('mixed nested content regions reveal controls on focus, not hover', async ({page}) => {
  await setup(page)
  const id = await page.evaluate(async () => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const region = doc.schemas.createSnapshot('render-unit', [{}, {width: 500, height: 200}])
    region.children = [doc.schemas.createSnapshot('paragraph', ['外层内容区域正文']),
      doc.schemas.createSnapshot('text-box', ['内层文本框正文', {width: 280, height: 100}])]
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [region])
    await doc.navigateToBlock(region.id)
    doc.selection.blur()
    return region.id
  })
  const region = page.locator(`[data-block-id="${id}"]`)
  const outerControls = region.locator(':scope > bc-object-corner-controls')
  const inner = region.locator('.text-box-block')
  const innerControls = inner.locator('bc-object-corner-controls')
  await inner.hover()
  await expect(outerControls).toHaveCSS('opacity', '0')
  await expect(innerControls).toHaveCSS('opacity', '0')
  await inner.locator('.edit-container').click()
  await expect(innerControls).toHaveCSS('opacity', '1')
  await expect(outerControls).toHaveCSS('opacity', '0')
  await region.locator('.edit-container').first().click()
  await expect(outerControls).toHaveCSS('opacity', '1')
  await expect(innerControls).toHaveCSS('opacity', '0')
  await outerControls.getByRole('button').click()
  await expect(region.locator(':scope > shape-resizer .shape-resizer__handle:visible')).toHaveCount(8)
})

for (const flavour of ['image', 'sticker'] as const) {
  for (const absolute of [false, true]) {
    test(`mixed ${flavour} hover stays quiet and click enables resizing (${absolute ? 'absolute' : 'flow'})`, async ({page}) => {
      await setup(page)
      const id = await page.evaluate(async ({flavour, absolute}) => {
        const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
        const canvas = document.createElement('canvas')
        canvas.width = 280; canvas.height = 160
        const snapshot = flavour === 'image'
          ? doc.schemas.createSnapshot('image', [{src: canvas.toDataURL(), wr: 30, ar: 1.75}])
          : doc.schemas.createSnapshot('sticker', ['sunburst'])
        doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot])
        if (absolute) doc.placement.setMode(snapshot.id, 'absolute')
        await doc.navigateToBlock(snapshot.id)
        doc.selection.blur()
        return snapshot.id
      }, {flavour, absolute})
      const block = page.locator(`[data-block-id="${id}"]`)
      const surface = block.locator(flavour === 'image' ? '.img-wrapper' : '.sticker-block__surface')
      await surface.hover()
      await expect(block.locator('shape-resizer')).toBeHidden()
      await mode(page, 'design')
      await surface.hover()
      await expect(block.locator('.shape-resizer__handle:visible')).toHaveCount(8)
      await mode(page, 'mixed')
      await surface.hover()
      await expect(block.locator('shape-resizer')).toBeHidden()
      await surface.click()
      await expect(block.locator('.shape-resizer__handle:visible')).toHaveCount(8)
      await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.crud.undoManager.clearHistory())
      const before = (await surface.boundingBox())!.width
      const handle = (await block.locator('[data-handle="east"]').boundingBox())!
      await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
      await page.mouse.down()
      await page.mouse.move(handle.x + handle.width / 2 + 40, handle.y + handle.height / 2, {steps: 8})
      await page.mouse.up()
      await expect.poll(async () => (await surface.boundingBox())!.width).toBeGreaterThan(before + 20)
      await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.crud.undoManager.undo())
      await expect.poll(async () => Math.abs((await surface.boundingBox())!.width - before)).toBeLessThan(1)
    })
  }
}

for (const absolute of [false, true]) {
  test(`design keeps text editable and exposes eight resize handles (${absolute ? 'absolute' : 'flow'})`, async ({page}, testInfo) => {
    const ids = await setup(page, absolute)
    const box = page.locator(`[data-block-id="${ids.box}"]`)
    const text = box.locator('.edit-container').first()
    await box.hover()
    await expect(box.locator('bc-object-corner-controls')).toHaveCSS('opacity', '0')
    await mode(page, 'design')
    await box.hover()
    await expect(box.locator('bc-object-corner-controls')).toHaveCSS('opacity', '1')
    await text.click()
    await expect.poll(async () => (await selection(page))?.type).toBe('text')
    await expect(box.locator('.shape-resizer__handle:visible')).toHaveCount(8)
    await page.keyboard.type('EDIT')
    await expect(text).toContainText('EDIT')
    await expect.poll(async () => (await selection(page))?.type).toBe('text')
    const before = await page.evaluate(id => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      doc.crud.undoManager.clearHistory()
      return doc.model.getProps(id).width
    }, ids.box)
    const handle = box.locator('[data-handle="east"]')
    const bounds = (await handle.boundingBox())!
    const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 45, y, {steps: 8})
    await page.mouse.up()
    await expect.poll(() => page.evaluate(id => (window as any).ng
      .getComponent(document.querySelector('block-craft-editor')).doc.model.getProps(id).width, ids.box)).toBeGreaterThan(before)
    await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.crud.undoManager.undo())
    await expect.poll(() => page.evaluate(id => (window as any).ng
      .getComponent(document.querySelector('block-craft-editor')).doc.model.getProps(id).width, ids.box)).toBe(before)
    await text.click()
    await expect(box.locator('.shape-resizer__handle:visible')).toHaveCount(8)
    await page.screenshot({path: testInfo.outputPath('design-focused-handles.png')})
    await mode(page, 'mixed')
    await text.click()
    await expect(box.locator('.shape-resizer__handle:visible')).toHaveCount(0)
    await mode(page, 'immersive')
    await text.click()
    await expect(box.locator('.shape-resizer__handle:visible')).toHaveCount(0)
    expect((await selection(page))?.type).toBe('text')
  })
}

for (const flavour of ['word-art', 'shape'] as const) {
  test(`design exposes handles while editing ${flavour} without selecting the object`, async ({page}) => {
    await setup(page)
    const id = await page.evaluate(async flavour => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      const snapshot = flavour === 'word-art'
        ? doc.schemas.createSnapshot('word-art', ['艺术字直接编辑', {width: 360, height: 120}])
        : doc.schemas.createSnapshot('shape', ['rectangle', '形状文字直接编辑'])
      doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot])
      await doc.navigateToBlock(snapshot.id)
      return snapshot.id
    }, flavour)
    const block = page.locator(`[data-block-id="${id}"]`)
    const text = block.locator('.edit-container').first()
    const controls = block.locator(flavour === 'shape' ? 'bc-object-edge-controls' : 'bc-object-corner-controls')
    await block.hover()
    await expect(controls).toHaveCSS('opacity', '0')
    if (flavour === 'shape') {
      await block.locator('[data-bc-object-entry-edge="north"]').hover()
      await expect(controls).toHaveCSS('opacity', '0')
    }
    await mode(page, 'design')
    await block.hover()
    await expect(controls).toHaveCSS('opacity', '1')
    await text.click()
    await expect.poll(async () => (await selection(page))?.type).toBe('text')
    await expect(block.locator('.shape-resizer__handle:visible')).toHaveCount(8)
    await page.keyboard.type('OK')
    await expect(text).toContainText('OK')
    await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.toggleReadonly(true))
    await expect(block.locator('.shape-resizer__handle:visible')).toHaveCount(0)
    await expect(page.getByRole('combobox', {name: '编辑模式', exact: true})).toBeDisabled()
  })
}

test('design keeps ordinary paragraphs and table cells on their normal editing path', async ({page}) => {
  const ids = await setup(page)
  await mode(page, 'design')
  const paragraph = page.locator(`[data-block-id="${ids.paragraph}"] .edit-container`).first()
  await paragraph.click()
  await expect.poll(() => selection(page)).toEqual({type: 'text', id: ids.paragraph})
  await page.keyboard.type('正文')
  await expect(paragraph).toContainText('正文')
  const id = await page.evaluate(async () => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const table = doc.schemas.createSnapshot('table', [2, 2, [['左上', '右上'], ['左下', '右下']]])
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [table])
    await doc.navigateToBlock(table.id)
    return table.id
  })
  const cell = page.locator(`[data-block-id="${id}"] .edit-container`).first()
  await cell.click()
  await expect.poll(async () => (await selection(page))?.type).toBe('text')
  await page.keyboard.type('CELL')
  await expect(cell).toContainText('CELL')
  const ime = await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const target = doc.getBlockById(doc.selection.value.anchor.blockId).hostElement.querySelector('.edit-container')
      ?? doc.getBlockById(doc.selection.value.anchor.blockId).hostElement
    target.dispatchEvent(new CompositionEvent('compositionstart', {bubbles: true, data: ''}))
    const during = doc.interactionMode.set('mixed')
    target.dispatchEvent(new CompositionEvent('compositionend', {bubbles: true, data: ''}))
    return {during, after: doc.interactionMode.set('mixed')}
  })
  expect(ime).toEqual({during: false, after: true})
})

test('floating template opens independently with native layers and editable content', async ({page}, testInfo) => {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/?example=floating-layout')
  await page.waitForFunction(() => (window as any).ng
    ?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  const panel = page.getByTestId('interaction-mode-debug')
  await expect(panel.getByRole('link', {name: /打开浮动排版模板/})).toHaveAttribute('target', '_blank')
  await expect(page.locator('bc-fixed-toolbar').getByRole('combobox', {name: '编辑模式', exact: true})).toHaveCount(0)
  const info = await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const root = doc.exportSnapshot()
    const plane = root.children.find((b: any) => b.flavour === 'placement-layout')
    const note = plane.children.find((b: any) => b.flavour === 'text-box' && b.props.rotation === 5)
    return {note: note.id, count: plane.children.length, under: plane.children.filter((b: any) => b.props.placementLayer === 'under').length,
      flow: root.children.map((b: any) => b.flavour), groups: plane.children.filter((b: any) => b.flavour === 'object-group').length}
  })
  expect(info.count).toBe(8)
  expect(info.under).toBe(2)
  expect(info.groups).toBe(1)
  expect(info.flow).toEqual(expect.arrayContaining(['columns', 'table', 'object-group']))
  await expect(page.locator('.image-block img').first()).toBeVisible()
  await expect.poll(() => page.locator('.image-block img').first().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
  await page.screenshot({path: testInfo.outputPath('floating-template-desktop.png')})
  await mode(page, 'design')
  const note = page.locator(`[data-block-id="${info.note}"]`)
  await note.locator('.edit-container').first().click()
  await expect.poll(async () => (await selection(page))?.type).toBe('text')
  await expect(note.locator('.shape-resizer__handle:visible')).toHaveCount(8)
  await page.keyboard.type('TEST')
  await expect(note).toContainText('TEST')
  await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.crud.undoManager.undo())
  await expect(note).not.toContainText('TEST')
  await mode(page, 'immersive')
  await note.hover()
  await expect(note.locator('bc-object-corner-controls')).toBeHidden()
  await page.evaluate(async () => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const table = doc.exportSnapshot().children.find((b: any) => b.flavour === 'table')
    await doc.navigateToBlock(table.id)
  })
  await expect(page.locator('.table-block')).toBeVisible()
  await page.screenshot({path: testInfo.outputPath('floating-template-body.png')})
})

test('playground flow follows its container without an external document header; pagination keeps paper width', async ({page}) => {
  await setup(page)
  await expect(page.locator('.playground-document-header')).toHaveCount(0)
  const read = () => page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-blockcraft-root="true"]')!
    const editor = document.querySelector<HTMLElement>('block-craft-editor')!
    const outer = editor.parentElement!
    const style = getComputedStyle(outer)
    const available = outer.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
    return {root: root.getBoundingClientRect().width, editor: editor.getBoundingClientRect().width, available,
      viewport: document.querySelector<HTMLElement>('.editor-container')!.clientWidth}
  })
  for (const width of [1600, 1200]) {
    await page.setViewportSize({width, height: 1000})
    await expect.poll(async () => {
      const size = await read()
      return Math.abs(size.editor - size.available) < 2 && Math.abs(size.root - size.viewport) < 2
    }).toBe(true)
  }
  await page.getByRole('button', {name: '分页布局', exact: true}).click()
  await expect(page.locator('.bc-page-sheet').first()).toBeVisible()
  const sheetWidth = await page.locator('.bc-page-sheet').first().evaluate(el => el.getBoundingClientRect().width)
  await page.setViewportSize({width: 1600, height: 1000})
  await expect.poll(() => page.locator('.bc-page-sheet').first().evaluate(el => el.getBoundingClientRect().width)).toBeCloseTo(sheetWidth, 0)
  await page.getByRole('button', {name: '连续布局', exact: true}).click()
  await expect(page.locator('.bc-page-sheet')).toHaveCount(0)
  await expect.poll(async () => { const size = await read(); return Math.abs(size.root - size.viewport) < 2 }).toBe(true)
})

for (const absolute of [false, true]) {
  test(`immersive hides group toolbar and ancestor frame while keeping member text editable (${absolute ? 'absolute' : 'flow'})`, async ({page}) => {
    await setup(page)
    const ids = await page.evaluate(async absolute => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      const child = doc.schemas.createSnapshot('text-box', ['组合内部正文', {width: 280, height: 100, position: '30 30'}])
      const group = doc.schemas.createSnapshot('object-group', [{width: 520, height: 220}, [child]])
      doc.crud.insertBlockSnapshots(doc.rootId, 0, [group])
      await doc.navigateToBlock(group.id)
      if (absolute) doc.placement.setMode(doc.getBlockById(group.id), 'absolute')
      await doc.navigateToBlock(group.id)
      return {group: group.id, child: child.id}
    }, absolute)
    const group = page.locator(`[data-block-id="${ids.group}"]`)
    const text = page.locator(`[data-block-id="${ids.child}"] .edit-container`).first()
    const toolbar = page.locator('bc-object-group-toolbar')
    await group.click({position: {x: 450, y: 190}})
    await expect(toolbar).toBeVisible()
    await mode(page, 'immersive')
    await expect(toolbar).toHaveCount(0)
    await group.click({position: {x: 450, y: 190}})
    await expect.poll(() => selection(page)).toEqual({type: 'selected', id: ids.group})
    await expect(toolbar).toHaveCount(0)
    await expect(group).toHaveCSS('outline-style', 'none')
    await expect(group.locator(':scope > .object-group-block__move-edge:visible')).toHaveCount(0)
    await text.click()
    await expect.poll(async () => (await selection(page))?.type).toBe('text')
    await page.keyboard.type('EDIT')
    await expect(text).toContainText('EDIT')
    await expect(group).toHaveCSS('outline-style', 'none')
    await expect(group).not.toHaveClass(/bc-object-group--selection-within/)
    await expect(toolbar).toHaveCount(0)
    for (const next of ['design', 'mixed']) {
      await mode(page, next)
      await text.click()
      await expect(group).toHaveClass(/bc-object-group--selection-within/)
      await expect.poll(() => group.evaluate(el => {
        const resizer = el.querySelector(':scope > shape-resizer')
        return !['none', 'hidden'].includes(getComputedStyle(el).outlineStyle) ||
          !!resizer && getComputedStyle(resizer).display !== 'none'
      })).toBe(true)
      await group.click({position: {x: 450, y: 190}})
      await expect(toolbar).toBeVisible()
    }
  })
}
