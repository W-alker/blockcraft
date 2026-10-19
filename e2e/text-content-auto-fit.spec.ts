import {expect, test, type Page} from '@playwright/test'

async function initialize(page: Page) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng
    ?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
}
async function create(page: Page, flavour: string, props: Record<string, unknown> = {}) {
  return page.evaluate(async ({flavour, props}) => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const snapshot = doc.schemas.createSnapshot(flavour, ['自适应', {
      width: 260, height: 160, textAutoFit: 'resize-shape', ...props,
    }])
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot])
    await doc.navigateToBlock(snapshot.id)
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    return {id: snapshot.id, textId: flavour === 'text-box' ? snapshot.children[0].id : snapshot.id}
  }, {flavour, props})
}
async function measure(page: Page, id: string) {
  return page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const block = doc.getBlockById(id)
    const surface = block.hostElement.querySelector('[data-bc-object-surface]')
    const content = surface.querySelector('.text-box-block__content, .word-art-block__editor')
    const style = getComputedStyle(surface)
    return {width: parseFloat(style.width), height: parseFloat(style.height),
      overflow: content.scrollHeight - content.clientHeight,
      overflowX: content.scrollWidth - content.clientWidth,
      autoFit: block.props.textAutoFit ?? 'none',
      props: {...block.props},
    }
  }, id)
}
async function replaceText(page: Page, textId: string, text: string) {
  await page.evaluate(({textId, text}) => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const block = doc.getBlockById(textId)
    doc.selection.setCursorAtBlock(block, true, false)
    doc.crud.undoManager.stopCapturing()
    block.replaceText(0, block.textLength, text)
  }, {textId, text})
}

for (const flavour of ['text-box', 'word-art']) {
  test(`${flavour} grows, shrinks, reflows and replays text without extra undo items`, async ({page}) => {
    await initialize(page)
    const {id, textId} = await create(page, flavour)
    await expect.poll(async () => (await measure(page, id)).height).toBeLessThan(160)
    const initial = await measure(page, id)
    await page.evaluate(() => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      doc.crud.undoManager.clearHistory()
    })
    await replaceText(page, textId, '随着文字增加，这个对象应该自动增高并保持原来的字号。'.repeat(6))
    await expect.poll(async () => (await measure(page, id)).height).toBeGreaterThan(initial.height + 40)
    await expect.poll(async () => (await measure(page, id)).overflow).toBeLessThanOrEqual(1)
    const grown = await measure(page, id)
    await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.crud.undoManager.undo())
    await expect.poll(async () => (await measure(page, id)).height).toBe(initial.height)
    expect(await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.crud.undoManager.isCanUndo())).toBe(false)
    await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.crud.undoManager.redo())
    await expect.poll(async () => (await measure(page, id)).height).toBe(grown.height)
    await page.evaluate(id => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      doc.getBlockById(id).commitResize({width: 180, height: doc.model.getProps(id).height,
        offsetX: 0, offsetY: 0, handle: 'east'})
    }, id)
    await expect.poll(async () => (await measure(page, id)).height).toBeGreaterThan(grown.height)
    expect((await measure(page, id)).autoFit).toBe('resize-shape')
    expect((await measure(page, id)).props.height).toBe(160)
    await replaceText(page, textId, '短文本')
    await expect.poll(async () => (await measure(page, id)).height).toBeLessThan(grown.height)
    // A deliberate height drag switches this object back to fixed size.
    await page.evaluate(id => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      doc.getBlockById(id).commitResize({width: 180, height: 220,
        offsetX: 0, offsetY: 0, handle: 'south'})
    }, id)
    await expect.poll(async () => (await measure(page, id)).autoFit).toBe('none')
    expect((await measure(page, id)).height).toBe(220)
  })
}

test('vertical text box grows on its block axis and preserves shape reserves', async ({page}) => {
  await initialize(page)
  const {id, textId} = await create(page, 'text-box', {
    shape: 'rounded-rectangle', textDirection: 'vertical-rl', width: 300, height: 200,
    textPadding: '10 20 30 40',
  })
  await expect.poll(async () => (await measure(page, id)).width).toBeLessThan(300)
  const initial = await measure(page, id)
  await replaceText(page, textId, '竖排内容应该沿着横向增加空间，不挤掉边距。'.repeat(8))
  await expect.poll(async () => (await measure(page, id)).width).toBeGreaterThan(initial.width)
  await expect.poll(async () => (await measure(page, id)).overflowX).toBeLessThanOrEqual(1)
  expect((await measure(page, id)).height).toBe(200)
  await replaceText(page, textId, '短句')
  await expect.poll(async () => (await measure(page, id)).width).toBeLessThan(initial.width + 10)
})

test('fixed objects and nonlinear word-art retain authored dimensions', async ({page}) => {
  await initialize(page)
  for (const flavour of ['text-box', 'word-art']) {
    const {id, textId} = await create(page, flavour, {textAutoFit: 'none'})
    await replaceText(page, textId, '固定尺寸'.repeat(60))
    expect((await measure(page, id)).height).toBe(160)
  }
  const {id, textId} = await create(page, 'word-art', {textTransform: 'arch-up'})
  await replaceText(page, textId, '路径艺术字'.repeat(10))
  expect((await measure(page, id)).height).toBe(160)
})

test('text-frame panel enables fitting without replacing other formatting', async ({page, browserName}) => {
  await initialize(page)
  const {id} = await create(page, 'text-box', {textAutoFit: 'none'})
  await page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.selection.selectBlock(doc.getBlockById(id))
  }, id)
  const toolbar = page.locator('[data-bc-object-format-toolbar]')
  await toolbar.getByRole('button', {name: '文本选项', exact: true}).click()
  const panel = page.locator('.object-format__panel')
  await panel.getByText('文本框', {exact: true}).first().click()
  await panel.locator('label').filter({hasText: '尺寸适应'}).locator('cs-select').click()
  await page.getByText('内容自适应', {exact: true}).last().click()
  await expect.poll(async () => (await measure(page, id)).height).toBeLessThan(160)
  expect((await measure(page, id)).autoFit).toBe('resize-shape')
  if (browserName === 'chromium') await page.screenshot({path: '/tmp/blockcraft-auto-fit-panel.png'})
})

for (const {flavour, direction, axis} of [
  {flavour: 'text-box', direction: 'horizontal', axis: 'height'},
  {flavour: 'text-box', direction: 'vertical-rl', axis: 'width'},
  {flavour: 'word-art', direction: 'horizontal', axis: 'height'},
] as const) {
  test(`${flavour} ${direction} fits existing content immediately when enabled in the panel`, async ({page}) => {
    await initialize(page)
    const {id, textId} = await create(page, flavour, {
      textAutoFit: 'none', textDirection: direction,
    })
    await replaceText(page, textId, '已经输入的内容，切换自适应后应立即调整尺寸。'.repeat(10))
    await page.evaluate(async () => { await document.fonts.ready })
    // Settle the previous text mutation before enabling the setting. No further
    // typing or resize should be needed to request the initial measurement.
    await page.waitForTimeout(250)
    const fixed = await measure(page, id)
    expect(fixed.width).toBe(260)
    expect(fixed.height).toBe(160)
    await page.evaluate(id => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      doc.selection.selectBlock(doc.getBlockById(id))
    }, id)
    await page.locator('[data-bc-object-format-toolbar]')
      .getByRole('button', {name: '文本选项', exact: true}).click()
    const panel = page.locator('.object-format__panel')
    await panel.getByText('文本框', {exact: true}).first().click()
    const sizing = panel.locator('label').filter({hasText: '尺寸适应'}).locator('cs-select')
    await sizing.click()
    await page.getByText('内容自适应', {exact: true}).last().click()
    await expect.poll(async () => (await measure(page, id))[axis]).toBeGreaterThan(fixed[axis])
    const fitted = await measure(page, id)
    expect(fitted[axis === 'width' ? 'overflowX' : 'overflow']).toBeLessThanOrEqual(1)
    expect(fitted[axis === 'width' ? 'height' : 'width']).toBe(fixed[axis === 'width' ? 'height' : 'width'])

    // A second activation must work after observers have been disconnected.
    await sizing.click()
    await page.getByText('固定尺寸', {exact: true}).last().click()
    await expect.poll(async () => (await measure(page, id))[axis]).toBe(fixed[axis])
    await sizing.click()
    await page.getByText('内容自适应', {exact: true}).last().click()
    await expect.poll(async () => (await measure(page, id))[axis]).toBe(fitted[axis])
  })
}

test('undo enabling content fit restores the fixed frame', async ({page}) => {
  await initialize(page)
  const {id} = await create(page, 'text-box', {textAutoFit: 'none'})
  await page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.crud.undoManager.clearHistory()
    doc.getBlockById(id).updateProps({textAutoFit: 'resize-shape'})
  }, id)
  await expect.poll(async () => (await measure(page, id)).height).toBeLessThan(160)
  await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.crud.undoManager.undo())
  await expect.poll(async () => (await measure(page, id)).height).toBe(160)
})

test('absolute group bounds follow fitted content and saved dimensions reopen unchanged', async ({page}) => {
  await initialize(page)
  const {id, textId} = await create(page, 'text-box')
  const groupId = await page.evaluate(async id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.placement.setMode(doc.getBlockById(id), 'absolute')
    doc.crud.updateBlockProps(id, {position: '80 80'})
    const sibling = doc.schemas.createSnapshot('shape', ['rectangle'])
    sibling.props = {...sibling.props, width: 60, height: 40}
    const siblingId = doc.placement.insertAbsoluteSnapshot(sibling, {anchorRect: null})
    doc.crud.updateBlockProps(siblingId, {position: '400 80'})
    const groupId = doc.placement.group([id, siblingId])
    await doc.navigateToBlock(groupId)
    return groupId
  }, id)
  const readGroup = () => page.evaluate(groupId => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    return doc.model.getProps(groupId).height
  }, groupId)
  const before = await readGroup()
  await replaceText(page, textId, '组合中的文本增长应该撑开对象边界。'.repeat(10))
  await expect.poll(readGroup).toBeGreaterThan(before + 40)
  const saved = await measure(page, id)
  const copyId = await page.evaluate(async id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const snapshot = doc.getBlockById(id).toSnapshot()
    const props = JSON.parse(JSON.stringify(snapshot.props))
    delete props.position
    const copy = doc.schemas.createSnapshot('text-box', [doc.getBlockById(snapshot.children[0].id).textContent(), props])
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [copy])
    await doc.navigateToBlock(copy.id)
    return copy.id
  }, id)
  await expect.poll(async () => (await measure(page, copyId)).height).toBe(saved.height)
  expect((await measure(page, copyId)).props.height).toBe(160)
})

test('native typing, font size, padding and zoom update fit without changing text scale', async ({page}) => {
  await initialize(page)
  const {id, textId} = await create(page, 'text-box', {width: 180})
  const first = await measure(page, id)
  await page.evaluate(textId => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.selection.setCursorAtBlock(textId, false, false)
  }, textId)
  await page.keyboard.type('Native typing wraps across the text frame. '.repeat(5))
  await expect.poll(async () => (await measure(page, id)).height).toBeGreaterThan(first.height)
  const typed = await measure(page, id)
  await page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.getBlockById(id).updateProps({textFont: '24px 400', textPadding: '20 12'})
  }, id)
  await expect.poll(async () => (await measure(page, id)).height).toBeGreaterThan(typed.height)
  const larger = await measure(page, id)
  await page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.getBlockById(id).updateProps({rotation: 30})
    doc.viewScale.setScale(0.75)
  }, id)
  await expect.poll(async () => (await measure(page, id)).height).toBe(larger.height)
})

test('a synchronized measurement does not start a cache feedback loop', async ({page}) => {
  await initialize(page)
  for (const flavour of ['text-box', 'word-art']) {
    const {id, textId} = await create(page, flavour)
    await expect.poll(async () => (await measure(page, id)).height).toBeLessThan(160)
    await page.evaluate(id => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      doc.getBlockById(id).updateProps({textFit: 180})
    }, id)
    await page.waitForTimeout(250)
    expect((await measure(page, id)).height).toBe(180)
    await replaceText(page, textId, '重新测量')
    await expect.poll(async () => (await measure(page, id)).height).toBeLessThan(180)
  }
})
