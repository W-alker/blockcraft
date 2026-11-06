import {expect, test, type Page} from '@playwright/test'
import fs from 'node:fs'

const clip = Array.from(fs.readFileSync('e2e/fixtures/video-poster.mp4'))

async function setup(page: Page, legacy = false) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng
    ?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  await page.evaluate(({bytes, legacy}) => {
    const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const viewport = document.createElement('div')
    viewport.style.cssText = 'position:fixed;inset:0;overflow:auto;background:white;z-index:10000'
    const mount = document.createElement('div')
    mount.style.cssText = 'width:500px;margin:20px'
    viewport.appendChild(mount)
    document.body.appendChild(viewport)
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], {type: 'video/mp4'}))
    const video = source.schemas.createSnapshot('video', [{sourceType: 'local', url,
      ...(legacy ? {width: 400} : {wr: 100, ar: 2})}])
    const snapshot = source.schemas.createSnapshot('root', ['video-scale', [video]])
    const doc = new source.constructor({...source.config, yDoc: new source.yDoc.constructor(), docId: snapshot.id,
      plugins: [], scrollContainer: viewport, readonly: false, virtualization: {enabled: false}})
    doc.initBySnapshot(snapshot, mount)
    doc.viewScale.attach(mount)
    ;(window as any).videoScaleFixture = {doc, id: video.id}
    mount.id = 'video-scale-fixture'
  }, {bytes: clip, legacy})
  const video = page.locator('#video-scale-fixture video')
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThanOrEqual(1)
  await video.evaluate((v: HTMLVideoElement) => {v.loop = true; v.muted = true})
  return video
}

for (const legacy of [false, true]) {
  test(`文档缩放保持视频尺寸、原生控件命中与播放状态（${legacy ? '旧尺寸' : '比例尺寸'}）`, async ({page, browserName}, testInfo) => {
    const video = await setup(page, legacy)
    const base = (await video.boundingBox())!
    const snapshot = await page.evaluate(() => (window as any).videoScaleFixture.doc.exportSnapshot())
    for (const scale of [1.5, 0.5, 2, 1]) {
      await page.evaluate(scale => (window as any).videoScaleFixture.doc.viewScale.setScale(scale), scale)
      await expect.poll(async () => Math.abs((await video.boundingBox())!.width - base.width * scale)).toBeLessThan(2)
      await expect.poll(async () => Math.abs((await video.boundingBox())!.height - base.height * scale)).toBeLessThan(2)
      await video.hover()
      if (scale === 1.5) {
        const image = await video.screenshot({path: testInfo.outputPath('native-controls.png')})
        if (browserName === 'webkit') {
          // 原生 shadow controls 不暴露 DOM；读取截图中白色播放三角的实际位置。
          const center = await page.evaluate(async bytes => {
            const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], {type: 'image/png'}))
            const canvas = document.createElement('canvas')
            canvas.width = bitmap.width; canvas.height = bitmap.height
            const ctx = canvas.getContext('2d')!
            ctx.drawImage(bitmap, 0, 0)
            const {data} = ctx.getImageData(0, 0, canvas.width, canvas.height)
            let xSum = 0, ySum = 0, count = 0
            for (let y = Math.floor(canvas.height * .1); y < canvas.height * .9; y++) {
              for (let x = Math.floor(canvas.width * .1); x < canvas.width * .9; x++) {
                const i = (y * canvas.width + x) * 4
                if (data[i] > 180 && data[i + 1] > 180 && data[i + 2] > 180) {
                  xSum += x; ySum += y; count++
                }
              }
            }
            bitmap.close()
            return {count, x: xSum / count / canvas.width, y: ySum / count / canvas.height}
          }, Array.from(image))
          expect(center.count).toBeGreaterThan(20)
          expect(Math.abs(center.x - .5)).toBeLessThan(.03)
          expect(Math.abs(center.y - .5)).toBeLessThan(.03)
        }
        // WebKit 的初始播放按钮应位于视频中心；旧实现按 zoom 再乘了一次坐标。
        if (browserName === 'webkit') {
          await video.click()
          await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false)
        } else {
          await video.evaluate((v: HTMLVideoElement) => v.play())
        }
        await video.evaluate(v => { (window as any).playingVideo = v })
      } else {
        expect(await video.evaluate(v => v === (window as any).playingVideo)).toBe(true)
        expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false)
        await video.screenshot({path: testInfo.outputPath(`playing-controls-${scale}.png`)})
      }
    }
    expect(await page.evaluate(() => (window as any).videoScaleFixture.doc.exportSnapshot())).toEqual(snapshot)
  })
}

test('缩放后全屏往返及恢复原比例后的尺寸调整仍正常', async ({page}, testInfo) => {
  const video = await setup(page)
  await page.evaluate(() => (window as any).videoScaleFixture.doc.viewScale.setScale(1.5))
  await video.evaluate(v => {
    const button = document.createElement('button')
    button.id = 'test-video-fullscreen'
    button.textContent = '全屏'
    button.style.cssText = 'position:fixed;right:0;top:0;z-index:20000'
    button.onclick = () => {void v.requestFullscreen()}
    document.body.append(button)
  })
  await page.locator('#test-video-fullscreen').click()
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.tagName)).toBe('VIDEO')
  await expect.poll(() => video.evaluate(v => {
    const rect = v.getBoundingClientRect()
    return Math.max(Math.abs(rect.width - innerWidth), Math.abs(rect.height - innerHeight))
  })).toBeLessThan(2)
  await video.screenshot({path: testInfo.outputPath('fullscreen.png')})
  await page.evaluate(() => document.exitFullscreen())
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true)
  await page.evaluate(() => (window as any).videoScaleFixture.doc.viewScale.setScale(1))
  await expect.poll(() => video.evaluate(v => getComputedStyle(v).zoom)).toBe('1')
  const width = (await video.boundingBox())!.width
  const handle = page.locator('#video-scale-fixture .block-resizer__bar--right')
  await video.hover()
  const box = (await handle.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x - 100, box.y + box.height / 2, {steps: 8})
  await page.mouse.up()
  await expect.poll(async () => (await video.boundingBox())!.width).toBeLessThan(width - 50)
  const resized = (await video.boundingBox())!
  expect(Math.abs(resized.width / resized.height - 2)).toBeLessThan(.01)
})
