import {expect, test, type Page} from '@playwright/test'

async function settleLayout(page: Page): Promise<void> {
  await page.evaluate(async () => {
    for (let frame = 0; frame < 6; frame++) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    }
  })
}

for (const paginated of [false, true]) {
  test(`typing and Enter retain a visible caret in ${paginated ? 'paginated' : 'continuous'} layout`, async ({page}) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/*', route => {
      const hostname = new URL(route.request().url()).hostname
      return /^(localhost|127\.0\.0\.1)$/.test(hostname) ? route.continue() : route.abort()
    })
    await page.goto('/', {waitUntil: 'domcontentloaded'})
    await page.getByRole('button', {name: '初始化', exact: true}).click()
    await page.waitForFunction(() => {
      const element = document.querySelector('block-craft-editor')
      return element && (window as any).ng?.getComponent(element)?.doc?.isInitialized
    })
    const fixture = await page.evaluate(async paginated => {
      const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      const viewport = document.createElement('div')
      viewport.id = 'selection-scroll-fixture'
      viewport.style.cssText = 'position:fixed;left:100px;top:100px;width:700px;height:300px;overflow:auto;background:white;z-index:99999;padding:16px;box-sizing:border-box'
      const surface = document.createElement('div')
      surface.style.paddingBottom = '120px'
      const mount = document.createElement('div')
      surface.appendChild(mount)
      viewport.appendChild(surface)
      document.body.appendChild(viewport)
      const sourcePagination = source.plugins.find((plugin: any) => plugin.name === 'pagination')
      const pagination = new sourcePagination.constructor({
        enabled: false,
        experimentalSparseView: true,
        pageSize: 'A4',
        margins: {top: 72, right: 72, bottom: 72, left: 72},
      })
      const paragraphs = Array.from({length: 60}, (_, index) =>
        source.schemas.createSnapshot('paragraph', [[{insert: `段落 ${index + 1}：输入与滚动位置验证。`}]]),
      )
      const snapshot = source.schemas.createSnapshot('root', ['scroll-fixture', paragraphs])
      const doc = new source.constructor({
        ...source.config,
        yDoc: new source.yDoc.constructor(),
        docId: snapshot.id,
        plugins: [pagination],
        scrollContainer: viewport,
        readonly: false,
        virtualization: {
          enabled: true,
          overscanViewports: 1,
          segmentMergeGap: 2,
          retainedViewLimit: 12,
          estimatedHeights: {paragraph: 32},
        },
      })
      ;(window as any).selectionScrollFixture = {doc, writes: []}
      doc.initBySnapshot(snapshot, mount)
      if (paginated) pagination.enable()
      return {lastId: paragraphs.at(-1).id, rootId: snapshot.id}
    }, paginated)
    await settleLayout(page)
    await page.evaluate(async lastId => {
      const {doc} = (window as any).selectionScrollFixture
      await doc.navigateToBlock(lastId)
      doc.selection.setCursorAtBlock(lastId, false)
    }, fixture.lastId)
    await settleLayout(page)
    await page.evaluate(() => {
      const fixture = (window as any).selectionScrollFixture
      const viewport = document.querySelector<HTMLElement>('#selection-scroll-fixture')!
      let prototype: object | null = viewport
      let descriptor: PropertyDescriptor | undefined
      while (prototype && !descriptor) {
        descriptor = Object.getOwnPropertyDescriptor(prototype, 'scrollTop')
        prototype = Object.getPrototypeOf(prototype)
      }
      const scrollTop = descriptor!
      // Preserve the native setter and record all programmatic corrections,
      // including a reveal and an opposing restore in the same animation frame.
      Object.defineProperty(viewport, 'scrollTop', {
        configurable: true,
        get() { return scrollTop.get!.call(this) },
        set(value: number) {
          const before = scrollTop.get!.call(this)
          scrollTop.set!.call(this, value)
          fixture.writes.push({before, after: scrollTop.get!.call(this)})
        },
      })
    })

    await page.keyboard.type(' typing across wrapped lines'.repeat(12), {delay: 5})
    await settleLayout(page)
    for (let index = 0; index < 5; index++) {
      await page.keyboard.press('Enter')
      await settleLayout(page)
      const emptyParagraph = await page.locator(`#selection-scroll-fixture [data-block-id]`).last().boundingBox()
      const viewport = await page.locator('#selection-scroll-fixture').boundingBox()
      expect(emptyParagraph!.y + emptyParagraph!.height).toBeLessThanOrEqual(viewport!.y + viewport!.height + 1)
      await page.keyboard.type('new paragraph', {delay: 5})
      await settleLayout(page)
    }
    const result = await page.evaluate(() => {
      const {doc, writes} = (window as any).selectionScrollFixture
      const viewport = document.querySelector<HTMLElement>('#selection-scroll-fixture')!
      const caret = doc.selection.getSelectionRect()
      return {
        reverseWrites: writes.filter((write: {before: number; after: number}) => write.after < write.before - 0.5),
        rootCount: doc.model.getChildrenIds(doc.rootId).length,
        caretBottom: caret?.bottom,
        viewportBottom: viewport.getBoundingClientRect().bottom,
        lastText: doc.getBlockById(doc.model.getChildrenIds(doc.rootId).at(-1)).hostElement.textContent.replace(/[\u200b\u200c]/g, ''),
      }
    })
    expect(result.reverseWrites).toEqual([])
    expect(result.rootCount).toBe(65)
    expect(result.lastText).toBe('new paragraph')
    expect(result.caretBottom).toBeGreaterThan(0)
    expect(result.caretBottom).toBeLessThanOrEqual(result.viewportBottom + 1)
    expect(errors).toEqual([])
    await page.evaluate(() => {
      ;(window as any).selectionScrollFixture.doc.destroy()
      document.querySelector('#selection-scroll-fixture')!.remove()
    })
  })
}
