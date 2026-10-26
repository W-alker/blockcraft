import {expect, test, type Page} from '@playwright/test'

test.use({viewport: {width: 2200, height: 1000}})

async function start(page: Page) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() =>
    (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
}

async function readBlocks(page: Page, ids: string[]) {
  return page.evaluate(ids => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    return ids.map(id => ({
      id,
      props: {...doc.model.getProps(id)},
      deltas: doc.model.getTextDeltas(id),
      heading: doc.getBlockById(id).hostElement.getAttribute('data-heading'),
    }))
  }, ids)
}

test('selected callout formats its paragraphs through the fixed toolbar', async ({page}) => {
  await start(page)
  const ids = await page.evaluate(async () => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const p1 = doc.schemas.createSnapshot('paragraph', ['容器文字一'])
    const p2 = doc.schemas.createSnapshot('paragraph', ['容器文字二'])
    const outside = doc.schemas.createSnapshot('paragraph', ['外部文字'])
    const callout = doc.schemas.createSnapshot('callout', [])
    callout.children = [p1, p2]
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [callout, outside])
    await doc.navigateToBlock(callout.id)
    doc.selection.selectBlock(callout.id)
    return {callout: callout.id, inside: [p1.id, p2.id], outside: outside.id}
  })

  const toolbar = page.locator('bc-fixed-toolbar')
  await expect(page.locator(`[data-block-id="${ids.callout}"]`)).toHaveClass(/selected/)
  await expect(toolbar.locator('.toolbar-btn--style')).toBeEnabled()
  await expect(toolbar.getByRole('button', { name: '加粗', exact: true })).toBeEnabled()
  await expect(toolbar.getByTitle('行距：默认')).toBeEnabled()

  await toolbar.getByRole('button', { name: '加粗', exact: true }).click()
  await expect.poll(async () => (await readBlocks(page, ids.inside)).every(block =>
    block.deltas[0]?.attributes?.['a:bold'] === true)).toBe(true)

  await toolbar.locator('.toolbar-btn--style').click()
  await page.locator('bc-float-toolbar-item').filter({hasText: '二级标题'}).click()
  await expect.poll(async () => (await readBlocks(page, ids.inside)).every(block =>
    block.props.heading === 2 && block.heading === '2')).toBe(true)
  await toolbar.getByTitle('字号').hover()
  await page.locator('bc-float-toolbar-item').filter({hasText: /^24$/}).click()
  await expect.poll(async () => (await readBlocks(page, ids.inside)).every(block =>
    block.props.fs === 24)).toBe(true)
  expect((await readBlocks(page, [ids.outside]))[0].props.heading).toBeUndefined()
  expect((await readBlocks(page, [ids.outside]))[0].props.fs).toBeUndefined()
})

test('table-cell rectangle formats only selected cells', async ({page}) => {
  await start(page)
  const ids = await page.evaluate(async () => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const table = doc.schemas.createSnapshot('table', [2, 2])
    const paragraphs: string[][] = []
    const cells: string[][] = []
    for (let row = 0; row < 2; row++) {
      paragraphs[row] = []
      cells[row] = []
      for (let column = 0; column < 2; column++) {
        const paragraph = doc.schemas.createSnapshot('paragraph', [`单元格 ${row}${column}`])
        table.children[row].children[column].children = [paragraph]
        paragraphs[row][column] = paragraph.id
        cells[row][column] = table.children[row].children[column].id
      }
    }
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [table])
    await doc.navigateToBlock(table.id)
    doc.selection.setTableCellSelection(table.id, cells[0][0], cells[1][0])
    return {selected: [paragraphs[0][0], paragraphs[1][0]],
      unselected: [paragraphs[0][1], paragraphs[1][1]]}
  })

  const toolbar = page.locator('bc-fixed-toolbar')
  await expect(toolbar.locator('.toolbar-btn--style')).toBeEnabled()
  await expect(toolbar.getByRole('button', { name: '加粗', exact: true })).toBeEnabled()
  await toolbar.getByRole('button', { name: '加粗', exact: true }).click()
  await expect.poll(async () => (await readBlocks(page, ids.selected)).every(block =>
    block.deltas[0]?.attributes?.['a:bold'] === true)).toBe(true)
  expect((await readBlocks(page, ids.unselected)).every(block =>
    !block.deltas[0]?.attributes?.['a:bold'])).toBe(true)

  await expect.poll(() => page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    return doc.selection.value?.getTableCellSelection?.() ?? null
  })).not.toBeNull()
  await expect(toolbar.locator('.toolbar-btn--style')).toBeEnabled()

  await toolbar.locator('.toolbar-btn--style').hover()
  await page.locator('bc-float-toolbar-item').filter({hasText: '一级标题'}).click()
  await expect.poll(async () => (await readBlocks(page, ids.selected)).every(block =>
    block.props.heading === 1 && block.heading === '1')).toBe(true)
  await toolbar.getByTitle('行距：默认').hover()
  await page.locator('bc-float-toolbar-item').filter({hasText: '2 倍'}).click()
  await expect.poll(async () => (await readBlocks(page, ids.selected)).every(block =>
    block.props.lh === 2)).toBe(true)
  expect((await readBlocks(page, ids.unselected)).every(block =>
    !block.props.heading && !block.props.lh)).toBe(true)
})
