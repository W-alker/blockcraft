import {expect, test, type Page} from '@playwright/test'

async function initialize(page: Page) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  await page.getByTestId('interaction-mode-debug').locator('summary').click()
}
const readSelection = (page: Page) => page.evaluate(() => (window as any).ng
  .getComponent(document.querySelector('block-craft-editor')).doc.selection.value?.toJSON())

for (const flavour of ['text-box', 'word-art', 'shape', 'image', 'render-unit']) {
  for (const absolute of (flavour === 'render-unit' ? [false] : [false, true])) {
    test(`design content toolbar for ${flavour} (${absolute ? 'absolute' : 'flow'})`, async ({page}) => {
      await initialize(page)
      const id = await page.evaluate(async ({flavour, absolute}) => {
        const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
        const canvas = document.createElement('canvas'); canvas.width = 280; canvas.height = 120
        const args = flavour === 'image' ? [{src: canvas.toDataURL(), wr: 35, ar: 2}]
          : flavour === 'render-unit' ? [{}, {width: 420, height: 180}]
          : flavour === 'shape' ? ['rectangle', '对象内部正文'] : ['对象内部正文', {width: 360, height: 150}]
        const block = doc.schemas.createSnapshot(flavour, args)
        if (flavour === 'image') block.children = [doc.schemas.createSnapshot('caption', ['图片内部说明'])]
        if (flavour === 'render-unit') block.children = [doc.schemas.createSnapshot('paragraph', ['内容区域内部正文'])]
        doc.crud.insertBlockSnapshots(doc.rootId, 0, [block])
        if (absolute) doc.placement.setMode(block.id, 'absolute')
        await doc.navigateToBlock(block.id)
        doc.selection.blur()
        return block.id
      }, {flavour, absolute})
      const block = page.locator(`[data-block-id="${id}"]`)
      const text = block.locator('.edit-container').first()
      const toolbar = page.locator(flavour === 'image' ? 'bc-image-toolbar' : flavour === 'render-unit' ? 'render-unit-toolbar' : 'bc-object-format-toolbar')
      await text.click()
      await expect(toolbar).toHaveCount(0)
      const before = await readSelection(page)
      await page.getByRole('combobox', {name: '编辑模式', exact: true}).selectOption('design')
      await expect(toolbar).toBeVisible()
      expect(await readSelection(page)).toEqual(before)
      if (flavour === 'word-art') await expect(block).not.toHaveClass(/word-art-block--object-selected/)
      const originalToolbar = await toolbar.elementHandle()
      await text.click()
      await page.keyboard.type('EDIT')
      await expect(text).toContainText('EDIT')
      await expect(toolbar).toBeVisible()
      expect(await originalToolbar!.evaluate(element => element.isConnected)).toBe(true)
      expect((await readSelection(page)).anchor.type).toBe('text')
      // Mode changes alone re-evaluate the same live internal selection.
      await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.interactionMode.set('mixed'))
      await expect(toolbar).toHaveCount(0)
      await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.interactionMode.set('design'))
      await expect(toolbar).toBeVisible()
      if (flavour === 'text-box' || flavour === 'word-art') {
        const props = await page.evaluate(id => {
          const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
          doc.crud.undoManager.clearHistory()
          const {textFit: measuredFit, ...props} = doc.model.getProps(id)
          return props
        }, id)
        await toolbar.getByRole('button', {name: /恢复内容自适应|切换为固定尺寸/}).click()
        await expect.poll(() => page.evaluate(id => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.model.getProps(id), id)).not.toEqual(props)
        await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.crud.undoManager.undo())
        await expect.poll(() => page.evaluate(id => {
          // textFit is the existing auto-fit measurement cache, not a user setting.
          const {textFit: measuredFit, ...props} = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.model.getProps(id)
          return props
        }, id)).toEqual(props)
        expect((await readSelection(page)).anchor.type).toBe('text')
      }
      await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.toggleReadonly(true))
      await expect(toolbar).toHaveCount(0)
    })
  }
}

test('design group contents show only the nearest member toolbar', async ({page}) => {
  await initialize(page)
  const ids = await page.evaluate(async () => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const member = doc.schemas.createSnapshot('text-box', ['组合内成员正文', {width: 300, height: 120}])
    member.props.position = '30 30'
    const group = doc.schemas.createSnapshot('object-group', [{width: 480, height: 200}, [member]])
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [group])
    await doc.navigateToBlock(group.id)
    doc.interactionMode.set('design')
    return {group: group.id, member: member.id}
  })
  const text = page.locator(`[data-block-id="${ids.member}"] .edit-container`).first()
  await text.click()
  await text.click()
  await expect(page.locator('bc-object-format-toolbar')).toBeVisible()
  await expect(page.locator('bc-object-group-toolbar')).toHaveCount(0)
  await page.keyboard.type('MEMBER')
  await expect(text).toContainText('MEMBER')
  await page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.selection.selectBlock(id)
  }, ids.group)
  await expect(page.locator('bc-object-group-toolbar')).toBeVisible()
  await expect(page.locator('bc-object-format-toolbar')).toHaveCount(0)
})

test('design uses the nearest object for nested and multi-paragraph selections', async ({page}) => {
  await initialize(page)
  const ids = await page.evaluate(async () => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const a = doc.schemas.createSnapshot('paragraph', ['第一段内容'])
    const b = doc.schemas.createSnapshot('paragraph', ['第二段内容'])
    const nested = doc.schemas.createSnapshot('text-box', ['内层对象正文', {width: 250, height: 100}])
    const box = doc.schemas.createSnapshot('text-box', ['', {width: 450, height: 280}])
    box.children = [a, b, nested]
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [box])
    await doc.navigateToBlock(box.id)
    doc.interactionMode.set('design')
    doc.root.hostElement.focus()
    doc.selection.setCursorAt(doc.getBlockById(a.id), 0)
    doc.selection.extendTo(doc.getBlockById(b.id), 2)
    return {box: box.id, a: a.id, nested: nested.id, inner: nested.children[0].id}
  })
  const toolbar = page.locator('bc-object-format-toolbar')
  await expect(toolbar).toBeVisible()
  const targets = () => toolbar.evaluate(el => (window as any).ng.getComponent(el).state.blockIds)
  expect(await targets()).toEqual([ids.box])
  // Dismiss the range's text-format popup before clicking the object below it.
  await page.keyboard.press('ArrowLeft')
  await page.locator(`[data-block-id="${ids.inner}"] .edit-container`).click()
  await expect.poll(targets).toEqual([ids.nested])
  await page.evaluate(({a, inner}) => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.selection.setCursorAt(doc.getBlockById(a), 0)
    doc.selection.extendTo(doc.getBlockById(inner), 2)
  }, ids)
  await expect(toolbar).toHaveCount(0)
})
