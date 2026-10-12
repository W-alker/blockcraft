import {expect, test, type Page} from '@playwright/test'

async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    for (let i = 0; i < 8; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  })
}

for (const {flavour, direction, axis} of [
  {flavour: 'text-box', direction: 'horizontal', axis: 'height'},
  {flavour: 'text-box', direction: 'vertical-rl', axis: 'width'},
  {flavour: 'word-art', direction: 'horizontal', axis: 'height'},
] as const) {
  for (const retainedViewLimit of [0, 400]) {
    test(`${flavour} ${direction} renders correctly scrolling upward with ${retainedViewLimit ? 'retained' : 'recreated'} views`, async ({page}, testInfo) => {
      test.setTimeout(90000)
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.setViewportSize({width: 1280, height: 900})
      await page.routeWebSocket('**', socket => socket.close())
      await page.goto('/')
      await page.waitForFunction(() => (window as any).ng
        ?.getComponent(document.querySelector('block-craft-editor'))?.doc)
      await page.evaluate(async ({flavour, direction, axis, retainedViewLimit}) => {
        const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
        const frames = async () => {
          await document.fonts.ready
          for (let i = 0; i < 12; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
        }
        const create = (children: any[], enabled: boolean) => {
          const viewport = document.createElement('div')
          viewport.id = enabled ? 'upward-fit-viewport' : 'upward-fit-reference'
          viewport.style.cssText = 'position:fixed;top:12px;left:12px;width:1000px;height:720px;overflow:auto;padding:24px;box-sizing:border-box;background:white;z-index:99999;scroll-behavior:auto'
          if (!enabled) viewport.style.left = '-12000px'
          const target = document.createElement('div')
          viewport.append(target)
          document.body.append(viewport)
          const snapshot = source.schemas.createSnapshot('root', ['upward-scroll', children])
          const doc = new source.constructor({...source.config, docId: snapshot.id,
            yDoc: new source.yDoc.constructor(), plugins: [], scrollContainer: viewport,
            virtualization: {enabled, idlePrefetch: false, retainedViewLimit, overscanViewports: 1}})
          return {doc, viewport, target, snapshot}
        }
        const initialProps = {width: 240, height: 180, textFont: '16px 400', textPadding: '8 12',
          textAutoFit: 'resize-shape', textDirection: direction}
        const changedProps = {...initialProps, textFont: '18px 400', textPadding: '12 16',
          ...(axis === 'height' ? {width: 200} : {height: 160})}
        const objects = Array.from({length: 8}, (_, i) => {
          const short = `对象 ${i} 短句`
          const long = `对象 ${i} 从下向上滚动时，内容与尺寸必须正确。`.repeat(6)
          return {texts: i % 2 ? [long, short] : [short, long], props: [initialProps, changedProps]}
        })
        // Independent, fully rendered reference: the expected dimensions are
        // measured from real components, never calculated by the test itself.
        const referenceSnapshots = objects.flatMap(object => object.texts.map((text, stage) =>
          source.schemas.createSnapshot(flavour, [text, object.props[stage]])))
        const reference = create(referenceSnapshots, false)
        await reference.doc.initBySnapshot(reference.snapshot, reference.target)
        await frames()
        const expected = referenceSnapshots.map(snapshot => {
          const surface = reference.doc.getBlockById(snapshot.id).hostElement
            .querySelector('[data-bc-object-surface]')
          const style = getComputedStyle(surface)
          return {width: parseFloat(style.width), height: parseFloat(style.height)}
        })
        const yDoc = reference.doc.yDoc
        reference.doc.destroy()
        yDoc.destroy()
        reference.viewport.remove()
        const targets = objects.map((object, i) => {
          const snapshot = source.schemas.createSnapshot(flavour, [object.texts[0], {
            ...initialProps, ...(i < 6 ? {textFit: expected[i * 2][axis]} : {}),
          }])
          return {...object, snapshot, id: snapshot.id,
            textId: flavour === 'text-box' ? snapshot.children[0].id : snapshot.id,
            expected: expected.slice(i * 2, i * 2 + 2)}
        })
        const roots = Array.from({length: 220}, (_, i) => {
          const objectIndex = (i - 5) / 20
          return Number.isInteger(objectIndex) && targets[objectIndex]
            ? targets[objectIndex].snapshot
            : source.schemas.createSnapshot('paragraph', [`滚动参照段落 ${i}`])
        })
        const main = create(roots, true)
        await main.doc.initBySnapshot(main.snapshot, main.target)
        await frames()
        if (!main.doc.vm.usesSparseRoot) throw new Error('Expected sparse rendering')
        const initialView = main.doc.vm.get(targets[0].id)?.instance
        if (!initialView) throw new Error('First object must be initially rendered')
        ;(window as any).__upwardFit = {...main, targets, roots, axis, stage: 0, initialView}
      }, {flavour, direction, axis, retainedViewLimit})

      const evidence: unknown[] = []
      for (const stage of [1, 0]) {
        await page.evaluate(() => {
          const f = (window as any).__upwardFit
          f.viewport.scrollTop = f.viewport.scrollHeight
        })
        await settle(page)
        const detached = await page.evaluate(() => {
          const f = (window as any).__upwardFit
          return {mounted: f.targets.filter((t: any) => f.doc.vm.isMounted(t.id)).length,
            sameInstance: f.doc.vm.get(f.targets[0].id)?.instance === f.initialView}
        })
        expect(detached.mounted).toBe(0)
        if (stage === 1) expect(detached.sameInstance).toBe(retainedViewLimit > 0)
        const update = await page.evaluate(stage => {
          const f = (window as any).__upwardFit
          const before = f.targets.map((t: any) => f.doc.model.getProps(t.id).textFit)
          f.doc.crud.transact(() => {
            for (const t of f.targets) {
              f.doc.crud.replaceText(t.textId, 0, f.doc.model.getTextLength(t.textId), t.texts[stage])
              f.doc.crud.updateBlockProps(t.id, t.props[stage])
            }
          })
          f.stage = stage
          return before
        }, stage)
        if (stage === 1) {
          // These two objects have never been rendered or measured in this Doc.
          expect(update.slice(6)).toEqual([undefined, undefined])
        }
        await settle(page)
        expect(await page.evaluate(() => {
          const f = (window as any).__upwardFit
          return f.targets.map((t: any) => f.doc.model.getProps(t.id).textFit)
        })).toEqual(update)

        const visible = new Set<string>()
        let anchorChecks = 0, maxAnchorShift = 0, maxSizeError = 0, steps = 0
        await page.mouse.move(400, 360)
        for (; steps < 120; steps++) {
          const anchor = stage === 1 ? await page.evaluate(() => {
            const f = (window as any).__upwardFit
            f.viewport.scrollTop = Math.max(0, f.viewport.scrollTop - 180)
            const viewport = f.viewport.getBoundingClientRect()
            const candidate = f.roots.filter((r: any) => r.flavour === 'paragraph')
              .map((r: any) => ({id: r.id, element: f.doc.vm.get(r.id)?.instance.hostElement}))
              .find((r: any) => r.element?.isConnected &&
                r.element.getBoundingClientRect().top > viewport.top + 30 &&
                r.element.getBoundingClientRect().bottom < viewport.bottom - 30)
            return candidate ? {id: candidate.id, top: candidate.element.getBoundingClientRect().top} : null
          }) : null
          // First pass uses exact scroll offsets to check anchor compensation;
          // the return pass also exercises native upward wheel input.
          if (stage === 0) await page.mouse.wheel(0, -180)
          await settle(page)
          const state = await page.evaluate(anchor => {
            const f = (window as any).__upwardFit
            const viewport = f.viewport.getBoundingClientRect()
            const projection = f.doc.virtualization.captureIdlePrefetchDiagnostics().virtualDocument
            const measurements = f.targets.flatMap((t: any) => {
              const block = f.doc.vm.get(t.id)?.instance
              const surface = block?.hostElement.querySelector('[data-bc-object-surface]')
              if (!surface?.isConnected) return []
              const content = surface.querySelector('.text-box-block__content, .word-art-block__editor')
              const style = getComputedStyle(surface), rect = surface.getBoundingClientRect()
              const projected = projection.roots.find((root: any) => root.id === t.id)
              const next = f.roots[f.roots.findIndex((r: any) => r.id === t.id) + 1]
              const nextElement = f.doc.vm.get(next.id)?.instance.hostElement
              return [{id: t.id, width: parseFloat(style.width), height: parseFloat(style.height),
                expected: t.expected[f.stage], cache: f.doc.model.getProps(t.id).textFit,
                text: content.textContent, expectedText: t.texts[f.stage],
                overflow: f.axis === 'height' ? content.scrollHeight - content.clientHeight : content.scrollWidth - content.clientWidth,
                projected: projected.height, gap: f.doc.layoutMetrics.segmentGap,
                nextGap: nextElement?.isConnected ? nextElement.getBoundingClientRect().top - rect.bottom : null,
                visible: rect.bottom > viewport.top + 24 && rect.top < viewport.bottom - 24}]
            })
            const anchorElement = anchor && f.doc.vm.get(anchor.id)?.instance.hostElement
            return {measurements, mounted: f.doc.vm.getMountedRootChildIds().length,
              scrollTop: f.viewport.scrollTop,
              anchorShift: anchorElement?.isConnected ? anchorElement.getBoundingClientRect().top - anchor.top : null}
          }, anchor)
          expect(state.mounted).toBeLessThan(110)
          for (const m of state.measurements) {
            expect(m.text, `content of ${m.id}`).toContain(m.expectedText)
            expect(m.width).toBeGreaterThan(0)
            expect(m.height).toBeGreaterThan(0)
            const sizeError = Math.max(Math.abs(m.width - m.expected.width), Math.abs(m.height - m.expected.height))
            maxSizeError = Math.max(maxSizeError, sizeError)
            expect(sizeError, `reference size of ${m.id}`).toBeLessThanOrEqual(1)
            expect(Math.abs(m.cache - m[axis]), `cache of ${m.id}`).toBeLessThanOrEqual(1)
            expect(m.overflow, `clipped content of ${m.id}`).toBeLessThanOrEqual(1)
            expect(Math.abs(m.projected - m.height - m.gap), `virtual height of ${m.id}`).toBeLessThanOrEqual(2)
            if (m.nextGap !== null) expect(m.nextGap, `overlap after ${m.id}`).toBeGreaterThanOrEqual(-1)
            if (m.visible) visible.add(m.id)
          }
          if (anchor) {
            expect(state.anchorShift, 'visible anchor stays mounted').not.toBeNull()
            anchorChecks++
            maxAnchorShift = Math.max(maxAnchorShift, Math.abs(state.anchorShift!))
            expect(Math.abs(state.anchorShift!), 'remeasurement must preserve the visible anchor').toBeLessThanOrEqual(2)
          }
          if (state.scrollTop <= 1) break
        }
        expect(steps, 'must reach the top').toBeLessThan(120)
        expect(visible.size, 'all eight objects must pass through the viewport').toBe(8)
        if (stage === 1) expect(anchorChecks).toBeGreaterThan(5)
        evidence.push({stage, input: stage ? 'scrollTop' : 'wheel', steps, visible: visible.size,
          anchorChecks, maxAnchorShift, maxSizeError})
        if (stage === 1) await page.screenshot({path: testInfo.outputPath('upward-expanded.png')})
      }
      await testInfo.attach('upward-scroll-measurements', {body: JSON.stringify(evidence, null, 2), contentType: 'application/json'})
      expect(errors).toEqual([])
      await page.evaluate(() => {
        const f = (window as any).__upwardFit
        const yDoc = f.doc.yDoc
        f.doc.destroy()
        yDoc.destroy()
        f.viewport.remove()
        delete (window as any).__upwardFit
      })
    })
  }
}
