import {expect, test, type Page} from '@playwright/test'

test.use({viewport: {width: 2200, height: 1000}})

async function setup(page: Page, empty = false) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng
    ?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  return page.evaluate(async empty => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const paragraphs = [empty ? '' : '抓手第一段文字', '抓手第二段文字', '范围外段落']
      .map(text => doc.schemas.createSnapshot('paragraph', [text]))
    doc.crud.insertBlockSnapshots(doc.rootId, 0, paragraphs)
    await doc.navigateToBlock(paragraphs[0].id)
    doc.crud.undoManager.clearHistory()
    return paragraphs.map(block => block.id) as string[]
  }, empty)
}

async function clickHandle(page: Page, id: string) {
  await page.locator(`block-craft-editor [data-block-id="${id}"]`).hover()
  await expect.poll(() => page.locator('bc-drag-handle').evaluate(element =>
    (window as any).ng.getComponent(element).activeBlock?.id)).toBe(id)
  await page.locator('bc-drag-handle .btn').click()
}

async function state(page: Page, ids: string[]) {
  return page.evaluate(ids => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    return {
      selection: doc.selection.value?.toJSON(),
      blocks: ids.map(id => ({
        props: doc.model.getProps(id), deltas: doc.model.getTextDeltas(id),
        fontSize: getComputedStyle(doc.getBlockById(id).hostElement.querySelector('c-text') ?? doc.getBlockById(id).hostElement).fontSize,
      })),
    }
  }, ids)
}

for (const multi of [false, true]) {
  test(`抓手选中${multi ? '多段' : '单段'}后顶部文本工具可用且只格式化所选段落`, async ({page}) => {
    const ids = await setup(page)
    if (multi) await page.evaluate(ids => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      doc.selection.setSelection(
        {blockId: ids[0], type: 'text', offset: 2},
        {blockId: ids[1], type: 'text', offset: 4},
      )
    }, ids)
    await clickHandle(page, ids[multi ? 1 : 0])
    const toolbar = page.locator('bc-fixed-toolbar')
    const bold = toolbar.getByRole('button', {name: '加粗', exact: true})
    await expect(bold).toBeEnabled()
    await expect(toolbar.locator('.toolbar-btn--style')).toBeEnabled()
    await expect(toolbar.locator('.toolbar-btn--font-size')).toBeEnabled()
    await expect(toolbar.getByTitle('行距：默认')).toBeEnabled()
    const count = multi ? 2 : 1
    const selected = ids.slice(0, count)
    const selection = {anchor: {blockId: ids[0], type: 'selected'}, head: {blockId: ids[count - 1], type: 'selected'}}
    await expect.poll(() => state(page, ids)).toMatchObject({selection})
    await bold.click()
    await expect.poll(async () => (await state(page, selected)).blocks.every(block =>
      block.deltas.every((delta: any) => delta.attributes?.['a:bold'] === true))).toBe(true)
    await expect.poll(() => state(page, ids)).toMatchObject({selection})
    await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.crud.undoManager.undo())
    await expect.poll(async () => (await state(page, selected)).blocks.every(block =>
      block.deltas.every((delta: any) => !delta.attributes?.['a:bold']))).toBe(true)
    await expect.poll(() => state(page, ids)).toMatchObject({selection})
    await toolbar.locator('.toolbar-btn--font-size').hover()
    await page.locator('bc-float-toolbar-item').filter({hasText: /^24$/}).click()
    await expect.poll(async () => (await state(page, selected)).blocks.every(block =>
      block.props.fs === 24 && block.fontSize === '24px')).toBe(true)
    const outside = (await state(page, ids.slice(count))).blocks
    expect(outside.every(block => !block.props.fs && block.deltas.every((delta: any) => !delta.attributes?.['a:bold']))).toBe(true)
  })
}

test('空段落抓手选中后可设置段落默认格式，锁定后文本工具仍禁用', async ({page}) => {
  const ids = await setup(page, true)
  await clickHandle(page, ids[0])
  const bold = page.locator('bc-fixed-toolbar').getByRole('button', {name: '加粗', exact: true})
  await expect(bold).toBeEnabled()
  await bold.click()
  await expect.poll(async () => (await state(page, [ids[0]])).blocks[0].props.textDefaults?.['a:bold']).toBe(true)
  await page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.setBlockReadonly(doc.getBlockById(id), true)
  }, ids[0])
  await clickHandle(page, ids[0])
  await expect(bold).toBeDisabled()
})
