import {expect, test, type Page} from '@playwright/test'

const editorSelector = 'block-craft-editor'
const fatalConsolePattern = /Block not found|Cannot read properties|virtualization(?:Reconcile|Fallback|FullMount)Error|unhandled|\bERROR\b/i
const externalResourcePattern = /figma\.com|juejin\.cn|zijieapi\.com|byte(?:dance|replay)|youtube\.com|youtu\.be|googlevideo\.com|unsplash\.com|example\.com|angular\.dev/i

async function waitForEditor(page: Page): Promise<void> {
  await page.waitForFunction((selector) => {
    const element = document.querySelector(selector)
    const debug = (window as unknown as {
      ng?: {getComponent: (target: Element) => {doc?: {isInitialized?: boolean}}}
    }).ng
    return !!element && !!debug?.getComponent(element)?.doc?.isInitialized
  }, editorSelector)
}

function observeFatalDiagnostics(page: Page): string[] {
  const fatal: string[] = []
  page.on('pageerror', error => {
    const detail = error.stack ?? error.message
    if (!externalResourcePattern.test(detail) && fatalConsolePattern.test(detail)) {
      fatal.push(detail)
    }
  })
  return fatal
}

test('find next materializes and centers an unmounted virtual block', async ({page}) => {
  const fatal = observeFatalDiagnostics(page)
  page.on('console', message => {
    const detail = message.text()
    const source = message.location().url
    if (
      !externalResourcePattern.test(`${source} ${detail}`) &&
      fatalConsolePattern.test(detail)
    ) {
      fatal.push(detail)
    }
  })

  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await waitForEditor(page)

  const prepared = await page.evaluate(async (selector) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const query = 'virtual-find-navigation-target'
    const rootIds = doc.model.getChildrenIds(doc.rootId) as string[]
    const firstTextId = rootIds.find(id => doc.model.getNodeType(id) === 'editable')
    if (!firstTextId) throw new Error('No root text block is available')

    const firstLength = doc.model.getTextLength(firstTextId)
    doc.crud.applyTextDelta(firstTextId, [
      ...(firstLength ? [{delete: firstLength}] : []),
      {insert: query},
    ])

    const targetIndex = 100
    const snapshots = Array.from({length: 160}, (_, index) =>
      doc.schemas.createSnapshot('paragraph', [[{
        insert: index === targetIndex ? query : `virtual filler ${index}`,
      }]]),
    )
    const insertedIds = doc.crud.insertBlockSnapshots(
      doc.rootId,
      doc.model.getChildrenIds(doc.rootId).length,
      snapshots,
    ) as string[]
    const targetId = insertedIds[targetIndex]
    await doc.virtualization.scrollToBlock(firstTextId)

    return {firstTextId, targetId, query}
  }, editorSelector)

  await expect.poll(() => page.evaluate(({selector, targetId}) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    return !!debug.getComponent(editor!).doc.vm.get(targetId)
  }, {selector: editorSelector, targetId: prepared.targetId})).toBe(false)

  await page.evaluate(({selector, query}) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const plugin = doc.plugins.find((candidate: any) => candidate.name === 'findReplace')
    if (!plugin?.helper) throw new Error('FindReplacePlugin is unavailable')
    plugin.helper.findAll(query)
  }, {selector: editorSelector, query: prepared.query})

  await expect.poll(() => page.evaluate(({selector}) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const helper = doc.plugins.find((candidate: any) => candidate.name === 'findReplace').helper
    return helper.matchedList[helper.matchIndex]?.blockId ?? null
  }, {selector: editorSelector})).toBe(prepared.firstTextId)

  await page.evaluate((selector) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    doc.plugins.find((candidate: any) => candidate.name === 'findReplace').helper.findNext()
  }, editorSelector)

  await expect.poll(() => page.evaluate(({selector, targetId}) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const helper = doc.plugins.find((candidate: any) => candidate.name === 'findReplace').helper
    const block = doc.vm.get(targetId)?.instance
    const viewport = doc.scrollContainer?.getBoundingClientRect()
    const rect = block?.hostElement?.getBoundingClientRect()
    const centerDelta = viewport && rect
      ? Math.abs((rect.top + rect.bottom - viewport.top - viewport.bottom) / 2)
      : Number.POSITIVE_INFINITY
    const mountedRoots = doc.vm.getMountedRootChildIds().length
    const totalRoots = doc.model.getChildrenIds(doc.rootId).length
    return {
      activeId: helper.matchedList[helper.matchIndex]?.blockId ?? null,
      hasHighlight: !!helper.matchedList[helper.matchIndex]?.fakeRange,
      mounted: !!block,
      centered: centerDelta < 12,
      sparse: mountedRoots < totalRoots,
    }
  }, {
    selector: editorSelector,
    targetId: prepared.targetId,
  }), {timeout: 10_000}).toEqual({
    activeId: prepared.targetId,
    hasHighlight: true,
    mounted: true,
    centered: true,
    sparse: true,
  })

  await page.evaluate(() => new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  }))
  const settled = await page.evaluate(({selector, targetId}) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const block = doc.vm.get(targetId)?.instance
    const viewport = doc.scrollContainer.getBoundingClientRect()
    const rect = block.hostElement.getBoundingClientRect()
    return {
      mounted: !!block,
      centerDelta: Math.abs((rect.top + rect.bottom - viewport.top - viewport.bottom) / 2),
      mountedRoots: doc.vm.getMountedRootChildIds().length,
      totalRoots: doc.model.getChildrenIds(doc.rootId).length,
    }
  }, {selector: editorSelector, targetId: prepared.targetId})

  expect(settled.mounted).toBe(true)
  expect(settled.centerDelta).toBeLessThan(12)
  expect(settled.mountedRoots).toBeLessThan(settled.totalRoots)
  expect(fatal).toEqual([])
})

test('a copied block link waits for explicit initialization before revealing its target', async ({page}) => {
  const fatal = observeFatalDiagnostics(page)
  page.on('console', message => {
    const detail = message.text()
    const source = message.location().url
    if (
      !externalResourcePattern.test(`${source} ${detail}`) &&
      fatalConsolePattern.test(detail)
    ) {
      fatal.push(detail)
    }
  })
  const targetId = 'demo-20-2-2-0'

  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await waitForEditor(page)
  const copiedUrl = await page.evaluate(async ({selector, targetId}) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {
        copyBlockLink: (block: {id: string}) => void
        doc: {clipboard: {copyText: (value: string) => Promise<void>}}
      }}
    }).ng
    const component = debug.getComponent(editor!)
    let copied = ''
    component.doc.clipboard.copyText = async value => {
      copied = value
    }
    component.copyBlockLink({id: targetId})
    await Promise.resolve()
    return copied
  }, {selector: editorSelector, targetId})
  const copiedTarget = new URL(copiedUrl)
  expect(copiedTarget.origin + copiedTarget.pathname).toBe(
    new URL(page.url()).origin + new URL(page.url()).pathname,
  )
  expect(copiedTarget.searchParams.get('blockId')).toBe(targetId)

  await page.goto(copiedUrl)
  await page.waitForFunction((selector) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng?: {getComponent: (target: Element) => {doc?: unknown}}
    }).ng
    return !!editor && !!debug?.getComponent(editor)?.doc
  }, editorSelector)
  await page.evaluate(() => new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  }))
  expect(await page.evaluate((selector) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: {isInitialized: boolean}}}
    }).ng
    return debug.getComponent(editor!).doc.isInitialized
  }, editorSelector)).toBe(false)

  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await waitForEditor(page)

  await expect.poll(() => page.evaluate(({selector, targetId}) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const block = doc.vm.get(targetId)?.instance
    const viewport = doc.scrollContainer?.getBoundingClientRect()
    const rect = block?.hostElement?.getBoundingClientRect()
    return {
      modelExists: doc.model.exists(targetId),
      visible: !!viewport && !!rect &&
        rect.bottom > viewport.top && rect.top < viewport.bottom,
      scrolled: (doc.scrollContainer?.scrollTop ?? 0) > 0,
      selection: doc.selection.value?.toJSON() ?? null,
      sparse: doc.vm.getMountedRootChildIds().length <
        doc.model.getChildrenIds(doc.rootId).length,
    }
  }, {selector: editorSelector, targetId}), {timeout: 10_000}).toEqual({
    modelExists: true,
    visible: true,
    scrolled: true,
    selection: null,
    sparse: true,
  })

  expect(fatal).toEqual([])
})

test('rapid block-link navigation keeps only the latest unmounted target and preserves selection', async ({page}) => {
  const fatal = observeFatalDiagnostics(page)
  page.on('console', message => {
    const detail = message.text()
    const source = message.location().url
    if (
      !externalResourcePattern.test(`${source} ${detail}`) &&
      fatalConsolePattern.test(detail)
    ) {
      fatal.push(detail)
    }
  })

  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await waitForEditor(page)

  const prepared = await page.evaluate(async (selector) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const firstId = (doc.model.getChildrenIds(doc.rootId) as string[])
      .find(id => doc.model.getNodeType(id) === 'editable')
    if (!firstId) throw new Error('No root text block is available')

    const snapshots = Array.from({length: 220}, (_, index) =>
      doc.schemas.createSnapshot('paragraph', [[{
        insert: `block-link navigation filler ${index}`,
      }]]),
    )
    const insertedIds = doc.crud.insertBlockSnapshots(
      doc.rootId,
      doc.model.getChildrenIds(doc.rootId).length,
      snapshots,
    ) as string[]
    const jumpIds = [
      insertedIds[30],
      insertedIds[185],
      insertedIds[55],
      insertedIds[165],
      insertedIds[80],
      insertedIds[145],
      insertedIds[105],
      insertedIds[125],
    ]

    await doc.navigateToBlock(firstId)
    doc.selection.setCursorAtBlock(firstId, true, false)
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })

    const blockIdForNode = (node: Node | null): string | null => {
      const element = node instanceof Element ? node : node?.parentElement
      return element?.closest<HTMLElement>('[data-block-id]')?.dataset['blockId'] ?? null
    }
    const nativeSelection = document.getSelection()
    const activeElement = document.activeElement

    return {
      firstId,
      finalId: jumpIds[jumpIds.length - 1],
      jumpIds,
      modelSelection: doc.selection.value?.toJSON() ?? null,
      nativeSelection: {
        anchorBlockId: blockIdForNode(nativeSelection?.anchorNode ?? null),
        anchorOffset: nativeSelection?.anchorOffset ?? null,
        focusBlockId: blockIdForNode(nativeSelection?.focusNode ?? null),
        focusOffset: nativeSelection?.focusOffset ?? null,
      },
      activeBlockId: blockIdForNode(activeElement),
      targetsInitiallyUnmounted: jumpIds.every(id => !doc.vm.get(id)),
    }
  }, editorSelector)

  expect(prepared.targetsInitiallyUnmounted).toBe(true)
  const urlBeforeNavigation = page.url()

  await page.evaluate(async ({selector, jumpIds}) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {
        blockLinkNavigator: {openBlockLink: (link: string) => boolean}
      }}
    }).ng
    const navigator = debug.getComponent(editor!).blockLinkNavigator
    for (const blockId of jumpIds) {
      const url = new URL(window.location.href)
      url.searchParams.set('blockId', blockId)
      navigator.openBlockLink(url.href)
      await Promise.resolve()
    }
  }, {selector: editorSelector, jumpIds: prepared.jumpIds})

  expect(page.url()).toBe(urlBeforeNavigation)

  await expect.poll(() => page.evaluate(({selector, finalId}) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const block = doc.vm.get(finalId)?.instance
    const viewport = doc.scrollContainer?.getBoundingClientRect()
    const rect = block?.hostElement?.getBoundingClientRect()
    return {
      centered: !!viewport && !!rect &&
        Math.abs((rect.top + rect.bottom - viewport.top - viewport.bottom) / 2) < 12,
      highlightedId: doc.root.hostElement
        .querySelector<HTMLElement>('[data-bc-block-link-target="true"]')
        ?.dataset['blockId'] ?? null,
      sparse: doc.vm.getMountedRootChildIds().length <
        doc.model.getChildrenIds(doc.rootId).length,
    }
  }, {
    selector: editorSelector,
    finalId: prepared.finalId,
  }), {timeout: 10_000}).toEqual({
    centered: true,
    highlightedId: prepared.finalId,
    sparse: true,
  })

  const after = await page.evaluate((selector) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const blockIdForNode = (node: Node | null): string | null => {
      const element = node instanceof Element ? node : node?.parentElement
      return element?.closest<HTMLElement>('[data-block-id]')?.dataset['blockId'] ?? null
    }
    const nativeSelection = document.getSelection()
    return {
      modelSelection: doc.selection.value?.toJSON() ?? null,
      nativeSelection: {
        anchorBlockId: blockIdForNode(nativeSelection?.anchorNode ?? null),
        anchorOffset: nativeSelection?.anchorOffset ?? null,
        focusBlockId: blockIdForNode(nativeSelection?.focusNode ?? null),
        focusOffset: nativeSelection?.focusOffset ?? null,
      },
      activeBlockId: blockIdForNode(document.activeElement),
    }
  }, editorSelector)

  expect(after.modelSelection).toEqual(prepared.modelSelection)
  expect(after.nativeSelection).toEqual(prepared.nativeSelection)
  expect(after.activeBlockId).toBe(prepared.activeBlockId)
  expect(fatal).toEqual([])
})

test('pagination releases its full-document lease back to a sparse window', async ({page}) => {
  const fatal = observeFatalDiagnostics(page)
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await waitForEditor(page)

  const totalRoots = await page.evaluate(async (selector) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const snapshots = Array.from({length: 120}, (_, index) =>
      doc.schemas.createSnapshot('paragraph', [[{insert: `pagination filler ${index}`}]]),
    )
    doc.crud.insertBlockSnapshots(
      doc.rootId,
      doc.model.getChildrenIds(doc.rootId).length,
      snapshots,
    )
    const firstId = doc.model.getChildrenIds(doc.rootId)[0]
    await doc.virtualization.scrollToBlock(firstId)
    return doc.model.getChildrenIds(doc.rootId).length as number
  }, editorSelector)

  await expect.poll(() => page.evaluate((selector) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    return doc.vm.getMountedRootChildIds().length
  }, editorSelector)).toBeLessThan(totalRoots)

  await page.evaluate((selector) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const plugin = doc.plugins.find((candidate: any) => candidate.name === 'pagination')
    if (!plugin) throw new Error('PaginationPlugin is unavailable')
    plugin.enable()
  }, editorSelector)

  await expect.poll(() => page.evaluate((selector) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    return {
      mountedRoots: doc.vm.getMountedRootChildIds().length,
      paginated: doc.root.hostElement.classList.contains('bc-paginated'),
    }
  }, editorSelector), {timeout: 10_000}).toEqual({
    mountedRoots: totalRoots,
    paginated: true,
  })

  await page.evaluate((selector) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    doc.plugins.find((candidate: any) => candidate.name === 'pagination').disable()
  }, editorSelector)

  await expect.poll(() => page.evaluate((selector) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const mountedRoots = doc.vm.getMountedRootChildIds().length
    const currentTotalRoots = doc.model.getChildrenIds(doc.rootId).length
    return {
      sparse: mountedRoots < currentTotalRoots,
      paginated: doc.root.hostElement.classList.contains('bc-paginated'),
      backdrop: !!doc.scrollContainer.querySelector('.bc-pagination-backdrop'),
    }
  }, editorSelector), {timeout: 10_000}).toEqual({
    sparse: true,
    paginated: false,
    backdrop: false,
  })

  expect(fatal).toEqual([])
})

test('cancelled block dragging releases its source view lease', async ({page}) => {
  const fatal = observeFatalDiagnostics(page)
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await waitForEditor(page)

  const prepared = await page.evaluate(async (selector) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const snapshots = Array.from({length: 140}, (_, index) =>
      doc.schemas.createSnapshot('paragraph', [[{insert: `drag filler ${index}`}]]),
    )
    const inserted = doc.crud.insertBlockSnapshots(
      doc.rootId,
      doc.model.getChildrenIds(doc.rootId).length,
      snapshots,
    ) as string[]
    const sourceId = doc.model.getChildrenIds(doc.rootId)
      .find((id: string) => doc.model.getNodeType(id) === 'editable')
    if (!sourceId) throw new Error('No draggable root text block is available')
    const farId = inserted[100]
    await doc.virtualization.scrollToBlock(sourceId)
    return {sourceId, farId}
  }, editorSelector)

  const dragging = await page.evaluate(({selector, sourceId}) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const host = doc.vm.get(sourceId)?.instance?.hostElement as HTMLElement | undefined
    if (!host) throw new Error('Drag source view is unavailable')
    const baselineLeases = doc.virtualization.blockViewLeases?.size ?? 0
    const rect = host.getBoundingClientRect()
    const x = rect.left + Math.min(12, rect.width / 2)
    const y = rect.top + Math.min(12, rect.height / 2)
    const down = new PointerEvent('pointerdown', {
      pointerId: 91,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: x,
      clientY: y,
    })
    Object.defineProperty(down, 'target', {value: host})
    doc.dragController.startDrag(
      down,
      {kind: 'origin-block', blockId: sourceId},
      {movementThreshold: 0},
    )
    window.dispatchEvent(new PointerEvent('pointermove', {
      pointerId: 91,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: x + 8,
      clientY: y + 8,
    }))
    return {
      baselineLeases,
      state: doc.dragController.state,
      leases: doc.virtualization.blockViewLeases?.size ?? null,
    }
  }, {selector: editorSelector, sourceId: prepared.sourceId})

  expect(dragging.state).toBe('dragging')
  expect(dragging.leases).toBe(dragging.baselineLeases + 1)

  await page.evaluate(async ({selector, farId}) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    window.dispatchEvent(new PointerEvent('pointercancel', {
      pointerId: 91,
      pointerType: 'mouse',
      isPrimary: true,
    }))
    await doc.virtualization.scrollToBlock(farId)
  }, {selector: editorSelector, farId: prepared.farId})

  await expect.poll(() => page.evaluate(({selector, sourceId}) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    return {
      sourceMounted: !!doc.vm.get(sourceId)?.instance,
      state: doc.dragController.state,
      leases: doc.virtualization.blockViewLeases?.size ?? null,
      sparse: doc.vm.getMountedRootChildIds().length < doc.model.getChildrenIds(doc.rootId).length,
    }
  }, {
    selector: editorSelector,
    sourceId: prepared.sourceId,
  }), {timeout: 10_000}).toEqual({
    sourceMounted: false,
    state: 'idle',
    leases: dragging.baselineLeases,
    sparse: true,
  })
  expect(fatal).toEqual([])
})
