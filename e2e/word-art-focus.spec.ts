import {expect, test, type Page} from '@playwright/test'

const editorSelector = 'block-craft-editor'

async function initialize(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(selector => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng?: {getComponent: (target: Element) => {doc?: {isInitialized?: boolean}}}
    }).ng
    return !!editor && debug?.getComponent(editor)?.doc?.isInitialized === true
  }, editorSelector)
}

test('WordArt object handle, format panel, and Escape keep object focus stable', async ({
  page,
}) => {
  await initialize(page)
  const wordArtId = await page.evaluate(async selector => {
    const editor = document.querySelector(selector)!
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor).doc
    const snapshot = doc.schemas.createSnapshot('word-art', [
      '艺术字测试',
      {width: 360, height: 120},
    ])
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot])
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
    doc.getBlockById(snapshot.id).hostElement.scrollIntoView({block: 'center'})
    doc.selection.setCursorAtBlock(snapshot.id, true, false)
    return snapshot.id as string
  }, editorSelector)

  const wordArt = page.locator(
    `${editorSelector} .word-art-block[data-block-id="${wordArtId}"]`,
  )
  const objectHandle = wordArt.locator('.word-art-block__object-handle')
  await expect(wordArt).toBeVisible()
  await wordArt.hover()
  await expect(objectHandle).toBeVisible()
  await expect(objectHandle).toHaveCSS('width', '24px')
  await expect(objectHandle).toHaveCSS('height', '14px')
  expect(await wordArt.evaluate(element => getComputedStyle(element).outlineStyle))
    .toBe('none')

  await objectHandle.click()

  await expect.poll(() => page.evaluate(selector => {
    const editor = document.querySelector(selector)!
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const selection = debug.getComponent(editor).doc.selection.value
    return {
      firstBlockId: selection?.firstBlockId ?? null,
      startType: selection?.start?.type ?? null,
    }
  }, editorSelector)).toEqual({firstBlockId: wordArtId, startType: 'selected'})
  await expect(wordArt).toHaveClass(/word-art-block--object-selected/)
  await expect(wordArt.locator('shape-resizer')).toBeVisible()
  await expect(objectHandle).toBeHidden()

  const toolbar = page.locator('[data-bc-word-art-toolbar]')
  await expect(toolbar).toBeVisible()
  await toolbar.getByRole('button', {name: '艺术字格式', exact: true}).click()
  const formatPanel = page.locator('#bc-word-art-format-panel')
  await expect(formatPanel).toBeVisible()
  await expect(formatPanel).toHaveCSS('overflow', 'visible')
  await expect(formatPanel).toHaveCSS('max-height', 'none')
  await page.waitForTimeout(200)
  await expect(formatPanel).toBeVisible()
  await expect(toolbar).toBeVisible()
  await expect(wordArt).toHaveClass(/word-art-block--object-selected/)

  await wordArt.locator('.word-art-block__editor').click()
  await expect(formatPanel).toBeHidden()
  await expect(wordArt).not.toHaveClass(/word-art-block--object-selected/)

  await page.keyboard.press('Escape')

  await expect.poll(() => page.evaluate(selector => {
    const editor = document.querySelector(selector)!
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const selection = debug.getComponent(editor).doc.selection.value
    return selection?.start?.type === 'selected'
      ? selection.firstBlockId
      : null
  }, editorSelector)).toBe(wordArtId)
})
