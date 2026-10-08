import {expect, test, type Page} from '@playwright/test'

test.use({viewport: {width: 2200, height: 1000}})

async function start(page: Page) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() =>
    (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
}

async function setRange(page: Page, blockId: string, start: number, end = start) {
  await page.locator('block-craft-editor').evaluate((editor, range) => {
    const doc = (window as any).ng.getComponent(editor).doc
    doc.selection.setSelection(
      {blockId: range.blockId, type: 'text', offset: range.start},
      {blockId: range.blockId, type: 'text', offset: range.end},
    )
  }, {blockId, start, end})
}

async function fontSize(page: Page, blockId: string) {
  return page.locator(`block-craft-editor [data-block-id="${blockId}"]`).evaluate(element => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      if (walker.currentNode.textContent?.includes('字号验证')) {
        return parseFloat(getComputedStyle(walker.currentNode.parentElement!).fontSize)
      }
    }
    throw new Error('字号验证文本未渲染')
  })
}

test('caret reflects paragraph and inline scales without rewriting stored formatting', async ({page}) => {
  await start(page)
  const cases = [
    {paragraph: null, inline: null, label: '1×', size: 16},
    {paragraph: 2.8, inline: null, label: '2.8×', size: 44.8},
    {paragraph: null, inline: 2.8, label: '2.8×', size: 44.8},
    {paragraph: 2, inline: 1.25, label: '2.5×', size: 40},
    {paragraph: 3, inline: 1.5, label: '4.5×', size: 72},
  ]
  const ids = await page.locator('block-craft-editor').evaluate(async (editor, cases) => {
    const doc = (window as any).ng.getComponent(editor).doc
    const snapshots = cases.map(item => doc.schemas.createSnapshot('paragraph', [[{
      insert: '字号验证文本',
      ...(item.inline === null ? {} : {attributes: {'t:fs': item.inline}}),
    }]]))
    doc.crud.insertBlockSnapshots(doc.rootId, 0, snapshots)
    cases.forEach((item, index) => {
      if (item.paragraph !== null) doc.crud.updateBlockProps(snapshots[index].id, {pfs: item.paragraph})
    })
    await doc.navigateToBlock(snapshots[0].id)
    return snapshots.map((snapshot: any) => snapshot.id) as string[]
  }, cases)

  const control = page.locator('bc-fixed-toolbar .toolbar-btn--font-size')
  for (const [index, item] of cases.entries()) {
    // 点击真实文字，再用方向键进入文本，覆盖原生选区 -> 模型 -> OnPush 回显。
    await page.locator(`block-craft-editor [data-block-id="${ids[index]}"]`).click()
    await page.keyboard.press('ArrowLeft')
    await expect(control).toHaveText(item.label)
    expect(await fontSize(page, ids[index])).toBeCloseTo(item.size, 1)
  }

  // 全段格式目标仍回显段落倍率，局部范围仍回显行内倍率。
  await setRange(page, ids[3], 0, 6)
  await expect(control).toHaveText('2×')
  await setRange(page, ids[3], 1, 3)
  await expect(control).toHaveText('1.25×')

  const stored = await page.locator('block-craft-editor').evaluate((editor, ids) => {
    const doc = (window as any).ng.getComponent(editor).doc
    return ids.map(id => ({
      pfs: doc.model.getProps(id).pfs ?? null,
      fs: doc.model.getTextDeltas(id)[0].attributes?.['t:fs'] ?? null,
    }))
  }, ids)
  expect(stored).toEqual(cases.map(item => ({pfs: item.paragraph, fs: item.inline})))
})

test('caret font command keeps its relative insert scale after paragraph-aware display', async ({page}) => {
  await start(page)
  const id = await page.locator('block-craft-editor').evaluate(async editor => {
    const doc = (window as any).ng.getComponent(editor).doc
    const snapshot = doc.schemas.createSnapshot('paragraph', ['字号验证文本'])
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot])
    // 使用实际整段字号命令设置 2.8，而非直接修改行内属性。
    doc.selection.setSelection(
      {blockId: snapshot.id, type: 'text', offset: 0},
      {blockId: snapshot.id, type: 'text', offset: 6},
    )
    const toolbar = (window as any).ng.getComponent(document.querySelector('bc-fixed-toolbar'))
    toolbar.toolbarHelper.formatTypography({fontScale: 2.8})
    await doc.navigateToBlock(snapshot.id)
    return snapshot.id as string
  })

  await setRange(page, id, 3)
  const control = page.locator('bc-fixed-toolbar .toolbar-btn--font-size')
  await expect(control).toHaveText('2.8×')
  await control.hover()
  await page.locator('bc-float-toolbar-item').filter({hasText: /^1\.25×$/}).click()
  await expect(control).toHaveText('3.5×')

  const state = await page.locator('block-craft-editor').evaluate((editor, id) => {
    const doc = (window as any).ng.getComponent(editor).doc
    return {
      pfs: doc.model.getProps(id).pfs,
      delta: doc.model.getTextDeltas(id),
      pending: doc.inputManger.peekNextInsertAttrs({blockId: id, index: 3}),
    }
  }, id)
  expect(state.pfs).toBe(2.8)
  expect(state.delta).toEqual([{insert: '字号验证文本'}])
  expect(state.pending['t:fs']).toBe(1.25)
  expect(await fontSize(page, id)).toBeCloseTo(44.8, 1)

  await page.keyboard.type('X')
  await expect(control).toHaveText('3.5×')
  await expect.poll(() => page.locator('block-craft-editor').evaluate((editor, id) => {
    const doc = (window as any).ng.getComponent(editor).doc
    return doc.model.getTextDeltas(id).find((delta: any) => delta.insert === 'X')?.attributes?.['t:fs']
  }, id)).toBe(1.25)
  const insertedSize = await page.locator(`block-craft-editor [data-block-id="${id}"]`).evaluate(element => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      if (walker.currentNode.textContent === 'X') {
        return parseFloat(getComputedStyle(walker.currentNode.parentElement!).fontSize)
      }
    }
    throw new Error('新输入的文字未渲染')
  })
  expect(insertedSize).toBeCloseTo(56, 1)
})
