import {expect, test, type Page} from '@playwright/test'

async function setup(page: Page, scale: number, wide: boolean) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng
    ?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  await page.evaluate(({scale, wide}) => {
    const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const viewport = document.createElement('div')
    viewport.style.cssText = 'position:fixed;left:40px;top:60px;width:1100px;height:650px;overflow:auto;background:white;z-index:100'
    const mount = document.createElement('div')
    mount.style.cssText = `width:400px;margin-left:${300 / scale}px`
    viewport.appendChild(mount)
    document.body.appendChild(viewport)
    const table = source.schemas.createSnapshot('table', [3, wide ? 7 : 3])
    table.props.colWidths = Array(wide ? 7 : 3).fill(110)
    table.children.forEach((row: any, r: number) => row.children.forEach((cell: any, c: number) => {
      cell.children = [source.schemas.createSnapshot('paragraph', [`单元格 ${r}:${c}`])]
    }))
    const snapshot = source.schemas.createSnapshot('root', ['toolbar-scale-regression', [table]])
    const doc = new source.constructor({
      ...source.config, yDoc: new source.yDoc.constructor(), docId: snapshot.id,
      plugins: [], scrollContainer: viewport, readonly: false, virtualization: {enabled: false},
    })
    doc.initBySnapshot(snapshot, mount)
    doc.root.hostElement.style.minHeight = '1400px'
    doc.root.hostElement.style.paddingTop = '100px'
    doc.viewScale.attach(mount)
    doc.viewScale.setScale(scale)
    ;(window as any).__tableToolbarScale = {doc, viewport, tableId: table.id}
  }, {scale, wide})
  const table = page.locator('[data-block-id="toolbar-scale-regression"] .table-block')
  await expect(table).toBeVisible()
  await table.locator('.paragraph-block').first().click()
  await expect(page.locator('.cdk-overlay-pane table-structure-toolbar')).toBeVisible()
}

async function geometry(page: Page) {
  return page.evaluate(() => {
    const {doc, tableId} = (window as any).__tableToolbarScale
    const block = doc.getBlockById(tableId)
    const table = block.hostElement.querySelector('table').getBoundingClientRect()
    const anchor = block.tableMenuAnchor.nativeElement.getBoundingClientRect()
    const clip = block.tableScrollable.nativeElement.getBoundingClientRect()
    const root = doc.root.hostElement.getBoundingClientRect()
    const toolbar = document.querySelector('.cdk-overlay-pane table-structure-toolbar')?.getBoundingClientRect()
    const visibleLeft = Math.max(table.left, clip.left, root.left)
    const visibleRight = Math.min(table.right, clip.right, root.right)
    return {
      anchorError: Math.max(Math.abs(anchor.top - table.top), Math.abs(anchor.bottom - table.bottom),
        Math.abs(anchor.left - (visibleLeft + visibleRight) / 2)),
      gapBelow: toolbar ? toolbar.top - table.bottom : -9999,
      toolbarCenterError: toolbar ? Math.abs((toolbar.left + toolbar.right) / 2 - (visibleLeft + visibleRight) / 2) : 9999,
    }
  })
}

for (const scale of [0.5, 0.75, 1, 1.25, 1.5, 2]) {
  test(`文档缩放 ${scale}：表格工具栏贴合表格下边缘且不遮挡单元格`, async ({page}) => {
    await setup(page, scale, false)
    await expect.poll(async () => (await geometry(page)).anchorError).toBeLessThan(2)
    await expect.poll(async () => (await geometry(page)).gapBelow).toBeGreaterThanOrEqual(6)
    await expect.poll(async () => (await geometry(page)).gapBelow).toBeLessThan(12)
    await expect.poll(async () => (await geometry(page)).toolbarCenterError).toBeLessThan(2)
    const before = await page.evaluate(() => JSON.stringify((window as any).__tableToolbarScale.doc.exportSnapshot()))
    await page.evaluate(() => { (window as any).__tableToolbarScale.viewport.scrollTop = 30 })
    await expect.poll(async () => (await geometry(page)).anchorError).toBeLessThan(2)
    await expect.poll(async () => (await geometry(page)).gapBelow).toBeGreaterThanOrEqual(6)
    await page.locator('[data-block-id="toolbar-scale-regression"] .paragraph-block').nth(4).click()
    await expect.poll(async () => (await geometry(page)).anchorError).toBeLessThan(2)
    expect(await page.evaluate(() => JSON.stringify((window as any).__tableToolbarScale.doc.exportSnapshot()))).toBe(before)
  })
}

for (const scale of [0.75, 1.5]) {
  test(`文档缩放 ${scale}：宽表横向滚动后工具栏居中于可见表格`, async ({page}) => {
    await setup(page, scale, true)
    await page.locator('[data-block-id="toolbar-scale-regression"] .table-scrollable')
      .evaluate(element => { element.scrollLeft = 120 })
    await expect.poll(async () => (await geometry(page)).anchorError).toBeLessThan(2)
    await expect.poll(async () => (await geometry(page)).toolbarCenterError).toBeLessThan(2)
    await expect.poll(async () => (await geometry(page)).gapBelow).toBeGreaterThanOrEqual(6)
  })
}

test('工具栏已打开时调整文档缩放，仍跟随表格且不改变正文', async ({page}) => {
  await setup(page, 1, false)
  const before = await page.evaluate(() => JSON.stringify((window as any).__tableToolbarScale.doc.exportSnapshot()))
  for (const scale of [0.75, 1.25, 1]) {
    await page.evaluate(scale => (window as any).__tableToolbarScale.doc.viewScale.setScale(scale), scale)
    await expect.poll(async () => (await geometry(page)).anchorError).toBeLessThan(2)
    await expect.poll(async () => (await geometry(page)).gapBelow).toBeGreaterThanOrEqual(6)
    await expect.poll(async () => (await geometry(page)).gapBelow).toBeLessThan(12)
  }
  expect(await page.evaluate(() => JSON.stringify((window as any).__tableToolbarScale.doc.exportSnapshot()))).toBe(before)
})
