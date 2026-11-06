import {expect, test} from '@playwright/test'

for (const mode of ['selected-forward', 'selected-backward', 'boundary-text'] as const) {
  test(`divider and paragraph ${mode} selection can form columns`, async ({page}) => {
    await page.goto('/')
    await page.getByRole('button', {name: '初始化', exact: true}).click()
    await page.waitForFunction(() => {
      const host = document.querySelector('block-craft-editor')
      return host && (window as any).ng?.getComponent(host)?.doc?.isInitialized
    })

    const ids = await page.evaluate(selectionMode => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      const divider = doc.schemas.createSnapshot('divider', [])
      const paragraph = doc.schemas.createSnapshot('paragraph', ['分割线旁的段落'])
      doc.crud.insertBlockSnapshots(doc.rootId, 0, [divider, paragraph])
      doc.virtualization?.ensureViewMounted([divider.id, paragraph.id])
      const dividerPoint = {blockId: divider.id, type: 'selected'}
      const textPoint = {blockId: paragraph.id, type: 'text', offset: 2}
      doc.selection.replay({
        anchor: selectionMode === 'boundary-text'
          ? {blockId: doc.rootId, type: 'boundary', index: 0}
          : selectionMode === 'selected-backward' ? textPoint : dividerPoint,
        head: selectionMode === 'selected-backward' ? dividerPoint : textPoint,
        commonParent: doc.rootId,
      })
      return [divider.id, paragraph.id]
    }, mode)

    const button = page.locator('bc-fixed-toolbar button[title="分栏"]')
    await expect(button).toBeEnabled()
    await button.hover()
    await page.locator('.bc-column-count-picker-cell').nth(1).click()

    await expect.poll(() => page.evaluate(blockIds => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      return blockIds.map(id => doc.model.getFlavour(doc.model.getParentId(id)))
    }, ids)).toEqual(['column', 'column'])
  })
}

test('pointer mixed selection of divider and paragraph enables columns', async ({page}) => {
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  const ids = await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const divider = doc.schemas.createSnapshot('divider', [])
    const paragraph = doc.schemas.createSnapshot('paragraph', ['分割线旁的段落'])
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [divider, paragraph])
    return [divider.id, paragraph.id]
  })
  const divider = page.locator(`[data-block-id="${ids[0]}"]`)
  const paragraph = page.locator(`[data-block-id="${ids[1]}"]`)
  await divider.click()
  await paragraph.click({modifiers: ['Shift']})
  await expect.poll(() => page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    return doc.selection.value?.start.type
  })).toBe('boundary')

  const button = page.locator('bc-fixed-toolbar button[title="分栏"]')
  await expect(button).toBeEnabled()
  await button.hover()
  await page.locator('.bc-column-count-picker-cell').nth(1).click()
  await expect.poll(() => page.evaluate(blockIds => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    return blockIds.map(id => doc.model.getFlavour(doc.model.getParentId(id)))
  }, ids)).toEqual(['column', 'column'])
})
