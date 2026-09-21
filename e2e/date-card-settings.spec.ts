import {test, expect, type Page} from '@playwright/test'

async function setup(page: Page, style = 'masthead', draft = false) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  return page.evaluate(async ({style, draft}) => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const snap = doc.schemas.createSnapshot('date-card', [])
    snap.props = {style, date: '2026-09-21T10:00', ...(draft ? {fg: '#112233', bg: '#eeeeee'} : {})}
    if (draft) snap.meta = {...snap.meta, 'draft:style': style}
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [snap])
    await doc.navigateToBlock(snap.id)
    doc.selection.selectBlock(doc.getBlockById(snap.id))
    return snap.id as string
  }, {style, draft})
}
const card = (page: Page, id: string) => page.locator(`block-craft-editor [data-block-id="${id}"]`)
const dialog = (page: Page) => page.getByRole('dialog', {name: '日期设置', exact: true})
async function open(page: Page, id: string) {
  await card(page, id).hover()
  await card(page, id).getByRole('button', {name: '日期设置', exact: true}).click()
  await expect(dialog(page)).toBeVisible()
}
async function select(page: Page, label: string, option: string) {
  await dialog(page).getByRole('combobox', {name: label, exact: true}).click()
  await page.getByRole('listbox').getByRole('option', {name: option, exact: true}).click()
}
async function pick(page: Page, label: string, color: string) {
  await dialog(page).locator(`cs-color-picker[aria-label="${label}"]`).getByRole('button').click()
  await page.getByRole('radio', {name: color, exact: true}).first().click()
}
async function snapshot(page: Page, id: string) {
  return page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    return JSON.parse(JSON.stringify(doc.getBlockById(id).toSnapshot(false)))
  }, id)
}
async function undo(page: Page, redo = false) {
  await page.evaluate(redo => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    redo ? doc.crud.undoManager.redo() : doc.crud.undoManager.undo()
  }, redo)
}

test('无侧栏入口：取色预览、取消、字体边框原子应用、撤销重做及重开', async ({page}) => {
  const id = await setup(page)
  const before = await snapshot(page, id)
  await open(page, id)
  await pick(page, '文字 / 主色', '#E5484D')
  await expect(dialog(page).locator('.card__day')).toHaveCSS('color', 'rgb(229, 72, 77)')
  expect((await snapshot(page, id)).props).toEqual(before.props)
  await dialog(page).getByRole('button', {name: '取消', exact: true}).click()
  expect((await snapshot(page, id)).props).toEqual(before.props)
  await open(page, id)
  await pick(page, '文字 / 主色', '#E5484D')
  await pick(page, '背景色', '#FFF2C7')
  await pick(page, '边框色', '#4857E2')
  await select(page, '卡片边框', '虚线')
  await select(page, '卡片字体', '通用衬线')
  await dialog(page).getByRole('spinbutton', {name: /^日期字号/}).fill('40')
  await dialog(page).getByRole('button', {name: '应用', exact: true}).click()
  await expect(dialog(page)).toHaveCount(0)
  await expect(card(page, id).locator('.card__day')).toHaveCSS('font-size', '40px')
  await expect(card(page, id).locator('.card__day')).toHaveCSS('color', 'rgb(229, 72, 77)')
  await expect(card(page, id).locator('.card')).toHaveCSS('background-color', 'rgb(255, 242, 199)')
  await expect(card(page, id).locator('.card')).toHaveCSS('border-top-color', 'rgb(72, 87, 226)')
  await expect(card(page, id).locator('.card')).toHaveCSS('border-top-style', 'dashed')
  const after = await snapshot(page, id)
  expect(after.props.date).toBe(before.props.date)
  expect(after.props.width).toBe(before.props.width)
  expect(after.props.height).toBe(before.props.height)
  await undo(page)
  expect((await snapshot(page, id)).props).toEqual(before.props)
  await undo(page, true)
  expect((await snapshot(page, id)).props).toEqual(after.props)
  await open(page, id)
  await expect(dialog(page).getByRole('combobox', {name: '卡片字体'})).toContainText('通用衬线')
  await expect(dialog(page).getByRole('spinbutton', {name: /^日期字号/})).toHaveValue('40')
  await dialog(page).getByRole('button', {name: '恢复默认颜色'}).click()
  await dialog(page).getByRole('button', {name: '应用', exact: true}).click()
  await expect(card(page, id).locator('.card__day')).toHaveCSS('color', 'rgb(65, 109, 87)')
})

test('模板草稿：颜色恢复默认覆盖正式值，撤销恢复草稿且不改定格值', async ({page}) => {
  const id = await setup(page, 'bookmark', true)
  const before = await snapshot(page, id)
  await open(page, id)
  await dialog(page).getByRole('button', {name: '恢复默认颜色'}).click()
  await dialog(page).getByRole('button', {name: '应用', exact: true}).click()
  const after = await snapshot(page, id)
  expect(after.props).toEqual(before.props)
  expect(after.meta['draft:fg']).toBe('')
  expect(after.meta['draft:bg']).toBe('')
  await expect(card(page, id).locator('.card__paper')).toHaveCSS('background-color', 'rgb(65, 109, 87)')
  await expect(card(page, id).locator('.card__day')).toHaveCSS('color', 'rgb(255, 254, 250)')
  await undo(page)
  expect((await snapshot(page, id)).meta).toEqual(before.meta)
})

test('双击浮动卡片设置，Esc 取消；打开时切只读清理浮层', async ({page}) => {
  const id = await setup(page)
  await page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.placement.setMode(doc.getBlockById(id), 'absolute')
    doc.placement.updateAbsolute(id, {x: 80, y: 80})
  }, id)
  await card(page, id).locator('.card__day').dblclick()
  await expect(dialog(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toHaveCount(0)
  await open(page, id)
  await page.getByRole('button', {name: '只读', exact: true}).press('Enter')
  await expect(dialog(page)).toHaveCount(0)
  await expect(card(page, id).getByRole('button', {name: '日期设置', exact: true})).toHaveCount(0)
  await card(page, id).locator('.card__day').dblclick()
  await expect(dialog(page)).toHaveCount(0)
})

test('全部十二种样式沿用颜色设置，快照重开后保持颜色', async ({page}) => {
  test.setTimeout(120000)
  const id = await setup(page)
  await open(page, id)
  await pick(page, '文字 / 主色', '#E5484D')
  await pick(page, '背景色', '#FFF2C7')
  await dialog(page).getByRole('button', {name: '应用', exact: true}).click()
  for (const [style, label] of Object.entries({calendar: '台历', square: '方牌', banner: '长卷', minibar: '行签', ticket: '票根', stamp: '邮戳', flip: '翻页牌', masthead: '报头', bookmark: '页边签', split: '对开日期', pill: '胶囊', rail: '双轨'})) {
    await open(page, id)
    await select(page, '卡片样式', label)
    await dialog(page).getByRole('button', {name: '应用', exact: true}).click()
    await expect(card(page, id).locator('.tpl-date-card')).toHaveAttribute('data-style', style)
    await expect(card(page, id).locator('.card__day')).toHaveCSS('color', style === 'pill' ? 'rgb(255, 242, 199)' : 'rgb(229, 72, 77)')
    await expect(card(page, id).locator(style === 'bookmark' ? '.card__paper' : '.card')).toHaveCSS('background-color', 'rgb(255, 242, 199)')
  }
  const restoredId = await page.evaluate(async id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const snap = doc.schemas.createSnapshot('date-card', [])
    snap.props = JSON.parse(JSON.stringify(doc.getBlockById(id).props))
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [snap]); await doc.navigateToBlock(snap.id)
    return snap.id as string
  }, id)
  await expect(card(page, restoredId).locator('.card__day')).toHaveCSS('color', 'rgb(229, 72, 77)')
  await expect(card(page, restoredId).locator('.card')).toHaveCSS('background-color', 'rgb(255, 242, 199)')
})

test('自定义透明背景区别于默认背景；删除块清理嵌套取色浮层', async ({page}) => {
  const id = await setup(page, 'bookmark')
  await open(page, id)
  await dialog(page).locator('cs-color-picker[aria-label="背景色"]').getByRole('button').click()
  await page.getByRole('button', {name: '更多颜色', exact: true}).click()
  await page.getByRole('textbox', {name: 'Hex', exact: true}).fill('ABCDEF')
  await page.getByRole('textbox', {name: 'Hex', exact: true}).press('Enter')
  await page.getByRole('textbox', {name: '透明度', exact: true}).fill('0')
  await page.getByRole('textbox', {name: '透明度', exact: true}).press('Enter')
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toBeVisible()
  await dialog(page).getByRole('button', {name: '应用', exact: true}).click()
  await expect(card(page, id).locator('.card__paper')).toHaveCSS('background-color', 'rgba(171, 205, 239, 0)')
  expect((await snapshot(page, id)).props.bg).toBeTruthy()
  await open(page, id)
  await dialog(page).getByRole('button', {name: '恢复默认颜色'}).click()
  await dialog(page).getByRole('button', {name: '应用', exact: true}).click()
  await expect(card(page, id).locator('.card__paper')).toHaveCSS('background-color', 'rgb(65, 109, 87)')
  await open(page, id)
  await dialog(page).locator('cs-color-picker[aria-label="背景色"]').getByRole('button').click()
  await page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.crud.deleteBlockById(id)
  }, id)
  await expect(dialog(page)).toHaveCount(0)
  await expect(page.getByRole('dialog', {name: '打开颜色选择器', exact: true})).toHaveCount(0)
})
