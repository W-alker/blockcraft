import {expect, test, type Page} from '@playwright/test'

test.use({viewport: {width: 2200, height: 1000}})

async function setup(page: Page) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng
    ?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  return page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const divider = doc.schemas.createSnapshot('divider', [])
    const paragraph = doc.schemas.createSnapshot('paragraph', [[
      {insert: '链接原有点击行为', attributes: {'a:link': 'https://example.com'}},
      {insert: ' 普通正文'},
    ]])
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [divider, paragraph])
    doc.crud.undoManager.clearHistory()
    return {divider: divider.id, paragraph: paragraph.id}
  })
}
const toolbar = 'app-divider-style-popup'

test('五档分割线开关生效，链接恢复原点击行为，固定工具栏保留', async ({page}) => {
  const ids = await setup(page)
  const divider = page.locator(`[data-block-id="${ids.divider}"] .bc-block-content`)
  for (const [name, enabled] of [
    ['图文混排', true], ['专注内容', false], ['轻量编辑', false], ['布局调整', true], ['精细设计', true],
  ] as const) {
    await page.getByTestId('editing-experience').getByRole('button', {name, exact: true}).click()
    await divider.click()
    if (enabled) await expect(page.locator(toolbar)).toBeVisible()
    else {
      await page.waitForTimeout(300)
      await expect(page.locator(toolbar)).toHaveCount(0)
      await expect(page.locator(`[data-block-id="${ids.divider}"]`)).not.toHaveClass(/divider-toolbar-active/)
    }
    await expect(page.locator('bc-fixed-toolbar')).toBeVisible()
    // Finish the divider interaction before testing a separate link; the
    // settings panel may legitimately cover the adjacent paragraph.
    await page.evaluate(id => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      doc.getBlockById(id).setInlineRange(0, 0)
    }, ids.paragraph)
    await expect(page.locator(toolbar)).toHaveCount(0)
    await page.locator(`[data-block-id="${ids.paragraph}"] c-element[link] c-text`).click()
    await expect(page.locator('inline-link-toolbar')).toBeVisible()
    await expect(page.locator(toolbar)).toHaveCount(0)
  }
})

test('切档取消旧任务，宿主可覆盖专注开关，切只读收起面板', async ({page}) => {
  const ids = await setup(page)
  await page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.selection.selectBlock(id)
    doc.interaction.setExperience('focus')
    doc.interaction.setExperience('mixed')
  }, ids.divider)
  await page.waitForTimeout(300)
  await expect(page.locator(toolbar)).toHaveCount(0)
  await page.evaluate(ids => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.interaction.configure({experience: 'focus', overrides: {plugins: {dividerToolbar: {enabled: true}}}})
    doc.getBlockById(ids.paragraph).setInlineRange(0, 0)
  }, ids)
  await page.locator(`[data-block-id="${ids.divider}"] .bc-block-content`).click()
  await expect(page.locator(toolbar)).toBeVisible()
  await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.interaction.setOverrides({plugins: {dividerToolbar: {enabled: false}}})
  })
  await expect(page.locator(toolbar)).toHaveCount(0)
  await expect(page.locator(`[data-block-id="${ids.divider}"]`)).not.toHaveClass(/divider-toolbar-active/)
  await page.evaluate(ids => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.interaction.setExperience('mixed')
    doc.getBlockById(ids.paragraph).setInlineRange(0, 0)
    doc.selection.selectBlock(ids.divider)
  }, ids)
  await expect(page.locator(toolbar)).toBeVisible()
  await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.toggleReadonly(true))
  await expect(page.locator(toolbar)).toHaveCount(0)
  await page.evaluate(id => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.selection.selectBlock(id), ids.divider)
  await page.waitForTimeout(300)
  await expect(page.locator(toolbar)).toHaveCount(0)
})

test('混排档仍可修改线型并撤销', async ({page}) => {
  const ids = await setup(page)
  await page.getByTestId('editing-experience').getByRole('button', {name: '图文混排', exact: true}).click()
  const line = page.locator(`[data-block-id="${ids.divider}"] .divide-line`)
  await page.locator(`[data-block-id="${ids.divider}"] .bc-block-content`).click()
  await expect(page.locator(toolbar)).toBeVisible()
  await page.locator(toolbar).getByTitle('虚线', {exact: true}).click()
  await expect(line).toHaveClass(/dashed/)
  await page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.getBlockById(id).setInlineRange(0, 0)
    doc.root.hostElement.focus({preventScroll: true})
  }, ids.paragraph)
  await page.keyboard.press('ControlOrMeta+z')
  await expect(line).toHaveClass(/solid/)
})
