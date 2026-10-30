import {expect, test, type Page} from '@playwright/test'

async function initialize(page: Page, props: Record<string, unknown> = {}, texts = ['AB']) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng?.getComponent(
    document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  return page.evaluate(async ({props, texts}) => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const shape = doc.schemas.createSnapshot('shape', ['rectangle'])
    Object.assign(shape.props, {width: 260, height: 120}, props)
    shape.children = texts.map(text => doc.schemas.createSnapshot('shape-text', [text]))
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [shape])
    await doc.navigateToBlock(shape.id)
    ;(window as any).shapeTextFixture = {doc, id: shape.id}
    return shape.id as string
  }, {props, texts})
}

async function focus(page: Page, index: number, offset: number) {
  await page.evaluate(({index, offset}) => {
    const {doc, id} = (window as any).shapeTextFixture
    const block = doc.getBlockById(doc.model.getChildrenIds(id)[index])
    block.containerElement.focus({preventScroll: true})
    block.setInlineRange(offset)
    doc.selection.scrollSelectionIntoView()
    doc.crud.undoManager.stopCapturing()
  }, {index, offset})
}

async function read(page: Page) {
  return page.evaluate(() => {
    const {doc, id} = (window as any).shapeTextFixture
    const block = doc.getBlockById(id)
    const shell = block.hostElement.querySelector('.shape-block__shell')!
    const frame = block.hostElement.querySelector('.shape-block__text-frame')!
    const range = document.getSelection()?.rangeCount ? document.getSelection()!.getRangeAt(0) : null
    let caret = range?.getBoundingClientRect()
    if (range && !caret?.width && !caret?.height && range.startContainer instanceof Text && range.startContainer.length) {
      const glyph = range.cloneRange()
      const offset = Math.min(range.startOffset, range.startContainer.length - 1)
      glyph.setStart(range.startContainer, offset)
      glyph.setEnd(range.startContainer, offset + 1)
      caret = glyph.getBoundingClientRect()
    }
    return {
      width: shell.clientWidth, height: shell.clientHeight,
      props: doc.model.getProps(id), ids: block.childrenIds,
      children: block.childrenIds.map((childId: string) => ({
        flavour: doc.model.getFlavour(childId), text: doc.model.getText(childId),
      })),
      paragraphs: Array.from(frame.children).filter((el: any) => el.classList.contains('shape-text-block')).map((el: any) => ({
        overflow: getComputedStyle(el).overflow, top: el.scrollTop, left: el.scrollLeft,
        height: el.clientHeight, scrollHeight: el.scrollHeight,
      })),
      frame: {overflow: getComputedStyle(frame).overflow, scrollbar: getComputedStyle(frame).scrollbarWidth,
        top: frame.scrollTop, left: frame.scrollLeft,
        overflowY: frame.scrollHeight - frame.clientHeight, overflowX: frame.scrollWidth - frame.clientWidth},
      bounds: frame.getBoundingClientRect().toJSON(), caret: caret?.toJSON(),
      head: doc.selection.value?.head,
      nativeInside: !!range && frame.contains(range.startContainer),
    }
  })
}

async function expectCaretVisible(page: Page) {
  await expect.poll(async () => {
    const state = await read(page)
    return !!state.caret && state.nativeInside && state.caret.top >= state.bounds.top - 2
      && state.caret.bottom <= state.bounds.bottom + 2 && state.caret.left >= state.bounds.left - 2
      && state.caret.right <= state.bounds.right + 2
  }).toBe(true)
}

test('shape keeps Enter paragraphs and Shift+Enter line breaks with undo and saved content', async ({page}) => {
  await initialize(page)
  await focus(page, 0, 1)
  await page.keyboard.press('Enter')
  await expect.poll(async () => (await read(page)).children).toEqual([
    {flavour: 'shape-text', text: 'A'}, {flavour: 'shape-text', text: 'B'},
  ])
  await expectCaretVisible(page)
  await page.evaluate(() => (window as any).shapeTextFixture.doc.crud.undoManager.undo())
  await expect.poll(async () => (await read(page)).children).toEqual([{flavour: 'shape-text', text: 'AB'}])
  await page.evaluate(() => (window as any).shapeTextFixture.doc.crud.undoManager.redo())
  await expect.poll(async () => (await read(page)).children.length).toBe(2)
  await focus(page, 1, 0)
  await page.keyboard.press('Shift+Enter')
  await page.keyboard.type('X')
  await expect.poll(async () => (await read(page)).children).toEqual([
    {flavour: 'shape-text', text: 'A'}, {flavour: 'shape-text', text: '\nXB'},
  ])
  const before = await read(page)
  await page.evaluate(async () => {
    const {doc, id} = (window as any).shapeTextFixture
    const saved = JSON.parse(JSON.stringify(doc.model.toSnapshot(id)))
    const copy = doc.schemas.createSnapshot('shape', [saved.props.shape])
    copy.props = saved.props
    copy.children = saved.children.map((child: any) => doc.schemas.createSnapshot('shape-text', [child.children]))
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [copy])
    // 重建对象可能处于虚拟窗口之外；读组件前先通过公开导航完成挂载。
    await doc.navigateToBlock(copy.id)
    ;(window as any).shapeTextFixture.id = copy.id
  })
  await expect.poll(async () => (await read(page)).children).toEqual(before.children)
  expect((await read(page)).props).toEqual(before.props)
})

test('consecutive Enter keeps empty shape paragraphs inside the text frame', async ({page}) => {
  await initialize(page, {}, ['A'])
  await focus(page, 0, 1)
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Enter')
    await expect.poll(async () => (await read(page)).children.length).toBe(i + 2)
  }
  await page.keyboard.type('B')
  await expect.poll(async () => (await read(page)).children).toEqual([
    {flavour: 'shape-text', text: 'A'}, {flavour: 'shape-text', text: ''},
    {flavour: 'shape-text', text: ''}, {flavour: 'shape-text', text: 'B'},
  ])
  await expectCaretVisible(page)
})

for (const direction of ['horizontal', 'vertical-rl']) {
  for (const alignment of ['middle', 'bottom']) {
    test(`fixed shape ${direction} ${alignment} scrolls the whole text frame without paragraph scrollbars`, async ({page}, testInfo) => {
      await initialize(page, {textDirection: direction, textAlignment: `left ${alignment}`}, ['第一段', '第二段'])
      await focus(page, 0, 3)
      await page.keyboard.insertText('连续输入自动折行，保持段落完整。'.repeat(18))
      const state = await read(page)
      expect(state.children.length).toBe(2)
      expect(state.width).toBe(260)
      expect(state.height).toBe(120)
      expect(state.paragraphs.every(p => p.overflow === 'visible' && p.top === 0 && p.left === 0)).toBe(true)
      expect(state.frame.scrollbar).toBe('none')
      await expectCaretVisible(page)
      await focus(page, 1, 3)
      await page.keyboard.press('Enter')
      await page.keyboard.type('last paragraph')
      await expectCaretVisible(page)
      await focus(page, 0, 0)
      await expectCaretVisible(page)
      if (direction === 'horizontal' && alignment === 'middle') {
        await page.locator('.shape-block').first().screenshot({path: testInfo.outputPath('fixed-shape-text.png')})
      }
    })
  }
}

for (const direction of ['horizontal', 'vertical-rl']) {
  test(`shape ${direction} exposes content fitting and fits existing wrapped paragraphs only when enabled`, async ({page}) => {
    await initialize(page, {shape: 'ellipse', height: direction === 'vertical-rl' ? 220 : 120,
      textDirection: direction, textPadding: '8 10 12 14'}, [
      '已有内容自动折行，启用开关后应完整容纳。'.repeat(4), '第二段文字',
    ])
    await page.evaluate(() => {
      const {doc, id} = (window as any).shapeTextFixture
      doc.selection.selectBlock(id)
    })
    const toolbar = page.locator('[data-bc-object-format-toolbar]')
    await expect(toolbar.getByRole('button', {name: '恢复内容自适应', exact: true})).toBeVisible()
    const fixed = await read(page)
    expect(fixed.width).toBe(260)
    expect(fixed.height).toBe(direction === 'vertical-rl' ? 220 : 120)
    await toolbar.getByRole('button', {name: '恢复内容自适应', exact: true}).click()
    await expect(toolbar.getByRole('button', {name: '切换为固定尺寸', exact: true})).toBeVisible()
    const axis = direction === 'horizontal' ? 'height' : 'width'
    const overflow = direction === 'horizontal' ? 'overflowY' : 'overflowX'
    await expect.poll(async () => (await read(page))[axis]).toBeGreaterThan(fixed[axis])
    await expect(async () => {
      const state = await read(page)
      expect(state.frame[overflow], JSON.stringify(state)).toBeLessThanOrEqual(1)
    }).toPass({timeout: 5000})
    const grown = await read(page)
    expect(grown[axis === 'height' ? 'width' : 'height']).toBe(fixed[axis === 'height' ? 'width' : 'height'])
    await toolbar.getByRole('button', {name: '切换为固定尺寸', exact: true}).click()
    const disabled = await read(page)
    await focus(page, 1, 5)
    await page.keyboard.insertText('关闭自适应后维持尺寸。'.repeat(4))
    await expectCaretVisible(page)
    expect((await read(page))[axis]).toBe(disabled[axis])
    await page.evaluate(() => {
      const {doc, id} = (window as any).shapeTextFixture
      doc.selection.selectBlock(id)
    })
    await toolbar.getByRole('button', {name: '恢复内容自适应', exact: true}).click()
    await expect.poll(async () => (await read(page))[axis]).toBeGreaterThan(disabled[axis])
    await expect.poll(async () => (await read(page)).frame[overflow]).toBeLessThanOrEqual(1)
  })
}

test('vertical shape fitting stops at a column width constraint without repeated geometry writes', async ({page}) => {
  await initialize(page, {shape: 'ellipse', textDirection: 'vertical-rl', textPadding: '8 10 12 14',
    textAutoFit: 'resize-shape'}, ['长内容超出正文列宽。'.repeat(10)])
  await expect.poll(async () => (await read(page)).props.width).toBeGreaterThan(260)
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  const before = await read(page)
  expect(before.props.width).toBeLessThan(1500)
  expect(before.frame.overflowX).toBeGreaterThan(0)
  const changes = await page.evaluate(async () => {
    const {doc, id} = (window as any).shapeTextFixture
    let changes = 0
    const subscription = doc.getBlockById(id).onPropsChange.subscribe(() => changes++)
    for (let i = 0; i < 10; i++) await new Promise(requestAnimationFrame)
    subscription.unsubscribe()
    return changes
  })
  expect(changes).toBe(0)
  expect((await read(page)).props.width).toBe(before.props.width)
})
