import {expect, test, type Page} from '@playwright/test'

async function pickColumns(page: Page, count: number) {
  const button = page.locator('bc-fixed-toolbar button[title="分栏"]')
  await expect(button).toBeEnabled()
  await button.hover()
  await page.locator('.bc-column-count-picker-cell').nth(count - 1).click()
}

for (const selectionKind of ['selected', 'boundary'] as const) {
  test(`flow text boxes can form and dissolve columns with ${selectionKind} selection`, async ({page}) => {
    await page.goto('/')
    await page.getByRole('button', {name: '初始化', exact: true}).click()
    await page.waitForFunction(() => {
      const host = document.querySelector('block-craft-editor')
      return host && (window as any).ng?.getComponent(host)?.doc?.isInitialized
    })
    const ids = await page.evaluate(kind => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      const boxes = ['左栏文本', '右栏文本'].map(text =>
        doc.schemas.createSnapshot('text-box', [text, {width: 220, height: 120}]),
      )
      doc.crud.insertBlockSnapshots(doc.rootId, 0, boxes)
      doc.virtualization?.ensureViewMounted(boxes.map((box: any) => box.id))
      doc.selection.replay({
        anchor: kind === 'boundary'
          ? {blockId: doc.rootId, type: 'boundary', index: 0}
          : {blockId: boxes[0].id, type: 'selected'},
        head: kind === 'boundary'
          ? {blockId: doc.rootId, type: 'boundary', index: 2}
          : {blockId: boxes[1].id, type: 'selected'},
        commonParent: doc.rootId,
      })
      doc.crud.undoManager.clearHistory()
      return boxes.map((box: any) => box.id) as string[]
    }, selectionKind)

    const first = page.locator(`[data-block-id="${ids[0]}"]`)
    const second = page.locator(`[data-block-id="${ids[1]}"]`)
    const readParents = () => page.evaluate(blockIds => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      return blockIds.map(id => doc.model.getFlavour(doc.model.getParentId(id)))
    }, ids)
    await expect.poll(readParents).toEqual(['root', 'root'])
    const before = await Promise.all([first.boundingBox(), second.boundingBox()])
    expect(before[1]!.y).toBeGreaterThan(before[0]!.y)

    await pickColumns(page, 2)
    await expect.poll(readParents).toEqual(['column', 'column'])
    await expect(first).toContainText('左栏文本')
    await expect(second).toContainText('右栏文本')
    await expect.poll(async () => {
      const [left, right] = await Promise.all([first.boundingBox(), second.boundingBox()])
      return !!left && !!right && Math.abs(left.y - right.y) < 2 && right.x >= left.x + left.width
    }).toBe(true)

    await page.evaluate(() => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      doc.crud.undoManager.undo()
    })
    await expect.poll(readParents).toEqual(['root', 'root'])
    await expect(first).toContainText('左栏文本')
    await expect(second).toContainText('右栏文本')
    await page.evaluate(() => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      doc.crud.undoManager.redo()
    })
    await expect.poll(readParents).toEqual(['column', 'column'])

    // Existing columns must also be adjustable when a whole text-box frame is selected.
    await page.evaluate(id => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      doc.selection.selectBlock(doc.getBlockById(id))
    }, ids[0])
    await pickColumns(page, 1)
    await expect.poll(readParents).toEqual(['root', 'root'])
    const after = await Promise.all([first.boundingBox(), second.boundingBox()])
    expect(after[1]!.y).toBeGreaterThan(after[0]!.y)
    await expect(first).toContainText('左栏文本')
    await expect(second).toContainText('右栏文本')
  })
}
