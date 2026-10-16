import {expect, test, type Page} from '@playwright/test'

async function settle(page: Page) {
  await page.evaluate(async () => {
    for (let i = 0; i < 6; i++) await new Promise(requestAnimationFrame)
  })
}

async function state(page: Page) {
  await settle(page)
  return page.evaluate(() => {
    const {doc, id, regionId} = (window as any).nestedPlacement
    const block = doc.getBlockById(id)
    const rect = block.hostElement.getBoundingClientRect()
    const parentId = doc.model.getParentId(id)
    return {
      parentId, parentFlavour: doc.model.getFlavour(parentId),
      grandparentId: doc.model.getParentId(parentId), rootId: doc.rootId,
      regionId, regionChildren: doc.model.getChildrenIds(regionId),
      connected: block.hostElement.isConnected,
      cssPosition: getComputedStyle(block.hostElement).position,
      x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      layout: doc.placement.getObjectLayout(id),
      snapshot: doc.model.toSnapshot(id),
    }
  })
}

test.use({viewport: {width: 1600, height: 1100}})

for (const flavour of ['text-box', 'object-group']) {
  for (const paginated of [false, true]) {
    test(`${flavour} lifts from a container into root placement (${paginated ? 'paginated' : 'scaled'})`, async ({page}) => {
      test.setTimeout(90_000)
      await page.routeWebSocket('**', socket => socket.close())
      await page.route('**/*', route => {
        const url = new URL(route.request().url())
        return ['http:', 'https:'].includes(url.protocol) &&
          !['127.0.0.1', 'localhost'].includes(url.hostname)
          ? route.abort() : route.continue()
      })
      await page.goto('/')
      await page.getByRole('button', {name: '初始化', exact: true}).click()
      await page.waitForFunction(() => {
        const host = document.querySelector('block-craft-editor')
        return !!host && !!(window as any).ng?.getComponent(host)?.doc?.isInitialized
      })
      await page.evaluate(({flavour, paginated}) => {
        const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
        const viewport = document.createElement('div')
        viewport.id = 'nested-placement-fixture'
        viewport.style.cssText = 'position:fixed;left:40px;top:40px;width:1200px;height:950px;overflow:auto;background:white;z-index:10'
        const mount = document.createElement('div')
        mount.style.width = '800px'
        viewport.appendChild(mount)
        document.body.appendChild(viewport)
        const text = source.schemas.createSnapshot('text-box', ['Nested text', {width: 200, height: 100}])
        const member = source.schemas.createSnapshot('shape', ['rect', 'member'])
        member.props = {...member.props, width: 100, height: 60, position: '0 0'}
        const object = flavour === 'text-box' ? text : source.schemas.createSnapshot('object-group', [
          {width: 100, height: 60}, [member],
        ])
        const region = source.schemas.createSnapshot('render-unit', [{}, {p: '24 36'}])
        // Also cover lifting the container's only child (the group case).
        region.children = flavour === 'object-group' ? [object] : [
          source.schemas.createSnapshot('paragraph', [[{insert: 'Before nested object'}]]), object,
        ]
        const snapshot = source.schemas.createSnapshot('root', ['nested-placement', [
          source.schemas.createSnapshot('paragraph', [[{insert: 'Before container'}]]), region,
          source.schemas.createSnapshot('paragraph', [[{insert: 'After container'}]]),
        ]])
        const create = (snapshot: any) => {
          const plugins = [new (source.plugins.find((p: any) => p.name === 'object-format-toolbar').constructor)()]
          if (paginated) plugins.push(new (source.plugins.find((p: any) => p.name === 'pagination').constructor)({
            enabled: true, experimentalSparseView: true, pageSize: 'A4',
            margins: {top: 72, right: 72, bottom: 72, left: 72},
          }))
          const doc = new source.constructor({
            ...source.config, yDoc: new source.yDoc.constructor(), docId: snapshot.id,
            plugins, scrollContainer: viewport, readonly: false, virtualization: {enabled: true},
          })
          doc.initBySnapshot(snapshot, mount)
          if (!paginated) {
            doc.viewScale.attach(mount)
            doc.viewScale.setScale(0.75)
          }
          return doc
        }
        ;(window as any).nestedPlacement = {doc: create(snapshot), id: object.id, regionId: region.id, create, viewport}
      }, {flavour, paginated})
      try {
        const before = await state(page)
        expect(before.parentId).toBe(before.regionId)
        await page.evaluate(() => {
          const {doc, id} = (window as any).nestedPlacement
          doc.crud.undoManager.clearHistory()
          doc.selection.selectBlock(id)
        })
        await settle(page)
        if (flavour === 'text-box') await page.getByRole('button', {name: '布局与排列', exact: true}).click()
        await page.getByRole('button', {name: '浮于文字上方', exact: true}).click()
        const floating = await state(page)
        expect(floating.parentFlavour).toBe('placement-layout')
        expect(floating.grandparentId).toBe(floating.rootId)
        expect(floating.regionChildren).not.toContain(floating.snapshot.id)
        expect(floating.connected).toBe(true)
        expect(floating.cssPosition).toBe('absolute')
        expect(Math.abs(floating.x - before.x)).toBeLessThan(2)
        expect(Math.abs(floating.y - before.y)).toBeLessThan(2)
        expect(floating.snapshot.children).toEqual(before.snapshot.children)

        await page.evaluate(() => (window as any).nestedPlacement.doc.crud.undoManager.undo())
        const undone = await state(page)
        expect(undone.parentId).toBe(before.regionId)
        expect(undone.snapshot).toEqual(before.snapshot)
        expect(undone.connected).toBe(true)
        expect(Math.abs(undone.x - before.x)).toBeLessThan(2)
        expect(Math.abs(undone.y - before.y)).toBeLessThan(2)
        expect(await page.evaluate(() => (window as any).nestedPlacement.doc.crud.undoManager.isCanUndo())).toBe(false)

        await page.evaluate(() => (window as any).nestedPlacement.doc.crud.undoManager.redo())
        expect((await state(page)).snapshot).toEqual(floating.snapshot)
        await page.evaluate(() => {
          const fixture = (window as any).nestedPlacement
          const snapshot = fixture.doc.exportSnapshot()
          fixture.doc.destroy()
          fixture.doc = fixture.create(snapshot)
        })
        const reopened = await state(page)
        expect(reopened.parentFlavour).toBe('placement-layout')
        expect(reopened.snapshot).toEqual(floating.snapshot)
        expect(reopened.connected).toBe(true)
        expect(Math.abs(reopened.x - floating.x)).toBeLessThan(2)
        expect(Math.abs(reopened.y - floating.y)).toBeLessThan(2)
        await page.evaluate(() => {
          const {doc, id} = (window as any).nestedPlacement
          doc.placement.setObjectLayout(id, 'under')
        })
        expect((await state(page)).layout).toBe('under')
        await page.evaluate(() => {
          const {doc, id} = (window as any).nestedPlacement
          doc.placement.setObjectLayout(id, 'top-bottom')
        })
        const returned = await state(page)
        expect(returned.parentId).toBe(returned.rootId)
        expect(returned.connected).toBe(true)
        expect(returned.layout).toBe('top-bottom')
      } finally {
        await page.evaluate(() => {
          const fixture = (window as any).nestedPlacement
          fixture.doc.destroy()
          fixture.viewport.remove()
        })
      }
    })
  }
}
