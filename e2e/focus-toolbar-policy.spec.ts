import {expect, test, type Page} from '@playwright/test'

async function setup(page: Page) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
}
const toolbars = 'bc-object-format-toolbar, bc-object-group-toolbar, bc-image-toolbar, callout-block-toolbar, render-unit-toolbar, bc-inline-object-toolbar, bc-inline-image-toolbar, bc-material-toolbar, .float-text-toolbar, .text-marker-toolbar'

for (const [flavour, selector] of [
  ['text-box', 'bc-object-format-toolbar'], ['word-art', 'bc-object-format-toolbar'],
  ['image', 'bc-image-toolbar'], ['callout', 'callout-block-toolbar'],
  ['render-unit', 'render-unit-toolbar'], ['sticker', 'bc-inline-object-toolbar'], ['date-card', 'bc-material-toolbar'],
]) {
  test(`focus closes and prevents ${flavour} toolbar; mixed restores it`, async ({page}) => {
    await setup(page)
    const id = await page.evaluate(async flavour => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      const params: Record<string, any[]> = {
        'text-box': ['文本框正文', {width: 300, height: 140}], 'word-art': ['艺术字正文'],
        image: [{src: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="90"><rect width="180" height="90" fill="teal"/></svg>'), wr: 35, ar: 2}],
        callout: [], 'render-unit': [], sticker: ['sunburst'], 'date-card': [],
      }
      const block = doc.schemas.createSnapshot(flavour, params[flavour])
      doc.crud.insertBlockSnapshots(doc.rootId, 0, [block])
      await doc.navigateToBlock(block.id)
      const target = doc.getBlockById(block.id)
      if (flavour === 'callout') doc.selection.setCursorAt(doc.getBlockById(target.childrenIds[0]), 0)
      else doc.selection.selectBlock(target)
      return block.id
    }, flavour)
    const toolbar = page.locator(selector)
    await expect(toolbar).toBeVisible()
    await page.getByRole('button', {name: '专注内容', exact: true}).click()
    await expect(page.locator(toolbars)).toHaveCount(0)
    const block = page.locator(`[data-block-id="${id}"]`)
    if (flavour === 'callout') await block.locator('.edit-container').first().click()
    else await block.click({position: {x: 20, y: 20}})
    await page.evaluate(id => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      const target = doc.getBlockById(id)
      if (target.flavour === 'callout') doc.selection.setCursorAt(doc.getBlockById(target.childrenIds[0]), 0)
      else doc.selection.selectBlock(target)
    }, id)
    // Cover the image/region/material timers and text toolbar debounce.
    await page.waitForTimeout(450)
    await expect(page.locator(toolbars)).toHaveCount(0)
    await page.getByRole('button', {name: '图文混排', exact: true}).click()
    await page.evaluate(id => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      const target = doc.getBlockById(id)
      if (target.flavour === 'callout') doc.selection.setCursorAt(doc.getBlockById(target.childrenIds[0]), 0)
      else doc.selection.selectBlock(target)
    }, id)
    await expect(toolbar).toBeVisible()
  })
}

test('focus keeps typing and formatting shortcuts while disabling floating text UI', async ({page}) => {
  await setup(page)
  const id = await page.evaluate(async () => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const p = doc.schemas.createSnapshot('paragraph', ['专注编辑正文'])
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [p])
    await doc.navigateToBlock(p.id)
    return p.id
  })
  const text = page.locator(`[data-block-id="${id}"] .edit-container`)
  await text.click()
  await text.evaluate(element => {
    const block = (window as any).ng.getComponent(element.closest('[data-block-id]'))
    block.setInlineRange(0, 3)
  })
  await expect(page.locator('.float-text-toolbar')).toBeVisible()
  await page.getByRole('button', {name: '专注内容', exact: true}).click()
  await expect(page.locator('.float-text-toolbar')).toHaveCount(0)
  await text.click()
  await text.evaluate(element => {
    const block = (window as any).ng.getComponent(element.closest('[data-block-id]'))
    block.setInlineRange(0, 3)
  })
  await page.waitForTimeout(450)
  await expect(page.locator('.float-text-toolbar')).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+b')
  expect(await page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    return doc.getBlockById(id).textDeltas().some((delta: any) => delta.attributes?.['a:bold'])
  }, id)).toBe(true)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.type('FOCUS')
  await expect(text).toContainText('FOCUS')
})

for (const flavour of ['image', 'sticker']) {
  test(`focus also suppresses inline ${flavour} controls while preserving Embed selection`, async ({page}) => {
    await setup(page)
    await page.evaluate(async flavour => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      const params = flavour === 'sticker' ? ['sunburst'] : [{src: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="90"><rect width="180" height="90" fill="teal"/></svg>'), wr: 35, ar: 2}]
      const snapshot = doc.schemas.createSnapshot(flavour, params)
      doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot])
      await doc.navigateToBlock(snapshot.id)
      if (!doc.placement.setObjectLayout(doc.getBlockById(snapshot.id), 'inline')) throw new Error('Inline conversion failed')
    }, flavour)
    const inline = page.locator(flavour === 'image' ? '.bc-inline-image-shell' : '.bc-inline-object-shell[data-bc-inline-object="sticker"]')
    await inline.click()
    const toolbar = page.locator(flavour === 'image' ? 'bc-inline-image-toolbar' : 'bc-inline-object-toolbar')
    await expect(toolbar).toBeVisible()
    await page.getByRole('button', {name: '专注内容', exact: true}).click()
    await expect(toolbar).toHaveCount(0)
    await inline.click()
    await page.waitForTimeout(450)
    await expect(page.locator(toolbars)).toHaveCount(0)
    const range = await inline.evaluate(element => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      const selection = doc.selection.value
      return {start: selection.start.offset, end: selection.end.offset, same: selection.isInSameBlock}
    })
    expect(range.same).toBe(true)
    expect(range.end - range.start).toBe(1)
    await page.getByRole('button', {name: '图文混排', exact: true}).click()
    await inline.click()
    await expect(toolbar).toBeVisible()
  })
}

test('focus toolbar switches remain configurable and cancel pending opens', async ({page}) => {
  await setup(page)
  await page.evaluate(async () => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const snapshot = doc.schemas.createSnapshot('render-unit', [])
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot])
    await doc.navigateToBlock(snapshot.id)
    doc.selection.selectBlock(doc.getBlockById(snapshot.id))
    // Switch before the region's delayed toolbar can open.
    doc.interaction.configure({preset: 'immersive'})
  })
  await page.waitForTimeout(450)
  await expect(page.locator('render-unit-toolbar')).toHaveCount(0)
  await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.interaction.setOverrides({plugins: {regionToolbar: {enabled: true}}})
  })
  await expect(page.locator('render-unit-toolbar')).toBeVisible()
  const policy = await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    return {mode: doc.interaction.value, text: doc.interaction.policy.plugins.textToolbar.enabled}
  })
  expect(policy).toEqual({mode: 'immersive', text: false})
  await page.getByRole('button', {name: '专注内容', exact: true}).click()
  await expect(page.locator('render-unit-toolbar')).toHaveCount(0)
})
