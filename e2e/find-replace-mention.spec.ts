import {expect, test} from '@playwright/test'

test('mention search highlights atomic nodes and replaces only surrounding text', async ({page}) => {
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => {
    const editor = document.querySelector('block-craft-editor')
    return !!editor && !!(window as any).ng.getComponent(editor)?.doc?.isInitialized
  })
  const prepared = await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const id = doc.model.getChildrenIds(doc.rootId).find((id: string) => doc.model.getNodeType(id) === 'editable')
    const mention = {insert: {mention: 'MentionNeedle MentionNeedle'}, attributes: {mentionId: 'search-person', mentionType: 'user'}}
    doc.crud.applyTextDelta(id, [
      {delete: doc.model.getTextLength(id)}, mention, {insert: ' MentionNeedle '},
      {insert: {mention: 'MentionNeedle'}, attributes: {mentionId: 'search-doc', mentionType: 'doc'}},
      {insert: ' MentionNeedle'},
    ])
    return {id, mentions: doc.model.getTextDeltas(id).filter((d: any) => typeof d.insert !== 'string')}
  })
  const paragraph = page.locator(`[data-block-id="${prepared.id}"]`)
  await paragraph.click()
  await page.keyboard.press('ControlOrMeta+f')
  const dialog = page.locator('find-replace')
  await dialog.getByPlaceholder('查找', {exact: true}).fill('MentionNeedle')
  await expect(dialog.locator('.match-info')).toHaveText('1/4')
  await expect(dialog.locator('.replace-summary')).toHaveText('其中 2 项无法替换')
  await dialog.locator('.replace-summary span').hover()
  await expect(page.getByText('2 项：Mention 是引用节点，仅支持搜索和高亮，不能替换内容', {exact: true})).toBeVisible()
  await dialog.getByPlaceholder('查找', {exact: true}).hover()
  await expect(dialog.getByRole('button', {name: '替换', exact: true})).toBeDisabled()
  await expect(dialog.getByRole('button', {name: '全部', exact: true})).toBeEnabled()

  // Assert real overlay geometry covers the rendered chip, including its full label.
  await expect.poll(() => page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const helper = doc.plugins.find((p: any) => p.name === 'findReplace').helper
    const match = helper.matchedList[helper.matchIndex]
    const chip = document.querySelector('[data-mention-id="search-person"]')!
    const rect = chip.getBoundingClientRect()
    const fragments: HTMLElement[] = match.fakeRange.fakeSpans.flatMap((span: HTMLElement) => Array.from(span.children))
    return fragments.some(el => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && r.left <= rect.left + 2 && r.right >= rect.right - 2 &&
        r.top <= rect.top + 2 && r.bottom >= rect.bottom - 2 &&
        getComputedStyle(el).backgroundColor !== 'rgba(0, 0, 0, 0)'
    })
  })).toBe(true)

  await dialog.getByPlaceholder('替换为', {exact: true}).fill('changed')
  // The headless entry point must enforce the same protection as the disabled button.
  await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.plugins.find((p: any) => p.name === 'findReplace').helper.replaceOne('forbidden')
  })
  await expect(paragraph.locator('[data-mention-id="search-person"]')).toHaveText('MentionNeedle MentionNeedle')
  await dialog.locator('.nav-btn').last().click()
  await expect(dialog.locator('.match-info')).toHaveText('2/4')
  await expect(dialog.getByRole('button', {name: '替换', exact: true})).toBeEnabled()
  await dialog.getByRole('button', {name: '替换', exact: true}).click()
  await expect(dialog.locator('.match-info')).toContainText('/3')
  await dialog.getByRole('button', {name: '全部', exact: true}).click()
  await expect(dialog.locator('.match-info')).toContainText('/2')
  await expect(dialog.getByRole('button', {name: '替换', exact: true})).toBeDisabled()
  await expect(dialog.getByRole('button', {name: '全部', exact: true})).toBeDisabled()
  const result = await page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const deltas = doc.model.getTextDeltas(id)
    return {
      mentions: deltas.filter((d: any) => typeof d.insert !== 'string'),
      text: deltas.filter((d: any) => typeof d.insert === 'string').map((d: any) => d.insert).join(''),
    }
  }, prepared.id)
  expect(result).toEqual({mentions: prepared.mentions, text: ' changed  changed'})
  await dialog.locator('.close-btn').click()
  await expect(paragraph.locator('.blockcraft-cursor')).toHaveCount(0)
})

test('search counts follow editing and undo without interacting with the dialog', async ({page}) => {
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => !!(window as any).ng.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  const id = await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const id = doc.model.getChildrenIds(doc.rootId).find((id: string) => doc.model.getNodeType(id) === 'editable')
    doc.crud.applyTextDelta(id, [{delete: doc.model.getTextLength(id)}, {insert: 'LiveNeedle'}])
    doc.crud.undoManager.stopCapturing()
    return id
  })
  const paragraph = page.locator(`[data-block-id="${id}"]`)
  await paragraph.click()
  await page.keyboard.press('ControlOrMeta+f')
  const dialog = page.locator('find-replace')
  await dialog.getByPlaceholder('查找', {exact: true}).fill('LiveNeedle')
  await expect(dialog.locator('.match-info')).toHaveText('1/1')

  // All following user input stays in the document, never hovering/clicking the panel.
  await paragraph.click()
  await page.keyboard.press('End')
  await page.keyboard.insertText(' LiveNeedle')
  await expect(dialog.locator('.match-info')).toHaveText('1/2')
  await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.crud.undoManager.stopCapturing()
  })
  await page.keyboard.press('Backspace')
  await expect(dialog.locator('.match-info')).toHaveText('1/1')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(dialog.locator('.match-info')).toHaveText('1/2')
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect(dialog.locator('.match-info')).toHaveText('1/1')

  // Background model update: also refresh protected counts without a UI event.
  await page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.crud.applyTextDelta(id, [{retain: doc.model.getTextLength(id)},
      {insert: {mention: 'LiveNeedle'}, attributes: {mentionId: 'live-person', mentionType: 'user'}}])
  }, id)
  await expect(dialog.locator('.match-info')).toHaveText('1/2')
  await expect(dialog.locator('.replace-summary')).toHaveText('其中 1 项无法替换')
})
