import {expect, test} from '@playwright/test'

test('opens Mention at a Revision c-element attribution boundary', async ({page}) => {
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.getByRole('button', {name: '开启修订', exact: true}).click()

  const paragraph = page.locator('block-craft-editor p.paragraph-block').nth(1)
  await expect(paragraph).toBeVisible()
  await paragraph.evaluate(element => {
    const editor = element.closest('block-craft-editor')!
    const doc = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng.getComponent(editor).doc
    const block = doc.getBlockById(element.getAttribute('data-block-id'))
    doc.selection.setCursorAt(block, block.textLength)
  })
  await page.keyboard.type(' REVISION_MENTION ')

  // A different actor guarantees that the @ trigger starts in a new Revision
  // attribution run next to the existing pending insertion.
  await paragraph.evaluate(element => {
    const editor = element.closest('block-craft-editor')!
    const doc = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng.getComponent(editor).doc
    const block = doc.getBlockById(element.getAttribute('data-block-id'))
    doc.revisions.setActor({actorId: 'mention-author', displayName: 'Mention Author'})
    doc.selection.setCursorAt(block, block.textLength)
  })

  await page.keyboard.type('@')

  await expect(page.locator('mention-dialog')).toBeVisible()
  await expect(paragraph.locator(
    'c-element[data-bc-revision-kind="insert"]' +
    '[data-bc-revision-state="pending"]',
  ).filter({hasText: '@'})).toHaveCount(1)
})
