import {expect, test, type Page} from '@playwright/test'

async function setup(page: Page, scale: number) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng
    ?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  const id = await page.evaluate(async scale => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const paragraph = doc.schemas.createSnapshot('paragraph', [
      'Before ZoomNeedle after\nA second ZoomNeedle result\nA long phrase that wraps across several lines in this narrow paragraph.',
    ])
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [paragraph])
    await doc.navigateToBlock(paragraph.id)
    doc.getBlockById(paragraph.id).containerElement.style.width = '240px'
    doc.viewScale.setScale(scale)
    return paragraph.id
  }, scale)
  await page.locator(`[data-block-id="${id}"]`).click()
  await page.keyboard.press('ControlOrMeta+f')
  const dialog = page.locator('find-replace')
  await dialog.getByPlaceholder('查找', {exact: true}).fill('ZoomNeedle')
  await expect(dialog.locator('.match-info')).toHaveText('1/2')
  return dialog
}

async function highlightError(page: Page) {
  return page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const helper = doc.plugins.find((plugin: any) => plugin.name === 'findReplace').helper
    if (!helper.matchedList.length) return 9999
    let error = 0
    for (const match of helper.matchedList) {
      const block = doc.getBlockById(match.blockId ?? match.block.id)
      const range = block.runtime.mapper.modelRangeToDomRange(
        block.containerElement, match.index, match.index + match.length,
      )
      const rects = Array.from(range.getClientRects()) as DOMRect[]
      const parts: HTMLElement[] = match.fakeRange?.fakeSpans
        .flatMap((span: HTMLElement) => Array.from(span.children)) ?? []
      if (!parts.length) return 9999
      for (const rect of rects.filter(rect => rect.width >= 2)) {
        error = Math.max(error, Math.min(...parts.map(part => {
          const actual = part.getBoundingClientRect()
          return Math.max(...(['left', 'top', 'width', 'height'] as const)
            .map(key => Math.abs(actual[key] - rect[key])))
        })))
      }
    }
    return error
  })
}

for (const scale of [0.5, 0.75, 1, 1.25, 1.5, 2]) {
  test(`缩放 ${scale} 后搜索，普通及跨行高亮与文字重合`, async ({page}) => {
    const dialog = await setup(page, scale)
    await expect.poll(() => highlightError(page)).toBeLessThan(1.5)
    await dialog.locator('.nav-btn').last().click()
    await expect(dialog.locator('.match-info')).toHaveText('2/2')
    await expect.poll(() => highlightError(page)).toBeLessThan(1.5)
    await dialog.getByPlaceholder('查找', {exact: true})
      .fill('A long phrase that wraps across several lines in this narrow paragraph.')
    await expect(dialog.locator('.match-info')).toHaveText('1/1')
    await expect.poll(() => highlightError(page)).toBeLessThan(1.5)
    await dialog.locator('.close-btn').click()
    await expect(page.locator('block-craft-editor .blockcraft-cursor')).toHaveCount(0)
  })
}

test('保留搜索结果时连续缩放和滚动，高亮持续对齐', async ({page}) => {
  const dialog = await setup(page, 1)
  // The demo's media/material blocks measure themselves asynchronously; compare
  // the searched paragraph so those unrelated measurements do not affect this check.
  const before = await page.evaluate(() => JSON.stringify((window as any).ng
    .getComponent(document.querySelector('block-craft-editor')).doc.exportSnapshot().children[0]))
  for (const scale of [0.5, 0.75, 1.25, 1.5, 2, 1]) {
    await page.evaluate(scale => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      doc.viewScale.setScale(scale)
      doc.scrollContainer.scrollTop += 20
    }, scale)
    await expect.poll(() => highlightError(page)).toBeLessThan(1.5)
    await expect(dialog.locator('.match-info')).toHaveText('1/2')
  }
  expect(await page.evaluate(() => JSON.stringify((window as any).ng
    .getComponent(document.querySelector('block-craft-editor')).doc.exportSnapshot().children[0]))).toBe(before)
})

for (const scale of [0.5, 2]) {
  test(`缩放 ${scale}：共享文本伪光标保留最小宽度和定位`, async ({page}) => {
    const dialog = await setup(page, scale)
    await dialog.locator('.close-btn').click()
    const geometry = await page.evaluate(() => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      const id = doc.model.getChildrenIds(doc.rootId)[0]
      const block = doc.getBlockById(id)
      const fake = doc.selection.createFakeRange({
        anchor: {blockId: id, type: 'text', offset: 3},
        head: {blockId: id, type: 'text', offset: 3},
        commonParent: doc.rootId,
      }, {minCursorWidth: 3})
      const expected = block.runtime.mapper.modelRangeToDomRange(block.containerElement, 3).getBoundingClientRect()
      const actual = fake.fakeSpans[0].firstElementChild.getBoundingClientRect()
      const result = {
        error: Math.max(Math.abs(actual.left - expected.left), Math.abs(actual.top - expected.top),
          Math.abs(actual.height - expected.height)),
        width: actual.width,
      }
      fake.destroy()
      return result
    })
    expect(geometry.error).toBeLessThan(1.5)
    expect(geometry.width).toBeCloseTo(3 * scale, 1)
    await expect(page.locator('block-craft-editor .blockcraft-cursor')).toHaveCount(0)
  })
}
