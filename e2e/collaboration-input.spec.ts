import {
  expect,
  test,
  type BrowserContext,
  type Page,
} from '@playwright/test'

const baseURL = 'http://127.0.0.1:8081'
const editorSelector = 'block-craft-editor'
const websocketPort = 12345
const fatalConsolePattern = /Block not found|Cannot read properties|virtualization(?:Reconcile|Fallback|FullMount)Error|syncYEvent: skip broken event|children repair failed|unhandled|\bERROR\b/i
const externalEmbedPattern = /figma\.com|juejin\.cn|zijieapi\.com|yhgfb-cn-static\.com|byte(?:dance|replay)|youtube\.com|youtu\.be|googlevideo\.com|unsplash\.com|example\.com|angular\.dev/i
const externalResourceNoisePattern = /get activity resource error .*Failed to fetch/i

// These cases share one websocket server and each owns multiple browser contexts.
test.describe.configure({mode: 'default'})

type Diagnostics = {
  readonly fatal: string[]
}

type SelectionState = {
  readonly model: any
  readonly recalculated: any
  readonly phase: string
  readonly eventComposing: boolean
  readonly focusInsideEditor: boolean
  readonly nativeRangeCount: number
  readonly nativeAnchorBlockId: string | null
  readonly nativeFocusBlockId: string | null
  readonly text: string | null
  readonly renderedText: string | null
  readonly hostConnected: boolean
  readonly mounted: boolean
  readonly visible: boolean
}

async function routeCollaborationSocket(page: Page, room: string): Promise<void> {
  await page.addInitScript(({port, roomName}) => {
    const NativeWebSocket = window.WebSocket
    window.WebSocket = new Proxy(NativeWebSocket, {
      construct(target, args) {
        const url = new URL(String(args[0]))
        if (url.hostname !== '196.168.1.153' || url.port !== '1234') {
          return Reflect.construct(target, args)
        }
        url.protocol = 'ws:'
        url.hostname = '127.0.0.1'
        url.port = String(port)
        url.pathname = `/${roomName}`
        args[0] = url.toString()
        return Reflect.construct(target, args)
      },
    })
  }, {port: websocketPort, roomName: room})
}

function observeDiagnostics(page: Page, pageIndex: number): Diagnostics {
  const diagnostics: Diagnostics = {fatal: []}
  const record = (detail: string) => {
    if (diagnostics.fatal.includes(detail) || diagnostics.fatal.length >= 30) return
    diagnostics.fatal.push(detail)
  }
  page.on('pageerror', error => {
    const detail = error.stack ?? error.message
    if (!externalEmbedPattern.test(detail) && fatalConsolePattern.test(detail)) {
      record(`page ${pageIndex}: ${detail}`)
    }
  })
  page.on('console', message => {
    const detail = message.text()
    const source = message.location().url
    if (
      !externalEmbedPattern.test(`${source} ${detail}`) &&
      !externalResourceNoisePattern.test(detail) &&
      fatalConsolePattern.test(detail)
    ) {
      record(`page ${pageIndex}: ${detail}`)
    }
  })
  return diagnostics
}

async function waitForEditor(page: Page): Promise<void> {
  await page.waitForFunction((selector) => {
    const element = document.querySelector(selector)
    const debug = (window as unknown as {
      ng?: {getComponent: (target: Element) => {doc?: {isInitialized?: boolean}}}
    }).ng
    return !!element && !!debug?.getComponent(element)?.doc?.isInitialized
  }, editorSelector)
}

async function waitForProvider(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const root = document.querySelector('bc-root')
    const debug = (window as unknown as {
      ng?: {getComponent: (target: Element) => {provider?: {wsconnected?: boolean}}}
    }).ng
    return !!root && debug?.getComponent(root)?.provider?.wsconnected === true
  })
}

async function setProviderConnected(page: Page, connected: boolean): Promise<void> {
  await page.evaluate((shouldConnect) => {
    const root = document.querySelector('bc-root')
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {
        provider?: {
          wsconnected?: boolean
          connect: () => void
          disconnect: () => void
        }
      }}
    }).ng
    const provider = root ? debug.getComponent(root).provider : undefined
    if (!provider) throw new Error('collaboration provider is unavailable')
    shouldConnect ? provider.connect() : provider.disconnect()
  }, connected)

  if (connected) {
    await waitForProvider(page)
    return
  }
  await page.waitForFunction(() => {
    const root = document.querySelector('bc-root')
    const debug = (window as unknown as {
      ng?: {getComponent: (target: Element) => {provider?: {wsconnected?: boolean}}}
    }).ng
    return !!root && debug?.getComponent(root)?.provider?.wsconnected === false
  })
}

async function connectPage(page: Page, initialize: boolean): Promise<void> {
  await page.goto('/')
  if (initialize) {
    await page.getByRole('button', {name: '初始化', exact: true}).click()
    await waitForEditor(page)
  }
  await page.getByRole('button', {name: '进入协同', exact: true}).click()
  await waitForProvider(page)
  await waitForEditor(page)
}

async function prepareSharedParagraph(page: Page, text: string): Promise<string> {
  return page.evaluate(({selector, value}) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const candidates = Array.from(
      editor!.querySelectorAll<HTMLElement>('p.paragraph-block[data-block-id]'),
    )
    const target = candidates.find(element => {
      const blockId = element.dataset['blockId']
      return !!blockId && doc.model.getParentId(blockId) === doc.rootId
    })
    const blockId = target?.dataset['blockId']
    if (!blockId) throw new Error('No mounted root paragraph is available')

    const length = doc.model.getTextLength(blockId)
    doc.selection.blur()
    doc.crud.undoManager.stopCapturing()
    doc.crud.applyTextDelta(blockId, [
      ...(length ? [{delete: length}] : []),
      ...(value ? [{insert: value}] : []),
    ])
    doc.crud.undoManager.clearHistory()
    return blockId
  }, {selector: editorSelector, value: text})
}

async function prepareAdjacentParagraphs(
  page: Page,
  texts: readonly [string, string, string],
): Promise<[string, string, string]> {
  const ids = await page.evaluate(({selector, values}) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const snapshots = values.map((value: string) =>
      doc.schemas.createSnapshot('paragraph', [[{insert: value}]]),
    )

    doc.selection.blur()
    doc.crud.undoManager.stopCapturing()
    const insertedIds = doc.crud.insertBlockSnapshots(doc.rootId, 0, snapshots)
    doc.crud.undoManager.clearHistory()
    doc.virtualization?.ensureViewMounted?.(insertedIds)
    return insertedIds as string[]
  }, {selector: editorSelector, values: texts})
  if (ids.length !== 3) throw new Error(`Expected three paragraphs, received ${ids.length}`)
  return [ids[0], ids[1], ids[2]]
}

async function prepareColumnsParagraphs(
  page: Page,
  texts: readonly [string, string, string],
): Promise<{
  columnsId: string
  columnIds: [string, string, string]
  paragraphIds: [string, string, string]
}> {
  return page.evaluate(({selector, values}) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const columns = doc.schemas.createSnapshot('columns', [values.length])
    const paragraphIds: string[] = []
    const columnIds: string[] = []

    columns.children.forEach((column: any, index: number) => {
      const paragraph = doc.schemas.createSnapshot('paragraph', [[{insert: values[index]}]])
      column.children = [paragraph]
      columnIds.push(column.id)
      paragraphIds.push(paragraph.id)
    })

    doc.selection.blur()
    doc.crud.undoManager.stopCapturing()
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [columns])
    doc.crud.undoManager.clearHistory()
    doc.virtualization?.ensureViewMounted?.([columns.id])

    return {
      columnsId: columns.id,
      columnIds,
      paragraphIds,
    }
  }, {selector: editorSelector, values: texts}) as Promise<{
    columnsId: string
    columnIds: [string, string, string]
    paragraphIds: [string, string, string]
  }>
}

async function blockText(page: Page, blockId: string): Promise<string | null> {
  return page.evaluate(({selector, id}) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const children = doc.model.getYBlock(id)?.get('children')
    return children?.toString?.() ?? null
  }, {selector: editorSelector, id: blockId})
}

async function waitForBlockText(page: Page, blockId: string, text: string | null): Promise<void> {
  await expect.poll(() => blockText(page, blockId), {timeout: 10_000}).toBe(text)
}

async function setCaret(page: Page, blockId: string, offset: number): Promise<void> {
  await page.evaluate(async ({selector, id, index}) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    if (!doc.vm.get(id) && doc.virtualization?.scrollToBlock) {
      await doc.virtualization.scrollToBlock(id)
    }
    const block = doc.getBlockById(id)
    doc.selection.setCursorAt(block, index)
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  }, {selector: editorSelector, id: blockId, index: offset})
}

async function setTextRange(
  page: Page,
  anchorBlockId: string,
  anchorOffset: number,
  headBlockId: string,
  headOffset: number,
  commonParentBlockId?: string,
): Promise<void> {
  await page.evaluate(async ({
    selector,
    anchorId,
    anchorIndex,
    headId,
    headIndex,
    commonParentId,
  }) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    doc.virtualization?.ensureViewMounted?.([anchorId, headId])
    doc.selection.replay({
      anchor: {blockId: anchorId, type: 'text', offset: anchorIndex},
      head: {blockId: headId, type: 'text', offset: headIndex},
      commonParent: commonParentId ?? doc.rootId,
    })
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  }, {
    selector: editorSelector,
    anchorId: anchorBlockId,
    anchorIndex: anchorOffset,
    headId: headBlockId,
    headIndex: headOffset,
    commonParentId: commonParentBlockId,
  })
}

async function dispatchComposition(
  page: Page,
  blockId: string,
  type: 'compositionstart' | 'compositionend',
  data: string,
): Promise<{defaultPrevented: boolean; phase: string}> {
  return page.evaluate(({selector, id, eventType, eventData}) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const target = doc.model.exists(id)
      ? doc.getBlockById(id).containerElement
      : doc.root.hostElement
    const event = new CompositionEvent(eventType, {
      bubbles: true,
      cancelable: true,
      data: eventData,
    })
    target.dispatchEvent(event)
    return {
      defaultPrevented: event.defaultPrevented,
      phase: doc.inputManger.compositionSession.phase,
    }
  }, {selector: editorSelector, id: blockId, eventType: type, eventData: data})
}

async function insertRemoteText(
  page: Page,
  blockId: string,
  offset: number,
  text: string,
): Promise<void> {
  await page.evaluate(({selector, id, index, value}) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    doc.crud.undoManager.stopCapturing()
    doc.crud.applyTextDelta(id, [
      ...(index ? [{retain: index}] : []),
      {insert: value},
    ])
  }, {selector: editorSelector, id: blockId, index: offset, value: text})
}

async function tryInsertRemoteText(
  page: Page,
  blockId: string,
  offset: number,
  text: string,
): Promise<string | null> {
  return page.evaluate(({selector, id, index, value}) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    if (!doc.model.exists(id)) return null
    try {
      const textLength = doc.model.getTextLength(id)
      const insertionOffset = Math.max(0, Math.min(index, textLength))
      doc.crud.undoManager.stopCapturing()
      doc.crud.applyTextDelta(id, [
        ...(insertionOffset ? [{retain: insertionOffset}] : []),
        {insert: value},
      ])
      return null
    } catch (error) {
      return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    }
  }, {selector: editorSelector, id: blockId, index: offset, value: text})
}

async function runHistoryPulse(
  page: Page,
  blockId: string,
  round: number,
): Promise<string | null> {
  return page.evaluate(({selector, id, iteration}) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    if (!doc.model.exists(id)) return `history target missing: ${id}`
    try {
      doc.virtualization?.ensureViewMounted?.([id])
      const block = doc.getBlockById(id)
      const offset = doc.model.getTextLength(id)
      doc.selection.setCursorAt(block, offset)
      doc.crud.undoManager.stopCapturing()
      doc.crud.undoManager.captureSelectionBeforeChange()
      doc.crud.applyTextDelta(id, [
        ...(offset ? [{retain: offset}] : []),
        {insert: `C${iteration}`},
      ])

      if (iteration % 3 === 0) {
        doc.crud.undoManager.undo()
      } else if (iteration % 3 === 1) {
        doc.crud.undoManager.undo()
        doc.crud.undoManager.redo()
      } else {
        doc.crud.undoManager.undo()
        doc.crud.undoManager.redo()
        doc.crud.undoManager.undo()
      }
      return null
    } catch (error) {
      return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    }
  }, {selector: editorSelector, id: blockId, iteration: round})
}

async function moveRootBlockToEnd(page: Page, blockId: string): Promise<void> {
  await page.evaluate(({selector, id}) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const sourceIndex = doc.model.indexInParent(id)
    const rootLength = doc.model.getChildrenIds(doc.rootId).length
    if (sourceIndex < 0 || rootLength < 2) throw new Error('Cannot move collaboration target')
    doc.crud.undoManager.stopCapturing()
    doc.crud.moveBlocks(doc.rootId, sourceIndex, 1, doc.rootId, rootLength - 1)
  }, {selector: editorSelector, id: blockId})
}

async function deleteBlock(page: Page, blockId: string): Promise<void> {
  await page.evaluate(({selector, id}) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    doc.crud.undoManager.stopCapturing()
    doc.crud.deleteBlockById(id)
  }, {selector: editorSelector, id: blockId})
}

async function scrollToTop(page: Page): Promise<void> {
  await page.evaluate((selector) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const container = doc.scrollContainer as HTMLElement | null
    if (!container) return
    container.scrollTop = 0
    container.dispatchEvent(new Event('scroll'))
  }, editorSelector)
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
}

async function inspectSelection(page: Page, blockId: string): Promise<SelectionState> {
  return page.evaluate(({selector, id}) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const nativeSelection = document.getSelection()
    const blockIdForNode = (node: Node | null): string | null => {
      if (!node) return null
      const element = node.nodeType === Node.ELEMENT_NODE
        ? node as Element
        : node.parentElement
      return element?.closest<HTMLElement>('[data-block-id]')?.dataset['blockId'] ?? null
    }
    const block = doc.model.exists(id) ? doc.vm.get(id)?.instance ?? null : null
    const container = doc.scrollContainer as HTMLElement | null
    const rect = block?.hostElement.getBoundingClientRect() ?? null
    const viewport = container?.getBoundingClientRect() ?? null
    let recalculated: any = null
    try {
      recalculated = doc.selection.recalculate(false, {isComposing: true}).value?.toJSON() ?? null
    } catch {
      recalculated = null
    }
    const active = document.activeElement
    return {
      model: doc.selection.value?.toJSON() ?? null,
      recalculated,
      phase: doc.inputManger.compositionSession.phase,
      eventComposing: doc.event.status.isComposing,
      focusInsideEditor: !!active && (
        active === doc.root.hostElement || doc.root.hostElement.contains(active)
      ),
      nativeRangeCount: nativeSelection?.rangeCount ?? 0,
      nativeAnchorBlockId: blockIdForNode(nativeSelection?.anchorNode ?? null),
      nativeFocusBlockId: blockIdForNode(nativeSelection?.focusNode ?? null),
      text: doc.model.getYBlock(id)?.get('children')?.toString?.() ?? null,
      renderedText: block?.containerElement.textContent?.replaceAll('\u200b', '') ?? null,
      hostConnected: block?.hostElement.isConnected ?? false,
      mounted: doc.vm.getMountedRootChildIds().includes(id),
      visible: !!rect && !!viewport && rect.bottom > viewport.top && rect.top < viewport.bottom,
    }
  }, {selector: editorSelector, id: blockId})
}

async function waitForRemoteCursor(page: Page, blockId: string): Promise<void> {
  await expect.poll(
    () => page.locator(`[data-block-id="${blockId}"] .blockcraft-cursor`).count(),
    {timeout: 10_000},
  ).toBeGreaterThan(0)
}

async function rootIndex(page: Page, blockId: string): Promise<{index: number; length: number}> {
  return page.evaluate(({selector, id}) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const ids = doc.model.getChildrenIds(doc.rootId) as string[]
    return {index: ids.indexOf(id), length: ids.length}
  }, {selector: editorSelector, id: blockId})
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    )
  }
  return value
}

async function snapshotFingerprint(page: Page): Promise<string> {
  const snapshot = await page.evaluate((selector) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: {exportSnapshot: () => unknown}}}
    }).ng
    return debug.getComponent(editor!).doc.exportSnapshot()
  }, editorSelector)
  return JSON.stringify(stableValue(snapshot))
}

async function waitForSnapshotConvergence(pages: readonly Page[]): Promise<void> {
  let previous = ''
  let stablePasses = 0
  await expect.poll(async () => {
    const snapshots = await Promise.all(pages.map(snapshotFingerprint))
    if (new Set(snapshots).size === 1) {
      stablePasses = snapshots[0] === previous ? stablePasses + 1 : 1
      previous = snapshots[0]
    } else {
      stablePasses = 0
      previous = ''
    }
    return stablePasses
  }, {
    timeout: 30_000,
    intervals: [100, 200, 300, 500],
  }).toBeGreaterThanOrEqual(2)
}

async function inspectRuntimeHealth(page: Page): Promise<{
  compositionPhase: string
  eventComposing: boolean
  selectionAlive: boolean
  graphErrors: string[]
}> {
  return page.evaluate((selector) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const selection = doc.selection.value?.toJSON() ?? null
    const selectionIds = selection
      ? [
          selection.anchor.blockId,
          selection.head.blockId,
          selection.anchor.tableId,
          selection.head.tableId,
        ].filter((id): id is string => !!id)
      : []
    const graphErrors: string[] = []
    const seen = new Set<string>()
    const visit = (blockId: string) => {
      if (seen.has(blockId)) {
        graphErrors.push(`duplicate reachable block ${blockId}`)
        return
      }
      seen.add(blockId)
      const children = doc.model.getChildrenIds(blockId) as string[]
      if (new Set(children).size !== children.length) {
        graphErrors.push(`duplicate children in ${blockId}`)
      }
      children.forEach(childId => {
        if (!doc.model.exists(childId)) graphErrors.push(`missing child ${blockId} -> ${childId}`)
        if (doc.model.getParentId(childId) !== blockId) {
          graphErrors.push(`wrong parent for ${childId}`)
        }
        visit(childId)
      })
    }
    visit(doc.rootId)

    return {
      compositionPhase: doc.inputManger.compositionSession.phase,
      eventComposing: doc.event.status.isComposing,
      selectionAlive: selectionIds.every(id => doc.model.exists(id)),
      graphErrors,
    }
  }, editorSelector)
}

test('active IME selection survives remote text, move, undo and delete races', async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'the collaboration IME race runs once in Chromium')
  test.setTimeout(90_000)

  const room = `input-race-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const contexts: BrowserContext[] = []
  const pages: Page[] = []
  const diagnostics: Diagnostics[] = []

  try {
    for (let index = 0; index < 2; index++) {
      const context = await browser.newContext({baseURL, viewport: {width: 1280, height: 720}})
      const page = await context.newPage()
      contexts.push(context)
      pages.push(page)
      diagnostics.push(observeDiagnostics(page, index))
      await routeCollaborationSocket(page, room)
    }

    const [local, remote] = pages
    await connectPage(local, true)
    await connectPage(remote, false)

    const blockId = await prepareSharedParagraph(local, 'alphaomega')
    await waitForBlockText(remote, blockId, 'alphaomega')

    // Keep a real remote caret before the local IME insertion point. It must
    // survive both the deferred text patch and the composing block rerender.
    await setCaret(remote, blockId, 4)
    await waitForRemoteCursor(local, blockId)
    await setCaret(local, blockId, 5)
    await waitForRemoteCursor(remote, blockId)

    expect((await dispatchComposition(local, blockId, 'compositionstart', '')).phase).toBe('active')
    await insertRemoteText(remote, blockId, 5, 'REMOTE')
    await waitForBlockText(local, blockId, 'alphaREMOTEomega')
    await local.waitForTimeout(120)

    const duringTextRace = await inspectSelection(local, blockId)
    expect(duringTextRace.phase).toBe('active')
    expect(duringTextRace.eventComposing).toBe(true)
    expect(duringTextRace.model?.anchor).toEqual({blockId, type: 'text', offset: 5})
    expect(duringTextRace.recalculated?.anchor).toEqual({blockId, type: 'text', offset: 5})
    expect(duringTextRace.nativeRangeCount).toBe(1)
    expect(duringTextRace.nativeAnchorBlockId).toBe(blockId)
    expect(duringTextRace.renderedText).toBe('alphaomega')
    expect(duringTextRace.focusInsideEditor).toBe(true)
    await waitForRemoteCursor(local, blockId)

    await dispatchComposition(local, blockId, 'compositionend', '中')
    await Promise.all([
      waitForBlockText(local, blockId, 'alphaREMOTE中omega'),
      waitForBlockText(remote, blockId, 'alphaREMOTE中omega'),
    ])

    const afterTextRace = await inspectSelection(local, blockId)
    expect(afterTextRace.phase).toBe('idle')
    expect(afterTextRace.eventComposing).toBe(false)
    expect(afterTextRace.model).toEqual(afterTextRace.recalculated)
    expect(afterTextRace.model?.anchor).toEqual({blockId, type: 'text', offset: 12})
    expect(afterTextRace.nativeAnchorBlockId).toBe(blockId)
    expect(afterTextRace.focusInsideEditor).toBe(true)
    await waitForRemoteCursor(local, blockId)

    await local.keyboard.press('ControlOrMeta+z')
    await Promise.all([
      waitForBlockText(local, blockId, 'alphaREMOTEomega'),
      waitForBlockText(remote, blockId, 'alphaREMOTEomega'),
    ])
    const afterTextUndo = await inspectSelection(local, blockId)
    expect(afterTextUndo.model).toEqual(afterTextUndo.recalculated)
    expect(afterTextUndo.model?.anchor).toEqual({blockId, type: 'text', offset: 11})
    expect(afterTextUndo.nativeAnchorBlockId).toBe(blockId)
    expect(afterTextUndo.focusInsideEditor).toBe(true)

    await local.keyboard.type('!')
    await Promise.all([
      waitForBlockText(local, blockId, 'alphaREMOTE!omega'),
      waitForBlockText(remote, blockId, 'alphaREMOTE!omega'),
    ])

    // Move the active composing block to the far virtualized edge. Selection
    // pinning must retain the host until compositionend and Undo can restore it.
    expect(await prepareSharedParagraph(local, 'movetarget')).toBe(blockId)
    await waitForBlockText(remote, blockId, 'movetarget')
    await setCaret(local, blockId, 4)
    const beforeMoveComposition = await inspectSelection(local, blockId)
    expect(beforeMoveComposition.model).toEqual(beforeMoveComposition.recalculated)
    expect(beforeMoveComposition.model?.anchor).toEqual({blockId, type: 'text', offset: 4})
    expect(beforeMoveComposition.nativeAnchorBlockId).toBe(blockId)
    expect((await dispatchComposition(local, blockId, 'compositionstart', '')).phase).toBe('active')
    await moveRootBlockToEnd(remote, blockId)
    await expect.poll(async () => {
      const position = await rootIndex(local, blockId)
      return position.index >= position.length - 3
    }, {timeout: 10_000}).toBe(true)

    const afterMoveBeforeScroll = await inspectSelection(local, blockId)
    expect(
      afterMoveBeforeScroll.nativeAnchorBlockId,
      JSON.stringify(afterMoveBeforeScroll),
    ).toBe(blockId)
    await scrollToTop(local)

    const duringMove = await inspectSelection(local, blockId)
    expect(duringMove.phase).toBe('active')
    expect(duringMove.hostConnected).toBe(true)
    expect(duringMove.mounted).toBe(true)
    expect(duringMove.nativeAnchorBlockId, JSON.stringify(duringMove)).toBe(blockId)

    await dispatchComposition(local, blockId, 'compositionend', '移')
    await Promise.all([
      waitForBlockText(local, blockId, 'move移target'),
      waitForBlockText(remote, blockId, 'move移target'),
    ])
    await local.keyboard.press('ControlOrMeta+z')
    await Promise.all([
      waitForBlockText(local, blockId, 'movetarget'),
      waitForBlockText(remote, blockId, 'movetarget'),
    ])
    await expect.poll(async () => (await inspectSelection(local, blockId)).visible, {
      timeout: 10_000,
    }).toBe(true)
    const afterMoveUndo = await inspectSelection(local, blockId)
    expect(afterMoveUndo.model).toEqual(afterMoveUndo.recalculated)
    expect(afterMoveUndo.model?.anchor).toEqual({blockId, type: 'text', offset: 4})
    expect(afterMoveUndo.nativeAnchorBlockId).toBe(blockId)

    // If the remote peer deletes the composing host, the pending glyph must be
    // discarded and neither native nor model selection may retain the dead ID.
    await dispatchComposition(local, blockId, 'compositionstart', '')
    await deleteBlock(remote, blockId)
    await waitForBlockText(local, blockId, null)
    await dispatchComposition(local, blockId, 'compositionend', '丢')
    await local.waitForTimeout(120)
    const afterDelete = await inspectSelection(local, blockId)
    expect(afterDelete.phase).toBe('idle')
    expect(afterDelete.eventComposing).toBe(false)
    expect(afterDelete.model).not.toBeNull()
    expect(afterDelete.model?.anchor?.blockId).not.toBe(blockId)
    expect(afterDelete.model?.head?.blockId).not.toBe(blockId)
    expect(afterDelete.nativeAnchorBlockId).not.toBe(blockId)
    expect(afterDelete.focusInsideEditor).toBe(true)

    const beforeContinuedInput = await snapshotFingerprint(local)
    expect(beforeContinuedInput).not.toContain('丢')
    await local.keyboard.type('?')
    await expect.poll(async () => {
      const [localSnapshot, remoteSnapshot] = await Promise.all([
        snapshotFingerprint(local),
        snapshotFingerprint(remote),
      ])
      return localSnapshot === remoteSnapshot && localSnapshot !== beforeContinuedInput
    }, {timeout: 10_000}).toBe(true)

    expect(diagnostics.flatMap(result => result.fatal)).toEqual([])
  } finally {
    await Promise.all(contexts.map(context => context.close()))
  }
})

test('cross-paragraph IME replacement remains atomic with concurrent remote input', async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'the collaboration IME race runs once in Chromium')
  test.setTimeout(90_000)

  const room = `cross-input-race-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const contexts: BrowserContext[] = []
  const pages: Page[] = []
  const diagnostics: Diagnostics[] = []

  try {
    for (let index = 0; index < 2; index++) {
      const context = await browser.newContext({baseURL, viewport: {width: 1280, height: 720}})
      const page = await context.newPage()
      contexts.push(context)
      pages.push(page)
      diagnostics.push(observeDiagnostics(page, index))
      await routeCollaborationSocket(page, room)
    }

    const [local, remote] = pages
    await connectPage(local, true)
    await connectPage(remote, false)

    const [firstId, middleId, lastId] = await prepareAdjacentParagraphs(
      local,
      ['alpha', 'middle', 'omega'],
    )
    await Promise.all([
      waitForBlockText(remote, firstId, 'alpha'),
      waitForBlockText(remote, middleId, 'middle'),
      waitForBlockText(remote, lastId, 'omega'),
    ])

    await setTextRange(local, firstId, 2, lastId, 3)
    const beforeComposition = await inspectSelection(local, firstId)
    expect(beforeComposition.model).toEqual(beforeComposition.recalculated)
    expect(beforeComposition.model).toEqual({
      anchor: {blockId: firstId, type: 'text', offset: 2},
      head: {blockId: lastId, type: 'text', offset: 3},
      commonParent: (beforeComposition.model as any).commonParent,
    })
    expect(beforeComposition.nativeAnchorBlockId).toBe(firstId)
    expect(beforeComposition.nativeFocusBlockId).toBe(lastId)

    expect((await dispatchComposition(local, firstId, 'compositionstart', '')).phase).toBe('active')
    await Promise.all([
      waitForBlockText(local, firstId, 'alga'),
      waitForBlockText(remote, firstId, 'alga'),
      waitForBlockText(local, middleId, null),
      waitForBlockText(remote, middleId, null),
      waitForBlockText(local, lastId, null),
      waitForBlockText(remote, lastId, null),
    ])

    const afterSynchronousReplace = await inspectSelection(local, firstId)
    expect(afterSynchronousReplace.phase).toBe('active')
    expect(afterSynchronousReplace.model).toEqual(afterSynchronousReplace.recalculated)
    expect(afterSynchronousReplace.model?.anchor).toEqual({
      blockId: firstId,
      type: 'text',
      offset: 2,
    })
    expect(afterSynchronousReplace.model?.head).toEqual(afterSynchronousReplace.model?.anchor)
    expect(afterSynchronousReplace.nativeAnchorBlockId).toBe(firstId)
    expect(afterSynchronousReplace.nativeFocusBlockId).toBe(firstId)
    expect(afterSynchronousReplace.focusInsideEditor).toBe(true)

    await insertRemoteText(remote, firstId, 2, 'REMOTE')
    await waitForBlockText(local, firstId, 'alREMOTEga')
    const duringRemoteInput = await inspectSelection(local, firstId)
    expect(duringRemoteInput.phase).toBe('active')
    expect(duringRemoteInput.renderedText).toBe('alga')
    expect(duringRemoteInput.nativeAnchorBlockId).toBe(firstId)

    await dispatchComposition(local, firstId, 'compositionend', '中')
    await Promise.all([
      waitForBlockText(local, firstId, 'alREMOTE中ga'),
      waitForBlockText(remote, firstId, 'alREMOTE中ga'),
    ])

    await local.keyboard.press('ControlOrMeta+z')
    await Promise.all([
      waitForBlockText(local, middleId, 'middle'),
      waitForBlockText(remote, middleId, 'middle'),
      waitForBlockText(local, lastId, 'omega'),
      waitForBlockText(remote, lastId, 'omega'),
    ])
    await expect.poll(async () => {
      const [localSnapshot, remoteSnapshot] = await Promise.all([
        snapshotFingerprint(local),
        snapshotFingerprint(remote),
      ])
      return localSnapshot === remoteSnapshot
    }, {timeout: 10_000}).toBe(true)

    const restoredFirstText = await blockText(local, firstId)
    expect(restoredFirstText).toContain('alpha')
    expect(restoredFirstText).toContain('REMOTE')
    expect(restoredFirstText).not.toContain('中')
    const afterUndo = await inspectSelection(local, firstId)
    expect(afterUndo.model).toEqual(afterUndo.recalculated)
    expect(afterUndo.model?.anchor).toEqual({blockId: firstId, type: 'text', offset: 2})
    expect(afterUndo.model?.head).toEqual({blockId: lastId, type: 'text', offset: 3})
    expect(afterUndo.nativeAnchorBlockId).toBe(firstId)
    expect(afterUndo.nativeFocusBlockId).toBe(lastId)
    expect(afterUndo.focusInsideEditor).toBe(true)

    expect(diagnostics.flatMap(result => result.fatal)).toEqual([])
  } finally {
    await Promise.all(contexts.map(context => context.close()))
  }
})

test('cross-column IME preserves the tail column and restores the scoped selection', async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'the collaboration IME race runs once in Chromium')
  test.setTimeout(90_000)

  const room = `cross-column-input-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const contexts: BrowserContext[] = []
  const pages: Page[] = []
  const diagnostics: Diagnostics[] = []

  try {
    for (let index = 0; index < 2; index++) {
      const context = await browser.newContext({baseURL, viewport: {width: 1280, height: 720}})
      const page = await context.newPage()
      contexts.push(context)
      pages.push(page)
      diagnostics.push(observeDiagnostics(page, index))
      await routeCollaborationSocket(page, room)
    }

    const [local, remote] = pages
    await connectPage(local, true)
    await connectPage(remote, false)

    const {
      columnsId,
      columnIds: [, middleColumnId],
      paragraphIds: [firstId, middleId, lastId],
    } = await prepareColumnsParagraphs(local, ['alpha', 'middle', 'omega'])
    await Promise.all([
      waitForBlockText(remote, firstId, 'alpha'),
      waitForBlockText(remote, middleId, 'middle'),
      waitForBlockText(remote, lastId, 'omega'),
    ])

    await setTextRange(local, firstId, 2, lastId, 3, columnsId)
    const beforeComposition = await inspectSelection(local, firstId)
    expect(beforeComposition.model).toEqual(beforeComposition.recalculated)
    expect(beforeComposition.model).toEqual({
      anchor: {blockId: firstId, type: 'text', offset: 2},
      head: {blockId: lastId, type: 'text', offset: 3},
      commonParent: columnsId,
    })
    expect(beforeComposition.nativeAnchorBlockId).toBe(firstId)
    expect(beforeComposition.nativeFocusBlockId).toBe(lastId)

    expect((await dispatchComposition(local, firstId, 'compositionstart', '')).phase).toBe('active')
    await Promise.all([
      waitForBlockText(local, firstId, 'al'),
      waitForBlockText(remote, firstId, 'al'),
      waitForBlockText(local, middleId, null),
      waitForBlockText(remote, middleId, null),
      waitForBlockText(local, lastId, 'ga'),
      waitForBlockText(remote, lastId, 'ga'),
    ])

    expect(await blockText(local, middleColumnId)).toBeNull()
    const afterSynchronousReplace = await inspectSelection(local, firstId)
    expect(afterSynchronousReplace.phase).toBe('active')
    expect(afterSynchronousReplace.model).toEqual(afterSynchronousReplace.recalculated)
    expect(afterSynchronousReplace.model?.anchor).toEqual({
      blockId: firstId,
      type: 'text',
      offset: 2,
    })
    expect(afterSynchronousReplace.model?.head).toEqual(afterSynchronousReplace.model?.anchor)
    expect(afterSynchronousReplace.nativeAnchorBlockId).toBe(firstId)
    expect(afterSynchronousReplace.nativeFocusBlockId).toBe(firstId)
    expect(afterSynchronousReplace.focusInsideEditor).toBe(true)

    await insertRemoteText(remote, firstId, 2, 'REMOTE')
    await waitForBlockText(local, firstId, 'alREMOTE')
    const duringRemoteInput = await inspectSelection(local, firstId)
    expect(duringRemoteInput.phase).toBe('active')
    expect(duringRemoteInput.renderedText).toBe('al')
    expect(duringRemoteInput.nativeAnchorBlockId).toBe(firstId)

    await dispatchComposition(local, firstId, 'compositionend', '中')
    await Promise.all([
      waitForBlockText(local, firstId, 'alREMOTE中'),
      waitForBlockText(remote, firstId, 'alREMOTE中'),
      waitForBlockText(local, lastId, 'ga'),
      waitForBlockText(remote, lastId, 'ga'),
    ])

    await local.keyboard.press('ControlOrMeta+z')
    await Promise.all([
      waitForBlockText(local, middleId, 'middle'),
      waitForBlockText(remote, middleId, 'middle'),
      waitForBlockText(local, lastId, 'omega'),
      waitForBlockText(remote, lastId, 'omega'),
    ])
    await expect.poll(async () => {
      const [localSnapshot, remoteSnapshot] = await Promise.all([
        snapshotFingerprint(local),
        snapshotFingerprint(remote),
      ])
      return localSnapshot === remoteSnapshot
    }, {timeout: 10_000}).toBe(true)

    const restoredFirstText = await blockText(local, firstId)
    expect(restoredFirstText).toContain('alpha')
    expect(restoredFirstText).toContain('REMOTE')
    expect(restoredFirstText).not.toContain('中')
    const afterUndo = await inspectSelection(local, firstId)
    expect(afterUndo.model).toEqual(afterUndo.recalculated)
    expect(afterUndo.model?.anchor).toEqual({blockId: firstId, type: 'text', offset: 2})
    expect(afterUndo.model?.head).toEqual({blockId: lastId, type: 'text', offset: 3})
    expect(afterUndo.model?.commonParent).toBe(columnsId)
    expect(afterUndo.nativeAnchorBlockId).toBe(firstId)
    expect(afterUndo.nativeFocusBlockId).toBe(lastId)
    expect(afterUndo.focusInsideEditor).toBe(true)

    expect(diagnostics.flatMap(result => result.fatal)).toEqual([])
  } finally {
    await Promise.all(contexts.map(context => context.close()))
  }
})

test('cross-column IME keeps remote tail edits and scope movement through undo', async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'the collaboration IME race runs once in Chromium')
  test.setTimeout(90_000)

  const room = `cross-column-move-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const contexts: BrowserContext[] = []
  const pages: Page[] = []
  const diagnostics: Diagnostics[] = []

  try {
    for (let index = 0; index < 2; index++) {
      const context = await browser.newContext({baseURL, viewport: {width: 1280, height: 720}})
      const page = await context.newPage()
      contexts.push(context)
      pages.push(page)
      diagnostics.push(observeDiagnostics(page, index))
      await routeCollaborationSocket(page, room)
    }

    const [local, remote] = pages
    await connectPage(local, true)
    await connectPage(remote, false)

    const {
      columnsId,
      paragraphIds: [firstId, middleId, lastId],
    } = await prepareColumnsParagraphs(local, ['alpha', 'middle', 'omega'])
    await Promise.all([
      waitForBlockText(remote, firstId, 'alpha'),
      waitForBlockText(remote, middleId, 'middle'),
      waitForBlockText(remote, lastId, 'omega'),
    ])

    await setTextRange(local, firstId, 2, lastId, 3, columnsId)
    expect((await dispatchComposition(local, firstId, 'compositionstart', '')).phase).toBe('active')
    await Promise.all([
      waitForBlockText(remote, firstId, 'al'),
      waitForBlockText(remote, middleId, null),
      waitForBlockText(remote, lastId, 'ga'),
    ])

    await insertRemoteText(remote, lastId, 1, 'TAIL')
    await Promise.all([
      waitForBlockText(local, lastId, 'gTAILa'),
      waitForBlockText(remote, lastId, 'gTAILa'),
    ])
    await moveRootBlockToEnd(remote, columnsId)
    await expect.poll(async () => {
      const position = await rootIndex(local, columnsId)
      return position.index >= position.length - 3
    }, {timeout: 10_000}).toBe(true)

    await scrollToTop(local)
    const duringRemoteStructure = await inspectSelection(local, firstId)
    expect(duringRemoteStructure.phase).toBe('active')
    expect(duringRemoteStructure.renderedText).toBe('al')
    expect(duringRemoteStructure.hostConnected).toBe(true)
    expect(duringRemoteStructure.nativeAnchorBlockId).toBe(firstId)
    expect(duringRemoteStructure.focusInsideEditor).toBe(true)

    await dispatchComposition(local, firstId, 'compositionend', '中')
    await Promise.all([
      waitForBlockText(local, firstId, 'al中'),
      waitForBlockText(remote, firstId, 'al中'),
      waitForBlockText(local, lastId, 'gTAILa'),
      waitForBlockText(remote, lastId, 'gTAILa'),
    ])

    await local.keyboard.press('ControlOrMeta+z')
    await Promise.all([
      waitForBlockText(local, firstId, 'alpha'),
      waitForBlockText(remote, firstId, 'alpha'),
      waitForBlockText(local, middleId, 'middle'),
      waitForBlockText(remote, middleId, 'middle'),
    ])
    await expect.poll(async () => {
      const value = await blockText(local, lastId)
      return value?.replace('TAIL', '') === 'omega'
    }, {timeout: 10_000}).toBe(true)
    const restoredTail = await blockText(local, lastId)
    expect(restoredTail).toContain('TAIL')
    expect(restoredTail?.replace('TAIL', '')).toBe('omega')
    expect(restoredTail).not.toContain('中')
    await waitForBlockText(remote, lastId, restoredTail)

    const movedPosition = await rootIndex(local, columnsId)
    expect(movedPosition.index).toBeGreaterThanOrEqual(movedPosition.length - 3)
    const afterUndo = await inspectSelection(local, firstId)
    expect(afterUndo.model).toEqual(afterUndo.recalculated)
    expect(afterUndo.model?.anchor).toEqual({blockId: firstId, type: 'text', offset: 2})
    expect(afterUndo.model?.head).toEqual({blockId: lastId, type: 'text', offset: 3})
    expect(afterUndo.model?.commonParent).toBe(columnsId)
    expect(afterUndo.nativeAnchorBlockId).toBe(firstId)
    expect(afterUndo.nativeFocusBlockId).toBe(lastId)
    expect(afterUndo.focusInsideEditor).toBe(true)

    expect(diagnostics.flatMap(result => result.fatal)).toEqual([])
  } finally {
    await Promise.all(contexts.map(context => context.close()))
  }
})

test('cross-column IME aborts safely when the remote peer deletes its scope', async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'the collaboration IME race runs once in Chromium')
  test.setTimeout(90_000)

  const room = `cross-column-delete-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const contexts: BrowserContext[] = []
  const pages: Page[] = []
  const diagnostics: Diagnostics[] = []

  try {
    for (let index = 0; index < 2; index++) {
      const context = await browser.newContext({baseURL, viewport: {width: 1280, height: 720}})
      const page = await context.newPage()
      contexts.push(context)
      pages.push(page)
      diagnostics.push(observeDiagnostics(page, index))
      await routeCollaborationSocket(page, room)
    }

    const [local, remote] = pages
    await connectPage(local, true)
    await connectPage(remote, false)

    const {
      columnsId,
      paragraphIds: [firstId, middleId, lastId],
    } = await prepareColumnsParagraphs(local, ['alpha', 'middle', 'omega'])
    await Promise.all([
      waitForBlockText(remote, firstId, 'alpha'),
      waitForBlockText(remote, middleId, 'middle'),
      waitForBlockText(remote, lastId, 'omega'),
    ])

    await setTextRange(local, firstId, 2, lastId, 3, columnsId)
    expect((await dispatchComposition(local, firstId, 'compositionstart', '')).phase).toBe('active')
    await waitForBlockText(remote, firstId, 'al')

    await deleteBlock(remote, columnsId)
    await Promise.all([
      waitForBlockText(local, columnsId, null),
      waitForBlockText(local, firstId, null),
      waitForBlockText(local, lastId, null),
    ])
    await dispatchComposition(local, firstId, 'compositionend', '丢')
    await local.waitForTimeout(120)

    const afterScopeDelete = await inspectSelection(local, firstId)
    const deletedIds = new Set([columnsId, firstId, middleId, lastId])
    expect(afterScopeDelete.phase).toBe('idle')
    expect(afterScopeDelete.eventComposing).toBe(false)
    expect(afterScopeDelete.model).not.toBeNull()
    expect(deletedIds.has(afterScopeDelete.model?.anchor?.blockId)).toBe(false)
    expect(deletedIds.has(afterScopeDelete.model?.head?.blockId)).toBe(false)
    expect(deletedIds.has(afterScopeDelete.nativeAnchorBlockId ?? '')).toBe(false)
    expect(afterScopeDelete.focusInsideEditor).toBe(true)
    expect(await snapshotFingerprint(local)).not.toContain('丢')

    await local.keyboard.press('ControlOrMeta+z')
    await local.waitForTimeout(120)
    expect(await blockText(local, columnsId)).toBeNull()
    expect(await blockText(remote, columnsId)).toBeNull()
    const afterUndo = await inspectSelection(local, firstId)
    expect(afterUndo.model).toEqual(afterUndo.recalculated)
    expect(afterUndo.model).not.toBeNull()
    expect(deletedIds.has(afterUndo.model?.anchor?.blockId)).toBe(false)
    expect(deletedIds.has(afterUndo.model?.head?.blockId)).toBe(false)
    expect(afterUndo.focusInsideEditor).toBe(true)

    const beforeContinuedInput = await snapshotFingerprint(local)
    await local.keyboard.type('?')
    await expect.poll(async () => {
      const [localSnapshot, remoteSnapshot] = await Promise.all([
        snapshotFingerprint(local),
        snapshotFingerprint(remote),
      ])
      return localSnapshot === remoteSnapshot && localSnapshot !== beforeContinuedInput
    }, {timeout: 10_000}).toBe(true)

    expect(diagnostics.flatMap(result => result.fatal)).toEqual([])
  } finally {
    await Promise.all(contexts.map(context => context.close()))
  }
})

test('active IME remains coherent across disconnect, offline merge and reconnect', async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'the collaboration IME race runs once in Chromium')
  test.setTimeout(120_000)

  const room = `input-reconnect-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const contexts: BrowserContext[] = []
  const pages: Page[] = []
  const diagnostics: Diagnostics[] = []

  try {
    for (let index = 0; index < 2; index++) {
      const context = await browser.newContext({baseURL, viewport: {width: 1280, height: 720}})
      const page = await context.newPage()
      contexts.push(context)
      pages.push(page)
      diagnostics.push(observeDiagnostics(page, index))
      await routeCollaborationSocket(page, room)
    }

    const [local, remote] = pages
    await connectPage(local, true)
    await connectPage(remote, false)

    // Reconnect while composition is still active. The incoming remote patch
    // updates the model, while the composing DOM and caret remain stable.
    const blockId = await prepareSharedParagraph(local, 'alphaomega')
    await waitForBlockText(remote, blockId, 'alphaomega')
    await setCaret(local, blockId, 5)
    expect((await dispatchComposition(local, blockId, 'compositionstart', '')).phase).toBe('active')
    await setProviderConnected(local, false)

    await insertRemoteText(remote, blockId, 5, 'REMOTE')
    await waitForBlockText(remote, blockId, 'alphaREMOTEomega')
    expect(await blockText(local, blockId)).toBe('alphaomega')

    await setProviderConnected(local, true)
    await waitForBlockText(local, blockId, 'alphaREMOTEomega')
    const duringReconnect = await inspectSelection(local, blockId)
    expect(duringReconnect.phase).toBe('active')
    expect(duringReconnect.eventComposing).toBe(true)
    expect(duringReconnect.model?.anchor).toEqual({blockId, type: 'text', offset: 5})
    expect(duringReconnect.nativeAnchorBlockId).toBe(blockId)
    expect(duringReconnect.renderedText).toBe('alphaomega')
    expect(duringReconnect.focusInsideEditor).toBe(true)

    await dispatchComposition(local, blockId, 'compositionend', '中')
    await Promise.all([
      waitForBlockText(local, blockId, 'alphaREMOTE中omega'),
      waitForBlockText(remote, blockId, 'alphaREMOTE中omega'),
    ])
    await local.keyboard.press('ControlOrMeta+z')
    await Promise.all([
      waitForBlockText(local, blockId, 'alphaREMOTEomega'),
      waitForBlockText(remote, blockId, 'alphaREMOTEomega'),
    ])
    const afterReconnectUndo = await inspectSelection(local, blockId)
    expect(afterReconnectUndo.model).toEqual(afterReconnectUndo.recalculated)
    expect(afterReconnectUndo.nativeAnchorBlockId).toBe(blockId)
    expect(afterReconnectUndo.focusInsideEditor).toBe(true)

    // Commit the composition while offline, merge a concurrent remote insert,
    // then verify local Undo removes only the local glyph.
    const offlineBlockId = await prepareSharedParagraph(local, 'offline')
    await waitForBlockText(remote, offlineBlockId, 'offline')
    await setCaret(local, offlineBlockId, 3)
    expect((await dispatchComposition(local, offlineBlockId, 'compositionstart', '')).phase)
      .toBe('active')
    await setProviderConnected(local, false)
    await dispatchComposition(local, offlineBlockId, 'compositionend', '离')
    await waitForBlockText(local, offlineBlockId, 'off离line')
    expect(await blockText(remote, offlineBlockId)).toBe('offline')

    await insertRemoteText(remote, offlineBlockId, 3, 'REMOTE')
    await waitForBlockText(remote, offlineBlockId, 'offREMOTEline')
    await setProviderConnected(local, true)
    await waitForSnapshotConvergence(pages)

    const mergedText = await blockText(local, offlineBlockId)
    expect(mergedText).toBe(await blockText(remote, offlineBlockId))
    expect(mergedText).toMatch(/^off/)
    expect(mergedText).toContain('REMOTE')
    expect(mergedText).toContain('离')
    expect(mergedText).toMatch(/line$/)

    await local.keyboard.press('ControlOrMeta+z')
    await waitForSnapshotConvergence(pages)
    await Promise.all([
      waitForBlockText(local, offlineBlockId, 'offREMOTEline'),
      waitForBlockText(remote, offlineBlockId, 'offREMOTEline'),
    ])
    const afterOfflineUndo = await inspectSelection(local, offlineBlockId)
    expect(afterOfflineUndo.model).toEqual(afterOfflineUndo.recalculated)
    expect(afterOfflineUndo.nativeAnchorBlockId).toBe(offlineBlockId)
    expect(afterOfflineUndo.focusInsideEditor).toBe(true)

    // A remotely deleted composing host must remain deleted after reconnect;
    // the pending IME glyph is discarded and selection falls back to live data.
    const deletedBlockId = await prepareSharedParagraph(local, 'delete-me')
    await waitForBlockText(remote, deletedBlockId, 'delete-me')
    await setCaret(local, deletedBlockId, 3)
    expect((await dispatchComposition(local, deletedBlockId, 'compositionstart', '')).phase)
      .toBe('active')
    await setProviderConnected(local, false)
    await deleteBlock(remote, deletedBlockId)
    await waitForBlockText(remote, deletedBlockId, null)
    expect(await blockText(local, deletedBlockId)).toBe('delete-me')

    await setProviderConnected(local, true)
    await waitForBlockText(local, deletedBlockId, null)
    await dispatchComposition(local, deletedBlockId, 'compositionend', '丢')
    await waitForSnapshotConvergence(pages)

    const afterRemoteDelete = await inspectSelection(local, deletedBlockId)
    expect(afterRemoteDelete.phase).toBe('idle')
    expect(afterRemoteDelete.eventComposing).toBe(false)
    expect(afterRemoteDelete.model).not.toBeNull()
    expect(afterRemoteDelete.model?.anchor?.blockId).not.toBe(deletedBlockId)
    expect(afterRemoteDelete.model?.head?.blockId).not.toBe(deletedBlockId)
    expect(afterRemoteDelete.nativeAnchorBlockId).not.toBe(deletedBlockId)
    expect(afterRemoteDelete.focusInsideEditor).toBe(true)
    expect(await snapshotFingerprint(local)).not.toContain('丢')

    const health = await Promise.all(pages.map(inspectRuntimeHealth))
    health.forEach((state, index) => {
      expect(state.compositionPhase, `page ${index} composition phase`).toBe('idle')
      expect(state.eventComposing, `page ${index} event composing`).toBe(false)
      expect(state.selectionAlive, `page ${index} selection liveness`).toBe(true)
      expect(state.graphErrors, `page ${index} model graph`).toEqual([])
    })
    expect(diagnostics.flatMap(result => result.fatal)).toEqual([])
  } finally {
    await Promise.all(contexts.map(context => context.close()))
  }
})

test('cross-paragraph offline IME keeps remote edits outside the deleted range', async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'the collaboration IME race runs once in Chromium')
  test.setTimeout(120_000)

  const room = `cross-input-reconnect-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const contexts: BrowserContext[] = []
  const pages: Page[] = []
  const diagnostics: Diagnostics[] = []

  try {
    for (let index = 0; index < 2; index++) {
      const context = await browser.newContext({baseURL, viewport: {width: 1280, height: 720}})
      const page = await context.newPage()
      contexts.push(context)
      pages.push(page)
      diagnostics.push(observeDiagnostics(page, index))
      await routeCollaborationSocket(page, room)
    }

    const [local, remote] = pages
    await connectPage(local, true)
    await connectPage(remote, false)

    const [firstId, middleId, lastId] = await prepareAdjacentParagraphs(
      local,
      ['alpha', 'middle', 'omega'],
    )
    await Promise.all([
      waitForBlockText(remote, firstId, 'alpha'),
      waitForBlockText(remote, middleId, 'middle'),
      waitForBlockText(remote, lastId, 'omega'),
    ])

    await setTextRange(local, firstId, 2, lastId, 3)
    await setProviderConnected(local, false)
    expect((await dispatchComposition(local, firstId, 'compositionstart', '')).phase).toBe('active')
    await Promise.all([
      waitForBlockText(local, firstId, 'alga'),
      waitForBlockText(local, middleId, null),
      waitForBlockText(local, lastId, null),
    ])
    expect(await blockText(remote, firstId)).toBe('alpha')
    expect(await blockText(remote, middleId)).toBe('middle')
    expect(await blockText(remote, lastId)).toBe('omega')

    // Yjs resolves writes inside concurrently deleted blocks with delete-wins.
    // The first insertion is outside the local range and must survive both the
    // reconnect merge and the local Undo.
    await Promise.all([
      insertRemoteText(remote, firstId, 0, 'KEEP'),
      insertRemoteText(remote, middleId, 3, 'REMOTE'),
      insertRemoteText(remote, lastId, 1, 'TAIL'),
    ])
    await Promise.all([
      waitForBlockText(remote, firstId, 'KEEPalpha'),
      waitForBlockText(remote, middleId, 'midREMOTEdle'),
      waitForBlockText(remote, lastId, 'oTAILmega'),
    ])

    await dispatchComposition(local, firstId, 'compositionend', '中')
    await waitForBlockText(local, firstId, 'al中ga')
    await setProviderConnected(local, true)
    await waitForSnapshotConvergence(pages)

    await Promise.all([
      waitForBlockText(local, firstId, 'KEEPal中ga'),
      waitForBlockText(remote, firstId, 'KEEPal中ga'),
      waitForBlockText(local, middleId, null),
      waitForBlockText(remote, middleId, null),
      waitForBlockText(local, lastId, null),
      waitForBlockText(remote, lastId, null),
    ])
    const afterReconnect = await inspectSelection(local, firstId)
    expect(afterReconnect.phase).toBe('idle')
    expect(afterReconnect.model).toEqual(afterReconnect.recalculated)
    expect(afterReconnect.model?.anchor).toEqual({blockId: firstId, type: 'text', offset: 7})
    expect(afterReconnect.nativeAnchorBlockId).toBe(firstId)
    expect(afterReconnect.focusInsideEditor).toBe(true)

    const mergedHealth = await Promise.all(pages.map(inspectRuntimeHealth))
    mergedHealth.forEach((state, index) => {
      expect(state.selectionAlive, `page ${index} selection liveness after reconnect`).toBe(true)
      expect(state.graphErrors, `page ${index} model graph after reconnect`).toEqual([])
    })

    await local.keyboard.press('ControlOrMeta+z')
    await Promise.all([
      waitForBlockText(local, firstId, 'KEEPalpha'),
      waitForBlockText(remote, firstId, 'KEEPalpha'),
      waitForBlockText(local, middleId, 'middle'),
      waitForBlockText(remote, middleId, 'middle'),
      waitForBlockText(local, lastId, 'omega'),
      waitForBlockText(remote, lastId, 'omega'),
    ])
    await waitForSnapshotConvergence(pages)

    const afterUndo = await inspectSelection(local, firstId)
    expect(afterUndo.model).toEqual(afterUndo.recalculated)
    expect(afterUndo.model?.anchor).toEqual({blockId: firstId, type: 'text', offset: 6})
    expect(afterUndo.model?.head?.blockId).toBe(lastId)
    expect(afterUndo.model?.head?.type).toBe('text')
    expect(afterUndo.model?.head?.offset).toBe(3)
    expect(afterUndo.nativeAnchorBlockId).toBe(firstId)
    expect(afterUndo.nativeFocusBlockId).toBe(lastId)
    expect(afterUndo.focusInsideEditor).toBe(true)

    const restoredHealth = await Promise.all(pages.map(inspectRuntimeHealth))
    restoredHealth.forEach((state, index) => {
      expect(state.compositionPhase, `page ${index} composition phase`).toBe('idle')
      expect(state.eventComposing, `page ${index} event composing`).toBe(false)
      expect(state.selectionAlive, `page ${index} selection liveness after undo`).toBe(true)
      expect(state.graphErrors, `page ${index} model graph after undo`).toEqual([])
    })
    expect(diagnostics.flatMap(result => result.fatal)).toEqual([])
  } finally {
    await Promise.all(contexts.map(context => context.close()))
  }
})

test('cross-column offline IME preserves remote scope movement and tail edits', async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'the collaboration IME race runs once in Chromium')
  test.setTimeout(120_000)

  const room = `cross-column-reconnect-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const contexts: BrowserContext[] = []
  const pages: Page[] = []
  const diagnostics: Diagnostics[] = []

  try {
    for (let index = 0; index < 2; index++) {
      const context = await browser.newContext({baseURL, viewport: {width: 1280, height: 720}})
      const page = await context.newPage()
      contexts.push(context)
      pages.push(page)
      diagnostics.push(observeDiagnostics(page, index))
      await routeCollaborationSocket(page, room)
    }

    const [local, remote] = pages
    await connectPage(local, true)
    await connectPage(remote, false)

    const {
      columnsId,
      columnIds: [, middleColumnId],
      paragraphIds: [firstId, middleId, lastId],
    } = await prepareColumnsParagraphs(local, ['alpha', 'middle', 'omega'])
    await Promise.all([
      waitForBlockText(remote, firstId, 'alpha'),
      waitForBlockText(remote, middleId, 'middle'),
      waitForBlockText(remote, lastId, 'omega'),
    ])

    await setTextRange(local, firstId, 2, lastId, 3, columnsId)
    await setProviderConnected(local, false)
    expect((await dispatchComposition(local, firstId, 'compositionstart', '')).phase).toBe('active')
    await Promise.all([
      waitForBlockText(local, firstId, 'al'),
      waitForBlockText(local, middleId, null),
      waitForBlockText(local, lastId, 'ga'),
    ])
    expect(await blockText(local, middleColumnId)).toBeNull()
    expect(await blockText(remote, firstId)).toBe('alpha')
    expect(await blockText(remote, middleId)).toBe('middle')
    expect(await blockText(remote, lastId)).toBe('omega')

    await insertRemoteText(remote, lastId, 4, 'TAIL')
    await waitForBlockText(remote, lastId, 'omegTAILa')
    await moveRootBlockToEnd(remote, columnsId)
    await expect.poll(async () => {
      const position = await rootIndex(remote, columnsId)
      return position.index >= position.length - 3
    }, {timeout: 10_000}).toBe(true)

    await dispatchComposition(local, firstId, 'compositionend', '中')
    await Promise.all([
      waitForBlockText(local, firstId, 'al中'),
      waitForBlockText(local, lastId, 'ga'),
    ])
    await setProviderConnected(local, true)
    await waitForSnapshotConvergence(pages)

    await Promise.all([
      waitForBlockText(local, firstId, 'al中'),
      waitForBlockText(remote, firstId, 'al中'),
      waitForBlockText(local, middleId, null),
      waitForBlockText(remote, middleId, null),
      waitForBlockText(local, lastId, 'gTAILa'),
      waitForBlockText(remote, lastId, 'gTAILa'),
    ])
    expect(await blockText(local, middleColumnId)).toBeNull()
    const movedAfterReconnect = await rootIndex(local, columnsId)
    expect(movedAfterReconnect.index).toBeGreaterThanOrEqual(movedAfterReconnect.length - 3)

    const afterReconnect = await inspectSelection(local, firstId)
    expect(afterReconnect.phase).toBe('idle')
    expect(afterReconnect.model).toEqual(afterReconnect.recalculated)
    expect(afterReconnect.model?.anchor).toEqual({blockId: firstId, type: 'text', offset: 3})
    expect(afterReconnect.nativeAnchorBlockId).toBe(firstId)
    expect(afterReconnect.focusInsideEditor).toBe(true)

    await local.keyboard.press('ControlOrMeta+z')
    await Promise.all([
      waitForBlockText(local, firstId, 'alpha'),
      waitForBlockText(remote, firstId, 'alpha'),
      waitForBlockText(local, middleId, 'middle'),
      waitForBlockText(remote, middleId, 'middle'),
      waitForBlockText(local, lastId, 'omegTAILa'),
      waitForBlockText(remote, lastId, 'omegTAILa'),
    ])
    await waitForSnapshotConvergence(pages)

    const movedAfterUndo = await rootIndex(local, columnsId)
    expect(movedAfterUndo.index).toBeGreaterThanOrEqual(movedAfterUndo.length - 3)
    const afterUndo = await inspectSelection(local, firstId)
    expect(afterUndo.model).toEqual(afterUndo.recalculated)
    expect(afterUndo.model?.anchor).toEqual({blockId: firstId, type: 'text', offset: 2})
    expect(afterUndo.model?.head).toEqual({blockId: lastId, type: 'text', offset: 3})
    expect(afterUndo.model?.commonParent).toBe(columnsId)
    expect(afterUndo.nativeAnchorBlockId).toBe(firstId)
    expect(afterUndo.nativeFocusBlockId).toBe(lastId)
    expect(afterUndo.focusInsideEditor).toBe(true)

    const health = await Promise.all(pages.map(inspectRuntimeHealth))
    health.forEach((state, index) => {
      expect(state.compositionPhase, `page ${index} composition phase`).toBe('idle')
      expect(state.eventComposing, `page ${index} event composing`).toBe(false)
      expect(state.selectionAlive, `page ${index} selection liveness`).toBe(true)
      expect(state.graphErrors, `page ${index} model graph`).toEqual([])
    })
    expect(diagnostics.flatMap(result => result.fatal)).toEqual([])
  } finally {
    await Promise.all(contexts.map(context => context.close()))
  }
})

test('offline cross-column IME yields to a concurrent remote scope deletion', async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'the collaboration IME race runs once in Chromium')
  test.setTimeout(120_000)

  const room = `cross-column-delete-reconnect-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const contexts: BrowserContext[] = []
  const pages: Page[] = []
  const diagnostics: Diagnostics[] = []

  try {
    for (let index = 0; index < 2; index++) {
      const context = await browser.newContext({baseURL, viewport: {width: 1280, height: 720}})
      const page = await context.newPage()
      contexts.push(context)
      pages.push(page)
      diagnostics.push(observeDiagnostics(page, index))
      await routeCollaborationSocket(page, room)
    }

    const [local, remote] = pages
    await connectPage(local, true)
    await connectPage(remote, false)

    const {
      columnsId,
      columnIds,
      paragraphIds: [firstId, middleId, lastId],
    } = await prepareColumnsParagraphs(local, ['alpha', 'middle', 'omega'])
    await Promise.all([
      waitForBlockText(remote, firstId, 'alpha'),
      waitForBlockText(remote, middleId, 'middle'),
      waitForBlockText(remote, lastId, 'omega'),
    ])

    await setTextRange(local, firstId, 2, lastId, 3, columnsId)
    await setProviderConnected(local, false)
    expect((await dispatchComposition(local, firstId, 'compositionstart', '')).phase).toBe('active')
    await Promise.all([
      waitForBlockText(local, firstId, 'al'),
      waitForBlockText(local, middleId, null),
      waitForBlockText(local, lastId, 'ga'),
    ])
    await dispatchComposition(local, firstId, 'compositionend', '龘')
    await Promise.all([
      waitForBlockText(local, firstId, 'al龘'),
      waitForBlockText(local, lastId, 'ga'),
    ])
    const beforeRemoteDelete = await inspectSelection(local, firstId)
    expect(beforeRemoteDelete.phase).toBe('idle')
    expect(beforeRemoteDelete.model).toEqual(beforeRemoteDelete.recalculated)
    expect(beforeRemoteDelete.model?.anchor).toEqual({blockId: firstId, type: 'text', offset: 3})

    await deleteBlock(remote, columnsId)
    await waitForBlockText(remote, columnsId, null)
    expect(await blockText(local, columnsId)).not.toBeNull()
    expect(await blockText(local, firstId)).toBe('al龘')

    await setProviderConnected(local, true)
    await waitForSnapshotConvergence(pages)
    const deletedIds = new Set([columnsId, ...columnIds, firstId, middleId, lastId])
    await Promise.all([...deletedIds].flatMap(blockId => [
      waitForBlockText(local, blockId, null),
      waitForBlockText(remote, blockId, null),
    ]))

    const afterDelete = await inspectSelection(local, firstId)
    expect(afterDelete.phase).toBe('idle')
    expect(afterDelete.eventComposing).toBe(false)
    expect(afterDelete.model).toEqual(afterDelete.recalculated)
    expect(afterDelete.model).not.toBeNull()
    expect(deletedIds.has(afterDelete.model?.anchor?.blockId)).toBe(false)
    expect(deletedIds.has(afterDelete.model?.head?.blockId)).toBe(false)
    expect(deletedIds.has(afterDelete.model?.commonParent)).toBe(false)
    expect(deletedIds.has(afterDelete.nativeAnchorBlockId ?? '')).toBe(false)
    expect(afterDelete.focusInsideEditor).toBe(true)
    expect(await snapshotFingerprint(local)).not.toContain('龘')

    await local.keyboard.press('ControlOrMeta+z')
    await waitForSnapshotConvergence(pages)
    expect(await blockText(local, columnsId)).toBeNull()
    expect(await blockText(remote, columnsId)).toBeNull()
    const afterUndo = await inspectSelection(local, firstId)
    expect(afterUndo.model).toEqual(afterUndo.recalculated)
    expect(afterUndo.model).not.toBeNull()
    expect(deletedIds.has(afterUndo.model?.anchor?.blockId)).toBe(false)
    expect(deletedIds.has(afterUndo.model?.head?.blockId)).toBe(false)
    expect(afterUndo.focusInsideEditor).toBe(true)

    await local.keyboard.press('ControlOrMeta+Shift+z')
    await waitForSnapshotConvergence(pages)
    expect(await blockText(local, columnsId)).toBeNull()
    expect(await blockText(remote, columnsId)).toBeNull()
    const afterRedo = await inspectSelection(local, firstId)
    expect(afterRedo.model).toEqual(afterRedo.recalculated)
    expect(afterRedo.model).not.toBeNull()
    expect(deletedIds.has(afterRedo.model?.anchor?.blockId)).toBe(false)
    expect(deletedIds.has(afterRedo.model?.head?.blockId)).toBe(false)
    expect(afterRedo.focusInsideEditor).toBe(true)

    const beforeContinuedInput = await snapshotFingerprint(local)
    await local.keyboard.type('?')
    await expect.poll(async () => {
      const [localSnapshot, remoteSnapshot] = await Promise.all([
        snapshotFingerprint(local),
        snapshotFingerprint(remote),
      ])
      return localSnapshot === remoteSnapshot && localSnapshot !== beforeContinuedInput
    }, {timeout: 10_000}).toBe(true)

    const health = await Promise.all(pages.map(inspectRuntimeHealth))
    health.forEach((state, index) => {
      expect(state.compositionPhase, `page ${index} composition phase`).toBe('idle')
      expect(state.eventComposing, `page ${index} event composing`).toBe(false)
      expect(state.selectionAlive, `page ${index} selection liveness`).toBe(true)
      expect(state.graphErrors, `page ${index} model graph`).toEqual([])
    })
    expect(diagnostics.flatMap(result => result.fatal)).toEqual([])
  } finally {
    await Promise.all(contexts.map(context => context.close()))
  }
})

test('three clients converge through seeded IME, structure and history races', async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'the sustained IME soak runs once in Chromium')
  test.setTimeout(180_000)

  const room = `three-client-input-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const contexts: BrowserContext[] = []
  const pages: Page[] = []
  const diagnostics: Diagnostics[] = []
  const mutationErrors: string[] = []

  try {
    for (let index = 0; index < 3; index++) {
      const context = await browser.newContext({baseURL, viewport: {width: 1280, height: 720}})
      const page = await context.newPage()
      contexts.push(context)
      pages.push(page)
      diagnostics.push(observeDiagnostics(page, index))
      await routeCollaborationSocket(page, room)
    }

    const [composer, structuralPeer, historyPeer] = pages
    await connectPage(composer, true)
    await Promise.all([
      connectPage(structuralPeer, false),
      connectPage(historyPeer, false),
    ])

    const historyBlockId = await prepareSharedParagraph(composer, 'history-control')
    await Promise.all([
      waitForBlockText(structuralPeer, historyBlockId, 'history-control'),
      waitForBlockText(historyPeer, historyBlockId, 'history-control'),
    ])

    for (let round = 0; round < 8; round++) {
      const {
        columnsId,
        columnIds: [, , lastColumnId],
        paragraphIds: [firstId, middleId, lastId],
      } = await prepareColumnsParagraphs(composer, ['alpha', 'middle', 'omega'])
      await Promise.all([
        waitForBlockText(structuralPeer, firstId, 'alpha'),
        waitForBlockText(structuralPeer, middleId, 'middle'),
        waitForBlockText(structuralPeer, lastId, 'omega'),
        waitForBlockText(historyPeer, firstId, 'alpha'),
        waitForBlockText(historyPeer, lastId, 'omega'),
      ])

      await setTextRange(composer, firstId, 2, lastId, 3, columnsId)
      expect((await dispatchComposition(composer, firstId, 'compositionstart', '')).phase)
        .toBe('active')
      await Promise.all([
        waitForBlockText(structuralPeer, firstId, 'al'),
        waitForBlockText(historyPeer, firstId, 'al'),
      ])

      const mode = round % 4
      const structuralAction = (async (): Promise<string | null> => {
        if (mode === 0) {
          await moveRootBlockToEnd(structuralPeer, columnsId)
          return null
        }
        if (mode === 1) {
          return tryInsertRemoteText(structuralPeer, lastId, 1, `R${round}`)
        }
        if (mode === 2) {
          await deleteBlock(structuralPeer, lastColumnId)
          return null
        }
        await deleteBlock(structuralPeer, columnsId)
        return null
      })()
      const [structuralError, historyError] = await Promise.all([
        structuralAction,
        runHistoryPulse(historyPeer, historyBlockId, round),
      ])
      if (structuralError) mutationErrors.push(`round ${round}, structure: ${structuralError}`)
      if (historyError) mutationErrors.push(`round ${round}, history: ${historyError}`)

      if (mode === 0) {
        await expect.poll(async () => {
          const position = await rootIndex(composer, columnsId)
          return position.index >= position.length - 3
        }, {timeout: 10_000}).toBe(true)
        await scrollToTop(composer)
      } else if (mode === 1) {
        await waitForBlockText(composer, lastId, `gR${round}a`)
      } else if (mode === 2) {
        await waitForBlockText(composer, lastId, null)
      } else {
        await waitForBlockText(composer, columnsId, null)
      }

      await dispatchComposition(
        composer,
        firstId,
        'compositionend',
        String.fromCodePoint(0x4E00 + round),
      )
      await expect.poll(async () => (await inspectSelection(composer, firstId)).phase, {
        timeout: 10_000,
      }).toBe('idle')
      await composer.keyboard.press('ControlOrMeta+z')
      await waitForSnapshotConvergence(pages)

      const composerSelection = await inspectSelection(composer, firstId)
      expect(composerSelection.model, `round ${round} model selection`).not.toBeNull()
      expect(composerSelection.model, `round ${round} DOM/model selection`)
        .toEqual(composerSelection.recalculated)
      expect(composerSelection.focusInsideEditor, `round ${round} editor focus`).toBe(true)

      const health = await Promise.all(pages.map(inspectRuntimeHealth))
      health.forEach((state, pageIndex) => {
        expect(state.compositionPhase, `round ${round}, page ${pageIndex} composition`).toBe('idle')
        expect(state.eventComposing, `round ${round}, page ${pageIndex} event state`).toBe(false)
        expect(state.selectionAlive, `round ${round}, page ${pageIndex} selection`).toBe(true)
        expect(state.graphErrors, `round ${round}, page ${pageIndex} model graph`).toEqual([])
      })
    }

    expect(mutationErrors).toEqual([])
    await waitForSnapshotConvergence(pages)
    expect(diagnostics.flatMap(result => result.fatal)).toEqual([])
  } finally {
    await Promise.all(contexts.map(context => context.close()))
  }
})
