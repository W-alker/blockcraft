import {expect, test, type Page} from '@playwright/test'

test.use({viewport: {width: 2200, height: 1000}})

async function setup(page: Page) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  return page.evaluate(async () => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const snapshot = doc.schemas.createSnapshot('table', [3, 3, [['甲', '乙', '丙'], ['丁', '戊', '己'], ['庚', '辛', '壬']]])
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot])
    await doc.navigateToBlock(snapshot.id)
    doc.crud.undoManager.clearHistory()
    ;(window as any).tableExperience = {doc, table: doc.getBlockById(snapshot.id)}
    return snapshot.id
  })
}

test('轻量档正文输入不弹表格菜单，选行可操作且支持撤销，专注关闭菜单', async ({page}) => {
  const id = await setup(page)
  const table = page.locator(`[data-block-id="${id}"]`)
  const text = table.locator('.edit-container').first()
  const toolbar = page.locator('.cdk-overlay-pane table-structure-toolbar')
  const profile = page.getByTestId('editing-experience')
  await profile.getByRole('button', {name: '轻量编辑', exact: true}).click()
  await text.click()
  await page.keyboard.type('LIGHT')
  await expect(text).toContainText('LIGHT')
  await expect(toolbar).toHaveCount(0)
  await expect(page.locator('bc-fixed-toolbar')).toBeVisible()
  await table.locator('table-row-bar .handle[data-index="0"] .handle-line').click()
  await expect(toolbar).toBeVisible()
  await toolbar.locator('button').filter({has: page.locator('i.bc_xiajiantou-jia')}).click()
  await expect.poll(() => page.evaluate(() => (window as any).tableExperience.table.rowLength)).toBe(4)
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(() => page.evaluate(() => (window as any).tableExperience.table.rowLength)).toBe(3)
  await text.click()
  await expect(toolbar).toHaveCount(0)
  await profile.getByRole('button', {name: '图文混排', exact: true}).click()
  await text.click()
  await expect(toolbar).toBeVisible()
  await profile.getByRole('button', {name: '专注内容', exact: true}).click()
  await expect(toolbar).toHaveCount(0)
  await text.click()
  await page.keyboard.type('FOCUS')
  await expect(text).toContainText('FOCUS')
  await expect(toolbar).toHaveCount(0)
})

test('全屏与普通态共用策略，切换开关保持表格选区和内容', async ({page}) => {
  const id = await setup(page)
  const table = page.locator(`[data-block-id="${id}"]`)
  await table.locator('.edit-container').first().click()
  await expect(page.locator('.cdk-overlay-pane table-structure-toolbar')).toBeVisible()
  await page.evaluate(() => (window as any).tableExperience.table.toggleFullscreen())
  const inlineMenu = table.locator('.bc-table-fullscreen-menu')
  await expect(inlineMenu).toHaveClass(/is-visible/)
  await page.evaluate(() => {
    const {doc} = (window as any).tableExperience
    doc.interaction.configure({preset: 'mixed', overrides: {plugins: {tableToolbar: {textFocus: false}}}})
  })
  await expect(inlineMenu).not.toHaveClass(/is-visible/)
  await page.evaluate(() => {
    const p = (window as any).tableExperience
    p.doc.selection.setTableCellSelection(p.table, p.table.getCellByCoordinate(0, 0), p.table.getCellByCoordinate(1, 1))
    p.before = JSON.stringify(p.doc.exportSnapshot())
    p.selection = p.doc.selection.value.toJSON()
  })
  await expect(inlineMenu).toHaveClass(/is-visible/)
  await page.evaluate(() => (window as any).tableExperience.doc.interaction.setOverrides({plugins: {tableToolbar: {enabled: false}}}))
  await expect(inlineMenu).not.toHaveClass(/is-visible/)
  expect(await page.evaluate(() => {
    const p = (window as any).tableExperience
    return {content: p.before === JSON.stringify(p.doc.exportSnapshot()), selection: JSON.stringify(p.selection) === JSON.stringify(p.doc.selection.value.toJSON())}
  })).toEqual({content: true, selection: true})
  await page.evaluate(() => (window as any).tableExperience.doc.interaction.set('design'))
  await expect(inlineMenu).toHaveClass(/is-visible/)
  await page.evaluate(() => (window as any).tableExperience.doc.toggleReadonly(true))
  await expect(inlineMenu).not.toHaveClass(/is-visible/)
  await page.evaluate(() => (window as any).tableExperience.table.toggleFullscreen())
  await expect(page.locator('.cdk-overlay-pane table-structure-toolbar')).toHaveCount(0)
})
