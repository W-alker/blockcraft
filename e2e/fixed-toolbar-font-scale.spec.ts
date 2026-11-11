import {expect, test, type Page} from '@playwright/test'

test.use({viewport: {width: 2200, height: 1000}})

async function start(page: Page) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() =>
    (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
}

async function setRange(page: Page, blockId: string, start: number, end = start) {
  await page.locator('block-craft-editor').evaluate((editor, range) => {
    const doc = (window as any).ng.getComponent(editor).doc
    doc.selection.setSelection(
      {blockId: range.blockId, type: 'text', offset: range.start},
      {blockId: range.blockId, type: 'text', offset: range.end},
    )
  }, {blockId, start, end})
}

async function fontSize(page: Page, blockId: string) {
  return page.locator(`block-craft-editor [data-block-id="${blockId}"]`).evaluate(element => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      if (walker.currentNode.textContent?.includes('字号验证')) {
        return parseFloat(getComputedStyle(walker.currentNode.parentElement!).fontSize)
      }
    }
    throw new Error('字号验证文本未渲染')
  })
}

test('caret reflects paragraph and inline scales without rewriting stored formatting', async ({page}) => {
  await start(page)
  const cases = [
    {paragraph: null, inline: null, label: '16', size: 16},
    {paragraph: 2.8, inline: null, label: '44.8', size: 44.8},
    {paragraph: null, inline: 2.8, label: '44.8', size: 44.8},
    {paragraph: 2, inline: 1.25, label: '40', size: 40},
    {paragraph: 3, inline: 1.5, label: '72', size: 72},
  ]
  const ids = await page.locator('block-craft-editor').evaluate(async (editor, cases) => {
    const doc = (window as any).ng.getComponent(editor).doc
    const snapshots = cases.map(item => doc.schemas.createSnapshot('paragraph', [[{
      insert: '字号验证文本',
      ...(item.inline === null ? {} : {attributes: {'t:fs': item.inline}}),
    }]]))
    doc.crud.insertBlockSnapshots(doc.rootId, 0, snapshots)
    cases.forEach((item, index) => {
      if (item.paragraph !== null) doc.crud.updateBlockProps(snapshots[index].id, {pfs: item.paragraph})
    })
    await doc.navigateToBlock(snapshots[0].id)
    return snapshots.map((snapshot: any) => snapshot.id) as string[]
  }, cases)

  const control = page.locator('bc-fixed-toolbar .toolbar-btn--font-size')
  for (const [index, item] of cases.entries()) {
    // 点击真实文字，再用方向键进入文本，覆盖原生选区 -> 模型 -> OnPush 回显。
    await page.locator(`block-craft-editor [data-block-id="${ids[index]}"]`).click()
    await page.keyboard.press('ArrowLeft')
    await expect(control).toHaveText(item.label)
    expect(await fontSize(page, ids[index])).toBeCloseTo(item.size, 1)
  }

  // 整段与局部选区均显示实际字号。
  await setRange(page, ids[3], 0, 6)
  await expect(control).toHaveText('40')
  await setRange(page, ids[3], 1, 3)
  await expect(control).toHaveText('40')

  const stored = await page.locator('block-craft-editor').evaluate((editor, ids) => {
    const doc = (window as any).ng.getComponent(editor).doc
    return ids.map(id => ({
      pfs: doc.model.getProps(id).pfs ?? null,
      fs: doc.model.getTextDeltas(id)[0].attributes?.['t:fs'] ?? null,
    }))
  }, ids)
  expect(stored).toEqual(cases.map(item => ({pfs: item.paragraph, fs: item.inline})))
})

test('caret font command keeps its relative insert scale after paragraph-aware display', async ({page}) => {
  await start(page)
  const id = await page.locator('block-craft-editor').evaluate(async editor => {
    const doc = (window as any).ng.getComponent(editor).doc
    const snapshot = doc.schemas.createSnapshot('paragraph', ['字号验证文本'])
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot])
    // 使用实际整段字号命令设置 2.8，而非直接修改行内属性。
    doc.selection.setSelection(
      {blockId: snapshot.id, type: 'text', offset: 0},
      {blockId: snapshot.id, type: 'text', offset: 6},
    )
    const toolbar = (window as any).ng.getComponent(document.querySelector('bc-fixed-toolbar'))
    toolbar.toolbarHelper.formatTypography({fontScale: 2.8})
    await doc.navigateToBlock(snapshot.id)
    return snapshot.id as string
  })

  await setRange(page, id, 3)
  const control = page.locator('bc-fixed-toolbar .toolbar-btn--font-size')
  await expect(control).toHaveText('44.8')
  await page.locator('bc-fixed-toolbar').evaluate(toolbar => {
    const component = (window as any).ng.getComponent(toolbar)
    component.toolbarHelper.formatTypography({fontScale: 1.25})
    component.syncToolbarState(component.doc.selection.value)
  })
  await expect(control).toHaveText('56')

  const state = await page.locator('block-craft-editor').evaluate((editor, id) => {
    const doc = (window as any).ng.getComponent(editor).doc
    return {
      pfs: doc.model.getProps(id).pfs,
      delta: doc.model.getTextDeltas(id),
      pending: doc.inputManger.peekNextInsertAttrs({blockId: id, index: 3}),
    }
  }, id)
  expect(state.pfs).toBe(2.8)
  expect(state.delta).toEqual([{insert: '字号验证文本'}])
  expect(state.pending['t:fs']).toBe(1.25)
  expect(await fontSize(page, id)).toBeCloseTo(44.8, 1)

  await page.keyboard.type('X')
  await expect(control).toHaveText('56')
  await expect.poll(() => page.locator('block-craft-editor').evaluate((editor, id) => {
    const doc = (window as any).ng.getComponent(editor).doc
    return doc.model.getTextDeltas(id).find((delta: any) => delta.insert === 'X')?.attributes?.['t:fs']
  }, id)).toBe(1.25)
  const insertedSize = await page.locator(`block-craft-editor [data-block-id="${id}"]`).evaluate(element => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      if (walker.currentNode.textContent === 'X') {
        return parseFloat(getComputedStyle(walker.currentNode.parentElement!).fontSize)
      }
    }
    throw new Error('新输入的文字未渲染')
  })
  expect(insertedSize).toBeCloseTo(56, 1)
})

async function createPixelParagraph(page: Page, props: Record<string, number>, deltas: any[] = [{insert: '字号验证文本'}]) {
  return page.locator('block-craft-editor').evaluate(async (editor, args) => {
    const doc = (window as any).ng.getComponent(editor).doc
    const snapshot = doc.schemas.createSnapshot('paragraph', [args.deltas, args.props])
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot])
    await doc.navigateToBlock(snapshot.id)
    doc.crud.undoManager.clearHistory()
    return snapshot.id as string
  }, {props, deltas})
}

async function pixelState(page: Page, id: string) {
  return page.locator('block-craft-editor').evaluate((editor, id) => {
    const doc = (window as any).ng.getComponent(editor).doc
    return {props: {...doc.model.getProps(id)}, deltas: doc.model.getTextDeltas(id)}
  }, id)
}

async function choosePixels(page: Page, size: number) {
  await page.locator('bc-fixed-toolbar .toolbar-btn--font-size').hover()
  await page.locator('bc-float-toolbar-item').filter({hasText: new RegExp(`^${size}$`)}).click()
}

test('actual px unifies a mixed paragraph, retains scales, and undoes in one step', async ({page}) => {
  await start(page)
  const id = await createPixelParagraph(page, {pfs: 1.5, heading: 1}, [
    {insert: '字号验证', attributes: {'t:fs': 1.25}},
    {insert: '文本', attributes: {'t:fs': 2}},
  ])
  await setRange(page, id, 0, 6)
  const control = page.locator('bc-fixed-toolbar .toolbar-btn--font-size')
  await expect(control).toHaveText('混合')
  const before = await pixelState(page, id)
  await control.hover()
  const menu = page.locator('.cs-dropdown-standard-menu').filter({has: page.locator('bc-float-toolbar-item[name="font-size"]')})
  await expect(menu).toBeVisible()
  await expect(menu.locator('input')).toHaveCount(0)
  await expect(menu).not.toContainText('px')
  expect((await control.boundingBox())!.width).toBe(56)
  await expect(menu.getByText('继承字号', {exact: true})).toHaveCount(0)
  await expect.poll(async () => Math.abs((await menu.boundingBox())!.width - (await control.boundingBox())!.width)).toBeLessThan(0.1)
  await choosePixels(page, 24)
  await expect(control).toHaveText('24')
  const after = await pixelState(page, id)
  expect(after.props).toMatchObject({heading: 1, fs: 16, pfs: 1.5})
  expect(after.deltas.map((run: any) => run.attributes['t:fs'])).toEqual([1.25, 2])
  expect(after.deltas.map((run: any) => run.attributes['t:px'])).toEqual([12.8, 8])
  const sizes = await page.locator(`[data-block-id="${id}"] c-text`).evaluateAll(elements => elements.map(el => getComputedStyle(el).fontSize))
  expect(sizes).toEqual(['24px', '24px'])
  await page.locator('bc-fixed-toolbar').getByRole('button', { name: '撤销', exact: true }).click()
  await expect.poll(() => pixelState(page, id)).toEqual(before)
  await page.locator('bc-fixed-toolbar').getByRole('button', { name: '重做', exact: true }).click()
  await expect.poll(() => pixelState(page, id)).toEqual(after)
})

test('custom caret px retains pending scale and affects only subsequent input', async ({page}) => {
  await start(page)
  const id = await createPixelParagraph(page, {pfs: 2}, [{insert: '字号验证文本', attributes: {'t:fs': 1.25}}])
  await setRange(page, id, 3)
  const control = page.locator('bc-fixed-toolbar .toolbar-btn--font-size')
  await expect(control).toHaveText('40')
  const before = await pixelState(page, id)
  await control.hover()
  await page.locator('bc-float-toolbar-item[title="更多设置…"]').click()
  const dialog = page.locator('bc-font-settings-dialog')
  await expect(dialog).toBeVisible()
  const input = dialog.locator('[data-setting-field="font-size"] input')
  await input.fill('26.5')
  await input.press('Tab')
  expect(await pixelState(page, id)).toEqual(before)
  await page.getByRole('button', {name: '确定', exact: true}).click()
  await expect(control).toHaveText('26.5')
  expect(await pixelState(page, id)).toEqual(before)
  await page.keyboard.type('X')
  await expect.poll(async () => (await pixelState(page, id)).deltas.find((run: any) => run.insert === 'X')?.attributes)
    .toEqual({'t:fs': 1.25, 't:px': 10.6})
  const inserted = page.locator(`[data-block-id="${id}"] c-text`).filter({hasText: /^X$/})
  await expect(inserted).toHaveCSS('font-size', '26.5px')
  await setRange(page, id, 0, 7)
  await expect(control).toHaveText('混合')
})

test('advanced modal changes scale while preserving px bases and inline scale', async ({page}) => {
  await start(page)
  const id = await createPixelParagraph(page, {fs: 16, pfs: 1.5}, [{insert: '字号验证文本', attributes: {'t:px': 12.8, 't:fs': 1.25}}])
  await setRange(page, id, 0, 6)
  const control = page.locator('bc-fixed-toolbar .toolbar-btn--font-size')
  await expect(control).toHaveText('24')
  const before = await pixelState(page, id)
  await control.hover()
  await page.locator('bc-float-toolbar-item[title="更多设置…"]').click()
  await expect(page.locator('bc-font-settings-dialog')).toBeVisible()
  await page.getByRole('tab', {name: '高级', exact: true}).click()
  const scaleInput = page.locator('bc-font-settings-dialog [data-setting-field="font-scale"] input')
  await scaleInput.fill('200')
  await scaleInput.press('Tab')
  expect(await pixelState(page, id)).toEqual(before)
  await page.getByRole('button', {name: '取消', exact: true}).click()
  expect(await pixelState(page, id)).toEqual(before)
  await control.hover()
  await page.locator('bc-float-toolbar-item[title="更多设置…"]').click()
  await page.getByRole('tab', {name: '高级', exact: true}).click()
  await scaleInput.fill('200')
  await scaleInput.press('Tab')
  await page.getByRole('button', {name: '确定', exact: true}).click()
  await expect(control).toHaveText('32')
  const after = await pixelState(page, id)
  expect(after.props).toMatchObject({fs: 16, pfs: 2})
  expect(after.deltas).toEqual(before.deltas)
  expect(await fontSize(page, id)).toBeCloseTo(32, 2)
  await page.locator('bc-fixed-toolbar').getByRole('button', { name: '撤销', exact: true }).click()
  await expect.poll(() => pixelState(page, id)).toEqual(before)
})

test('heading defaults and fixed px update after document font changes without moving the caret', async ({page}) => {
  await start(page)
  const id = await createPixelParagraph(page, {heading: 1})
  await setRange(page, id, 3)
  const control = page.locator('bc-fixed-toolbar .toolbar-btn--font-size')
  await expect(control).toHaveText('32')
  await page.locator('block-craft-editor').evaluate(editor => {
    const doc = (window as any).ng.getComponent(editor).doc
    doc.crud.updateBlockProps(doc.rootId, {fs: 20})
  })
  await expect(control).toHaveText('40')
  expect(await fontSize(page, id)).toBeCloseTo(40, 2)
  await setRange(page, id, 0, 6)
  await choosePixels(page, 24)
  await expect(control).toHaveText('24')
  expect((await pixelState(page, id)).props).toMatchObject({fs: 24, heading: 1})
  await page.locator('block-craft-editor').evaluate(editor => {
    const doc = (window as any).ng.getComponent(editor).doc
    doc.crud.updateBlockProps(doc.rootId, {fs: 16})
  })
  await expect(control).toHaveText('24')
  expect(await fontSize(page, id)).toBeCloseTo(24, 2)
})

test('font size labels round only the display and fit their trigger with a matched menu', async ({page}) => {
  await start(page)
  const cases = [
    {size: 20.01, paragraphScale: 1, inlineScale: 1, label: '20'},
    {size: 20.056, paragraphScale: 1, inlineScale: 1, label: '20.1'},
    {size: 11.99, paragraphScale: 1, inlineScale: 1, label: '12'},
    {size: 511.94, paragraphScale: 1, inlineScale: 1, label: '511.9'},
    {size: 4095.99, paragraphScale: 3, inlineScale: 3, label: '36863.9'},
  ]
  const control = page.locator('bc-fixed-toolbar .toolbar-btn--font-size')
  for (const item of cases) {
    const id = await createPixelParagraph(page, {fs: item.size, pfs: item.paragraphScale}, [
      {insert: '字号验证文本', attributes: {'t:fs': item.inlineScale}},
    ])
    const before = await pixelState(page, id)
    await setRange(page, id, 0, 6)
    await expect(control).toHaveText(item.label)
    await expect.poll(() => control.locator('span').evaluate(el => el.scrollWidth > el.clientWidth)).toBe(false)
    expect(await control.evaluate(el => {
      const label = el.querySelector('span')!.getBoundingClientRect()
      const caret = el.querySelector('i')!.getBoundingClientRect()
      const button = el.getBoundingClientRect()
      return label.left >= button.left && label.right <= caret.left && caret.right <= button.right
    })).toBe(true)
    expect(await pixelState(page, id)).toEqual(before)
  }
  await control.hover()
  const menu = page.locator('.cs-dropdown-standard-menu').filter({has: page.locator('bc-float-toolbar-item[name="font-size"]')})
  await expect(menu).toBeVisible()
  await expect.poll(async () => Math.abs((await menu.boundingBox())!.width - (await control.boundingBox())!.width)).toBeLessThan(0.1)
})

test('font family dropdown expands to show full names while keeping its smaller trigger', async ({page}) => {
  await start(page)
  const id = await createPixelParagraph(page, {})
  await setRange(page, id, 0, 6)
  const control = page.locator('bc-fixed-toolbar .toolbar-btn--font-family')
  await expect(control).toHaveText('默认字体')
  await control.hover()
  const menu = page.locator('.cs-dropdown-standard-menu').filter({has: page.locator('bc-float-toolbar-item[name="font-family"]')})
  await expect(menu).toBeVisible()
  expect((await control.boundingBox())!.width).toBe(104)
  await expect.poll(async () => (await menu.boundingBox())!.width).toBeGreaterThan(104)
  const item = menu.getByTitle('Times New Roman', {exact: true})
  const name = item.locator('span')
  expect(await name.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(false)
  expect(await menu.locator('bc-float-toolbar-item > span').evaluateAll(names =>
    names.filter(el => el.scrollWidth > el.clientWidth).map(el => el.textContent),
  )).toEqual([])
  await item.click()
  await expect(control).toHaveText('Times New Roman')
  expect((await pixelState(page, id)).deltas[0].attributes['t:ff']).toBe('times')
  await control.hover()
  await menu.getByTitle('更多设置…', {exact: true}).click()
  await expect(page.locator('bc-font-settings-dialog')).toBeVisible()
  await page.getByRole('button', {name: '取消', exact: true}).click()
})

test('compact toolbar exposes the same actual-pixel operations', async ({page}) => {
  await page.setViewportSize({width: 880, height: 1000})
  await start(page)
  const id = await createPixelParagraph(page, {pfs: 1.5})
  await setRange(page, id, 0, 6)
  const toolbar = page.locator('bc-fixed-toolbar')
  const more = toolbar.getByRole('button', {name: '更多格式', exact: true})
  await expect(more).toBeVisible()
  await more.hover()
  await page.locator('.responsive-more-menu').getByText('字号', {exact: true}).hover()
  const menu = page.locator('.cs-submenu-panel').filter({has: page.locator('bc-float-toolbar-item[name="font-size"]')})
  await expect(menu).toBeVisible()
  await expect(menu.locator('input')).toHaveCount(0)
  await expect(menu).not.toContainText('px')
  expect((await menu.boundingBox())!.width).toBeLessThan(140)
  await expect(menu.getByText('继承字号', {exact: true})).toHaveCount(0)
  await page.locator('bc-float-toolbar-item').filter({hasText: /^24$/}).click()
  await expect.poll(async () => (await pixelState(page, id)).props.fs).toBe(16)
  expect((await pixelState(page, id)).props.pfs).toBe(1.5)
  expect(await fontSize(page, id)).toBeCloseTo(24, 2)
})
