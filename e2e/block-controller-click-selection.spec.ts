import {expect, test, type Page} from '@playwright/test'

test.use({viewport: {width: 1280, height: 1000}})

const fixtureSelector = '#block-controller-click-fixture'
const paragraphTexts = ['第一段完整正文', '第二段完整正文', '第三段完整正文', '范围外的完整正文', '']

async function setup(page: Page) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng
    ?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  return page.evaluate(({fixtureSelector, paragraphTexts}) => {
    const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const viewport = document.createElement('div')
    viewport.id = fixtureSelector.slice(1)
    viewport.style.cssText = 'position:fixed;left:40px;top:40px;width:1000px;height:850px;overflow:auto;background:white;z-index:10;padding:70px;box-sizing:border-box'
    const mount = document.createElement('div')
    viewport.appendChild(mount)
    document.body.appendChild(viewport)
    const paragraph = (text: string) => source.schemas.createSnapshot('paragraph', [text])
    const paragraphs = paragraphTexts.map(paragraph)
    const callout = source.schemas.createSnapshot('callout', [])
    callout.children = [paragraph('容器内第一段完整正文'), paragraph('容器内第二段完整正文')]
    const columns = source.schemas.createSnapshot('columns', [2])
    columns.children[0].children = [paragraph('左列范围外段落'), paragraph('左列选中完整正文')]
    columns.children[1].children = [paragraph('右列选中完整正文'), paragraph('右列范围外段落')]
    const columnParagraphIds = columns.children.flatMap((column: any) => column.children.map((block: any) => block.id)) as string[]
    const columnIds = columns.children.map((column: any) => column.id) as string[]
    const snapshot = source.schemas.createSnapshot('root', ['block-controller-click', [...paragraphs, callout, columns]])
    const Controller = source.plugins.find((plugin: any) => plugin.name === 'block-controller').constructor
    const doc = new source.constructor({
      ...source.config, yDoc: new source.yDoc.constructor(), docId: snapshot.id,
      plugins: [new Controller()], currentUserId: 'block-controller-click-test',
      scrollContainer: viewport, readonly: false, virtualization: {enabled: false},
    })
    doc.initBySnapshot(snapshot, mount)
    source.destroy()
    doc.crud.undoManager.clearHistory()
    const ids = paragraphs.map((block: any) => block.id) as string[]
    ;(window as any).controllerClickFixture = {doc, ids, calloutId: callout.id, columnParagraphIds}
    return {ids, calloutId: callout.id as string, columnParagraphIds, columnIds}
  }, {fixtureSelector, paragraphTexts})
}

async function hoverBlock(page: Page, id: string, container = false) {
  const block = page.locator(`${fixtureSelector} [data-block-id="${id}"]`)
  await block.hover(container ? {position: {x: 4, y: 4}} : {})
  await expect.poll(() => page.locator(`${fixtureSelector} bc-drag-handle`).evaluate(element =>
    (window as any).ng.getComponent(element)?.activeBlock?.id ?? null,
  )).toBe(id)
  const handle = page.locator(`${fixtureSelector} bc-drag-handle .btn`)
  await expect(handle).toBeVisible()
  return handle
}

async function readSelection(page: Page) {
  return page.evaluate(() => {
    const {doc} = (window as any).controllerClickFixture
    const selection = doc.selection.value
    return {
      anchor: selection?.toJSON().anchor ?? null,
      head: selection?.toJSON().head ?? null,
      text: doc.selection.getSelectedText(),
      nativeText: window.getSelection()?.toString() ?? '',
      focus: doc.root.hostElement.contains(document.activeElement),
      dragging: doc.dragController.state,
      canUndo: doc.crud.undoManager.isCanUndo(),
    }
  })
}

async function readHandleState(page: Page) {
  return page.locator(`${fixtureSelector} bc-drag-handle`).evaluate(element => {
    const component = (window as any).ng.getComponent(element)
    const rect = element.getBoundingClientRect()
    return {id: component.activeBlock?.id, pinned: component.menuPinned, x: rect.x, y: rect.y}
  })
}

const rootMenu = (page: Page) => page.locator('.cdk-overlay-pane[data-float-index="1"] > bc-float-toolbar')

async function readNativeText(page: Page) {
  // Whole-block DOM ranges include the editor's zero-width inline guards.
  return page.evaluate(() => (window.getSelection()?.toString() ?? '').replace(/[\u200b\u200c]/g, '').trim())
}

async function selectPartialParagraphs(page: Page, backward = false) {
  await page.evaluate(backward => {
    const {doc, ids} = (window as any).controllerClickFixture
    const start = {type: 'text', blockId: ids[0], offset: 2}
    const end = {type: 'text', blockId: ids[2], offset: 4}
    doc.selection.replay({anchor: backward ? end : start, head: backward ? start : end, commonParent: doc.rootId})
  }, backward)
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString() ?? '')).toContain(paragraphTexts[1])
}

for (const empty of [false, true]) {
  test(`点击${empty ? '空' : '普通'}段落抓手完整选中该块并保留编辑器焦点`, async ({page}) => {
    const {ids} = await setup(page)
    const index = empty ? 4 : 0
    await (await hoverBlock(page, ids[index])).click()
    await expect.poll(() => readSelection(page)).toMatchObject({
      anchor: {type: 'selected', blockId: ids[index]},
      head: {type: 'selected', blockId: ids[index]},
      text: paragraphTexts[index], focus: true, dragging: 'idle', canUndo: false,
    })
    if (empty) {
      await expect(page.locator(`${fixtureSelector} [data-block-id="${ids[index]}"]`)).toHaveClass(/\bfocused\b/)
    } else {
      await expect.poll(() => readNativeText(page)).toBe(paragraphTexts[index])
    }
  })
}

for (const backward of [false, true]) {
  test(`点击${backward ? '反向' : '正向'}多段文本选区的抓手补齐所有段落`, async ({page}) => {
    const {ids} = await setup(page)
    await selectPartialParagraphs(page, backward)
    await (await hoverBlock(page, ids[0])).click()
    await expect.poll(() => readSelection(page)).toMatchObject({
      anchor: {type: 'selected', blockId: ids[0]},
      head: {type: 'selected', blockId: ids[2]},
      text: paragraphTexts.slice(0, 3).join('\n'), focus: true, dragging: 'idle', canUndo: false,
    })
    const native = (await readSelection(page)).nativeText
    for (const text of paragraphTexts.slice(0, 3)) expect(native).toContain(text)
    expect(native).not.toContain(paragraphTexts[3])
  })
}

test('点击已有选区之外的段落抓手只选中该段落', async ({page}) => {
  const {ids} = await setup(page)
  await selectPartialParagraphs(page)
  await (await hoverBlock(page, ids[3])).click()
  await expect.poll(() => readSelection(page)).toMatchObject({
    anchor: {type: 'selected', blockId: ids[3]}, head: {type: 'selected', blockId: ids[3]},
    text: paragraphTexts[3], focus: true, dragging: 'idle', canUndo: false,
  })
  await expect.poll(() => readNativeText(page)).toBe(paragraphTexts[3])
})

test('跨两列的部分选区点击抓手仅补齐涉及的段落', async ({page}) => {
  const {columnParagraphIds, columnIds} = await setup(page)
  const [, first, last] = columnParagraphIds
  await page.evaluate(({first, last}) => {
    const {doc} = (window as any).controllerClickFixture
    doc.selection.setSelection(
      {type: 'text', blockId: first, offset: 2},
      {type: 'text', blockId: last, offset: 4},
    )
  }, {first, last})
  await expect.poll(() => readNativeText(page)).toContain('选中完整正文')
  await (await hoverBlock(page, first)).click()
  await expect.poll(() => readSelection(page)).toMatchObject({
    anchor: {type: 'text', blockId: first, offset: 0},
    head: {type: 'text', blockId: last, offset: '右列选中完整正文'.length},
    text: '左列选中完整正文\n右列选中完整正文', focus: true, dragging: 'idle', canUndo: false,
  })
  const native = await readNativeText(page)
  expect(native).toContain('左列选中完整正文')
  expect(native).toContain('右列选中完整正文')
  expect(native).not.toContain('左列范围外段落')
  expect(native).not.toContain('右列范围外段落')
  for (const id of columnIds) {
    await expect(page.locator(`${fixtureSelector} [data-block-id="${id}"]`)).not.toHaveClass(/\bselected\b/)
  }
  for (const id of [columnParagraphIds[0], columnParagraphIds[3]]) {
    await expect(page.locator(`${fixtureSelector} [data-block-id="${id}"]`)).not.toHaveClass(/\bfocused\b/)
  }
})

test('点击容器抓手整体选中容器及其中多个段落', async ({page}) => {
  const {calloutId} = await setup(page)
  await (await hoverBlock(page, calloutId, true)).click()
  await expect.poll(() => readSelection(page)).toMatchObject({
    anchor: {type: 'selected', blockId: calloutId}, head: {type: 'selected', blockId: calloutId},
    text: '容器内第一段完整正文\n容器内第二段完整正文', focus: true, dragging: 'idle', canUndo: false,
  })
  const native = (await readSelection(page)).nativeText
  expect(native).toContain('容器内第一段完整正文')
  expect(native).toContain('容器内第二段完整正文')
  expect(native).not.toContain(paragraphTexts[3])
})

test('锁定段落仍可通过抓手选中且不会启动拖动或生成撤销', async ({page}) => {
  const {ids} = await setup(page)
  await page.evaluate(id => {
    const {doc} = (window as any).controllerClickFixture
    doc.setBlockReadonly(doc.getBlockById(id), true)
    doc.crud.undoManager.clearHistory()
  }, ids[0])
  await (await hoverBlock(page, ids[0])).click()
  await expect.poll(() => readSelection(page)).toMatchObject({
    anchor: {type: 'selected', blockId: ids[0]}, head: {type: 'selected', blockId: ids[0]},
    text: paragraphTexts[0], dragging: 'idle', canUndo: false,
  })
  await expect(page.locator(`${fixtureSelector} [data-block-id="${ids[0]}"]`)).toHaveClass(/\b(focused|selected)\b/)
})

test('点击立即显示菜单并固定抓手，悬停其他段落不会切换目标', async ({page}) => {
  const {ids} = await setup(page)
  const handle = await hoverBlock(page, ids[0])
  await page.locator(`${fixtureSelector} bc-drag-handle`).evaluate(element => {
    // 排除悬停延时打开，让断言只验证点击入口。
    ;(window as any).ng.getComponent(element).menuTrigger.delay = 60_000
  })
  await handle.click({trial: true})
  const before = await readHandleState(page)
  await handle.click()
  await expect(rootMenu(page)).toBeVisible()
  await page.locator(`${fixtureSelector} [data-block-id="${ids[3]}"]`).hover()
  // 覆盖原有离开菜单后 20ms 自动关闭的时间窗口。
  await page.waitForTimeout(100)
  expect(await readHandleState(page)).toEqual({...before, pinned: true})
  await expect(rootMenu(page)).toBeVisible()
  await expect.poll(() => readNativeText(page)).toBe(paragraphTexts[0])
})

test('点击多段选区中间的抓手保留原位置与完整选区', async ({page}) => {
  const {ids} = await setup(page)
  await selectPartialParagraphs(page)
  const handle = await hoverBlock(page, ids[1])
  await handle.click({trial: true})
  const before = await readHandleState(page)
  await handle.click()
  await expect.poll(() => readHandleState(page)).toEqual({...before, pinned: true})
  await expect(rootMenu(page)).toBeVisible()
  await expect(rootMenu(page).locator('.base-list')).toHaveCount(0)
  await expect.poll(() => readSelection(page)).toMatchObject({
    anchor: {type: 'selected', blockId: ids[0]}, head: {type: 'selected', blockId: ids[2]},
    text: paragraphTexts.slice(0, 3).join('\n'),
  })
  await page.locator(`${fixtureSelector} [data-block-id="${ids[3]}"]`).hover()
  await expect(rootMenu(page)).toBeVisible()
  expect(await readHandleState(page)).toEqual({...before, pinned: true})
})

test('固定菜单支持子菜单点击，操作不会被当作外部点击', async ({page}) => {
  const {ids} = await setup(page)
  await (await hoverBlock(page, ids[0])).click()
  await rootMenu(page).getByText('对齐方式', {exact: true}).hover()
  await page.locator('.cdk-overlay-pane').getByText('居中', {exact: true}).click()
  await expect.poll(() => page.evaluate(() => {
    const {doc, ids} = (window as any).controllerClickFixture
    return ids.slice(0, 4).map((id: string) => doc.model.getProps(id)?.textAlign ?? 'left')
  })).toEqual(['center', 'left', 'left', 'left'])
  await expect(rootMenu(page)).toBeVisible()
  await expect.poll(() => readHandleState(page)).toMatchObject({id: ids[0], pinned: true})
})

for (const nested of [false, true]) {
  test(`${nested ? '嵌套容器' : '编辑区'}滚动时固定菜单和子菜单跟随抓手`, async ({page}) => {
    const {ids} = await setup(page)
    await page.locator(fixtureSelector).evaluate((viewport, nested) => {
      const mount = viewport.firstElementChild as HTMLElement
      mount.style.paddingTop = '160px'
      mount.style.paddingBottom = '1000px'
      let scroller = viewport
      if (nested) {
        scroller = document.createElement('div')
        ;(scroller as HTMLElement).style.cssText = 'height:600px;overflow:auto'
        viewport.appendChild(scroller)
        scroller.appendChild(mount)
      }
      scroller.setAttribute('data-controller-test-scroller', '')
    }, nested)
    await (await hoverBlock(page, ids[0])).click()
    await rootMenu(page).getByText('对齐方式', {exact: true}).hover()
    const submenu = page.locator('.cdk-overlay-pane[data-float-index="3"] > bc-float-toolbar')
    await submenu.hover()
    const handleBefore = await readHandleState(page)
    const menuBefore = (await rootMenu(page).boundingBox())!
    const submenuBefore = (await submenu.boundingBox())!
    await page.locator('[data-controller-test-scroller]').evaluate(element => { element.scrollTop += 40 })
    await expect.poll(async () => (await readHandleState(page)).y).toBeCloseTo(handleBefore.y - 40, 0)
    await expect.poll(async () => (await rootMenu(page).boundingBox())?.y).toBeCloseTo(menuBefore.y - 40, 0)
    await expect.poll(async () => (await submenu.boundingBox())?.y).toBeCloseTo(submenuBefore.y - 40, 0)
    await expect.poll(() => readHandleState(page)).toMatchObject({id: ids[0], pinned: true})
  })
}

for (const dismissal of ['Escape', '外部点击'] as const) {
  test(`${dismissal}关闭固定菜单并恢复抓手跟随`, async ({page}) => {
    const {ids} = await setup(page)
    await (await hoverBlock(page, ids[0])).click()
    await expect(rootMenu(page)).toBeVisible()
    if (dismissal === 'Escape') await page.keyboard.press('Escape')
    else await page.locator(`${fixtureSelector} [data-block-id="${ids[3]}"]`).click()
    await expect(rootMenu(page)).toHaveCount(0)
    await expect.poll(() => readHandleState(page)).toMatchObject({pinned: false})
    await hoverBlock(page, ids[2])
  })
}

test('固定菜单后仍能开始拖拽，取消拖拽不会重新打开菜单', async ({page}) => {
  const {ids} = await setup(page)
  const handle = await hoverBlock(page, ids[0])
  await handle.click()
  await expect(rootMenu(page)).toBeVisible()
  const box = (await handle.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 40, {steps: 5})
  await expect.poll(() => readSelection(page)).toMatchObject({dragging: 'dragging'})
  await expect(rootMenu(page)).toHaveCount(0)
  await expect.poll(() => readHandleState(page)).toMatchObject({pinned: false})
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect.poll(() => readSelection(page)).toMatchObject({dragging: 'idle', canUndo: false})
  await expect(rootMenu(page)).toHaveCount(0)
})

test('抓手点击选中后菜单能应用段落设置', async ({page}) => {
  const {ids} = await setup(page)
  const handle = await hoverBlock(page, ids[0])
  await handle.click()
  await expect.poll(() => readSelection(page)).toMatchObject({
    anchor: {type: 'selected', blockId: ids[0]}, head: {type: 'selected', blockId: ids[0]},
  })
  const menu = page.locator('bc-float-toolbar:visible').filter({hasText: '基础'})
  await expect(menu).toBeVisible()
  await menu.locator('.base-list__item[title^="一级标题"]').click()
  await expect.poll(() => page.evaluate(id => {
    const {doc} = (window as any).controllerClickFixture
    return {heading: doc.model.getProps(id)?.heading, text: doc.model.getTextDeltas(id)}
  }, ids[0])).toMatchObject({heading: 1, text: [{insert: paragraphTexts[0]}]})
})
