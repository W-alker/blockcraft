import {expect, test, type Page} from '@playwright/test'

test.use({viewport: {width: 1500, height: 1000}})

async function setup(page: Page, backward = false, boundary = false) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng
    ?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  const result = await page.evaluate(({backward, boundary}) => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const blocks = ['首段正文', '缩进一级正文', '缩进三级正文', '移动落点正文', '尾段正文']
      .map((text, index) => doc.schemas.createSnapshot('paragraph', [text, {depth: [0, 1, 3, 0, 0][index]}]))
    doc.crud.insertBlockSnapshots(doc.rootId, 0, blocks)
    doc.crud.undoManager.clearHistory()
    const start = boundary ? {type: 'boundary', blockId: doc.rootId, index: 0}
      : {type: 'text', blockId: blocks[0].id, offset: 1}
    const end = boundary ? {type: 'boundary', blockId: doc.rootId, index: 3}
      : {type: 'text', blockId: blocks[2].id, offset: 4}
    const selection = {anchor: backward ? end : start, head: backward ? start : end, commonParent: doc.rootId}
    doc.selection.replay(selection)
    ;(window as any).multiParagraphDrag = {doc, ids: blocks.map(block => block.id), selection}
    return {ids: blocks.map(block => block.id), selection}
  }, {backward, boundary})
  // The playground has a large virtualized document. Bring the fixture into
  // view before sampling computed styles of the middle selected paragraph.
  await page.locator(`[data-block-id="${result.ids[0]}"]`).scrollIntoViewIfNeeded()
  await expect(page.locator(`[data-block-id="${result.ids[1]}"]`)).toBeVisible()
  await page.evaluate(() => {
    const {doc, selection} = (window as any).multiParagraphDrag
    doc.selection.replay(selection)
  })
  await waitForNativeSelection(page)
  return result
}

async function waitForNativeSelection(page: Page) {
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString() ?? '')).toContain('缩进')
}

async function readState(page: Page) {
  return page.evaluate(() => {
    const {doc, ids} = (window as any).multiParagraphDrag
    const native = window.getSelection()
    const nativeBlock = (node: Node | null | undefined) =>
      (node instanceof Element ? node : node?.parentElement)?.closest('[data-block-id]')?.getAttribute('data-block-id')
    return {
      order: doc.root.childrenIds.filter((id: string) => ids.includes(id)),
      selection: doc.selection.value?.toJSON() ?? null,
      focus: doc.root.hostElement.contains(document.activeElement),
      native: native?.toString(),
      nativeAnchor: nativeBlock(native?.anchorNode),
      nativeHead: nativeBlock(native?.focusNode),
      depths: ids.slice(0, 3).map((id: string) => doc.getBlockById(id).props.depth ?? 0),
      indents: ids.slice(0, 3).map((id: string) => getComputedStyle(doc.getBlockById(id).hostElement).marginLeft),
    }
  })
}

async function dragTo(page: Page, id: string, finish = true, position: 'after' | 'before' | 'left' = 'after') {
  const handle = page.locator('bc-drag-handle').first()
  await expect(handle).toBeVisible()
  await handle.hover()
  await page.mouse.down()
  const box = (await page.locator(`[data-block-id="${id}"]`).boundingBox())!
  await page.mouse.move(position === 'left' ? box.x + 2 : box.x + box.width / 2,
    position === 'before' ? box.y + 2 : box.y + box.height - 2, {steps: 6})
  await expect.poll(() => page.evaluate(() => {
    const ctrl = (window as any).multiParagraphDrag.doc.dragController
    return {state: ctrl.state, kind: ctrl._data?.kind, target: ctrl._prevBlock?.id}
  })).toEqual({state: 'dragging', kind: 'origin-blocks', target: id})
  if (finish) await page.mouse.up()
}

for (const backward of [false, true]) {
  test(`多段落${backward ? '反向' : '正向'}拖动保留缩进、焦点，撤销重做恢复选区`, async ({page}) => {
    const {ids, selection} = await setup(page, backward)
    const before = await readState(page)
    await dragTo(page, ids[3])
    await expect.poll(() => readState(page)).toMatchObject({
      order: [ids[3], ...ids.slice(0, 3), ids[4]], selection, focus: true,
      depths: before.depths, indents: before.indents, native: before.native,
      nativeAnchor: before.nativeAnchor, nativeHead: before.nativeHead,
    })
    await page.keyboard.press('ControlOrMeta+z')
    await expect.poll(() => readState(page)).toMatchObject({...before, focus: true})
    expect(await page.evaluate(() => (window as any).multiParagraphDrag.doc.crud.undoManager.isCanUndo())).toBe(false)
    await page.keyboard.press('ControlOrMeta+Shift+z')
    await expect.poll(() => readState(page)).toMatchObject({
      order: [ids[3], ...ids.slice(0, 3), ids[4]], selection, focus: true, depths: before.depths,
    })
  })
}

test('取消多段落拖动恢复选区，不污染随后输入的撤销', async ({page}) => {
  const {ids} = await setup(page)
  const before = await readState(page)
  await dragTo(page, ids[3], false)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect.poll(() => readState(page)).toMatchObject(before)
  expect(await page.evaluate(() => (window as any).multiParagraphDrag.doc.crud.undoManager.isCanUndo())).toBe(false)
  await page.evaluate(() => {
    const {doc, ids} = (window as any).multiParagraphDrag
    doc.selection.setCursorAtBlock(ids[4], true)
  })
  await page.keyboard.type('x')
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(() => page.evaluate(() => {
    const {doc, ids} = (window as any).multiParagraphDrag
    return doc.selection.value?.anchor.blockId === ids[4]
  })).toBe(true)
})

for (const boundary of [false, true]) {
  test(`${boundary ? '整段边界' : '文本'}选区跨容器移动后跟随内容，撤销恢复原容器`, async ({page}) => {
    const {ids, selection} = await setup(page, true, boundary)
    const target = await page.evaluate(() => {
      const {doc, selection} = (window as any).multiParagraphDrag
      const callout = doc.schemas.createSnapshot('callout', [])
      doc.crud.insertBlockSnapshots(doc.rootId, 5, [callout])
      doc.selection.replay(selection)
      doc.crud.undoManager.clearHistory()
      return {container: callout.id, child: callout.children[0].id}
    })
    await waitForNativeSelection(page)
    const before = await readState(page)
    await dragTo(page, target.child)
    const afterSelection = boundary ? {
      anchor: {type: 'boundary', blockId: target.container, index: 4},
      head: {type: 'boundary', blockId: target.container, index: 1},
      commonParent: target.container,
    } : {...selection, commonParent: target.container}
    await expect.poll(() => readState(page)).toMatchObject({
      selection: afterSelection, focus: true, depths: before.depths, indents: before.indents,
    })
    await page.keyboard.press('ControlOrMeta+z')
    await expect.poll(() => readState(page)).toMatchObject(before)
    await page.keyboard.press('ControlOrMeta+Shift+z')
    await expect.poll(() => readState(page)).toMatchObject({selection: afterSelection, focus: true})
    expect(await page.evaluate(ids => {
      const {doc} = (window as any).multiParagraphDrag
      return ids.slice(0, 3).map((id: string) => doc.model.getParentId(id))
    }, ids)).toEqual([target.container, target.container, target.container])
  })
}

test('整段边界拖动后仍选中移动的段落', async ({page}) => {
  const {ids, selection} = await setup(page, false, true)
  await dragTo(page, ids[3])
  await expect.poll(() => readState(page)).toMatchObject({selection: {
    ...selection, anchor: {...selection.anchor, index: 1}, head: {...selection.head, index: 4},
  }, focus: true, depths: [0, 1, 3]})
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(() => readState(page)).toMatchObject({selection, order: ids, focus: true})
})

test('在原位置放下保持选区，不留下撤销记录', async ({page}) => {
  const {ids} = await setup(page)
  const before = await readState(page)
  await dragTo(page, ids[3], true, 'before')
  await expect.poll(() => readState(page)).toMatchObject(before)
  expect(await page.evaluate(() => (window as any).multiParagraphDrag.doc.crud.undoManager.isCanUndo())).toBe(false)
})

test('多段落拖成分栏保持缩进与选区，并且一次撤销恢复', async ({page}) => {
  const {ids, selection} = await setup(page)
  const before = await readState(page)
  await dragTo(page, ids[3], true, 'left')
  const parentId = await page.evaluate(id => (window as any).multiParagraphDrag.doc.model.getParentId(id), ids[0])
  expect(parentId).not.toBe(selection.commonParent)
  await expect.poll(() => readState(page)).toMatchObject({
    selection: {...selection, commonParent: parentId}, focus: true,
    depths: before.depths, indents: before.indents,
  })
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(() => readState(page)).toMatchObject(before)
  expect(await page.evaluate(() => (window as any).multiParagraphDrag.doc.crud.undoManager.isCanUndo())).toBe(false)
})
