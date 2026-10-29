import {expect, test, type Page} from '@playwright/test'

// Set up a cached-tab host around a separate real document. Only fixture creation
// uses the debug API; scrolling and detach/reattach are driven by visible UI.
async function createTabFixture(page: Page, rootCount: number, hideMode: 'detach' | 'display') {
  await page.goto('/')
  await page.waitForFunction(() => {
    const editor = document.querySelector('block-craft-editor')
    return !!editor && !!(window as any).ng?.getComponent(editor)?.doc
  })
  await page.evaluate(async ({rootCount, hideMode}) => {
    const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const host = document.createElement('section')
    host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#eef1f5;display:flex;flex-direction:column'
    const tabs = document.createElement('nav')
    tabs.setAttribute('aria-label', '缓存页签回归')
    tabs.style.cssText = 'height:48px;flex:none;display:flex;gap:12px;padding:6px 20px;background:white'
    const documentTab = document.createElement('button')
    documentTab.textContent = '回归文档'
    documentTab.setAttribute('role', 'tab')
    documentTab.setAttribute('aria-selected', 'true')
    const otherTab = document.createElement('button')
    otherTab.textContent = '文档库'
    otherTab.setAttribute('role', 'tab')
    otherTab.setAttribute('aria-selected', 'false')
    tabs.append(documentTab, otherTab)
    const panel = document.createElement('div')
    panel.dataset['testid'] = 'cached-document-panel'
    panel.style.cssText = 'min-height:0;flex:1;display:flex;flex-direction:column'
    const viewport = document.createElement('div')
    viewport.dataset['testid'] = 'cached-document-viewport'
    viewport.style.cssText = 'height:100%;overflow:auto;position:relative;overflow-anchor:none'
    const surface = document.createElement('div')
    surface.style.cssText = 'position:relative;margin:0 auto'
    viewport.append(surface)
    panel.append(viewport)
    const other = document.createElement('div')
    other.textContent = '文档库页签：原文档保留在缓存中'
    other.style.cssText = 'padding:32px'
    host.append(tabs, panel)
    document.body.append(host)
    let savedScrollTop = 0
    otherTab.addEventListener('click', () => {
      savedScrollTop = viewport.scrollTop
      if (hideMode === 'detach') panel.remove()
      else panel.style.display = 'none'
      host.append(other)
      otherTab.setAttribute('aria-selected', 'true')
      documentTab.setAttribute('aria-selected', 'false')
    })
    documentTab.addEventListener('click', () => {
      other.remove()
      host.append(panel)
      panel.style.display = 'flex'
      viewport.scrollTop = savedScrollTop
      documentTab.setAttribute('aria-selected', 'true')
      otherTab.setAttribute('aria-selected', 'false')
    })
    const paragraph = (text: string) => source.schemas.createSnapshot('paragraph', [text])
    const members = Array.from({length: 24}, (_, index) => source.schemas.createSnapshot('text-box', [
      `组合内容 ${index + 1}：切回页签后应保留完整内容`,
      {position: `24 ${18 + index * 43}`, width: 470, height: 38},
    ]))
    const group = source.schemas.createSnapshot('object-group', [{width: 540, height: 1090}, members])
    const paragraphs = Array.from({length: rootCount}, (_, index) => paragraph(`正文 ${index + 1}，用于验证滚动后仍然只挂载可见窗口。`))
    const root = source.schemas.createSnapshot('root', ['tab-reattach-fixture', [group, ...paragraphs]])
    const Pagination = source.plugins.find((plugin: any) => plugin.name === 'pagination').constructor
    const pagination = new Pagination({enabled: false, experimentalSparseView: true,
      pageSize: {width: 640, height: 1280}, margins: {top: 40, right: 40, bottom: 40, left: 40}, pageGap: 24})
    const doc = new source.constructor({...source.config, docId: root.id,
      yDoc: new source.yDoc.constructor(), plugins: [pagination], scrollContainer: viewport,
      virtualization: {...source.config.virtualization, enabled: true, idlePrefetch: false}})
    doc.initBySnapshot(root, surface)
    doc.onDestroy(doc.viewScale.attach(surface))
    // A document tail object keeps its extent while the flow group is virtualized,
    // matching the original document's independently positioned content.
    const tail = doc.schemas.createSnapshot('text-box', ['独立浮动文本', {
      position: '40 1500', width: 240, height: 52,
    }])
    doc.placement.insertAbsoluteSnapshot(tail, {anchorRect: null})
    pagination.enable()
    const fixture = {doc, pagination, groupId: group.id, viewport, panel,
      originalSnapshot: JSON.stringify(doc.exportSnapshot()),
      rootCount: doc.model.getChildrenIds(doc.rootId).length, peakMounted: 0, everFallback: false}
    const observeMounts = () => {
      fixture.peakMounted = Math.max(fixture.peakMounted, doc.vm.getMountedRootChildIds().length)
      fixture.everFallback ||= doc.virtualization.fullMountFallback === true
      requestAnimationFrame(observeMounts)
    }
    requestAnimationFrame(observeMounts)
    ;(window as any).__tabReattach = fixture
  }, {rootCount, hideMode})
  await expect.poll(async () => (await readState(page)).groupHeight).toBeGreaterThan(1000)
  await expect.poll(async () => (await readState(page)).pending).toBe(false)
}

async function readState(page: Page) {
  return page.evaluate(() => {
    const {doc, pagination, groupId, viewport, panel, originalSnapshot, rootCount, peakMounted, everFallback} = (window as any).__tabReattach
    const controller = pagination._controller
    const manager = doc.virtualization
    const layout = controller?._stableLayout
    const group = panel.querySelector(`[data-block-id="${groupId}"]`) as HTMLElement | null
    const rectangle = group?.getBoundingClientRect()
    const viewportRect = viewport.getBoundingClientRect()
    return {
      connected: panel.isConnected, rendered: !!rectangle && rectangle.height > 0,
      groupHeight: layout?.items.find((item: any) => item.id === groupId)?.height ?? -1,
      groupDomHeight: rectangle?.height ?? 0,
      groupVisible: !!rectangle && rectangle.bottom > viewportRect.top && rectangle.top < viewportRect.bottom,
      scrollTop: viewport.scrollTop, scrollHeight: viewport.scrollHeight,
      mounted: doc.vm.getMountedRootChildIds().length, rootCount, peakMounted, everFallback,
      fallback: manager.fullMountFallback === true,
      revision: controller?._layoutRevision,
      pending: !!controller?._rafId,
      snapshotUnchanged: JSON.stringify(doc.exportSnapshot()) === originalSnapshot,
    }
  })
}

async function scrollDocument(page: Page, deltaY: number) {
  const viewport = page.getByTestId('cached-document-viewport')
  const bounds = (await viewport.boundingBox())!
  await page.mouse.move(bounds.x + bounds.width - 36, bounds.y + bounds.height / 2)
  await page.mouse.wheel(0, deltaY)
}

for (const hideMode of ['detach', 'display'] as const) {
  for (const rootCount of [12, 240]) {
    test(`滚动后切换缓存页签保留组合块和虚拟窗口 (${hideMode}, ${rootCount} 段)`, async ({page}, testInfo) => {
      await page.setViewportSize({width: 1280, height: 800})
      await createTabFixture(page, rootCount, hideMode)
      await scrollDocument(page, 650)
      await expect.poll(async () => (await readState(page)).scrollTop).toBeGreaterThan(500)
      await expect.poll(async () => (await readState(page)).groupVisible).toBe(true)
      const baseline = await readState(page)
      const states: unknown[] = [{phase: 'baseline', ...baseline}]
      for (let cycle = 0; cycle < 3; cycle++) {
        await expect.poll(async () => (await readState(page)).pending).toBe(false)
        const beforeHide = await readState(page)
        await page.getByRole('tab', {name: '文档库', exact: true}).click()
        await expect(page.getByRole('tab', {name: '文档库', exact: true})).toHaveAttribute('aria-selected', 'true')
        // Allow real ResizeObserver deliveries while the cached host has no box.
        await page.waitForTimeout(250)
        const hidden = await readState(page)
        states.push({phase: `hidden-${cycle}`, ...hidden})
        expect(hidden.groupHeight, JSON.stringify({baseline, hidden})).toBe(baseline.groupHeight)
        expect(hidden.revision).toBe(beforeHide.revision)
        await page.getByRole('tab', {name: '回归文档', exact: true}).click()
        await expect.poll(async () => (await readState(page)).groupVisible).toBe(true)
        await expect.poll(async () => (await readState(page)).pending).toBe(false)
        const restored = await readState(page)
        states.push({phase: `restored-${cycle}`, ...restored})
        expect(restored.groupHeight).toBe(baseline.groupHeight)
        expect(restored.groupDomHeight).toBeGreaterThan(1000)
        expect(Math.abs(restored.scrollTop - baseline.scrollTop)).toBeLessThan(2)
        expect(restored.fallback).toBe(false)
        expect(restored.snapshotUnchanged).toBe(true)
        if (rootCount > 100) expect(restored.mounted).toBeLessThan(rootCount / 2)
        // No idle recompute loop after reattachment settles.
        await page.waitForTimeout(350)
        expect((await readState(page)).revision).toBe(restored.revision)
      }
      await page.screenshot({path: testInfo.outputPath('restored-tab.png')})
      if (rootCount > 100) {
        // Firefox caps a large wheel delta to one viewport. Exercise repeated
        // real wheel input until the group is beyond the normal overscan window.
        for (let step = 0; step < 10 && (await readState(page)).scrollTop < 4000; step++) {
          const previous = (await readState(page)).scrollTop
          await scrollDocument(page, 900)
          await expect.poll(async () => (await readState(page)).scrollTop).toBeGreaterThan(previous)
        }
        expect((await readState(page)).scrollTop).toBeGreaterThanOrEqual(4000)
      } else {
        await scrollDocument(page, 4500)
      }
      await expect.poll(async () => (await readState(page)).groupVisible).toBe(false)
      if (rootCount > 100) await expect.poll(async () => (await readState(page)).rendered).toBe(false)
      const scrolled = await readState(page)
      states.push({phase: 'scrolled-away', ...scrolled})
      expect(scrolled.everFallback).toBe(false)
      expect(scrolled.fallback).toBe(false)
      if (rootCount > 100) expect(scrolled.peakMounted).toBeLessThan(rootCount / 2)
      for (let step = 0; step < 15 && (await readState(page)).scrollTop > 0; step++) {
        const previous = (await readState(page)).scrollTop
        await scrollDocument(page, -900)
        await expect.poll(async () => (await readState(page)).scrollTop).toBeLessThan(previous)
      }
      expect((await readState(page)).scrollTop).toBe(0)
      await expect.poll(async () => (await readState(page)).groupVisible).toBe(true)
      expect((await readState(page)).groupDomHeight).toBeGreaterThan(1000)
      states.push({phase: 'scrolled-back', ...await readState(page)})
      await testInfo.attach('tab-reattach-states.json', {
        body: JSON.stringify(states, null, 2), contentType: 'application/json',
      })
    })
  }
}
