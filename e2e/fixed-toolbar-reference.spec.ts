import {expect, test, type Page} from '@playwright/test'

// 固定工具栏链接与公式的光标、选区和历史交互。
test.use({viewport: {width: 2200, height: 1000}})

async function start(page: Page, deltas: any[] = [{insert: 'AB', attributes: {
  't:px': 24, 't:fs': 1.25, 't:ff': 'times', 'a:bold': true, 'a:italic': true,
}}]) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() =>
    (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  return page.locator('block-craft-editor').evaluate(async (editor, deltas) => {
    const doc = (window as any).ng.getComponent(editor).doc
    const paragraph = doc.schemas.createSnapshot('paragraph', [deltas, {pfs: 1.5}])
    const plain = doc.schemas.createSnapshot('paragraph', ['plain'])
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [paragraph, plain])
    await doc.navigateToBlock(paragraph.id)
    doc.crud.undoManager.clearHistory()
    return {id: paragraph.id as string, plain: plain.id as string}
  }, deltas)
}

async function setRange(page: Page, id: string, start: number, end = start) {
  await page.locator('block-craft-editor').evaluate((editor, range) => {
    const doc = (window as any).ng.getComponent(editor).doc
    doc.selection.setSelection(
      {blockId: range.id, type: 'text', offset: range.start},
      {blockId: range.id, type: 'text', offset: range.end},
    )
  }, {id, start, end})
}

async function read(page: Page, id: string) {
  return page.locator('block-craft-editor').evaluate((editor, id) => {
    return (window as any).ng.getComponent(editor).doc.model.getTextDeltas(id)
  }, id)
}


const button = (page: Page, name: string) => page.locator('bc-fixed-toolbar').getByRole('button', {name, exact: true})

test('caret inserts link text at its saved location and continues outside the link', async ({page}) => {
  const {id} = await start(page, [{insert: 'AB'}])
  await setRange(page, id, 1)
  await expect(button(page, '链接')).toBeEnabled()
  await button(page, '链接').click()
  const pad = page.locator('link-input-pad')
  await pad.getByLabel('显示文本').fill('网站')
  await pad.getByLabel('链接地址').fill('https://example.com')
  await pad.getByRole('button', {name: '确定'}).click()
  await expect(pad).toHaveCount(0)
  const linked = [{insert: 'A'}, {insert: '网站', attributes: {'a:link': 'https://example.com'}}, {insert: 'B'}]
  await expect.poll(() => read(page, id)).toEqual(linked)
  await page.keyboard.type('X')
  await expect.poll(() => read(page, id)).toEqual([linked[0], linked[1], {insert: 'XB'}])
  await button(page, '撤销').click()
  await expect.poll(() => read(page, id)).toEqual(linked)
  await button(page, '撤销').click()
  await expect.poll(() => read(page, id)).toEqual([{insert: 'AB'}])
  await button(page, '重做').click()
  await expect.poll(() => read(page, id)).toEqual(linked)
})

test('link caret is active and turning it off preserves existing link and other styles', async ({page}) => {
  const attrs = {'a:link': 'https://example.com', 'a:bold': true}
  const {id} = await start(page, [{insert: 'AB', attributes: attrs}])
  await setRange(page, id, 1)
  await expect(button(page, '链接')).toHaveAttribute('aria-pressed', 'true')
  await button(page, '链接').click()
  await expect(button(page, '链接')).toHaveAttribute('aria-pressed', 'false')
  await page.keyboard.type('XY')
  await expect.poll(() => read(page, id)).toEqual([
    {insert: 'A', attributes: attrs}, {insert: 'XY', attributes: {'a:bold': true}}, {insert: 'B', attributes: attrs},
  ])
})

test('selected link toggles off and URL-only range insertion still works', async ({page}) => {
  const {id} = await start(page, [{insert: 'AB'}])
  await setRange(page, id, 0, 2)
  await button(page, '链接').click()
  const pad = page.locator('link-input-pad')
  await expect(pad.getByLabel('显示文本')).toHaveCount(0)
  await pad.getByLabel('链接地址').fill('https://example.com')
  await pad.getByRole('button', {name: '确定'}).click()
  await expect(button(page, '链接')).toHaveAttribute('aria-pressed', 'true')
  await button(page, '链接').click()
  await expect.poll(() => read(page, id)).toEqual([{insert: 'AB'}])
  await setRange(page, id, 2)
  await page.keyboard.type('X')
  await expect.poll(() => read(page, id)).toEqual([{insert: 'ABX'}])
})

test('empty caret link validates both fields and cancel preserves pending character style', async ({page}) => {
  const {id} = await start(page, [])
  await setRange(page, id, 0)
  await button(page, '加粗').click()
  await button(page, '链接').click()
  const pad = page.locator('link-input-pad')
  await pad.getByRole('button', {name: '确定'}).click()
  await expect(pad).toBeVisible()
  await pad.getByLabel('链接地址').fill('https://example.com')
  await pad.getByRole('button', {name: '确定'}).click()
  await expect(pad).toBeVisible()
  await pad.getByLabel('显示文本').fill('草稿')
  await page.keyboard.press('Escape')
  await expect(pad).toHaveCount(0)
  await page.keyboard.type('A')
  await expect.poll(() => read(page, id)).toEqual([{insert: 'A', attributes: {'a:bold': true}}])
})

test('caret formula inserts an embed, selected formula toggles back to text and undo restores it', async ({page}) => {
  const {id} = await start(page, [{insert: 'AB'}])
  await setRange(page, id, 1)
  await expect(button(page, '行内公式')).toBeEnabled()
  await button(page, '行内公式').click()
  const pad = page.locator('.formula-toolbar')
  await pad.getByRole('textbox').fill('x^2')
  await expect(pad.locator('math')).toBeVisible()
  await pad.getByRole('button', {name: '确定'}).click()
  const formula = [{insert: 'A'}, {insert: {latex: 'x^2'}}, {insert: 'B'}]
  await expect.poll(() => read(page, id)).toEqual(formula)
  await expect(page.locator(`[data-block-id="${id}"] .inline-formula`)).toBeVisible()
  await expect(button(page, '行内公式')).toHaveAttribute('aria-pressed', 'false')
  await page.keyboard.type('X')
  await expect.poll(() => read(page, id)).toEqual([formula[0], formula[1], {insert: 'XB'}])
  await setRange(page, id, 1, 2)
  await expect(button(page, '行内公式')).toHaveAttribute('aria-pressed', 'true')
  await button(page, '行内公式').click()
  await expect.poll(() => read(page, id)).toEqual([{insert: 'Ax^2XB'}])
  await page.keyboard.type('Y')
  await expect.poll(() => read(page, id)).toEqual([{insert: 'Ax^2YXB'}])
  await button(page, '撤销').click()
  await button(page, '撤销').click()
  await expect.poll(() => read(page, id)).toEqual([formula[0], formula[1], {insert: 'XB'}])
  await button(page, '重做').click()
  await expect.poll(() => read(page, id)).toEqual([{insert: 'Ax^2XB'}])
})

test('selected plain text converts to a formula and blank formula cancel leaves text untouched', async ({page}) => {
  const {id} = await start(page, [{insert: 'x^2'}])
  await setRange(page, id, 0, 3)
  await button(page, '行内公式').click()
  await expect.poll(() => read(page, id)).toEqual([{insert: {latex: 'x^2'}}])
  await setRange(page, id, 1)
  await button(page, '行内公式').click()
  await page.locator('.formula-toolbar').getByRole('button', {name: '确定'}).click()
  await expect(page.locator('.formula-toolbar')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.formula-toolbar')).toHaveCount(0)
  await page.keyboard.type('A')
  await expect.poll(() => read(page, id)).toEqual([{insert: {latex: 'x^2'}}, {insert: 'A'}])
})

test('open link insertion follows model changes before the saved caret', async ({page}) => {
  const {id} = await start(page, [{insert: 'AB'}])
  await setRange(page, id, 1)
  await button(page, '链接').click()
  await page.locator('block-craft-editor').evaluate((editor, id) => {
    const doc = (window as any).ng.getComponent(editor).doc
    doc.crud.applyTextDelta(id, [{insert: 'Z'}])
  }, id)
  const pad = page.locator('link-input-pad')
  await pad.getByLabel('显示文本').fill('链接')
  await pad.getByLabel('链接地址').fill('https://example.com')
  await pad.getByRole('button', {name: '确定'}).click()
  await expect.poll(() => read(page, id)).toEqual([
    {insert: 'ZA'}, {insert: '链接', attributes: {'a:link': 'https://example.com'}}, {insert: 'B'},
  ])
})

test('narrow overflow exposes caret insertion and panels stay inside the viewport', async ({page}) => {
  const {id} = await start(page, [{insert: 'AB'}])
  await page.setViewportSize({width: 320, height: 900})
  await page.locator('bc-fixed-toolbar').evaluate(el => {
    Object.assign((el as HTMLElement).style, {position: 'fixed', left: '12px', top: '8px', width: '296px', zIndex: '100'})
  })
  await setRange(page, id, 1)
  await expect(page.locator('bc-fixed-toolbar')).toHaveClass(/toolbar-layout--(?:compact|narrow)/)
  await page.mouse.move(0, 0)
  await button(page, '更多格式').hover()
  const link = page.locator('[data-toolbar-command="link"]')
  await expect(link).not.toHaveAttribute('aria-disabled', 'true')
  await link.click()
  const pad = page.locator('link-input-pad')
  await expect(pad).toBeVisible()
  const box = await pad.boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(320)
  await pad.getByRole('button', {name: '取消'}).click()
  await expect.poll(() => read(page, id)).toEqual([{insert: 'AB'}])
  await button(page, '更多格式').hover()
  await page.locator('[data-toolbar-command="formula"]').click()
  const formulaPad = page.locator('.formula-toolbar')
  await expect(formulaPad).toBeVisible()
  const formulaBox = await formulaPad.boundingBox()
  expect(formulaBox!.x).toBeGreaterThanOrEqual(0)
  expect(formulaBox!.x + formulaBox!.width).toBeLessThanOrEqual(320)
  await formulaPad.getByRole('textbox').fill('x')
  await formulaPad.getByRole('button', {name: '确定'}).click()
  await setRange(page, id, 1, 2)
  await button(page, '更多格式').hover()
  await expect(page.locator('[data-toolbar-command="formula"]')).toHaveClass(/cs-menu-item-selected/)
})

test('readonly transition closes input and removing its source cannot modify another paragraph', async ({page}) => {
  const {id, plain} = await start(page, [{insert: 'AB'}])
  await setRange(page, id, 1)
  await button(page, '链接').click()
  await page.locator('block-craft-editor').evaluate(editor => {
    ;(window as any).ng.getComponent(editor).doc.readonlySwitch$.next(true)
  })
  await expect(page.locator('link-input-pad')).toHaveCount(0)
  await expect(button(page, '链接')).toBeDisabled()
  await page.locator('block-craft-editor').evaluate(editor => {
    ;(window as any).ng.getComponent(editor).doc.readonlySwitch$.next(false)
  })
  await setRange(page, id, 1)
  await button(page, '行内公式').click()
  await page.locator('block-craft-editor').evaluate((editor, id) => {
    const doc = (window as any).ng.getComponent(editor).doc
    doc.crud.deleteBlocks(doc.rootId, doc.model.getChildrenIds(doc.rootId).indexOf(id), 1)
  }, id)
  await expect(page.locator('.formula-toolbar')).toHaveCount(0)
  await expect.poll(() => read(page, plain)).toEqual([{insert: 'plain'}])
})


test('plain-text blocks and cross-block selections keep reference actions disabled', async ({page}) => {
  const {id, plain} = await start(page, [{insert: 'AB'}])
  const codeId = await page.locator('block-craft-editor').evaluate(async editor => {
    const doc = (window as any).ng.getComponent(editor).doc
    const code = doc.schemas.createSnapshot('code', ['code'])
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [code])
    await doc.navigateToBlock(code.id)
    return code.id
  })
  await setRange(page, codeId, 1)
  await expect(button(page, '链接')).toBeDisabled()
  await expect(button(page, '行内公式')).toBeDisabled()
  await page.locator('block-craft-editor').evaluate((editor, ids) => {
    const doc = (window as any).ng.getComponent(editor).doc
    doc.selection.setSelection({blockId: ids.id, type: 'text', offset: 0}, {blockId: ids.plain, type: 'text', offset: 1})
  }, {id, plain})
  await expect(button(page, '链接')).toBeDisabled()
  await expect(button(page, '行内公式')).toBeDisabled()
})

test('floating toolbar keeps the shared link panel URL-only and applies its selected range', async ({page}) => {
  const {id} = await start(page, [{insert: 'AB'}])
  await setRange(page, id, 0, 2)
  const action = page.locator('.float-text-toolbar bc-float-toolbar-item[name="link"]')
  await expect(action).toBeVisible()
  // The floating toolbar intentionally ignores clicks during its first 100ms.
  await page.waitForTimeout(120)
  await action.click()
  const pad = page.locator('link-input-pad')
  await expect(pad.getByLabel('显示文本')).toHaveCount(0)
  await pad.getByLabel('链接地址').fill('https://example.com')
  await pad.getByRole('button', {name: '确定'}).click()
  await expect.poll(() => read(page, id)).toEqual([{insert: 'AB', attributes: {'a:link': 'https://example.com'}}])
})
