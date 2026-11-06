import {expect, test} from '@playwright/test'

for (const flavour of ['shape', 'word-art'] as const) {
  test(`${flavour} 文字不再提供图片填充，保留渐变及形状图片填充`, async ({page}) => {
    await page.setViewportSize({width: 1440, height: 1200})
    await page.route('**/assets/legacy-text-fill.png', route => route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#123456"/></svg>',
    }))
    await page.goto('/')
    await page.getByRole('button', {name: '初始化', exact: true}).click()
    await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
    const id = await page.locator('block-craft-editor').evaluate(async (editor, kind) => {
      const doc = (window as any).ng.getComponent(editor).doc
      const snapshot = kind === 'shape'
        ? doc.schemas.createSnapshot('shape', ['rectangle', '形状文字'])
        : doc.schemas.createSnapshot('word-art', ['艺术字', {width: 360, height: 120}])
      doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot])
      await doc.navigateToBlock(snapshot.id)
      doc.selection.selectOrSetCursorAtBlock(snapshot.id, true)
      const style = doc.objectFormat.resolve(snapshot.id).textStyle
      doc.objectFormat.updateSelection([snapshot.id], {textStyle: {...style, fill: {
        type: 'picture', src: '/assets/legacy-text-fill.png', fit: 'cover',
        positionX: 50, positionY: 50, opacity: 0.7,
      }}})
      return snapshot.id as string
    }, flavour)
    if (flavour === 'word-art') {
      const block = page.locator(`block-craft-editor [data-block-id="${id}"]`)
      await block.hover()
      await block.getByRole('button', {name: '选中艺术字并拖动', exact: true}).click()
    }
    const readFill = () => page.locator('block-craft-editor').evaluate((editor, blockId) => {
      return (window as any).ng.getComponent(editor).doc.objectFormat.resolve(blockId).textStyle.fill
    }, id)
    const before = await readFill()
    const toolbar = page.locator('[data-bc-object-format-toolbar]')
    await toolbar.getByRole('button', {name: '文本选项', exact: true}).click()
    await toolbar.getByText('外观', {exact: true}).click()
    const effects = toolbar.locator('[data-object-format-section="text-effects"]')
    await expect(effects.locator('input[type=url], [data-object-format-picture-config="text"]')).toHaveCount(0)
    await expect(effects.getByText('上传文字图片', {exact: true})).toHaveCount(0)
    await effects.locator('bc-shape-fill-panel').getByRole('combobox').click()
    const options = page.getByRole('listbox').filter({has: page.getByRole('option', {name: '纯色填充', exact: true})})
    await expect(options.getByRole('option', {name: '图片填充', exact: true})).toHaveCount(0)
    await expect(options.getByRole('option', {name: '渐变填充', exact: true})).toBeVisible()
    expect(await readFill()).toEqual(before)
    await options.getByRole('option', {name: '渐变填充', exact: true}).click()
    await expect(effects.getByRole('listbox', {name: '内置渐变', exact: true})).toBeVisible()
    await expect.poll(async () => (await readFill()).type).toBe('linear-gradient')
    await expect(effects.getByText('文字阴影', {exact: true})).toBeVisible()
    if (flavour === 'shape') {
      await toolbar.getByRole('button', {name: '形状选项', exact: true}).click()
      const fill = toolbar.locator('[data-object-format-section="shape-fill"]')
      await fill.locator('bc-shape-fill-panel').getByRole('combobox').click()
      await page.getByRole('option', {name: '图片填充', exact: true}).click()
      await expect(fill.locator('input[type=url]')).toBeVisible()
      await expect(fill.getByRole('button', {name: '上传图片', exact: true})).toBeVisible()
    }
  })
}
