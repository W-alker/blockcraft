import {expect, test, type Page} from '@playwright/test'

test.use({viewport: {width: 1600, height: 1000}})

async function setup(page: Page, grouped = false, scale = 1, flavours = ['shape', 'date-card', 'shape']) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng
    ?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  return page.evaluate(async ({grouped, scale, flavours}) => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    ;(window as any).__multiDragDoc = doc
    const ids = flavours.map((flavour, index) => {
      const snapshot = doc.schemas.createSnapshot(flavour, ['rectangle'])
      snapshot.props = {...snapshot.props, width: 160, height: 100}
      const id = doc.placement.insertAbsoluteSnapshot(snapshot, {anchorRect: null})
      doc.crud.updateBlockProps(id, {position: `${80 + index * 240} ${120 + index * 60}`})
      return id as string
    })
    const groupId = grouped ? doc.placement.group(ids) as string : null
    if (scale !== 1) doc.viewScale.setScale(scale)
    await doc.navigateToBlock(groupId ?? ids[0])
    doc.selection.blur()
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    return {ids, groupId}
  }, {grouped, scale, flavours})
}

async function rects(page: Page, ids: string[]) {
  return page.evaluate(ids => ids.map(id => {
    const rect = (window as any).__multiDragDoc.getBlockById(id).hostElement.getBoundingClientRect()
    return {x: rect.x, y: rect.y, width: rect.width, height: rect.height}
  }), ids)
}

async function selectedIds(page: Page) {
  return page.evaluate(() => (window as any).__multiDragDoc.placement.getAbsoluteObjectSelectionIds())
}

async function clickBody(page: Page, id: string, shift = false) {
  const [r] = await rects(page, [id])
  if (shift) await page.keyboard.down('Shift')
  await page.mouse.click(r.x + r.width * .35, r.y + r.height * .55)
  if (shift) await page.keyboard.up('Shift')
}

async function selectPair(page: Page, ids: string[], grouped = false) {
  if (grouped) {
    const parentId = await page.evaluate(id => (window as any).__multiDragDoc.model.getParentId(id), ids[0])
    await clickBody(page, ids[0])
    await expect.poll(() => page.evaluate(() => (window as any).__multiDragDoc.selection.value?.anchor.blockId)).toBe(parentId)
  }
  await clickBody(page, ids[0])
  await expect.poll(() => selectedIds(page)).toEqual([ids[0]])
  await clickBody(page, ids[1], true)
  await expect.poll(() => selectedIds(page)).toEqual(ids.slice(0, 2))
  await page.evaluate(() => (window as any).__multiDragDoc.crud.undoManager.clearHistory())
}

function expectMovement(before: Awaited<ReturnType<typeof rects>>, after: Awaited<ReturnType<typeof rects>>, dx: number, dy: number) {
  after.forEach((r, index) => {
    expect(r.x).toBeCloseTo(before[index].x + (index < 2 ? dx : 0), 0)
    expect(r.y).toBeCloseTo(before[index].y + (index < 2 ? dy : 0), 0)
    expect(r.width).toBeCloseTo(before[index].width, 0)
    expect(r.height).toBeCloseTo(before[index].height, 0)
  })
}

for (const layout of ['over', 'top-bottom']) {
  test(`组合成员多选关闭对象浮动菜单，单选恢复（${layout}）`, async ({page}) => {
    const {ids, groupId} = await setup(page, true, 1, ['shape', 'shape', 'shape'])
    await page.evaluate(async ({groupId, layout}) => {
      const doc = (window as any).__multiDragDoc
      doc.placement.setObjectLayout(groupId, layout)
      await doc.navigateToBlock(groupId)
      doc.selection.blur()
    }, {groupId, layout})
    const formatToolbar = page.locator('bc-object-format-toolbar')
    const groupToolbar = page.locator('bc-object-group-toolbar')
    await clickBody(page, ids[0])
    await expect(groupToolbar).toBeVisible()
    await clickBody(page, ids[0])
    await expect.poll(() => selectedIds(page)).toEqual([ids[0]])
    await expect(formatToolbar).toBeVisible()
    await clickBody(page, ids[1], true)
    await expect.poll(() => selectedIds(page)).toEqual(ids.slice(0, 2))
    await expect(formatToolbar).toHaveCount(0)
    await expect(groupToolbar).toHaveCount(0)
    const before = await rects(page, ids)
    const r = before[1], x = r.x + r.width * .35, y = r.y + r.height * .55
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 30, y + 20, {steps: 5})
    await page.mouse.up()
    await expect.poll(async () => (await rects(page, ids))[0].x - before[0].x).toBeCloseTo(30, 0)
    expectMovement(before, await rects(page, ids), 30, 20)
    await expect.poll(() => selectedIds(page)).toEqual(ids.slice(0, 2))
    await expect(formatToolbar).toHaveCount(0)
    await expect(groupToolbar).toHaveCount(0)
    await clickBody(page, ids[2])
    await expect.poll(() => selectedIds(page)).toEqual([ids[2]])
    await expect(formatToolbar).toBeVisible()
  })
}

for (const grouped of [false, true]) {
  for (const scale of [1, .75]) {
    test(`${grouped ? '组合成员' : '独立对象'}多选同步拖拽、撤销、重做、取消（缩放 ${scale}）`, async ({page}) => {
      const {ids, groupId} = await setup(page, grouped, scale)
      await selectPair(page, ids, grouped)
      const before = await rects(page, ids)
      const propsBefore = await page.evaluate(ids => ids.map(id => ({...(window as any).__multiDragDoc.model.getProps(id)})), [...ids, ...(groupId ? [groupId] : [])])
      const x = before[1].x + before[1].width * .35, y = before[1].y + before[1].height * .55
      // A pure click on a selected object must keep the pair selected.
      await page.mouse.click(x, y)
      await expect.poll(() => selectedIds(page)).toEqual(ids.slice(0, 2))
      await page.mouse.move(x, y)
      await page.mouse.down()
      await page.mouse.move(x + 60, y + 40, {steps: 6})
      await expect.poll(async () => (await rects(page, ids))[0].x - before[0].x).toBeCloseTo(60, 0)
      expectMovement(before, await rects(page, ids), 60, 40)
      // Preview is view-only; no model positions are written before release.
      expect(await page.evaluate(ids => ids.map(id => ({...(window as any).__multiDragDoc.model.getProps(id)})), [...ids, ...(groupId ? [groupId] : [])])).toEqual(propsBefore)
      await page.mouse.up()
      await expect.poll(async () => {
        const after = await rects(page, ids)
        return after[0].x - before[0].x
      }).toBeCloseTo(60, 0)
      const after = await rects(page, ids)
      expectMovement(before, after, 60, 40)
      await expect.poll(() => selectedIds(page)).toEqual(ids.slice(0, 2))
      await page.evaluate(() => (window as any).__multiDragDoc.crud.undoManager.undo())
      await expect.poll(() => rects(page, ids)).toEqual(before)
      await expect.poll(() => selectedIds(page)).toEqual(ids.slice(0, 2))
      expect(await page.evaluate(() => (window as any).__multiDragDoc.crud.undoManager.isCanUndo())).toBe(false)
      await page.evaluate(() => (window as any).__multiDragDoc.crud.undoManager.redo())
      await expect.poll(() => rects(page, ids)).toEqual(after)
      await expect.poll(() => selectedIds(page)).toEqual(ids.slice(0, 2))
      const current = after[1]
      await page.mouse.move(current.x + current.width * .35, current.y + current.height * .55)
      await page.mouse.down()
      await page.mouse.move(current.x + current.width * .35 + 30, current.y + current.height * .55 + 25, {steps: 4})
      await page.keyboard.press('Escape')
      await page.mouse.up()
      await expect.poll(() => rects(page, ids)).toEqual(after)
      await expect.poll(() => selectedIds(page)).toEqual(ids.slice(0, 2))
    })
  }
}

test('包含组合的根级多选从成员本体同步移动整组，成员不会重复位移', async ({page}) => {
  const {ids, groupId} = await setup(page, true)
  const outsideId = await page.evaluate(() => {
    const doc = (window as any).__multiDragDoc
    const snapshot = doc.schemas.createSnapshot('shape', ['rectangle'])
    snapshot.props = {...snapshot.props, width: 100, height: 60}
    const id = doc.placement.insertAbsoluteSnapshot(snapshot, {anchorRect: null})
    doc.crud.updateBlockProps(id, {position: '400 440'})
    return id as string
  })
  await clickBody(page, ids[0])
  await clickBody(page, outsideId, true)
  await expect.poll(() => selectedIds(page)).toEqual([groupId, outsideId])
  const allIds = [...ids, outsideId]
  const before = await rects(page, allIds)
  const r = before[0], x = r.x + r.width * .35, y = r.y + r.height * .55
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 40, y + 30, {steps: 5})
  await page.mouse.up()
  await expect.poll(async () => (await rects(page, allIds))[0].x - before[0].x).toBeCloseTo(40, 0)
  const after = await rects(page, allIds)
  after.forEach((r, index) => {
    expect(r.x).toBeCloseTo(before[index].x + 40, 0)
    expect(r.y).toBeCloseTo(before[index].y + 30, 0)
  })
  await expect.poll(() => selectedIds(page)).toEqual([groupId, outsideId])
})

test('多选包含锁定对象时整次拖动不写入，临时预览全部恢复', async ({page}) => {
  const {ids} = await setup(page)
  await selectPair(page, ids)
  await page.evaluate(id => (window as any).__multiDragDoc.setBlockReadonly(id, true), ids[0])
  const before = await rects(page, ids)
  const r = before[1], x = r.x + r.width * .35, y = r.y + r.height * .55
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 50, y + 40, {steps: 5})
  await page.mouse.up()
  await expect.poll(() => rects(page, ids)).toEqual(before)
  await expect.poll(() => selectedIds(page)).toEqual(ids.slice(0, 2))
  expect(await page.evaluate(() => (window as any).__multiDragDoc.crud.undoManager.isCanUndo())).toBe(false)
})

test('组合成员的 Shift 多选不会被旧正文光标覆盖，随后仍可点击正文编辑', async ({page}) => {
  const {ids, groupId} = await setup(page, true)
  await page.evaluate(async groupId => {
    const doc = (window as any).__multiDragDoc
    doc.placement.setObjectLayout(groupId, 'top-bottom')
    await doc.navigateToBlock(groupId)
    doc.selection.blur()
  }, groupId)
  await clickBody(page, ids[0])
  await clickBody(page, ids[0])
  await expect.poll(() => selectedIds(page)).toEqual([ids[0]])
  await page.keyboard.down('Shift')
  // Give Chromium's delayed native caret repair time to arrive on both edges
  // of the modifier gesture, beyond the programmatic projection guard.
  await page.waitForTimeout(150)
  await expect.poll(() => selectedIds(page)).toEqual([ids[0]])
  await clickBody(page, ids[1])
  await page.keyboard.up('Shift')
  await page.waitForTimeout(150)
  await expect.poll(() => selectedIds(page)).toEqual(ids.slice(0, 2))

  const point = await page.evaluate(async () => {
    const doc = (window as any).__multiDragDoc
    await doc.navigateToBlock('demo-0')
    const rect = doc.getBlockById('demo-0').containerElement.getBoundingClientRect()
    return {x: rect.left + rect.width * .4, y: rect.top + rect.height * .5}
  })
  await page.mouse.click(point.x, point.y)
  await expect.poll(() => page.evaluate(() => {
    const selection = (window as any).__multiDragDoc.selection.value
    return {id: selection?.anchor.blockId, type: selection?.anchor.type}
  })).toEqual({id: 'demo-0', type: 'text'})
  expect(await selectedIds(page)).toBeNull()
})

for (const delta of [{x: 45, y: 30}, {x: -35, y: -25}]) {
  test(`正文组合成员保持局部坐标原点一起移动（${delta.x}, ${delta.y}）`, async ({page}) => {
    const {ids, groupId} = await setup(page, true)
    await page.evaluate(async groupId => {
      const doc = (window as any).__multiDragDoc
      doc.placement.setObjectLayout(groupId, 'top-bottom')
      await doc.navigateToBlock(groupId)
      doc.selection.blur()
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    }, groupId)
    await selectPair(page, ids, true)
    const before = await rects(page, ids)
    const r = before[1], x = r.x + r.width * .35, y = r.y + r.height * .55
    await page.mouse.move(x, y)
    await page.mouse.down()
    await expect.poll(() => page.evaluate(() => (window as any).__multiDragDoc.placement.state)).toBe('armed')
    await page.mouse.move(x + delta.x, y + delta.y, {steps: 5})
    await expect.poll(async () => (await rects(page, ids))[0].x - before[0].x).toBeCloseTo(delta.x, 0)
    await page.mouse.up()
    await expect.poll(async () => (await rects(page, ids))[0].x - before[0].x).toBeCloseTo(delta.x, 0)
    expectMovement(before, await rects(page, ids), delta.x, delta.y)
    const after = await rects(page, ids)
    await expect.poll(() => selectedIds(page)).toEqual(ids.slice(0, 2))
    await page.evaluate(() => (window as any).__multiDragDoc.crud.undoManager.undo())
    await expect.poll(() => rects(page, ids)).toEqual(before)
    await page.evaluate(() => (window as any).__multiDragDoc.crud.undoManager.redo())
    await expect.poll(() => rects(page, ids)).toEqual(after)
  })
}
