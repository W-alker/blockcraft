import {expect, test} from '@playwright/test'
import {createRequire} from 'node:module'
import path from 'node:path'

const projectRequire = createRequire(path.resolve('package.json'))
const buildRequire = createRequire(projectRequire.resolve('@angular-devkit/build-angular/package.json'))
const {buildSync} = buildRequire('esbuild')
const runtime = buildSync({
  entryPoints: ['packages/editor/framework/modules/pagination/export/print-resources.ts'],
  bundle: true, write: false, format: 'iife', globalName: 'PrintResources',
}).outputFiles[0].text
const pixel = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='

test.beforeEach(async ({page}) => {
  await page.route('https://export.test/**', route => route.fulfill(
    route.request().url().endsWith('/document')
      ? {contentType: 'text/html', body: '<main id="root"></main>'}
      : {status: 404, body: 'missing resource'},
  ))
  await page.goto('https://export.test/document')
  await page.addScriptTag({content: runtime})
})

for (const poster of [null, '', '   ']) {
  test(`封面 ${JSON.stringify(poster)} 不阻塞严格导出，不把页面当图片或额外加载视频`, async ({page}) => {
    const requests: string[] = []
    page.on('request', request => requests.push(request.url()))
    const result = await page.evaluate(async posterValue => {
      const root = document.querySelector<HTMLElement>('#root')!
      const video = document.createElement('video')
      video.preload = 'none'
      video.src = '/clip.mp4'
      video.style.cssText = 'width:128px;height:96px'
      if (posterValue !== null) video.setAttribute('poster', posterValue)
      root.append(video)
      const before = video.outerHTML
      const prepared = await (window as any).PrintResources.preparePrintResources(root, {timeoutMs: 500})
      const placeholder = root.querySelector('.bc-print-resource-placeholder')!
      const after = root.innerHTML
      const repeated = await (window as any).PrintResources.preparePrintResources(root, {timeoutMs: 500})
      return {
        message: prepared.warnings[0].message,
        width: placeholder.getBoundingClientRect().width, height: placeholder.getBoundingClientRect().height,
        unchanged: video.outerHTML === before, paused: video.paused,
        remainingMedia: root.querySelectorAll('video, img').length,
        stable: root.innerHTML === after, repeatedWarnings: repeated.warnings,
      }
    }, poster)
    expect(result).toMatchObject({width: 128, height: 96, unchanged: true, paused: true, remainingMedia: 0, stable: true, repeatedWarnings: []})
    expect(result.message).toContain('视频未设置封面')
    expect(requests).toEqual([])
  })
}

test('有效封面继续导出图片', async ({page}) => {
  const result = await page.evaluate(async poster => {
    const root = document.querySelector('#root')!
    root.innerHTML = `<video poster="${poster}"></video>`
    const prepared = await (window as any).PrintResources.preparePrintResources(root, {timeoutMs: 1000})
    return {src: root.querySelector('img')!.src, warnings: prepared.warnings}
  }, pixel)
  expect(result).toEqual({src: pixel, warnings: []})
})

for (const policy of ['strict', 'best-effort']) {
  test(`错误封面在 ${policy} 模式保留尺寸与视频专属告警`, async ({page}) => {
    const result = await page.evaluate(async resourcePolicy => {
      const root = document.querySelector('#root')!
      root.innerHTML = '<section data-block-id="video-block"><video poster="/missing.jpg" style="width:128px;height:96px"></video></section>'
      const prepared = await (window as any).PrintResources.preparePrintResources(root, {resourcePolicy, timeoutMs: 1000})
      const placeholder = root.querySelector('.bc-print-resource-placeholder')!
      return {warning: prepared.warnings[0], width: placeholder.getBoundingClientRect().width, height: placeholder.getBoundingClientRect().height, text: placeholder.textContent}
    }, policy)
    expect(result).toMatchObject({width: 128, height: 96, text: '视频（无可用封面）', warning: {blockId: 'video-block', resourceUrl: 'https://export.test/missing.jpg'}})
    expect(result.warning.message).toContain('视频封面')
    expect(result.warning.message).not.toContain('图片')
  })
}

test('普通图片加载失败仍阻止严格导出', async ({page}) => {
  const result = await page.evaluate(async () => {
    const root = document.querySelector('#root')!
    root.innerHTML = '<section data-block-id="image-block"><img src="/missing.jpg"></section>'
    try { await (window as any).PrintResources.preparePrintResources(root, {timeoutMs: 1000}); return null }
    catch (error: any) { return {message: error.message, blockId: error.context.blockId, code: error.code} }
  })
  expect(result).toMatchObject({blockId: 'image-block', code: 'resource-timeout'})
  expect(result!.message).toContain('图片')
})

for (const abort of [false, true]) {
  test(abort ? '封面等待期间取消仍终止导出' : '封面超时保留占位并继续导出', async ({page}) => {
    // 延迟响应超过资源期限；不依赖外部网络。
    await page.route('https://export.test/stalled.jpg', async route => {
      await new Promise(resolve => setTimeout(resolve, 1000))
      await route.fulfill({status: 404, body: 'late'}).catch(() => {})
    })
    const result = await page.evaluate(async shouldAbort => {
      const root = document.querySelector('#root')!
      root.innerHTML = '<video poster="/stalled.jpg" style="width:128px;height:96px"></video>'
      const controller = new AbortController()
      const pending = (window as any).PrintResources.preparePrintResources(root, {signal: controller.signal, timeoutMs: 100})
      if (shouldAbort) setTimeout(() => controller.abort(), 20)
      try {
        const prepared = await pending
        return {code: 'completed', message: prepared.warnings[0]?.message, placeholder: !!root.querySelector('.bc-print-resource-placeholder')}
      } catch (error: any) { return {code: error.code} }
    }, abort)
    expect(result.code).toBe(abort ? 'aborted' : 'completed')
    if (!abort) {
      expect(result.message).toContain('视频封面')
      expect(result.placeholder).toBe(true)
    }
  })
}
