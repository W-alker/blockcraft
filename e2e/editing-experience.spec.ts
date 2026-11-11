import {expect, test, type Page} from '@playwright/test'

async function setup(page: Page) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  return page.evaluate(async () => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const box = doc.schemas.createSnapshot('text-box', ['拖动档位，保留这段文字的选区', {width: 360, height: 160}])
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [box])
    await doc.navigateToBlock(box.id)
    doc.crud.undoManager.clearHistory()
    const original = doc.interaction.configure.bind(doc.interaction)
    ;(window as any).profileWrites = 0
    doc.interaction.configure = (config: any) => { (window as any).profileWrites++; return original(config) }
    return box.id
  })
}
const state = (page: Page) => page.evaluate(() => {
  const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
  return {policy: doc.interaction.policy, preset: doc.interaction.value, experience: doc.interaction.experience,
    overrides: doc.interaction.overrides, writes: (window as any).profileWrites,
    selection: doc.selection.value?.toJSON(), undo: doc.crud.undoManager.isCanUndo()}
})

test('floating template keeps every released middle stop across repeated fast drags', async ({page}) => {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/?example=floating-layout')
  await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  const slider = page.getByRole('slider', {name: '编辑体验档位'})
  await slider.scrollIntoViewIfNeeded()
  for (const value of [4, 2, 3, 1, 5, 4, 3, 2]) {
    const bounds = (await slider.boundingBox())!
    const y = bounds.y + bounds.height / 2
    const current = Number(await slider.getAttribute('aria-valuenow'))
    const x = (level: number) => bounds.x + 14 + (bounds.width - 28) * (level - 1) / 4
    await page.mouse.move(x(current), y)
    await page.mouse.down()
    await page.mouse.move(x(value), y, {steps: 3})
    await page.mouse.up()
    await expect(slider).toHaveAttribute('aria-valuenow', String(value))
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await expect(slider).toHaveAttribute('aria-valuenow', String(value))
    await expect(page.getByTestId('editing-experience')).not.toHaveClass(/is-custom|is-dragging/)
  }
})

test('dial previews discrete stops and commits one snapped profile while preserving text selection', async ({page}, testInfo) => {
  const id = await setup(page)
  const box = page.locator(`[data-block-id="${id}"]`)
  await box.locator('.edit-container').first().click()
  const before = await state(page)
  const slider = page.getByRole('slider', {name: '编辑体验档位'})
  await slider.scrollIntoViewIfNeeded()
  const bounds = (await slider.boundingBox())!
  const y = bounds.y + bounds.height / 2
  await page.mouse.move(bounds.x + bounds.width / 2, y)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width - 22, y, {steps: 12})
  await expect(page.getByTestId('editing-experience')).toHaveClass(/is-dragging/)
  await expect(slider).toHaveAttribute('aria-valuetext', '精细设计')
  const pending = await state(page)
  expect(pending.preset).toBe('mixed')
  expect(pending.writes).toBe(0)
  expect(pending.selection).toEqual(before.selection)
  await page.getByTestId('editing-experience').screenshot({path: testInfo.outputPath('drag-preview.png')})
  await page.mouse.up()
  await expect(slider).toHaveAttribute('aria-valuenow', '5')
  const after = await state(page)
  expect(after.preset).toBe('design')
  expect(after.writes).toBe(1)
  expect(after.selection).toEqual(before.selection)
  expect(after.undo).toBe(false)
  await expect(box.locator('shape-resizer')).toBeVisible()
  await expect(page.locator('bc-object-format-toolbar')).toBeVisible()
  await page.getByTestId('editing-experience').screenshot({path: testInfo.outputPath('five-level-slider.png')})
})

test('five stops and keyboard controls apply combinations and display custom and readonly states honestly', async ({page}) => {
  await setup(page)
  const panel = page.getByTestId('editing-experience')
  const names = ['专注内容', '轻量编辑', '图文混排', '布局调整', '精细设计']
  for (let i = 0; i < names.length; i++) {
    await panel.getByRole('button', {name: names[i], exact: true}).click()
    const current = await state(page)
    expect(current.experience).toBe(['focus', 'light', 'mixed', 'layout', 'design'][i])
    expect(current.overrides).toEqual({})
    expect(current.policy.native.layoutControls).toBe(i > 0)
    expect(current.policy.native.moveExistingBlocks).toBe(i >= 2)
    expect(current.policy.native.contentResizeHandles).toBe(i >= 3)
    expect(current.policy.plugins.objectToolbar.contentSelection).toBe(i >= 3)
    expect(current.policy.plugins.groupToolbar.enabled).toBe(i >= 2)
    expect(current.policy.plugins.attachmentToolbar.hoverOpen).toBe(true)
    expect(current.policy.plugins.attachmentToolbar.selectionOpen).toBe(i >= 2)
    expect(current.policy.plugins.tableToolbar.enabled).toBe(i > 0)
    expect(current.policy.plugins.tableToolbar.textFocus).toBe(i !== 1)
    expect(current.policy.native.objectFloatingHandles).toBe(i !== 1)
    expect(current.policy.native.hoverControls).toBe(i === 0 || i === 4)
  }
  const slider = page.getByRole('slider', {name: '编辑体验档位'})
  await slider.focus()
  await page.keyboard.press('Home'); await expect(slider).toHaveAttribute('aria-valuenow', '1')
  await page.keyboard.press('ArrowRight'); await expect(slider).toHaveAttribute('aria-valuenow', '2')
  await page.keyboard.press('End'); await expect(slider).toHaveAttribute('aria-valuenow', '5')
  await page.keyboard.press('ArrowLeft'); await expect(slider).toHaveAttribute('aria-valuenow', '4')
  await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.interaction.configure({preset: 'mixed', overrides: {native: {groupOutline: false}}})
  })
  await expect(panel).toHaveClass(/is-custom/)
  await expect(slider).toHaveAttribute('aria-valuetext', /自定义/)
  await panel.getByRole('button', {name: '图文混排', exact: true}).click()
  await expect(panel).not.toHaveClass(/is-custom/)
  await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.toggleReadonly(true))
  await expect(slider).toHaveAttribute('aria-disabled', 'true')
  await expect(panel.getByRole('button', {name: '精细设计'})).toBeDisabled()
  await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.toggleReadonly(false))
  await expect(slider).toHaveAttribute('aria-disabled', 'false')
  await expect(slider).toHaveAttribute('aria-valuenow', '3')
})

test('cancelled drags do not apply, touch input works, and dark/narrow/reduced-motion rendering stays usable', async ({page}, testInfo) => {
  await setup(page)
  const slider = page.getByRole('slider', {name: '编辑体验档位'})
  await slider.scrollIntoViewIfNeeded()
  let bounds = (await slider.boundingBox())!
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width - 14, bounds.y + bounds.height / 2)
  await slider.dispatchEvent('pointercancel', {pointerId: 1})
  await page.mouse.up()
  await expect(slider).toHaveAttribute('aria-valuenow', '3')
  expect((await state(page)).writes).toBe(0)
  // A touch-like pointer sequence exercises the same capture/cancel path on all engines.
  bounds = (await slider.boundingBox())!
  await slider.evaluate((input, rect) => {
    input.setPointerCapture = () => {}
    input.dispatchEvent(new PointerEvent('pointerdown', {pointerId: 72, pointerType: 'touch', isPrimary: true, button: 0,
      clientX: rect.x + rect.width / 2, clientY: rect.y + 35, bubbles: true, cancelable: true}))
    input.dispatchEvent(new PointerEvent('pointerup', {pointerId: 72, pointerType: 'touch', isPrimary: true, button: 0,
      clientX: rect.x + 14, clientY: rect.y + 35, bubbles: true}))
  }, bounds)
  await expect(slider).toHaveAttribute('aria-valuenow', '1')
  await page.keyboard.press('Escape')
  await page.emulateMedia({reducedMotion: 'reduce'})
  await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.toggleTheme('dark'))
  await page.setViewportSize({width: 390, height: 844})
  const panel = page.getByTestId('editing-experience')
  await panel.scrollIntoViewIfNeeded()
  bounds = (await panel.boundingBox())!
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390)
  await expect(panel.locator('.thumb')).toHaveCSS('transition-duration', '0s')
  await panel.screenshot({path: testInfo.outputPath('five-level-dark-narrow.png')})
})

test('lightweight hides only object floating handles and preserves paragraph handles and text editing', async ({page}) => {
  const id = await setup(page)
  const box = page.locator(`[data-block-id="${id}"]`)
  const text = box.locator('.edit-container').first()
  const objectHandle = box.locator('[data-bc-object-floating-handle]')
  await text.click()
  await expect(objectHandle).toBeVisible()
  await page.getByRole('button', {name: '轻量编辑', exact: true}).click()
  await text.click()
  await expect(objectHandle).toBeHidden()
  await page.keyboard.type('X')
  await expect(text).toContainText('X')
  // The setting controls only the floating object button, not whole-object editing.
  await page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.selection.selectBlock(doc.getBlockById(id))
  }, id)
  await expect(box.locator('shape-resizer')).toBeVisible()
  await expect(page.locator('bc-object-format-toolbar')).toBeVisible()
  const paragraphId = await page.evaluate(async () => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const paragraph = doc.schemas.createSnapshot('paragraph', ['正文块菜单保留'])
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [paragraph])
    await doc.navigateToBlock(paragraph.id)
    return paragraph.id
  })
  await page.locator(`[data-block-id="${paragraphId}"] .edit-container`).hover()
  await expect(page.locator('bc-drag-handle')).toBeVisible()
  await page.getByRole('button', {name: '图文混排', exact: true}).click()
  await text.click()
  await expect(objectHandle).toBeVisible()
})

test('dial keeps the released stop outside the rail and Escape cancels preview', async ({page}) => {
  await setup(page)
  const slider = page.getByRole('slider', {name: '编辑体验档位'})
  await slider.scrollIntoViewIfNeeded()
  const r = (await slider.boundingBox())!
  const y = r.y + r.height / 2
  await page.mouse.move(r.x + r.width / 2, y)
  await page.mouse.down()
  await page.mouse.move(r.x + r.width + 60, y + 80, {steps: 10})
  await page.mouse.up()
  await expect(slider).toHaveAttribute('aria-valuenow', '5')
  // Let the normal lostpointercapture and scheduled preview frame run.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await expect(slider).toHaveAttribute('aria-valuenow', '5')
  expect((await state(page)).writes).toBe(1)
  await page.mouse.move(r.x + r.width - 14, y)
  await page.mouse.down()
  await page.mouse.move(r.x + 14, y, {steps: 8})
  await expect(slider).toHaveAttribute('aria-valuenow', '1')
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(slider).toHaveAttribute('aria-valuenow', '5')
  expect((await state(page)).writes).toBe(1)
})
