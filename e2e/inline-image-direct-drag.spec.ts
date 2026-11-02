import {expect, test, type Locator, type Page} from '@playwright/test'

type Options = {sparse?: boolean; scale?: number; readonly?: 'document' | 'block'; wrap?: boolean}

async function setup(page: Page, options: Options = {}) {
  await page.setViewportSize({width: 1440, height: 1000})
  await page.routeWebSocket('**', socket => socket.close())
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    return ['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname)
      ? route.abort() : route.continue()
  })
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc)
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  const ids = await page.evaluate(options => {
    const editor = (window as any).ng.getComponent(document.querySelector('block-craft-editor'))
    const home = (window as any).ng.getComponent(document.querySelector('playground-home'))
    const doc = editor.doc
    const paragraph = (text: string) => doc.schemas.createSnapshot('paragraph', [text])
    const owner = (label: string, color: string) => doc.schemas.createSnapshot('paragraph', [[
      {insert: label},
      {insert: {image: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="${color}"/></svg>`)},
        attributes: {width: 120, height: 80, ...(options.wrap !== false ? {wrap: true, side: 'right', x: 0, gap: 12} : {})}},
      {insert: '同段正文用于验证真实鼠标移动和图片前后文字保留。'.repeat(4)},
    ]])
    const root = doc.schemas.createSnapshot('root', [editor.rootId, [
      paragraph('点击这里清除图片选择。'), owner('首', '#568ab4'), owner('次', '#c68a43'),
      ...Array.from({length: 18}, (_, index) => paragraph(`后续段落 ${index + 1}`)),
    ]])
    home.ensureEditorInitialized(root)
    const pagination = doc.plugins.find((plugin: any) => plugin.name === 'pagination')
    pagination.disable()
    pagination._controller?.destroy()
    pagination._controller = null
    pagination._experimentalSparseView = options.sparse ?? false
    pagination._documentHeader = undefined
    pagination.updateConfig({pageSize: {width: 796, height: 800}, orientation: 'portrait',
      margins: {top: 48, right: 48, bottom: 48, left: 48}, pageGap: 24, header: undefined, footer: undefined})
    doc.viewScale.attach(home.documentScaleSurface)
    doc.viewScale.setScale(options.scale ?? 1)
    pagination.enable()
    const ids = {intro: root.children[0].id, first: root.children[1].id, second: root.children[2].id}
    if (options.readonly === 'document') doc.toggleReadonly(true)
    if (options.readonly === 'block') doc.setBlockReadonly(ids.first, true)
    ;(window as any).__directImageDrag = {doc, ids, commits: 0}
    return ids
  }, options)
  await page.locator('bc-pagination-settings').getByTitle('收起', {exact: true}).click()
  await page.locator(`[data-block-id="${ids.intro}"] .edit-container`).click({position: {x: 8, y: 8}})
  await expect(page.locator('.bc-inline-image-shell--selected')).toHaveCount(0)
  await page.waitForFunction(() => Array.from(document.querySelectorAll<HTMLImageElement>('img.bc-inline-image'))
    .every(image => image.complete && image.naturalWidth > 0))
  // Fixture instrumentation observes model writes; all accepted gestures below use real input.
  await page.evaluate(async () => {
    const state = (window as any).__directImageDrag
    for (let index = 0; index < 4; index++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    state.doc.crud.undoManager.clearHistory()
    state.doc.yDoc.on('afterTransaction', (transaction: any) => {
      if (transaction.local && transaction.changed.size > 0) state.commits++
    })
  })
  return ids
}

const frame = (page: Page, id: string) => page.locator(`[data-block-id="${id}"] .bc-inline-image-frame`)
const shell = (page: Page, id: string) => page.locator(`[data-block-id="${id}"] .bc-inline-image-shell`)
const proxy = (page: Page) => page.locator('[data-bc-inline-image-drag-proxy]')

async function readState(page: Page) {
  return page.evaluate(() => {
    const {doc, ids, commits} = (window as any).__directImageDrag
    const read = (id: string) => doc.getBlockById(id).textDeltas()
    const selection = doc.selection.value
    return {snapshot: JSON.stringify(doc.exportSnapshot()), first: read(ids.first), second: read(ids.second), commits,
      canUndo: doc.crud.undoManager.isCanUndo(),
      selection: selection ? {anchorId: selection.anchor.blockId, headId: selection.head.blockId,
        anchorOffset: selection.anchor.offset, headOffset: selection.head.offset} : null}
  })
}

async function bounds(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Inline image is not visible')
  return box
}

async function startDrag(page: Page, target: Locator, dx: number, dy = 0) {
  await target.scrollIntoViewIfNeeded()
  const box = await bounds(target)
  const start = {x: box.x + box.width / 2, y: box.y + Math.min(20, box.height / 2)}
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + dx, start.y + dy, {steps: 8})
  return {box, start}
}

async function resizeGrip(page: Page, target: Locator, side: 'left' | 'right') {
  const image = await bounds(target)
  // Controls are created while the initial click is already inside the shell.
  // Re-enter through real hover, then use the visible grip clipped by the frame.
  await page.mouse.move(image.x + image.width / 2, image.y + image.height + 20)
  await target.hover({position: {x: image.width / 2, y: 20}})
  await expect(target.locator('inline-image-resizer')).toHaveClass(/visible/)
  const grip = await bounds(target.locator(`.inline-image-resizer__bar--${side} .inline-image-resizer__bar-inner`))
  const point = {x: (Math.max(image.x, grip.x) + Math.min(image.x + image.width, grip.x + grip.width)) / 2,
    y: (Math.max(image.y, grip.y) + Math.min(image.y + image.height, grip.y + grip.height)) / 2}
  await page.mouse.move(point.x, point.y)
  expect(await page.evaluate(({point, side}) => !!document.elementFromPoint(point.x, point.y)
    ?.closest(`.inline-image-resizer__bar--${side}`), {point, side})).toBe(true)
  return point
}

async function undoThroughKeyboard(page: Page, snapshot: string) {
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => (await readState(page)).snapshot).toBe(snapshot)
  expect((await readState(page)).canUndo).toBe(false)
}

for (const sparse of [false, true]) for (const scale of sparse ? [1, 1.25] : [0.8, 1, 1.25]) {
  test(`${sparse ? 'sparse' : 'full'} ${scale}x 未选中图片首次按下即可拖动并一次撤销`, async ({page}, testInfo) => {
    const ids = await setup(page, {sparse, scale})
    const before = await readState(page)
    const target = frame(page, ids.first)
    const drag = await startDrag(page, target, 120 * scale)
    await expect(proxy(page)).toBeVisible()
    expect((await readState(page)).snapshot).toBe(before.snapshot)
    expect((await readState(page)).commits).toBe(0)
    const during = await bounds(target)
    expect(during.x).toBeCloseTo(drag.box.x, 1)
    expect(during.y).toBeCloseTo(drag.box.y, 1)
    await page.mouse.up()
    await expect(proxy(page)).toHaveCount(0)
    await expect.poll(async () => (await readState(page)).snapshot).not.toBe(before.snapshot)
    expect((await readState(page)).commits).toBe(1)
    const after = await bounds(target)
    expect(after.x - drag.box.x).toBeCloseTo(120 * scale, 0)
    expect(after.width).toBeCloseTo(drag.box.width, 1)
    expect((await readState(page)).second).toEqual(before.second)
    if (!sparse && scale === 1 && testInfo.project.name === 'chromium') {
      await page.screenshot({path: testInfo.outputPath('inline-image-first-drag-success.png')})
    }
    await undoThroughKeyboard(page, before.snapshot)
  })
}

test('点击与微抖动不写数据，从另一图片首次按下可直接拖动', async ({page}) => {
  const ids = await setup(page)
  const before = await readState(page)
  await frame(page, ids.first).click({position: {x: 60, y: 20}})
  await expect(shell(page, ids.first)).toHaveClass(/bc-inline-image-shell--selected/)
  expect((await readState(page)).snapshot).toBe(before.snapshot)
  expect((await readState(page)).canUndo).toBe(false)
  expect((await readState(page)).selection).toEqual({anchorId: ids.first, headId: ids.first, anchorOffset: 1, headOffset: 2})
  await startDrag(page, frame(page, ids.first), 1)
  await page.mouse.up()
  expect((await readState(page)).commits).toBe(0)
  expect((await readState(page)).snapshot).toBe(before.snapshot)
  await startDrag(page, frame(page, ids.second), 100)
  await expect(proxy(page)).toBeVisible()
  await page.mouse.up()
  const after = await readState(page)
  expect(after.commits).toBe(1)
  expect(after.first).toEqual(before.first)
  expect(after.second).not.toEqual(before.second)
  await undoThroughKeyboard(page, before.snapshot)
})

test('首次拖动 Escape 与越界取消后仍能重试提交', async ({page}) => {
  const ids = await setup(page)
  const before = await readState(page)
  await startDrag(page, frame(page, ids.first), 90)
  await expect(proxy(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(proxy(page)).toHaveCount(0)
  expect((await readState(page)).snapshot).toBe(before.snapshot)
  expect((await readState(page)).commits).toBe(0)
  await startDrag(page, frame(page, ids.first), 90)
  await page.mouse.move(5, 5, {steps: 8})
  await page.mouse.up()
  await expect(proxy(page)).toHaveCount(0)
  expect((await readState(page)).snapshot).toBe(before.snapshot)
  expect((await readState(page)).commits).toBe(0)
  await startDrag(page, frame(page, ids.first), 90)
  await expect(proxy(page)).toBeVisible()
  await page.mouse.up()
  expect((await readState(page)).commits).toBe(1)
  await undoThroughKeyboard(page, before.snapshot)
})

test('左右尺寸手柄仍独占 resize 且可取消和撤销', async ({page}) => {
  const ids = await setup(page)
  const before = await readState(page)
  const target = frame(page, ids.first)
  await target.click({position: {x: 60, y: 20}})
  const original = await bounds(target)
  const handle = await resizeGrip(page, target, 'right')
  await page.mouse.down()
  await page.mouse.move(handle.x + 30, handle.y, {steps: 6})
  await expect(page.locator('[data-bc-inline-image-resize-proxy]')).toBeVisible()
  await expect(proxy(page)).toHaveCount(0)
  expect((await readState(page)).snapshot).toBe(before.snapshot)
  await page.mouse.up()
  await expect.poll(async () => (await bounds(target)).width).toBeCloseTo(original.width + 30, 0)
  expect((await readState(page)).commits).toBe(1)
  await undoThroughKeyboard(page, before.snapshot)
  await target.click({position: {x: 60, y: 20}})
  const left = await resizeGrip(page, target, 'left')
  await page.mouse.down()
  await page.mouse.move(left.x + 25, left.y, {steps: 6})
  await expect(page.locator('[data-bc-inline-image-resize-proxy]')).toBeVisible()
  await expect(proxy(page)).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(page.locator('[data-bc-inline-image-resize-proxy]')).toHaveCount(0)
  expect((await readState(page)).snapshot).toBe(before.snapshot)
  expect((await readState(page)).canUndo).toBe(false)
})

for (const readonly of ['document', 'block'] as const) {
  test(`${readonly} readonly 图片仍可选择但首次拖动不写数据`, async ({page}) => {
    const ids = await setup(page, {readonly})
    const before = await readState(page)
    await startDrag(page, frame(page, ids.first), 90)
    await expect(proxy(page)).toHaveCount(0)
    await page.mouse.up()
    expect((await readState(page)).snapshot).toBe(before.snapshot)
    expect((await readState(page)).commits).toBe(0)
    expect((await readState(page)).canUndo).toBe(false)
    expect((await readState(page)).selection).toEqual({anchorId: ids.first, headId: ids.first, anchorOffset: 1, headOffset: 2})
    await expect(frame(page, ids.first).locator('[data-bc-inline-image-resizer]')).toHaveCount(0)
  })
}

test('普通行内图片首次按下不自动切换为环绕图片', async ({page}) => {
  const ids = await setup(page, {wrap: false})
  const before = await readState(page)
  await startDrag(page, frame(page, ids.first), 80)
  await expect(proxy(page)).toHaveCount(0)
  await page.mouse.up()
  expect((await readState(page)).snapshot).toBe(before.snapshot)
  expect((await readState(page)).commits).toBe(0)
  expect((await readState(page)).canUndo).toBe(false)
  await expect(shell(page, ids.first)).toHaveClass(/bc-inline-image-shell--selected/)
})
