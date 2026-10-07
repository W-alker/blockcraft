import {expect, test, type Page} from '@playwright/test'

async function createRegion(page: Page, fixed = false, nested = false) {
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  return page.evaluate(({fixed, nested}) => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const paragraph = doc.schemas.createSnapshot('paragraph', ['填写内容'])
    const region = doc.schemas.createSnapshot('render-unit', [{tplRegion: true}, {
      p: [16, 20], borders: {top: '2px solid #333', bottom: '2px solid #333'},
      ...(fixed ? {width: 400, height: 1600} : {}),
    }])
    region.children = [paragraph]
    const outer = nested ? doc.schemas.createSnapshot('callout', []) : region
    if (nested) outer.children = [region]
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [outer])
    doc.plugins.find((p: any) => p.name === 'pagination').enable()
    return {region: region.id, paragraph: paragraph.id}
  }, {fixed, nested})
}

async function replaceContent(page: Page, id: string, lines: number) {
  await page.evaluate(({id, lines}) => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const block = doc.getBlockById(id)
    block.replaceText(0, block.textLength, Array(lines).fill('填写区内容随输入增高').join('\n'))
  }, {id, lines})
}

async function geometry(page: Page, id: string) {
  return page.locator(`[data-block-id="${id}"]`).evaluate(host => {
    const content = host.querySelector(':scope > .render-unit-content') as HTMLElement
    const style = getComputedStyle(host)
    return {
      height: (host as HTMLElement).offsetHeight,
      cap: parseFloat(style.getPropertyValue('--bc-page-content-height')),
      contentHeight: content.clientHeight,
      scrollHeight: content.scrollHeight,
      overflow: getComputedStyle(content).overflowY,
      hostOverflow: style.overflowY,
      inlineHeight: (host as HTMLElement).style.height,
    }
  })
}

for (const nested of [false, true]) {
  test(`填写区${nested ? '嵌套' : '根级'}默认随内容增减并跨页`,  async ({page}) => {
    const ids = await createRegion(page, false, nested)
    const region = page.locator(`[data-block-id="${ids.region}"]`)
    await expect(region).toBeVisible()
    const initial = await geometry(page, ids.region)
    expect(initial.inlineHeight).toBe('')
    await replaceContent(page, ids.paragraph, 8)
    await expect.poll(async () => (await geometry(page, ids.region)).height).toBeGreaterThan(initial.height + 50)
    await replaceContent(page, ids.paragraph, 100)
    await expect.poll(async () => {
      const g = await geometry(page, ids.region)
      return g.height > g.cap && g.overflow === 'visible'
    }).toBe(true)
    await replaceContent(page, ids.paragraph, 1)
    await expect.poll(async () => (await geometry(page, ids.region)).height).toBeLessThan(initial.height + 10)
    expect((await geometry(page, ids.region)).inlineHeight).toBe('')
    await page.evaluate(id => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      doc.selection.setCursorAtBlock(id, false, false)
    }, ids.paragraph)
    await page.keyboard.insertText('可以继续输入')
    await expect(region).toContainText('可以继续输入')
  })
}

test('流式手动拖动高度后保持固定，撤销恢复自适应；分页临时展开旧尺寸', async ({page}) => {
  const ids = await createRegion(page)
  await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.plugins.find((p: any) => p.name === 'pagination').disable()
  })
  const region = page.locator(`[data-block-id="${ids.region}"]`)
  await expect(region).toBeVisible()
  await page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.crud.undoManager.stopCapturing()
    doc.crud.undoManager.clearHistory()
    doc.selection.selectBlock(doc.getBlockById(id))
  }, ids.region)
  const handle = region.locator('[data-handle="south"]')
  const box = await handle.boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.down()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2 + 160, {steps: 8})
  await page.mouse.up()
  await expect.poll(async () => (await geometry(page, ids.region)).inlineHeight).not.toBe('')
  const manual = await geometry(page, ids.region)
  await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.crud.undoManager.stopCapturing()
  })
  await replaceContent(page, ids.paragraph, 30)
  await expect.poll(async () => (await geometry(page, ids.region)).scrollHeight).toBeGreaterThan(manual.height)
  expect((await geometry(page, ids.region)).height).toBe(manual.height)
  await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.crud.undoManager.undo()
    doc.crud.undoManager.undo()
  })
  await expect.poll(async () => (await geometry(page, ids.region)).inlineHeight).toBe('')
  await page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.getBlockById(id).updateProps({width: 400, height: 1600, wr: null, ar: null})
  }, ids.region)
  await expect.poll(async () => (await geometry(page, ids.region)).inlineHeight).toBe('1600px')
  await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.plugins.find((p: any) => p.name === 'pagination').enable()
  })
  await expect.poll(async () => (await geometry(page, ids.region)).height).toBeLessThan(1600)
  await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.plugins.find((p: any) => p.name === 'pagination').disable()
  })
  await expect.poll(async () => (await geometry(page, ids.region)).height).toBe(1600)
})
