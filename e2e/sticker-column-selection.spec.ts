import {expect, test} from '@playwright/test'

test('sticker outside columns keeps its intrinsic width and can be reselected', async ({page}) => {
  await page.goto('/')
  await page.getByText('模板装饰 →').click()
  await page.getByRole('button', {name: '初始化'}).click()

  const paragraph = page.locator('.paragraph-block').first()
  await paragraph.click()
  await page.getByRole('button', {name: '插入日光徽章'}).click()

  const sticker = page.locator('.sticker-block').first()
  await expect(sticker).toBeVisible()
  const widths = await sticker.evaluate(element => ({
    sticker: element.getBoundingClientRect().width,
    parent: element.parentElement!.getBoundingClientRect().width,
  }))
  expect(widths.sticker).toBeLessThan(widths.parent / 2)

  await paragraph.click()
  await sticker.locator('img').click()
  await expect(sticker).toHaveClass(/\bselected\b/)
})

test('clicking a sticker inside columns selects it again after focus moves away', async ({page}) => {
  await page.goto('/')
  await page.getByText('模板装饰 →').click()
  await page.getByRole('button', {name: '初始化'}).click()
  await page.getByText('多栏布局', {exact: true}).last().click()

  const firstParagraph = page.locator('.column-block .paragraph-block').first()
  // 点击段落起点，避开贴纸上方浮动工具栏覆盖的段落中部。
  await firstParagraph.click({position: {x: 8, y: 8}})
  await page.getByRole('button', {name: '插入日光徽章'}).click()

  const sticker = page.locator('.column-block .sticker-block').first()
  await expect(sticker).toBeVisible()
  // 点击段落起点，避开贴纸上方浮动工具栏覆盖的段落中部。
  await firstParagraph.click({position: {x: 8, y: 8}})
  await expect(sticker).not.toHaveClass(/\bselected\b/)

  await sticker.locator('img').click()
  await expect(sticker).toHaveClass(/\bselected\b/)
  await expect(sticker.locator('shape-resizer [data-handle="east"]')).toBeVisible()

  await sticker.locator('img').click()
  await expect(sticker).toHaveClass(/\bselected\b/)

  const surface = sticker.locator('.sticker-block__surface')
  const beforeWidth = await surface.evaluate(element => element.getBoundingClientRect().width)
  const east = await sticker.locator('shape-resizer [data-handle="east"]').boundingBox()
  expect(east).not.toBeNull()
  await page.mouse.move(east!.x + east!.width / 2, east!.y + east!.height / 2)
  await page.mouse.down()
  await page.mouse.move(east!.x + east!.width / 2 + 50, east!.y + east!.height / 2, {steps: 5})
  await page.mouse.up()
  await expect.poll(() => surface.evaluate(element => element.getBoundingClientRect().width))
    .toBeGreaterThan(beforeWidth + 20)
})

test('clicking the blank area beside a column sticker opens its gap for typing', async ({page}) => {
  await page.goto('/')
  await page.getByText('模板装饰 →').click()
  await page.getByRole('button', {name: '初始化'}).click()
  await page.getByText('多栏布局', {exact: true}).last().click()
  await page.locator('.column-block .paragraph-block').first().click()
  await page.getByRole('button', {name: '插入日光徽章'}).click()

  const firstColumn = page.locator('.column-block').first()
  const sticker = firstColumn.locator('.sticker-block')
  const stickerBox = await sticker.boundingBox()
  const columnBox = await firstColumn.boundingBox()
  expect(stickerBox).not.toBeNull()
  expect(columnBox).not.toBeNull()
  await page.mouse.click(
    (stickerBox!.x + stickerBox!.width + columnBox!.x + columnBox!.width) / 2,
    stickerBox!.y + stickerBox!.height / 2,
  )

  const gap = await sticker.evaluate(element => {
    const doc = (window as any).ng.getComponent(element).doc
    const anchor = doc.selection.value?.anchor
    return {type: anchor?.type, blockId: anchor?.blockId, side: anchor?.side}
  })
  expect(gap).toEqual({type: 'gap', blockId: await sticker.getAttribute('data-block-id'), side: 'after'})

  await page.keyboard.type('X')
  await expect(sticker).toBeVisible()
  await expect(firstColumn.locator('.paragraph-block').filter({hasText: 'X'})).toHaveCount(1)
  await expect(page.locator('.column-block').nth(1)).not.toContainText('X')
})

test('a render-unit resolves the blank space beside its flow sticker to a local gap', async ({page}) => {
  await page.goto('/')
  await page.getByText('模板装饰 →').click()
  await page.getByRole('button', {name: '初始化'}).click()
  await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('.paragraph-block')).doc
    const unit = doc.schemas.createSnapshot('render-unit', [])
    unit.children = [doc.schemas.createSnapshot('sticker', ['sunburst'])]
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [unit])
  })
  const unit = page.locator('.render-unit-block').first()
  const sticker = unit.locator('.sticker-block')
  await expect(sticker).toBeVisible()
  const content = unit.locator('.children-render-container')
  const contentBox = await content.boundingBox()
  const stickerBox = await sticker.boundingBox()
  expect(contentBox).not.toBeNull()
  expect(stickerBox).not.toBeNull()
  await page.mouse.click(
    (stickerBox!.x + stickerBox!.width + contentBox!.x + contentBox!.width) / 2,
    stickerBox!.y + stickerBox!.height / 2,
  )
  const anchor = await sticker.evaluate(element => {
    const doc = (window as any).ng.getComponent(element).doc
    return doc.selection.value?.anchor
  })
  expect(anchor).toEqual(expect.objectContaining({
    type: 'gap', blockId: await sticker.getAttribute('data-block-id'), side: 'after',
  }))
})

test('sticker can float, move by its body and return as an editable inline sticker', async ({page}) => {
  await page.goto('/')
  await page.getByText('模板装饰 →').click()
  await page.getByRole('button', {name: '初始化'}).click()
  await page.locator('.paragraph-block').first().click()
  await page.getByRole('button', {name: '插入日光徽章'}).click()

  const sticker = page.locator('.sticker-block').first()
  await sticker.locator('img').click()
  const toolbar = page.locator('bc-inline-object-toolbar')
  await expect(toolbar.getByLabel('浮于文字上方')).toBeVisible()
  await toolbar.getByLabel('浮于文字上方').click()
  await expect.poll(() => sticker.evaluate(element => {
    const block = (window as any).ng.getComponent(element)
    return block.doc.placement.getState(block).mode
  })).toBe('absolute')

  const before = await sticker.evaluate(element => {
    const block = (window as any).ng.getComponent(element)
    return block.doc.placement.getState(block).x
  })
  const box = await sticker.locator('img').boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.down()
  await page.mouse.move(box!.x + box!.width / 2 + 70, box!.y + box!.height / 2, {steps: 8})
  await page.mouse.up()
  await expect.poll(() => sticker.evaluate(element => {
    const block = (window as any).ng.getComponent(element)
    return block.doc.placement.getState(block).x
  })).toBeGreaterThan(before + 20)

  await sticker.locator('img').click()
  await toolbar.getByLabel('嵌入型').click()
  const inline = page.locator('.bc-inline-object-shell[data-bc-inline-object="sticker"]')
  await expect(inline).toBeVisible()
  await expect(sticker).toHaveCount(0)
  await inline.click()
  await expect(page.locator('bc-inline-object-toolbar').getByLabel('上下型')).toBeVisible()
  await page.locator('bc-inline-object-toolbar').getByLabel('上下型').click()
  await expect(page.locator('.sticker-block')).toHaveCount(1)
})
