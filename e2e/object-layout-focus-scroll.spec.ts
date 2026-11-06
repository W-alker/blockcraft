import {expect, test, type Page} from '@playwright/test'

async function settleLayout(page: Page): Promise<void> {
  await page.evaluate(async () => {
    for (let frame = 0; frame < 6; frame++) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    }
  })
}

for (const paginated of [false, true]) {
  for (const flavour of ['shape', 'text-box']) {
    test(`${flavour} restoring gap focus after returning to flow preserves ${paginated ? 'paginated' : 'continuous'} viewport`, async ({page}) => {
      await page.goto('/')
      await page.getByRole('button', {name: '初始化', exact: true}).click()
      await page.waitForFunction(() => {
        const host = document.querySelector('block-craft-editor')
        return host && (window as any).ng?.getComponent(host)?.doc?.isInitialized
      })
      await page.evaluate(({flavour, paginated}) => {
        const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
        const viewport = document.createElement('div')
        viewport.id = 'object-layout-scroll-fixture'
        viewport.style.cssText = 'position:fixed;left:100px;top:100px;width:700px;height:500px;overflow:auto;background:white;z-index:99999;padding:16px;box-sizing:border-box'
        const mount = document.createElement('div')
        viewport.appendChild(mount)
        document.body.appendChild(viewport)
        const object = source.schemas.createSnapshot(flavour, flavour === 'shape' ? ['diamond', 'object'] : ['object'])
        const paragraphs = Array.from({length: 40}, (_, index) =>
          source.schemas.createSnapshot('paragraph', [[{insert: `Paragraph ${index + 1}`}]]),
        )
        const snapshot = source.schemas.createSnapshot('root', ['layout-scroll', [
          ...paragraphs.slice(0, 3), object, ...paragraphs.slice(3),
        ]])
        const gapPlugin = source.plugins.find((plugin: any) => plugin.name === 'block-gap-creator')
        const paginationPlugin = source.plugins.find((plugin: any) => plugin.name === 'pagination')
        const plugins = [new gapPlugin.constructor()]
        if (paginated) plugins.push(new paginationPlugin.constructor({
          enabled: true,
          experimentalSparseView: true,
          pageSize: 'A4',
          margins: {top: 72, right: 72, bottom: 72, left: 72},
        }))
        const doc = new source.constructor({
          ...source.config,
          yDoc: new source.yDoc.constructor(),
          docId: snapshot.id,
          plugins,
          scrollContainer: viewport,
          readonly: false,
          virtualization: {enabled: true},
        })
        doc.initBySnapshot(snapshot, mount)
        ;(window as any).layoutScrollFixture = {doc, viewport, id: object.id, lastId: paragraphs.at(-1).id}
      }, {flavour, paginated})
      try {
        await settleLayout(page)
        await page.evaluate(() => {
          const {doc, id} = (window as any).layoutScrollFixture
          doc.placement.setObjectLayout(id, 'over')
        })
        await settleLayout(page)
        await page.evaluate(() => {
          const {doc, id} = (window as any).layoutScrollFixture
          doc.selection.selectBlock(doc.getBlockById(id))
          // The object toolbar takes focus before moving the selected DOM
          // out of the absolute layer. WebKit then remembers a stale range.
          doc.root.hostElement.blur()
          doc.placement.setObjectLayout(id, 'top-bottom')
        })
        await settleLayout(page)
        const before = await page.evaluate(() => {
          const {doc, id, viewport} = (window as any).layoutScrollFixture
          const gap = doc.getBlockById(id).hostElement.querySelector(':scope > [data-block-gap-side="after"]')
          const rect = gap.getBoundingClientRect()
          const bounds = viewport.getBoundingClientRect()
          return {top: viewport.scrollTop, left: viewport.scrollLeft, x: rect.x, y: rect.y + rect.height / 2, bottom: bounds.bottom}
        })
        expect(before.y).toBeGreaterThan(100)
        expect(before.y).toBeLessThan(before.bottom)
        // Exercise the exact focus/DOM projection boundary independently of
        // browser automation's synthesized mouse event timing.
        await page.evaluate(() => {
          const {doc, id} = (window as any).layoutScrollFixture
          doc.selection.setGapCursor(id, 'after')
        })
        await settleLayout(page)
        const after = await page.evaluate(() => {
          const {doc, id, viewport} = (window as any).layoutScrollFixture
          return {id, top: viewport.scrollTop, left: viewport.scrollLeft, selection: doc.selection.value?.toJSON()}
        })
        expect(after.top).toBe(before.top)
        expect(after.left).toBe(before.left)
        expect(after.selection.anchor).toEqual({blockId: after.id, type: 'gap', side: 'after'})
        expect(after.selection.head).toEqual(after.selection.anchor)

        // A subsequent requested reveal must still scroll and stay visible
        // after animation frames; focus protection must not undo it later.
        await page.evaluate(() => {
          const {doc, lastId} = (window as any).layoutScrollFixture
          doc.selection.setCursorAtBlock(lastId, false, true)
        })
        await settleLayout(page)
        const reveal = await page.evaluate(() => {
          const {doc, viewport} = (window as any).layoutScrollFixture
          return {top: viewport.scrollTop, caret: doc.selection.getSelectionRect()?.toJSON(), bounds: viewport.getBoundingClientRect().toJSON()}
        })
        expect(reveal.top).toBeGreaterThan(before.top)
        expect(reveal.caret.top).toBeGreaterThanOrEqual(reveal.bounds.top)
        expect(reveal.caret.bottom).toBeLessThanOrEqual(reveal.bounds.bottom)
      } finally {
        await page.evaluate(() => {
          const fixture = (window as any).layoutScrollFixture
          fixture.doc.destroy()
          fixture.viewport.remove()
        })
      }
    })
  }
}
