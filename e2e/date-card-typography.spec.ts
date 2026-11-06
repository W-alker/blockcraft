import {expect, test, type Page} from '@playwright/test'

test.use({viewport: {width: 1600, height: 1100}})
const styles = ['calendar', 'square', 'banner', 'minibar', 'ticket', 'stamp', 'flip', 'masthead', 'bookmark', 'split', 'pill', 'rail']
async function setup(page: Page, style = 'calendar') {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  return page.evaluate(async style => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const snap = doc.schemas.createSnapshot('date-card', [])
    snap.props = {style, date: '2026-09-21T10:00'}
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [snap])
    await doc.navigateToBlock(snap.id)
    doc.selection.selectBlock(doc.getBlockById(snap.id))
    return snap.id as string
  }, style)
}
async function read(page: Page, id: string, surface = 'block-craft-editor') {
  await expect(page.locator(`${surface} [data-block-id="${id}"] .card__day`)).toBeVisible()
  return page.locator(`${surface} [data-block-id="${id}"]`).evaluate((el: HTMLElement) => {
    const day = el.querySelector('.card__day')!
    const editor = document.querySelector('block-craft-editor')
    const doc = editor ? (window as any).ng.getComponent(editor).doc : null
    const block = doc?.getBlockById(el.dataset['blockId'])
    const rect = el.getBoundingClientRect()
    return {size: parseFloat(getComputedStyle(day).fontSize), family: getComputedStyle(day).fontFamily,
      width: rect.width, height: rect.height, scale: block?.contentScale ?? 1, props: block ? JSON.parse(JSON.stringify(block.props)) : {}}
  })
}
async function size(page: Page, value: number) {
  const input = page.getByTestId('date-font-day').locator('input')
  await input.fill(String(value)); await input.press('Enter')
}
for (const style of styles) {
  test(`${style}: 字体、分层字号、默认恢复和只读渲染`, async ({page}, info) => {
    const id = await setup(page, style)
    await expect(page.getByLabel('日期排版样式')).toHaveValue(style)
    const before = await read(page, id)
    await page.getByLabel('日期字体', {exact: true}).selectOption('serif')
    await expect.poll(async () => (await read(page, id)).family).toContain('Songti SC')
    await size(page, 24)
    await expect.poll(async () => (await read(page, id)).size).toBeCloseTo(24, 1)
    const changed = await read(page, id)
    expect(changed.width).toBe(before.width)
    expect(changed.height).toBe(before.height)
    await page.locator(`block-craft-editor [data-block-id="${id}"]`).screenshot({path: info.outputPath(`${style}.png`)})
    await page.getByTestId('date-card-debug').getByRole('button', {name: '恢复当前样式字号'}).click()
    await expect.poll(async () => (await read(page, id)).size).toBeCloseTo(before.size, 1)
    await size(page, 24)
    // 左栏虚拟预热日志会异步改变滚动位置；键盘激活明确的按钮，避免滚动中误点相邻调试动作。
    await page.getByRole('button', {name: '只读', exact: true}).press('Enter')
    await expect(page.getByTestId('date-font-day').locator('input')).toBeDisabled()
    await expect(page.getByLabel('日期字体', {exact: true})).toBeDisabled()
    const preview = await read(page, id)
    expect(preview.family).toBe(changed.family)
    expect(preview.size).toBeCloseTo(changed.size, 2)
    await expect(page.locator(`[data-block-id="${id}"] mtl-scale-resizer`)).toHaveCount(0)
  })
}
test('样式隔离、隐藏字段、撤销重做、拖动等比缩放和重开', async ({page}) => {
  const id = await setup(page)
  await size(page, 32)
  await page.getByLabel('日期排版样式').selectOption('flip')
  await expect.poll(async () => (await read(page, id)).size).toBeCloseTo(51.7, 1)
  await size(page, 40)
  await page.getByLabel('日期排版样式').selectOption('calendar')
  await expect.poll(async () => (await read(page, id)).size).toBeCloseTo(32, 1)
  await page.getByLabel('日期格式', {exact: true}).selectOption('min')
  await expect(page.getByTestId('date-font-secondary')).toHaveCount(0)
  await size(page, 28)
  await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.crud.undoManager.undo())
  await expect.poll(async () => (await read(page, id)).size).toBeCloseTo(32, 1)
  await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.crud.undoManager.redo())
  await expect.poll(async () => (await read(page, id)).size).toBeCloseTo(28, 1)
  const before = await read(page, id)
  const handle = page.locator(`[data-block-id="${id}"] .mtl-scale__bar--right`).first()
  await handle.scrollIntoViewIfNeeded()
  const box = (await handle.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, {steps: 6}); await page.mouse.up()
  const after = await read(page, id)
  expect(after.width).toBeGreaterThan(before.width)
  expect(after.size / before.size).toBeCloseTo(after.width / before.width, 2)
  await size(page, 30)
  await expect.poll(async () => (await read(page, id)).size).toBeCloseTo(30, 1)
  const reopened = await page.evaluate(async id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const snap = doc.schemas.createSnapshot('date-card', [])
    snap.props = JSON.parse(JSON.stringify(doc.getBlockById(id).props))
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [snap]); await doc.navigateToBlock(snap.id)
    return snap.id as string
  }, id)
  expect((await read(page, reopened)).size).toBeCloseTo(30, 1)
})

test('模板 draft 字体/字号投影与撤销，不修改定格值和固定框', async ({page}) => {
  const id = await setup(page)
  const before = await read(page, id)
  await page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.crud.undoManager.stopCapturing()
    doc.crud.transact(() => doc.getBlockById(id).updateMeta({'draft:ff': 'serif', 'draft:fsCalendar': '28 12 11'}))
    doc.crud.undoManager.stopCapturing()
  }, id)
  await expect.poll(async () => (await read(page, id)).size).toBeCloseTo(28, 1)
  const preview = await read(page, id)
  expect(preview.family).toContain('Songti SC')
  expect(preview.props).toEqual(before.props)
  expect(preview.width).toBe(before.width)
  await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.crud.undoManager.undo())
  await expect.poll(async () => (await read(page, id)).size).toBeCloseTo(before.size, 1)
  expect((await read(page, id)).family).toBe(before.family)
})

for (const style of ['masthead', 'bookmark', 'split', 'pill', 'rail']) {
  test(`${style}: 实测月份、格式、字体矩阵及颜色边框`, async ({page}) => {
    test.setTimeout(90000)
    const id = await setup(page, style)
    const measured = await page.evaluate(async ({id, style}) => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      const block = doc.getBlockById(id)
      const frame = document.querySelector(`[data-block-id="${id}"] .tpl-date-card`)!
      const failures: unknown[] = []
      const dimensions = new Set<string>()
      const weekdays = new Set<string>()
      let cases = 0
      const paint = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      for (const ff of ['', 'serif', 'kai', 'mono']) {
        for (const format of ['full', 'noWeek', 'min']) {
          for (let month = 1; month <= 12; month++) {
            for (const day of [1, 28]) {
              const date = `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T10:00`
              doc.crud.transact(() => block.updateProps({date, format, ff}))
              await paint(); await paint()
              const bounds = frame.getBoundingClientRect()
              const card = frame.querySelector('.card')!
              const rect = card.getBoundingClientRect()
              dimensions.add(`${Math.round(rect.width)}×${Math.round(rect.height)}`)
              const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT)
              for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                if (!node.textContent?.trim()) continue
                const range = document.createRange(); range.selectNodeContents(node)
                const text = range.getBoundingClientRect()
                if ((text.left < bounds.left - 1 || text.right > bounds.right + 1 || text.top < bounds.top - 1 || text.bottom > bounds.bottom + 1) && failures.length < 15) {
                  failures.push({date, format, ff, content: node.textContent, text: text.toJSON(), bounds: bounds.toJSON()})
                }
              }
              const week = card.querySelector('.card__week')
              if (week) weekdays.add(week.textContent!.trim())
              if (!!week !== (format === 'full') && failures.length < 15) failures.push({date, format, reason: '星期显隐'})
              if (card.textContent!.includes('2026') !== (format !== 'min') && failures.length < 15) failures.push({date, format, reason: '年份显隐'})
              cases++
            }
          }
        }
      }
      doc.crud.transact(() => block.updateProps({format: 'full', ff: '', bg: '#eaf0f8', fg: '#234567', bw: '2px dashed', bc: '#765432'}))
      await paint(); await paint()
      const card = frame.querySelector('.card')!
      const painted = frame.querySelector(style === 'bookmark' ? '.card__paper' : '.card')!
      return {cases, failures, dimensions: [...dimensions], weekdays: weekdays.size,
        background: getComputedStyle(painted).backgroundColor, color: getComputedStyle(painted).color,
        border: getComputedStyle(card).borderTopStyle, borderColor: getComputedStyle(card).borderTopColor}
    }, {id, style})
    expect(measured.failures).toEqual([])
    expect(measured.cases).toBe(288)
    expect(measured.weekdays).toBe(7)
    const dimensions: Record<string, string> = {masthead: '206×136', bookmark: '81×157', split: '210×128', pill: '214×74', rail: '221×96'}
    expect(measured.dimensions).toEqual([dimensions[style]])
    expect(measured.background).toBe('rgb(234, 240, 248)')
    expect(measured.color).toBe('rgb(35, 69, 103)')
    expect(measured.border).toBe('dashed')
    expect(measured.borderColor).toBe('rgb(118, 84, 50)')
  })
}
