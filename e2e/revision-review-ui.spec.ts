import {expect, test} from '@playwright/test'

test('Playground exposes the optional revision popover and virtual review panel', async ({page}) => {
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.getByRole('button', {name: '开启修订', exact: true}).click()

  const paragraph = page.locator('block-craft-editor p.paragraph-block').first()
  await expect(paragraph).toBeVisible()
  const secondParagraph = page.locator('block-craft-editor p.paragraph-block').nth(1)
  await expect(secondParagraph).toBeVisible()
  await secondParagraph.evaluate(element => {
    const editor = element.closest('block-craft-editor')!
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor).doc
    const block = doc.getBlockById(element.getAttribute('data-block-id'))
    doc.selection.setCursorAt(block, block.textLength)
  })
  await page.keyboard.type(' REVIEW_UI')

  const marker = page.locator(
    'block-craft-editor c-element[data-bc-revision-kind="insert"]' +
    '[data-bc-revision-state="pending"]',
  ).filter({hasText: 'REVIEW_UI'})
  await expect(marker).toHaveCount(1)

  const revisionContent = await page.locator('playground-home').evaluate(root => {
    const app = (window as unknown as {
      ng: {getComponent: (target: Element) => any}
    }).ng.getComponent(root)
    const item = app.revisionReviewPlugin.state$.value.items[0]
    return app.revisionReviewPlugin.readContent(item.id)
  })
  expect(revisionContent.map((segment: {text: string}) => segment.text))
    .toEqual([' REVIEW_UI'])

  await paragraph.evaluate(element => {
    const editor = element.closest('block-craft-editor')!
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor).doc
    const block = doc.getBlockById(element.getAttribute('data-block-id'))
    doc.selection.setCursorAt(block, block.textLength)
  })
  await page.keyboard.type(' NEXT_UI')

  const nextMarker = page.locator(
    'block-craft-editor c-element[data-bc-revision-kind="insert"]' +
    '[data-bc-revision-state="pending"]',
  ).filter({hasText: 'NEXT_UI'})
  await expect(nextMarker).toHaveCount(1)

  await page.getByRole('button', {name: '打开修订面板', exact: true}).click()
  const panel = page.getByRole('complementary', {name: '修订评审面板'})
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('2 组记录')
  await expect(panel.locator('.revision-card')).toHaveCount(2)
  expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)

  const firstCard = panel.locator('.revision-card').filter({hasText: 'REVIEW_UI'})
  const secondCard = panel.locator('.revision-card').filter({hasText: 'NEXT_UI'})
  const popovers = page.locator('bc-revision-review-popover')
  await expect(firstCard).toHaveCount(1)
  await expect(secondCard).toHaveCount(1)
  expect((await firstCard.boundingBox())?.height).toBeLessThanOrEqual(90)
  const nextCardButton = firstCard.getByRole('button', {name: '下一条修订'})
  await expect(nextCardButton.locator('.bc_chevron-left')).toHaveCount(1)
  expect((await nextCardButton.textContent())?.trim()).toBe('')

  const documentScroller = page.locator('block-craft-editor .editor-container')
  const beforeScrollTop = await documentScroller.evaluate(element => element.scrollTop)
  const beforeCardBox = await firstCard.boundingBox()
  const beforeMarkerBox = await marker.boundingBox()
  await panel.evaluate(element => element.dispatchEvent(new WheelEvent('wheel', {
    deltaY: 32,
    bubbles: true,
    cancelable: true,
  })))
  await expect.poll(() => documentScroller.evaluate(element => element.scrollTop))
    .toBeGreaterThan(beforeScrollTop)
  const afterCardBox = await firstCard.boundingBox()
  const afterMarkerBox = await marker.boundingBox()
  expect(beforeCardBox && beforeMarkerBox && afterCardBox && afterMarkerBox).toBeTruthy()
  expect(Math.abs(
    (afterCardBox!.y - beforeCardBox!.y) -
    (afterMarkerBox!.y - beforeMarkerBox!.y),
  )).toBeLessThan(2.5)

  await firstCard.getByRole('button', {name: '下一条修订'})
    .evaluate((button: HTMLButtonElement) => button.click())
  await expect(popovers).toHaveCount(1)
  await secondCard.getByRole('button', {name: '上一条修订'})
    .evaluate((button: HTMLButtonElement) => button.click())
  await expect(popovers).toHaveCount(1)
  await firstCard.getByRole('button', {name: '下一条修订'})
    .evaluate((button: HTMLButtonElement) => button.click())
  await expect(popovers).toHaveCount(1)

  await marker.click()
  const popover = page.getByRole('toolbar', {name: '当前修订快捷操作'})
  await expect(popover).toBeVisible()
  await expect(popovers).toHaveCount(1)
  await expect(popover).toContainText('Playground 调试用户')
  await expect(popover.locator('time')).toHaveAttribute('datetime', /.+/)
  await expect(popover.locator('time')).toContainText(/\d{2}-\d{2} \d{2}:\d{2}/)
  await expect(popover).not.toContainText('新增文字')
  await expect(popover.getByRole('button', {name: '上一条修订'})).toHaveCount(0)
  await expect(popover.getByRole('button', {name: '下一条修订'})).toHaveCount(0)
  expect((await popover.boundingBox())?.height).toBeLessThanOrEqual(40)
  const keepButton = popover.getByRole('button', {name: '接收修订', exact: true})
  await expect(keepButton).toBeEnabled()
  await expect(keepButton.locator('.bc_check-ok')).toHaveCount(1)
  await keepButton.hover()
  await expect(page.locator('cs-tooltip-overlay').filter({hasText: '接收修订'}))
    .toBeVisible()

  await keepButton.click()
  await expect(panel).toContainText('已接收')
})
