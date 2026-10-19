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

type PageDiagnostics = {
  readonly fatal: string[]
  readonly repairs: string[]
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

function observeDiagnostics(page: Page, pageIndex: number): PageDiagnostics {
  const diagnostics: PageDiagnostics = {fatal: [], repairs: []}
  const recordFatal = (message: string) => {
    if (diagnostics.fatal.includes(message) || diagnostics.fatal.length >= 50) return
    diagnostics.fatal.push(message)
  }
  page.on('pageerror', error => {
    const detail = error.stack ?? error.message
    if (externalEmbedPattern.test(detail)) return
    if (fatalConsolePattern.test(detail) || /127\.0\.0\.1:8081/.test(detail)) {
      recordFatal(`page ${pageIndex}: ${detail}`)
    }
  })
  page.on('console', message => {
    const text = message.text()
    if (/children repair: fixed/i.test(text)) diagnostics.repairs.push(text)
    const source = message.location().url
    if (
      fatalConsolePattern.test(text) &&
      !externalEmbedPattern.test(`${source} ${text}`) &&
      !externalResourceNoisePattern.test(text)
    ) {
      recordFatal(`page ${pageIndex}: ${text}`)
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

async function connectPage(page: Page, initialize: boolean): Promise<void> {
  await page.goto('/')
  if (initialize) {
    await page.getByRole('button', {name: '初始化', exact: true}).click()
    await waitForEditor(page)
    await page.getByRole('button', {name: '追加段落', exact: true}).click()
    await page.getByRole('button', {name: '追加段落', exact: true}).click()
  }
  await page.getByRole('button', {name: '进入协同', exact: true}).click()
  await waitForProvider(page)
  await waitForEditor(page)
}

async function setProviderConnected(page: Page, connected: boolean): Promise<void> {
  await page.evaluate((shouldConnect) => {
    const root = document.querySelector('bc-root')
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {
        provider?: {connect: () => void, disconnect: () => void}
      }}
    }).ng
    const provider = root ? debug.getComponent(root).provider : undefined
    if (!provider) throw new Error('collaboration provider is unavailable')
    shouldConnect ? provider.connect() : provider.disconnect()
  }, connected)
  if (connected) await waitForProvider(page)
}

async function rootEditableIds(page: Page): Promise<string[]> {
  return page.evaluate((selector) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    return (doc.model.getChildrenIds(doc.rootId) as string[]).filter(blockId =>
      doc.model.getYBlock(blockId)?.get('nodeType') === 'editable',
    )
  }, editorSelector)
}

async function moveRootBlock(page: Page, blockId: string, targetIndex: number): Promise<void> {
  await page.evaluate(({selector, blockId, targetIndex}) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const sourceIndex = doc.model.indexInParent(blockId)
    if (doc.model.getParentId(blockId) !== doc.rootId || sourceIndex < 0) return
    const length = doc.model.getChildrenIds(doc.rootId).length
    doc.crud.undoManager.stopCapturing()
    doc.crud.moveBlocks(doc.rootId, sourceIndex, 1, doc.rootId, Math.min(targetIndex, length - 1))
  }, {selector: editorSelector, blockId, targetIndex})
}

async function deleteRootBlock(page: Page, blockId: string): Promise<void> {
  await page.evaluate(({selector, blockId}) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    if (doc.model.getParentId(blockId) !== doc.rootId) return
    doc.crud.undoManager.stopCapturing()
    doc.crud.deleteBlockById(blockId)
  }, {selector: editorSelector, blockId})
}

async function runMutationBatch(
  page: Page,
  clientIndex: number,
  round: number,
  count: number,
  protectedBlockIds: readonly string[] = [],
): Promise<string[]> {
  return page.evaluate(async ({
    selector,
    clientIndex,
    round,
    count,
    protectedIds,
  }) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const errors: string[] = []
    const protectedSet = new Set(protectedIds)
    let state = (0x9E3779B9 ^ clientIndex * 0x85EBCA6B ^ round * 0xC2B2AE35) >>> 0
    const next = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      return state / 4294967296
    }
    const integer = (max: number) => max <= 1 ? 0 : Math.floor(next() * max)

    for (let index = 0; index < count; index++) {
      try {
        const rootIds = doc.model.getChildrenIds(doc.rootId) as string[]
        const editableIds = rootIds.filter(blockId =>
          doc.model.getYBlock(blockId)?.get('nodeType') === 'editable',
        )
        const structuralIds = editableIds.filter(blockId => !protectedSet.has(blockId))
        const roll = next()
        doc.crud.undoManager.stopCapturing()

        if (roll < 0.38 && editableIds.length) {
          const blockId = editableIds[integer(editableIds.length)]
          const textLength = doc.model.getTextLength(blockId)
          doc.crud.applyTextDelta(blockId, [
            ...(textLength ? [{retain: integer(textLength + 1)}] : []),
            {insert: String.fromCharCode(97 + clientIndex)},
          ])
        } else if (roll < 0.65 && structuralIds.length > 1) {
          const blockId = structuralIds[integer(structuralIds.length)]
          const sourceIndex = doc.model.indexInParent(blockId)
          if (sourceIndex >= 0) {
            doc.crud.moveBlocks(
              doc.rootId,
              sourceIndex,
              1,
              doc.rootId,
              integer(Math.max(1, rootIds.length)),
            )
          }
        } else if (roll < 0.76) {
          const snapshot = doc.schemas.createSnapshot('paragraph', [[{
            insert: `client:${clientIndex}:round:${round}:op:${index}`,
          }]])
          doc.crud.insertBlockSnapshots(
            doc.rootId,
            integer(rootIds.length + 1),
            [snapshot],
          )
        } else if (roll < 0.83 && structuralIds.length > 80) {
          doc.crud.deleteBlockById(structuralIds[integer(structuralIds.length)])
        } else if (roll < 0.94) {
          doc.crud.undoManager.undo()
        } else {
          doc.crud.undoManager.redo()
        }
      } catch (error) {
        errors.push(error instanceof Error ? `${error.name}: ${error.message}` : String(error))
      }
      if ((index + 1) % 4 === 0) {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      }
    }
    return errors
  }, {
    selector: editorSelector,
    clientIndex,
    round,
    count,
    protectedIds: protectedBlockIds,
  })
}

async function setTextRange(
  page: Page,
  anchorBlockId: string,
  anchorOffset: number,
  headBlockId: string,
  headOffset: number,
): Promise<void> {
  await page.evaluate(async ({
    selector,
    anchorId,
    anchorIndex,
    headId,
    headIndex,
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
      commonParent: doc.rootId,
    })
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
  }, {
    selector: editorSelector,
    anchorId: anchorBlockId,
    anchorIndex: anchorOffset,
    headId: headBlockId,
    headIndex: headOffset,
  })
}

async function setCaret(page: Page, blockId: string, offset: number): Promise<void> {
  await setTextRange(page, blockId, offset, blockId, offset)
}

async function runScrollChurn(
  page: Page,
  clientIndex: number,
  round: number,
): Promise<void> {
  await page.evaluate(async ({selector, clientIndex, round}) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const container = doc.scrollContainer as HTMLElement | null
    if (!container) return
    const baseRatios = [0, 0.24, 0.78, 0.46, 1, 0.12]
    const offset = (clientIndex + round) % baseRatios.length
    for (let index = 0; index < baseRatios.length; index++) {
      const ratio = baseRatios[(index + offset) % baseRatios.length]
      const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight)
      container.scrollTop = Math.round(maxScrollTop * ratio)
      container.dispatchEvent(new Event('scroll'))
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      )
    }
  }, {selector: editorSelector, clientIndex, round})
}

async function settleVirtualView(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  ))
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

async function waitForStableConvergence(pages: readonly Page[]): Promise<void> {
  let previous = ''
  let stablePasses = 0
  await expect.poll(async () => {
    const snapshots = await Promise.all(pages.map(snapshotFingerprint))
    const unique = new Set(snapshots)
    if (unique.size === 1 && snapshots[0] === previous) {
      stablePasses++
    } else {
      stablePasses = unique.size === 1 ? 1 : 0
      previous = unique.size === 1 ? snapshots[0] : ''
    }
    return stablePasses
  }, {
    timeout: 30_000,
    intervals: [200, 300, 500, 800],
  }).toBeGreaterThanOrEqual(3)
}

async function inspectEditor(
  page: Page,
  requireSelectionProjection = false,
): Promise<{
  errors: string[]
  rootChildren: number
  mountedRootChildren: number
  retainedRootChildren: number
  spacerCount: number
  visibleRootChildren: number
}> {
  return page.evaluate(({selector, requireProjection}) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const errors: string[] = []
    const seen = new Set<string>()
    const rootIds = doc.model.getChildrenIds(doc.rootId) as string[]
    const visit = (blockId: string) => {
      if (seen.has(blockId)) {
        errors.push(`duplicate reachable block ${blockId}`)
        return
      }
      seen.add(blockId)
      const children = doc.model.getChildrenIds(blockId) as string[]
      if (new Set(children).size !== children.length) {
        errors.push(`duplicate children in ${blockId}`)
      }
      children.forEach(childId => {
        if (!doc.model.exists(childId)) errors.push(`missing child ${blockId} -> ${childId}`)
        if (doc.model.getParentId(childId) !== blockId) {
          errors.push(`wrong parent for ${childId}`)
        }
        visit(childId)
      })
    }
    visit(doc.rootId)

    const mounted = doc.vm.getMountedRootChildIds() as string[]
    const retained = doc.vm.getRetainedRootChildIds() as string[]
    const mountedSet = new Set(mounted)
    const retainedSet = new Set(retained)
    mounted.forEach((blockId: string) => {
      if (retainedSet.has(blockId)) errors.push(`mounted and retained ${blockId}`)
      if (!rootIds.includes(blockId)) errors.push(`mounted non-root child ${blockId}`)
      const ref = doc.vm.get(blockId)
      if (!ref) errors.push(`mounted root child has no component ${blockId}`)
      else {
        if (ref.instance.parentId !== doc.rootId) {
          errors.push(`mounted root child has wrong component parent ${blockId}`)
        }
        if (!ref.instance.isAttached) errors.push(`mounted root child is detached ${blockId}`)
        if (!ref.instance.hostElement.isConnected) {
          errors.push(`mounted root child host is disconnected ${blockId}`)
        }
      }
    })
    retained.forEach((blockId: string) => {
      if (!rootIds.includes(blockId)) errors.push(`retained non-root child ${blockId}`)
      const ref = doc.vm.get(blockId)
      if (!ref) errors.push(`retained root child has no component ${blockId}`)
      else {
        if (ref.instance.parentId !== doc.rootId) {
          errors.push(`retained root child has wrong component parent ${blockId}`)
        }
        if (ref.instance.isAttached) errors.push(`retained root child is attached ${blockId}`)
        if (ref.instance.hostElement.isConnected) {
          errors.push(`retained root child host is connected ${blockId}`)
        }
      }
    })

    const rootContainer = doc.root.childrenRenderRef?.containerElement as HTMLElement | undefined
    const viewport = (doc.scrollContainer as HTMLElement | null)?.getBoundingClientRect() ?? null
    let visibleRootChildren = 0
    let spacerCount = 0
    if (!rootContainer) {
      errors.push('root children container is unavailable')
    } else {
      const coverageElements = Array.from(rootContainer.children).filter((child): child is HTMLElement =>
        child instanceof HTMLElement &&
        (child.dataset['blockId'] !== undefined ||
          child.dataset['bcVirtualSpacer'] !== undefined),
      )
      const directRootIds = coverageElements
        .map(element => element.dataset['blockId'])
        .filter((blockId): blockId is string => blockId !== undefined)
      if (new Set(directRootIds).size !== directRootIds.length) {
        errors.push('duplicate direct root block hosts')
      }
      if (directRootIds.length !== mounted.length ||
        directRootIds.some((blockId, index) => blockId !== mounted[index])) {
        errors.push('direct root block hosts do not match mounted root order')
      }

      let expectedIndex = 0
      coverageElements.forEach(element => {
        const blockId = element.dataset['blockId']
        if (blockId !== undefined) {
          const modelIndex = rootIds.indexOf(blockId)
          if (modelIndex !== expectedIndex) {
            errors.push(`root DOM order mismatch at ${blockId}: ${modelIndex} != ${expectedIndex}`)
          }
          expectedIndex = Math.max(expectedIndex, modelIndex + 1)
          if (!mountedSet.has(blockId)) errors.push(`orphan direct root host ${blockId}`)
          if (element.parentElement !== rootContainer) {
            errors.push(`root host has wrong DOM parent ${blockId}`)
          }
          if (viewport) {
            const rect = element.getBoundingClientRect()
            if (rect.bottom > viewport.top && rect.top < viewport.bottom) {
              visibleRootChildren++
            }
          }
          return
        }

        spacerCount++
        const key = element.dataset['bcVirtualSpacer'] ?? ''
        const match = /^(\d+):(\d+)$/.exec(key)
        if (!match) {
          errors.push(`invalid virtual spacer key ${key}`)
          return
        }
        const start = Number(match[1])
        const end = Number(match[2])
        if (start !== expectedIndex || end < start || end >= rootIds.length) {
          errors.push(`virtual spacer coverage mismatch ${key} at ${expectedIndex}`)
        }
        const height = Number.parseFloat(element.style.height)
        if (!Number.isFinite(height) || height < 0) {
          errors.push(`invalid virtual spacer height ${element.style.height}`)
        }
        for (let index = start; index <= end; index++) {
          if (mountedSet.has(rootIds[index])) {
            errors.push(`virtual spacer ${key} covers mounted block ${rootIds[index]}`)
          }
        }
        expectedIndex = Math.max(expectedIndex, end + 1)
      })
      if (expectedIndex !== rootIds.length) {
        errors.push(`root DOM coverage ended at ${expectedIndex} of ${rootIds.length}`)
      }

      if (viewport && rootIds.length) {
        const rootRect = rootContainer.getBoundingClientRect()
        const rootIntersectsViewport =
          rootRect.bottom > viewport.top && rootRect.top < viewport.bottom
        if (rootIntersectsViewport && visibleRootChildren === 0) {
          errors.push('virtual viewport intersects root without a visible block host')
        }
      }
    }

    const selection = doc.selection.value?.toJSON() ?? null
    const selectionBlockIds = selection
      ? [
          selection.anchor.blockId,
          selection.head.blockId,
          selection.anchor.tableId,
          selection.head.tableId,
        ].filter((blockId): blockId is string => !!blockId)
      : []
    selectionBlockIds.forEach(blockId => {
      if (!doc.model.exists(blockId)) errors.push(`selection points to missing block ${blockId}`)
      let path: string[] | undefined
      try {
        path = doc.model.getPath(blockId)
      } catch {
        path = undefined
      }
      const rootChildId = path?.[0] === doc.rootId ? path[1] : undefined
      if (rootChildId && !mountedSet.has(rootChildId)) {
        errors.push(`selection root endpoint is not mounted ${rootChildId}`)
      }
    })

    const nativeSelection = document.getSelection()
    const anchorNode = nativeSelection?.anchorNode ?? null
    const focusNode = nativeSelection?.focusNode ?? null
    const nativeTouchesEditor = !!rootContainer && (
      (!!anchorNode && rootContainer.contains(anchorNode)) ||
      (!!focusNode && rootContainer.contains(focusNode))
    )
    if (requireProjection) {
      if (!selection) errors.push('expected a model selection')
      if (nativeSelection?.rangeCount !== 1) {
        errors.push('expected one native selection range')
      }
      if (!nativeTouchesEditor) errors.push('expected native selection inside the editor')
      const active = document.activeElement
      if (!active || (
        active !== doc.root.hostElement &&
        !doc.root.hostElement.contains(active)
      )) {
        errors.push('expected editor focus for the active selection')
      }
    }
    if (nativeTouchesEditor) {
      if (!anchorNode?.isConnected || !focusNode?.isConnected) {
        errors.push('native selection points to a disconnected node')
      }
      if (!rootContainer?.contains(anchorNode) || !rootContainer.contains(focusNode)) {
        errors.push('native selection only partially belongs to the editor')
      }
      if (selection) {
        try {
          const recalculated = doc.selection
            .recalculate(false, {isComposing: true})
            .value?.toJSON() ?? null
          if (JSON.stringify(recalculated) !== JSON.stringify(selection)) {
            errors.push(
              `native and model selections do not match: model=${
                JSON.stringify(selection)
              }, native=${JSON.stringify(recalculated)}`,
            )
          }
        } catch (error) {
          errors.push(`native selection cannot be normalized: ${
            error instanceof Error ? error.message : String(error)
          }`)
        }
      }
    }

    return {
      errors,
      rootChildren: rootIds.length,
      mountedRootChildren: mounted.length,
      retainedRootChildren: retained.length,
      spacerCount,
      visibleRootChildren,
    }
  }, {selector: editorSelector, requireProjection: requireSelectionProjection})
}

test('five virtualized editors converge through concurrent edits, conflicts and reconnect', async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'the sustained multi-page soak runs once in Chromium')
  test.setTimeout(120_000)

  const room = `stress-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const contexts: BrowserContext[] = []
  const pages: Page[] = []
  const diagnostics: PageDiagnostics[] = []

  try {
    for (let index = 0; index < 5; index++) {
      const context = await browser.newContext({baseURL, viewport: {width: 1280, height: 720}})
      const page = await context.newPage()
      contexts.push(context)
      pages.push(page)
      diagnostics.push(observeDiagnostics(page, index))
      await routeCollaborationSocket(page, room)
    }

    await connectPage(pages[0], true)
    await Promise.all(pages.slice(1).map(page => connectPage(page, false)))

    const initialIds = await rootEditableIds(pages[0])
    expect(initialIds.length).toBeGreaterThan(100)
    const [moveConflictId, deleteConflictId] = initialIds
    await Promise.all(pages.map(page => setProviderConnected(page, false)))
    await Promise.all([
      moveRootBlock(pages[0], moveConflictId, 5),
      moveRootBlock(pages[1], moveConflictId, 40),
      moveRootBlock(pages[2], moveConflictId, 90),
      deleteRootBlock(pages[3], deleteConflictId),
      moveRootBlock(pages[4], deleteConflictId, 120),
    ])

    await Promise.all(pages.slice(0, 4).map(page => setProviderConnected(page, true)))
    await pages[0].waitForTimeout(350)

    const rangeAnchorId = initialIds[24]
    const caretId = initialIds[57]
    const rangeHeadId = initialIds[86]
    const protectedSelectionIds = [rangeAnchorId, caretId, rangeHeadId]
    await Promise.all([
      setTextRange(pages[0], rangeAnchorId, 1, rangeHeadId, 3),
      setCaret(pages[1], caretId, 2),
    ])

    const mutationErrors: string[] = []
    for (let round = 0; round < 5; round++) {
      const [results] = await Promise.all([
        Promise.all(
          pages.slice(2).map((page, writerIndex) =>
            runMutationBatch(
              page,
              writerIndex + 2,
              round,
              26,
              protectedSelectionIds,
            ),
          ),
        ),
        Promise.all(
          pages.map((page, clientIndex) => runScrollChurn(page, clientIndex, round)),
        ),
      ])
      results.forEach((errors, writerIndex) => {
        errors.forEach(error =>
          mutationErrors.push(`page ${writerIndex + 2}, round ${round}: ${error}`),
        )
      })
      await Promise.all(pages.map(settleVirtualView))

      const roundStates = await Promise.all(
        pages.map((page, pageIndex) => inspectEditor(page, pageIndex < 2)),
      )
      roundStates.forEach((state, pageIndex) => {
        expect(state.errors, `round ${round}, page ${pageIndex} model/view invariants`)
          .toEqual([])
        expect(state.mountedRootChildren, `round ${round}, page ${pageIndex} virtual window`)
          .toBeLessThan(state.rootChildren)
        expect(state.retainedRootChildren, `round ${round}, page ${pageIndex} retained LRU`)
          .toBeLessThanOrEqual(12)
        expect(state.spacerCount, `round ${round}, page ${pageIndex} spacer coverage`)
          .toBeGreaterThan(0)
        expect(state.visibleRootChildren, `round ${round}, page ${pageIndex} visible root blocks`)
          .toBeGreaterThan(0)
      })
    }
    expect(mutationErrors).toEqual([])

    await setProviderConnected(pages[4], true)
    await Promise.all(pages.map(waitForProvider))
    await waitForStableConvergence(pages)
    await Promise.all(pages.map(settleVirtualView))

    const states = await Promise.all(
      pages.map((page, pageIndex) => inspectEditor(page, pageIndex < 2)),
    )
    states.forEach((state, index) => {
      expect(state.errors, `page ${index} model/view invariants`).toEqual([])
      expect(state.rootChildren, `page ${index} document size`).toBeGreaterThan(100)
      expect(state.mountedRootChildren, `page ${index} virtual window`)
        .toBeLessThan(state.rootChildren)
      expect(state.retainedRootChildren, `page ${index} retained LRU`).toBeLessThanOrEqual(12)
      expect(state.spacerCount, `page ${index} spacer coverage`).toBeGreaterThan(0)
      expect(state.visibleRootChildren, `page ${index} visible root blocks`).toBeGreaterThan(0)
    })
    expect(diagnostics.flatMap(result => result.fatal)).toEqual([])
    expect(diagnostics.flatMap(result => result.repairs).length).toBeGreaterThan(0)
  } finally {
    await Promise.all(contexts.map(context => context.close()))
  }
})
