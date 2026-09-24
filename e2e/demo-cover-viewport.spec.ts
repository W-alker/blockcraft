import {expect, test, type Page} from '@playwright/test'

async function expectCoverFits(page: Page) {
  await expect(page.locator('demo-cover-block')).toBeVisible()
  await expect.poll(() => page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>('.presentation-stage')!
    const cover = document.querySelector<HTMLElement>('demo-cover-block')!
    const banner = cover.querySelector<HTMLElement>('.banner')
    const rect = cover.getBoundingClientRect()
    const imageRect = banner?.getBoundingClientRect()
    return {
      overflow: Math.max(0, stage.scrollHeight - stage.clientHeight),
      heightError: Math.round(Math.abs(rect.height - stage.clientHeight * 0.8)),
      topError: Math.round(Math.abs(rect.top - stage.clientHeight * 0.1)),
      bannerError: imageRect
        ? Math.round(Math.abs(imageRect.top) + Math.abs(imageRect.left)
          + Math.abs(imageRect.width - stage.clientWidth))
        : 0,
    }
  })).toEqual({overflow: 0, heightError: 0, topError: 0, bannerError: 0})
}

test('flow cover fits the viewport across scales and resize while body pages still scroll', async ({page}) => {
  test.setTimeout(120_000)
  await page.setViewportSize({width: 1280, height: 800})
  await page.routeWebSocket('**', socket => socket.close())
  await page.route('https://picsum.photos/**', route => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" fill="#aabbcc"/></svg>',
  }))
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => !!(window as any).ng
    ?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  const before = await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.plugins.find((plugin: any) => plugin.name === 'pagination')?.disable()
    doc.crud.transact(() => {
      doc.crud.deleteBlocks(doc.rootId, 0, doc.root.childrenLength, true)
      doc.crud.insertBlockSnapshots(doc.rootId, 0, [doc.schemas.createSnapshot('paragraph', [[{
        insert: Array.from({length: 70}, (_, index) => `正文第 ${index + 1} 行`).join('\n'),
      }]])])
    })
    return JSON.stringify(doc.exportSnapshot())
  })

  for (const {scale, banner} of [
    {scale: 0.5, banner: true}, {scale: 1, banner: true},
    {scale: 1.5, banner: true}, {scale: 2, banner: true},
    {scale: 1.5, banner: false},
  ]) {
    await page.evaluate(({scale, banner}) => {
      const app = (window as any).ng.getComponent(document.querySelector('playground-home'))
      app.startDemo()
      const controller = app._demoController
      controller.destroy()
      controller.config.viewScale = scale
      if (!banner) delete controller.config.cover.banner
      // 在窗口覆盖层中验证 resize；Firefox 的自动化窗口改尺寸会退出原生全屏。
      // 原生全屏入口单独在循环之后验证。
      controller.enterFullscreen = () => {}
      controller.start()
    }, {scale, banner})
    await expectCoverFits(page)
    await page.setViewportSize({width: 1440, height: 900})
    await expectCoverFits(page)
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('demo-cover-block')).toHaveCount(0)
    await expect.poll(() => page.locator('.presentation-stage').evaluate(stage =>
      stage.scrollHeight > stage.clientHeight)).toBe(true)
    await page.locator('.presentation-stage').evaluate(stage => { stage.scrollTop = 100 })
    await expect.poll(() => page.locator('.presentation-stage').evaluate(stage => stage.scrollTop)).toBe(100)
    await page.keyboard.press('ArrowLeft')
    await expectCoverFits(page)
    await page.keyboard.press('Escape')
    await expect(page.locator('.presentation-stage')).toHaveCount(0)
    await page.setViewportSize({width: 1280, height: 800})
  }
  await page.evaluate(() => (window as any).ng
    .getComponent(document.querySelector('playground-home')).startDemo())
  await expectCoverFits(page)
  await page.keyboard.press('Escape')
  await expect(page.locator('.presentation-stage')).toHaveCount(0)
  expect(await page.evaluate(() => JSON.stringify((window as any).ng
    .getComponent(document.querySelector('block-craft-editor')).doc.exportSnapshot()))).toBe(before)
})
