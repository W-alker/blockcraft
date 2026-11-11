import {expect, test, type Page} from '@playwright/test'
import fs from 'node:fs'

const clip = Array.from(fs.readFileSync('e2e/fixtures/video-poster.mp4'))

async function setup(page: Page, flavour: string, scale = 1) {
  await page.setViewportSize({width: 1280, height: 900})
  await page.routeWebSocket('**', socket => socket.close())
  await page.route('https://media-chrome.test/**', route => route.fulfill({contentType: 'text/html; charset=utf-8',
    body: '<meta charset="utf-8"><button onclick="this.textContent=\'已点击\'">网页按钮</button>'}))
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  const id = await page.evaluate(async ({flavour, scale, clip}) => {
    const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const viewport = document.createElement('div')
    viewport.style.cssText = 'position:fixed;left:40px;top:60px;width:1100px;height:750px;overflow:auto;background:white;z-index:20;padding:60px;box-sizing:border-box'
    const mount = document.createElement('div')
    viewport.append(mount); document.body.append(viewport)
    const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 200
    const url = URL.createObjectURL(new Blob([new Uint8Array(clip)], {type: 'video/mp4'}))
    const object = source.schemas.createSnapshot(flavour, flavour === 'image' ? [{src: canvas.toDataURL(), wr: 40, ar: 2}]
      : flavour === 'video' ? [{url, sourceType: 'link', type: 'video/mp4', wr: 40, ar: 2}]
      : flavour === 'person-card' ? [] : ['https://media-chrome.test/frame'])
    Object.assign(object.props, {wr: 40, ar: 2})
    if (flavour === 'person-card') Object.assign(object.props, {width: 320, height: 160})
    const doc = new source.constructor({...source.config, yDoc: new source.yDoc.constructor(), plugins: [],
      readonly: false, virtualization: {enabled: false}, scrollContainer: viewport})
    doc.initBySnapshot({...source.model.toSnapshot(source.rootId), children: [object]}, mount)
    doc.viewScale.attach(mount); doc.viewScale.setScale(scale)
    source.destroy()
    doc.selection.blur()
    ;(window as any).mediaChromeFixture = {doc, id: object.id}
    await document.fonts.ready
    return object.id as string
  }, {flavour, scale, clip})
  const block = page.locator(`[data-block-id="${id}"]`)
  const surface = flavour === 'person-card' ? block
    : block.locator(flavour === 'image' ? '.img-wrapper' : flavour === 'video' ? '.video-block__wrapper' : 'embed-frame-card')
  return {block, surface, id}
}

async function select(page: Page) {
  await page.evaluate(async () => {
    const {doc, id} = (window as any).mediaChromeFixture
    doc.root.hostElement.focus()
    for (let i = 0; i < 2; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    doc.selection.selectBlock(id)
  })
}

for (const flavour of ['image', 'video', 'embed', 'person-card']) for (const scale of [.75, 1, 1.5]) {
  test(`${flavour} scale ${scale}: media frames share geometry, handles and interaction policies`, async ({page}) => {
    const {block, surface} = await setup(page, flavour, scale)
    const frame = surface.locator('shape-resizer > .shape-resizer__frame')
    await surface.hover({position: {x: 20, y: 20}})
    await expect(frame).toBeHidden()
    await page.evaluate(() => (window as any).mediaChromeFixture.doc.interactionMode.set('design'))
    await surface.hover({position: {x: 20, y: 20}})
    await expect(frame).toBeVisible()
    await expect(frame).toHaveCSS('outline-style', 'dashed')
    const hint = await frame.evaluate(el => {
      const css = getComputedStyle(el), rect = el.getBoundingClientRect()
      return {width: css.outlineWidth, offset: css.outlineOffset, x: rect.x, y: rect.y, w: rect.width, h: rect.height}
    })
    if (scale === 1) expect([hint.width, hint.offset]).toEqual(['1px', '2px'])
    await select(page)
    await expect(frame).toHaveCSS('outline-style', 'solid')
    await expect(frame).toHaveCSS('outline-width', hint.width)
    await expect(frame).toHaveCSS('outline-offset', hint.offset)
    const selected = await frame.boundingBox()
    for (const [key, value] of Object.entries({x: hint.x, y: hint.y, width: hint.w, height: hint.h}))
      expect(selected![key as keyof typeof selected]).toBeCloseTo(value, 1)
    await expect(surface.locator('.shape-resizer__handle')).toHaveCount(8)
    for (const handle of await surface.locator('.shape-resizer__handle').all()) {
      await expect(handle).toHaveCSS('width', '8px')
      await expect(handle).toHaveCSS('height', '8px')
      await expect(handle).toHaveCSS('border-radius', '50%')
    }
    await expect(surface).toHaveCSS('outline-style', 'none')
    if (flavour === 'embed') {
      await expect(surface).toHaveCSS('box-shadow', 'none')
      await expect(surface).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)')
      await block.frameLocator('iframe').getByRole('button', {name: '网页按钮'}).click()
      await expect(block.frameLocator('iframe').getByRole('button', {name: '已点击'})).toBeVisible()
    }
    if (scale === 1) await page.screenshot({path: `/tmp/blockcraft-media-${flavour}-${test.info().project.name}.png`})
    await page.emulateMedia({media: 'print'})
    await expect(frame).toBeHidden()
    await page.emulateMedia({media: 'screen'})
    await page.evaluate(() => (window as any).mediaChromeFixture.doc.interactionMode.set('immersive'))
    await expect(frame).toBeHidden()
    await page.evaluate(() => (window as any).mediaChromeFixture.doc.toggleReadonly(true))
    await expect(surface.locator('shape-resizer')).toHaveCount(0)
  })
}

test('all eight video grips preserve playback and ratio; cancel and Undo retain the original sizing', async ({page}) => {
  const {surface} = await setup(page, 'video')
  const video = surface.locator('video')
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState)).toBeGreaterThanOrEqual(1)
  await video.evaluate(async (el: HTMLVideoElement) => {
    el.muted = true; el.loop = true; await el.play(); (window as any).retainedVideo = el
    await new Promise<void>(resolve => el.requestVideoFrameCallback(() => resolve()))
  })
  await select(page)
  const original = await page.evaluate(() => {
    const {doc, id} = (window as any).mediaChromeFixture
    doc.crud.undoManager.clearHistory()
    return doc.model.getProps(id)
  })
  await page.screenshot({path: `/tmp/blockcraft-media-video-playing-${test.info().project.name}.png`})
  await surface.locator('[data-handle="east"]').click()
  expect(await page.evaluate(() => (window as any).mediaChromeFixture.doc.crud.undoManager.isCanUndo())).toBe(false)
  for (const handle of ['north-west', 'north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west']) {
    const grip = surface.locator(`[data-handle="${handle}"]`)
    const bounds = (await grip.boundingBox())!
    const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2
    const dx = handle.includes('west') ? 40 : handle.includes('east') ? -40 : 0
    const dy = handle.includes('north') ? 20 : handle.includes('south') ? -20 : 0
    await page.mouse.move(x, y); await page.mouse.down()
    await page.mouse.move(x + dx, y + dy, {steps: 3}); await page.keyboard.press('Escape'); await page.mouse.up()
    expect(await page.evaluate(() => {
      const {doc, id} = (window as any).mediaChromeFixture
      return {props: doc.model.getProps(id), undo: doc.crud.undoManager.isCanUndo()}
    })).toEqual({props: original, undo: false})
    await page.mouse.move(x, y); await page.mouse.down()
    await page.mouse.move(x + dx, y + dy, {steps: 3}); await page.mouse.up()
    const box = (await surface.boundingBox())!
    expect(box.width / box.height).toBeCloseTo(2, 1)
    expect(await video.evaluate((el: HTMLVideoElement) => el === (window as any).retainedVideo && !el.paused)).toBe(true)
    expect(await page.evaluate(() => (window as any).mediaChromeFixture.doc.crud.undoManager.isCanUndo())).toBe(true)
    await page.evaluate(() => (window as any).mediaChromeFixture.doc.crud.undoManager.undo())
    await expect.poll(() => page.evaluate(() => {
      const {doc, id} = (window as any).mediaChromeFixture
      return doc.model.getProps(id)
    })).toEqual(original)
    await select(page)
  }
})
