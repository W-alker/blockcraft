import {expect, test} from '@playwright/test'

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
