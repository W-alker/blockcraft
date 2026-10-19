import {expect, test, type Page} from '@playwright/test'

const editorSelector = 'block-craft-editor'
const env =
  (
    globalThis as typeof globalThis & {
      process?: {env?: Record<string, string | undefined>}
    }
  ).process?.env ?? {}
const visualDemoEnabled = env['BC_IDLE_PREFETCH_VISUAL'] === '1'
const fastVisualDemo = env['BC_IDLE_PREFETCH_VISUAL_FAST'] === '1'
const recordVisualDemo = env['BC_IDLE_PREFETCH_RECORD'] === '1'
const phaseHoldMs = fastVisualDemo ? 80 : 1_500

test.use({
  viewport: {width: 1440, height: 900},
  video: recordVisualDemo ? 'on' : 'off',
})

test.describe('idle prefetch visual demo', () => {
  test.skip(
    !visualDemoEnabled,
    'Run `pnpm test:e2e:idle-prefetch:visual` to watch this manual demo.',
  )
  test('shows bounded near/sweep warming and viewport handoff', async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000)
    const pageErrors: string[] = []
    page.on('pageerror', error => pageErrors.push(error.stack ?? error.message))

    await page.goto('/')
    await waitForEditorShell(page)

    // Public default remains false. The visual test opts in before document
    // initialization, matching the existing capability E2E boundary.
    await page.evaluate(selector => {
      const editor = document.querySelector(selector)
      const debug = (
        window as unknown as {
          ng: {getComponent: (target: Element) => {doc: any}}
        }
      ).ng
      const doc = debug.getComponent(editor!).doc
      ;(doc.virtualization as any).config.idlePrefetch = true
    }, editorSelector)

    await page.getByRole('button', {name: '初始化', exact: true}).click()
    await waitForInitializedEditor(page)

    const prepared = await page.evaluate(
      async ({selector, rootCount}) => {
        const editor = document.querySelector(selector)
        const debug = (
          window as unknown as {
            ng: {getComponent: (target: Element) => {doc: any}}
          }
        ).ng
        const doc = debug.getComponent(editor!).doc
        const scrollContainer = doc.scrollContainer as HTMLElement

        // Keep the scheduler paused while the model-only bulk insert and normal
        // viewport reconciliation settle. Releasing this pointer is the visible
        // start of the idle episode.
        scrollContainer.dispatchEvent(
          new PointerEvent('pointerdown', {bubbles: true}),
        )
        const existingRootIds = doc.model.getChildrenIds(doc.rootId) as string[]
        const snapshots = Array.from({length: rootCount}, (_, index) => {
          const suffix = ' · 真实文本几何'.repeat(1 + (index % 4))
          return doc.schemas.createSnapshot('paragraph', [
            [
              {
                insert: `空闲预热演示 Root ${String(index + 1).padStart(4, '0')}${suffix}`,
              },
            ],
          ])
        })
        const insertedIds = doc.crud.insertBlockSnapshots(
          doc.rootId,
          existingRootIds.length,
          snapshots,
        ) as string[]
        if (insertedIds.length !== rootCount) {
          throw new Error(
            `Expected ${rootCount} demo roots, received ${insertedIds.length}`,
          )
        }

        await doc.virtualization.scrollToBlock(insertedIds[160])
        await new Promise<void>(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        )
        return {
          insertedIds,
          baselineMounted: (doc.vm.getMountedRootChildIds() as string[]).length,
        }
      },
      {selector: editorSelector, rootCount: 1_200},
    )

    await installVisualOverlay(page, prepared.insertedIds)
    await setVisualPhase(
      page,
      '交互暂停：1200 个 Root 已就绪，预热尚未启动',
      'paused',
    )
    await page.waitForTimeout(phaseHoldMs)

    await page.evaluate(selector => {
      const editor = document.querySelector(selector)
      const debug = (
        window as unknown as {
          ng: {getComponent: (target: Element) => {doc: any}}
        }
      ).ng
      const doc = debug.getComponent(editor!).doc
      doc.scrollContainer.dispatchEvent(
        new PointerEvent('pointerup', {bubbles: true}),
      )
    }, editorSelector)
    await setVisualPhase(
      page,
      '空闲预热：橙色 near 向前铺开，紫色 sweep 扫描远端',
      'warming',
    )

    await expect
      .poll(
        async () => {
          const state = await readVisualState(page)
          return (
            state.diagnostics.nearMounts > 0 &&
            state.diagnostics.sweepMounts > 0 &&
            state.nearIds.length > 0
          )
        },
        {timeout: 25_000},
      )
      .toBe(true)

    const warmed = await readVisualState(page)
    expect(warmed.diagnostics.disabled).toBe(false)
    expect(warmed.fullMountFallback).toBe(false)
    expect(warmed.mountedCount).toBeLessThanOrEqual(
      prepared.baselineMounted +
        warmed.nearIds.length +
        warmed.activeSweepCount,
    )
    expect(warmed.nearProjectedHeight).toBeLessThanOrEqual(
      warmed.viewportHeight,
    )
    await page.waitForTimeout(phaseHoldMs)
    await page.screenshot({
      path: testInfo.outputPath('idle-prefetch-warming.png'),
      animations: 'disabled',
    })

    // Re-read immediately before scrolling: height convergence can atomically
    // replace the near pin while the warming screenshot is held on screen.
    const handoffReady = await readVisualState(page)
    const warmedTarget = handoffReady.nearIds[0]
    expect(warmedTarget).toBeTruthy()
    const hitsBeforeHandoff = handoffReady.diagnostics.hits
    await setVisualPhase(
      page,
      'Viewport 接管：正在滚入一个已预热的橙色 Root',
      'handoff',
    )
    await smoothlyScrollToRoot(page, warmedTarget, fastVisualDemo)

    await expect
      .poll(
        async () => {
          const state = await readVisualState(page)
          return {
            hit: state.diagnostics.hits > hitsBeforeHandoff,
            leftNearLane: !state.nearIds.includes(warmedTarget),
            remainsMounted: state.mountedIds.includes(warmedTarget),
          }
        },
        {timeout: 10_000},
      )
      .toEqual({hit: true, leftNearLane: true, remainsMounted: true})
    await page.evaluate(blockId => {
      const controller = (
        window as unknown as {
          __bcIdlePrefetchVisual?: {markHit: (id: string) => void}
        }
      ).__bcIdlePrefetchVisual
      controller?.markHit(blockId)
    }, warmedTarget)
    await setVisualPhase(
      page,
      '命中成功：绿色 Root 已由 viewport 无缝接管',
      'success',
    )
    await page.waitForTimeout(phaseHoldMs)

    const finalState = await readVisualState(page)
    expect(finalState.diagnostics.hits).toBeGreaterThan(hitsBeforeHandoff)
    expect(finalState.mountedCount).toBeLessThan(finalState.totalRootCount)
    expect(finalState.visualPeak.peakMounted).toBeLessThan(
      finalState.totalRootCount,
    )
    expect(finalState.visualPeak.maxNearProjectedHeight).toBeLessThanOrEqual(
      finalState.viewportHeight,
    )
    expect(finalState.visualPeak.maxActiveSweepCount).toBeLessThanOrEqual(1)
    expect(finalState.diagnostics.disabled).toBe(false)
    expect(finalState.fullMountFallback).toBe(false)
    expect(pageErrors).toEqual([])

    await testInfo.attach('idle-prefetch diagnostics', {
      body: JSON.stringify(finalState, null, 2),
      contentType: 'application/json',
    })
    await page.screenshot({
      path: testInfo.outputPath('idle-prefetch-hit.png'),
      animations: 'disabled',
    })
    await page.waitForTimeout(fastVisualDemo ? 50 : 3_000)

    await page.evaluate(() => {
      const target = window as unknown as {
        __bcIdlePrefetchVisual?: {stop: () => void}
      }
      target.__bcIdlePrefetchVisual?.stop()
      delete target.__bcIdlePrefetchVisual
    })
  })
})

async function waitForEditorShell(page: Page): Promise<void> {
  await page.waitForFunction(selector => {
    const editor = document.querySelector(selector)
    const debug = (
      window as unknown as {
        ng?: {getComponent: (target: Element) => {doc?: unknown}}
      }
    ).ng
    return !!editor && !!debug?.getComponent(editor)?.doc
  }, editorSelector)
}

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
    return !!editor && !!debug?.getComponent(editor)?.doc?.isInitialized
  }, editorSelector)
}

async function installVisualOverlay(
  page: Page,
  insertedIds: readonly string[],
): Promise<void> {
  await page.evaluate(
    ({selector, rootIds}) => {
      const editor = document.querySelector(selector)
      const debug = (
        window as unknown as {
          ng: {getComponent: (target: Element) => {doc: any}}
        }
      ).ng
      const doc = debug.getComponent(editor!).doc
      const manager = doc.virtualization as any
      const existing = document.getElementById('bc-idle-prefetch-visual')
      existing?.remove()

      const panel = document.createElement('aside')
      panel.id = 'bc-idle-prefetch-visual'
      panel.innerHTML = `
      <style>
        #bc-idle-prefetch-visual {
          position: fixed;
          top: 18px;
          right: 18px;
          z-index: 2147483647;
          box-sizing: border-box;
          width: 354px;
          padding: 16px;
          border: 1px solid rgba(148, 163, 184, .28);
          border-radius: 16px;
          color: #e5edf8;
          background: rgba(10, 18, 32, .94);
          box-shadow: 0 24px 70px rgba(2, 6, 23, .38);
          backdrop-filter: blur(16px);
          font: 12px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          pointer-events: none;
        }
        #bc-idle-prefetch-visual * { box-sizing: border-box; }
        #bc-idle-prefetch-visual .bc-v-title {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
          font-size: 15px;
          font-weight: 700;
        }
        #bc-idle-prefetch-visual .bc-v-live {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #86efac;
          font-size: 11px;
          font-weight: 600;
        }
        #bc-idle-prefetch-visual .bc-v-live::before {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: #22c55e;
          box-shadow: 0 0 0 4px rgba(34, 197, 94, .16);
          content: "";
        }
        #bc-idle-prefetch-visual .bc-v-phase {
          min-height: 42px;
          margin-bottom: 12px;
          padding: 9px 10px;
          border-radius: 10px;
          color: #cbd5e1;
          background: rgba(51, 65, 85, .55);
        }
        #bc-idle-prefetch-visual[data-tone="warming"] .bc-v-phase { color: #fde68a; background: rgba(180, 83, 9, .22); }
        #bc-idle-prefetch-visual[data-tone="handoff"] .bc-v-phase { color: #bfdbfe; background: rgba(30, 64, 175, .26); }
        #bc-idle-prefetch-visual[data-tone="success"] .bc-v-phase { color: #bbf7d0; background: rgba(21, 128, 61, .25); }
        #bc-idle-prefetch-visual .bc-v-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 7px;
          margin-bottom: 12px;
        }
        #bc-idle-prefetch-visual .bc-v-stat {
          padding: 8px;
          border: 1px solid rgba(148, 163, 184, .14);
          border-radius: 9px;
          background: rgba(30, 41, 59, .55);
        }
        #bc-idle-prefetch-visual .bc-v-stat span { display: block; color: #8fa3ba; font-size: 10px; }
        #bc-idle-prefetch-visual .bc-v-stat strong { display: block; margin-top: 2px; color: #f8fafc; font-size: 17px; }
        #bc-idle-prefetch-visual canvas {
          display: block;
          width: 322px;
          height: 154px;
          border-radius: 9px;
          background: #111b2b;
        }
        #bc-idle-prefetch-visual .bc-v-legend {
          display: flex;
          flex-wrap: wrap;
          gap: 5px 12px;
          margin-top: 10px;
          color: #9fb0c4;
          font-size: 10px;
        }
        #bc-idle-prefetch-visual .bc-v-key::before {
          display: inline-block;
          width: 7px;
          height: 7px;
          margin-right: 5px;
          border-radius: 2px;
          background: var(--key);
          content: "";
        }
        #bc-idle-prefetch-visual .bc-v-foot {
          display: flex;
          justify-content: space-between;
          margin-top: 10px;
          color: #71859d;
          font-size: 10px;
        }
      </style>
      <div class="bc-v-title">
        <span>Idle Prefetch · 真实视图</span>
        <span class="bc-v-live">LIVE</span>
      </div>
      <div class="bc-v-phase">准备中…</div>
      <div class="bc-v-grid">
        <div class="bc-v-stat"><span>当前挂载 / 全文</span><strong data-stat="mounted">0</strong></div>
        <div class="bc-v-stat"><span>Near / Sweep</span><strong data-stat="warm">0 / 0</strong></div>
        <div class="bc-v-stat"><span>Viewport 命中</span><strong data-stat="hits">0</strong></div>
        <div class="bc-v-stat"><span>Near 高度 / 1 Viewport</span><strong data-stat="budget">0 / 0</strong></div>
        <div class="bc-v-stat"><span>挂载 p95</span><strong data-stat="p95">—</strong></div>
        <div class="bc-v-stat"><span>取消 / 失败</span><strong data-stat="safety">0 / 0</strong></div>
      </div>
      <canvas width="644" height="308" aria-label="1200 个文本 Root 的虚拟渲染缩略图"></canvas>
      <div class="bc-v-legend">
        <span class="bc-v-key" style="--key:#3b82f6">当前挂载</span>
        <span class="bc-v-key" style="--key:#f59e0b">Near 预热</span>
        <span class="bc-v-key" style="--key:#a855f7">Sweep 扫尾</span>
        <span class="bc-v-key" style="--key:#22c55e">已命中</span>
      </div>
      <div class="bc-v-foot"><span data-stat="candidates">候选 0 · 每格 1 Root</span><span data-stat="health">有界运行</span></div>
    `
      document.body.appendChild(panel)

      const idToLocalIndex = new Map(rootIds.map((id, index) => [id, index]))
      const nearHistory = new Set<number>()
      const sweepHistory = new Set<number>()
      const hitHistory = new Set<number>()
      const canvas = panel.querySelector('canvas')!
      const context = canvas.getContext('2d')!
      const setText = (name: string, value: string) => {
        const element = panel.querySelector<HTMLElement>(
          `[data-stat="${name}"]`,
        )
        if (element) element.textContent = value
      }
      let previousHits = 0
      let peakMounted = 0
      let maxNearProjectedHeight = 0
      let maxActiveSweepCount = 0

      // A far sweep may finish and evict in the next animation frame. Keep the
      // hot sampler to one property read + Set write; the heavier HUD redraw
      // stays at 25fps so the visualization itself does not distort idle work.
      let sweepFrame = 0
      const latchSweep = () => {
        const activeId = manager.idlePrefetchActiveSweep?.blockId as
          | string
          | undefined
        if (activeId !== undefined) {
          const index = idToLocalIndex.get(activeId)
          if (index !== undefined) sweepHistory.add(index)
        }
        sweepFrame = requestAnimationFrame(latchSweep)
      }
      sweepFrame = requestAnimationFrame(latchSweep)

      const render = () => {
        const diagnostics = manager.captureIdlePrefetchDiagnostics()
        const nearIds = [...manager.idlePrefetchNearRootIds] as string[]
        const activeSweepId = manager.idlePrefetchActiveSweep?.blockId as
          | string
          | undefined
        const mountedIds = doc.vm.getMountedRootChildIds() as string[]
        const currentNear = new Set<number>()
        const currentMounted = new Set<number>()
        nearIds.forEach(id => {
          const index = idToLocalIndex.get(id)
          if (index === undefined) return
          currentNear.add(index)
          nearHistory.add(index)
        })
        mountedIds.forEach(id => {
          const index = idToLocalIndex.get(id)
          if (index !== undefined) currentMounted.add(index)
        })
        const activeSweepIndex =
          activeSweepId === undefined
            ? undefined
            : idToLocalIndex.get(activeSweepId)
        if (activeSweepIndex !== undefined) sweepHistory.add(activeSweepIndex)
        if (diagnostics.hits > previousHits) {
          nearHistory.forEach(index => {
            if (currentMounted.has(index) && !currentNear.has(index))
              hitHistory.add(index)
          })
        }
        previousHits = diagnostics.hits

        const durations = [...diagnostics.mountDurations].sort((a, b) => a - b)
        const p95 = durations.length
          ? durations[Math.floor((durations.length - 1) * 0.95)]
          : undefined
        const totalRootCount = (
          doc.model.getChildrenIds(doc.rootId) as string[]
        ).length
        const projection = manager.layoutProjection
        const nearProjectedHeight = nearIds.reduce((height, id) => {
          const index = manager.indexById.get(id)
          return index === undefined
            ? height
            : height + projection.extentAt(index)
        }, 0)
        const viewportHeight = doc.scrollContainer.clientHeight as number
        const activeSweepCount = activeSweepId ? 1 : 0
        peakMounted = Math.max(peakMounted, mountedIds.length)
        maxNearProjectedHeight = Math.max(
          maxNearProjectedHeight,
          nearProjectedHeight,
        )
        maxActiveSweepCount = Math.max(maxActiveSweepCount, activeSweepCount)
        setText('mounted', `${mountedIds.length} / ${totalRootCount}`)
        setText(
          'warm',
          `${diagnostics.nearMounts} / ${diagnostics.sweepMounts}`,
        )
        setText('hits', String(diagnostics.hits))
        setText(
          'budget',
          `${Math.round(nearProjectedHeight)} / ${Math.round(viewportHeight)}px`,
        )
        setText(
          'candidates',
          `峰值挂载 ${peakMounted} · 候选 ${diagnostics.candidates}`,
        )
        setText('p95', p95 === undefined ? '—' : `${p95.toFixed(2)}ms`)
        setText(
          'safety',
          `${diagnostics.cancellations} / ${diagnostics.failures}`,
        )
        setText(
          'health',
          diagnostics.disabled
            ? '已熔断'
            : nearProjectedHeight > viewportHeight + 0.5 || activeSweepCount > 1
              ? '预热预算越界'
              : '有界运行',
        )

        context.clearRect(0, 0, canvas.width, canvas.height)
        context.save()
        context.scale(2, 2)
        const columns = 48
        const gap = 1
        const cellWidth = 322 / columns
        const rows = Math.ceil(rootIds.length / columns)
        const cellHeight = Math.min(6, 154 / Math.max(1, rows))
        rootIds.forEach((_id, index) => {
          let color = '#223047'
          if (nearHistory.has(index)) color = '#76561d'
          if (sweepHistory.has(index)) color = '#503072'
          if (currentMounted.has(index)) color = '#3b82f6'
          if (currentNear.has(index)) color = '#f59e0b'
          if (activeSweepIndex === index) color = '#c084fc'
          if (hitHistory.has(index)) color = '#22c55e'
          const x = (index % columns) * cellWidth
          const y = Math.floor(index / columns) * cellHeight
          context.fillStyle = color
          context.fillRect(
            x,
            y,
            Math.max(1, cellWidth - gap),
            Math.max(1, cellHeight - gap),
          )
        })
        context.restore()
      }

      render()
      const timer = window.setInterval(render, 120)
      ;(
        window as unknown as {
          __bcIdlePrefetchVisual?: {
            setPhase: (message: string, tone: string) => void
            markHit: (id: string) => void
            snapshot: () => {
              peakMounted: number
              maxNearProjectedHeight: number
              maxActiveSweepCount: number
            }
            stop: () => void
          }
        }
      ).__bcIdlePrefetchVisual = {
        setPhase(message, tone) {
          panel.dataset['tone'] = tone
          const phase = panel.querySelector<HTMLElement>('.bc-v-phase')
          if (phase) phase.textContent = message
        },
        markHit(id) {
          const index = idToLocalIndex.get(id)
          if (index !== undefined) hitHistory.add(index)
          render()
        },
        snapshot() {
          return {
            peakMounted,
            maxNearProjectedHeight,
            maxActiveSweepCount,
          }
        },
        stop() {
          window.clearInterval(timer)
          cancelAnimationFrame(sweepFrame)
          panel.remove()
        },
      }
    },
    {selector: editorSelector, rootIds: [...insertedIds]},
  )
}

async function setVisualPhase(
  page: Page,
  message: string,
  tone: 'paused' | 'warming' | 'handoff' | 'success',
): Promise<void> {
  await page.evaluate(
    ({nextMessage, nextTone}) => {
      const controller = (
        window as unknown as {
          __bcIdlePrefetchVisual?: {
            setPhase: (message: string, tone: string) => void
          }
        }
      ).__bcIdlePrefetchVisual
      controller?.setPhase(nextMessage, nextTone)
    },
    {nextMessage: message, nextTone: tone},
  )
}

async function readVisualState(page: Page) {
  return page.evaluate(selector => {
    const editor = document.querySelector(selector)
    const debug = (
      window as unknown as {
        ng: {getComponent: (target: Element) => {doc: any}}
      }
    ).ng
    const doc = debug.getComponent(editor!).doc
    const manager = doc.virtualization as any
    const nearIds = [...manager.idlePrefetchNearRootIds] as string[]
    const projection = manager.layoutProjection
    const nearProjectedHeight = nearIds.reduce((height, id) => {
      const index = manager.indexById.get(id)
      return index === undefined ? height : height + projection.extentAt(index)
    }, 0)
    const visual = (
      window as unknown as {
        __bcIdlePrefetchVisual?: {
          snapshot: () => {
            peakMounted: number
            maxNearProjectedHeight: number
            maxActiveSweepCount: number
          }
        }
      }
    ).__bcIdlePrefetchVisual
    const mountedIds = doc.vm.getMountedRootChildIds() as string[]
    return {
      diagnostics: manager.captureIdlePrefetchDiagnostics() as {
        enabled: boolean
        disabled: boolean
        candidates: number
        nearMounts: number
        sweepMounts: number
        hits: number
        cancellations: number
        failures: number
        deniedFlavours: string[]
        mountDurations: number[]
        estimateErrors: number[]
        anchorCorrections: number[]
        failureReasons: Record<string, number>
      },
      nearIds,
      nearProjectedHeight,
      viewportHeight: doc.scrollContainer.clientHeight as number,
      activeSweepCount: manager.idlePrefetchActiveSweep ? 1 : 0,
      mountedIds,
      mountedCount: mountedIds.length,
      totalRootCount: (doc.model.getChildrenIds(doc.rootId) as string[]).length,
      fullMountFallback: manager.fullMountFallback === true,
      visualPeak: visual?.snapshot() ?? {
        peakMounted: mountedIds.length,
        maxNearProjectedHeight: nearProjectedHeight,
        maxActiveSweepCount: manager.idlePrefetchActiveSweep ? 1 : 0,
      },
    }
  }, editorSelector)
}

async function smoothlyScrollToRoot(
  page: Page,
  blockId: string,
  fast: boolean,
): Promise<void> {
  await page.evaluate(
    async ({selector, targetId, fastMode}) => {
      const editor = document.querySelector(selector)
      const debug = (
        window as unknown as {
          ng: {getComponent: (target: Element) => {doc: any}}
        }
      ).ng
      const doc = debug.getComponent(editor!).doc
      const manager = doc.virtualization as any
      const index = manager.indexById.get(targetId)
      if (index === undefined)
        throw new Error(`Unknown warmed root: ${targetId}`)
      const container = doc.scrollContainer as HTMLElement
      const start = container.scrollTop
      const end = manager._layoutToVisual(
        manager.layoutProjection.contentOffsetAt(index),
      )
      const steps = fastMode ? 2 : 36
      for (let step = 1; step <= steps; step++) {
        const progress = step / steps
        const eased = 1 - Math.pow(1 - progress, 3)
        container.scrollTop = start + (end - start) * eased
        container.dispatchEvent(new Event('scroll'))
        await new Promise<void>(resolve => {
          if (fastMode) requestAnimationFrame(() => resolve())
          else window.setTimeout(resolve, 24)
        })
      }
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      )
    },
    {selector: editorSelector, targetId: blockId, fastMode: fast},
  )
}
