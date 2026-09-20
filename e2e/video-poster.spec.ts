import {expect, test} from '@playwright/test'
import {createRequire} from 'node:module'
import path from 'node:path'
import fs from 'node:fs'

const projectRequire = createRequire(path.resolve('package.json'))
const buildRequire = createRequire(projectRequire.resolve('@angular-devkit/build-angular/package.json'))
const {buildSync} = buildRequire('esbuild')
const runtime = buildSync({
  entryPoints: ['packages/editor/blocks/video-block/video-poster.ts'],
  bundle: true, write: false, format: 'iife', globalName: 'VideoPoster',
}).outputFiles[0].text
const clip = Array.from(fs.readFileSync('e2e/fixtures/video-poster.mp4'))

test.beforeEach(async ({page}) => {
  await page.goto('about:blank')
  await page.addScriptTag({content: runtime})
})

test('真实 MP4 提取 JPEG，限制尺寸、不播放并释放临时 URL', async ({page}) => {
  const result = await page.evaluate(async bytes => {
    let plays = 0
    let revoked = 0
    const originalPlay = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function () { plays++; return originalPlay.call(this) }
    const originalRevoke = URL.revokeObjectURL
    URL.revokeObjectURL = url => { revoked++; originalRevoke.call(URL, url) }
    const file = new File([new Uint8Array(bytes)], 'red.mp4', {type: 'video/mp4'})
    const poster = await (window as any).VideoPoster.extractVideoPoster(file)
    if (!poster) return {plays, revoked, missing: true}
    const bitmap = await createImageBitmap(poster)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d')!
    context.drawImage(bitmap, 0, 0, 1, 1)
    const color = Array.from(context.getImageData(0, 0, 1, 1).data)
    const result = {plays, revoked, missing: false, width: bitmap.width, height: bitmap.height, type: poster.type, color}
    bitmap.close()
    return result
  }, clip)
  expect(result).toMatchObject({plays: 0, revoked: 1, missing: false, width: 640, height: 320, type: 'image/jpeg'})
  expect(result.color![0]).toBeGreaterThan(150)
  expect(result.color![1]).toBeLessThan(80)
})

test('损坏视频返回无封面并释放临时 URL', async ({page}) => {
  const result = await page.evaluate(async () => {
    let revoked = 0
    const original = URL.revokeObjectURL
    URL.revokeObjectURL = url => { revoked++; original.call(URL, url) }
    const poster = await (window as any).VideoPoster.extractVideoPoster(new File(['invalid'], 'bad.mp4', {type: 'video/mp4'}), 200)
    return {missing: !poster, revoked}
  })
  expect(result).toEqual({missing: true, revoked: 1})
})

test('解码超时后清理资源，迟到事件不会再次完成任务', async ({page}) => {
  const result = await page.evaluate(async () => {
    let revoked = 0
    const originalRevoke = URL.revokeObjectURL
    URL.revokeObjectURL = url => { revoked++; originalRevoke.call(URL, url) }
    const originalCreate = document.createElement.bind(document)
    let video: HTMLVideoElement | undefined
    document.createElement = ((name: string, options?: ElementCreationOptions) => {
      const element = originalCreate(name, options)
      if (name === 'video') {
        video = element as HTMLVideoElement
        // 模拟永远不提供已解码帧的媒体引擎。
        Object.defineProperty(video, 'src', {set: () => {}})
        video.load = () => {}
      }
      return element
    }) as typeof document.createElement
    const poster = await (window as any).VideoPoster.extractVideoPoster(new File(['pending'], 'slow.mp4'), 30)
    video!.dispatchEvent(new Event('loadeddata'))
    video!.dispatchEvent(new Event('seeked'))
    return {missing: !poster, revoked, source: video!.getAttribute('src')}
  })
  expect(result).toEqual({missing: true, revoked: 1, source: null})
})
