import {expect, test, type Page} from '@playwright/test'

async function initialize(page: Page, empty = false, flavour = 'text-box') {
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => {
    const editor = document.querySelector('block-craft-editor')
    return editor && (window as any).ng.getComponent(editor).doc?.isInitialized
  })
  return page.evaluate(async ({empty, flavour}) => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.crud.deleteBlocks(doc.rootId, 0, doc.model.getChildrenIds(doc.rootId).length, true)
    const paragraph = doc.schemas.createSnapshot('paragraph', [empty ? [] : [{insert: '正文末尾'}]])
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [paragraph])
    const object = doc.schemas.createSnapshot(flavour, ['独立对象文本', {width: 320, height: 160}])
    const objectId = doc.placement.insertAbsoluteSnapshot(object)
    if (!objectId) throw new Error('absolute object was not inserted')
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    doc.crud.undoManager.clearHistory()
    doc.root.hostElement.focus({preventScroll: true})
    doc.selection.setCursorAtBlock(paragraph.id, false, false)
    return {paragraphId: paragraph.id as string, objectId: objectId as string, innerId: (flavour === 'word-art' ? objectId : object.children[0].id) as string}
  }, {empty, flavour})
}

for (const flavour of ['text-box', 'word-art']) {
  for (const empty of [false, true]) {
    test(`Delete at ${empty ? 'empty' : 'nonempty'} ${flavour} flow end preserves absolute text and caret`, async ({page}) => {
      const ids = await initialize(page, empty, flavour)
      const before = await page.evaluate(() => {
        const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
        return doc.exportDocumentSnapshot()
      })
      await page.keyboard.press('Delete')
      await page.keyboard.press('Delete')
      await expect.poll(() => page.evaluate(() => {
        const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
        return doc.exportDocumentSnapshot()
      })).toEqual(before)
      await expect(page.locator(`[data-block-id="${ids.objectId}"]`)).toBeVisible()
      await expect(page.locator(`[data-block-id="${ids.innerId}"]`)).toHaveText('独立对象文本')
      expect(await page.evaluate(({paragraphId}) => {
        const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
        const native = document.getSelection()!
        const host = doc.getBlockById(paragraphId).hostElement
        return {
          id: doc.selection.value.anchor.blockId,
          offset: doc.selection.value.anchor.offset,
          collapsed: native.isCollapsed,
          inside: host.contains(native.anchorNode),
        }
      }, ids)).toEqual({id: ids.paragraphId, offset: empty ? 0 : 4, collapsed: true, inside: true})
    })
  }
}

test('Delete still merges flow paragraphs, supports undo, and edits absolute text internally', async ({page}) => {
  const ids = await initialize(page)
  const secondId = await page.evaluate(({paragraphId}) => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const second = doc.schemas.createSnapshot('paragraph', [[{insert: '第二段'}]])
    doc.crud.insertBlockSnapshots(doc.rootId, 1, [second])
    doc.crud.undoManager.clearHistory()
    doc.selection.setCursorAtBlock(paragraphId, false, false)
    return second.id as string
  }, ids)
  await page.keyboard.press('Delete')
  await expect(page.locator(`[data-block-id="${ids.paragraphId}"]`)).toHaveText('正文末尾第二段')
  await expect(page.locator(`[data-block-id="${secondId}"]`)).toHaveCount(0)
  await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.crud.undoManager.undo()
  })
  await expect(page.locator(`[data-block-id="${secondId}"]`)).toHaveText('第二段')
  await expect(page.locator(`[data-block-id="${ids.paragraphId}"]`)).toHaveText('正文末尾')
  await page.evaluate(({innerId}) => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.selection.setCursorAt(doc.getBlockById(innerId), 0)
  }, ids)
  await page.keyboard.press('Delete')
  await expect(page.locator(`[data-block-id="${ids.innerId}"]`)).toHaveText('立对象文本')
  await expect(page.locator(`[data-block-id="${ids.objectId}"]`)).toBeVisible()
})
