import {expect, test, type Page} from '@playwright/test'

test.use({viewport: {width: 1600, height: 1000}})

async function setup(page: Page, flavour: string, grouped: boolean) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  return page.evaluate(async ({flavour, grouped}) => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const snap = doc.schemas.createSnapshot(flavour, [])
    snap.props = {...snap.props, width: 240, height: 100}
    const id = doc.placement.insertAbsoluteSnapshot(snap, {anchorRect: null})
    doc.crud.updateBlockProps(id, {position: '80 80'})
    let groupId: string | null = null
    if (grouped) {
      const sibling = doc.schemas.createSnapshot('shape', ['rectangle'])
      sibling.props = {...sibling.props, width: 80, height: 60}
      const siblingId = doc.placement.insertAbsoluteSnapshot(sibling, {anchorRect: null})
      doc.crud.updateBlockProps(siblingId, {position: '400 250'})
      groupId = doc.placement.group([id, siblingId])
    }
    await doc.navigateToBlock(groupId ?? id)
    doc.selection.blur()
    doc.crud.undoManager.clearHistory()
    return {id, groupId}
  }, {flavour, grouped})
}

async function geometry(page: Page, id: string) {
  return page.locator(`[data-block-id="${id}"]`).evaluate(el => {
    const r = el.getBoundingClientRect()
    return {x: r.x, y: r.y, width: r.width, height: r.height}
  })
}

for (const flavour of ['person-card', 'date-card', 'weather']) {
  for (const grouped of [false, true]) {
    test(`${flavour}: ${grouped ? '组合成员' : '独立浮动'}本体移动、撤销与取消`, async ({page}) => {
      const {id, groupId} = await setup(page, flavour, grouped)
      const before = await geometry(page, id)
      const x = before.x + before.width * .35, y = before.y + before.height * .55
      if (groupId) {
        await page.mouse.click(x, y)
        await expect(page.locator(`[data-block-id="${groupId}"]`)).toHaveClass(/selected/)
      }
      await page.mouse.move(x, y)
      await page.mouse.down()
      await page.mouse.move(x + 60, y + 40, {steps: 6})
      const preview = await geometry(page, id)
      expect(preview.x).toBeCloseTo(before.x + 60, 0)
      expect(preview.y).toBeCloseTo(before.y + 40, 0)
      await page.mouse.up()
      const moved = await geometry(page, id)
      expect(moved.x).toBeCloseTo(preview.x, 0)
      expect(moved.y).toBeCloseTo(preview.y, 0)
      expect(moved.width).toBe(before.width)
      expect(moved.height).toBe(before.height)
      await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.crud.undoManager.undo())
      await expect.poll(() => geometry(page, id)).toEqual(before)
      await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.crud.undoManager.redo())
      await expect.poll(() => geometry(page, id)).toEqual(moved)
      if (groupId) await page.mouse.click(x + 60, y + 40)
      await page.mouse.move(x + 60, y + 40)
      await page.mouse.down()
      await page.mouse.move(x + 100, y + 70, {steps: 5})
      await page.keyboard.press('Escape')
      await page.mouse.up()
      await expect.poll(() => geometry(page, id)).toEqual(moved)
    })
  }
}
