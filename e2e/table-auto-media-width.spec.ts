import {expect, test, type Page} from '@playwright/test'

type MediaKind = 'image' | 'video' | 'embed'
const fixture = '#table-auto-media-fixture'

async function frames(page: Page) {
  await page.evaluate(async () => {
    for (let i = 0; i < 4; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  })
}

async function setup(page: Page, kind: MediaKind, auto = true, merged = false, nested = false) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.route('**/table-media-frame', route => route.fulfill({contentType: 'text/html', body: '<p>媒体尺寸测试</p>'}))
  await page.route('**/table-media.mp4', route => route.fulfill({contentType: 'video/mp4', body: ''}))
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng
    ?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  await page.evaluate(({kind, auto, merged, nested}) => {
    const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const viewport = document.createElement('div')
    viewport.id = 'table-auto-media-fixture'
    viewport.style.cssText = 'position:fixed;left:40px;top:40px;width:1100px;height:750px;overflow:auto;background:white;z-index:99999'
    const mount = document.createElement('div')
    mount.style.width = '720px'
    viewport.appendChild(mount)
    document.body.appendChild(viewport)
    const canvas = document.createElement('canvas')
    canvas.width = 240
    canvas.height = 120
    canvas.getContext('2d')!.fillRect(0, 0, 240, 120)
    const media = kind === 'image'
      ? source.schemas.createSnapshot('image', [{src: canvas.toDataURL(), wr: 20, ar: 2}])
      : kind === 'video'
        ? source.schemas.createSnapshot('video', [{url: `${location.origin}/table-media.mp4`, sourceType: 'link', wr: 20, ar: 2}])
        : source.schemas.createSnapshot('embed', [`${location.origin}/table-media-frame`])
    media.props = {...media.props, wr: 20, ar: 2}
    const table = source.schemas.createSnapshot('table', [3, 3])
    table.props.colWidths = [180, 180, 180]
    table.props.columnSizing = auto ? 'auto' : null
    table.children.forEach((row: any) => row.children.forEach((cell: any, col: number) => {
      cell.children = [source.schemas.createSnapshot('paragraph', [col === 0 ? '图' : '说明文字可以随媒体变宽重新换行，保留足够空间观察列宽变化。'])]
    }))
    table.children[0].children[0].children = [media]
    if (merged) {
      table.children[0].children[0].props.colspan = 2
      table.children[0].children[1].props.display = 'none'
    }
    const outer = nested ? source.schemas.createSnapshot('table', [1, 1]) : null
    if (outer) {
      outer.props.columnSizing = 'auto'
      outer.children[0].children[0].children = [table]
    }
    const root = source.schemas.createSnapshot('root', ['table-auto-media-root', [outer ?? table]])
    const doc = new source.constructor({...source.config, yDoc: new source.yDoc.constructor(),
      docId: root.id, plugins: [], scrollContainer: viewport, readonly: false, virtualization: {enabled: false}})
    doc.initBySnapshot(root, mount)
    ;(window as any).__autoMedia = {doc, viewport, mount, tableId: table.id, mediaId: media.id, kind, updates: 0}
  }, {kind, auto, merged, nested})
  await expect(page.locator(`${fixture} .table-block`).first()).toBeVisible()
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  await frames(page)
  await page.evaluate(() => {
    const state = (window as any).__autoMedia
    state.doc.crud.undoManager.clearHistory()
    state.doc.yDoc.on('update', () => state.updates++)
  })
}

async function state(page: Page) {
  return page.evaluate(() => {
    const {doc, tableId, mediaId, kind, updates} = (window as any).__autoMedia
    const table = doc.getBlockById(tableId)
    const media = doc.getBlockById(mediaId)
    const surface = media.hostElement.querySelector(kind === 'image' ? '.img-wrapper'
      : kind === 'video' ? '.video-block__wrapper' : 'embed-frame-card') as HTMLElement
    const cell = media.hostElement.closest('td') as HTMLElement
    const cellBox = cell.getBoundingClientRect()
    const mediaBox = surface.getBoundingClientRect()
    const widths = table.getChildrenByIndex(2).getChildrenBlocks()
      .map((block: any) => block.hostElement.getBoundingClientRect().width)
    const bars = Array.from(table.hostElement.querySelectorAll('table-col-bar > .handle'))
      .map((element: any) => element.getBoundingClientRect().width)
    return {width: mediaBox.width, cell: cellBox.width, right: mediaBox.right, cellRight: cellBox.right,
      widths, bars, stored: [...table.props.colWidths], auto: table.props.columnSizing === 'auto',
      layout: getComputedStyle(table.hostElement.querySelector('table')).tableLayout,
      props: {...media.props}, updates, canUndo: doc.crud.undoManager.isCanUndo()}
  })
}

async function beginDrag(page: Page, delta: number) {
  const kind = await page.evaluate(() => {
    const {doc, mediaId, kind} = (window as any).__autoMedia
    doc.selection.selectBlock(mediaId)
    return kind as MediaKind
  })
  const surface = page.locator(`${fixture} ${kind === 'image' ? '.img-wrapper'
    : kind === 'video' ? '.video-block__wrapper' : 'embed-frame-card'}`).first()
  await surface.hover()
  const handle = surface.locator(kind === 'video' ? '.block-resizer__bar--right' : '[data-handle="east"]')
  await expect(handle).toBeVisible()
  const box = (await handle.boundingBox())!
  const x = box.x + box.width / 2, y = box.y + box.height / 2
  await page.mouse.move(x, y)
  const hit = await page.evaluate(({x, y}) => {
    const element = document.elementFromPoint(x, y)
    return {handle: element?.closest('[data-handle]')?.getAttribute('data-handle'),
      video: !!element?.closest('.block-resizer__bar--right'), target: element?.outerHTML.slice(0, 250)}
  }, {x, y})
  if (!(kind === 'video' ? hit.video : hit.handle === 'east')) {
    await page.screenshot({path: test.info().outputPath('media-handle-hit.png')})
  }
  expect(kind === 'video' ? hit.video : hit.handle === 'east', JSON.stringify(hit)).toBe(true)
  await page.mouse.down()
  await page.mouse.move(x + delta, y, {steps: 8})
  await frames(page)
}

test.use({viewport: {width: 1400, height: 1000}})

for (const kind of ['image', 'video', 'embed'] as const) {
  test(`自动列宽中的 ${kind} 拖宽即时撑开单元格，缩小、取消和撤销保持一致`, async ({page}) => {
    await setup(page, kind)
    const before = await state(page)
    await beginDrag(page, 180)
    const preview = await state(page)
    expect(preview.width).toBeGreaterThan(before.width + 140)
    expect(preview.cell).toBeGreaterThan(before.cell + 100)
    expect(preview.right).toBeLessThanOrEqual(preview.cellRight + 1)
    expect(preview.updates).toBe(0)
    expect(preview.props).toEqual(before.props)
    await page.mouse.up()
    await expect.poll(async () => (await state(page)).props.wr).toBeGreaterThan(before.props.wr + 15)
    await frames(page)
    const grown = await state(page)
    if (kind === 'image') await page.locator(fixture).screenshot({path: test.info().outputPath('auto-table-image-grown.png')})
    expect(grown.auto).toBe(true)
    expect(grown.stored).toEqual(before.stored)
    expect(Math.abs(grown.width - preview.width)).toBeLessThan(2)
    expect(grown.bars.every((width: number, index: number) => Math.abs(width - grown.widths[index]) < 3)).toBe(true)
    await page.evaluate(() => (window as any).__autoMedia.doc.crud.undoManager.undo())
    await expect.poll(async () => (await state(page)).props.wr).toBe(before.props.wr)
    await frames(page)
    expect(Math.abs((await state(page)).cell - before.cell)).toBeLessThan(3)
    expect((await state(page)).canUndo).toBe(false)
    await page.evaluate(() => (window as any).__autoMedia.doc.crud.undoManager.redo())
    await frames(page)
    await beginDrag(page, -100)
    const shrunk = await state(page)
    expect(shrunk.width).toBeLessThan(grown.width - 75)
    expect(shrunk.cell).toBeLessThan(grown.cell - 50)
    await page.keyboard.press('Escape')
    await page.mouse.up()
    await frames(page)
    const cancelled = await state(page)
    expect(cancelled.props).toEqual(grown.props)
    expect(Math.abs(cancelled.width - grown.width)).toBeLessThan(2)
    expect(Math.abs(cancelled.cell - grown.cell)).toBeLessThan(3)
  })
}

test('手动列宽内图片仍受单元格约束', async ({page}) => {
  await setup(page, 'image', false)
  const before = await state(page)
  await beginDrag(page, 180)
  await page.mouse.up()
  await frames(page)
  const after = await state(page)
  expect(after.auto).toBe(false)
  expect(after.stored).toEqual(before.stored)
  expect(Math.abs(after.cell - before.cell)).toBeLessThan(1)
  expect(after.right).toBeLessThanOrEqual(after.cellRight + 1)
})

test('外层自动表格不解除内层手动表格的媒体宽度约束', async ({page}) => {
  await setup(page, 'image', false, false, true)
  const before = await state(page)
  expect(before.layout).toBe('fixed')
  await beginDrag(page, 180)
  await page.mouse.up()
  await frames(page)
  const after = await state(page)
  expect(after.auto).toBe(false)
  expect(after.layout).toBe('fixed')
  expect(after.stored).toEqual(before.stored)
  expect(Math.abs(after.cell - before.cell)).toBeLessThan(1)
  expect(after.right).toBeLessThanOrEqual(after.cellRight + 1)
})

test('跨列合并格中的图片尺寸在只读重开后仍撑开对应列', async ({page}) => {
  await setup(page, 'image', true, true)
  await beginDrag(page, 180)
  await page.mouse.up()
  await frames(page)
  const before = await state(page)
  await page.evaluate(() => {
    const state = (window as any).__autoMedia
    const snapshot = state.doc.exportSnapshot()
    const config = state.doc.config
    const Doc = state.doc.constructor
    const YDoc = state.doc.yDoc.constructor
    state.doc.destroy()
    state.mount.replaceChildren()
    state.doc = new Doc({...config, yDoc: new YDoc(), docId: snapshot.id, readonly: true})
    state.doc.initBySnapshot(snapshot, state.mount)
    state.updates = 0
    state.doc.yDoc.on('update', () => state.updates++)
  })
  await frames(page)
  const after = await state(page)
  expect(after.auto).toBe(true)
  expect(after.stored).toEqual(before.stored)
  expect(Math.abs(after.width - before.width)).toBeLessThan(2)
  expect(Math.abs(after.cell - before.cell)).toBeLessThan(3)
  expect(after.right).toBeLessThanOrEqual(after.cellRight + 1)
  expect(after.updates).toBe(0)
  await expect(page.locator(`${fixture} shape-resizer`)).toHaveCount(0)
})
