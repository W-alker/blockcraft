import {expect, test} from '@playwright/test'

const cases = [
  {name: '正常异步写入', api: 'available', format: 'all'},
  {name: '缺少 clipboard.write', api: 'unavailable', format: 'all'},
  {name: '缺少 ClipboardItem', api: 'missing-item', format: 'all'},
  {name: '异步写入被拒绝', api: 'rejected', format: 'all'},
  {name: '粘贴端仅保留 HTML', api: 'unavailable', format: 'html'},
  {name: '仅用 adapter HTML 导入', api: 'unavailable', format: 'adapter-html'},
  {name: '慢 adapter 且原生回写失败时用同步 HTML 标记粘贴', api: 'slow', format: 'html'},
]

for (const scenario of cases) {
  test(`只读富文本和表格复制到另一编辑文档保留结构（${scenario.name}）`, async ({page}) => {
    await page.setViewportSize({width: 1280, height: 1000})
    await page.goto('/')
    await page.getByRole('button', {name: '初始化', exact: true}).click()
    await page.waitForFunction(() => (window as any).ng
      ?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
    await page.evaluate(scenario => {
      const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      const viewport = document.createElement('div')
      viewport.id = 'rich-paste-fixture'
      viewport.style.cssText = 'position:fixed;left:40px;top:40px;width:850px;height:850px;overflow:auto;background:white;z-index:99999;padding:24px'
      const mount = document.createElement('div')
      viewport.appendChild(mount)
      document.body.appendChild(viewport)
      const paragraph = (text: string) => source.schemas.createSnapshot('paragraph', [text])
      const first = paragraph('Rich readonly source')
      first.children = [{insert: 'Rich readonly source', attributes: {'a:bold': true}}]
      const table = source.schemas.createSnapshot('table', [1, 2])
      table.children[0].children.forEach((cell: any, index: number) => {
        cell.children = [paragraph(index === 0 ? 'Structured cell Alpha' : 'Structured cell Beta')]
      })
      const callout = source.schemas.createSnapshot('callout', [])
      callout.children = [paragraph('Container content')]
      const last = paragraph('Italic readonly ending')
      last.children = [{insert: 'Italic readonly ending', attributes: {'a:italic': true}}]
      const snapshot = source.schemas.createSnapshot('root', ['readonly-rich-paste', [first, table, callout, last]])
      const doc = new source.constructor({
        ...source.config, yDoc: new source.yDoc.constructor(), docId: snapshot.id,
        plugins: source.config.plugins.filter((plugin: any) => ['table-block-binding', 'block-controller'].includes(plugin.name)).map((plugin: any) => new plugin.constructor()),
        readonly: true, scrollContainer: viewport, virtualization: {enabled: false},
      })
      doc.initBySnapshot(snapshot, mount)
      source.destroy()
      const probe = {doc, before: JSON.stringify(doc.exportSnapshot()), firstId: first.id, lastId: last.id,
        adapters: [] as string[], copied: false, pasteTypes: [] as string[], html: '', warnings: [] as string[],
        release: undefined as (() => void) | undefined, importedHtml: 0}
      ;(window as any).richPasteProbe = probe
      for (const adapter of doc.clipboard.adapter.supportedAdapters) {
        const convert = adapter.fromSnapshot.bind(adapter)
        adapter.fromSnapshot = (...args: any[]) => {
          probe.adapters.push(adapter.type)
          const converted = convert(...args)
          if (scenario.api === 'slow' && adapter.type === 'text/html') {
            const released = new Promise<void>(resolve => { probe.release = resolve })
            return Promise.all([converted, released]).then(([html]) => html)
          }
          return converted
        }
      }
      const copy = doc.clipboard.copyFromSelection.bind(doc.clipboard)
      doc.clipboard.copyFromSelection = (...args: any[]) => copy(...args).then((result: unknown) => {
        probe.copied = true
        return result
      })
      const warn = doc.logger.warn.bind(doc.logger)
      doc.logger.warn = (...args: any[]) => { probe.warnings.push(args.map(String).join(' ')); warn(...args) }
      if (['unavailable', 'slow'].includes(scenario.api)) Object.defineProperty(navigator.clipboard, 'write', {value: undefined, configurable: true})
      if (scenario.api === 'slow') Object.defineProperty(document, 'execCommand', {value: () => false, configurable: true})
      if (scenario.api === 'missing-item') Object.defineProperty(window, 'ClipboardItem', {value: undefined, configurable: true})
      if (scenario.api === 'rejected') Object.defineProperty(navigator.clipboard, 'write', {
        value: () => Promise.reject(new DOMException('gesture required', 'NotAllowedError')), configurable: true,
      })
    }, scenario)
    const points = await page.evaluate(() => {
      const {firstId, lastId} = (window as any).richPasteProbe
      return [firstId, lastId].map((id, index) => {
        const node = document.querySelector(`#rich-paste-fixture [data-block-id="${id}"] c-text`)!.firstChild!
        const range = document.createRange()
        range.setStart(node, index === 0 ? 0 : node.textContent!.length - 1)
        range.setEnd(node, index === 0 ? 1 : node.textContent!.length)
        const rect = range.getBoundingClientRect()
        return {x: index === 0 ? rect.left + 1 : rect.right - 1, y: rect.top + rect.height / 2}
      })
    })
    await page.mouse.move(points[0].x, points[0].y)
    await page.mouse.down()
    await page.mouse.move(points[1].x, points[1].y, {steps: 25})
    await page.mouse.up()
    await page.keyboard.press('ControlOrMeta+c')
    if (scenario.api !== 'slow') {
      await expect.poll(() => page.evaluate(() => (window as any).richPasteProbe.copied)).toBe(true)
    } else {
      expect(await page.evaluate(() => (window as any).richPasteProbe.copied)).toBe(false)
    }
    await page.evaluate(scenario => {
      const probe = (window as any).richPasteProbe
      const source = probe.doc
      const target = source.schemas.createSnapshot('paragraph', ['Paste target:'])
      const snapshot = source.schemas.createSnapshot('root', ['rich-paste-destination', [target]])
      const viewport = document.getElementById('rich-paste-fixture')!
      // Keep the source model alive until the delayed adapter completes, but
      // focus and paste into a distinct editable document and Y.Doc.
      for (const child of Array.from(viewport.children)) (child as HTMLElement).style.display = 'none'
      const mount = document.createElement('div')
      viewport.appendChild(mount)
      const destination = new source.constructor({
        ...source.config, yDoc: new source.yDoc.constructor(), docId: snapshot.id,
        plugins: source.config.plugins.map((plugin: any) => new plugin.constructor()), readonly: false,
      })
      destination.initBySnapshot(snapshot, mount)
      probe.destination = destination
      probe.targetId = target.id
      const htmlAdapter = destination.clipboard.adapter.getAdapter('text/html')
      const convert = htmlAdapter.toSnapshot.bind(htmlAdapter)
      htmlAdapter.toSnapshot = (...args: any[]) => { probe.importedHtml++; return convert(...args) }
      destination.root.hostElement.addEventListener('paste', (event: ClipboardEvent) => {
        if (scenario.format !== 'all') {
          // Explicitly model a system/application dropping custom MIME types.
          // The adapter-only variant also removes the private HTML marker.
          const data = new DataTransfer()
          data.setData('text/plain', event.clipboardData!.getData('text/plain'))
          let html = event.clipboardData!.getData('text/html')
          if (scenario.format === 'adapter-html') {
            const parsed = new DOMParser().parseFromString(html, 'text/html')
            parsed.querySelectorAll('[data-bc-clipboard-format]').forEach(marker => marker.remove())
            html = parsed.body.innerHTML
          }
          if (html) data.setData('text/html', html)
          Object.defineProperty(event, 'clipboardData', {value: data})
        }
        probe.pasteTypes = Array.from(event.clipboardData?.types ?? [])
        probe.html = event.clipboardData?.getData('text/html') ?? ''
      }, true)
    }, scenario)
    const targetId = await page.evaluate(() => (window as any).richPasteProbe.targetId)
    await page.locator(`#rich-paste-fixture [data-block-id="${targetId}"] c-text`).click()
    await page.keyboard.press('End')
    await page.keyboard.press('ControlOrMeta+v')
    await expect.poll(() => page.evaluate(() => {
      const {destination} = (window as any).richPasteProbe
      return destination.exportSnapshot().children.filter((block: any) => block.flavour === 'table').length
    })).toBe(1)
    if (scenario.api === 'slow') {
      await page.evaluate(() => (window as any).richPasteProbe.release())
      await expect.poll(() => page.evaluate(() => (window as any).richPasteProbe.copied)).toBe(true)
    }
    const result = await page.evaluate(() => {
      const probe = (window as any).richPasteProbe
      const snapshot = probe.destination.exportSnapshot()
      const deltas: any[] = []
      const blocks: any[] = []
      const visit = (value: any) => {
        if (value.insert !== undefined) deltas.push(value)
        if (value.flavour) blocks.push(value)
        value.children?.forEach(visit)
      }
      visit(snapshot)
      return {adapters: probe.adapters, pasteTypes: probe.pasteTypes, html: probe.html, warnings: probe.warnings,
        unchanged: probe.before === JSON.stringify(probe.doc.exportSnapshot()), importedHtml: probe.importedHtml,
        bold: deltas.filter(delta => delta.insert.includes('Rich readonly source') && delta.attributes?.['a:bold']).length,
        italic: deltas.filter(delta => delta.insert.includes('Italic readonly ending') && delta.attributes?.['a:italic']).length,
        callouts: blocks.filter(block => block.flavour === 'callout').length,
        alpha: deltas.filter(delta => delta.insert.includes('Structured cell Alpha')).length}
    })
    expect(result, JSON.stringify(result)).toMatchObject({adapters: ['text/html', 'text/markdown'],
      warnings: scenario.api === 'slow' ? ['rich clipboard write error execCommand copy failed'] : [],
      bold: 1, italic: 1, callouts: 1, alpha: 1, unchanged: true,
      importedHtml: scenario.format === 'adapter-html' ? 1 : 0})
    expect(result.pasteTypes).toContain('text/html')
    if (scenario.format !== 'adapter-html') expect(result.html).toContain('data-bc-clipboard-format')
    const destinationText = page.locator('#rich-paste-fixture [data-blockcraft-root]:not(.readonly) c-text')
    await expect(destinationText.filter({hasText: 'Rich readonly source'}).first()).toHaveCSS('font-weight', /^(bold|[6-9]00)$/)
    await expect(destinationText.filter({hasText: 'Italic readonly ending'}).first()).toHaveCSS('font-style', 'italic')
  })
}
