import {expect, test, type Page} from '@playwright/test'

// 持续输入格式的浏览器集成回归。
test.use({viewport: {width: 2200, height: 1000}})

async function start(page: Page, deltas: any[] = [{insert: 'AB', attributes: {
  't:px': 24, 't:fs': 1.25, 't:ff': 'times', 'a:bold': true, 'a:italic': true,
}}]) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() =>
    (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  return page.locator('block-craft-editor').evaluate(async (editor, deltas) => {
    const doc = (window as any).ng.getComponent(editor).doc
    const paragraph = doc.schemas.createSnapshot('paragraph', [deltas, {pfs: 1.5}])
    const plain = doc.schemas.createSnapshot('paragraph', ['plain'])
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [paragraph, plain])
    await doc.navigateToBlock(paragraph.id)
    doc.crud.undoManager.clearHistory()
    return {id: paragraph.id as string, plain: plain.id as string}
  }, deltas)
}

async function setRange(page: Page, id: string, start: number, end = start) {
  await page.locator('block-craft-editor').evaluate((editor, range) => {
    const doc = (window as any).ng.getComponent(editor).doc
    doc.selection.setSelection(
      {blockId: range.id, type: 'text', offset: range.start},
      {blockId: range.id, type: 'text', offset: range.end},
    )
  }, {id, start, end})
}

async function read(page: Page, id: string) {
  return page.locator('block-craft-editor').evaluate((editor, id) => {
    return (window as any).ng.getComponent(editor).doc.model.getTextDeltas(id)
  }, id)
}

for (const mode of ['range-backspace', 'range-delete', 'backspace', 'delete']) {
  test(`empty text retains typography and character styles after ${mode}`, async ({page}) => {
    const {id} = await start(page)
    const original = await read(page, id)
    await setRange(page, id, mode === 'backspace' ? 2 : 0, mode.startsWith('range') ? 2 : undefined)
    const key = mode.endsWith('backspace') ? 'Backspace' : 'Delete'
    await page.keyboard.press(key)
    if (!mode.startsWith('range')) await page.keyboard.press(key)
    await expect.poll(() => read(page, id)).toEqual([])
    await expect(page.locator('bc-fixed-toolbar .toolbar-btn--font-size')).toHaveText('45')
    await expect(page.locator('bc-fixed-toolbar .toolbar-btn--font-family')).toHaveText('Times New Roman')
    await page.keyboard.type('XY')
    await expect.poll(() => read(page, id)).toEqual([{insert: 'XY', attributes: original[0].attributes}])
    const text = page.locator(`block-craft-editor [data-block-id="${id}"] c-text`)
    await expect(text).toHaveCSS('font-size', '45px')
    await expect(text).toHaveCSS('font-weight', '700')
    await expect(text).toHaveCSS('font-style', 'italic')
  })
}

test('toolbar formatting survives deleting the final character and can be changed while empty', async ({page}) => {
  const {id, plain} = await start(page, [{insert: 'AB'}])
  await setRange(page, id, 0, 1)
  const toolbar = page.locator('bc-fixed-toolbar')
  await toolbar.locator('.toolbar-btn--font-size').hover()
  await page.locator('bc-float-toolbar-item[name="font-size"]').filter({hasText: /^24$/}).click()
  await toolbar.getByTitle('加粗', {exact: true}).click()
  await setRange(page, id, 1, 2)
  await page.keyboard.press('Backspace')
  await setRange(page, id, 0, 1)
  await page.keyboard.press('Backspace')
  await expect.poll(() => read(page, id)).toEqual([])
  await expect(toolbar.locator('.toolbar-btn--font-size')).toHaveText('24')
  // 空段落上的新命令应覆盖保留格式。
  await toolbar.getByTitle('加粗', {exact: true}).click()
  await page.keyboard.type('X')
  await expect.poll(async () => (await read(page, id))[0]?.attributes?.['a:bold']).toBeUndefined()
  await expect(page.locator(`[data-block-id="${id}"] c-text`)).toHaveCSS('font-size', '24px')
  await setRange(page, plain, 5)
  await page.keyboard.type('Z')
  await expect.poll(() => read(page, plain)).toEqual([{insert: 'plainZ'}])
})

test('partial deletion retains current formatting and undo restores the editing context', async ({page}) => {
  const {id} = await start(page, [
    {insert: 'A', attributes: {'t:px': 24, 'a:bold': true}},
    {insert: 'B', attributes: {'t:px': 24, 'a:italic': true}},
  ])
  const original = await read(page, id)
  await setRange(page, id, 1, 2)
  await page.keyboard.press('Backspace')
  await page.keyboard.type('C')
  await expect.poll(() => read(page, id)).toEqual([
    original[0], {insert: 'C', attributes: original[1].attributes},
  ])
  await page.locator('bc-fixed-toolbar').getByTitle('撤销', {exact: true}).click()
  await expect.poll(() => read(page, id)).toEqual(original)
  await setRange(page, id, 0, 2)
  await page.keyboard.press('Delete')
  await expect.poll(() => read(page, id)).toEqual([])
  await page.locator('bc-fixed-toolbar').getByTitle('撤销', {exact: true}).click()
  await expect.poll(() => read(page, id)).toEqual(original)
  await page.locator('bc-fixed-toolbar').getByTitle('重做', {exact: true}).click()
  await expect.poll(() => read(page, id)).toEqual([])
  await page.locator('bc-fixed-toolbar').getByTitle('撤销', {exact: true}).click()
  await setRange(page, id, 0)
  await page.keyboard.type('X')
  await expect.poll(() => read(page, id)).toEqual([
    {insert: 'XA', attributes: original[0].attributes}, original[1],
  ])
})

test('caret commands persist through IME, deletion and paragraph continuation', async ({page}) => {
  const {id} = await start(page, [])
  await setRange(page, id, 0)
  const toolbar = page.locator('bc-fixed-toolbar')
  await toolbar.locator('.toolbar-btn--font-size').hover()
  await page.locator('bc-float-toolbar-item[name="font-size"]').filter({hasText: /^24$/}).click()
  await toolbar.getByTitle('加粗', {exact: true}).click()
  await page.keyboard.type('AB')
  const format = (await read(page, id))[0].attributes
  expect(format).toMatchObject({'a:bold': true})
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Backspace')
  await expect.poll(() => read(page, id)).toEqual([])
  // 组合事件覆盖框架 IME 提交链路；真实系统输入法另行验收。
  await page.locator('block-craft-editor').evaluate((editor, id) => {
    const doc = (window as any).ng.getComponent(editor).doc
    const target = doc.getBlockById(id).containerElement
    target.dispatchEvent(new CompositionEvent('compositionstart', {bubbles: true, cancelable: true}))
    target.dispatchEvent(new CompositionEvent('compositionend', {bubbles: true, cancelable: true, data: '续写'}))
  }, id)
  await expect.poll(() => read(page, id)).toEqual([{insert: '续写', attributes: format}])
  await page.keyboard.press('Enter')
  const nextId = await page.locator('block-craft-editor').evaluate(editor =>
    (window as any).ng.getComponent(editor).doc.selection.value.start.blockId)
  expect(nextId).not.toBe(id)
  await page.keyboard.type('C')
  await expect.poll(() => read(page, nextId)).toEqual([{insert: 'C', attributes: format}])
  await expect(page.locator(`block-craft-editor [data-block-id="${nextId}"] c-text`)).toHaveCSS('font-size', '24px')
})

test('redo restores the format of an empty editing position', async ({page}) => {
  const {id} = await start(page)
  const format = (await read(page, id))[0].attributes
  await setRange(page, id, 0, 2)
  await page.keyboard.press('Backspace')
  const toolbar = page.locator('bc-fixed-toolbar')
  await toolbar.getByTitle('撤销', {exact: true}).click()
  await expect.poll(async () => (await read(page, id))[0]?.insert).toBe('AB')
  await toolbar.getByTitle('重做', {exact: true}).click()
  await expect.poll(() => read(page, id)).toEqual([])
  await expect(toolbar.locator('.toolbar-btn--font-size')).toHaveText('45')
  await page.keyboard.type('X')
  await expect.poll(() => read(page, id)).toEqual([{insert: 'X', attributes: format}])
})

test('empty paragraph defaults survive navigation and a fresh document', async ({page}) => {
  const {id, plain} = await start(page)
  const format = (await read(page, id))[0].attributes
  await setRange(page, id, 0, 2)
  await page.keyboard.press('Delete')
  await setRange(page, plain, 0)
  await setRange(page, id, 0)
  await expect(page.locator(`[data-block-id="${id}"] [data-bc-paragraph-defaults]`)).toHaveCSS('font-size', '45px')
  const snapshot = await page.locator('block-craft-editor').evaluate(editor =>
    (window as any).ng.getComponent(editor).doc.exportSnapshot())
  expect(snapshot.children.find((block: any) => block.id === id).props.textDefaults).toEqual(format)
  await page.reload()
  await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc)
  await page.locator('block-craft-editor').evaluate(async (editor, snapshot) => {
    const doc = (window as any).ng.getComponent(editor).doc
    const container = document.createElement('div')
    editor.appendChild(container)
    doc.initBySnapshot(snapshot, container)
    await doc.navigateToBlock(snapshot.children[0].id)
  }, snapshot)
  await setRange(page, id, 0)
  await page.keyboard.type('X')
  await expect.poll(() => read(page, id)).toEqual([{insert: 'X', attributes: format}])
  await expect(page.locator(`[data-block-id="${id}"] c-text`)).toHaveCSS('font-size', '45px')
})

test('empty format commands undo atomically and do not retain deleted links', async ({page}) => {
  const {id} = await start(page, [])
  await setRange(page, id, 0)
  const toolbar = page.locator('bc-fixed-toolbar')
  const defaults = () => page.locator('block-craft-editor').evaluate((editor, id) =>
    (window as any).ng.getComponent(editor).doc.model.getProps(id).textDefaults ?? {}, id)
  await toolbar.getByTitle('加粗', {exact: true}).click()
  await expect.poll(defaults).toEqual({'a:bold': true})
  await toolbar.getByTitle('撤销', {exact: true}).click()
  await expect.poll(defaults).toEqual({})
  await toolbar.getByTitle('重做', {exact: true}).click()
  await expect.poll(defaults).toEqual({'a:bold': true})
  await page.keyboard.type('X')
  await expect.poll(() => read(page, id)).toEqual([{insert: 'X', attributes: {'a:bold': true}}])
  await page.locator('block-craft-editor').evaluate((editor, id) => {
    const doc = (window as any).ng.getComponent(editor).doc
    doc.crud.formatText(id, 0, 1, {'a:link': 'https://example.com'})
    doc.selection.blur()
    doc.selection.setSelection({blockId: id, type: 'text', offset: 1})
  }, id)
  await toolbar.getByTitle('斜体', {exact: true}).click()
  await page.keyboard.press('Backspace')
  await page.keyboard.type('Y')
  await expect.poll(() => read(page, id)).toEqual([{insert: 'Y', attributes: {'a:bold': true, 'a:italic': true}}])
})

for (const tracking of [false, true]) {
  test(`paragraph transitions share typography rules with tracking=${tracking}`, async ({page}) => {
    await start(page, [])
    const setup = async (flavour: string, props: any, offset: number, text = 'AB') => {
      return page.locator('block-craft-editor').evaluate(async (editor, input) => {
        const doc = (window as any).ng.getComponent(editor).doc
        doc.revisions.setMode('off')
        const block = doc.schemas.createSnapshot(input.flavour, [[{insert: input.text, attributes: {'t:ff': 'times', 'a:bold': true}}], input.props])
        doc.crud.insertBlockSnapshots(doc.rootId, 0, [block])
        if (input.props.checked != null) doc.crud.updateBlockProps(block.id, {checked: input.props.checked})
        await doc.navigateToBlock(block.id)
        doc.selection.setSelection({blockId: block.id, type: 'text', offset: input.offset})
        doc.revisions.setActor({actorId: 'format-author', displayName: 'Format Author'})
        doc.revisions.setMode(input.tracking ? 'track' : 'off')
        return block.id
      }, {flavour, props, offset, text, tracking})
    }
    const selected = () => page.locator('block-craft-editor').evaluate(editor => {
      const doc = (window as any).ng.getComponent(editor).doc
      const id = doc.selection.value.start.blockId
      return {id, flavour: doc.model.getFlavour(id), props: doc.model.getProps(id)}
    })
    const props = {depth: 1, textAlign: 'center', fs: 20, pfs: 1.5, lh: 2, psb: 6, psa: 12, backColor: '#eeeeee', borderColor: '#333333'}
    await setup('paragraph', props, 2)
    await page.keyboard.press('Enter')
    const body = await selected()
    expect(body.props).toMatchObject(props)
    await page.keyboard.type('X')
    await expect(page.locator(`[data-block-id="${body.id}"] c-text`)).toHaveCSS('font-size', '30px')
    await expect(page.locator(`[data-block-id="${body.id}"] c-text`)).toHaveCSS('font-weight', '700')
    await setup('paragraph', {...props, heading: 1}, 2)
    await page.keyboard.press('Enter')
    const afterHeading = await selected()
    expect(afterHeading.props).toMatchObject({depth: 0})
    for (const key of ['heading', 'fs', 'pfs', 'lh', 'psb', 'psa', 'textDefaults']) expect(afterHeading.props[key]).toBeUndefined()
    await page.keyboard.type('X')
    await expect(page.locator(`[data-block-id="${afterHeading.id}"] c-text`)).toHaveCSS('font-size', '16px')
    await setup('paragraph', {...props, heading: 1}, 1)
    await page.keyboard.press('Enter')
    expect((await selected()).props).toMatchObject({...props, heading: 1})
    await setup('paragraph', {...props, heading: 1, nextParagraphStyle: 'same'}, 2)
    await page.keyboard.press('Enter')
    expect((await selected()).props).toMatchObject({...props, heading: 1, nextParagraphStyle: 'same'})
    await setup('bullet', props, 2)
    await page.keyboard.press('Enter')
    expect(await selected()).toMatchObject({flavour: 'bullet', props})
    // 空列表先降低缩进，再退出列表；空段落默认字符格式仍在。
    await page.keyboard.press('Enter')
    expect(await selected()).toMatchObject({flavour: 'bullet', props: {depth: 0}})
    await page.keyboard.press('Enter')
    expect(await selected()).toMatchObject({flavour: 'paragraph', props: {depth: 0, fs: 20, pfs: 1.5, lh: 2}})
    await setup('todo', {...props, checked: 123}, 2)
    await page.keyboard.press('Enter')
    expect(await selected()).toMatchObject({flavour: 'todo', props: {checked: 0}})
  })
}
