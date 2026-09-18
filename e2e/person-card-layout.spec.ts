import {expect, test, type Page} from '@playwright/test'

test.use({viewport: {width: 1600, height: 1000}})

async function setup(page: Page, style = 'row', absolute = false, legacy = false) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  return page.evaluate(async ({style, absolute, legacy}) => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const snap = doc.schemas.createSnapshot('person-card', [])
    snap.props = {style, width: 300, height: 180, dept: 'on', ...(legacy ? {} : {sc: 1}),
      person: JSON.stringify({name: '欧阳明月 Alexandra', pinyin: 'OU YANG MING YUE ALEXANDRA', description: '信息技术中心 / 平台架构与研发工程师'})}
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [snap])
    await doc.navigateToBlock(snap.id)
    const block = doc.getBlockById(snap.id)
    if (absolute) doc.placement.setMode(block, 'absolute')
    doc.selection.selectBlock(block)
    return snap.id
  }, {style, absolute, legacy})
}

async function read(page: Page, id: string) {
  return page.locator(`[data-block-id="${id}"]`).evaluate((el: HTMLElement) => {
    const rect = el.getBoundingClientRect()
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const block = doc.getBlockById(el.dataset['blockId'])
    const font = (selector: string) => Number.parseFloat(getComputedStyle(el.querySelector(selector)!).fontSize)
    return {width: rect.width, height: rect.height, x: rect.x, y: rect.y, name: font('.card__name'), desc: font('.card__desc'),
      avatar: el.querySelector('.card__avatar')!.getBoundingClientRect().width, scale: block.contentScale,
      props: JSON.parse(JSON.stringify(block.props)), selected: el.classList.contains('selected')}
  })
}

async function drag(page: Page, id: string, side: string, dx: number, dy: number, cancel = false) {
  const handle = page.locator(`[data-block-id="${id}"] [data-handle="${side}"]`)
  await handle.scrollIntoViewIfNeeded()
  const box = (await handle.boundingBox())!
  const x = box.x + box.width / 2, y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, {steps: 6})
  await page.waitForTimeout(100)
  const preview = await read(page, id)
  if (cancel) await page.keyboard.press('Escape')
  await page.mouse.up()
  return preview
}

for (const style of ['row', 'rowPinyin', 'column']) {
  test(`${style}: 边改宽高，角缩放，取消恢复`, async ({page}) => {
    const id = await setup(page, style)
    const before = await read(page, id)
    await drag(page, id, 'east', 80, 0)
    const wider = await read(page, id)
    expect(wider.width).toBeCloseTo(before.width + 80, 0)
    expect(wider.name).toBe(before.name)
    expect(wider.avatar).toBe(before.avatar)
    await drag(page, id, 'south', 0, 30)
    const taller = await read(page, id)
    expect(taller.height).toBeCloseTo(wider.height + 30, 0)
    expect(taller.name).toBe(before.name)
    const preview = await drag(page, id, 'south-east', taller.width * .2, taller.height * .2)
    const scaled = await read(page, id)
    expect(scaled.scale).toBeCloseTo(1.2, 1)
    expect(scaled.name / before.name).toBeCloseTo(scaled.scale, 2)
    expect(scaled.desc / before.desc).toBeCloseTo(scaled.scale, 2)
    expect(scaled.avatar / before.avatar).toBeCloseTo(scaled.scale, 2)
    expect(Math.abs(preview.name - scaled.name)).toBeLessThan(.15)
    expect(scaled.selected).toBe(true)
    await drag(page, id, 'north-west', 40, 30, true)
    const cancelled = await read(page, id)
    expect(cancelled.width).toBeCloseTo(scaled.width, 0)
    expect(cancelled.name).toBeCloseTo(scaled.name, 2)
    expect(cancelled.props).toEqual(scaled.props)
  })
}

test('字号按样式隔离、缩放后输入显示字号、快照重开与只读', async ({page}) => {
  const id = await setup(page, 'rowPinyin')
  const nameInput = page.getByTestId('person-font-name').locator('input')
  await nameInput.fill('22')
  await nameInput.press('Enter')
  await expect.poll(async () => (await read(page, id)).name).toBe(22)
  await page.getByLabel('人员排版样式').selectOption('row')
  await expect.poll(async () => (await read(page, id)).name).toBe(15)
  await page.getByLabel('人员排版样式').selectOption('rowPinyin')
  await expect.poll(async () => (await read(page, id)).name).toBe(22)
  const scale = page.getByTestId('person-scale').locator('input')
  await scale.fill('150')
  await scale.press('Enter')
  await expect.poll(async () => (await read(page, id)).name).toBe(33)
  await nameInput.fill('30')
  await nameInput.press('Enter')
  await expect.poll(async () => (await read(page, id)).name).toBeCloseTo(30, 1)
  const saved = await read(page, id)
  const reopened = await page.evaluate(async id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const props = JSON.parse(JSON.stringify(doc.getBlockById(id).props))
    const snap = doc.schemas.createSnapshot('person-card', [])
    snap.props = props
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [snap])
    await doc.navigateToBlock(snap.id)
    doc.selection.selectBlock(doc.getBlockById(snap.id))
    return snap.id
  }, id)
  expect((await read(page, reopened)).props).toEqual(saved.props)
  expect((await read(page, reopened)).name).toBeCloseTo(saved.name, 2)
  await page.getByRole('button', {name: '恢复当前样式字号', exact: true}).click()
  await expect.poll(async () => (await read(page, reopened)).props.fsp).toBeUndefined()
  await page.getByRole('button', {name: '只读', exact: true}).click()
  await expect(page.locator(`[data-block-id="${reopened}"] shape-resizer`)).toHaveCount(0)
  await expect(page.getByTestId('person-font-name').locator('input')).toBeDisabled()
})

test('旧尺寸卡片首个边拖拽保持原字号，浮动对象左上角固定对边', async ({page}) => {
  const id = await setup(page, 'row', true, true)
  const before = await read(page, id)
  await drag(page, id, 'west', -60, 0)
  const wider = await read(page, id)
  expect(Math.abs(wider.name - before.name)).toBeLessThan(.15)
  expect(wider.x + wider.width).toBeCloseTo(before.x + before.width, 0)
  const preview = await drag(page, id, 'north-west', -36, -18)
  const scaled = await read(page, id)
  expect(scaled.x + scaled.width).toBeCloseTo(wider.x + wider.width, 0)
  expect(scaled.y + scaled.height).toBeCloseTo(wider.y + wider.height, 0)
  expect(scaled.x).toBeCloseTo(preview.x, 0)
  expect(Math.abs(scaled.name - preview.name)).toBeLessThan(.2)
})

for (const zoom of [.5, 1.5]) {
  test(`视图 ${zoom} 下边拖拽按文档像素提交，撤销重做恢复尺寸与倍率`, async ({page}) => {
    const id = await setup(page)
    await page.evaluate(zoom => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      doc.viewScale.setScale(zoom)
      doc.crud.undoManager.clearHistory()
    }, zoom)
    const before = await read(page, id)
    await drag(page, id, 'east', 60 * zoom, 0)
    const after = await read(page, id)
    expect(after.props.width).toBe(before.props.width + 60)
    expect(after.name).toBe(before.name)
    await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.crud.undoManager.undo())
    await expect.poll(async () => (await read(page, id)).props.width).toBe(before.props.width)
    await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.crud.undoManager.redo())
    await expect.poll(async () => (await read(page, id)).props).toEqual(after.props)
  })
}

test('组合内人员块缩放与组合边界一起撤销', async ({page}) => {
  const id = await setup(page, 'row', true)
  const groupId = await page.evaluate(async id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const sibling = doc.schemas.createSnapshot('person-card', [])
    sibling.props = {...sibling.props, width: 100, height: 60}
    const siblingId = doc.placement.insertAbsoluteSnapshot(sibling, {anchorRect: null})
    doc.crud.updateBlockProps(id, {position: '10 10'})
    doc.crud.updateBlockProps(siblingId, {position: '10 220'})
    const groupId = doc.placement.group([id, siblingId])
    if (!groupId) throw new Error('组合失败')
    await doc.navigateToBlock(groupId)
    doc.selection.selectBlock(doc.getBlockById(id))
    doc.crud.undoManager.clearHistory()
    return groupId
  }, id)
  const group = () => page.evaluate(groupId => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    return JSON.parse(JSON.stringify(doc.model.getProps(groupId)))
  }, groupId)
  const before = await read(page, id)
  const groupBefore = await group()
  await drag(page, id, 'east', 70, 0)
  expect((await group()).width).toBeGreaterThan(groupBefore.width)
  await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.crud.undoManager.undo())
  await expect.poll(group).toEqual(groupBefore)
  await expect.poll(async () => (await read(page, id)).props).toEqual(before.props)
})
