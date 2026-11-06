import {expect, test, type Page} from '@playwright/test'

async function readTableLayout(page: Page) {
  return page.evaluate(() => {
    const {doc, pagination, mediaId, tableId} = (window as any).__fittedMediaTest
    const layout = pagination._controller._stableLayout
    const table = document.querySelector<HTMLElement>(`[data-block-id="${tableId}"]`)
    if (!table || !layout) return null
    const scale = doc.viewScale.geometryScale
    const sheets = Array.from(document.querySelectorAll('.bc-page-sheet'))
      .map(sheet => sheet.getBoundingClientRect())
    const firstPage = layout.result.byBlock.get(tableId)?.pageIndex
    const sheet = sheets[firstPage]
    if (!sheet) return null
    const geom = layout.geometry
    const bounds = sheets.map(sheet => ({
      top: sheet.top + geom.contentTop * scale,
      bottom: sheet.bottom - geom.contentBottom * scale,
    }))
    const rows = Array.from(table.querySelectorAll<HTMLElement>('tr.table-row-block'))
      .map(row => row.getBoundingClientRect())
    return {
      topError: Math.abs(table.getBoundingClientRect().top - bounds[firstPage].top),
      overflowingRows: rows.filter(row => !bounds.some(bound =>
        row.top >= bound.top - 2 && row.bottom <= bound.bottom + 2)).length,
      rows: rows.length,
      spacers: table.querySelectorAll('.bc-pagination-spacer').length,
      mediaMounted: !!document.querySelector(`[data-block-id="${mediaId}"]`),
      scale,
    }
  })
}

for (const flavour of ['image', 'video'] as const) {
  test(`${flavour} 缩小分页后移出和返回视口，后续表格仍对齐正文区`, async ({page}) => {
    test.setTimeout(90_000)
    await page.goto('/')
    await page.waitForFunction(() => !!(window as any).ng?.getComponent(
      document.querySelector('block-craft-editor'))?.doc)
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    await page.evaluate(flavour => {
      const editor = (window as any).ng.getComponent(document.querySelector('block-craft-editor'))
      const doc = editor.doc
      const paragraph = (text: string) => doc.schemas.createSnapshot('paragraph', [text])
      const media = flavour === 'image'
        ? doc.schemas.createSnapshot('image', [{
          src: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="1200"><rect width="600" height="1200" fill="#568ab4"/></svg>'),
          wr: 100, ar: 0.5,
        }, undefined, undefined, '图片说明保持原始字号'])
        : doc.schemas.createSnapshot('video', [{url: '', sourceType: 'local', wr: 100, ar: 0.5}])
      const table = doc.schemas.createSnapshot('table', [12, 3])
      table.props.colWidths = [150, 150, 200]
      table.children.forEach((row: any, i: number) => row.children.forEach((cell: any, j: number) => {
        cell.children = [paragraph(`第 ${i + 1} 行，第 ${j + 1} 列`)]
      }))
      const root = doc.schemas.createSnapshot('root', [editor.rootId, [
        media,
        ...Array.from({length: 60}, (_, i) => paragraph(`普通正文 ${i + 1}`)),
        table, paragraph('表格后正文'),
      ]])
      const home = (window as any).ng.getComponent(document.querySelector('playground-home'))
      home.ensureEditorInitialized(root)
      // This programmatic fixture bypasses the UI's scale-settings lifecycle.
      doc.viewScale.attach(home.documentScaleSurface)
      const pagination = doc.plugins.find((p: any) => p.name === 'pagination')
      pagination.disable()
      pagination._controller?.destroy()
      pagination._controller = null
      pagination._experimentalSparseView = true
      pagination.updateConfig({
        pageSize: {width: 640, height: 480},
        margins: {top: 48, right: 48, bottom: 48, left: 48}, pageGap: 24,
      })
      pagination.enable()
      ;(window as any).__fittedMediaTest = {doc, pagination, mediaId: media.id, tableId: table.id}
    }, flavour)

    await expect.poll(() => page.evaluate(() => {
      const {pagination, mediaId} = (window as any).__fittedMediaTest
      return pagination._controller._stableLayout?.items.find((item: any) => item.id === mediaId)?.fitScale ?? 1
    })).toBeLessThan(1)
    const initialSnapshot = await page.evaluate(() =>
      JSON.stringify((window as any).__fittedMediaTest.doc.exportSnapshot()))

    for (const scale of [1, 1.25]) {
      await page.evaluate(async scale => {
        const {doc, mediaId} = (window as any).__fittedMediaTest
        doc.viewScale.setScale(scale)
        await doc.navigateToBlock(mediaId)
      }, scale)
      await expect(page.locator('[data-bc-page-media-fitted]')).toHaveCount(1)
      if (flavour === 'video') {
        await expect.poll(() => page.evaluate(() => {
          const {doc, mediaId} = (window as any).__fittedMediaTest
          const host = document.querySelector(`[data-block-id="${mediaId}"]`)!
          const frame = host.querySelector('.video-block__wrapper')!.getBoundingClientRect()
          const gap = host.querySelector('[data-block-gap-side="after"]')!.getBoundingClientRect()
          return Math.abs(gap.left - frame.right - doc.viewScale.geometryScale)
        })).toBeLessThan(.6)
      }
      await page.evaluate(async () => {
        const {doc, tableId} = (window as any).__fittedMediaTest
        doc.selection.blur()
        await doc.navigateToBlock(tableId)
      })
      // Video intentionally keeps its live playback view outside the viewport.
      await expect.poll(async () => (await readTableLayout(page))?.mediaMounted).toBe(flavour === 'video')
      await expect.poll(async () => (await readTableLayout(page))?.spacers ?? 0).toBeGreaterThan(0)
      await expect.poll(async () => (await readTableLayout(page))?.topError ?? Infinity).toBeLessThan(2)
      await expect.poll(async () => (await readTableLayout(page))?.overflowingRows ?? -1,
        {timeout: 15_000, message: JSON.stringify(await readTableLayout(page))}).toBe(0)
      const actual = await readTableLayout(page)
      expect(actual?.scale).toBeCloseTo(scale, 2)
      expect(actual?.rows).toBe(12)
      expect(actual?.overflowingRows, JSON.stringify(actual)).toBe(0)
    }
    expect(await page.evaluate(() =>
      JSON.stringify((window as any).__fittedMediaTest.doc.exportSnapshot()))).toBe(initialSnapshot)
  })
}
