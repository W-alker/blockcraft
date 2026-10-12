import {expect, test, type Page} from '@playwright/test'

async function initialize(page: Page) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.route('**/api/worker/link-preview**', route => route.fulfill({json: {title: '', description: ''}}))
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng
    ?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
}

async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    for (let i = 0; i < 8; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  })
}

for (const flavour of ['text-box', 'word-art']) {
  for (const autoFit of [false, true]) {
    test(`${flavour} ${autoFit ? 'fitted' : 'fixed'} keeps the viewport anchored through offscreen updates`, async ({page}) => {
      await initialize(page)
      const ids = await page.evaluate(async ({flavour, autoFit}) => {
        const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
        if (!doc.virtualization.enabled || !doc.vm.usesSparseRoot) throw new Error('Expected sparse virtualization')
        const oldIds = [...doc.model.getChildrenIds(doc.rootId)]
        const object = doc.schemas.createSnapshot(flavour, ['虚拟渲染中的文本对象。'.repeat(8), {
          width: 260, height: 280, textAutoFit: autoFit ? 'resize-shape' : 'none',
        }])
        const fillers = Array.from({length: 200}, (_, i) =>
          doc.schemas.createSnapshot('paragraph', [`占位段落 ${i}`]))
        doc.crud.transact(() => {
          doc.crud.insertBlockSnapshots(doc.rootId, 0, [object, ...fillers])
          for (const id of oldIds) doc.crud.deleteBlockById(id)
        })
        await doc.navigateToBlock(object.id)
        doc.selection.blur()
        return {id: object.id, textId: flavour === 'text-box' ? object.children[0].id : object.id, farId: fillers[170].id}
      }, {flavour, autoFit})
      await settle(page)
      const state = () => page.evaluate(({id, farId}) => {
        const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
        const projection = doc.virtualization.captureIdlePrefetchDiagnostics().virtualDocument
        const root = projection.roots.find((root: any) => root.id === id)
        const block = doc.vm.get(id)?.instance
        const surface = block?.hostElement.querySelector('[data-bc-object-surface]')
        const far = doc.vm.get(farId)?.instance.hostElement
        const viewport = doc.config.scrollContainer
        const props = doc.model.getProps(id)
        return {
          mounted: doc.vm.isMounted(id), mountedCount: doc.vm.getMountedRootChildIds().length,
          count: doc.model.getChildrenIds(doc.rootId).length,
          projected: root.height, cached: props.textFit ?? props.height,
          visibleHeight: surface?.isConnected ? parseFloat(getComputedStyle(surface).height) : null,
          anchorTop: far?.isConnected ? far.getBoundingClientRect().top - viewport.getBoundingClientRect().top : null,
          scrollTop: viewport.scrollTop, gap: doc.layoutMetrics.segmentGap,
        }
      }, ids)
      const initial = await state()
      await page.evaluate(async farId => {
        const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
        await doc.virtualization.scrollToBlock(farId, {align: 'center'})
      }, ids.farId)
      await settle(page)
      const before = await state()
      expect(before.mounted).toBe(false)
      expect(before.mountedCount).toBeLessThan(before.count / 2)
      expect(before.anchorTop).not.toBeNull()
      expect.soft(before.projected).toBe(initial.projected)
      await page.evaluate(({id, textId}) => {
        const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
        doc.crud.transact(() => {
          doc.crud.replaceText(textId, 0, doc.model.getTextLength(textId), '短句')
          doc.crud.updateBlockProps(id, {textPadding: '16 12'})
        })
      }, ids)
      await settle(page)
      const updated = await state()
      expect(updated.mounted).toBe(false)
      expect(updated.cached).toBe(before.cached)
      expect.soft(updated.projected).toBe(before.projected)
      expect.soft(Math.abs(updated.anchorTop! - before.anchorTop!)).toBeLessThanOrEqual(1)
      await page.evaluate(({id, autoFit}) => {
        const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
        doc.crud.updateBlockProps(id, autoFit ? {textFit: 420} : {height: 420})
      }, {...ids, autoFit})
      await settle(page)
      const resized = await state()
      expect.soft(resized.projected).toBe(420 + resized.gap)
      expect.soft(Math.abs(resized.anchorTop! - updated.anchorTop!)).toBeLessThanOrEqual(1)
      await page.evaluate(async id => {
        const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
        await doc.virtualization.scrollToBlock(id, {align: 'start'})
      }, ids.id)
      await settle(page)
      const returned = await state()
      expect(returned.mounted).toBe(true)
      if (autoFit) expect(returned.visibleHeight).toBeLessThan(initial.visibleHeight!)
      else expect(returned.visibleHeight).toBe(420)
      expect(returned.mountedCount).toBeLessThan(returned.count / 2)
    })
  }
}

test('fitted text keeps sparse rendering and returns scroll anchoring to pagination', async ({page}) => {
  await initialize(page)
  await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const oldIds = [...doc.model.getChildrenIds(doc.rootId)]
    const object = doc.schemas.createSnapshot('text-box', ['分页切换时保留自适应文字', {
      width: 260, height: 280, textAutoFit: 'resize-shape',
    }])
    const fillers = Array.from({length: 200}, (_, i) =>
      doc.schemas.createSnapshot('paragraph', [`分页段落 ${i}`]))
    doc.crud.transact(() => {
      doc.crud.insertBlockSnapshots(doc.rootId, 0, [object, ...fillers])
      for (const id of oldIds) doc.crud.deleteBlockById(id)
    })
    doc.selection.blur()
  })
  for (const paginated of [true, false, true, false]) {
    await page.evaluate(paginated => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      const plugin = doc.plugins.find((plugin: any) => plugin.name === 'pagination')
      if (paginated) plugin.enable()
      else plugin.disable()
    }, paginated)
    await settle(page)
    await expect.poll(() => page.evaluate(() => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      return {
        paginated: doc.root.hostElement.classList.contains('bc-paginated'),
        sparse: doc.vm.getMountedRootChildIds().length < doc.model.getChildrenIds(doc.rootId).length,
        leases: doc.virtualization.fullDocumentViewLeaseCount,
        anchor: CSS.supports('overflow-anchor', 'none')
          ? doc.config.scrollContainer.style.getPropertyValue('overflow-anchor') : 'unsupported',
      }
    })).toMatchObject({paginated, sparse: true, leases: 0})
    const anchor = await page.evaluate(() => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      return CSS.supports('overflow-anchor', 'none')
        ? doc.config.scrollContainer.style.getPropertyValue('overflow-anchor') : 'unsupported'
    })
    if (anchor !== 'unsupported') expect(anchor).toBe(paginated ? '' : 'none')
  }
})
