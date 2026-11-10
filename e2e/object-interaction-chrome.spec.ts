import {expect, test, type Locator} from '@playwright/test'

async function outlineBounds(locator: Locator) {
  return locator.evaluate(element => {
    const rect = element.getBoundingClientRect()
    const css = getComputedStyle(element)
    const extra = parseFloat(css.outlineWidth) + parseFloat(css.outlineOffset)
    const sx = rect.width / parseFloat(css.width)
    const sy = rect.height / parseFloat(css.height)
    return [rect.left - extra * sx, rect.top - extra * sy, rect.right + extra * sx, rect.bottom + extra * sy]
  })
}

for (const flavour of ['text-box', 'shape', 'word-art', 'image']) {
  for (const absolute of [false, true]) {
   for (const scale of (['text-box', 'image'].includes(flavour) ? [0.75, 1, 1.5] : [1])) {
    test(`${flavour} ${absolute ? 'absolute' : 'flow'} scale ${scale}: hover and inner focus use the same light dashed frame; object selection is solid`, async ({page}) => {
      await page.routeWebSocket('**', socket => socket.close())
      await page.goto('/')
      await page.getByRole('button', {name: '初始化', exact: true}).click()
      await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
      const {id, leafId} = await page.evaluate(async ({flavour, absolute, scale}) => {
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
        doc.viewScale.attach(mount)
        doc.viewScale.setScale(scale)
        await document.fonts.ready
        await doc.navigateToBlock(snapshot.id)
        doc.selection.blur()
        ;(window as any).__objectChromeDoc = doc
        return {id: snapshot.id as string, leafId: flavour === 'word-art' ? snapshot.id as string : doc.model.getChildrenIds(snapshot.id)[0] as string}
      }, {flavour, absolute, scale})
      const block = page.locator(`[data-block-id="${id}"]`)
      const hint = block.locator(flavour === 'image' ? '.shape-resizer__frame'
        : flavour === 'shape' ? 'bc-object-edge-controls' : 'bc-object-corner-controls')
      const surface = block.locator(flavour === 'image' ? '.img-wrapper'
        : flavour === 'shape' ? '.shape-block__shell' : `.${flavour}-block__surface`)
      await surface.hover({position: {x: 80, y: 60}})
      await expect(hint).toHaveCSS('outline-style', 'dashed')
      const dashedStyle = await hint.evaluate(element => {
        const css = getComputedStyle(element)
        return {width: css.outlineWidth, offset: css.outlineOffset}
      })
      if (scale === 1) await expect(hint).toHaveCSS('outline-width', '1px')
      if (flavour !== 'image') await expect(hint).toHaveCSS('opacity', '1')
      const offset = flavour === 'image' ? '2px' : flavour === 'shape' ? '0px' : '-1px'
      if (scale === 1) await expect(hint).toHaveCSS('outline-offset', offset)
      const hoverBounds = await outlineBounds(hint)
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
      const innerBounds = await outlineBounds(hint)
      innerBounds.forEach((value, i) => expect(value).toBeCloseTo(hoverBounds[i], 1))
      await page.emulateMedia({media: 'print'})
      await expect(hint).toBeHidden()
      await page.emulateMedia({media: 'screen'})
      await page.evaluate(id => (window as any).__objectChromeDoc.selection.selectBlock(id), id)
      const frame = block.locator('shape-resizer > .shape-resizer__frame')
      await expect(frame).toBeVisible()
      await expect(frame).toHaveCSS('outline-style', 'solid')
      await expect(frame).toHaveCSS('outline-width', dashedStyle.width)
      await expect(frame).toHaveCSS('outline-offset', dashedStyle.offset)
      await expect.poll(async () => Math.max(...(await outlineBounds(frame)).map((value, i) => Math.abs(value - hoverBounds[i])))).toBeLessThan(0.2)
      if (flavour !== 'image') await expect(hint).toBeHidden()
      await page.evaluate(() => (window as any).__objectChromeDoc.toggleReadonly(true))
      await expect(block.locator('shape-resizer, bc-object-corner-controls, bc-object-edge-controls')).toHaveCount(0)
    })
  }
}
}
