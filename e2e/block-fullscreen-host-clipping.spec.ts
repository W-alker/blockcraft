import {expect, test} from '@playwright/test'
import {createRequire} from 'node:module'
import path from 'node:path'

// 复用 Angular 构建链已有的工具；不引入应用宿主或另一个仓库的依赖。
const projectRequire = createRequire(path.resolve('package.json'))
const buildRequire = createRequire(projectRequire.resolve('@angular-devkit/build-angular/package.json'))
const {buildSync} = buildRequire('esbuild')
const {compile} = buildRequire('sass')
const css = ['base', 'light'].map(theme => compile(
  path.resolve(`packages/editor/themes/${theme}.scss`),
  {silenceDeprecations: ['import', 'global-builtin', 'color-functions']},
).css).join('\n')
const runtime = buildSync({
  stdin: {
    contents: "export {BlockFullscreenController} from './packages/editor/framework/services/block-fullscreen-controller'",
    loader: 'ts',
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'BlockFullscreenFixture',
}).outputFiles[0].text

declare global {
  interface Window {
    BlockFullscreenFixture: {
      BlockFullscreenController: new (
        host: HTMLElement,
        scroller: () => HTMLElement,
        scale: () => number,
      ) => {set(value: boolean): void; destroy(): void}
    }
    bcFullscreenFixtureController: {set(value: boolean): void; destroy(): void}
  }
}

for (const kind of ['table', 'mermaid']) {
  for (const scale of [1, 1.25]) {
    test(`${kind} escapes host clipping at scale ${scale} without changing scroll layout`, async ({page}, testInfo) => {
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/*', route => route.abort())
      await page.setViewportSize({width: 1280, height: 800})
      await page.setContent(`<style>${css}
        html,body {margin:0;background:#242429}
        .shell {position:relative;z-index:0;overflow:hidden;margin:60px 80px;height:640px}
        .viewport {position:relative;z-index:1;height:600px;overflow:auto}
        .surface {zoom:${scale}}
        .paper {width:600px;margin:auto;overflow-x:clip;isolation:isolate}
        /* 宿主负责自己的纸面裁剪，库只解除祖先层叠限制。 */
        .paper.bc-table-fullscreen-isolation-container {overflow:visible}
        .spacer {height:700px}
        .${kind}-block:not(.is-fullscreen) {height:240px}
        .exit {position:absolute;top:12px;right:12px}
      </style>
      <div class="shell"><div class="viewport"><div class="surface">
        <div class="paper"><div data-blockcraft-root="true" data-block-id="root" data-bc-placement-container>
          <div class="spacer" data-block-id="before"></div>
          <div class="${kind}-block" data-block-id="target" style="margin-top:140px">
            <button class="exit">退出</button>
          </div>
          <div class="spacer" data-block-id="after"></div>
        </div></div>
      </div></div></div>
      <div class="unrelated" style="isolation:isolate;z-index:12;overflow:clip"></div>
      <div class="cdk-overlay-container"></div>`)
      await page.addScriptTag({content: runtime})
      await page.evaluate(scale => {
        const host = document.querySelector<HTMLElement>('[data-block-id="target"]')!
        const viewport = document.querySelector<HTMLElement>('.viewport')!
        viewport.scrollTop = 500
        window.bcFullscreenFixtureController = new window.BlockFullscreenFixture.BlockFullscreenController(
          host, () => viewport, () => scale,
        )
        host.querySelector('button')!.addEventListener('click', () => window.bcFullscreenFixtureController.set(false))
      }, scale)
      const viewport = page.locator('.viewport')
      const viewportBox = await viewport.boundingBox()
      const paper = page.locator('.paper')
      const host = page.locator('[data-block-id="target"]')
      await expect(paper).toHaveCSS('overflow-x', 'clip')
      await expect(host).toHaveCSS('z-index', '1')
      await page.evaluate(() => window.bcFullscreenFixtureController.set(true))

      await expect(paper).toHaveCSS('overflow-x', 'visible')
      await expect(paper).toHaveCSS('isolation', 'auto')
      await expect(viewport).toHaveCSS('overflow-y', 'hidden')
      await expect(page.locator('.shell')).toHaveCSS('overflow', 'hidden')
      await expect(viewport).toHaveCSS('z-index', 'auto')
      expect(await viewport.boundingBox()).toEqual(viewportBox)
      expect(await viewport.evaluate(element => element.scrollTop)).toBe(500)
      await expect(host).toHaveCSS('z-index', '800')
      expect(await host.boundingBox()).toEqual({x: 0, y: 0, width: 1280, height: 800})
      await expect(page.locator('[data-block-id="before"]')).toHaveCSS('pointer-events', 'none')
      await expect(page.locator('.unrelated')).toHaveCSS('isolation', 'isolate')
      await expect(page.locator('.unrelated')).toHaveCSS('overflow', 'clip')
      await expect(page.locator('.cdk-overlay-container')).toHaveCSS('visibility', 'visible')
      await expect(page.locator('.cdk-overlay-container')).toHaveCSS('z-index', '801')

      // 几何和命中正确仍可能漏掉 Safari 合成裁剪；截图像素也必须覆盖视口四角。
      const screenshot = await page.screenshot()
      await testInfo.attach('fullscreen', {body: screenshot, contentType: 'image/png'})
      const cornerPixels = await page.evaluate(async data => {
        const image = new Image()
        image.src = `data:image/png;base64,${data}`
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const context = canvas.getContext('2d')!
        context.drawImage(image, 0, 0)
        return [[8, 8], [1272, 8], [8, 792], [1272, 792]].map(([x, y]) =>
          Array.from(context.getImageData(x, y, 1, 1).data),
        )
      }, screenshot.toString('base64'))
      expect(cornerPixels).toEqual(Array(4).fill([255, 255, 255, 255]))

      // 模拟全屏期间 Angular / 虚拟化插入根级兄弟；宿主样式应保持生效，退出后自动恢复。
      await page.evaluate(() => document.querySelector('[data-blockcraft-root]')!.appendChild(document.createElement('p')))
      await expect(paper).toHaveCSS('overflow-x', 'visible')
      await page.getByRole('button', {name: '退出', exact: true}).click()
      await expect(paper).toHaveCSS('overflow-x', 'clip')
      await expect(paper).toHaveCSS('isolation', 'isolate')
      await expect(viewport).toHaveCSS('overflow-y', 'auto')
      await expect(viewport).toHaveCSS('z-index', '1')
      await expect(host).toHaveCSS('z-index', '1')
      await expect(host).toHaveCSS('margin-top', '140px')
      await expect.poll(() => viewport.evaluate(element => element.scrollTop)).toBe(500)
      await page.waitForTimeout(150)
      expect(errors).toEqual([])
      await page.evaluate(() => window.bcFullscreenFixtureController.destroy())
    })
  }
}
