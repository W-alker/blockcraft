import {expect, test, type Page} from '@playwright/test'

test.use({viewport: {width: 1600, height: 1100}})

async function setup(page: Page, flavour: 'date-card' | 'weather') {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  return page.evaluate(async flavour => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const paragraphs = (prefix: string, count: number) => Array.from({length: count}, (_, i) =>
      doc.schemas.createSnapshot('paragraph', [`${prefix} ${i + 1}`]))
    const block = doc.schemas.createSnapshot(flavour, [])
    block.props = flavour === 'date-card'
      ? {style: 'masthead', date: '2026-09-21T10:00'}
      : {date: '2026-09-21', frozen: {tone: 'cloudy', temp: 24, condition: '多云', location: '杭州'}}
    const after = paragraphs('后文', 25)
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [...paragraphs('前文', 45), block, ...after])
    await doc.navigateToBlock(block.id)
    doc.selection.selectBlock(doc.getBlockById(block.id))
    return block.id as string
  }, flavour)
}

function blockFor(page: Page, id: string) {
  return page.locator(`block-craft-editor [data-block-id="${id}"]`)
}

function dialogFor(page: Page, flavour: 'date-card' | 'weather') {
  return page.getByRole('dialog', {name: flavour === 'date-card' ? '日期设置' : '天气设置', exact: true})
}

async function open(page: Page, id: string, flavour: 'date-card' | 'weather') {
  const block = blockFor(page, id)
  await block.locator(flavour === 'date-card' ? '.card__day' : '.tpl-weather-chip').click()
  await (flavour === 'date-card'
    ? block.getByRole('button', {name: '日期设置', exact: true})
    : page.getByRole('button', {name: '天气样式与配色', exact: true})).click()
  await expect(dialogFor(page, flavour)).toBeVisible()
}

async function snapshot(page: Page, id: string) {
  return page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    return JSON.parse(JSON.stringify(doc.getBlockById(id).toSnapshot(false)))
  }, id)
}

async function scrollTop(page: Page) {
  // 等待选区投影和浮层定位完成。
  return page.evaluate(async () => {
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    return (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.scrollContainer.scrollTop as number
  })
}

for (const flavour of ['date-card', 'weather'] as const) {
  test(`${flavour} 设置外部关闭保留长文档滚动位置及未应用数据`, async ({page}) => {
    const id = await setup(page, flavour)
    const dialog = dialogFor(page, flavour)
    const before = await snapshot(page, id)
    await open(page, id, flavour)
    const beforeClose = await scrollTop(page)
    expect(beforeClose).toBeGreaterThan(600)
    // 使用真实外部点击，避免 locator 点击前自动滚动页面。
    await page.mouse.click(100, 100)
    await expect(dialog).toHaveCount(0)
    expect(Math.abs(await scrollTop(page) - beforeClose)).toBeLessThanOrEqual(4)
    expect(await snapshot(page, id)).toEqual(before)
  })

  test(`${flavour} 嵌套取色器外部关闭保留长文档滚动位置`, async ({page}) => {
    const id = await setup(page, flavour)
    const before = await snapshot(page, id)
    const dialog = dialogFor(page, flavour)
    await open(page, id, flavour)
    await dialog.getByRole('combobox', {name: flavour === 'date-card' ? '卡片样式' : '天气样式', exact: true}).click()
    await page.getByRole('listbox').getByRole('option', {name: flavour === 'date-card' ? '方牌' : '基础信息卡', exact: true}).click()
    await dialog.locator('cs-color-picker[aria-label="背景色"]').getByRole('button').click()
    await page.getByRole('button', {name: '更多颜色', exact: true}).click()
    await expect(page.getByRole('slider', {name: '饱和度与明度', exact: true})).toBeFocused()
    const beforeClose = await scrollTop(page)
    expect(beforeClose).toBeGreaterThan(600)
    await page.mouse.click(100, 100)
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('dialog', {name: '打开颜色选择器', exact: true})).toHaveCount(0)
    expect(Math.abs(await scrollTop(page) - beforeClose)).toBeLessThanOrEqual(4)
    expect(await snapshot(page, id)).toEqual(before)
  })
}

test('日期双击和键盘打开，Esc、取消、应用恢复焦点且不滚动', async ({page}) => {
  const id = await setup(page, 'date-card')
  const block = blockFor(page, id)
  const button = block.getByRole('button', {name: '日期设置', exact: true})
  const dialog = dialogFor(page, 'date-card')
  for (const [activation, dismissal] of [['双击', 'Escape'], ['Enter', '取消'], ['Space', '应用']]) {
    if (activation === '双击') {
      await block.locator('.card__day').dblclick()
    } else {
      await button.focus()
      await button.press(activation)
    }
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', {name: '关闭日期设置', exact: true})).toBeFocused()
    const beforeClose = await scrollTop(page)
    expect(beforeClose).toBeGreaterThan(600)
    if (dismissal === 'Escape') await page.keyboard.press('Escape')
    else await dialog.getByRole('button', {name: dismissal, exact: true}).click()
    await expect(dialog).toHaveCount(0)
    expect(Math.abs(await scrollTop(page) - beforeClose)).toBeLessThanOrEqual(4)
    if (activation !== '双击') await expect(button).toBeFocused()
    else await expect(page.locator('[data-blockcraft-root]')).toBeFocused()
  }
})
