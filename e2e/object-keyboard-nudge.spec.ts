import {expect, test, type Page} from '@playwright/test'

test.use({viewport: {width: 1600, height: 1000}})

async function setup(page: Page, flavours = ['shape', 'date-card', 'shape'], scale = 1) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng
    ?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  return page.evaluate(async ({flavours, scale}) => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    ;(window as any).__nudgeDoc = doc
    const ids = flavours.map((flavour, i) => {
      const snapshot = doc.schemas.createSnapshot(flavour, flavour === 'shape' ? ['rectangle'] : [])
      snapshot.props = {...snapshot.props, width: 160, height: 100}
      const id = doc.placement.insertAbsoluteSnapshot(snapshot, {anchorRect: null})
      doc.crud.updateBlockProps(id, {position: `${80 + i * 220} ${120 + i * 50}`})
      return id as string
    })
    doc.viewScale.setScale(scale)
    await doc.navigateToBlock(ids[0])
    doc.selection.blur()
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    return ids
  }, {flavours, scale})
}

async function state(page: Page, ids: string[]) {
  return page.evaluate(ids => {
    const doc = (window as any).__nudgeDoc
    return ids.map(id => {
      const block = doc.getBlockById(id)
      const r = block.hostElement.getBoundingClientRect()
      return {props: {...doc.model.getProps(id)}, x: r.x, y: r.y, width: r.width, height: r.height}
    })
  }, ids)
}

async function selected(page: Page) {
  return page.evaluate(() => (window as any).__nudgeDoc.placement.getAbsoluteObjectSelectionIds())
}

async function clickObject(page: Page, id: string, shift = false) {
  // Wait for zoom/reveal layout to settle before picking the object's body.
  await page.locator(`[data-block-id="${id}"]`).click({modifiers: shift ? ['Shift'] : []})
}

async function clearHistory(page: Page) {
  await page.evaluate(() => (window as any).__nudgeDoc.crud.undoManager.clearHistory())
}

async function history(page: Page, action: 'undo' | 'redo') {
  await page.evaluate(async action => {
    ;(window as any).__nudgeDoc.crud.undoManager[action]()
    // History restores selection on nextTick, then verifies its DOM projection.
    for (let frame = 0; frame < 4; frame++) await new Promise(requestAnimationFrame)
  }, action)
}

for (const scale of [1, .75, 1.5]) {
  test(`浮动对象按四方向微调 1px，保留选中并可撤销重做（缩放 ${scale}）`, async ({page}) => {
    const ids = await setup(page, ['shape'], scale)
    // Isolate keyboard geometry from the shape's body/text pointer hit regions.
    // Pointer selection and Shift multi-selection are exercised below.
    await page.evaluate(id => (window as any).__nudgeDoc.selection.selectBlock(id), ids[0])
    await expect.poll(() => selected(page)).toEqual(ids)
    await clearHistory(page)
    for (const [key, dx, dy] of [['ArrowLeft', -1, 0], ['ArrowRight', 1, 0], ['ArrowUp', 0, -1], ['ArrowDown', 0, 1]] as const) {
      await expect.poll(() => selected(page)).toEqual(ids)
      const before = await state(page, ids)
      const [x, y] = String(before[0].props.position).split(' ').map(Number)
      await page.keyboard.press(key)
      await expect.poll(async () => (await state(page, ids))[0].props.position).toBe(`${x + dx} ${y + dy}`)
      await expect.poll(async () => (await state(page, ids))[0].x).toBeCloseTo(before[0].x + dx * scale, 1)
      await expect.poll(async () => (await state(page, ids))[0].y).toBeCloseTo(before[0].y + dy * scale, 1)
      const after = await state(page, ids)
      expect(after[0].props).toEqual({...before[0].props, position: `${x + dx} ${y + dy}`})
      expect(after[0].width).toBeCloseTo(before[0].width, 1)
      expect(after[0].height).toBeCloseTo(before[0].height, 1)
      expect(await selected(page)).toEqual(ids)
      await history(page, 'undo')
      await expect.poll(() => state(page, ids)).toEqual(before)
      await expect.poll(() => selected(page)).toEqual(ids)
      await history(page, 'redo')
      await expect.poll(() => state(page, ids)).toEqual(after)
      await expect.poll(() => selected(page)).toEqual(ids)
    }
  })
}

for (const layout of ['root', 'over', 'top-bottom']) {
  test(`对象多选一起微调，组合边界与未选成员保持正确（${layout}）`, async ({page}) => {
    const ids = await setup(page)
    const groupId = await page.evaluate(async ({ids, layout}) => {
      const doc = (window as any).__nudgeDoc
      if (layout === 'root') return null
      const id = doc.placement.group(ids)
      doc.placement.setObjectLayout(id, layout)
      await doc.navigateToBlock(id)
      doc.selection.blur()
      return id as string
    }, {ids, layout})
    if (groupId) await clickObject(page, ids[0])
    await clickObject(page, ids[0])
    await clickObject(page, ids[1], true)
    await expect.poll(() => selected(page)).toEqual(ids.slice(0, 2))
    await clearHistory(page)
    const allIds = [...ids, ...(groupId ? [groupId] : [])]
    const before = await state(page, allIds)
    for (let step = 1; step <= 3; step++) {
      await page.keyboard.down('ArrowLeft')
      await expect.poll(async () => (await state(page, ids))[0].x).toBeCloseTo(before[0].x - step, 1)
    }
    await page.keyboard.up('ArrowLeft')
    const after = await state(page, allIds)
    ids.forEach((_, i) => {
      expect(after[i].x).toBeCloseTo(before[i].x - (i < 2 ? 3 : 0), 1)
      expect(after[i].y).toBeCloseTo(before[i].y, 1)
      expect(after[i].width).toBeCloseTo(before[i].width, 1)
    })
    expect(await selected(page)).toEqual(ids.slice(0, 2))
    await history(page, 'undo')
    await expect.poll(() => state(page, allIds)).toEqual(before)
    expect(await page.evaluate(() => (window as any).__nudgeDoc.crud.undoManager.isCanUndo())).toBe(false)
    await history(page, 'redo')
    await expect.poll(() => state(page, allIds)).toEqual(after)
  })
}

test('整组、组内单个物料及文字下方对象均可微调', async ({page}) => {
  const ids = await setup(page)
  const groupId = await page.evaluate(ids => {
    const doc = (window as any).__nudgeDoc
    return doc.placement.group(ids) as string
  }, ids)
  await clickObject(page, ids[0])
  await expect.poll(() => selected(page)).toEqual([groupId])
  const before = await state(page, ids)
  await page.keyboard.press('ArrowDown')
  await expect.poll(async () => (await state(page, ids))[0].y).toBeCloseTo(before[0].y + 1, 1)
  const after = await state(page, ids)
  after.forEach((r, i) => expect(r.y).toBeCloseTo(before[i].y + 1, 1))
  await clickObject(page, ids[1])
  await expect.poll(() => selected(page)).toEqual([ids[1]])
  await page.keyboard.press('ArrowRight')
  await expect.poll(async () => (await state(page, ids))[1].x).toBeCloseTo(after[1].x + 1, 1)
  expect((await state(page, ids))[0].x).toBeCloseTo(after[0].x, 1)
  await page.evaluate(groupId => {
    const doc = (window as any).__nudgeDoc
    doc.placement.setObjectLayout(groupId, 'under')
    doc.selection.selectBlock(groupId)
  }, groupId)
  const underBefore = await state(page, [groupId])
  await page.keyboard.press('ArrowLeft')
  await expect.poll(async () => (await state(page, [groupId]))[0].x).toBeCloseTo(underBefore[0].x - 1, 1)
})

test('锁定、原生输入与对象内部文字编辑不触发微调', async ({page}) => {
  const ids = await setup(page, ['text-box', 'shape'])
  await page.evaluate(ids => {
    const doc = (window as any).__nudgeDoc
    doc.selection.selectBlock(ids[0])
    doc.setBlockReadonly(ids[0], true)
  }, ids)
  await clearHistory(page)
  const before = await state(page, ids)
  await page.keyboard.press('ArrowRight')
  expect(await state(page, ids)).toEqual(before)
  expect(await selected(page)).toEqual([ids[0]])
  expect(await page.evaluate(() => (window as any).__nudgeDoc.crud.undoManager.isCanUndo())).toBe(false)
  await page.evaluate(id => {
    const doc = (window as any).__nudgeDoc
    doc.setBlockReadonly(id, false)
    const input = document.createElement('input')
    input.id = 'nudge-native-input'
    input.style.cssText = 'position:fixed;top:0;left:0'
    doc.root.hostElement.append(input)
    input.focus()
    input.value = 'abc'
    input.setSelectionRange(1, 1)
  }, ids[0])
  await page.keyboard.press('ArrowRight')
  expect(await page.locator('#nudge-native-input').evaluate((el: HTMLInputElement) => el.selectionStart)).toBe(2)
  expect(await state(page, ids)).toEqual(before)
  await page.evaluate(id => {
    document.querySelector('#nudge-native-input')?.remove()
    const doc = (window as any).__nudgeDoc
    const text = doc.getBlockById(doc.model.getChildrenIds(id)[0])
    text.insertText(0, 'abcd')
    doc.selection.setCursorAt(text, 1)
  }, ids[0])
  await page.keyboard.press('ArrowRight')
  expect(await state(page, ids)).toEqual(before)
  await expect.poll(() => page.evaluate(() => (window as any).__nudgeDoc.selection.value?.head.offset)).toBe(2)
})

test('长按累计位移合并一次撤销，多选包含锁定对象时整次不移动', async ({page}) => {
  const ids = await setup(page)
  await clickObject(page, ids[0])
  await clickObject(page, ids[1], true)
  await expect.poll(() => selected(page)).toEqual(ids.slice(0, 2))
  const before = await state(page, ids)
  await clearHistory(page)
  await page.keyboard.down('ArrowRight')
  // Span the default 500ms undo capture timeout.
  await page.evaluate(async () => {
    for (let i = 0; i < 40; i++) await new Promise(requestAnimationFrame)
  })
  await page.keyboard.down('ArrowRight')
  await page.keyboard.down('ArrowRight')
  await page.keyboard.up('ArrowRight')
  await expect.poll(async () => (await state(page, ids))[0].x).toBeCloseTo(before[0].x + 3, 1)
  expect((await state(page, ids))[1].x).toBeCloseTo(before[1].x + 3, 1)
  expect(await selected(page)).toEqual(ids.slice(0, 2))
  const moved = await state(page, ids)
  await page.keyboard.press('ArrowDown')
  await history(page, 'undo')
  expect(await state(page, ids)).toEqual(moved)
  await history(page, 'undo')
  expect(await state(page, ids)).toEqual(before)
  expect(await selected(page)).toEqual(ids.slice(0, 2))
  expect(await page.evaluate(() => (window as any).__nudgeDoc.crud.undoManager.isCanUndo())).toBe(false)
  await history(page, 'redo')
  expect(await state(page, ids)).toEqual(moved)
  await page.evaluate(id => (window as any).__nudgeDoc.setBlockReadonly(id, true), ids[1])
  await clearHistory(page)
  const lockedBefore = await state(page, ids)
  await page.keyboard.press('ArrowDown')
  expect(await state(page, ids)).toEqual(lockedBefore)
  expect(await selected(page)).toEqual(ids.slice(0, 2))
  expect(await page.evaluate(() => (window as any).__nudgeDoc.crud.undoManager.isCanUndo())).toBe(false)
})

test('修饰键与流式对象保留原有导航，不写入位置', async ({page}) => {
  const ids = await setup(page, ['shape'])
  for (const modifier of ['Shift', 'Alt', 'Control', 'Meta']) {
    await page.evaluate(id => (window as any).__nudgeDoc.selection.selectBlock(id), ids[0])
    const before = await state(page, ids)
    await page.keyboard.press(`${modifier}+ArrowRight`)
    expect(await state(page, ids)).toEqual(before)
  }
  await page.evaluate(id => {
    const doc = (window as any).__nudgeDoc
    doc.placement.setObjectLayout(id, 'top-bottom')
    doc.selection.selectBlock(id)
  }, ids[0])
  await clearHistory(page)
  const props = (await state(page, ids))[0].props
  await page.keyboard.press('ArrowRight')
  expect((await state(page, ids))[0].props).toEqual(props)
  expect(await page.evaluate(() => (window as any).__nudgeDoc.crud.undoManager.isCanUndo())).toBe(false)
})


test('按键会话中的程序化编辑保持独立撤销', async ({page}) => {
  const ids = await setup(page, ['shape'])
  await page.evaluate(id => (window as any).__nudgeDoc.selection.selectBlock(id), ids[0])
  await clearHistory(page)
  const before = await state(page, ids)
  await page.keyboard.down('ArrowRight')
  await expect.poll(async () => (await state(page, ids))[0].x).toBeCloseTo(before[0].x + 1, 1)
  const moved = await state(page, ids)
  await page.evaluate(id => (window as any).__nudgeDoc.crud.undoManager.captureUndoItem(() =>
    (window as any).__nudgeDoc.crud.updateBlockProps(id, {width: 200})), ids[0])
  await page.keyboard.up('ArrowRight')
  await history(page, 'undo')
  expect(await state(page, ids)).toEqual(moved)
  await history(page, 'undo')
  expect(await state(page, ids)).toEqual(before)
})
