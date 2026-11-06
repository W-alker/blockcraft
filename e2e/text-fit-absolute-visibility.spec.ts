import {expect, test, type Page} from '@playwright/test'

async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    for (let i = 0; i < 12; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  })
}

for (const {flavour, vertical} of [
  {flavour: 'text-box', vertical: false},
  {flavour: 'text-box', vertical: true},
  {flavour: 'word-art', vertical: false},
]) {
  for (const retainedViewLimit of [0, 400]) {
    test(`${flavour} ${vertical ? 'vertical rotated' : 'horizontal'} floating auto-fit stays mounted while fixed siblings virtualize, retention ${retainedViewLimit}`, async ({page}) => {
      test.setTimeout(90000)
      await page.routeWebSocket('**', socket => socket.close())
      await page.goto('/')
      await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc)
      await page.evaluate(async ({flavour, vertical, retainedViewLimit}) => {
        const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
        const viewport = document.createElement('div')
        viewport.style.cssText = 'position:fixed;inset:12px auto auto 12px;width:1000px;height:360px;overflow:auto;background:white;z-index:99999'
        const target = document.createElement('div')
        viewport.append(target)
        document.body.append(viewport)
        const long = '浮动对象从下方进入视口，不能依赖旧高度。'.repeat(120)
        const object = source.schemas.createSnapshot(flavour, [long, {
          position: '40 3000', width: 200, height: 180, textFont: '18px 400',
          textPadding: '8 12', textAutoFit: 'resize-shape',
          textDirection: vertical ? 'vertical-rl' : 'horizontal', rotation: vertical ? 90 : 0,
        }])
        const fixed = Array.from({length: 30}, (_, i) => {
          const shape = source.schemas.createSnapshot('shape', ['rectangle'])
          Object.assign(shape.props, {position: `350 ${100 + i * 2000}`, width: 120, height: 80})
          return shape
        })
        const layout = source.schemas.createSnapshot('placement-layout', [[object, ...fixed]])
        const roots = Array.from({length: 1600}, (_, i) => source.schemas.createSnapshot('paragraph', [`正文 ${i}`]))
        const snapshot = source.schemas.createSnapshot('root', ['floating-fit', [layout, ...roots]])
        const doc = new source.constructor({...source.config, docId: snapshot.id,
          yDoc: new source.yDoc.constructor(), plugins: [], scrollContainer: viewport,
          virtualization: {enabled: true, idlePrefetch: false, retainedViewLimit, overscanViewports: 1}})
        await doc.initBySnapshot(snapshot, target)
        ;(window as any).__floatingFit = {doc, viewport, object, layout, long, fixed,
          textId: flavour === 'text-box' ? object.children[0].id : object.id}
      }, {flavour, vertical, retainedViewLimit})
      await settle(page)
      expect(await page.evaluate(() => {
        const f = (window as any).__floatingFit
        return f.doc.vm.isMounted(f.object.id)
      })).toBe(true)

      expect(await page.evaluate(() => {
        const f = (window as any).__floatingFit
        return {near: f.doc.vm.isMounted(f.fixed[0].id), far: f.doc.vm.has(f.fixed[20].id),
          count: f.doc.vm.get(f.layout.id).instance.childrenRenderRef.ids.length}
      })).toEqual({near: true, far: false, count: 2})

      const scroll = async (top: number) => {
        await page.evaluate(top => {
          const f = (window as any).__floatingFit
          const rootTop = f.doc.root.hostElement.getBoundingClientRect().top - f.viewport.getBoundingClientRect().top + f.viewport.scrollTop
          f.viewport.scrollTop = top + rootTop
        }, top)
        await settle(page)
      }
      const inspect = () => page.evaluate(() => {
        const f = (window as any).__floatingFit
        const view = f.doc.vm.get(f.object.id)?.instance
        const rect = view?.hostElement.isConnected ? view.hostElement.querySelector('[data-bc-object-surface]').getBoundingClientRect() : null
        const viewport = f.viewport.getBoundingClientRect()
        return {mounted: f.doc.vm.isMounted(f.object.id), fit: f.doc.model.getProps(f.object.id).textFit,
          visible: !!rect && rect.bottom > viewport.top && rect.top < viewport.bottom,
          position: f.doc.model.getProps(f.object.id).position, extent: f.doc.placement.surface.bottom}
      })
      await scroll(40000)
      expect((await inspect()).mounted).toBe(true)
      await scroll(vertical ? 3850 : 4400)
      expect(await inspect()).toMatchObject({mounted: true, visible: true, position: '40 3000'})

      // Offscreen auto-fit remains live, so content changes update geometry immediately.
      await scroll(2950)
      await page.evaluate(() => {
        const f = (window as any).__floatingFit
        f.doc.crud.replaceText(f.textId, 0, f.doc.model.getTextLength(f.textId), '短文本')
      })
      await settle(page)
      const short = await inspect()
      expect(short.fit).toBeLessThan(180)
      expect(short.extent).toBeCloseTo(58180, 0)
      await page.evaluate(() => { (window as any).__floatingFit.viewport.style.width = '960px' })
      await settle(page)
      await scroll(4400)
      // A viewport width change does not evict the resident object.
      expect((await inspect()).mounted).toBe(true)
      await scroll(40000)
      expect((await inspect()).mounted).toBe(true)
      await page.evaluate(() => {
        const f = (window as any).__floatingFit
        f.doc.crud.updateBlockProps(f.object.id, {position: '40 3010'})
      })
      await scroll(4400)
      // Moving the object preserves resident view identity.
      expect((await inspect()).mounted).toBe(true)
      await page.evaluate(() => {
        const f = (window as any).__floatingFit
        f.doc.crud.updateBlockProps(f.object.id, {position: '40 3000'})
      })
      await scroll(40000)
      await page.evaluate(() => {
        const f = (window as any).__floatingFit
        f.doc.crud.replaceText(f.textId, 0, f.doc.model.getTextLength(f.textId), f.long)
      })
      await settle(page)
      expect((await inspect()).fit).toBeGreaterThan(short.fit)
      await scroll(vertical ? 3850 : 4400)
      expect(await inspect()).toMatchObject({mounted: true, visible: true, position: '40 3000'})
      await scroll(40000)
      await page.evaluate(() => {
        const f = (window as any).__floatingFit
        f.doc.crud.updateBlockProps(f.object.id, {textFont: '17px 400'})
      })
      await scroll(vertical ? 3850 : 4400)
      expect(await inspect()).toMatchObject({mounted: true, visible: true})
      await scroll(40000)
      // Resident objects remain mounted even beyond their measured range.
      await scroll(flavour === 'text-box' ? 5700 : 11000)
      expect((await inspect()).mounted).toBe(true)
      await scroll(40000)
      expect(await page.evaluate(() => {
        const f = (window as any).__floatingFit
        return {near: f.doc.vm.has(f.fixed[0].id), far: f.doc.vm.isMounted(f.fixed[20].id),
          count: f.doc.vm.get(f.layout.id).instance.childrenRenderRef.ids.length}
      })).toEqual({near: false, far: true, count: 2})

      // A fixed offscreen object can still be requested synchronously by interaction/export.
      await page.evaluate(() => {
        const f = (window as any).__floatingFit
        f.release = f.doc.virtualization.acquireBlockViewLease([f.fixed[0].id])
        f.otherRelease = f.doc.virtualization.acquireBlockViewLease([f.fixed[1].id])
      })
      await settle(page)
      expect(await page.evaluate(() => {
        const f = (window as any).__floatingFit
        return f.doc.vm.isMounted(f.fixed[0].id)
      })).toBe(true)
      await page.evaluate(() => (window as any).__floatingFit.release())
      await settle(page)
      expect(await page.evaluate(() => {
        const f = (window as any).__floatingFit
        return f.doc.vm.has(f.fixed[0].id)
      })).toBe(false)
      await page.evaluate(() => (window as any).__floatingFit.otherRelease())
      await page.evaluate(() => {
        const f = (window as any).__floatingFit
        f.doc.crud.updateBlockProps(f.object.id, {textAutoFit: 'none'})
      })
      await settle(page)
      expect((await inspect()).mounted).toBe(false)
      await page.evaluate(() => {
        const f = (window as any).__floatingFit
        f.doc.crud.updateBlockProps(f.object.id, {textAutoFit: 'resize-shape'})
      })
      await settle(page)
      expect((await inspect()).mounted).toBe(true)
      await page.evaluate(() => {
        const f = (window as any).__floatingFit
        f.release = f.doc.virtualization.acquireFullDocumentViewLease()
      })
      await settle(page)
      expect(await page.evaluate(() => {
        const f = (window as any).__floatingFit
        return f.doc.vm.get(f.layout.id).instance.childrenRenderRef.ids
      })).toEqual(await page.evaluate(() => {
        const f = (window as any).__floatingFit
        return [f.object.id, ...f.fixed.map((object: any) => object.id)]
      }))
      await page.evaluate(() => (window as any).__floatingFit.release())
      await settle(page)
      expect(await page.evaluate(() => {
        const f = (window as any).__floatingFit
        return f.doc.vm.get(f.layout.id).instance.childrenRenderRef.ids.length
      })).toBe(2)

      // Grouping crosses the sparse/dense boundary; undo deletes the group while moving its children out.
      expect(await page.evaluate(() => {
        const f = (window as any).__floatingFit
        f.doc.crud.undoManager.clearHistory()
        f.groupId = f.doc.placement.group([f.object.id, f.fixed[0].id])
        return !!f.groupId
      })).toBe(true)
      await settle(page)
      const groupState = () => page.evaluate(() => {
        const f = (window as any).__floatingFit
        return {group: f.doc.vm.isMounted(f.groupId), object: f.doc.vm.isMounted(f.object.id),
          sibling: f.doc.vm.isMounted(f.fixed[0].id),
          parent: f.doc.model.getParentId(f.object.id) === f.groupId}
      })
      expect(await groupState()).toEqual({group: true, object: true, sibling: true, parent: true})
      await page.evaluate(() => (window as any).__floatingFit.doc.crud.undoManager.undo())
      await settle(page)
      expect(await groupState()).toEqual({group: false, object: true, sibling: false, parent: false})
      await page.evaluate(() => (window as any).__floatingFit.doc.crud.undoManager.redo())
      await settle(page)
      expect(await groupState()).toEqual({group: true, object: true, sibling: true, parent: true})
      await page.evaluate(() => {
        const f = (window as any).__floatingFit
        f.doc.placement.ungroup(f.groupId)
      })
      await settle(page)
      expect(await groupState()).toEqual({group: false, object: true, sibling: false, parent: false})
      await page.evaluate(() => {
        const f = (window as any).__floatingFit
        f.doc.selection.selectBlock(f.fixed[0].id)
      })
      await settle(page)
      expect(await page.evaluate(() => {
        const f = (window as any).__floatingFit
        return {selected: f.doc.vm.isMounted(f.fixed[0].id), unrelated: f.doc.vm.has(f.fixed[10].id)}
      })).toEqual({selected: true, unrelated: false})
      await page.evaluate(() => (window as any).__floatingFit.doc.selection.blur())
    })
  }
}

test('1000 fixed and 24 auto-fit objects share a sparse layer while scrolling upward', async ({page}, testInfo) => {
  test.setTimeout(120000)
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc)
  const result = await page.evaluate(async () => {
    const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const viewport = document.createElement('div')
    viewport.style.cssText = 'position:fixed;top:12px;left:12px;width:1000px;height:360px;overflow:auto;background:white;z-index:99999'
    const target = document.createElement('div')
    viewport.append(target)
    document.body.append(viewport)
    const fixed = Array.from({length: 1000}, (_, i) => {
      const object = source.schemas.createSnapshot('shape', ['rectangle'])
      Object.assign(object.props, {position: `400 ${i * 50}`, width: 100, height: 40})
      return object
    })
    const auto = Array.from({length: 24}, (_, i) => source.schemas.createSnapshot('text-box', [
      `常驻对象 ${i}：文字改变时立即更新尺寸。`.repeat(4),
      {position: `20 ${i * 2000}`, width: 240, height: 180, textAutoFit: 'resize-shape'},
    ]))
    const layout = source.schemas.createSnapshot('placement-layout', [[...fixed, ...auto]])
    const roots = Array.from({length: 1600}, (_, i) => source.schemas.createSnapshot('paragraph', [`正文 ${i}`]))
    const snapshot = source.schemas.createSnapshot('root', ['sparse-pressure', [...roots, layout]])
    const doc = new source.constructor({...source.config, docId: snapshot.id,
      yDoc: new source.yDoc.constructor(), plugins: [], scrollContainer: viewport,
      virtualization: {enabled: true, idlePrefetch: false, retainedViewLimit: 0}})
    const start = performance.now()
    await doc.initBySnapshot(snapshot, target)
    await document.fonts.ready
    const frame = () => new Promise<number>(resolve => requestAnimationFrame(resolve))
    for (let i = 0; i < 12; i++) await frame()
    const initMs = performance.now() - start
    const idsAtStart = doc.vm.get(layout.id).instance.childrenRenderRef.ids
    const refs = auto.map((object: any) => doc.vm.get(object.id))
    const failures: string[] = []
    const samples: number[] = []
    let maxFixedMounted = 0
    let previousFrame = await frame()
    for (let top = 50000; top >= 0; top -= 500) {
      const rootTop = doc.root.hostElement.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop
      viewport.scrollTop = top + rootTop
      for (let f = 0; f < 3; f++) {
        const now = await frame()
        samples.push(now - previousFrame)
        previousFrame = now
      }
      const mounted = new Set(doc.vm.get(layout.id).instance.childrenRenderRef.ids)
      maxFixedMounted = Math.max(maxFixedMounted, mounted.size - auto.length)
      if (auto.some((object: any, i: number) => !mounted.has(object.id) || doc.vm.get(object.id) !== refs[i])) failures.push(`resident at ${top}`)
      const planeTop = doc.vm.get(layout.id).instance.childrenRenderRef.containerElement.getBoundingClientRect().top
      const view = viewport.getBoundingClientRect()
      const from = Math.max(0, Math.floor((view.top - planeTop - 40) / 50))
      const to = Math.min(fixed.length - 1, Math.ceil((view.bottom - planeTop) / 50))
      for (let i = from; i <= to; i++) {
        const y = planeTop + i * 50
        if (y + 40 > view.top && y < view.bottom && !mounted.has(fixed[i].id)) failures.push(`missing ${i} at ${top}`)
      }
    }
    samples.sort((a, b) => a - b)
    const result = {initMs, initialFixedMounted: idsAtStart.length - auto.length, maxFixedMounted,
      finalFixedCached: fixed.filter((object: any) => doc.vm.has(object.id)).length,
      autoCount: auto.length, fixedCount: fixed.length, steps: 101,
      frameP95: samples[Math.floor(samples.length * .95)], maxFrame: samples[samples.length - 1], failures}
    const yDoc = doc.yDoc
    doc.destroy()
    yDoc.destroy()
    viewport.remove()
    return result
  })
  console.info('floating sparse pressure', testInfo.project.name, JSON.stringify(result))
  await testInfo.attach('floating-sparse-pressure.json', {body: JSON.stringify(result, null, 2), contentType: 'application/json'})
  expect(result.failures).toEqual([])
  expect(result.initialFixedMounted).toBeLessThan(30)
  expect(result.maxFixedMounted).toBeLessThan(30)
  expect(result.finalFixedCached).toBeLessThan(30)
})
