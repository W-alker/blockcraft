import {expect, test, type Locator, type Page} from '@playwright/test'

const editorSelector = 'block-craft-editor'
const panelTestId = 'idle-prefetch-debug-console'
const traceEventTestId = 'idle-prefetch-trace-event'

interface TraceRow {
  readonly kind: string
  readonly sequence: number
}

interface PipelineTrace {
  readonly calculation: TraceRow
  readonly mount: TraceRow
  readonly component: TraceRow
  readonly measurement: TraceRow
}

interface ManagerTraceState {
  readonly enabled: boolean
  readonly disabled: boolean
  readonly lastSequence: number
  readonly traceLength: number
}

type VirtualDocumentHeightState = 'estimated' | 'measured' | 'stale'
type VirtualDocumentViewState =
  | 'unmounted'
  | 'retained'
  | 'mounted'
  | 'near'
  | 'sweep'
  | 'viewport'

interface VirtualDocumentRootSnapshot {
  readonly id: string
  readonly index: number
  readonly flavour: string
  readonly offset: number
  readonly height: number
  readonly heightState: VirtualDocumentHeightState
  readonly viewState: VirtualDocumentViewState
}

interface VirtualDocumentSnapshot {
  readonly revision: number
  readonly projectionKind: 'continuous' | 'custom'
  readonly projectionRevision: number
  readonly totalHeight: number
  readonly viewportTop: number
  readonly viewportHeight: number
  readonly roots: readonly VirtualDocumentRootSnapshot[]
}

interface VirtualDocumentInteractionTarget {
  readonly root: VirtualDocumentRootSnapshot
  readonly totalHeight: number
}

const virtualDocumentTestId = 'idle-prefetch-virtual-document'
const virtualDocumentCanvasTestId = 'idle-prefetch-virtual-document-canvas'
const virtualDocumentLegendTestId = 'idle-prefetch-virtual-document-legend'
const virtualDocumentRootDetailTestId =
  'idle-prefetch-virtual-document-root-detail'
const virtualDocumentComponentSelector =
  'playground-idle-prefetch-virtual-document'
const trackVerticalPadding = 7

test.describe('idle prefetch debug console', () => {
  test('shows the real pipeline and keeps pause/clear UI-only', async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000)

    await page.setViewportSize({width: 1280, height: 1600})
    await page.goto('/')

    const panel = page.getByTestId(panelTestId)
    await expect(panel).toBeVisible()
    await page.getByRole('button', {name: '初始化', exact: true}).click()
    await waitForInitializedEditor(page)
    await expect(
      panel.getByLabel('虚拟预热状态：运行中'),
    ).toBeVisible()

    const appendParagraph = page.getByRole('button', {
      name: '追加段落',
      exact: true,
    })
    for (let index = 0; index < 8; index++) {
      await appendParagraph.click()
    }

    let pipeline: PipelineTrace | null = null
    await expect.poll(
      async () => {
        pipeline = findPipelineTrace(await readTraceRows(panel))
        return pipeline !== null
      },
      {
        timeout: 20_000,
        message: '等待计算、预挂载、组件创建和测量事件进入真实调试台',
      },
    ).toBe(true)

    expect(pipeline).not.toBeNull()
    const sequences = [
      pipeline!.calculation.sequence,
      pipeline!.mount.sequence,
      pipeline!.component.sequence,
      pipeline!.measurement.sequence,
    ]
    expect(sequences).toEqual([...sequences].sort((left, right) => left - right))
    expect(new Set(sequences).size).toBe(sequences.length)

    let virtualDocument: VirtualDocumentSnapshot | null = null
    const observedHeightStates = new Set<VirtualDocumentHeightState>([
      // The accepted measurement event above is the transition evidence even
      // if a later revision marks that Root stale before this poll runs.
      'measured',
    ])
    const observedViewStates = new Set<VirtualDocumentViewState>()
    await expect.poll(
      async () => {
        virtualDocument = await readVirtualDocumentSnapshot(page)
        for (const root of virtualDocument.roots) {
          observedHeightStates.add(root.heightState)
          observedViewStates.add(root.viewState)
        }
        return virtualDocument.roots.length >= 800 &&
          observedHeightStates.has('estimated') &&
          observedHeightStates.has('measured') &&
          observedViewStates.has('viewport')
      },
      {
        timeout: 20_000,
        message: '等待 800+ Root 的虚拟文档轨道呈现估算、实测证据和真实视口状态',
      },
    ).toBe(true)

    expect(virtualDocument).not.toBeNull()
    expect(virtualDocument!.projectionKind).toBe('continuous')
    expect(virtualDocument!.viewportHeight).toBeGreaterThan(0)
    expect(virtualDocument!.totalHeight).toBeGreaterThan(
      virtualDocument!.viewportHeight,
    )
    expect(
      virtualDocument!.roots.every(root =>
        Number.isFinite(root.offset) &&
        Number.isFinite(root.height) &&
        root.height > 0,
      ),
    ).toBe(true)

    const virtualDocumentTrack = panel.getByTestId(virtualDocumentTestId)
    await expect(virtualDocumentTrack).toBeVisible()
    await expect(virtualDocumentTrack).toHaveAttribute(
      'data-root-count',
      String(virtualDocument!.roots.length),
    )
    await expect(virtualDocumentTrack).toHaveAttribute(
      'data-measured-count',
      /^\d+$/,
    )
    await expect(virtualDocumentTrack).toHaveAttribute(
      'data-inline-height-labels',
      'representative',
    )
    await expect.poll(
      async () => Number(
        await virtualDocumentTrack.getAttribute('data-viewport-count'),
      ),
    ).toBeGreaterThan(0)
    await expect.poll(
      async () => Number(
        await virtualDocumentTrack.getAttribute('data-active-view-count'),
      ),
    ).toBeGreaterThan(0)

    const canvas = panel.getByTestId(virtualDocumentCanvasTestId)
    const legend = panel.getByTestId(virtualDocumentLegendTestId)
    await expect(canvas).toBeVisible()
    await expect(legend).toBeVisible()
    for (const label of [
      '视口',
      '近邻',
      '扫尾',
      '已挂载',
      '实测高度',
      '估算高度',
    ]) {
      await expect(legend.getByText(label, {exact: true})).toBeVisible()
    }
    await expect(legend).toContainText('图内：#序号 估/实/旧 px')

    const pauseFollow = panel.getByRole('button', {
      name: '暂停虚拟预热流水跟随',
      exact: true,
    })
    await pauseFollow.click()
    await expect(
      panel.getByRole('button', {
        name: '继续虚拟预热流水跟随',
        exact: true,
      }),
    ).toBeVisible()
    const targetTraceRow = panel.locator(
      `[data-testid="${traceEventTestId}"][data-kind="measurement-accepted"][data-root-id]`,
    ).first()
    await expect(targetTraceRow).toBeVisible()
    const targetRootId = await targetTraceRow.getAttribute('data-root-id')
    expect(targetRootId).toBeTruthy()

    const interactionTarget = await readVirtualDocumentInteractionTarget(
      page,
      targetRootId!,
    )
    expect(interactionTarget).not.toBeNull()
    await hoverVirtualDocumentRoot(page, canvas, interactionTarget!)

    const rootDetail = panel.getByTestId(virtualDocumentRootDetailTestId)
    await expect(rootDetail).toHaveAttribute(
      'data-root-id',
      interactionTarget!.root.id,
    )
    await expect(rootDetail).toHaveAttribute(
      'data-height-state',
      /^(estimated|measured|stale)$/,
    )
    await expect(rootDetail).toHaveAttribute(
      'data-view-state',
      /^(unmounted|retained|mounted|near|sweep|viewport)$/,
    )
    await expect(rootDetail).toContainText(/块高\s*\d+(?:\.\d+)?(?:k)? px/)

    await clickHoveredVirtualDocumentRoot(page)
    await expect(
      panel.getByRole('button', {
        name: '清除虚拟文档 Root 事件聚焦',
        exact: true,
      }),
    ).toBeVisible()
    await expect.poll(
      async () => {
        const rootIds = await panel.getByTestId(traceEventTestId).evaluateAll(
          elements => elements.map(element =>
            (element as HTMLElement).dataset['rootId'] ?? null,
          ),
        )
        return rootIds.length > 0 && rootIds.every(
          rootId => rootId === interactionTarget!.root.id,
        )
      },
      {
        message: '点击虚拟文档段后只显示同一 Root 的真实流水',
      },
    ).toBe(true)

    await panel.scrollIntoViewIfNeeded()
    await panel.screenshot({
      path: testInfo.outputPath('idle-prefetch-debug-console.png'),
      animations: 'disabled',
    })

    await panel.getByRole('button', {
      name: '清除虚拟文档 Root 事件聚焦',
      exact: true,
    }).click()

    await panel.getByRole('button', {
      name: '继续虚拟预热流水跟随',
      exact: true,
    }).click()

    // Sweep destruction depends on idle scheduling and competing view owners.
    // Keep it visible in the artifact when present, but do not make it a gate.
    const destroyedSweepRows = panel.locator(
      `[data-testid="${traceEventTestId}"][data-kind="component-destroyed"]`,
    )
    if (await destroyedSweepRows.count()) {
      testInfo.annotations.push({
        type: 'idle-prefetch',
        description: '截图中的流水包含 sweep 组件销毁事件',
      })
    }

    await pauseFollow.click()
    await expect(
      panel.getByRole('button', {
        name: '继续虚拟预热流水跟随',
        exact: true,
      }),
    ).toBeVisible()

    const managerBeforeClear = await readManagerTraceState(page)
    expect(managerBeforeClear.enabled).toBe(true)
    expect(managerBeforeClear.disabled).toBe(false)

    await panel.getByRole('button', {
      name: '清空虚拟预热流水视图',
      exact: true,
    }).click()
    await expect(panel.getByTestId(traceEventTestId)).toHaveCount(0)

    await appendParagraph.click()
    await appendParagraph.click()
    await expect.poll(
      async () => (await readManagerTraceState(page)).lastSequence,
      {
        timeout: 10_000,
        message: '暂停面板跟随后 manager 仍应继续产生诊断事件',
      },
    ).toBeGreaterThan(managerBeforeClear.lastSequence)

    const managerWhilePaused = await readManagerTraceState(page)
    expect(managerWhilePaused.enabled).toBe(true)
    expect(managerWhilePaused.disabled).toBe(false)
    expect(managerWhilePaused.traceLength).toBeGreaterThanOrEqual(
      managerBeforeClear.traceLength,
    )
    await expect(panel.getByTestId(traceEventTestId)).toHaveCount(0)

    await panel.getByRole('button', {
      name: '继续虚拟预热流水跟随',
      exact: true,
    }).click()
    await expect(panel.getByTestId(traceEventTestId).first()).toBeVisible({
      timeout: 5_000,
    })
  })
})

async function waitForInitializedEditor(page: Page): Promise<void> {
  await page.waitForFunction(selector => {
    const editor = document.querySelector(selector)
    const debug = (
      window as unknown as {
        ng?: {
          getComponent: (target: Element) => {
            doc?: {isInitialized?: boolean}
          }
        }
      }
    ).ng
    return !!editor && debug?.getComponent(editor)?.doc?.isInitialized === true
  }, editorSelector)
}

async function readTraceRows(panel: Locator): Promise<TraceRow[]> {
  const rows = await panel.getByTestId(traceEventTestId).evaluateAll(elements =>
    elements.flatMap(element => {
      const kind = (element as HTMLElement).dataset['kind']
      const sequenceMatch = element.textContent?.match(/#(\d+)/)
      if (!kind || !sequenceMatch) return []
      const sequence = Number(sequenceMatch[1])
      return Number.isSafeInteger(sequence) ? [{kind, sequence}] : []
    }),
  )
  return rows.sort((left, right) => left.sequence - right.sequence)
}

function findPipelineTrace(rows: readonly TraceRow[]): PipelineTrace | null {
  for (const calculation of rows) {
    if (calculation.kind !== 'near-window-calculated') continue
    const mount = rows.find(row =>
      row.sequence > calculation.sequence &&
      row.kind === 'prefetch-mount-start',
    )
    if (!mount) continue
    const component = rows.find(row =>
      row.sequence > mount.sequence &&
      (row.kind === 'component-created' || row.kind === 'component-reused'),
    )
    if (!component) continue
    const measurement = rows.find(row =>
      row.sequence > component.sequence &&
      row.kind === 'measurement-accepted',
    )
    if (!measurement) continue
    return {calculation, mount, component, measurement}
  }
  return null
}

async function readManagerTraceState(page: Page): Promise<ManagerTraceState> {
  return page.evaluate(selector => {
    const editor = document.querySelector(selector)
    const debug = (
      window as unknown as {
        ng?: {getComponent: (target: Element) => {doc?: any}}
      }
    ).ng
    const doc = editor ? debug?.getComponent(editor)?.doc : undefined
    if (!doc) throw new Error('BlockCraft document is unavailable')
    const diagnostics = doc.virtualization.captureIdlePrefetchDiagnostics() as {
      enabled?: boolean
      disabled?: boolean
      trace?: Array<{sequence?: number}>
    }
    const trace = Array.isArray(diagnostics.trace) ? diagnostics.trace : []
    return {
      enabled: diagnostics.enabled === true,
      disabled: diagnostics.disabled === true,
      lastSequence: trace.reduce(
        (maximum, event) => Number.isFinite(event.sequence)
          ? Math.max(maximum, event.sequence!)
          : maximum,
        0,
      ),
      traceLength: trace.length,
    }
  }, editorSelector)
}

async function readVirtualDocumentSnapshot(
  page: Page,
): Promise<VirtualDocumentSnapshot> {
  return page.evaluate(selector => {
    const editor = document.querySelector(selector)
    const debug = (
      window as unknown as {
        ng?: {getComponent: (target: Element) => {doc?: any}}
      }
    ).ng
    const doc = editor ? debug?.getComponent(editor)?.doc : undefined
    if (!doc) throw new Error('BlockCraft document is unavailable')
    const diagnostics = doc.virtualization.captureIdlePrefetchDiagnostics() as {
      virtualDocument?: VirtualDocumentSnapshot
    }
    if (!diagnostics.virtualDocument) {
      throw new Error('Virtual document diagnostics are unavailable')
    }
    return diagnostics.virtualDocument
  }, editorSelector)
}

async function readVirtualDocumentInteractionTarget(
  page: Page,
  rootId: string,
): Promise<VirtualDocumentInteractionTarget | null> {
  return page.evaluate(({componentSelector, rootId}) => {
    const componentHost = document.querySelector(componentSelector)
    const debug = (
      window as unknown as {
        ng?: {getComponent: (target: Element) => {snapshot?: unknown}}
      }
    ).ng
    const component = componentHost
      ? debug?.getComponent(componentHost)
      : undefined
    const virtualDocument = component?.snapshot as
      | VirtualDocumentSnapshot
      | null
      | undefined
    if (!virtualDocument) return null
    const root = virtualDocument.roots.find(
      candidate => candidate.id === rootId,
    )
    if (!root) return null
    return {
      root,
      totalHeight: virtualDocument.totalHeight,
    }
  }, {componentSelector: virtualDocumentComponentSelector, rootId})
}

async function hoverVirtualDocumentRoot(
  page: Page,
  canvas: Locator,
  target: VirtualDocumentInteractionTarget,
): Promise<void> {
  await canvas.scrollIntoViewIfNeeded()
  const box = await canvas.boundingBox()
  if (!box) throw new Error('Virtual document canvas has no bounding box')
  const trackHeight = Math.max(1, box.height - trackVerticalPadding * 2)
  const rootCenter = target.root.offset + target.root.height / 2
  const localY = trackVerticalPadding +
    rootCenter / target.totalHeight * trackHeight
  await page.mouse.move(
    box.x + box.width / 2,
    box.y + Math.min(box.height - trackVerticalPadding, Math.max(
      trackVerticalPadding,
      localY,
    )),
  )
}

async function clickHoveredVirtualDocumentRoot(page: Page): Promise<void> {
  await page.mouse.down()
  await page.mouse.up()
}
