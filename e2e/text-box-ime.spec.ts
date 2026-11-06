import {expect, test} from '@playwright/test'

test.beforeEach(async ({page}) => {
  await page.routeWebSocket('**', socket => socket.close())
})

for (const absolute of [false, true]) {
  test(`text-box (${absolute ? 'absolute' : 'flow'}) keeps native IME ownership through rapid commit and Enter/Space`, async ({page, context, browserName}) => {
    test.skip(browserName !== 'chromium', 'uses Chromium native composition commands')
    await page.goto('/')
    await page.getByRole('button', {name: '初始化', exact: true}).click()
    await page.waitForFunction(() => (window as any).ng
      ?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)

    const target = await page.evaluate(async absolute => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      const box = doc.schemas.createSnapshot('text-box', ['输入：', {width: 320, height: 123}])
      const prefix = Array.from({length: 24}, (_, i) => doc.schemas.createSnapshot('paragraph', [`前文 ${i}`]))
      const suffix = Array.from({length: 24}, (_, i) => doc.schemas.createSnapshot('paragraph', [`后文 ${i}`]))
      doc.crud.insertBlockSnapshots(doc.rootId, 0, [...prefix, ...(!absolute ? [box] : []), ...suffix])
      if (absolute) doc.placement.insertAbsoluteSnapshot(box)
      await doc.virtualization.scrollToBlock(box.id)
      doc.selection.setCursorAtBlock(box.children[0].id, false, false)
      return {boxId: box.id as string, paragraphId: box.children[0].id as string}
    }, absolute)
    const paragraph = page.locator(`[data-block-id="${target.paragraphId}"]`)
    await paragraph.click()
    await page.keyboard.press('End')

    const cdp = await context.newCDPSession(page)
    const read = () => page.evaluate(({boxId}) => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      const box = doc.getBlockById(boxId)
      const native = document.getSelection()
      const content = box.hostElement.querySelector('.text-box-block__content')
      return {
        phase: doc.inputManger.compositionSession.phase,
        composing: doc.event.status.isComposing,
        active: document.activeElement?.className,
        hostFocused: document.activeElement === content,
        nativeInside: !!native?.focusNode && content.contains(native.focusNode),
        modelInside: !!doc.selection.value && box.hostElement.contains(doc.selection.value.firstBlock.hostElement),
        texts: box.childrenIds.map((id: string) => doc.getBlockById(id).textContent()),
        scroll: doc.scrollContainer.scrollTop,
      }
    }, target)
    const terminalBeforeInput = async (text: string) => {
      const before = await read()
      const accepted = await page.evaluate(text => {
        const range = document.getSelection()!.getRangeAt(0)
        const target = new StaticRange({
          startContainer: range.startContainer, startOffset: range.startOffset,
          endContainer: range.endContainer, endOffset: range.endOffset,
        })
        // Captured Chrome/macOS order: keydown Enter (composing), then
        // beforeinput insertText (not composing), before compositionend.
        // This native offset includes the uncommitted composition text.
        const event = new InputEvent('beforeinput', {
          inputType: 'insertText', data: text, isComposing: false,
          bubbles: true, cancelable: true,
        })
        Object.defineProperty(event, 'getTargetRanges', {value: () => [target]})
        return document.activeElement!.dispatchEvent(event)
      }, text)
      expect(accepted).toBe(true)
      const after = await read()
      expect(after).toMatchObject({phase: 'active', composing: true, hostFocused: true, nativeInside: true, modelInside: true})
      expect(after.texts).toEqual(before.texts)
      expect(Math.abs(after.scroll - before.scroll)).toBeLessThan(3)
    }
    const before = await read()
    try {
      for (const key of ['Space', 'Enter', 'Space']) {
        await cdp.send('Input.imeSetComposition', {text: 'zhong', selectionStart: 5, selectionEnd: 5})
        const composing = await read()
        expect(composing, JSON.stringify(composing)).toMatchObject({phase: 'active', composing: true, hostFocused: true, nativeInside: true})
        await terminalBeforeInput('中')
        await cdp.send('Input.insertText', {text: '中'})
        const committed = await read()
        // The IME confirmation key may arrive after compositionend, with
        // isComposing=false but keyCode=229. It must not become an editor command.
        await page.evaluate(key => {
          for (const type of ['keydown', 'keyup']) {
            document.activeElement!.dispatchEvent(new KeyboardEvent(type, {
              key: key === 'Space' ? ' ' : key,
              keyCode: 229,
              isComposing: false,
              bubbles: true,
              cancelable: true,
            }))
          }
        }, key)
        expect((await read()).texts).toEqual(committed.texts)
        await page.keyboard.press(key)
        const after = await read()
        expect(after, JSON.stringify(after)).toMatchObject({phase: 'idle', hostFocused: true, nativeInside: true, modelInside: true})
        expect(Math.abs(after.scroll - before.scroll)).toBeLessThan(3)
      }
      expect((await read()).texts).toEqual(['输入：中 中', '中 '])
      for (let i = 0; i < 30; i++) {
        await cdp.send('Input.imeSetComposition', {text: 'asd', selectionStart: 3, selectionEnd: 3})
        await page.keyboard.down(i % 2 === 0 ? 'Enter' : 'Space')
        await terminalBeforeInput('爱仕达')
        await cdp.send('Input.insertText', {text: '爱仕达'})
        await page.keyboard.up(i % 2 === 0 ? 'Enter' : 'Space')
        await page.keyboard.press(i % 5 === 0 ? 'Enter' : 'Space')
      }
      const final = await read()
      expect(final, JSON.stringify(final)).toMatchObject({phase: 'idle', hostFocused: true, nativeInside: true, modelInside: true})
      expect(final.texts.join('').split('爱仕达')).toHaveLength(31)
    } finally {
      await cdp.detach()
    }
  })
}

for (const absolute of [false, true]) {
  test(`text-box (${absolute ? 'absolute' : 'flow'}) preserves its editing host throughout repeated composition and Enter`, async ({page}) => {
    await page.goto('/')
    await page.getByRole('button', {name: '初始化', exact: true}).click()
    await page.waitForFunction(() => (window as any).ng
      ?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)

    const target = await page.evaluate(async absolute => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      const box = doc.schemas.createSnapshot('text-box', ['输入：', {width: 320, height: 260}])
      const outside = doc.schemas.createSnapshot('paragraph', ['外部正文'])
      doc.crud.insertBlockSnapshots(doc.rootId, 0, [outside, ...(!absolute ? [box] : [])])
      if (absolute) doc.placement.insertAbsoluteSnapshot(box)
      await doc.navigateToBlock(box.id)
      const paragraph = doc.getBlockById(box.children[0].id)
      const content = doc.getBlockById(box.id).hostElement.querySelector('.text-box-block__content')
      content.focus({preventScroll: true})
      doc.selection.setCursorAt(paragraph, paragraph.textLength)
      // Observe native ownership throughout the transaction. A final focused
      // assertion alone misses a root -> nested host round trip that ends IME.
      const focusouts: string[] = []
      content.addEventListener('focusout', (event: FocusEvent) => {
        if (event.target === content) focusouts.push((event.relatedTarget as HTMLElement | null)?.className ?? 'none')
      })
      ;(window as any).__textBoxImeFocusouts = focusouts
      return {boxId: box.id as string, outsideId: outside.id as string}
    }, absolute)

    const read = () => page.evaluate(({boxId}) => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      const box = doc.getBlockById(boxId)
      const content = box.hostElement.querySelector('.text-box-block__content')
      const native = document.getSelection()
      const model = doc.selection.value?.toJSON() ?? null
      const node = native?.focusNode ?? null
      const element = node?.nodeType === Node.ELEMENT_NODE ? node as Element : node?.parentElement
      const nativeBlock = element?.closest<HTMLElement>('[data-block-id]') ?? null
      let nativeOffset: number | null = null
      if (node && nativeBlock && content.contains(node)) {
        const range = document.createRange()
        range.selectNodeContents(nativeBlock.querySelector('.edit-container') ?? nativeBlock)
        range.setEnd(node, native!.focusOffset)
        nativeOffset = range.toString().replace(/[\u200b\u200c]/g, '').length
      }
      return {
        phase: doc.inputManger.compositionSession.phase,
        composing: doc.event.status.isComposing,
        hostFocused: document.activeElement === content,
        focusouts: [...(window as any).__textBoxImeFocusouts] as string[],
        nativeCollapsed: native?.isCollapsed,
        nativeBlockId: nativeBlock?.dataset['blockId'] ?? null,
        nativeOffset,
        model,
        childIds: [...box.childrenIds] as string[],
        texts: box.childrenIds.map((id: string) => doc.getBlockById(id).textContent()) as string[],
      }
    }, target)

    const assertCaret = async (texts: string[], phase = 'idle') => {
      const state = await read()
      const blockId = state.childIds.at(-1)!
      const offset = texts.at(-1)!.length
      expect(state).toMatchObject({
        phase, composing: phase === 'active', hostFocused: true, focusouts: [],
        texts, nativeCollapsed: true, nativeBlockId: blockId, nativeOffset: offset,
        model: {
          anchor: {blockId, type: 'text', offset},
          head: {blockId, type: 'text', offset},
        },
      })
    }

    const texts = ['输入：']
    await assertCaret(texts)
    for (let round = 0; round < 6; round++) {
      // Synthetic CompositionEvents exercise the shared framework lifecycle in
      // all engines. They do not reproduce a system IME candidate window; the
      // Chromium CDP test above separately exercises native composition DOM.
      await page.evaluate(({boxId}) => {
        const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
        const content = doc.getBlockById(boxId).hostElement.querySelector('.text-box-block__content')
        content.dispatchEvent(new CompositionEvent('compositionstart', {bubbles: true, cancelable: true}))
        for (const type of ['keydown', 'keyup']) {
          content.dispatchEvent(new KeyboardEvent(type, {
            key: 'Enter', keyCode: 229, isComposing: true, bubbles: true, cancelable: true,
          }))
        }
      }, target)
      await assertCaret(texts, 'active')
      await page.evaluate(({boxId, text}) => {
        const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
        const content = doc.getBlockById(boxId).hostElement.querySelector('.text-box-block__content')
        content.dispatchEvent(new CompositionEvent('compositionend', {data: text, bubbles: true, cancelable: true}))
      }, {...target, text: `中文${round}`})
      texts[texts.length - 1] += `中文${round}`
      await assertCaret(texts)
      await page.keyboard.press('Enter')
      texts.push('')
      await assertCaret(texts)
    }
    await page.keyboard.type('after-ime')
    texts[texts.length - 1] += 'after-ime'
    await assertCaret(texts)

    // Explicit navigation must still leave the editing island normally.
    await page.evaluate(({outsideId}) => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      const outside = doc.getBlockById(outsideId)
      doc.selection.setCursorAt(outside, outside.textLength)
    }, target)
    await page.keyboard.type('!')
    expect(await page.evaluate(({outsideId}) => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      return {
        rootFocused: document.activeElement === doc.root.hostElement,
        text: doc.getBlockById(outsideId).textContent(),
        point: doc.selection.value?.toJSON().head,
      }
    }, target)).toEqual({
      rootFocused: true, text: '外部正文!',
      point: {blockId: target.outsideId, type: 'text', offset: 5},
    })
    await page.evaluate(({boxId}) => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      doc.selection.selectBlock(doc.getBlockById(boxId))
    }, target)
    expect(await page.evaluate(({boxId}) => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      return {
        rootFocused: document.activeElement === doc.root.hostElement,
        point: doc.selection.value?.toJSON().head,
        texts: doc.getBlockById(boxId).childrenIds.map((id: string) => doc.getBlockById(id).textContent()),
      }
    }, target)).toEqual({rootFocused: true, point: {blockId: target.boxId, type: 'selected'}, texts})
  })
}
