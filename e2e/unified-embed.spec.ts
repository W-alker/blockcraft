import {expect, test, type Locator, type Page} from '@playwright/test'

async function initialize(page: Page) {
  await page.route(/https:\/\/(?:www\.)?(?:figma\.com|embed\.figma\.com|player\.bilibili\.com|youtube-nocookie\.com|youtube\.com|juejin\.cn)\//, route => route.fulfill({contentType: 'text/html; charset=utf-8', body: '<h1>平台预览</h1>'}))
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => {
    const editor = document.querySelector('block-craft-editor')
    return editor && (window as any).ng?.getComponent(editor)?.doc?.isInitialized
  })
}
async function docAction(page: Page, action: 'undo' | 'redo' | 'stop') {
  await page.evaluate(action => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const undo = doc.crud.undoManager
    if (action === 'stop') undo.stopCapturing()
    else undo[action]()
  }, action)
}

async function dragHandle(page: Page, card: Locator, handle: string, dx: number, dy: number, cancel = false) {
  await card.scrollIntoViewIfNeeded()
  // Select through the frame border; its entire inner area belongs to the iframe.
  await card.click({position: {x: 20, y: .5}})
  const grip = card.locator(`shape-resizer [data-handle="${handle}"]`)
  await expect(grip).toBeVisible()
  // Keep both pointer endpoints inside the browser window (Firefox's native
  // mouse injection reports unrelated coordinates outside that window).
  await grip.evaluate(el => el.scrollIntoView({block: 'center', inline: 'nearest', behavior: 'instant'}))
  await grip.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  const box = (await grip.boundingBox())!
  const x = box.x + box.width / 2, y = box.y + box.height / 2
  await page.mouse.move(x, y)
  const hit = await page.evaluate(({x, y}) => {
    const target = document.elementFromPoint(x, y)
    return {handle: target?.closest('[data-handle]')?.getAttribute('data-handle'), target: target?.outerHTML.slice(0, 350), x, y}
  }, {x, y})
  expect(hit.handle, JSON.stringify(hit)).toBe(handle)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, {steps: 4})
  if (cancel) await page.keyboard.press('Escape')
  await page.mouse.up()
}
async function frameBox(card: Locator) {
  return card.evaluate(el => {
    const style = getComputedStyle(el)
    return {width: parseFloat(style.width), height: parseFloat(style.height)}
  })
}
async function frameProps(page: Page, id: string) {
  return page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    return doc.model.getProps(id)
  }, id)
}

async function expectFrameFitsBorder(card: Locator) {
  const insets = await card.evaluate(element => {
    const cardBox = element.getBoundingClientRect()
    const frameBox = element.querySelector('iframe')!.getBoundingClientRect()
    const style = getComputedStyle(element)
    return [
      frameBox.left - cardBox.left - parseFloat(style.borderLeftWidth),
      frameBox.top - cardBox.top - parseFloat(style.borderTopWidth),
      cardBox.right - frameBox.right - parseFloat(style.borderRightWidth),
      cardBox.bottom - frameBox.bottom - parseFloat(style.borderBottomWidth),
    ]
  })
  for (const inset of insets) expect(Math.abs(inset), JSON.stringify(insets)).toBeLessThanOrEqual(.5)
}

async function clickFrameControl(page: Page, control: Locator) {
  await control.scrollIntoViewIfNeeded()
  // Allow both the iframe and its scrolling parent to paint the new hit region.
  for (const surface of [control, page]) {
    await surface.evaluate(() => new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  }
  await control.click()
}

const htmlFile = `<meta charset="utf-8"><style>body{background:rgb(231,245,255);color:rgb(12,34,56)}</style>
<p id="isolation"></p><button onclick="this.dataset.clicks=String(+(this.dataset.clicks||0)+1);this.textContent='运行成功'">运行脚本</button>
<script>try{parent.document.body.dataset.embedEscape='yes';document.querySelector('#isolation').textContent='未隔离'}catch(e){document.querySelector('#isolation').textContent='已隔离'}</script>`

async function switchLinkView(page: Page, id: string, current: 'inline' | 'card' | 'embed', target: 'inline' | 'card' | 'embed') {
  const block = page.locator(`[data-block-id="${id}"]`)
  await block.scrollIntoViewIfNeeded()
  if (current === 'inline') await block.locator('c-element[link] c-text').first().click()
  else if (current === 'embed') await block.locator('embed-frame-card').click({position: {x: 20, y: .5}})
  else await block.locator('.bookmark-description').click()
  const labels = {inline: '链接视图', card: '卡片视图', embed: '嵌入视图'}
  const toolbar = page.locator(current === 'inline' ? 'inline-link-toolbar' : '.iframe-toolbar')
  await toolbar.locator('bc-float-toolbar-item').filter({hasText: labels[current]}).click()
  const menu = page.locator('bc-float-toolbar[direction="column"]')
  await expect(menu.locator('bc-float-toolbar-item').filter({hasText: labels[target]})).toBeVisible()
  await menu.locator('bc-float-toolbar-item').filter({hasText: labels[target]}).click()
  await expect(block).toHaveCount(0)
  const selected = await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    return doc.selection.value?.firstBlock?.id
  })
  expect(selected).toBeTruthy()
  const replacement = page.locator(`[data-block-id="${selected}"]`)
  await expect(replacement).toHaveClass(new RegExp(target === 'inline' ? 'paragraph-block' : target === 'card' ? 'bookmark-block' : 'embed-block'))
  return selected as string
}

test('all six link, card and embed view conversions preserve the URL and support undo', async ({page}) => {
  await page.route('**/view-conversion.html', route => route.fulfill({contentType: 'text/html', body: '<h1>View conversion</h1>'}))
  await initialize(page)
  const initial = await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const url = 'http://127.0.0.1:8081/view-conversion.html'
    const snapshot = doc.schemas.createSnapshot('paragraph', [[{insert: '报告链接', attributes: {'a:link': url}}]])
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot])
    return {id: snapshot.id, count: doc.root.childrenIds.length, url}
  })
  let id = initial.id
  let current: 'inline' | 'card' | 'embed' = 'inline'
  for (const target of ['embed', 'card', 'inline', 'card', 'embed', 'inline'] as const) {
    const previousId = id
    id = await switchLinkView(page, id, current, target)
    const state = await page.evaluate(id => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      const block = doc.getBlockById(id)
      return {count: doc.root.childrenIds.length, url: block.flavour === 'paragraph' ? block.textDeltas()[0].attributes['a:link'] : block.props.url}
    }, id)
    expect(state).toEqual({count: initial.count, url: initial.url})
    await docAction(page, 'undo')
    await expect(page.locator(`[data-block-id="${previousId}"]`)).toBeVisible()
    await expect.poll(() => page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.selection.value?.firstBlock?.id)).toBe(previousId)
    await docAction(page, 'redo')
    await expect(page.locator(`[data-block-id="${id}"]`)).toBeVisible()
    await expect.poll(() => page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.selection.value?.firstBlock?.id)).toBe(id)
    current = target
  }
})

test('inline conversions retain surrounding formatted content and reject readonly or restricted parents', async ({page}) => {
  await initialize(page)
  const initial = await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const snapshot = doc.schemas.createSnapshot('paragraph', [[
      {insert: '前文', attributes: {bold: true}},
      {insert: '报告', attributes: {'a:link': 'https://example.com/report.html'}},
      {insert: '后文', attributes: {italic: true}},
    ], {heading: 2}])
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot])
    return {id: snapshot.id, count: doc.root.childrenIds.length}
  })
  const original = page.locator(`[data-block-id="${initial.id}"]`)
  // 比较真实文字节点，跳过 WebKit 聚焦时使用的不可见光标锚点。
  const originalText = () => original.locator('c-element:not([data-cursor-blot]) c-text').allTextContents().then(parts => parts.join(''))
  await original.locator('c-element[link] c-text').click()
  await page.locator('inline-link-toolbar').getByText('链接视图', {exact: true}).click()
  await page.locator('bc-float-toolbar[direction="column"]').getByText('嵌入视图', {exact: true}).click()
  const state = await page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    return doc.root.childrenIds.slice(0, 3).map((id: string) => {
      const block = doc.getBlockById(id)
      return {flavour: block.flavour, text: block.textDeltas?.(), heading: block.props.heading, url: block.props.url}
    })
  }, initial.id)
  expect(state[0]).toMatchObject({flavour: 'paragraph', text: [{insert: '前文', attributes: {bold: true}}], heading: 2})
  expect(state[1]).toMatchObject({flavour: 'embed', url: 'https://example.com/report.html'})
  expect(state[2]).toMatchObject({flavour: 'paragraph', text: [{insert: '后文', attributes: {italic: true}}], heading: 2})
  await docAction(page, 'undo')
  await expect.poll(originalText).toBe('前文报告后文')
  await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.schemas.get('root').metadata.instanceMeta = {childConstraints: true}
    doc.root.updateMeta({excl: ['embed']})
  })
  await original.locator('c-element[link] c-text').click()
  await page.locator('inline-link-toolbar').getByText('链接视图', {exact: true}).click()
  await page.locator('bc-float-toolbar[direction="column"]').getByText('嵌入视图', {exact: true}).click()
  await expect.poll(originalText).toBe('前文报告后文')
  expect(await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    return doc.root.childrenIds.length
  })).toBe(initial.count)
  await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.toggleReadonly(true))
  await original.locator('c-element[link] c-text').click()
  await expect(page.locator('inline-link-toolbar').getByText('链接视图', {exact: true})).toHaveCount(0)
  await expect.poll(originalText).toBe('前文报告后文')
})

test('link popup insertion, HTML file embedding, editing, dimensions, undo and readonly', async ({page}) => {
  await page.route('**/embed-fixture.html', route => route.fulfill({contentType: 'text/html; charset=utf-8', body: htmlFile}))
  await page.route('**/embed-updated.html', route => route.fulfill({contentType: 'text/html; charset=utf-8', body: '<meta charset="utf-8"><h1>修改后的内容</h1>'}))
  await initialize(page)
  await page.evaluate(async () => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const snapshot = doc.schemas.createSnapshot('paragraph', [[]])
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot])
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    doc.selection.setCursorAt(doc.getBlockById(snapshot.id), 0)
  })
  await page.keyboard.type('/')
  const menu = page.locator('block-transformer-contextmenu')
  await expect(menu).toBeVisible()
  await page.keyboard.type('embed')
  await expect(menu.getByRole('option', {name: /嵌入网页、平台内容/})).toHaveCount(1)
  await expect(menu.getByRole('option', {name: /^Figma|^掘金/})).toHaveCount(0)
  await menu.getByRole('option', {name: /嵌入网页、平台内容/}).click()
  const creator = page.locator('embed-frame-creator')
  await expect(page.getByRole('dialog', {name: '嵌入', exact: true})).toBeVisible()
  await expect(creator.locator('input[cs-input]')).toHaveCount(1)
  await expect(creator.locator('button[cs-button]')).toHaveCount(1)
  await expect(creator.locator('textarea')).toHaveCount(0)
  await creator.getByLabel('网页链接').fill('<h1>代码不应被接受</h1>')
  await expect(creator.getByRole('button', {name: '确定', exact: true})).toBeDisabled()
  await creator.getByLabel('网页链接').press('Enter')
  await expect(creator).toBeVisible()
  const originalUrl = 'http://127.0.0.1:8081/embed-fixture.html'
  await creator.getByLabel('网页链接').fill(originalUrl)
  await creator.getByRole('button', {name: '确定', exact: true}).click()
  const block = page.locator('.embed-block.embed-frame-block').first()
  await expect(block).toBeVisible()
  await block.scrollIntoViewIfNeeded()
  const id = await block.getAttribute('data-block-id')
  const iframe = block.locator('iframe')
  await expect(iframe).toHaveAttribute('src', originalUrl)
  expect(await iframe.getAttribute('sandbox')).not.toContain('allow-same-origin')
  const frame = block.frameLocator('iframe')
  await expect(frame.locator('#isolation')).toHaveText('已隔离')
  await frame.getByRole('button', {name: '运行脚本'}).click()
  await expect(frame.getByRole('button', {name: '运行成功'})).toBeVisible()
  expect(await page.locator('body').getAttribute('data-embed-escape')).toBeNull()
  expect(await frame.locator('body').evaluate(el => getComputedStyle(el).color)).toBe('rgb(12, 34, 56)')
  await expect(block.locator('.iframe-brand, .iframe-link, a')).toHaveCount(0)

  await block.locator('embed-frame-card').click({position: {x: 20, y: .5}})
  const toolbar = page.locator('.iframe-toolbar').filter({has: page.locator('[name="edit"]')})
  await expect(toolbar).toBeVisible()
  const open = toolbar.locator('[name="open"]')
  await expect(open).toHaveAttribute('aria-label', '外部打开')
  await expect(open).toHaveText('')
  await open.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  await page.mouse.move(0, 0)
  await open.hover()
  await expect(page.locator('cs-tooltip-overlay.cs-tooltip-visible').filter({hasText: '外部打开'})).toBeVisible()
  await expect(toolbar).not.toContainText('127.0.0.1')
  const [opened] = await Promise.all([page.context().waitForEvent('page'), open.click()])
  await opened.waitForURL(originalUrl)
  expect(await opened.evaluate(() => window.opener === null)).toBe(true)
  await opened.close()
  const frameSize = await block.evaluate(el => ({
    card: el.querySelector('embed-frame-card')!.getBoundingClientRect().height,
    iframe: el.querySelector('iframe')!.getBoundingClientRect().height,
  }))
  expect(frameSize.card - frameSize.iframe).toBeLessThan(24)
  const card = block.locator('embed-frame-card')
  const initialSize = await frameBox(card)
  await expect(toolbar.locator('[name="size"]')).toHaveCount(0)
  await expect(card.locator('shape-resizer [data-handle]')).toHaveCount(8)
  // Native mouse coordinates are quantized in Firefox. Fractional commits are
  // covered separately by the eight-handle test; use an exact delta here.
  await dragHandle(page, card, 'south', 0, 137)
  const resized = await frameBox(card)
  expect(resized.height).toBeCloseTo(Math.round(initialSize.height + 137), 1)
  expect(resized.width).toBeCloseTo(Math.round(initialSize.width), 1)
  await expect(frame.getByRole('button', {name: '运行成功'})).toBeVisible()
  await docAction(page, 'undo')
  await expect.poll(async () => (await frameBox(card)).height).toBeCloseTo(initialSize.height, 1)
  await docAction(page, 'redo')
  await expect.poll(async () => (await frameBox(card)).height).toBeCloseTo(resized.height, 1)
  if (test.info().project.name === 'chromium') await page.screenshot({path: '/tmp/blockcraft-embed-resize.png'})

  await block.locator('embed-frame-card').click({position: {x: 20, y: .5}})
  await toolbar.locator('[name="reload"]').click()
  await expect(frame.getByRole('button', {name: '运行脚本'})).toBeVisible()

  await docAction(page, 'stop')
  await block.locator('embed-frame-card').click({position: {x: 20, y: .5}})
  await toolbar.locator('[name="edit"]').click()
  await expect(creator.getByLabel('网页链接')).toHaveValue(originalUrl)
  const updatedUrl = 'http://127.0.0.1:8081/embed-updated.html'
  await creator.getByLabel('网页链接').fill(updatedUrl)
  await creator.getByRole('button', {name: '确定', exact: true}).click()
  await expect(frame.getByRole('heading')).toHaveText('修改后的内容')
  await docAction(page, 'undo')
  await expect(frame.locator('#isolation')).toHaveText('已隔离')
  await docAction(page, 'redo')
  await expect(frame.getByRole('heading')).toHaveText('修改后的内容')
  const saved = await page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const snapshot = JSON.parse(JSON.stringify(doc.exportDocumentSnapshot()))
    const block = snapshot.root.children.find((block: any) => block.id === id)
    return block.props
  }, id)
  expect(saved.url).toBe(updatedUrl)
  expect(saved.wr).toBeGreaterThan(0)
  expect(saved.ar).toBeGreaterThan(0)
  expect(saved.width).toBeUndefined()
  expect(saved.height).toBeUndefined()
  expect(saved.html).toBeUndefined()
  expect(saved.mode).toBeUndefined()
  await page.evaluate(() => {
    (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.toggleReadonly(true)
  })
  await block.locator('embed-frame-card').click({position: {x: 20, y: .5}})
  await expect(page.locator('.iframe-toolbar [name="edit"]')).toHaveCount(0)
  await expect(block.locator('shape-resizer')).toHaveCount(0)
  await expect(page.locator('.iframe-toolbar [name="open"]')).toBeVisible()
  const [readonlyOpened] = await Promise.all([
    page.context().waitForEvent('page'), page.locator('.iframe-toolbar [name="open"]').click(),
  ])
  await readonlyOpened.waitForURL(updatedUrl)
  expect(await readonlyOpened.evaluate(() => window.opener === null)).toBe(true)
  await readonlyOpened.close()
})

test('canceling webpage insertion from the slash menu restores the original caret', async ({page}) => {
  await initialize(page)
  const id = await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const paragraphs = Array.from({length: 40}, (_, index) => doc.schemas.createSnapshot('paragraph', [[{insert: `阅读位置 ${index}`}]]))
    const paragraph = doc.schemas.createSnapshot('paragraph', [[]])
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [...paragraphs, paragraph])
    doc.selection.setCursorAtBlock(paragraph.id, false)
    return paragraph.id
  })
  const paragraph = page.locator(`[data-block-id="${id}"]`)
  await paragraph.scrollIntoViewIfNeeded()
  await page.keyboard.type('/')
  const menu = page.locator('block-transformer-contextmenu')
  await expect(menu).toBeVisible()
  await page.keyboard.type('embed')
  await menu.getByRole('option', {name: /嵌入网页、平台内容/}).click()
  const input = page.getByRole('dialog', {name: '嵌入', exact: true}).getByLabel('网页链接')
  await expect(input).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(input).toHaveCount(0)
  await expect.poll(() => page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    return doc.selection.value?.firstBlock?.id
  }, id)).toBe(id)
  await page.keyboard.type('继续')
  await expect(paragraph.locator('c-element:not([data-cursor-blot]) c-text')).toHaveText('/embed继续')
  await expect.poll(() => page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    return doc.model.getText(id)
  }, id)).toBe('/embed继续')
})

test('editing a distant embed preserves document scroll on confirmation and cancellation', async ({page}) => {
  await page.route('**/embed-scroll-*.html', route => route.fulfill({contentType: 'text/html', body: '<h1>Scroll fixture</h1>'}))
  await initialize(page)
  const id = await page.evaluate(async () => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const paragraphs = Array.from({length: 80}, (_, index) => doc.schemas.createSnapshot('paragraph', [[{insert: `阅读位置 ${index}`}]]))
    const frame = doc.schemas.createSnapshot('embed', ['http://127.0.0.1:8081/embed-scroll-original.html'])
    frame.props = {...frame.props, wr: 60, ar: 1.5}
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [...paragraphs, frame])
    await doc.navigateToBlock(frame.id)
    return frame.id
  })
  const card = page.locator(`[data-block-id="${id}"] embed-frame-card`)
  const dialog = page.getByRole('dialog', {name: '嵌入', exact: true})
  const scrollPosition = () => page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    return {document: doc.scrollContainer.scrollTop, window: window.scrollY}
  })
  for (const action of ['confirm', 'enter', 'cancel', 'escape', 'backdrop'] as const) {
    await card.scrollIntoViewIfNeeded()
    await card.click({position: {x: 20, y: .5}})
    const edit = page.locator('.iframe-toolbar [name="edit"]')
    await expect(edit).toBeVisible()
    await card.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    const before = await scrollPosition()
    expect(before.document + before.window).toBeGreaterThan(1000)
    await edit.click()
    await expect(dialog).toBeVisible()
    const input = dialog.getByLabel('网页链接')
    await expect(input).toBeFocused()
    await input.fill(`http://127.0.0.1:8081/embed-scroll-${action}.html`)
    await expect(input).toBeFocused()
    await input.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    const during = (await card.boundingBox())!
    if (action === 'confirm') await dialog.getByRole('button', {name: '确定', exact: true}).click()
    else if (action === 'enter') await dialog.getByLabel('网页链接').press('Enter')
    else if (action === 'cancel') await dialog.getByRole('button', {name: '关闭', exact: true}).click()
    else if (action === 'escape') await dialog.getByLabel('网页链接').press('Escape')
    else await page.locator('.cs-modal-backdrop').click({position: {x: 4, y: 4}})
    await expect(dialog).toHaveCount(0)
    // Virtualized height measurements can adjust scrollTop through native
    // scroll anchoring. The visible reading position must remain unchanged.
    await card.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    const after = (await card.boundingBox())!, position = await scrollPosition()
    expect(position.document + position.window).toBeGreaterThan(1000)
    expect(position.window).toBe(before.window)
    // Allow a small native scroll-anchor adjustment while staying on this card.
    expect(Math.abs(after.y - during.y)).toBeLessThanOrEqual(2)
    expect(after.x).toBeCloseTo(during.x, 0)
    expect((await frameProps(page, id)).url).toBe(`http://127.0.0.1:8081/embed-scroll-${action === 'confirm' ? 'confirm' : 'enter'}.html`)
  }
})

test('cses-ui modal focus, dismissal and block lifetime', async ({page}) => {
  await page.route('**/embed-modal-fixture.html', route => route.fulfill({contentType: 'text/html', body: '<h1>Modal fixture</h1>'}))
  await initialize(page)
  const id = await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const snapshot = doc.schemas.createSnapshot('embed', ['http://127.0.0.1:8081/embed-modal-fixture.html'])
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot])
    return snapshot.id
  })
  const block = page.locator(`[data-block-id="${id}"]`)
  const dialog = page.getByRole('dialog', {name: '嵌入', exact: true})
  const open = async () => {
    await block.locator('embed-frame-card').click({position: {x: 20, y: .5}})
    await page.locator('.iframe-toolbar [name="edit"]').click()
    await expect(dialog).toBeVisible()
  }
  await open()
  await expect(dialog.getByLabel('网页链接')).toBeFocused()
  for (let index = 0; index < 4; index++) {
    await page.keyboard.press('Tab')
    await expect.poll(() => dialog.evaluate(el => el.contains(document.activeElement))).toBe(true)
  }
  await dialog.getByLabel('网页链接').fill('https://example.com/not-saved.html')
  if (test.info().project.name === 'chromium') await page.screenshot({path: '/tmp/blockcraft-cses-embed-dialog.png'})
  // 同一轮键盘事件也不能在取消后的关闭动画期间写入。
  await dialog.getByLabel('网页链接').evaluate(input => {
    input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
    input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
  })
  await expect(dialog).toHaveCount(0)
  await open()
  await expect(dialog.getByLabel('网页链接')).toHaveValue('http://127.0.0.1:8081/embed-modal-fixture.html')
  await page.locator('.cs-modal-backdrop').click({position: {x: 4, y: 4}})
  await expect(dialog).toHaveCount(0)
  await open()
  await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.toggleReadonly(true))
  await expect(dialog).toHaveCount(0)
  await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.toggleReadonly(false))
  await open()
  await page.evaluate(id => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.crud.deleteBlockById(id), id)
  await expect(dialog).toHaveCount(0)
  await expect(block).toHaveCount(0)
})

test('unified and legacy embeds fit narrow columns', async ({page}) => {
  await initialize(page)
  const ids = await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const columns = doc.schemas.createSnapshot('columns', [3])
    const sources = [
      ['embed', 'https://example.com/report.html'],
      ['figma-embed', 'https://www.figma.com/design/abcdefghijklmnopqrstuvwx/Test'],
      ['juejin-embed', 'https://juejin.cn/post/7312345678901234567'],
    ]
    const blocks = sources.map(([flavour, url]) => doc.schemas.createSnapshot(flavour, [url]))
    columns.children.forEach((column: any, i: number) => { column.children = [blocks[i]] })
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [columns])
    return blocks.map((block: any) => block.id)
  })
  for (const id of ids) {
    const block = page.locator(`[data-block-id="${id}"]`)
    await block.scrollIntoViewIfNeeded()
    const sizes = await block.evaluate(el => ({
      card: el.querySelector('embed-frame-card')!.getBoundingClientRect().width,
      column: el.closest('.column-block')!.getBoundingClientRect().width,
    }))
    expect(sizes.card).toBeGreaterThan(0)
    expect(sizes.card).toBeLessThanOrEqual(sizes.column + 1)
    await expectFrameFitsBorder(block.locator('embed-frame-card'))
  }
})

test('legacy Figma and Juejin source editing preserves validation, dimensions, undo and reading position', async ({page}) => {
  await initialize(page)
  const cases = [
    {flavour: 'figma-embed', title: 'Figma', initial: 'https://www.figma.com/design/abcdefghijklmnopqrstuvwx/Original', updated: 'https://www.figma.com/design/zyxwvutsrqponmlkjihgfedc/Updated'},
    {flavour: 'juejin-embed', title: '掘金', initial: 'https://juejin.cn/post/7312345678901234567', updated: 'https://juejin.cn/post/7312345678901234568'},
  ]
  const ids = await page.evaluate(cases => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const paragraphs = Array.from({length: 80}, (_, index) => doc.schemas.createSnapshot('paragraph', [[{insert: `阅读位置 ${index}`}]]))
    const frames = cases.map(({flavour, initial}) => {
      const frame = doc.schemas.createSnapshot(flavour, [initial])
      // Exercise both stored pixel dimensions and the new ratio dimensions.
      frame.props = {...frame.props, ...(flavour === 'figma-embed' ? {width: 420, height: 280} : {wr: 60, ar: 1.5})}
      return frame
    })
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [...paragraphs, ...frames])
    return frames.map((frame: any) => frame.id)
  }, cases)
  for (let index = 0; index < cases.length; index++) {
    const {flavour, title, initial, updated} = cases[index], id = ids[index]
    await page.evaluate(id => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.navigateToBlock(id), id)
    const block = page.locator(`[data-block-id="${id}"]`), card = block.locator('embed-frame-card'), iframe = block.locator('iframe')
    const dialog = page.getByRole('dialog', {name: title, exact: true})
    const iframeUrl = (url: string) => flavour === 'figma-embed' ? `https://www.figma.com/embed?embed_host=share&url=${url}` : url
    await card.scrollIntoViewIfNeeded()
    await expect(iframe).toHaveAttribute('src', iframeUrl(initial))
    const original = await frameProps(page, id), originalSize = await frameBox(card)
    const open = async () => {
      await card.click({position: {x: 20, y: .5}})
      await page.locator('.iframe-toolbar [name="edit"]').click()
      await expect(dialog).toBeVisible()
      await expect(dialog.getByLabel('网页链接')).toBeFocused()
    }
    await docAction(page, 'stop')
    await open()
    const input = dialog.getByLabel('网页链接'), confirm = dialog.getByRole('button', {name: '确定', exact: true})
    await expect(input).toHaveValue(initial)
    await input.fill('https://example.com/report.html')
    await expect(confirm).toBeDisabled()
    await input.press('Enter')
    await expect(dialog).toBeVisible()
    expect(await frameProps(page, id)).toEqual(original)
    await input.fill(updated)
    await expect(confirm).toBeEnabled()
    await input.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    const during = (await card.boundingBox())!
    await confirm.click()
    await expect(dialog).toHaveCount(0)
    await expect(iframe).toHaveAttribute('src', iframeUrl(updated))
    expect(await frameProps(page, id)).toEqual({...original, url: updated})
    expect(await frameBox(card)).toEqual(originalSize)
    const after = (await card.boundingBox())!
    expect(Math.abs(after.y - during.y)).toBeLessThanOrEqual(2)
    expect(await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.scrollContainer.scrollTop)).toBeGreaterThan(1000)
    await expect(block).toHaveClass(new RegExp(flavour === 'figma-embed' ? 'figma-embed-block' : 'juejin-embed-block'))
    await docAction(page, 'undo')
    await expect(iframe).toHaveAttribute('src', iframeUrl(initial))
    expect(await frameProps(page, id)).toEqual(original)
    await docAction(page, 'redo')
    await expect(iframe).toHaveAttribute('src', iframeUrl(updated))
    await open()
    await expect(input).toHaveValue(updated)
    await input.fill(initial)
    await input.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(iframe).toHaveAttribute('src', iframeUrl(updated))
    await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.toggleReadonly(true))
    await card.click({position: {x: 20, y: .5}})
    await expect(page.locator('.iframe-toolbar [name="open"]')).toBeVisible()
    await expect(page.locator('.iframe-toolbar [name="edit"]')).toHaveCount(0)
    await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.toggleReadonly(false))
  }
})

test('provider conversion, direct embed URLs and legacy snapshots', async ({page}) => {
  await initialize(page)
  const ids = await page.evaluate(async () => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const sources = [
      ['embed', 'https://www.figma.com/design/abc/Test?node-id=1-2'],
      ['embed', 'https://www.bilibili.com/video/BV1B7411m7LV?p=2'],
      ['embed', 'https://youtu.be/M7lc1UVf-VE?t=90'],
      ['figma-embed', 'https://www.figma.com/design/abcdefghijklmnopqrstuvwx/Test'],
      ['juejin-embed', 'https://juejin.cn/post/7312345678901234567'],
    ]
    const snapshots = sources.map(([flavour, url]) => doc.schemas.createSnapshot(flavour, [url]))
    doc.crud.insertBlockSnapshots(doc.rootId, 0, snapshots)
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    return snapshots.map((s: any) => s.id)
  })
  const expected = [
    'https://embed.figma.com/design/abc/Test?node-id=1-2&embed-host=blockcraft',
    'https://player.bilibili.com/player.html?bvid=BV1B7411m7LV&page=2&autoplay=0',
    'https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?start=90',
  ]
  for (let i = 0; i < 3; i++) {
    await page.evaluate(id => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.navigateToBlock(id), ids[i])
    const block = page.locator(`[data-block-id="${ids[i]}"]`)
    await block.scrollIntoViewIfNeeded()
    await expect(block.locator('iframe')).toHaveAttribute('src', expected[i])
    await expect(block.locator('.iframe-brand, .iframe-link, a')).toHaveCount(0)
  }
  for (let i = 3; i < 5; i++) {
    await page.evaluate(id => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.navigateToBlock(id), ids[i])
    const block = page.locator(`[data-block-id="${ids[i]}"]`)
    await block.scrollIntoViewIfNeeded()
    await expect(block.locator('iframe')).toHaveAttribute('src', /https:/)
    await expect(block.locator('.iframe-brand, .iframe-link, a')).toHaveCount(0)
    await block.locator('embed-frame-card').click({position: {x: 20, y: .5}})
    await expect(page.locator('.iframe-toolbar [name="open"]')).toBeVisible()
  }
  await page.evaluate(async id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const block = doc.getBlockById(id)
    doc.chain().selectOrSetCursorAtBlock(id, false).run()
  }, ids[0])
  const block = page.locator(`[data-block-id="${ids[0]}"]`)
  await block.scrollIntoViewIfNeeded()
  await block.locator('embed-frame-card').click({position: {x: 20, y: .5}})
  await page.locator('.iframe-toolbar [name="edit"]').click()
  const creator = page.locator('embed-frame-creator')
  await creator.getByLabel('网页链接').fill('https://player.bilibili.com/player.html?bvid=BV1B7411m7LV')
  await creator.getByRole('button', {name: '确定', exact: true}).click()
  await expect(block.locator('iframe')).toHaveAttribute('src', 'https://player.bilibili.com/player.html?bvid=BV1B7411m7LV')
  expect(await block.locator('iframe').getAttribute('sandbox')).not.toContain('allow-top-navigation')
})


test('eight handles, integer pixel commits, scaling, responsive dimensions and cancelled gestures', async ({page}) => {
  await page.route('**/embed-resize.html', route => route.fulfill({contentType: 'text/html', body: htmlFile}))
  await initialize(page)
  const id = await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const snapshot = doc.schemas.createSnapshot('embed', ['http://127.0.0.1:8081/embed-resize.html'])
    snapshot.props = {...snapshot.props, wr: 60, ar: 1.5}
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot])
    return snapshot.id
  })
  const block = page.locator(`[data-block-id="${id}"]`), card = block.locator('embed-frame-card')
  await expect(card).toBeVisible()
  const original = await frameProps(page, id)
  // Hover keeps the subtle shadow; only selection reveals the resize frame.
  await page.evaluate(id => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.navigateToBlock(id), id)
  await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.selection.blur())
  const border = await card.evaluate(el => getComputedStyle(el).borderColor)
  await card.hover({position: {x: 20, y: .5}})
  await expect(block).not.toHaveClass(/selected/)
  await expect(card.locator('shape-resizer')).toBeHidden()
  await expect.poll(() => card.evaluate(el => getComputedStyle(el).boxShadow)).not.toBe('none')
  expect(await card.evaluate(el => getComputedStyle(el).borderColor)).toBe(border)
  expect(await frameProps(page, id)).toEqual(original)
  if (test.info().project.name === 'chromium') await card.screenshot({path: '/tmp/blockcraft-embed-hover-shadow.png'})
  await card.click({position: {x: 20, y: .5}})
  await expect(block).toHaveClass(/selected/)
  await expect(card.locator('shape-resizer')).toBeVisible()
  await expect(card.locator('[data-handle]')).toHaveCount(8)
  for (const [handle, dx, dy] of [
    ['north-west', -35.6, -24.2], ['north', 0, -27.4], ['north-east', 35.6, -24.2],
    ['east', 35.6, 0], ['south-east', 35.6, 24.2], ['south', 0, 27.4],
    ['south-west', -35.6, 24.2], ['west', -35.6, 0],
  ] as const) {
    const before = await frameBox(card)
    await dragHandle(page, card, handle, dx, dy)
    const after = await frameBox(card), props = await frameProps(page, id)
    expect(after.width).toBeCloseTo(Math.round(after.width), 1)
    expect(after.height).toBeCloseTo(Math.round(after.height), 1)
    expect(after.width).toBeGreaterThanOrEqual(before.width - 1)
    expect(after.height).toBeGreaterThanOrEqual(before.height - 1)
    if (handle.includes('-')) expect(after.width / after.height).toBeCloseTo(before.width / before.height, 2)
    else if (handle === 'east' || handle === 'west') expect(after.height).toBeCloseTo(Math.round(before.height), 1)
    else expect(after.width).toBeCloseTo(Math.round(before.width), 1)
    expect(props.width).toBeUndefined()
    expect(props.height).toBeUndefined()
    await docAction(page, 'undo')
    await expect.poll(() => frameProps(page, id)).toEqual(original)
  }
  await dragHandle(page, card, 'east', 30, 0, true)
  expect(await frameProps(page, id)).toEqual(original)
  // Cancelling a resize must restore the iframe's normal pointer interaction.
  await block.frameLocator('iframe').getByRole('button', {name: '运行脚本'}).click()
  await expect(block.frameLocator('iframe').getByRole('button', {name: '运行成功'})).toBeVisible()
  const before = await frameBox(card)
  await dragHandle(page, card, 'south', 0, 42.4)
  const after = await frameBox(card)
  await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-blockcraft-root="true"]')!
    root.style.width = '600px'
  })
  await expect.poll(async () => (await frameBox(card)).width).toBeLessThan(after.width)
  const narrow = await frameBox(card)
  expect(narrow.width / narrow.height).toBeCloseTo(after.width / after.height, 4)
  const saved = await frameProps(page, id)
  await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-blockcraft-root="true"]')!
    root.style.transformOrigin = 'top left'
    root.style.transform = 'scale(1.5)'
  })
  await dragHandle(page, card, 'south', 0, 60)
  expect((await frameBox(card)).height).toBeCloseTo(Math.round(narrow.height + 40), 1)
  await docAction(page, 'undo')
  expect(await frameProps(page, id)).toEqual(saved)
  expect(before.width).toBeGreaterThan(narrow.width)
  await card.hover({position: {x: 20, y: .5}})
  const gripBox = (await card.locator('[data-handle="south"]').boundingBox())!
  await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(gripBox.x + 20, gripBox.y + 30)
  await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.toggleReadonly(true))
  await expect(card.locator('shape-resizer')).toHaveCount(0)
  await page.mouse.up()
  expect(await frameProps(page, id)).toEqual(saved)
  expect((await frameBox(card)).height).toBeCloseTo(narrow.height, 1)
})

test('legacy pixel frames migrate only after dragging and stay within narrow columns', async ({page}) => {
  await initialize(page)
  const ids = await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const columns = doc.schemas.createSnapshot('columns', [3])
    const blocks = ['embed', 'figma-embed', 'juejin-embed'].map(flavour => {
      const url = flavour === 'figma-embed' ? 'https://www.figma.com/design/abcdefghijklmnopqrstuvwx/Test' : 'https://juejin.cn/post/7312345678901234567'
      const snapshot = doc.schemas.createSnapshot(flavour, [url])
      snapshot.props = {url, width: 640, height: 424}
      return snapshot
    })
    columns.children.forEach((column: any, i: number) => { column.children = [blocks[i]] })
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [columns])
    return blocks.map((block: any) => block.id)
  })
  for (const id of ids) {
    const block = page.locator(`[data-block-id="${id}"]`), card = block.locator('embed-frame-card')
    await card.scrollIntoViewIfNeeded()
    const original = await frameProps(page, id)
    const before = await frameBox(card)
    expect(before.height).toBe(424)
    await dragHandle(page, card, 'south', 0, 0)
    expect(await frameProps(page, id)).toEqual(original)
    await dragHandle(page, card, 'south', 0, 30.4)
    await dragHandle(page, card, 'east', 80, 0)
    const resized = await frameBox(card)
    expect(resized.width).toBeLessThanOrEqual(before.width + 1)
    expect(Math.abs(resized.height - 454)).toBeLessThan(2)
    const ratio = await frameProps(page, id)
    expect(ratio.wr).toBeGreaterThan(0)
    expect(ratio.ar).toBeGreaterThan(0)
    expect(ratio.width).toBeUndefined()
    expect(ratio.height).toBeUndefined()
    await docAction(page, 'undo')
    await expect.poll(() => frameProps(page, id)).toEqual(original)
  }
})


test('virtualized embeds retain the iframe and webpage state outside the viewport', async ({page}) => {
  let requests = 0
  await page.route('**/embed-keep-alive.html', route => {
    requests++
    return route.fulfill({contentType: 'text/html', body: '<h1>网页状态</h1>'})
  })
  await initialize(page)
  const targets = await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const url = 'http://127.0.0.1:8081/embed-keep-alive.html'
    const direct = doc.schemas.createSnapshot('embed', [url])
    const columns = doc.schemas.createSnapshot('columns', [2])
    const nested = doc.schemas.createSnapshot('embed', [url])
    columns.children[0].children = [nested]
    const paragraphs = Array.from({length: 140}, (_, index) =>
      doc.schemas.createSnapshot('paragraph', [[{insert: `虚拟渲染正文 ${index}`}]]))
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [direct, columns, ...paragraphs])
    return {ids: [direct.id, nested.id], near: paragraphs[0].id, far: paragraphs[120].id}
  })
  for (const id of targets.ids) {
    await page.evaluate(id => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.virtualization.scrollToBlock(id), id)
    const block = page.locator(`[data-block-id="${id}"]`)
    await expect(block.locator('iframe')).toBeVisible()
    await block.frameLocator('iframe').locator('h1').evaluate((element, id) => element.textContent = `保留状态 ${id}`, id)
  }
  await page.evaluate(({ids}) => {
    ;(window as any).retainedEmbedFrames = ids.map(id => document.querySelector(`[data-block-id="${id}"] iframe`))
  }, targets)
  const loadedRequests = requests
  await page.evaluate(async ({far}) => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.selection.blur()
    await doc.virtualization.scrollToBlock(far)
  }, targets)
  await expect.poll(() => page.evaluate(({near, far, ids}) => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    return {
      enabled: doc.virtualization.enabled, sparse: doc.vm.usesSparseRoot,
      nearMounted: doc.vm.isMounted(near), farMounted: doc.vm.isMounted(far),
      connected: ids.map((id, index) => {
        const iframe = document.querySelector(`[data-block-id="${id}"] iframe`)
        return !!iframe?.isConnected && iframe === (window as any).retainedEmbedFrames[index]
      }),
    }
  }, targets)).toEqual({enabled: true, sparse: true, nearMounted: false, farMounted: true, connected: [true, true]})
  for (const id of targets.ids) {
    await expect(page.locator(`[data-block-id="${id}"]`).frameLocator('iframe').locator('h1')).toHaveText(`保留状态 ${id}`)
    await page.evaluate(id => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.virtualization.scrollToBlock(id), id)
    await expect(page.locator(`[data-block-id="${id}"]`).frameLocator('iframe').locator('h1')).toHaveText(`保留状态 ${id}`)
  }
  expect(requests).toBe(loadedRequests)
})

test('snapshot viewer uses responsive embed dimensions and fills the frame', async ({page}) => {
  await page.route('**/embed-snapshot.html', route => route.fulfill({contentType: 'text/html', body: '<h1>快照嵌入</h1>'}))
  await initialize(page)
  const id = await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const snapshot = doc.schemas.createSnapshot('embed', ['http://127.0.0.1:8081/embed-snapshot.html'])
    snapshot.props = {...snapshot.props, wr: 65, ar: 1.4}
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot])
    // Capture while the editor is mounted; switching tabs destroys its Doc.
    ;(window as any).ng.getComponent(document.querySelector('playground-home')).syncSnapshotViewerFromEditor()
    return snapshot.id
  })
  await page.getByRole('tab', {name: 'Snapshot Viewer', exact: true}).click()
  const block = page.locator(`.bc-snapshot-viewer [data-block-id="${id}"]`)
  await block.scrollIntoViewIfNeeded()
  const card = block.locator('embed-frame-card')
  await expect(card).toBeVisible()
  await expect(block.locator('shape-resizer, .iframe-brand, .iframe-link, a')).toHaveCount(0)
  await expect(block.locator('iframe')).toHaveAttribute('src', 'http://127.0.0.1:8081/embed-snapshot.html')
  const box = await frameBox(card)
  expect(box.width / box.height).toBeCloseTo(1.4, 3)
  await expectFrameFitsBorder(card)
})

test('embed selection chrome follows the resized card instead of the full row', async ({page}) => {
  await initialize(page)
  const ids = await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const snapshots = ['embed', 'figma-embed', 'juejin-embed'].map(flavour => {
      const url = flavour === 'figma-embed' ? 'https://www.figma.com/design/abcdefghijklmnopqrstuvwx/Test' : 'https://juejin.cn/post/7312345678901234567'
      const snapshot = doc.schemas.createSnapshot(flavour, [url])
      snapshot.props = {...snapshot.props, wr: 65, ar: 2}
      return snapshot
    })
    doc.crud.insertBlockSnapshots(doc.rootId, 0, snapshots)
    return snapshots.map((snapshot: any) => snapshot.id)
  })
  for (const id of ids) {
    await page.evaluate(id => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.navigateToBlock(id), id)
    const block = page.locator(`[data-block-id="${id}"]`), card = block.locator('embed-frame-card')
    await card.scrollIntoViewIfNeeded()
    await card.click({position: {x: 20, y: .5}})
    await expect(block).toHaveClass(/selected/)
    const chrome = await block.evaluate(el => {
      const card = el.querySelector('embed-frame-card')!, resizer = card.querySelector('.shape-resizer__frame')!
      return {hostShadow: getComputedStyle(el).boxShadow, hostBackground: getComputedStyle(el).backgroundColor,
        cardShadow: getComputedStyle(card).boxShadow, cardWidth: card.getBoundingClientRect().width,
        rowWidth: el.getBoundingClientRect().width, resizerWidth: resizer.getBoundingClientRect().width}
    })
    expect(chrome.hostShadow).toBe('none')
    expect(chrome.hostBackground).toBe('rgba(0, 0, 0, 0)')
    expect(chrome.cardShadow).not.toBe('none')
    expect(chrome.cardWidth).toBeLessThan(chrome.rowWidth * .7)
    expect(chrome.resizerWidth).toBeCloseTo(chrome.cardWidth - 2, 0)
    await dragHandle(page, card, 'east', 35, 0)
    const widths = await card.evaluate(el => ({card: el.getBoundingClientRect().width,
      resizer: el.querySelector('.shape-resizer__frame')!.getBoundingClientRect().width}))
    expect(widths.resizer).toBeCloseTo(widths.card - 2, 0)
    if (id === ids[0] && test.info().project.name === 'chromium') await page.screenshot({path: '/tmp/blockcraft-embed-frame-aligned.png'})
  }
})

test('paginated embeds cap the viewport and resizing to page height without losing grips or iframe state', async ({page}) => {
  await page.route('**/embed-paginated.html', route => route.fulfill({contentType: 'text/html', body: htmlFile}))
  await initialize(page)
  const ids = await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const snapshots = ['embed', 'figma-embed', 'juejin-embed'].map(flavour => {
      const url = flavour === 'embed' ? 'http://127.0.0.1:8081/embed-paginated.html'
        : flavour === 'figma-embed' ? 'https://www.figma.com/design/abcdefghijklmnopqrstuvwx/Test' : 'https://juejin.cn/post/7312345678901234567'
      const snapshot = doc.schemas.createSnapshot(flavour, [url])
      snapshot.props = flavour === 'embed' ? {...snapshot.props, wr: 65, ar: .25} : {url, width: 640, height: 2000}
      return snapshot
    })
    doc.crud.insertBlockSnapshots(doc.rootId, 0, snapshots)
    return snapshots.map((snapshot: any) => snapshot.id)
  })
  const originals = await Promise.all(ids.map((id: string) => frameProps(page, id)))
  await page.getByRole('button', {name: '分页布局', exact: true}).click()
  await page.locator('bc-pagination-settings').getByRole('button', {name: '▴', exact: true}).click()
  const capacity = await page.locator('[data-blockcraft-root="true"]').evaluate(el =>
    parseFloat(getComputedStyle(el).getPropertyValue('--bc-page-content-height')))
  expect(capacity).toBeGreaterThan(300)
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    await page.evaluate(id => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.navigateToBlock(id), id)
    const block = page.locator(`[data-block-id="${id}"]`), card = block.locator('embed-frame-card')
    await card.scrollIntoViewIfNeeded()
    await expect.poll(async () => (await frameBox(card)).height).toBeLessThanOrEqual(capacity + .5)
    expect((await frameBox(card)).height).toBeGreaterThan(capacity - 2)
    await expectFrameFitsBorder(card)
    expect(await frameProps(page, id)).toEqual(originals[i])
    if (i === 0) {
      await card.click({position: {x: 20, y: .5}})
      await expect(block).toHaveClass(/selected/)
      await clickFrameControl(page, block.frameLocator('iframe').getByRole('button', {name: '运行脚本'}))
      await expect(block.frameLocator('iframe').getByRole('button', {name: '运行成功'})).toBeVisible()
    }
    await dragHandle(page, card, 'south', 0, 0)
    expect(await frameProps(page, id)).toEqual(originals[i])
    await dragHandle(page, card, 'south', 0, -80)
    const smaller = await frameBox(card)
    expect(smaller.height).toBeLessThan(capacity - 60)
    await expectFrameFitsBorder(card)
    await dragHandle(page, card, 'south', 0, 200)
    expect((await frameBox(card)).height).toBeLessThanOrEqual(capacity)
    const props = await frameProps(page, id)
    const modelHeight = await page.evaluate(({id, props}) => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      return doc.objectSizing.getReferenceWidth(id) * props.wr / 100 / props.ar
    }, {id, props})
    expect(modelHeight).toBeLessThanOrEqual(capacity + .05)
    // A corner must retain the currently visible aspect ratio at the height cap.
    const beforeCorner = await frameBox(card), beforeCornerProps = await frameProps(page, id)
    await dragHandle(page, card, 'south-east', 80, 200)
    const corner = await frameBox(card)
    expect(corner.height).toBeLessThanOrEqual(capacity)
    expect(corner.width / corner.height).toBeCloseTo(beforeCorner.width / beforeCorner.height, 2)
    await expect(card.locator('[data-handle="south"]')).toBeVisible()
    expect(await block.evaluate(el => getComputedStyle(el).overflow)).toBe('visible')
    if (i === 0) {
      const script = block.frameLocator('iframe').getByRole('button', {name: '运行成功'})
      await expect(block).toHaveClass(/selected/)
      await clickFrameControl(page, script)
      await expect(script).toHaveAttribute('data-clicks', '2')
    }
    if (JSON.stringify(await frameProps(page, id)) !== JSON.stringify(beforeCornerProps)) await docAction(page, 'undo')
    await docAction(page, 'undo')
    await docAction(page, 'undo')
    await expect.poll(() => frameProps(page, id)).toEqual(originals[i])
  }
  // Page geometry changes and readonly rendering use the same viewport cap.
  const settings = page.locator('bc-pagination-settings')
  await settings.getByRole('button', {name: /分页设置/}).click()
  await settings.getByRole('button', {name: '横向', exact: true}).click()
  await settings.getByRole('button', {name: '▴', exact: true}).click()
  const pageCapacity = () => page.locator('[data-blockcraft-root="true"]').evaluate(el =>
    parseFloat(getComputedStyle(el).getPropertyValue('--bc-page-content-height')))
  await expect.poll(pageCapacity).toBeLessThan(capacity)
  const landscapeCapacity = await pageCapacity()
  await page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.toggleReadonly(true)
    doc.navigateToBlock(id)
  }, ids[0])
  const readonlyCard = page.locator(`[data-block-id="${ids[0]}"] embed-frame-card`)
  await expect(readonlyCard.locator('shape-resizer')).toHaveCount(0)
  await expect.poll(async () => (await frameBox(readonlyCard)).height).toBeLessThanOrEqual(landscapeCapacity + .5)
  await expectFrameFitsBorder(readonlyCard)
  expect(await frameProps(page, ids[0])).toEqual(originals[0])
  await page.getByRole('button', {name: '连续布局', exact: true}).click()
  await page.evaluate(id => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.navigateToBlock(id), ids[0])
  const first = page.locator(`[data-block-id="${ids[0]}"] embed-frame-card`)
  await expect.poll(async () => (await frameBox(first)).height).toBeGreaterThan(capacity + 100)
  expect(await frameProps(page, ids[0])).toEqual(originals[0])
})
