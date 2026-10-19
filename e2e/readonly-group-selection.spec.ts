import {expect, test} from '@playwright/test'

for (const startInsideGroup of [false, true]) {
  for (const backward of [false, true]) {
    test(`只读组合块${startInsideGroup ? '内部' : '外部'}起选${backward ? '向上' : '向下'}保留原生起点并复制`, async ({page}) => {
      await page.setViewportSize({width: 1280, height: 1100})
      await page.goto('/')
      await page.getByRole('button', {name: '初始化', exact: true}).click()
      await page.waitForFunction(() => (window as any).ng
        ?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
      await page.evaluate(() => {
        const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
        const viewport = document.createElement('div')
        viewport.id = 'group-selection-fixture'
        viewport.style.cssText = 'position:fixed;left:40px;top:40px;width:850px;height:950px;overflow:auto;background:white;z-index:99999;padding:24px'
        const mount = document.createElement('div')
        viewport.appendChild(mount)
        document.body.appendChild(viewport)
        const paragraph = (text: string) => source.schemas.createSnapshot('paragraph', [text])
        const group = (name: string) => {
          const members = [0, 1].map(index => source.schemas.createSnapshot('text-box', [
            `${name} member ${index} first line`,
            {width: 600, height: 100, position: `12 ${12 + index * 120}`, padding: 8},
          ]))
          for (let index = 0; index < members.length; index++) {
            members[index].children.push(paragraph(`${name} member ${index} second line`))
          }
          return source.schemas.createSnapshot('object-group', [{width: 650, height: 250}, members])
        }
        const snapshot = source.schemas.createSnapshot('root', ['group-selection', [
          paragraph('Before first group original anchor'), group('First group'),
          paragraph('Between groups ordinary paragraph'), group('Second group'),
          paragraph('After second group final text'),
        ]])
        const doc = new source.constructor({
          ...source.config, yDoc: new source.yDoc.constructor(), docId: snapshot.id,
          plugins: source.config.plugins.filter((plugin: any) =>
            ['object-format-toolbar', 'ObjectDrag', 'block-controller'].includes(plugin.name),
          ).map((plugin: any) => new plugin.constructor()),
          readonly: true, scrollContainer: viewport, virtualization: {enabled: false},
        })
        doc.initBySnapshot(snapshot, mount)
        source.destroy()
        const probe = {doc, before: doc.exportSnapshot(), writes: [] as string[], starts: [] as string[], adapters: [] as string[], copied: false, html: '', warnings: [] as string[]}
        ;(window as any).groupSelectionProbe = probe
        const warn = doc.logger.warn.bind(doc.logger)
        doc.logger.warn = (...args: any[]) => { probe.warnings.push(args.map(String).join(' ')); warn(...args) }
        for (const method of ['setBaseAndExtent', 'removeAllRanges', 'collapse', 'extend', 'addRange']) {
          const selection = window.getSelection() as any
          const original = selection[method].bind(selection)
          selection[method] = (...args: any[]) => {
            probe.writes.push(`${method}: ${new Error().stack}`)
            return original(...args)
          }
        }
        const collapse = Range.prototype.collapse
        Range.prototype.collapse = function (...args) {
          probe.writes.push(`Range.collapse: ${new Error().stack}`)
          return collapse.apply(this, args)
        }
        doc.root.hostElement.addEventListener('selectstart', (event: Event) => {
          probe.starts.push((event.target as HTMLElement)?.outerHTML?.slice(0, 300) ?? String(event.target))
        })
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
        destination.id = 'group-selection-copy'
        destination.style.cssText = 'position:fixed;bottom:0;left:0;z-index:999999'
        destination.addEventListener('paste', event => { probe.html = event.clipboardData?.getData('text/html') ?? '' })
        document.body.appendChild(destination)
      })
      const points = await page.locator('#group-selection-fixture c-text').evaluateAll(elements => elements.map(element => {
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
      if (startInsideGroup) points.shift()
      await page.evaluate(() => { (window as any).groupSelectionProbe.writes = [] })
      const start = backward ? points[0].end : points[0].start
      await page.mouse.move(start.x, start.y)
      await page.mouse.down()
      for (const point of points.slice(1)) {
        const target = backward ? point.start : point.end
        await page.mouse.move(target.x, target.y, {steps: 12})
        await page.waitForTimeout(40)
        const state = await page.evaluate(() => {
          const native = window.getSelection()!
          const probe = (window as any).groupSelectionProbe
          return {text: native.toString(), anchor: native.anchorNode?.parentElement?.closest('[data-block-id]')?.getAttribute('data-block-id'),
            focus: native.focusNode?.parentElement?.closest('[data-block-id]')?.getAttribute('data-block-id'),
            model: probe.doc.selection.value?.toJSON(), writes: probe.writes, starts: probe.starts,
            selecting: [...document.querySelectorAll('#group-selection-fixture .selecting')].map(element => element.outerHTML.slice(0, 300)),
            styles: [...document.querySelectorAll('#group-selection-fixture [contenteditable]')].map(element => ({
              tag: element.tagName, cls: element.className, ce: element.getAttribute('contenteditable'),
              select: getComputedStyle(element).getPropertyValue('-webkit-user-select'),
              modify: getComputedStyle(element).getPropertyValue('-webkit-user-modify'),
            }))}
        })
        expect(state, JSON.stringify({point, state})).toMatchObject({anchor: points[0].id, focus: point.id, writes: []})
        expect(state.text.trim()).not.toBe('')
        expect(state.model).toBeTruthy()
      }
      await page.mouse.up()
      await page.keyboard.press('ControlOrMeta+c')
      await expect.poll(() => page.evaluate(() => (window as any).groupSelectionProbe.copied)).toBe(true)
      await page.locator('#group-selection-copy').click()
      await page.keyboard.press('ControlOrMeta+v')
      const copied = await page.locator('#group-selection-copy').inputValue()
      for (const text of ['First group', 'Between groups ordinary paragraph', 'Second group']) expect(copied).toContain(text)
      for (const group of ['First group', 'Second group']) {
        for (const member of [0, 1]) {
          for (const line of ['first', 'second']) expect(copied).toContain(`${group} member ${member} ${line} line`)
        }
      }
      const result = await page.evaluate(() => {
        const probe = (window as any).groupSelectionProbe
        return {adapters: probe.adapters, html: probe.html, warnings: probe.warnings,
          unchanged: JSON.stringify(probe.before) === JSON.stringify(probe.doc.exportSnapshot())}
      })
      expect(result.adapters).toEqual(['text/html', 'text/markdown'])
      expect(result.html).toContain('data-bc-clipboard-format')
      expect(result.html).toContain('First group')
      expect(result.warnings).toEqual([])
      expect(result.unchanged).toBe(true)
    })
  }
}

for (const readonly of [false, true]) {
  test(`${readonly ? '只读' : '编辑'}拖选时保留浮动对象穿透并区分上下型组合成员`, async ({page}) => {
    await page.goto('/')
    await page.getByRole('button', {name: '初始化', exact: true}).click()
    await page.waitForFunction(() => (window as any).ng
      ?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
    const ids = await page.evaluate(async readonly => {
      const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      const viewport = document.createElement('div')
      viewport.id = 'group-hit-test-fixture'
      viewport.style.cssText = 'position:fixed;left:20px;top:20px;width:900px;height:700px;overflow:auto;background:white;z-index:99999;padding:24px'
      const mount = document.createElement('div')
      viewport.appendChild(mount)
      document.body.appendChild(viewport)
      const shape = (position: string) => {
        const snapshot = source.schemas.createSnapshot('shape', ['rectangle'])
        snapshot.props = {...snapshot.props, width: 100, height: 50, position}
        return snapshot
      }
      const textBox = (position: string) => {
        const snapshot = source.schemas.createSnapshot('text-box', ['Group member', {width: 180, height: 75}])
        snapshot.props.position = position
        return snapshot
      }
      const flowMember = textBox('10 10')
      const flowGroup = source.schemas.createSnapshot('object-group', [{width: 300, height: 150}, [flowMember]])
      const snapshot = source.schemas.createSnapshot('root', ['group-hit-test', [
        source.schemas.createSnapshot('paragraph', ['Start flow selection here']), flowGroup,
      ]])
      const doc = new source.constructor({
        ...source.config, yDoc: new source.yDoc.constructor(), docId: snapshot.id,
        plugins: [], readonly: false, scrollContainer: viewport, virtualization: {enabled: false},
      })
      doc.initBySnapshot(snapshot, mount)
      source.destroy()
      // Root overlays belong to placement-layout; use the same insertion and
      // grouping commands as the editor instead of putting them in root flow.
      const overlayMember = doc.placement.insertAbsoluteSnapshot(textBox('10 10'), {anchorRect: null})
      const sibling = doc.placement.insertAbsoluteSnapshot(shape('250 10'), {anchorRect: null})
      doc.crud.updateBlockProps(overlayMember, {position: '450 300'})
      doc.crud.updateBlockProps(sibling, {position: '650 300'})
      const overlayGroup = doc.placement.group([overlayMember, sibling])
      const independent = doc.placement.insertAbsoluteSnapshot(shape('680 450'), {anchorRect: null})
      doc.crud.updateBlockProps(independent, {position: '680 450'})
      if (!overlayGroup || !independent) throw new Error('Missing absolute placement fixtures')
      doc.toggleReadonly(readonly)
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      ;(window as any).groupHitTestProbe = {doc, before: doc.exportSnapshot()}
      return {flowMember: flowMember.id, overlayGroup, overlayMember, independent}
    }, readonly)
    const text = page.locator('#group-hit-test-fixture c-text').first()
    const rect = await text.boundingBox()
    if (!rect) throw new Error('Missing flow text')
    await page.mouse.move(rect.x + 2, rect.y + rect.height / 2)
    await page.mouse.down()
    const root = page.locator('#group-hit-test-fixture [data-blockcraft-root]')
    await expect(root).toHaveAttribute('data-bc-flow-selection-passthrough', '')
    for (const [key, id] of Object.entries(ids)) {
      const element = page.locator(`#group-hit-test-fixture [data-block-id="${id}"]`)
      await expect(element).toHaveAttribute('data-bc-placement', 'absolute')
      await expect(element).toHaveCSS('pointer-events', key === 'flowMember' && readonly ? 'auto' : 'none')
      await expect(element.locator('[data-bc-object-surface]').first()).toHaveCSS('pointer-events', key === 'flowMember' && readonly ? 'auto' : 'none')
    }
    await page.mouse.up()
    await expect(root).not.toHaveAttribute('data-bc-flow-selection-passthrough')
    for (const id of Object.values(ids)) {
      await expect(page.locator(`#group-hit-test-fixture [data-block-id="${id}"]`)).toHaveCSS('pointer-events', 'auto')
    }
    const snapshots = await page.evaluate(() => {
      const probe = (window as any).groupHitTestProbe
      return {before: probe.before, after: probe.doc.exportSnapshot()}
    })
    expect(snapshots.after).toEqual(snapshots.before)
  })
}
