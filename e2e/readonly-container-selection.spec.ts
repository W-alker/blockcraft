import {expect, test} from '@playwright/test'

for (const readonly of [true, false]) {
  for (const backward of [false, true]) {
    test(`${readonly ? '只读' : '编辑'}模式跨表格和容器${backward ? '向上' : '向下'}连续拖选`, async ({page, browserName}) => {
      await page.setViewportSize({width: 1280, height: 1100})
      await page.goto('/')
      await page.getByRole('button', {name: '初始化', exact: true}).click()
      await page.waitForFunction(() => (window as any).ng
        ?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
      await page.evaluate(readonly => {
        const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
        const viewport = document.createElement('div')
        viewport.id = 'container-selection-fixture'
        viewport.style.cssText = 'position:fixed;left:40px;top:40px;width:850px;height:950px;overflow:auto;background:white;z-index:99999;padding:24px'
        const mount = document.createElement('div')
        viewport.appendChild(mount)
        document.body.appendChild(viewport)
        const paragraph = (text: string) => source.schemas.createSnapshot('paragraph', [text])
        const first = paragraph('Original anchor before all containers')
        const header = source.schemas.createSnapshot('render-unit', [])
        header.children = [first]
        const table = source.schemas.createSnapshot('table', [2, 2])
        table.children.forEach((row: any, r: number) => row.children.forEach((cell: any, c: number) => {
          cell.children = [paragraph(`Cell ${r} ${c}`)]
        }))
        const callout = source.schemas.createSnapshot('callout', [])
        callout.children = [paragraph('First callout line'), paragraph('Second callout line')]
        const columns = source.schemas.createSnapshot('columns', [2])
        columns.children[0].children = [paragraph('Left column first line'), paragraph('Left column second line')]
        columns.children[1].children = [paragraph('Right column first line'), paragraph('Right column second line')]
        const region = source.schemas.createSnapshot('render-unit', [])
        region.children = [paragraph('First region line'), paragraph('Second region line')]
        const last = paragraph('Final text after all containers')
        const snapshot = source.schemas.createSnapshot('root', ['container-selection', [header, table, columns, paragraph('Between table and callout'), callout, region, last]])
        const doc = new source.constructor({
          ...source.config, yDoc: new source.yDoc.constructor(), docId: snapshot.id,
          plugins: source.config.plugins.filter((plugin: any) => ['table-block-binding', 'block-controller'].includes(plugin.name)).map((plugin: any) => new plugin.constructor()), readonly, scrollContainer: viewport, virtualization: {enabled: false},
        })
        doc.initBySnapshot(snapshot, mount)
        source.destroy()
        const probe = {doc, before: doc.exportSnapshot(), writes: [] as string[], copied: false, adapters: [] as string[], html: '', warnings: [] as string[]}
        ;(window as any).containerSelectionProbe = probe
        const warn = doc.logger.warn.bind(doc.logger)
        doc.logger.warn = (...args: any[]) => { probe.warnings.push(args.map(String).join(' ')); warn(...args) }
        for (const method of ['setBaseAndExtent', 'removeAllRanges', 'collapse']) {
          const selection = window.getSelection() as any
          const original = selection[method].bind(selection)
          selection[method] = (...args: any[]) => {
            if (probe.writes.length < 5) probe.writes.push(method)
            return original(...args)
          }
        }
        const copy = doc.clipboard.copyFromSelection.bind(doc.clipboard)
        doc.clipboard.copyFromSelection = (...args: any[]) => copy(...args).then((result: unknown) => {
          probe.copied = true
          return result
        })
        for (const adapter of doc.clipboard.adapter.supportedAdapters) {
          const convert = adapter.fromSnapshot.bind(adapter)
          adapter.fromSnapshot = (...args: any[]) => {
            probe.adapters.push(adapter.type)
            return convert(...args)
          }
        }
        const destination = document.createElement('textarea')
        destination.id = 'container-selection-copy'
        destination.style.cssText = 'position:fixed;bottom:0;left:0;z-index:999999'
        destination.addEventListener('paste', event => { probe.html = event.clipboardData?.getData('text/html') ?? '' })
        document.body.appendChild(destination)
      }, readonly)
      const points = await page.locator('#container-selection-fixture c-text').evaluateAll(elements => elements.map(element => {
        const range = document.createRange()
        const node = element.firstChild!
        range.setStart(node, 0)
        range.setEnd(node, 1)
        const rect = range.getBoundingClientRect()
        range.setStart(node, node.textContent!.length - 1)
        range.setEnd(node, node.textContent!.length)
        const endRect = range.getBoundingClientRect()
        return {start: {x: rect.left + 1, y: rect.top + rect.height / 2},
          end: {x: endRect.right - 1, y: endRect.top + endRect.height / 2}, text: node.textContent,
          id: element.closest('[data-block-id]')!.getAttribute('data-block-id')}
      }))
      if (backward) points.reverse()
      const start = backward ? points[0].end : points[0].start
      await page.mouse.move(start.x, start.y)
      await page.mouse.down()
      for (const point of points.slice(1)) {
        const target = backward ? point.start : point.end
        await page.mouse.move(target.x, target.y, {steps: 12})
        await page.waitForTimeout(40)
        const state = await page.evaluate(() => {
          const native = window.getSelection()!
          const probe = (window as any).containerSelectionProbe
          return {text: native.toString(), anchor: native.anchorNode?.parentElement?.closest('[data-block-id]')?.getAttribute('data-block-id'),
            focus: native.focusNode?.parentElement?.closest('[data-block-id]')?.getAttribute('data-block-id'),
            model: probe.doc.selection.value?.toJSON(), writes: probe.writes}
        })
        if (readonly) {
          expect(state, JSON.stringify({point, state})).toMatchObject({anchor: points[0].id, writes: []})
          // Native table selection can snap the moving endpoint to another
          // cell when entering from outside; the original text anchor must stay.
          if (!point.text?.startsWith('Cell ')) expect(state.focus, JSON.stringify({point, state})).toBe(point.id)
        }
        expect(state.text.trim()).not.toBe('')
        expect(state.model).toBeTruthy()
      }
      await expect(page.locator('#container-selection-fixture .table-block')).toHaveClass(/selected/)
      if (browserName !== 'firefox') {
        expect(await page.locator('#container-selection-fixture td').first().evaluate(element =>
          getComputedStyle(element).getPropertyValue('-webkit-user-modify'),
        )).toBe(readonly ? 'read-only' : 'read-write')
      }
      await page.mouse.up()
      if (readonly) {
        await page.keyboard.press('ControlOrMeta+c')
        await expect.poll(() => page.evaluate(() => (window as any).containerSelectionProbe.copied)).toBe(true)
        await page.locator('#container-selection-copy').click()
        await page.keyboard.press('ControlOrMeta+v')
        const copied = await page.locator('#container-selection-copy').inputValue()
        for (const text of ['Original anchor', 'Cell 0 0', 'Left column', 'First callout', 'First region', 'Final text']) {
          expect(copied).toContain(text)
        }
        const result = await page.evaluate(() => {
          const probe = (window as any).containerSelectionProbe
          return {adapters: probe.adapters, html: probe.html, warnings: probe.warnings}
        })
        expect(result.adapters).toEqual(['text/html', 'text/markdown'])
        expect(result.warnings).toEqual([])
        expect(result.html, JSON.stringify(result)).toContain('data-bc-clipboard-format')
        expect(result.html).toContain('Original anchor')
        expect(result.html).toContain('Cell 0 0')
      }
      expect(await page.evaluate(() => {
        const probe = (window as any).containerSelectionProbe
        return JSON.stringify(probe.before) === JSON.stringify(probe.doc.exportSnapshot())
      })).toBe(true)
    })
  }
}
