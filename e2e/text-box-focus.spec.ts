import {expect, test, type Page} from '@playwright/test'

const editorSelector = 'block-craft-editor'

async function initialize(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(selector => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng?: {getComponent: (target: Element) => {doc?: {isInitialized?: boolean}}}
    }).ng
    return !!editor && debug?.getComponent(editor)?.doc?.isInitialized === true
  }, editorSelector)
}

test('text-box keeps native focus, visible select-all, and layout-owned scope', async ({
  page,
}) => {
  await initialize(page)
  const inserted = await page.evaluate(async selector => {
    const editor = document.querySelector(selector)!
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor).doc
    const snapshot = doc.schemas.createSnapshot('text-box', [
      '文本框内容',
      {width: 360, height: 180},
    ])
    const secondParagraph = doc.schemas.createSnapshot('paragraph', ['第二段'])
    snapshot.children.push(secondParagraph)
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot])
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
    doc.getBlockById(snapshot.id).hostElement.scrollIntoView({block: 'center'})
    return {
      textBoxId: snapshot.id as string,
      paragraphId: secondParagraph.id as string,
      paragraphIds: snapshot.children.map((child: {id: string}) => child.id),
    }
  }, editorSelector)

  const textBox = page.locator(
    `${editorSelector} .text-box-block[data-block-id="${inserted.textBoxId}"]`,
  )
  const content = textBox.locator('.text-box-block__content')
  const surface = textBox.locator('.text-box-block__surface')
  const paragraph = textBox.locator(
    `[data-block-id="${inserted.paragraphId}"]`,
  )
  await expect(textBox).toBeVisible()
  await expect(surface).toHaveAttribute('contenteditable', 'false')
  const point = await content.evaluate((element, paragraphId) => {
    const contentRect = element.getBoundingClientRect()
    const paragraphElement = element.querySelector<HTMLElement>(
      `[data-block-id="${paragraphId}"]`,
    )!
    const paragraphRect = paragraphElement.getBoundingClientRect()
    return {
      x: contentRect.left + contentRect.width / 2,
      y: contentRect.bottom - 8,
      trailingGap: contentRect.bottom - paragraphRect.bottom,
      paragraphHeight: paragraphRect.height,
      display: getComputedStyle(element).display,
      ownContenteditable: element.getAttribute('contenteditable'),
    }
  }, inserted.paragraphId)
  expect(point.trailingGap).toBeLessThan(1)
  expect(point.paragraphHeight).toBeGreaterThan(20)
  expect(point.display).toBe('flex')
  expect(point.ownContenteditable).toBe('true')

  await page.mouse.click(point.x, point.y)

  await expect.poll(() => page.evaluate(selector => {
    const editor = document.querySelector(selector)!
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const selection = debug.getComponent(editor).doc.selection.value
    return selection?.start?.type === 'text'
      ? selection.firstBlockId
      : null
  }, editorSelector)).toBe(inserted.paragraphId)
  await expect(textBox).toHaveClass(/\btext-box-block--editing\b/)
  await expect(page.locator('[data-bc-text-box-toolbar]')).toBeVisible()
  await expect(paragraph).toHaveClass(/\bfocused\b/)
  await expect(textBox.locator('shape-resizer')).toBeVisible()

  await page.keyboard.press(
    process.platform === 'darwin' ? 'Meta+A' : 'Control+A',
  )
  await expect.poll(() => page.evaluate(selector => {
    const editor = document.querySelector(selector)!
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const selection = debug.getComponent(editor).doc.selection.value
    return {
      commonParent: selection?.commonParent ?? null,
      childIds: selection?.getBoundarySelectedChildIds?.() ?? null,
    }
  }, editorSelector)).toEqual({
    commonParent: inserted.textBoxId,
    childIds: inserted.paragraphIds,
  })

  const nativeSelection = await page.evaluate(paragraphId => {
    const selection = document.getSelection()
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null
    const paragraph = document.querySelector<HTMLElement>(
      `[data-block-id="${paragraphId}"]`,
    )
    return {
      type: selection?.type ?? null,
      collapsed: selection?.isCollapsed ?? null,
      text: (selection?.toString() ?? '').replaceAll('\u200b', ''),
      startNodeType: range?.startContainer.nodeType ?? null,
      endNodeType: range?.endContainer.nodeType ?? null,
      rectCount: range?.getClientRects().length ?? 0,
      selectionBackground: paragraph
        ? getComputedStyle(paragraph, '::selection').backgroundColor
        : null,
    }
  }, inserted.paragraphId)
  expect(nativeSelection).toEqual(expect.objectContaining({
    type: 'Range',
    collapsed: false,
    startNodeType: 3,
    endNodeType: 3,
  }))
  expect(nativeSelection.text).toContain('文本框内容')
  expect(nativeSelection.text).toContain('第二段')
  expect(nativeSelection.rectCount).toBeGreaterThan(0)
  expect(nativeSelection.selectionBackground).not.toBe('rgba(0, 0, 0, 0)')
  await expect(
    textBox.locator('[data-block-id].selected, [data-block-id].focused'),
  ).toHaveCount(0)
  await expect(textBox).not.toHaveClass(/\bselected\b/)
  await expect(textBox).not.toHaveClass(/\bfocused\b/)
  await expect(page.locator('[data-bc-text-box-toolbar]')).toBeVisible()
  await expect(textBox).toHaveClass(/\btext-box-block--editing\b/)

  // A normal-flow container remains part of the document select-all ladder.
  await page.keyboard.press(
    process.platform === 'darwin' ? 'Meta+A' : 'Control+A',
  )
  await expect.poll(() => page.evaluate(selector => {
    const editor = document.querySelector(selector)!
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor).doc
    return doc.selection.value?.commonParent === doc.rootId
  }, editorSelector)).toBe(true)

  // Once the same text box enters the absolute-object plane, Ctrl+A stays in
  // that object. The normal document root must no longer become the target.
  await page.evaluate(async ({selector, textBoxId, paragraphId}) => {
    const editor = document.querySelector(selector)!
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor).doc
    doc.placement.setMode(doc.getBlockById(textBoxId), 'absolute')
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
    doc.selection.setCursorAtBlock(paragraphId, true, false)
  }, {
    selector: editorSelector,
    textBoxId: inserted.textBoxId,
    paragraphId: inserted.paragraphId,
  })
  await page.keyboard.press(
    process.platform === 'darwin' ? 'Meta+A' : 'Control+A',
  )
  await page.keyboard.press(
    process.platform === 'darwin' ? 'Meta+A' : 'Control+A',
  )
  await expect.poll(() => page.evaluate(selector => {
    const editor = document.querySelector(selector)!
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const selection = debug.getComponent(editor).doc.selection.value
    return {
      commonParent: selection?.commonParent ?? null,
      childIds: selection?.getBoundarySelectedChildIds?.() ?? null,
    }
  }, editorSelector)).toEqual({
    commonParent: inserted.textBoxId,
    childIds: inserted.paragraphIds,
  })
})

test('plain arrows stop at the outer text-box content edges', async ({page}) => {
  await initialize(page)
  const inserted = await page.evaluate(async selector => {
    const editor = document.querySelector(selector)!
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor).doc
    const snapshot = doc.schemas.createSnapshot('text-box', [
      '第一段',
      {width: 360, height: 180},
    ])
    const last = doc.schemas.createSnapshot('paragraph', ['最后一段'])
    snapshot.children.push(last)
    doc.crud.insertBlockSnapshots(doc.rootId, 1, [snapshot])
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
    doc.placement.setMode(doc.getBlockById(snapshot.id), 'absolute')
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
    const textBox = doc.getBlockById(snapshot.id)
    textBox.hostElement.scrollIntoView({block: 'center'})
    textBox.hostElement.querySelector<HTMLElement>(
      '.text-box-block__content',
    )?.focus()
    doc.selection.setCursorAtBlock(snapshot.children[0].id, true, false)
    return {
      firstId: snapshot.children[0].id as string,
      lastId: last.id as string,
    }
  }, editorSelector)

  const readCaret = () => page.evaluate(selector => {
    const editor = document.querySelector(selector)!
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const selection = debug.getComponent(editor).doc.selection.value
    return selection?.collapsed && selection.start?.type === 'text'
      ? {blockId: selection.start.blockId, offset: selection.start.offset}
      : null
  }, editorSelector)

  await page.keyboard.press('ArrowUp')
  await expect.poll(readCaret).toEqual({blockId: inserted.firstId, offset: 0})
  await page.keyboard.press('ArrowLeft')
  await expect.poll(readCaret).toEqual({blockId: inserted.firstId, offset: 0})

  const endOffset = await page.evaluate(({selector, lastId}) => {
    const editor = document.querySelector(selector)!
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor).doc
    const block = doc.getBlockById(lastId)
    doc.selection.setCursorAtBlock(block, false, false)
    return block.textLength as number
  }, {selector: editorSelector, lastId: inserted.lastId})

  await page.keyboard.press('ArrowDown')
  await expect.poll(readCaret).toEqual({
    blockId: inserted.lastId,
    offset: endOffset,
  })
  await page.keyboard.press('ArrowRight')
  await expect.poll(readCaret).toEqual({
    blockId: inserted.lastId,
    offset: endOffset,
  })
})

test('ArrowUp keeps newly typed first-line text inside the text box', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'firefox',
    'Playwright Firefox cannot synthesize input in the nested editing host',
  )
  await initialize(page)
  const inserted = await page.evaluate(async selector => {
    const editor = document.querySelector(selector)!
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor).doc
    const snapshot = doc.schemas.createSnapshot('text-box', [
      '',
      {width: 360, height: 180},
    ])
    doc.crud.insertBlockSnapshots(doc.rootId, 1, [snapshot])
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
    doc.placement.setMode(doc.getBlockById(snapshot.id), 'absolute')
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
    const textBox = doc.getBlockById(snapshot.id)
    textBox.hostElement.scrollIntoView({block: 'center'})
    textBox.hostElement.querySelector<HTMLElement>(
      '.text-box-block__content',
    )?.focus()
    doc.selection.setCursorAtBlock(snapshot.children[0].id, true, false)
    return {paragraphId: snapshot.children[0].id as string}
  }, editorSelector)

  const typed = '刚输入的文本'
  await page.keyboard.type(typed)

  const readState = () => page.evaluate(({selector, paragraphId}) => {
    const editor = document.querySelector(selector)!
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor).doc
    const selection = doc.selection.value
    return {
      modelText: doc.model.getTextDeltas(paragraphId)
        .map((delta: {insert: unknown}) =>
          typeof delta.insert === 'string' ? delta.insert : '\ufffc')
        .join(''),
      domText: doc.getBlockById(paragraphId).textContent(),
      selection: selection?.collapsed && selection.start?.type === 'text'
        ? {blockId: selection.start.blockId, offset: selection.start.offset}
        : null,
    }
  }, {selector: editorSelector, paragraphId: inserted.paragraphId})

  await expect.poll(readState).toEqual({
    modelText: typed,
    domText: typed,
    selection: {blockId: inserted.paragraphId, offset: typed.length},
  })

  await page.keyboard.press('ArrowUp')
  await page.waitForTimeout(120)

  await expect.poll(readState).toEqual({
    modelText: typed,
    domText: typed,
    selection: {blockId: inserted.paragraphId, offset: typed.length},
  })
  await expect.poll(() => page.evaluate(paragraphId => {
    const paragraph = document.querySelector<HTMLElement>(
      `[data-block-id="${paragraphId}"]`,
    )
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {containerElement: HTMLElement}}
    }).ng
    const container = paragraph ? debug.getComponent(paragraph).containerElement : null
    const selection = document.getSelection()
    const anchor = selection?.anchorNode instanceof Element
      ? selection.anchorNode
      : selection?.anchorNode?.parentElement
    return {
      activeInsideTextBox: document.activeElement?.classList.contains(
        'text-box-block__content',
      ) ?? false,
      nativeBlockId: anchor?.closest<HTMLElement>('[data-block-id]')
        ?.dataset['blockId'] ?? null,
      nativeCollapsed: selection?.isCollapsed ?? null,
      realDomText: container?.textContent
        ?.replaceAll('\u200b', '')
        .replaceAll('\u200c', '') ?? null,
    }
  }, inserted.paragraphId)).toEqual({
    activeInsideTextBox: true,
    nativeBlockId: inserted.paragraphId,
    nativeCollapsed: true,
    realDomText: typed,
  })
})

test('clicking an absolute text box replaces a document-wide native range', async ({
  page,
}) => {
  await initialize(page)
  const inserted = await page.evaluate(async selector => {
    const editor = document.querySelector(selector)!
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor).doc
    const snapshot = doc.schemas.createSnapshot('text-box', [
      '绝对文本框第一段',
      {width: 360, height: 180},
    ])
    snapshot.children.push(
      doc.schemas.createSnapshot('paragraph', ['绝对文本框第二段']),
    )
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [snapshot])
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
    doc.placement.setMode(doc.getBlockById(snapshot.id), 'absolute')
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
    doc.selection.selectAllChildren(doc.root)
    return {
      textBoxId: snapshot.id as string,
      rootId: doc.rootId as string,
      rootChildrenLength: doc.model.getChildrenIds(doc.rootId).length as number,
    }
  }, editorSelector)

  const textBox = page.locator(
    `${editorSelector} .text-box-block[data-block-id="${inserted.textBoxId}"]`,
  )
  const surface = textBox.locator('.text-box-block__surface')
  await expect(textBox).toBeVisible()
  await expect.poll(() => page.evaluate(({selector, rootId}) => {
    const editor = document.querySelector(selector)!
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const selection = debug.getComponent(editor).doc.selection.value
    const nativeSelection = document.getSelection()
    return {
      start: selection?.start
        ? {
            blockId: selection.start.blockId,
            type: selection.start.type,
            index: selection.start.index,
          }
        : null,
      end: selection?.end
        ? {
            blockId: selection.end.blockId,
            type: selection.end.type,
            index: selection.end.index,
          }
        : null,
      nativeRangeCount: nativeSelection?.rangeCount ?? 0,
      nativeCollapsed: nativeSelection?.isCollapsed ?? true,
      nativeText: (nativeSelection?.toString() ?? '').replaceAll('\u200b', ''),
      selectedIds: Array.from(
        editor.querySelectorAll<HTMLElement>('[data-block-id].selected'),
      ).flatMap(element => element.dataset['blockId'] ?? []),
      focusedIds: Array.from(
        editor.querySelectorAll<HTMLElement>('[data-block-id].focused'),
      ).flatMap(element => element.dataset['blockId'] ?? []),
      rootId,
    }
  }, {selector: editorSelector, rootId: inserted.rootId})).toEqual({
    start: {
      blockId: inserted.rootId,
      type: 'boundary',
      index: 0,
    },
    end: {
      blockId: inserted.rootId,
      type: 'boundary',
      index: inserted.rootChildrenLength,
    },
    nativeRangeCount: 1,
    nativeCollapsed: false,
    nativeText: expect.stringContaining('Blockcraft 2.0 Playground'),
    selectedIds: [],
    focusedIds: [],
    rootId: inserted.rootId,
  })

  await surface.click({position: {x: 4, y: 4}})

  await expect.poll(() => page.evaluate(({selector, textBoxId}) => {
    const editor = document.querySelector(selector)!
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const selection = debug.getComponent(editor).doc.selection.value
    return {
      start: selection?.start?.type ?? null,
      end: selection?.end?.type ?? null,
      firstBlockId: selection?.firstBlockId ?? null,
      lastBlockId: selection?.lastBlockId ?? null,
      commonParent: selection?.commonParent ?? null,
      target: textBoxId,
    }
  }, {selector: editorSelector, textBoxId: inserted.textBoxId})).toEqual({
    start: 'selected',
    end: 'selected',
    firstBlockId: inserted.textBoxId,
    lastBlockId: inserted.textBoxId,
    commonParent: inserted.textBoxId,
    target: inserted.textBoxId,
  })

  const state = await page.evaluate(({selector, textBoxId}) => {
    const root = document.querySelector<HTMLElement>(selector)!
    const textBox = root.querySelector<HTMLElement>(
      `.text-box-block[data-block-id="${textBoxId}"]`,
    )!
    const selection = document.getSelection()
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null
    const endpointInside = (node: Node | null | undefined) =>
      !!node && (node === textBox || textBox.contains(node))
    return {
      nativeText: (selection?.toString() ?? '').replaceAll('\u200b', ''),
      rangeCount: selection?.rangeCount ?? 0,
      collapsed: selection?.isCollapsed ?? true,
      startInside: endpointInside(range?.startContainer),
      endInside: endpointInside(range?.endContainer),
      selectedIds: Array.from(
        root.querySelectorAll<HTMLElement>('[data-block-id].selected'),
      ).flatMap(element => element.dataset['blockId'] ?? []),
      focusedIds: Array.from(
        root.querySelectorAll<HTMLElement>('[data-block-id].focused'),
      ).flatMap(element => element.dataset['blockId'] ?? []),
    }
  }, {selector: editorSelector, textBoxId: inserted.textBoxId})
  expect(state.rangeCount).toBe(1)
  expect(state.collapsed).toBe(false)
  expect(state.nativeText).not.toContain('Blockcraft 2.0 Playground')
  expect(state.startInside).toBe(true)
  expect(state.endInside).toBe(true)
  expect(state.selectedIds).toEqual([inserted.textBoxId])
  expect(state.focusedIds).toEqual([])
  await expect(page.locator('[data-bc-text-box-toolbar]')).toBeVisible()

  // Recreate the intermittent mismatch directly: keep the canonical object
  // selection (and therefore its handles), but replace only the browser Range
  // with a stale full-document Range. A real handle drag must both resize and
  // reproject the native Range after the root pointer-intent capture path.
  const handle = textBox.locator(
    '.shape-resizer__handle[data-handle="south-east"]',
  )
  await expect(handle).toBeVisible()
  const handleBox = await handle.boundingBox()
  const surfaceBoxBefore = await surface.boundingBox()
  expect(handleBox).not.toBeNull()
  expect(surfaceBoxBefore).not.toBeNull()
  await page.evaluate(({selector, textBoxId}) => {
    const editor = document.querySelector(selector)!
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor).doc
    const textBox = doc.getBlockById(textBoxId)
    doc.selection.selectBlock(textBox)
    doc.selection.setSuppressRecalculate(true)
    const staleRange = document.createRange()
    staleRange.selectNodeContents(doc.root.hostElement)
    const nativeSelection = document.getSelection()!
    nativeSelection.removeAllRanges()
    nativeSelection.addRange(staleRange)
    // Keep the synthetic stale Range stable until the next real pointerdown.
    // This listener runs on document after the toolbar plugin's capture
    // listener but before the editor root capture path.
    document.addEventListener('pointerdown', () => {
      doc.selection.setSuppressRecalculate(false)
    }, {capture: true, once: true})
  }, {selector: editorSelector, textBoxId: inserted.textBoxId})

  await page.mouse.move(
    handleBox!.x + handleBox!.width / 2,
    handleBox!.y + handleBox!.height / 2,
  )
  await page.mouse.down()
  await page.mouse.move(
    handleBox!.x + handleBox!.width / 2 + 28,
    handleBox!.y + handleBox!.height / 2 + 18,
    {steps: 2},
  )
  await page.mouse.up()

  await expect.poll(async () => (await surface.boundingBox())?.width ?? 0)
    .toBeGreaterThan(surfaceBoxBefore!.width + 10)
  await expect.poll(() => page.evaluate(({selector, textBoxId}) => {
    const editor = document.querySelector(selector)!
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const selection = debug.getComponent(editor).doc.selection.value
    const textBox = editor.querySelector<HTMLElement>(
      `.text-box-block[data-block-id="${textBoxId}"]`,
    )!
    const nativeSelection = document.getSelection()
    const range = nativeSelection?.rangeCount
      ? nativeSelection.getRangeAt(0)
      : null
    const inside = (node: Node | null | undefined) =>
      !!node && (node === textBox || textBox.contains(node))
    return {
      start: selection?.start?.type ?? null,
      end: selection?.end?.type ?? null,
      firstBlockId: selection?.firstBlockId ?? null,
      rangeCount: nativeSelection?.rangeCount ?? 0,
      collapsed: nativeSelection?.isCollapsed ?? true,
      startInside: inside(range?.startContainer),
      endInside: inside(range?.endContainer),
    }
  }, {selector: editorSelector, textBoxId: inserted.textBoxId})).toEqual({
    start: 'selected',
    end: 'selected',
    firstBlockId: inserted.textBoxId,
    rangeCount: 1,
    collapsed: false,
    startInside: true,
    endInside: true,
  })
})

test('virtual scrolling does not add generic block pseudo-selection to select-all', async ({
  page,
}) => {
  await initialize(page)
  const expected = await page.evaluate(async selector => {
    const editor = document.querySelector(selector)!
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor).doc
    const topSentinelText = '滚动选区顶部流式前哨'
    const topSentinel = doc.schemas.createSnapshot('paragraph', [
      topSentinelText,
    ])
    const callouts = Array.from({length: 80}, (_, index) => {
      const callout = doc.schemas.createSnapshot('callout', [])
      callout.children[0] = doc.schemas.createSnapshot('paragraph', [
        `滚动选区结构块 ${index}`,
      ])
      return callout
    })
    const snapshots = [topSentinel, ...callouts]
    doc.crud.insertBlockSnapshots(
      doc.rootId,
      0,
      snapshots,
    )
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
    doc.scrollContainer.scrollTop = 0
    doc.scrollContainer.dispatchEvent(new Event('scroll'))
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
    doc.selection.selectAllChildren(doc.root)
    const selection = doc.selection.value
    return {
      selection: selection.toJSON(),
      start: {
        blockId: selection.start.blockId,
        type: selection.start.type,
        index: selection.start.index,
      },
      end: {
        blockId: selection.end.blockId,
        type: selection.end.type,
        index: selection.end.index,
      },
      rootId: doc.rootId as string,
      rootChildrenLength: doc.model.getChildrenIds(doc.rootId).length as number,
      topSentinelText,
      calloutIds: callouts.map((callout: {id: string}) => callout.id),
    }
  }, editorSelector)
  expect(expected.start).toEqual({
    blockId: expected.rootId,
    type: 'boundary',
    index: 0,
  })
  expect(expected.end).toEqual({
    blockId: expected.rootId,
    type: 'boundary',
    index: expected.rootChildrenLength,
  })

  const readState = () => page.evaluate(({selector, calloutIds}) => {
    const editor = document.querySelector<HTMLElement>(selector)!
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor).doc
    const nativeSelection = document.getSelection()
    return {
      selection: doc.selection.value?.toJSON() ?? null,
      nativeRangeCount: nativeSelection?.rangeCount ?? 0,
      nativeCollapsed: nativeSelection?.isCollapsed ?? true,
      nativeText: (nativeSelection?.toString() ?? '').replaceAll('\u200b', ''),
      selectedIds: Array.from(
        editor.querySelectorAll<HTMLElement>('[data-block-id].selected'),
      ).flatMap(element => element.dataset['blockId'] ?? []),
      focusedIds: Array.from(
        editor.querySelectorAll<HTMLElement>('[data-block-id].focused'),
      ).flatMap(element => element.dataset['blockId'] ?? []),
      mountedKey: doc.vm.getMountedRootChildIds().join(','),
      mountedCalloutCount: calloutIds.filter((id: string) =>
        doc.vm.isMounted(id),
      ).length,
    }
  }, {selector: editorSelector, calloutIds: expected.calloutIds})

  await expect.poll(readState).toMatchObject({
    selection: expected.selection,
    nativeRangeCount: 1,
    nativeCollapsed: false,
    selectedIds: [],
    focusedIds: [],
  })
  const initial = await readState()
  expect(initial.mountedCalloutCount).toBeGreaterThan(0)
  expect(initial.nativeText).toContain(expected.topSentinelText)

  const targetCalloutId = expected.calloutIds[70]!
  await page.evaluate(async ({selector, targetCalloutId}) => {
    const editor = document.querySelector(selector)!
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor).doc
    await doc.navigateToBlock(targetCalloutId)
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
  }, {selector: editorSelector, targetCalloutId})

  await expect.poll(async () => (await readState()).mountedKey, {
    timeout: 10_000,
  }).not.toBe(initial.mountedKey)
  await expect.poll(readState).toMatchObject({
    selection: expected.selection,
    nativeRangeCount: 1,
    nativeCollapsed: false,
    selectedIds: [],
    focusedIds: [],
  })
  const afterScroll = await readState()
  expect(afterScroll.mountedCalloutCount).toBeGreaterThan(0)
  expect(afterScroll.mountedKey.split(',')).toContain(targetCalloutId)
  expect(afterScroll.nativeText).toContain('滚动选区结构块 70')
})

test('block drag handle moves a root paragraph into an absolute text box', async ({page}) => {
  await initialize(page)
  const inserted = await page.evaluate(async selector => {
    const editor = document.querySelector(selector)!
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor).doc
    const textBox = doc.schemas.createSnapshot('text-box', [
      '',
      {width: 360, height: 220},
    ])
    const paragraphs = ['第一段', '第二段', '第三段'].map(text =>
      doc.schemas.createSnapshot('paragraph', [text]),
    )
    const rootParagraph = doc.schemas.createSnapshot('paragraph', ['Root 段落'])
    textBox.children = paragraphs
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [rootParagraph, textBox])
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
    doc.placement.setMode(doc.getBlockById(textBox.id), 'absolute')
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
    doc.getBlockById(textBox.id).hostElement.scrollIntoView({block: 'center'})
    return {
      textBoxId: textBox.id as string,
      rootParagraphId: rootParagraph.id as string,
      paragraphIds: paragraphs.map(paragraph => paragraph.id as string),
    }
  }, editorSelector)

  const [firstId, secondId, thirdId] = inserted.paragraphIds
  const rootParagraph = page.locator(
    `${editorSelector} [data-block-id="${inserted.rootParagraphId}"]`,
  )
  const textBox = page.locator(
    `${editorSelector} .text-box-block[data-block-id="${inserted.textBoxId}"]`,
  )
  const first = textBox.locator(`[data-block-id="${firstId}"]`)
  await expect(first).toBeVisible()
  await expect(rootParagraph).toBeVisible()

  // The drag handle is editor chrome, so a root-originated block drag must keep
  // absolute objects hit-testable and allow their nested flow blocks as targets.
  await rootParagraph.dispatchEvent('mouseover')
  const handleHost = page.locator(`${editorSelector} bc-drag-handle`)
  const handle = handleHost.locator('.btn')
  await expect(handleHost).toHaveAttribute('data-bc-placement-pick-ignore', '')
  await expect(handle).toBeVisible()
  await expect.poll(() => handleHost.evaluate(element => (
    window as unknown as {
      ng: {getComponent: (target: Element) => {activeBlock?: {id: string}}}
    }
  ).ng.getComponent(element)?.activeBlock?.id ?? null)).toBe(
    inserted.rootParagraphId,
  )
  await handleHost.evaluate(element => Promise.all(
    element.getAnimations().map(animation => animation.finished),
  ))
  const handleBox = await handle.boundingBox()
  const firstBox = await first.boundingBox()
  expect(handleBox).not.toBeNull()
  expect(firstBox).not.toBeNull()
  await page.mouse.move(
    handleBox!.x + handleBox!.width / 2,
    handleBox!.y + handleBox!.height / 2,
  )
  await page.mouse.down()
  await page.mouse.move(
    firstBox!.x + firstBox!.width / 2,
    firstBox!.y + 2,
    {steps: 6},
  )
  await page.mouse.up()
  await expect.poll(() => page.evaluate(({selector, textBoxId, sourceId}) => {
    const editor = document.querySelector(selector)!
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor).doc
    return {
      textBoxChildren: doc.model.getChildrenIds(textBoxId),
      sourceParent: doc.model.getParentId(sourceId),
    }
  }, {
    selector: editorSelector,
    textBoxId: inserted.textBoxId,
    sourceId: inserted.rootParagraphId,
  })).toEqual({
    textBoxChildren: [inserted.rootParagraphId, firstId, secondId, thirdId],
    sourceParent: inserted.textBoxId,
  })
})
