import {expect, test, type Page} from '@playwright/test'

async function settle(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
}

for (const scenario of [
  {name: 'flow', absolute: false, scale: 1, vertical: false},
  {name: 'absolute', absolute: true, scale: 1, vertical: false},
  {name: 'absolute-scaled', absolute: true, scale: 1.5, vertical: false},
  {name: 'scaled', absolute: false, scale: 1.5, vertical: false},
  {name: 'vertical', absolute: false, scale: 1, vertical: true},
]) {
  test(`text-box ${scenario.name} reveals the caret inside its clipped editing viewport`, async ({page, context, browserName}) => {
    await page.goto('/')
    await page.getByRole('button', {name: '初始化', exact: true}).click()
    await page.waitForFunction(() => (window as any).ng
      ?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
    await page.evaluate(scenario => {
      const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      const viewport = document.createElement('div')
      viewport.style.cssText = 'position:fixed;left:50px;top:50px;width:900px;height:600px;overflow:auto;background:white;z-index:99999;padding:24px;box-sizing:border-box'
      const mount = document.createElement('div')
      viewport.appendChild(mount)
      document.body.appendChild(viewport)
      const box = source.schemas.createSnapshot('text-box', ['', {
        width: scenario.vertical ? 140 : 340,
        height: scenario.vertical ? 280 : 130,
        textDirection: scenario.vertical ? 'vertical-rl' : 'horizontal',
      }])
      box.children = Array.from({length: 8}, (_, i) => source.schemas.createSnapshot('paragraph', [`第 ${i + 1} 段文字`]))
      const snapshot = source.schemas.createSnapshot('root', ['text-box-scroll', [box,
        ...Array.from({length: 20}, () => source.schemas.createSnapshot('paragraph', ['外层内容'])),
      ]])
      const doc = new source.constructor({
        ...source.config, yDoc: new source.yDoc.constructor(), docId: snapshot.id,
        plugins: [], scrollContainer: viewport, readonly: false,
        virtualization: {enabled: false},
      })
      doc.initBySnapshot(snapshot, mount)
      doc.viewScale.attach(mount)
      doc.viewScale.setScale(scenario.scale)
      if (scenario.absolute) doc.placement.setObjectLayout(box.id, 'over')
      ;(window as any).textBoxScrollFixture = {doc, viewport, boxId: box.id}
      doc.selection.setCursorAtBlock(box.children.at(-1).id, false, false)
    }, scenario)
    await settle(page)

    const read = () => page.evaluate(() => {
      const {doc, viewport, boxId} = (window as any).textBoxScrollFixture
      const box = doc.getBlockById(boxId)
      const content = box.hostElement.querySelector('.text-box-block__content')
      const head = doc.selection.value?.head
      const block = head ? doc.getBlockById(head.blockId) : null
      const native = document.getSelection()
      const range = native?.rangeCount ? native.getRangeAt(0) : null
      const raw = range?.getBoundingClientRect()
      let caret = raw
      if (range && !raw?.width && !raw?.height) {
        const node = range.startContainer
        if (node instanceof Text && node.length) {
          const glyph = range.cloneRange()
          const index = Math.min(range.startOffset, node.length - 1)
          glyph.setStart(node, index)
          glyph.setEnd(node, index + 1)
          caret = glyph.getBoundingClientRect()
        } else {
          caret = block?.containerElement.getBoundingClientRect()
        }
      }
      return {
        caret: caret?.toJSON(), bounds: content.getBoundingClientRect().toJSON(),
        innerTop: content.scrollTop, innerLeft: content.scrollLeft, outerTop: viewport.scrollTop,
        children: box.childrenIds.length, texts: box.childrenIds.map((id: string) => doc.model.getText(id)),
        hostFocused: document.activeElement === content,
        nativeInside: !!native?.focusNode && content.contains(native.focusNode),
        phase: doc.inputManger.compositionSession.phase,
        overflow: getComputedStyle(content).overflow,
        head: head?.type === 'text' ? {blockId: head.blockId, offset: head.offset} : null,
      }
    })
    let expectedOuterTop = 0
    const expectVisible = async () => {
      await settle(page)
      const state = await read()
      expect(state, JSON.stringify(state)).toMatchObject({hostFocused: true, nativeInside: true, overflow: 'hidden'})
      expect(state.caret.top, JSON.stringify(state)).toBeGreaterThanOrEqual(state.bounds.top - 2)
      expect(state.caret.bottom, JSON.stringify(state)).toBeLessThanOrEqual(state.bounds.bottom + 2)
      expect(state.caret.left, JSON.stringify(state)).toBeGreaterThanOrEqual(state.bounds.left - 2)
      expect(state.caret.right, JSON.stringify(state)).toBeLessThanOrEqual(state.bounds.right + 2)
      expect(state.outerTop).toBe(expectedOuterTop)
      return state
    }
    try {
      // Remove any native focus scrolling: Enter must reveal its own new line.
      await page.evaluate(() => {
        const {doc, viewport, boxId} = (window as any).textBoxScrollFixture
        const content = doc.getBlockById(boxId).hostElement.querySelector('.text-box-block__content')
        content.scrollTop = content.scrollLeft = viewport.scrollTop = 0
      })
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press('Enter')
        await expectVisible()
        await page.keyboard.type('new line')
      }
      expect((await read()).children).toBe(12)
      // Explicit backward reveal and keyboard navigation use the same viewport.
      await page.evaluate(() => {
        const {doc, boxId} = (window as any).textBoxScrollFixture
        doc.selection.setCursorAtBlock(doc.getBlockById(boxId).childrenIds[0], true)
      })
      await expectVisible()
      if (scenario.absolute) {
        await page.evaluate(() => {
          const {doc, viewport, boxId} = (window as any).textBoxScrollFixture
          doc.selection.setCursorAt(doc.getBlockById(doc.getBlockById(boxId).childrenIds[0]), 3)
          viewport.scrollTop = 32
        })
        expectedOuterTop = 32
        await settle(page)
        const before = await read()
        // Repeated keydown also covers a held arrow, before any keyup arrives.
        for (let i = 0; i < 3; i++) await page.keyboard.down('ArrowUp')
        await page.keyboard.up('ArrowUp')
        await settle(page)
        const after = await read()
        expect(after.outerTop, JSON.stringify({before, after})).toBe(before.outerTop)
        expect(after.innerTop).toBe(before.innerTop)
        expect(after.nativeInside).toBe(true)
        expect(after.head?.blockId).toBe(before.head?.blockId)
        await expectVisible()
        await page.keyboard.press('ArrowDown')
        expect((await expectVisible()).head?.blockId).not.toBe(before.head?.blockId)

        // The last visual line has the same boundary, even before text-end.
        await page.evaluate(() => {
          const {doc, boxId} = (window as any).textBoxScrollFixture
          const last = doc.getBlockById(doc.getBlockById(boxId).childrenIds.at(-1))
          doc.selection.setCursorAt(last, last.textLength - 1)
          doc.selection.scrollSelectionIntoView()
        })
        const endBefore = await expectVisible()
        for (let i = 0; i < 3; i++) await page.keyboard.down('ArrowDown')
        await page.keyboard.up('ArrowDown')
        const endAfter = await expectVisible()
        expect(endAfter.outerTop).toBe(endBefore.outerTop)
        expect(endAfter.innerTop).toBe(endBefore.innerTop)
        expect(endAfter.head?.blockId).toBe(endBefore.head?.blockId)
        await page.keyboard.press('ArrowUp')
        expect((await expectVisible()).head?.blockId).not.toBe(endBefore.head?.blockId)
        await page.evaluate(() => {
          const {doc, viewport, boxId} = (window as any).textBoxScrollFixture
          viewport.scrollTop = 0
          doc.selection.setCursorAtBlock(doc.getBlockById(boxId).childrenIds[0], true)
        })
        expectedOuterTop = 0
      }
      await page.keyboard.press('ArrowDown')
      await expectVisible()
      await page.evaluate(() => (window as any).textBoxScrollFixture.doc.crud.undoManager.stopCapturing())
      await page.keyboard.press('Enter')
      await expectVisible()
      await page.keyboard.press('ControlOrMeta+z')
      await expectVisible()

      await page.keyboard.type(' long wrapped input'.repeat(12))
      const wrappedEnd = await expectVisible()
      if (scenario.absolute) {
        await page.keyboard.press('ArrowUp')
        const previousLine = await expectVisible()
        expect(previousLine.head?.blockId).toBe(wrappedEnd.head?.blockId)
        expect(previousLine.head?.offset).toBeLessThan(wrappedEnd.head!.offset)
        await page.keyboard.press('ArrowDown')
        expect((await expectVisible()).head).toEqual(wrappedEnd.head)
      }
      await page.evaluate(() => {
        const data = new DataTransfer()
        data.setData('text/plain', Array.from({length: 8}, (_, i) => `粘贴第 ${i + 1} 行`).join('\n'))
        const event = new ClipboardEvent('paste', {
          clipboardData: data, bubbles: true, cancelable: true,
        })
        // Firefox does not retain constructor-supplied synthetic clipboard data.
        Object.defineProperty(event, 'clipboardData', {value: data})
        document.activeElement!.dispatchEvent(event)
      })
      await expect.poll(async () => (await read()).texts.join('\n')).toContain('粘贴第 8 行')
      await expectVisible()

      if (browserName === 'chromium') {
        const cdp = await context.newCDPSession(page)
        try {
          await cdp.send('Input.imeSetComposition', {text: 'zhongwen', selectionStart: 8, selectionEnd: 8})
          await cdp.send('Input.insertText', {text: '中文输入'.repeat(12)})
          expect((await expectVisible()).phase).toBe('idle')
        } finally {
          await cdp.detach()
        }
      }
    } finally {
      await page.evaluate(() => {
        const {doc, viewport} = (window as any).textBoxScrollFixture
        doc.destroy()
        viewport.remove()
      })
    }
  })
}
