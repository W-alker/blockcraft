import {expect, test, type Page} from '@playwright/test'

const editorSelector = 'block-craft-editor'
const fatalConsolePattern = /Block not found|Doc not init yet|Cannot read properties|virtualization(?:Reconcile|Fallback|FullMount)Error|pagination(?:Sparse|\s+sparse)|layoutProjectionInvalid|unhandled|\bERROR\b/i
const externalResourcePattern = /figma\.com|juejin\.cn|zijieapi\.com|byte(?:dance|replay)|youtube\.com|youtu\.be|googlevideo\.com|unsplash\.com|example\.com|angular\.dev|affine-worker\.toeverything\.workers\.dev|api\.translate\.zvo\.cn/i

async function waitForEditor(page: Page): Promise<void> {
  await page.waitForFunction((selector) => {
    const element = document.querySelector(selector)
    const debug = (window as unknown as {
      ng?: {getComponent: (target: Element) => {doc?: {isInitialized?: boolean}}}
    }).ng
    return !!element && !!debug?.getComponent(element)?.doc?.isInitialized
  }, editorSelector)
}

async function waitForAnimationFrames(page: Page, count = 4): Promise<void> {
  await page.evaluate(async frameCount => {
    for (let index = 0; index < frameCount; index++) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    }
  }, count)
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

test('full rendering initializes the model and root before mounting placeable block views', async ({page}) => {
  const fatal = observeFatalDiagnostics(page)
  const initPerformanceLogs: string[] = []
  page.on('console', message => {
    const detail = message.text()
    const source = message.location().url
    if (/\[Async\].*Doc init took/.test(detail)) {
      initPerformanceLogs.push(detail)
    }
    if (
      !externalResourcePattern.test(`${source} ${detail}`) &&
      fatalConsolePattern.test(detail)
    ) {
      fatal.push(detail)
    }
  })

  await page.goto('/')
  await page.getByRole('button', {name: '虚拟渲染', exact: true}).click()
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await waitForEditor(page)

  const state = await page.evaluate((selector) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const rootIds = doc.model.getChildrenIds(doc.rootId) as string[]
    const mountedIds = doc.vm.getMountedRootChildIds() as string[]
    const imageId = rootIds.find(id => doc.model.getFlavour(id) === 'image')
    const image = imageId ? doc.getBlockById(imageId) : null
    return {
      initialized: doc.isInitialized,
      virtualizationEnabled: doc.virtualization.enabled,
      sparseRoot: doc.vm.usesSparseRoot,
      totalRootChildren: rootIds.length,
      mountedRootChildren: mountedIds.length,
      imageMounted: !!image,
      imageParentId: image?.parentId ?? null,
      imageSupportsAbsolutePlacement: image
        ? doc.placement.supports(image, 'absolute')
        : false,
    }
  }, editorSelector)

  expect(state).toEqual({
    initialized: true,
    virtualizationEnabled: false,
    sparseRoot: false,
    totalRootChildren: 21,
    mountedRootChildren: 21,
    imageMounted: true,
    imageParentId: '689ac2b31a9abe3ae8a6788d',
    imageSupportsAbsolutePlacement: true,
  })
  await expect.poll(() => initPerformanceLogs.length).toBe(1)
  expect(initPerformanceLogs[0]).toMatch(
    /\[Async\] initBy(?:Snapshot|YBlock): Doc init took [\d.]+ms/,
  )
  expect(fatal).toEqual([])
})

test('undoing top-bottom layout restores a visible absolute object with virtualization', async ({page}) => {
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await waitForEditor(page)

  const imageId = await page.evaluate(async (selector) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const rootIds = doc.model.getChildrenIds(doc.rootId) as string[]
    const id = rootIds.find(blockId => doc.model.getFlavour(blockId) === 'image')
    if (!id) throw new Error('Image target is unavailable')

    const pagination = doc.plugins.find((plugin: any) => plugin.name === 'pagination')
    if (!pagination) throw new Error('PaginationPlugin is unavailable')
    pagination.enable()
    await doc.virtualization.scrollToBlock(id)
    doc.selection.selectBlock(id)
    doc.crud.undoManager.stopCapturing()
    if (!doc.placement.setMode(id, 'absolute')) {
      throw new Error('Failed to lift image into absolute placement')
    }
    doc.placement.updateAbsolute(id, {y: 1500})
    const peerSnapshot = doc.schemas.createSnapshot('shape', [])
    const peerId = doc.placement.insertAbsoluteSnapshot(peerSnapshot)
    if (!peerId) throw new Error('Failed to insert absolute peer')
    doc.placement.updateAbsolute(peerId, {y: 5000})
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
    await doc.virtualization.scrollToBlock(id)
    doc.crud.undoManager.clearHistory()
    doc.crud.undoManager.stopCapturing()
    return id
  }, editorSelector)

  await page.evaluate(({selector, id}) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    doc.selection.blur()
    if (!doc.placement.setObjectLayout(id, 'top-bottom')) {
      throw new Error('Failed to restore image to top-bottom layout')
    }
  }, {selector: editorSelector, id: imageId})
  await page.locator('button[title="撤销"]').click()

  await waitForAnimationFrames(page, 8)

  await expect.poll(() => page.evaluate(({selector, id}) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const parentId = doc.model.getParentId(id)
    const parentFlavour = parentId ? doc.model.getFlavour(parentId) : null
    const props = doc.model.getProps(id)
    const block = doc.vm.get(id)?.instance
    const layoutMounted = parentId
      ? doc.vm.getMountedRootChildIds().includes(parentId)
      : false
    const rect = block?.hostElement.getBoundingClientRect()
    const viewport = doc.scrollContainer.getBoundingClientRect()
    return {
      parentFlavour,
      position: props?.position ?? null,
      layoutMounted,
      connected: block?.hostElement.isConnected === true,
      visible: !!rect && rect.bottom > viewport.top && rect.top < viewport.bottom,
    }
  }, {selector: editorSelector, id: imageId}), {timeout: 10_000}).toEqual({
    parentFlavour: 'placement-layout',
    position: {x: expect.any(Number), y: expect.any(Number)},
    layoutMounted: true,
    connected: true,
    visible: true,
  })
})

test('experimental pagination keeps root mounting sparse across scroll and config changes', async ({page}) => {
  test.setTimeout(60_000)
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

  await page.evaluate(async (selector) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const snapshots = Array.from({length: 240}, (_, index) =>
      doc.schemas.createSnapshot('paragraph', [[{
        insert: `sparse pagination filler ${index}`,
      }]]),
    )
    doc.crud.insertBlockSnapshots(
      doc.rootId,
      doc.model.getChildrenIds(doc.rootId).length,
      snapshots,
    )
    const pagination = doc.plugins.find((plugin: any) => plugin.name === 'pagination')
    if (!pagination) throw new Error('PaginationPlugin is unavailable')
    pagination.enable()
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
  }, editorSelector)

  const readState = () => page.evaluate((selector) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const rootIds = doc.model.getChildrenIds(doc.rootId) as string[]
    const mountedIds = doc.vm.getMountedRootChildIds() as string[]
    const pagination = doc.plugins.find((plugin: any) => plugin.name === 'pagination')
    return {
      enabled: pagination?.enabled === true,
      paginated: doc.root.hostElement.classList.contains('bc-paginated'),
      pageWidth: doc.root.hostElement.style.getPropertyValue('--bc-page-width'),
      sheets: doc.scrollContainer.querySelectorAll('.bc-page-sheet').length,
      scrollTop: doc.scrollContainer.scrollTop,
      scrollHeight: doc.scrollContainer.scrollHeight,
      clientHeight: doc.scrollContainer.clientHeight,
      mountedCount: mountedIds.length,
      totalCount: rootIds.length,
      furthestMountedIndex: Math.max(
        -1,
        ...mountedIds.map(id => rootIds.indexOf(id)),
      ),
    }
  }, editorSelector)

  await expect.poll(readState).toMatchObject({
    enabled: true,
    paginated: true,
  })
  const initial = await readState()
  expect(initial.sheets).toBeGreaterThan(1)
  expect(initial.mountedCount).toBeLessThan(40)
  expect(initial.mountedCount).toBeLessThan(initial.totalCount)

  await page.evaluate((selector) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    doc.scrollContainer.scrollTop = doc.scrollContainer.scrollHeight
    doc.scrollContainer.dispatchEvent(new Event('scroll'))
  }, editorSelector)

  await expect.poll(
    async () => (await readState()).furthestMountedIndex,
    {timeout: 10_000},
  ).toBeGreaterThan(180)
  const scrolled = await readState()
  expect(scrolled.scrollTop).toBeGreaterThan(scrolled.clientHeight)
  expect(scrolled.mountedCount).toBeLessThan(40)

  for (const [index, width] of [720, 900, 760, 860, 700, 820].entries()) {
    const scrollToEnd = index % 2 === 0
    await page.evaluate(({selector, nextWidth, end}) => {
      const editor = document.querySelector(selector)
      const debug = (window as unknown as {
        ng: {getComponent: (target: Element) => {doc: any}}
      }).ng
      const doc = debug.getComponent(editor!).doc
      doc.plugins
        .find((plugin: any) => plugin.name === 'pagination')
        .updateConfig({pageSize: {width: nextWidth, height: 1100}})
      doc.scrollContainer.scrollTop = end ? doc.scrollContainer.scrollHeight : 0
      doc.scrollContainer.dispatchEvent(new Event('scroll'))
    }, {selector: editorSelector, nextWidth: width, end: scrollToEnd})

    await expect.poll(async () => {
      const state = await readState()
      return {
        pageWidth: state.pageWidth,
        atTarget: scrollToEnd
          ? state.furthestMountedIndex > 180
          : state.furthestMountedIndex < 50,
        sparse: state.mountedCount < 40,
      }
    }, {timeout: 10_000}).toEqual({
      pageWidth: `${width}px`,
      atTarget: true,
      sparse: true,
    })
  }

  for (let cycle = 0; cycle < 2; cycle++) {
    await page.evaluate((selector) => {
      const editor = document.querySelector(selector)
      const debug = (window as unknown as {
        ng: {getComponent: (target: Element) => {doc: any}}
      }).ng
      const doc = debug.getComponent(editor!).doc
      doc.plugins.find((plugin: any) => plugin.name === 'pagination').disable()
    }, editorSelector)
    await expect.poll(readState).toMatchObject({
      enabled: false,
      paginated: false,
      pageWidth: '',
      sheets: 0,
    })

    await page.evaluate((selector) => {
      const editor = document.querySelector(selector)
      const debug = (window as unknown as {
        ng: {getComponent: (target: Element) => {doc: any}}
      }).ng
      const doc = debug.getComponent(editor!).doc
      doc.plugins.find((plugin: any) => plugin.name === 'pagination').enable()
    }, editorSelector)
    await expect.poll(async () => {
      const state = await readState()
      return {
        enabled: state.enabled,
        paginated: state.paginated,
        sparse: state.mountedCount < 40,
      }
    }).toEqual({enabled: true, paginated: true, sparse: true})
  }

  await page.evaluate((selector) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    doc.plugins.find((plugin: any) => plugin.name === 'pagination').disable()
  }, editorSelector)

  await expect.poll(readState).toMatchObject({
    enabled: false,
    paginated: false,
    pageWidth: '',
    sheets: 0,
  })
  expect((await readState()).mountedCount).toBeLessThan(40)
  expect(fatal).toEqual([])
})

test('sparse pagination survives mounted heading switches and an offscreen heading mount', async ({page}) => {
  test.setTimeout(60_000)
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

  const targets = await page.evaluate(async (selector) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const snapshots = Array.from({length: 100}, (_, index) =>
      doc.schemas.createSnapshot('paragraph', [[{
        insert: `heading pagination filler ${index}`,
      }]]),
    )
    const insertedIds = doc.crud.insertBlockSnapshots(
      doc.rootId,
      doc.model.getChildrenIds(doc.rootId).length,
      snapshots,
    ) as string[]
    const pagination = doc.plugins.find((plugin: any) => plugin.name === 'pagination')
    if (!pagination) throw new Error('PaginationPlugin is unavailable')
    pagination.enable()
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )

    const mountedIds = doc.vm.getMountedRootChildIds() as string[]
    const mountedId = mountedIds.find(id =>
      doc.model.getFlavour(id) === 'paragraph' && !!doc.getBlockById(id))
    const mounted = new Set(mountedIds)
    const offscreenId = [...insertedIds].reverse().find(id => !mounted.has(id))
    if (!mountedId || !offscreenId) {
      throw new Error('Heading pagination targets are unavailable')
    }
    doc.selection.setCursorAtBlock(mountedId, true, false)
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
    return {mountedId, offscreenId}
  }, editorSelector)

  const readHeadingState = (blockId: string) => page.evaluate(
    ({selector, id}) => {
      const editor = document.querySelector(selector)
      const debug = (window as unknown as {
        ng: {getComponent: (target: Element) => {doc: any}}
      }).ng
      const doc = debug.getComponent(editor!).doc
      const pagination = doc.plugins.find((plugin: any) =>
        plugin.name === 'pagination')
      const mountedIds = doc.vm.getMountedRootChildIds() as string[]
      const block = mountedIds.includes(id) ? doc.getBlockById(id) : null
      return {
        enabled: pagination?.enabled === true,
        paginated: doc.root.hostElement.classList.contains('bc-paginated'),
        heading: doc.model.getProps(id)?.heading ?? null,
        mounted: mountedIds.includes(id),
        domHeading: block?.hostElement?.getAttribute('data-heading') ?? null,
      }
    },
    {selector: editorSelector, id: blockId},
  )

  const styleButton = page.locator('bc-fixed-toolbar .toolbar-btn--style')
  await expect(styleButton).toBeEnabled()
  for (const [label, heading, domHeading] of [
    ['一级标题', 1, '1'],
    ['二级标题', 2, '2'],
    ['正文', null, null],
  ] as const) {
    await styleButton.click()
    await page.locator('bc-float-toolbar-item')
      .filter({hasText: label})
      .click()
    await waitForAnimationFrames(page)

    expect(await readHeadingState(targets.mountedId)).toEqual({
      enabled: true,
      paginated: true,
      heading,
      mounted: true,
      domHeading,
    })
  }

  await page.evaluate(async ({selector, id}) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    doc.crud.updateBlockProps(id, {heading: 1})
  }, {selector: editorSelector, id: targets.offscreenId})
  await waitForAnimationFrames(page)
  expect(await readHeadingState(targets.offscreenId)).toEqual({
    enabled: true,
    paginated: true,
    heading: 1,
    mounted: false,
    domHeading: null,
  })

  await page.evaluate(async ({selector, id}) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    await doc.virtualization.scrollToBlock(id)
  }, {selector: editorSelector, id: targets.offscreenId})
  await waitForAnimationFrames(page)
  expect(await readHeadingState(targets.offscreenId)).toEqual({
    enabled: true,
    paginated: true,
    heading: 1,
    mounted: true,
    domHeading: '1',
  })
  expect(fatal).toEqual([])
})

test('sparse pagination keeps offscreen input, IME and history selection coherent through layout churn', async ({page}) => {
  test.setTimeout(60_000)
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
    const snapshots = Array.from({length: 180}, (_, index) =>
      doc.schemas.createSnapshot('paragraph', [[{
        insert: `sparse history target ${index}`,
      }]]),
    )
    const insertedIds = doc.crud.insertBlockSnapshots(
      doc.rootId,
      doc.model.getChildrenIds(doc.rootId).length,
      snapshots,
    ) as string[]
    const targetId = insertedIds[140]
    const pagination = doc.plugins.find((plugin: any) => plugin.name === 'pagination')
    if (!pagination || !targetId) throw new Error('Sparse pagination target is unavailable')
    pagination.enable()
    await doc.virtualization.scrollToBlock(targetId)
    doc.crud.undoManager.clearHistory()
    const baseline = doc.model.getYBlock(targetId).get('children').toString()
    doc.selection.setCursorAt(doc.getBlockById(targetId), baseline.length)
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
    return {targetId, baseline}
  }, editorSelector)

  const readEditingState = () => page.evaluate(({selector, targetId}) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const nativeSelection = document.getSelection()
    const blockIdForNode = (node: Node | null): string | null => {
      const element = node instanceof Element ? node : node?.parentElement
      return element
        ?.closest<HTMLElement>('[data-block-id]')
        ?.dataset['blockId'] ?? null
    }
    let recalculated: any = null
    try {
      recalculated = doc.selection.recalculate(
        false,
        {isComposing: doc.event.status.isComposing},
      ).value?.toJSON() ?? null
    } catch {
      recalculated = null
    }
    const block = doc.vm.get(targetId)?.instance
    const viewport = doc.scrollContainer.getBoundingClientRect()
    const rect = block?.hostElement.getBoundingClientRect()
    const active = document.activeElement
    return {
      text: doc.model.getYBlock(targetId)?.get('children')?.toString?.() ?? null,
      modelSelection: doc.selection.value?.toJSON() ?? null,
      recalculatedSelection: recalculated,
      nativeAnchorBlockId: blockIdForNode(nativeSelection?.anchorNode ?? null),
      nativeFocusBlockId: blockIdForNode(nativeSelection?.focusNode ?? null),
      nativeRangeCount: nativeSelection?.rangeCount ?? 0,
      focusInsideEditor: !!active && (
        active === doc.root.hostElement || doc.root.hostElement.contains(active)
      ),
      compositionPhase: doc.inputManger.compositionSession.phase,
      eventComposing: doc.event.status.isComposing,
      visible: !!rect && rect.bottom > viewport.top && rect.top < viewport.bottom,
      mounted: doc.vm.getMountedRootChildIds().includes(targetId),
      mountedCount: doc.vm.getMountedRootChildIds().length,
      totalCount: doc.model.getChildrenIds(doc.rootId).length,
      pageWidth: doc.root.hostElement.style.getPropertyValue('--bc-page-width'),
    }
  }, {selector: editorSelector, targetId: prepared.targetId})

  const expectCoherentTargetSelection = async (expectedText: string) => {
    await expect.poll(readEditingState, {timeout: 10_000}).toMatchObject({
      text: expectedText,
      nativeAnchorBlockId: prepared.targetId,
      nativeFocusBlockId: prepared.targetId,
      nativeRangeCount: 1,
      focusInsideEditor: true,
      compositionPhase: 'idle',
      eventComposing: false,
      visible: true,
      mounted: true,
    })
    const state = await readEditingState()
    expect(state.modelSelection).toEqual(state.recalculatedSelection)
    expect(state.modelSelection?.anchor.blockId).toBe(prepared.targetId)
    expect(state.modelSelection?.head.blockId).toBe(prepared.targetId)
    expect(state.mountedCount).toBeLessThan(40)
    expect(state.mountedCount).toBeLessThan(state.totalCount)
  }

  await expectCoherentTargetSelection(prepared.baseline)
  await page.keyboard.type('A')
  await expectCoherentTargetSelection(`${prepared.baseline}A`)
  await page.keyboard.press('ControlOrMeta+z')
  await expectCoherentTargetSelection(prepared.baseline)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expectCoherentTargetSelection(`${prepared.baseline}A`)
  await page.keyboard.press('ControlOrMeta+z')
  await expectCoherentTargetSelection(prepared.baseline)

  const duringComposition = await page.evaluate(({selector, targetId}) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const target = doc.getBlockById(targetId).containerElement
    target.dispatchEvent(new CompositionEvent('compositionstart', {
      bubbles: true,
      cancelable: true,
      data: '',
    }))
    doc.plugins
      .find((plugin: any) => plugin.name === 'pagination')
      .updateConfig({pageSize: {width: 845, height: 1100}})
    return {
      phase: doc.inputManger.compositionSession.phase,
      composing: doc.event.status.isComposing,
    }
  }, {selector: editorSelector, targetId: prepared.targetId})
  expect(duringComposition).toEqual({phase: 'active', composing: true})
  await expect.poll(async () => (await readEditingState()).pageWidth).toBe('845px')

  await page.evaluate(({selector, targetId}) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    doc.getBlockById(targetId).containerElement.dispatchEvent(
      new CompositionEvent('compositionend', {
        bubbles: true,
        cancelable: true,
        data: '中',
      }),
    )
  }, {selector: editorSelector, targetId: prepared.targetId})
  await expectCoherentTargetSelection(`${prepared.baseline}中`)

  await page.evaluate((selector) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    doc.scrollContainer.scrollTop = 0
    doc.scrollContainer.dispatchEvent(new Event('scroll'))
  }, editorSelector)
  await expect.poll(async () => (await readEditingState()).visible).toBe(false)

  await page.keyboard.press('ControlOrMeta+z')
  await expectCoherentTargetSelection(prepared.baseline)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expectCoherentTargetSelection(`${prepared.baseline}中`)
  expect(fatal).toEqual([])
})

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

test('sparse pagination keeps large mounted blocks out of page gaps', async ({page}) => {
  test.setTimeout(60_000)
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

  const targetIds = await page.evaluate(async (selector) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const body = '分页大块测试内容'.repeat(110)
    const snapshots = Array.from({length: 48}, (_, index) =>
      doc.schemas.createSnapshot('ordered', [[{
        insert: `${index + 1} ${body}`,
      }]]),
    )
    doc.crud.insertBlockSnapshots(
      doc.rootId,
      doc.model.getChildrenIds(doc.rootId).length,
      snapshots,
    )
    const pagination = doc.plugins.find((plugin: any) => plugin.name === 'pagination')
    if (!pagination) throw new Error('PaginationPlugin is unavailable')
    pagination.enable()
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
    return snapshots
      .filter((_, index) => index % 6 === 0 || index === snapshots.length - 1)
      .map(snapshot => snapshot.id)
  }, editorSelector)

  const inspectVisibleGeometry = () => page.evaluate((selector) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const containerRect = doc.scrollContainer.getBoundingClientRect()
    const sheets = Array.from(
      doc.scrollContainer.querySelectorAll<HTMLElement>('.bc-page-sheet'),
    ).map(sheet => {
      const rect = sheet.getBoundingClientRect()
      return {top: rect.top, bottom: rect.bottom}
    })
    const visibleBlocks = Array.from(
      doc.root.hostElement.querySelectorAll<HTMLElement>(':scope > [data-block-id]'),
    ).filter(host => {
      const rect = host.getBoundingClientRect()
      return rect.bottom > containerRect.top && rect.top < containerRect.bottom
    })
    const blocksInPageGaps = visibleBlocks.flatMap(host => {
      const rect = host.getBoundingClientRect()
      const center = (rect.top + rect.bottom) / 2
      return sheets.some(sheet => center >= sheet.top && center <= sheet.bottom)
        ? []
        : [host.dataset['blockId']]
    })
    return {
      blocksInPageGaps,
      blocksWithPaginationMargin: visibleBlocks
        .filter(host => host.style.marginTop !== '')
        .map(host => host.dataset['blockId']),
      pageGapSpacers: doc.root.hostElement
        .querySelectorAll('[data-bc-page-gap-spacer]').length,
    }
  }, editorSelector)

  for (const targetId of targetIds) {
    await page.evaluate(async ({selector, blockId}) => {
      const editor = document.querySelector(selector)
      const debug = (window as unknown as {
        ng: {getComponent: (target: Element) => {doc: any}}
      }).ng
      const doc = debug.getComponent(editor!).doc
      await doc.virtualization.scrollToBlock(blockId, {align: 'center'})
    }, {selector: editorSelector, blockId: targetId})

    await expect.poll(inspectVisibleGeometry, {timeout: 10_000}).toEqual({
      blocksInPageGaps: [],
      blocksWithPaginationMargin: [],
      pageGapSpacers: expect.any(Number),
    })
    expect((await inspectVisibleGeometry()).pageGapSpacers).toBeGreaterThan(0)
  }

  expect(fatal).toEqual([])
})

test('gap input stays in one paragraph while sparse pagination catches up', async ({page}) => {
  test.setTimeout(60_000)
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
    const rootIds = doc.model.getChildrenIds(doc.rootId) as string[]
    const insertionIndex = Math.min(1, rootIds.length)
    const nextId = rootIds[insertionIndex] ?? null
    const divider = doc.schemas.createSnapshot('divider', [])
    doc.crud.insertBlocks(doc.rootId, insertionIndex, [divider])
    const pagination = doc.plugins.find((plugin: any) => plugin.name === 'pagination')
    if (!pagination) throw new Error('PaginationPlugin is unavailable')
    pagination.enable()
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
    doc.selection.setGapCursor(divider.id, 'after')
    return {dividerId: divider.id, nextId}
  }, editorSelector)

  const payload = 'abcdefghijklmnopqrstuvwxyz'.repeat(4)
  await page.keyboard.type(payload, {delay: 0})

  await expect.poll(() => page.evaluate(({selector, dividerId, nextId}) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const rootIds = doc.model.getChildrenIds(doc.rootId) as string[]
    const from = rootIds.indexOf(dividerId) + 1
    const nextIndex = nextId ? rootIds.indexOf(nextId) : rootIds.length
    const to = nextIndex >= from ? nextIndex : rootIds.length
    const inserted = rootIds.slice(from, to).map(blockId => ({
      blockId,
      flavour: doc.model.getFlavour(blockId),
      text: (doc.model.getTextDeltas(blockId) ?? [])
        .map((op: {insert: unknown}) => typeof op.insert === 'string' ? op.insert : '')
        .join(''),
    }))
    const selection = doc.selection.value?.toJSON() ?? null
    return {
      inserted: inserted.map(({flavour, text}) => ({flavour, text})),
      selectionOwnsInsertedBlock:
        inserted.length === 1 && selection?.head?.blockId === inserted[0]!.blockId,
      selectionOffset: selection?.head?.type === 'text' ? selection.head.offset : null,
      paginationEnabled:
        doc.plugins.find((plugin: any) => plugin.name === 'pagination')?.enabled === true,
      paginated: doc.root.hostElement.classList.contains('bc-paginated'),
    }
  }, {
    selector: editorSelector,
    dividerId: prepared.dividerId,
    nextId: prepared.nextId,
  }), {timeout: 10_000}).toEqual({
    inserted: [{flavour: 'paragraph', text: payload}],
    selectionOwnsInsertedBlock: true,
    selectionOffset: payload.length,
    paginationEnabled: true,
    paginated: true,
  })

  expect(fatal).toEqual([])
})

test('gap IME stays attached while sparse pagination catches up', async ({page}) => {
  test.setTimeout(60_000)
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
    const rootIds = doc.model.getChildrenIds(doc.rootId) as string[]
    const insertionIndex = Math.min(1, rootIds.length)
    const nextId = rootIds[insertionIndex] ?? null
    const divider = doc.schemas.createSnapshot('divider', [])
    doc.crud.insertBlocks(doc.rootId, insertionIndex, [divider])
    const pagination = doc.plugins.find((plugin: any) => plugin.name === 'pagination')
    if (!pagination) throw new Error('PaginationPlugin is unavailable')
    pagination.enable()
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
    doc.selection.setGapCursor(divider.id, 'after')
    const nativeSelection = document.getSelection()
    const compositionTarget = nativeSelection?.anchorNode instanceof Element
      ? nativeSelection.anchorNode
      : nativeSelection?.anchorNode?.parentElement
    if (!compositionTarget) throw new Error('Gap composition target is unavailable')
    compositionTarget.dispatchEvent(
      new CompositionEvent('compositionstart', {
        bubbles: true,
        cancelable: true,
        data: '',
      }),
    )
    const updatedRootIds = doc.model.getChildrenIds(doc.rootId) as string[]
    const paragraphId = updatedRootIds[updatedRootIds.indexOf(divider.id) + 1]
    return {
      dividerId: divider.id,
      nextId,
      paragraphId,
      phase: doc.inputManger.compositionSession.phase,
      composing: doc.event.status.isComposing,
    }
  }, editorSelector)

  expect(prepared.phase).toBe('active')
  expect(prepared.composing).toBe(true)
  expect(prepared.paragraphId).toBeTruthy()

  await page.evaluate(({selector, paragraphId}) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const nativeSelection = document.getSelection()
    const compositionTarget = nativeSelection?.anchorNode instanceof Element
      ? nativeSelection.anchorNode
      : nativeSelection?.anchorNode?.parentElement
    if (!compositionTarget) throw new Error('Paragraph composition target is unavailable')
    compositionTarget.dispatchEvent(
      new CompositionEvent('compositionend', {
        bubbles: true,
        cancelable: true,
        data: '中文输入',
      }),
    )
  }, {selector: editorSelector, paragraphId: prepared.paragraphId})

  await expect.poll(() => page.evaluate(({
    selector,
    dividerId,
    nextId,
    paragraphId,
  }) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const rootIds = doc.model.getChildrenIds(doc.rootId) as string[]
    const from = rootIds.indexOf(dividerId) + 1
    const nextIndex = nextId ? rootIds.indexOf(nextId) : rootIds.length
    const to = nextIndex >= from ? nextIndex : rootIds.length
    const inserted = rootIds.slice(from, to).map(blockId => ({
      blockId,
      flavour: doc.model.getFlavour(blockId),
      text: (doc.model.getTextDeltas(blockId) ?? [])
        .map((op: {insert: unknown}) => typeof op.insert === 'string' ? op.insert : '')
        .join(''),
    }))
    const selection = doc.selection.value?.toJSON() ?? null
    return {
      inserted,
      selectionBlockId: selection?.head?.blockId ?? null,
      selectionOffset: selection?.head?.type === 'text' ? selection.head.offset : null,
      paragraphMounted: doc.vm.getMountedRootChildIds().includes(paragraphId),
      phase: doc.inputManger.compositionSession.phase,
      composing: doc.event.status.isComposing,
      paginationEnabled:
        doc.plugins.find((plugin: any) => plugin.name === 'pagination')?.enabled === true,
      paginated: doc.root.hostElement.classList.contains('bc-paginated'),
    }
  }, {
    selector: editorSelector,
    dividerId: prepared.dividerId,
    nextId: prepared.nextId,
    paragraphId: prepared.paragraphId,
  }), {timeout: 10_000}).toEqual({
    inserted: [{
      blockId: prepared.paragraphId,
      flavour: 'paragraph',
      text: '中文输入',
    }],
    selectionBlockId: prepared.paragraphId,
    selectionOffset: 4,
    paragraphMounted: true,
    phase: 'idle',
    composing: false,
    paginationEnabled: true,
    paginated: true,
  })

  expect(fatal).toEqual([])
})

test('sparse pagination never acquires a full-document lease and cleans up on disable', async ({page}) => {
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
    const mountedRoots = doc.vm.getMountedRootChildIds().length
    return {
      sparse: mountedRoots < doc.model.getChildrenIds(doc.rootId).length,
      fullDocumentLeases:
        doc.virtualization.fullDocumentViewLeaseCount ?? null,
      paginated: doc.root.hostElement.classList.contains('bc-paginated'),
    }
  }, editorSelector), {timeout: 10_000}).toEqual({
    sparse: true,
    fullDocumentLeases: 0,
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
