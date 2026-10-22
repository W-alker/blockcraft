import {expect, test, type Page} from '@playwright/test'

async function initialize(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng
    ?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
}

async function insertWordArt(page: Page, text: string, absolute = false): Promise<string> {
  return page.evaluate(async ({text, absolute}) => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const snapshot = doc.schemas.createSnapshot('word-art', [text, {width: 360, height: 180}])
    if (absolute) doc.placement.insertAbsoluteSnapshot(snapshot)
    else doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot])
    await doc.navigateToBlock(snapshot.id)
    return snapshot.id as string
  }, {text, absolute})
}

async function selectText(page: Page, id: string, from: number, length = 0): Promise<void> {
  await page.evaluate(({id, from, length}) => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const block = doc.getBlockById(id)
    block.containerElement.focus({preventScroll: true})
    block.setInlineRange(from, length)
    doc.crud.undoManager.stopCapturing()
  }, {id, from, length})
}

async function read(page: Page, id: string) {
  return page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const block = doc.getBlockById(id)
    const selection = doc.selection.value
    return {
      text: block?.textContent() ?? null,
      parentChildren: block?.parentBlock.childrenIds ?? [],
      props: block?.toSnapshot().props ?? null,
      selection: {
        blockId: selection?.firstBlockId ?? null,
        type: selection?.start.type ?? null,
        offset: selection?.start.offset ?? null,
      },
      nativeInside: !!block?.containerElement.contains(document.getSelection()?.focusNode),
      whiteSpace: block ? getComputedStyle(block.containerElement).whiteSpace : null,
    }
  }, id)
}

for (const absolute of [false, true]) {
  test(`WordArt ${absolute ? 'absolute' : 'flow'} Enter keeps one object at start, middle, end and when empty`, async ({page}) => {
    await initialize(page)
    for (const [text, offset] of [['艺术字测试', 0], ['艺术字测试', 2], ['艺术字测试', 5], ['', 0]] as const) {
      const id = await insertWordArt(page, text, absolute)
      await selectText(page, id, offset)
      const before = await read(page, id)

      await page.keyboard.press('Enter')

      await expect.poll(() => read(page, id)).toMatchObject({
        text: text.slice(0, offset) + '\n' + text.slice(offset),
        parentChildren: before.parentChildren,
        props: before.props,
        selection: {blockId: id, type: 'text', offset: offset + 1},
        nativeInside: true,
      })
      expect((await read(page, id)).whiteSpace).toBe('pre-wrap')
      // Continue typing at the new line through the actual browser input path.
      await page.keyboard.type('X')
      await expect.poll(async () => (await read(page, id)).text)
        .toBe(text.slice(0, offset) + '\nX' + text.slice(offset))
    }
  })
}

test('WordArt Enter replaces selected text and Undo/Redo restores text and selection', async ({page}) => {
  await initialize(page)
  const id = await insertWordArt(page, 'ABCDE')
  await selectText(page, id, 1, 3)
  const before = await read(page, id)

  await page.keyboard.press('Enter')
  await expect.poll(() => read(page, id)).toMatchObject({
    text: 'A\nE', parentChildren: before.parentChildren,
    selection: {blockId: id, type: 'text', offset: 2}, nativeInside: true,
  })
  await page.evaluate(() => (window as any).ng
    .getComponent(document.querySelector('block-craft-editor')).doc.crud.undoManager.undo())
  await expect.poll(() => read(page, id)).toMatchObject({
    text: 'ABCDE', parentChildren: before.parentChildren,
    selection: {blockId: id, type: 'text', offset: 1},
  })
  await page.evaluate(() => (window as any).ng
    .getComponent(document.querySelector('block-craft-editor')).doc.crud.undoManager.redo())
  await expect.poll(() => read(page, id)).toMatchObject({
    text: 'A\nE', parentChildren: before.parentChildren,
  })
})

test('WordArt Shift+Enter stays internal and ordinary paragraph Enter still splits', async ({page}) => {
  await initialize(page)
  const id = await insertWordArt(page, 'AB')
  await selectText(page, id, 1)
  const before = await read(page, id)
  await page.keyboard.press('Shift+Enter')
  await expect.poll(() => read(page, id)).toMatchObject({
    text: 'A\nB', parentChildren: before.parentChildren,
    selection: {blockId: id, type: 'text', offset: 2},
  })

  const paragraphId = await page.evaluate(async () => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const snapshot = doc.schemas.createSnapshot('paragraph', ['AB'])
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot])
    await doc.navigateToBlock(snapshot.id)
    return snapshot.id as string
  })
  await selectText(page, paragraphId, 1)
  await page.keyboard.press('Enter')
  await expect.poll(() => page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const block = doc.getBlockById(id)
    const siblings = block.parentBlock.childrenIds
    const next = doc.getBlockById(siblings[siblings.indexOf(id) + 1])
    return [block.textContent(), next?.flavour, next?.textContent()]
  }, paragraphId)).toEqual(['A', 'paragraph', 'B'])
})

test('WordArt Enter creates a text revision within the existing object', async ({page}) => {
  await initialize(page)
  const id = await insertWordArt(page, 'AB')
  await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.revisions.setActor({actorId: 'word-art-enter', displayName: '艺术字测试'})
    doc.revisions.setMode('track')
  })
  await selectText(page, id, 1)
  const before = await read(page, id)

  await page.keyboard.press('Enter')

  await expect.poll(() => read(page, id)).toMatchObject({
    text: 'A\nB', parentChildren: before.parentChildren,
    selection: {blockId: id, type: 'text', offset: 2}, nativeInside: true,
  })
  expect(await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    return doc.revisions.list().map((record: any) => ({kind: record.kind, blockId: record.target.blockId}))
  })).toEqual([{kind: 'text-insert', blockId: id}])
})
