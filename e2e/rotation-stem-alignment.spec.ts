import {expect, test} from '@playwright/test'

for (const flavour of ['text-box', 'shape', 'word-art', 'image', 'sticker']) {
  for (const absolute of [false, true]) {
    for (const scale of [0.75, 1, 1.5]) {
      test(`${flavour} ${absolute ? 'absolute' : 'flow'} ${scale}x rotation stem joins both handles`, async ({page}) => {
        await page.setViewportSize({width: 1440, height: 1100})
        await page.routeWebSocket('**', socket => socket.close())
        await page.route('**/*', route => {
          const url = new URL(route.request().url())
          return ['http:', 'https:'].includes(url.protocol) && !['localhost', '127.0.0.1'].includes(url.hostname)
            ? route.abort() : route.continue()
        })
        await page.goto('/')
        await page.getByRole('button', {name: '初始化', exact: true}).click()
        await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
        const id = await page.evaluate(async ({flavour, absolute, scale}) => {
          const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
          const viewport = document.createElement('div')
          viewport.style.cssText = 'position:fixed;left:40px;top:60px;width:1100px;height:800px;padding:70px;overflow:auto;background:white;z-index:20'
          const mount = document.createElement('div')
          viewport.append(mount); document.body.append(viewport)
          const Format = source.plugins.find((p: any) => p.name === 'object-format-toolbar').constructor
          const doc = new source.constructor({...source.config, yDoc: new source.yDoc.constructor(), plugins: [new Format()],
            readonly: false, virtualization: {enabled: false}, scrollContainer: viewport})
          const canvas = document.createElement('canvas')
          canvas.width = 280; canvas.height = 160
          const args = flavour === 'shape' ? ['rectangle', '旋转抓手'] : flavour === 'sticker' ? ['sunburst']
            : flavour === 'image' ? [{src: canvas.toDataURL(), wr: 40, ar: 1.75}]
            : ['旋转抓手', {width: 280, height: 160}]
          const snapshot = source.schemas.createSnapshot(flavour, args)
          if (flavour === 'shape') Object.assign(snapshot.props, {width: 280, height: 160})
          doc.initBySnapshot({...source.model.toSnapshot(source.rootId), children: [snapshot]}, mount)
          if (absolute) {
            doc.placement.setMode(snapshot.id, 'absolute')
            doc.placement.updateAbsolute(snapshot.id, {x: 180, y: 150})
          }
          doc.viewScale.attach(mount); doc.viewScale.setScale(scale)
          await document.fonts.ready
          await doc.navigateToBlock(snapshot.id)
          doc.root.hostElement.focus()
          for (let i = 0; i < 2; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
          doc.selection.selectBlock(snapshot.id)
          ;(window as any).__rotationStemDoc = doc
          return snapshot.id as string
        }, {flavour, absolute, scale})
        const block = page.locator(`[data-block-id="${id}"]`)
        const resizer = block.locator('shape-resizer')
        await expect(resizer).toBeVisible()
        if (!absolute && ['image', 'sticker'].includes(flavour)) {
          await expect(resizer.locator('.shape-resizer__rotate, .shape-resizer__rotation-stem')).toHaveCount(0)
          return
        }
        const knob = resizer.locator('.shape-resizer__rotate')
        await expect(knob).toBeVisible()
        await expect(knob).toHaveCSS('cursor', /url\(.+\) 20 10, crosshair/)
        const measure = () => resizer.evaluate((element, scale) => {
          const north = element.querySelector<HTMLElement>('[data-handle="north"]')!
          const knob = element.querySelector<HTMLElement>('.shape-resizer__rotate')!
          const stem = element.querySelector<HTMLElement>('.shape-resizer__rotation-stem')!
          const centre = (el: HTMLElement) => { const r = el.getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height / 2} }
          const a = centre(knob), b = centre(north), s = centre(stem)
          const distance = Math.hypot(b.x - a.x, b.y - a.y)
          const unit = {x: (b.x - a.x) / distance, y: (b.y - a.y) / distance}
          const shift = (p: {x: number; y: number}, value: number) => ({x: p.x + unit.x * value, y: p.y + unit.y * value})
          // WebKit rounds offsetHeight from 14 to 15 at 75% zoom, while the
          // actual line remains 10.5 screen pixels. Use its CSS length instead.
          const height = (el: HTMLElement) => parseFloat(getComputedStyle(el).height)
          const gap = (p: {x: number; y: number}, q: {x: number; y: number}) =>
            Math.abs((p.x - q.x) * unit.x + (p.y - q.y) * unit.y)
          return {
            upperGap: gap(shift(a, height(knob) * scale / 2), shift(s, -height(stem) * scale / 2)),
            lowerGap: gap(shift(b, -height(north) * scale / 2), shift(s, height(stem) * scale / 2)),
            stemLength: height(stem),
            axisOffset: Math.abs((s.x - a.x) * unit.y - (s.y - a.y) * unit.x),
            knobSize: height(knob),
            knobHit: knob.contains(document.elementFromPoint(a.x, a.y)),
            mediaStemHit: stem.contains(document.elementFromPoint(s.x, s.y)),
          }
        }, scale)
        for (const angle of [0, 30]) {
          await page.evaluate(({id, angle}) => {
            const doc = (window as any).__rotationStemDoc
            doc.placement.updateObjectGeometry(doc.getBlockById(id), {rotation: angle})
            doc.selection.selectBlock(id)
          }, {id, angle})
          await expect.poll(async () => Math.max((await measure()).upperGap, (await measure()).lowerGap)).toBeLessThan(.2)
          const geometry = await measure()
          // A subpixel-wide line can snap sideways by half a screen pixel.
          expect(geometry.axisOffset).toBeLessThanOrEqual(.5)
          expect(geometry.stemLength).toBe(14)
          expect(geometry.knobSize).toBe(8)
          expect(await knob.evaluate(el => {
            const css = getComputedStyle(el)
            return css.backgroundColor === css.borderTopColor
          })).toBe(true)
          expect(geometry.knobHit).toBe(true)
          if (['image', 'sticker'].includes(flavour)) expect(geometry.mediaStemHit).toBe(true)
          if (flavour === 'text-box' && absolute && scale === 1 && angle === 0 && test.info().project.name === 'chromium') {
            const r = (await knob.boundingBox())!
            await page.screenshot({path: '/tmp/blockcraft-rotation-stem-final.png', clip: {x: r.x - 75, y: r.y - 6, width: 158, height: 58}})
          }
        }
        if (absolute && scale === 1) {
          const cursor = await knob.evaluate(el => getComputedStyle(el).cursor)
          expect(await knob.evaluate(async el => {
            const url = getComputedStyle(el).cursor.match(/url\("?([^"\)]+)"?\)/)?.[1]
            if (!url) return null
            const image = new Image()
            image.src = url
            await image.decode()
            return [image.naturalWidth, image.naturalHeight]
          })).toEqual([24, 24])
          await page.evaluate(() => (window as any).__rotationStemDoc.crud.undoManager.clearHistory())
          const r = (await knob.boundingBox())!
          await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2)
          await page.mouse.down()
          await expect(knob).toHaveCSS('cursor', cursor)
          await page.mouse.move(r.x + r.width / 2 + 30, r.y + r.height / 2 + 8, {steps: 6})
          await expect(knob).toHaveCSS('cursor', cursor)
          await page.mouse.up()
          const rotation = () => page.evaluate(id => (window as any).__rotationStemDoc.model.getProps(id).rotation, id)
          await expect.poll(rotation).not.toBe(30)
          await page.evaluate(() => (window as any).__rotationStemDoc.crud.undoManager.undo())
          await expect.poll(rotation).toBe(30)
        }
      })
    }
  }
}
