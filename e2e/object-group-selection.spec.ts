import {expect, test, type Page} from '@playwright/test'

const editorSelector = 'block-craft-editor'

async function waitForEditor(page: Page): Promise<void> {
  await page.waitForFunction(selector => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng?: {getComponent: (target: Element) => {doc?: {isInitialized?: boolean}}}
    }).ng
    return !!editor && !!debug?.getComponent(editor)?.doc?.isInitialized
  }, editorSelector)
}

test('Shift-select keeps focus chrome on every absolute object', async ({page}) => {
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await waitForEditor(page)

  const ids = await page.evaluate(async selector => {
    const editor = document.querySelector(selector)!
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor).doc
    const rootRect = doc.root.hostElement.getBoundingClientRect()
    const shape = doc.schemas.createSnapshot('shape', ['rectangle'])
    const wordArt = doc.schemas.createSnapshot('word-art', ['艺术字'])
    const shapeId = doc.placement.insertAbsoluteSnapshot(shape, {
      anchorRect: new DOMRect(rootRect.left + 80, rootRect.top + 160, 180, 100),
      layer: 'over',
    })
    const wordArtId = doc.placement.insertAbsoluteSnapshot(wordArt, {
      anchorRect: new DOMRect(rootRect.left + 340, rootRect.top + 180, 320, 96),
      layer: 'over',
    })
    if (!shapeId || !wordArtId) throw new Error('Failed to insert absolute objects')
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
    doc.selection.selectBlock(shapeId)
    return {shapeId, wordArtId}
  }, editorSelector)

  const shape = page.locator(
    `${editorSelector} .shape-block[data-block-id="${ids.shapeId}"]`,
  )
  const wordArt = page.locator(
    `${editorSelector} .word-art-block[data-block-id="${ids.wordArtId}"]`,
  )
  await expect(shape).toHaveClass(/selected/)

  await wordArt.click({modifiers: ['Shift']})

  await expect.poll(() => page.evaluate(({selector, shapeId, wordArtId}) => {
    const editor = document.querySelector(selector)!
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const selection = debug.getComponent(editor).doc.selection.value
    return {
      ids: selection?.getBoundarySelectedChildIds?.() ?? null,
      types: selection
        ? [selection.anchor.type, selection.head.type]
        : null,
    }
  }, {selector: editorSelector, ...ids})).toEqual({
    ids: [ids.shapeId, ids.wordArtId],
    types: ['boundary', 'boundary'],
  })
  await expect(shape).toHaveClass(/selected/)
  await expect(wordArt).toHaveClass(/focused/)

  for (const key of ['a', 'Enter', 'Tab']) {
    await page.keyboard.press(key)
    await expect.poll(() => page.evaluate(({selector, shapeId, wordArtId}) => {
      const editor = document.querySelector(selector)!
      const debug = (window as unknown as {
        ng: {getComponent: (target: Element) => {doc: any}}
      }).ng
      const doc = debug.getComponent(editor).doc
      return {
        ids: doc.selection.value?.getBoundarySelectedChildIds?.() ?? null,
        shapeExists: doc.model.exists(shapeId),
        wordArtExists: doc.model.exists(wordArtId),
      }
    }, {selector: editorSelector, ...ids})).toEqual({
      ids: [ids.shapeId, ids.wordArtId],
      shapeExists: true,
      wordArtExists: true,
    })
  }

  await page.keyboard.press('Delete')
  await expect.poll(() => page.evaluate(({selector, shapeId, wordArtId}) => {
    const editor = document.querySelector(selector)!
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor).doc
    return {
      selection: doc.selection.value,
      shapeExists: doc.model.exists(shapeId),
      wordArtExists: doc.model.exists(wordArtId),
    }
  }, {selector: editorSelector, ...ids})).toEqual({
    selection: null,
    shapeExists: false,
    wordArtExists: false,
  })
})
