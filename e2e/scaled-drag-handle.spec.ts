import {expect, test, type Page} from '@playwright/test'

async function setup(page: Page, scale: number) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng
    ?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  return page.evaluate(scale => {
    const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const viewport = document.createElement('div')
    viewport.style.cssText = 'position:fixed;left:20px;top:50px;width:1100px;height:600px;overflow:auto;background:white;z-index:10'
    const mount = document.createElement('div')
    mount.style.width = '480px'
    viewport.appendChild(mount)
    document.body.appendChild(viewport)
    const blocks = ['抓手定位源', '抓手定位目标', '尾段'].map(text => source.schemas.createSnapshot('paragraph', [text]))
    const snapshot = source.schemas.createSnapshot('root', ['scaled-handle', blocks])
    const Controller = source.plugins.find(plugin => plugin.name === 'block-controller').constructor
    const doc = new source.constructor({...source.config, yDoc: new source.yDoc.constructor(), docId: snapshot.id,
      plugins: [new Controller()], scrollContainer: viewport, readonly: false, virtualization: {enabled: false}})
    doc.initBySnapshot(snapshot, mount)
    doc.viewScale.attach(mount)
    doc.viewScale.setScale(scale)
    ;(window as any).handleFixture = {doc, ids: blocks.map(block => block.id)}
    return blocks.map(block => block.id) as string[]
  }, scale)
}

async function hoverBlock(page: Page, id: string) {
  await page.locator(`[data-block-id="${id}"]`).hover()
  await expect.poll(() => page.evaluate(() => {
    const {doc} = (window as any).handleFixture
    return doc.root.hostElement.querySelector('bc-drag-handle')
      && (window as any).ng.getComponent(doc.root.hostElement.querySelector('bc-drag-handle')).activeBlock?.id
  })).toBe(id)
}

async function expectHandle(page: Page, id: string, xOffset = 52, yOffset = 4) {
  await expect.poll(() => page.evaluate(({id, xOffset, yOffset}) => {
    const {doc} = (window as any).handleFixture
    const block = doc.getBlockById(id).hostElement.getBoundingClientRect()
    const handle = doc.root.hostElement.querySelector('bc-drag-handle').getBoundingClientRect()
    const scale = doc.viewScale.geometryScale
    return Math.max(Math.abs(handle.left - (block.left - xOffset * scale)),
      Math.abs(handle.top - (block.top - yOffset * scale)))
  }, {id, xOffset, yOffset})).toBeLessThan(1)
}

for (const scale of [0.5, 1, 1.5, 2]) {
  test(`scale ${scale}: actual floating handle aligns, opens menu and starts a reorder`, async ({page}) => {
    const ids = await setup(page, scale)
    await hoverBlock(page, ids[1])
    await expectHandle(page, ids[1])
    await hoverBlock(page, ids[0])
    await expectHandle(page, ids[0])
    const handle = page.locator('bc-drag-handle:visible .btn')
    await handle.hover()
    await expect(page.locator('bc-float-toolbar:visible').filter({hasText: '基础'})).toBeVisible()
    await handle.click()
    await expect.poll(() => page.evaluate(() => (window as any).handleFixture.doc.dragController.state)).toBe('idle')
    const origin = (await handle.boundingBox())!
    await page.mouse.move(origin.x + origin.width / 2, origin.y + origin.height / 2)
    await page.mouse.down()
    const target = (await page.locator(`[data-block-id="${ids[1]}"]`).boundingBox())!
    await page.mouse.move(target.x + target.width / 2, target.y + target.height - 2, {steps: 5})
    await expect.poll(() => page.evaluate(() => (window as any).handleFixture.doc.dragController.state)).toBe('dragging')
    await page.mouse.up()
    await expect.poll(() => page.evaluate(() => {
      const {doc, ids} = (window as any).handleFixture
      return doc.root.childrenIds.join() === [ids[1], ids[0], ids[2]].join()
    })).toBe(true)
  })
}

for (const scale of [0.5, 1.5]) {
  test(`scale ${scale}: nested columns and table cells retain their handle offsets`, async ({page}) => {
    await setup(page, scale)
    const ids = await page.evaluate(() => {
      const {doc} = (window as any).handleFixture
      const table = doc.schemas.createSnapshot('table', [1, 2])
      const columns = doc.schemas.createSnapshot('columns', [2])
      doc.crud.insertBlockSnapshots(doc.rootId, 0, [table, columns])
      return {table: table.id, cell: table.children[0].children[1].children[0].id,
        column: columns.children[1].children[0].id}
    })
    for (const id of [ids.cell, ids.column]) {
      await hoverBlock(page, id)
      await expectHandle(page, id, 62, 4)
    }
    // Table chrome contains non-editable cells; select the table through the
    // existing component input to isolate its distinct positioning rule.
    await page.evaluate(id => {
      const {doc} = (window as any).handleFixture
      const plugin = doc.plugins.find(plugin => plugin.name === 'block-controller')
      plugin._cpr.setInput('activeBlock', doc.getBlockById(id))
    }, ids.table)
    await expectHandle(page, ids.table, 62, 12)
  })
}

test('custom handle positioning receives layout coordinates after zoom and root scrolling', async ({page}) => {
  const ids = await setup(page, 1.5)
  await page.evaluate(() => {
    const {doc} = (window as any).handleFixture
    const root = doc.root.hostElement
    root.style.height = '120px'
    root.style.minHeight = '0'
    root.style.overflow = 'auto'
    const filler = Array.from({length: 20}, () => doc.schemas.createSnapshot('paragraph', ['滚动内容']))
    doc.crud.insertBlockSnapshots(doc.rootId, doc.root.childrenIds.length, filler)
    const plugin = doc.plugins.find(plugin => plugin.name === 'block-controller')
    plugin._cpr.setInput('positionResolver', ({left, top}) => ({x: left - 30, y: top + 6}))
  })
  await hoverBlock(page, ids[1])
  await expectHandle(page, ids[1], 30, -6)
  await page.evaluate(() => {
    const {doc} = (window as any).handleFixture
    doc.root.hostElement.scrollTop = 20
  })
  // Switch blocks to exercise fresh coordinates with a nonzero root scrollTop.
  await hoverBlock(page, ids[2])
  await expectHandle(page, ids[2], 30, -6)
  expect(await page.evaluate(() => (window as any).handleFixture.doc.root.hostElement.scrollTop)).toBeGreaterThan(0)
})
