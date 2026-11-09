import {expect, test} from '@playwright/test'

for (const flavour of ['text-box', 'shape', 'word-art', 'image']) {
  for (const absolute of [false, true]) {
    test(`${flavour} ${absolute ? 'absolute' : 'flow'}: hover and inner focus use a light dashed frame; object selection is solid`, async ({page}) => {
      await page.routeWebSocket('**', socket => socket.close())
      await page.goto('/')
      await page.getByRole('button', {name: '初始化', exact: true}).click()
      await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
      const {id, leafId} = await page.evaluate(async ({flavour, absolute}) => {
        const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
        const viewport = document.createElement('div')
        viewport.style.cssText = 'position:fixed;left:40px;top:60px;width:1000px;height:750px;overflow:auto;background:white;z-index:20;padding:50px'
        const mount = document.createElement('div')
        viewport.append(mount); document.body.append(viewport)
        const canvas = document.createElement('canvas')
        canvas.width = 280; canvas.height = 160
        const args = flavour === 'image' ? [{src: canvas.toDataURL(), wr: 40, ar: 1.75}]
          : flavour === 'shape' ? ['rectangle', '对象内部文字'] : ['对象内部文字', {width: 280, height: 160}]
        const snapshot = source.schemas.createSnapshot(flavour, args)
        if (flavour === 'shape') Object.assign(snapshot.props, {width: 280, height: 160})
        if (flavour === 'image') snapshot.children = [source.schemas.createSnapshot('caption', ['图片说明'])]
        const Format = source.plugins.find((plugin: any) => plugin.name === 'object-format-toolbar').constructor
        const doc = new source.constructor({...source.config, yDoc: new source.yDoc.constructor(), plugins: [new Format()],
          readonly: false, virtualization: {enabled: false}, scrollContainer: viewport})
        doc.initBySnapshot({...source.model.toSnapshot(source.rootId), children: [snapshot]}, mount)
        if (absolute) {
          doc.placement.setMode(snapshot.id, 'absolute')
          doc.placement.updateAbsolute(snapshot.id, {x: 120, y: 100})
        }
        await doc.navigateToBlock(snapshot.id)
        doc.selection.blur()
        ;(window as any).__objectChromeDoc = doc
        return {id: snapshot.id as string, leafId: flavour === 'word-art' ? snapshot.id as string : doc.model.getChildrenIds(snapshot.id)[0] as string}
      }, {flavour, absolute})
      const block = page.locator(`[data-block-id="${id}"]`)
      const hint = block.locator(flavour === 'image' ? '.shape-resizer__frame'
        : flavour === 'shape' ? 'bc-object-edge-controls' : 'bc-object-corner-controls')
      const surface = block.locator(flavour === 'image' ? '.img-wrapper'
        : flavour === 'shape' ? '.shape-block__shell' : `.${flavour}-block__surface`)
      await surface.hover({position: {x: 80, y: 60}})
      await expect(hint).toHaveCSS('outline-style', 'dashed')
      await expect(hint).toHaveCSS('outline-width', '1px')
      if (flavour !== 'image') await expect(hint).toHaveCSS('opacity', '1')
      expect(await hint.evaluate(el => getComputedStyle(el).outlineColor)).toMatch(/0?\.35|35%/)
      await page.evaluate(leafId => {
        const doc = (window as any).__objectChromeDoc
        doc.root.hostElement.focus()
        doc.selection.setCursorAtBlock(leafId, true, false)
      }, leafId)
      await page.mouse.move(1200, 900)
      await expect(hint).toHaveCSS('outline-style', 'dashed')
      if (flavour !== 'image') await expect(hint).toHaveCSS('opacity', '1')
      else await expect(hint).toBeVisible()
      await page.emulateMedia({media: 'print'})
      await expect(hint).toBeHidden()
      await page.emulateMedia({media: 'screen'})
      await page.evaluate(id => (window as any).__objectChromeDoc.selection.selectBlock(id), id)
      const frame = block.locator('shape-resizer > .shape-resizer__frame')
      await expect(frame).toBeVisible()
      await expect(frame).toHaveCSS('outline-style', 'solid')
      await expect(frame).toHaveCSS('outline-width', '2px')
      if (flavour !== 'image') await expect(hint).toBeHidden()
      await page.evaluate(() => (window as any).__objectChromeDoc.toggleReadonly(true))
      await expect(block.locator('shape-resizer, bc-object-corner-controls, bc-object-edge-controls')).toHaveCount(0)
    })
  }
}
