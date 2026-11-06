import {expect, test, type Locator} from '@playwright/test'

async function expectBounds(content: Locator) {
  await expect.poll(() => content.evaluate(element => {
    const surface = element.closest('.text-box-block__surface')!
    const outer = surface.getBoundingClientRect(), inner = element.getBoundingClientRect()
    // Asymmetric physical margins must stay on their original frame edges.
    return Math.max(...[
      inner.top - outer.top - 7, outer.right - inner.right - 13,
      outer.bottom - inner.bottom - 19, inner.left - outer.left - 23,
    ].map(Math.abs))
  })).toBeLessThan(1)
  await expect(content).toHaveCSS('overflow', 'hidden')
}

for (const absolute of [false, true]) {
  for (const direction of ['rotate-90', 'rotate-270']) {
    test(`${absolute ? 'floating' : 'flow'} ${direction} contains text during resize and replay`, async ({page}, testInfo) => {
      await page.routeWebSocket('**', socket => socket.close())
      await page.setViewportSize({width: 1440, height: 1000})
      await page.goto('/')
      await page.getByRole('button', {name: '初始化', exact: true}).click()
      await page.waitForFunction(() => (window as any).ng
        ?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
      const id = await page.evaluate(async ({absolute, direction}) => {
        const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
        const box = doc.schemas.createSnapshot('text-box', ['先帝创业未半而中道崩殂。'.repeat(40), {
          width: 360, height: 180, textDirection: direction, textPadding: '7 13 19 23',
          textAlignment: 'left top', textAutoFit: 'none',
        }])
        doc.crud.insertBlockSnapshots(doc.rootId, 0, [box])
        await doc.navigateToBlock(box.id)
        if (absolute) doc.placement.setMode(doc.getBlockById(box.id), 'absolute')
        await doc.navigateToBlock(box.id)
        const block = doc.getBlockById(box.id)
        block.hostElement.scrollIntoView({block: 'center'})
        doc.selection.selectBlock(block)
        doc.crud.undoManager.clearHistory()
        return box.id as string
      }, {absolute, direction})
      const block = page.locator(`block-craft-editor [data-block-id="${id}"]`)
      const content = block.locator('.text-box-block__content')
      await expectBounds(content)
      for (const [side, dx, dy] of [['east', -140, 0], ['south', 0, 160]] as const) {
        const surface = block.locator('.text-box-block__surface')
        const before = (await surface.boundingBox())!
        const handle = block.locator(`[data-handle="${side}"]`)
        await handle.hover()
        const rect = (await handle.boundingBox())!
        const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2
        await page.mouse.move(x, y)
        await page.mouse.down()
        await page.mouse.move(x + dx, y + dy, {steps: 8})
        await expect.poll(async () => {
          const after = (await surface.boundingBox())!
          return Math.abs(after.width - before.width) + Math.abs(after.height - before.height)
        }).toBeGreaterThan(100)
        await expectBounds(content)
        await page.mouse.up()
        await expectBounds(content)
      }
      await block.screenshot({path: testInfo.outputPath('resized.png')})
      // Content stays scrollable through the caret despite clipping its paint.
      await page.evaluate(id => {
        const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
        doc.getBlockById(id).enterEditing(false)
      }, id)
      await page.keyboard.type('Z')
      await expect(content).toContainText('Z')
      await expectBounds(content)
      for (const next of ['horizontal', 'vertical-rl', direction]) {
        await page.evaluate(({id, next}) => {
          const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
          doc.getBlockById(id).updateProps({textDirection: next})
        }, {id, next})
        await expect(content).toHaveCSS('writing-mode', next === 'vertical-rl' ? 'vertical-rl' : 'horizontal-tb')
        await expect.poll(() => content.evaluate(el => el.style.transform))
          .toBe(next.startsWith('rotate-') ? `rotate(${next.slice(7)}deg)` : '')
        await expectBounds(content)
      }
      await page.locator('playground-home').evaluate(app => {
        (window as any).ng.getComponent(app).syncSnapshotViewerFromEditor()
      })
      await expectBounds(page.locator(`bc-snapshot-viewer [data-block-id="${id}"] .text-box-block__content`))
    })
  }
}
