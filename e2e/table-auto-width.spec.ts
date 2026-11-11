import {expect, test, type Page} from '@playwright/test'

const rootSelector = '[data-block-id="table-auto-width-test"]'

interface SetupOptions {
  useDefaultSizing?: boolean
  scale?: number
  merged?: boolean
  paginated?: boolean
  rows?: number
  columns?: number
}

async function setup(page: Page, options: SetupOptions = {}) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng
    ?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  await page.evaluate(({useDefaultSizing = false, scale = 1, merged = false, paginated = false, rows = 4, columns = 3}) => {
    const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const viewport = document.createElement('div')
    viewport.style.cssText = 'position:fixed;left:20px;top:30px;width:1100px;height:700px;overflow:auto;background:white;z-index:100'
    const mount = document.createElement('div')
    mount.style.width = '640px'
    viewport.appendChild(mount)
    document.body.appendChild(viewport)
    const snapshot = source.schemas.createSnapshot('table', [rows, columns])
    if (!useDefaultSizing) delete snapshot.props.columnSizing // Existing/manual document fixture.
    snapshot.props.colWidths = Array(columns).fill(140)
    snapshot.children.forEach((row: any, r: number) => row.children.forEach((cell: any, c: number) => {
      const text = c === 0 ? String(r + 1) : c === 1 ? '名称'
        : '这是一段需要根据可用空间自然换行的说明文字，短内容列应当保留较小宽度。'
      cell.children = [source.schemas.createSnapshot('paragraph', [text])]
    }))
    if (merged) {
      snapshot.children[0].children[0].props.colspan = 3
      snapshot.children[0].children[0].children = [source.schemas.createSnapshot('paragraph', ['合并标题：项目内容与交付说明'])]
      snapshot.children[0].children[1].props.display = 'none'
      snapshot.children[0].children[2].props.display = 'none'
      snapshot.children[1].children[0].props.rowspan = 2
      snapshot.children[2].children[0].props.display = 'none'
    }
    if (paginated) {
      snapshot.children[0].children[2].children = [source.schemas.createSnapshot('paragraph', [
        Array.from({length: 35}, (_, index) => `${index + 1}. 自动列宽跨页正文需要在容器收窄和文字变化后正确重新排版。`).join('\n'),
      ])]
    }
    const root = source.schemas.createSnapshot('root', ['table-auto-width-test', [snapshot]])
    const Pagination = source.plugins.find((plugin: any) => plugin.name === 'pagination')?.constructor
    if (paginated && !Pagination) throw new Error('PaginationPlugin is unavailable')
    const pagination = paginated ? new Pagination({
      pageSize: {width: 720, height: 540},
      margins: {top: 48, right: 48, bottom: 48, left: 48},
      pageGap: 28,
      widowOrphanLines: 2,
    }) : null
    const doc = new source.constructor({
      ...source.config, yDoc: new source.yDoc.constructor(), docId: root.id,
      plugins: pagination ? [pagination] : [], scrollContainer: viewport,
      readonly: false, virtualization: {enabled: false},
    })
    doc.initBySnapshot(root, mount)
    doc.viewScale.attach(mount)
    doc.viewScale.setScale(scale)
    ;(window as any).__autoWidth = {doc, viewport, mount, tableId: snapshot.id, pagination, scale, updates: 0}
  }, options)
  await expect(page.locator(`${rootSelector} .table-block`)).toBeVisible()
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
}

async function frames(page: Page, count = 4) {
  await page.evaluate(async count => {
    for (let i = 0; i < count; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  }, count)
}

async function state(page: Page, rowIndex = 3) {
  return page.evaluate(rowIndex => {
    const {doc, tableId, scale} = (window as any).__autoWidth
    const table = doc.getBlockById(tableId)
    const cells = table.getChildrenByIndex(rowIndex).getChildrenBlocks()
      .filter((cell: any) => cell.props.display !== 'none')
    const widths = cells.map((cell: any) => cell.hostElement.getBoundingClientRect().width / scale)
    const bars = Array.from(table.hostElement.querySelectorAll('table-col-bar > .handle')) as HTMLElement[]
    const barWidths = bars.map(bar => bar.getBoundingClientRect().width / scale)
    const element = table.hostElement.querySelector('table') as HTMLTableElement
    return {
      auto: table.props.columnSizing === 'auto',
      stored: [...table.props.colWidths] as number[],
      widths: widths as number[],
      barWidths,
      total: element.getBoundingClientRect().width / scale,
      available: table._getParentContentWidth() as number,
      layout: getComputedStyle(element).tableLayout,
    }
  }, rowIndex)
}

async function enable(page: Page) {
  await page.evaluate(() => {
    const {doc, tableId} = (window as any).__autoWidth
    doc.getBlockById(tableId).setAutoColumnWidths(true)
  })
  await expect.poll(async () => (await state(page)).auto).toBe(true)
  await frames(page)
}

async function expectAligned(page: Page) {
  await expect.poll(async () => {
    const result = await state(page)
    return result.barWidths.length === result.widths.length
      && result.widths.every((width, i) => Math.abs(width - result.barWidths[i]) < 3)
  }).toBe(true)
}

test('新建表格默认自动列宽，旧文档缺省仍使用固定列宽', async ({page}) => {
  await setup(page, {useDefaultSizing: true})
  await expect.poll(async () => (await state(page)).layout).toBe('auto')
  expect((await state(page)).auto).toBe(true)
  await expectAligned(page)
  await setup(page)
  const legacy = await state(page)
  expect(legacy.auto).toBe(false)
  expect(legacy.layout).toBe('fixed')
  // Legacy fixed tables retain their col attributes. Firefox can distribute
  // extra table space beyond those hints, so do not assert exact pixel widths.
  const storedWidths = await page.locator(`${rootSelector} colgroup > col`)
    .evaluateAll(columns => columns.map(column => Number(column.getAttribute('width'))))
  expect(storedWidths).toEqual(legacy.stored)
})

test('自动列宽随输入及父容器变化，控制条对齐且布局不写入协同数据', async ({page}) => {
  await setup(page)
  await page.evaluate(() => {
    const {doc, tableId} = (window as any).__autoWidth
    doc.getBlockById(tableId).onColBarSelected([0, 0])
  })
  await page.getByRole('button', {name: '自动列宽', exact: true}).click()
  await expect.poll(async () => (await state(page)).layout).toBe('auto')
  await expectAligned(page)
  const before = await state(page)
  expect(before.widths[2]).toBeGreaterThan(before.widths[1])
  expect(before.total).toBeLessThanOrEqual(before.available + 3)
  await page.evaluate(() => {
    const {doc, tableId} = (window as any).__autoWidth
    const paragraph = doc.getBlockById(tableId).getChildrenByIndex(3).getChildrenByIndex(1).firstChildren
    paragraph.hostElement.focus({preventScroll: true})
    doc.selection.setCursorAt(paragraph, paragraph.textLength)
  })
  await page.keyboard.insertText('这是一段明显更长的项目名称，需要自动增加这一列的宽度')
  await expect.poll(async () => (await state(page)).widths[1]).toBeGreaterThan(before.widths[1] + 20)
  await expectAligned(page)
  expect((await state(page)).stored).toEqual(before.stored)

  await page.evaluate(() => {
    const state = (window as any).__autoWidth
    state.doc.yDoc.on('update', () => state.updates++)
    state.mount.style.width = '420px'
  })
  await expect.poll(async () => (await state(page)).total).toBeLessThan(before.total - 100)
  await expectAligned(page)
  const smaller = await state(page)
  expect(smaller.total).toBeLessThanOrEqual(smaller.available + 3)
  expect(smaller.stored).toEqual(before.stored)
  expect(await page.evaluate(() => (window as any).__autoWidth.updates)).toBe(0)
})

test('合并标题和跨行单元格保持自动布局及真实列控制条边界', async ({page}) => {
  await setup(page, {merged: true})
  await enable(page)
  await expectAligned(page)
  await page.evaluate(() => { (window as any).__autoWidth.mount.style.width = '430px' })
  await expect.poll(async () => (await state(page)).total).toBeLessThan(435)
  await expectAligned(page)
  const result = await page.evaluate(() => {
    const {doc, tableId} = (window as any).__autoWidth
    const table = doc.getBlockById(tableId)
    return {
      title: table.firstChildren.firstChildren.hostElement.getBoundingClientRect().width,
      row: table.getChildrenByIndex(3).hostElement.getBoundingClientRect().width,
      colspan: table.firstChildren.firstChildren.props.colspan,
      rowspan: table.getChildrenByIndex(1).firstChildren.props.rowspan,
    }
  })
  expect(Math.abs(result.title - result.row)).toBeLessThan(3)
  expect(result.colspan).toBe(3)
  expect(result.rowspan).toBe(2)
})

test('缩放下手动拖宽冻结当前布局，一次撤销恢复自动列宽', async ({page}) => {
  const scale = 1.5
  await setup(page, {scale})
  await enable(page)
  const before = await state(page)
  const cell = page.locator(`${rootSelector} .table-row-block`).first().locator('td').first()
  const box = (await cell.boundingBox())!
  const x = box.x + box.width - 1
  const y = box.y + Math.min(box.height / 2, 20 * scale)
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 40 * scale, y, {steps: 8})
  await page.mouse.up()
  await expect.poll(async () => (await state(page)).auto).toBe(false)
  const fixed = await state(page)
  expect(Math.abs(fixed.stored[0] - before.widths[0] - 40)).toBeLessThan(3)
  expect(fixed.stored.slice(1).every((width, i) => Math.abs(width - before.widths[i + 1]) < 3)).toBe(true)
  await page.evaluate(() => (window as any).__autoWidth.doc.crud.undoManager.undo())
  await expect.poll(async () => (await state(page)).auto).toBe(true)
  expect((await state(page)).stored).toEqual(before.stored)
  await expectAligned(page)
})

for (const command of ['fitColumnWidths', 'optimizeColumnWidths', 'setEqualColumnWidths'] as const) {
  test(`${command} 显式固定自动表格，撤销同时恢复模式`, async ({page}) => {
    await setup(page)
    await enable(page)
    await page.evaluate(async command => {
      const {doc, tableId} = (window as any).__autoWidth
      await doc.getBlockById(tableId)[command]()
    }, command)
    await expect.poll(async () => (await state(page)).auto).toBe(false)
    await page.evaluate(() => (window as any).__autoWidth.doc.crud.undoManager.undo())
    await expect.poll(async () => (await state(page)).auto).toBe(true)
  })
}

test('快照重开保留自动模式，只读随容器重排且不产生数据变更', async ({page}) => {
  await setup(page)
  await enable(page)
  await page.evaluate(() => {
    const state = (window as any).__autoWidth
    const {doc, mount} = state
    const snapshot = doc.exportSnapshot()
    const reopened = new doc.constructor({...doc.config, yDoc: new doc.yDoc.constructor(), readonly: true})
    doc.destroy()
    mount.replaceChildren()
    reopened.initBySnapshot(snapshot, mount)
    reopened.viewScale.attach(mount)
    state.doc = reopened
    state.beforeReadonly = JSON.stringify(reopened.exportSnapshot())
    state.updates = 0
    reopened.yDoc.on('update', () => state.updates++)
    reopened.getBlockById(state.tableId).setAutoColumnWidths(false)
  })
  await expect.poll(async () => (await state(page)).auto).toBe(true)
  const before = await state(page)
  await page.evaluate(() => { (window as any).__autoWidth.mount.style.width = '420px' })
  await expect.poll(async () => (await state(page)).total).toBeLessThan(before.total - 100)
  const unchanged = await page.evaluate(() => {
    const state = (window as any).__autoWidth
    return {updates: state.updates, equal: JSON.stringify(state.doc.exportSnapshot()) === state.beforeReadonly}
  })
  expect(unchanged).toEqual({updates: 0, equal: true})
})

test('关闭自动列宽冻结当前实际几何，撤销后重新适应当前容器', async ({page}) => {
  await setup(page)
  await enable(page)
  const before = await state(page)
  await page.evaluate(() => {
    const {doc, tableId} = (window as any).__autoWidth
    doc.getBlockById(tableId).setAutoColumnWidths(false)
  })
  await expect.poll(async () => (await state(page)).auto).toBe(false)
  const fixed = await state(page)
  expect(fixed.stored.every((width, index) => Math.abs(width - before.widths[index]) < 3)).toBe(true)
  await page.evaluate(() => { (window as any).__autoWidth.mount.style.width = '420px' })
  await frames(page)
  expect(Math.abs((await state(page)).total - before.total)).toBeLessThan(3)
  await page.evaluate(() => (window as any).__autoWidth.doc.crud.undoManager.undo())
  await expect.poll(async () => (await state(page)).auto).toBe(true)
  await expect.poll(async () => (await state(page)).total).toBeLessThan(before.total - 100)
  expect((await state(page)).stored).toEqual(before.stored)
  await expectAligned(page)
})

test('全屏和全屏缩放保留正文宽度预算，不把屏幕尺寸写入文档', async ({page}) => {
  await setup(page)
  await enable(page)
  const before = await state(page)
  await page.evaluate(() => {
    const state = (window as any).__autoWidth
    state.doc.yDoc.on('update', () => state.updates++)
    const table = state.doc.getBlockById(state.tableId)
    table.setFullscreen(true)
    table.setFullscreenZoom(1.5)
  })
  await frames(page, 6)
  const fullscreen = await page.evaluate(() => {
    const {doc, tableId} = (window as any).__autoWidth
    const table = doc.getBlockById(tableId)
    return {
      widths: table.getChildrenByIndex(3).getChildrenBlocks().map((cell: any) => cell.hostElement.offsetWidth) as number[],
      zoom: table.fullscreenZoom,
      available: table._getParentContentWidth(),
    }
  })
  expect(fullscreen.zoom).toBe(1.5)
  expect(fullscreen.widths.every((width, index) => Math.abs(width - before.widths[index]) < 3)).toBe(true)
  expect(Math.abs(fullscreen.available - before.available)).toBeLessThan(3)
  await page.evaluate(() => {
    const {doc, tableId} = (window as any).__autoWidth
    doc.getBlockById(tableId).fullscreenFitToWidth()
  })
  await frames(page)
  await page.evaluate(() => {
    const {doc, tableId} = (window as any).__autoWidth
    doc.getBlockById(tableId).setFullscreen(false)
  })
  await expectAligned(page)
  const restored = await state(page)
  expect(restored.auto).toBe(true)
  expect(restored.stored).toEqual(before.stored)
  expect(restored.widths.every((width, index) => Math.abs(width - before.widths[index]) < 3)).toBe(true)
  expect(await page.evaluate(() => (window as any).__autoWidth.updates)).toBe(0)
})

test('自动表格增删行列和移动列后保留模式并同步控制条', async ({page}) => {
  await setup(page)
  await enable(page)
  await page.evaluate(() => {
    const {doc, tableId} = (window as any).__autoWidth
    const table = doc.getBlockById(tableId)
    table.addColumn(1)
    table.addRow(2)
  })
  await expect.poll(async () => (await state(page)).widths.length).toBe(4)
  await expectAligned(page)
  await page.evaluate(() => {
    const {doc, tableId} = (window as any).__autoWidth
    const table = doc.getBlockById(tableId)
    table.deleteColumns(1)
    table.deleteRows(2)
  })
  await expect.poll(async () => (await state(page)).widths.length).toBe(3)
  await expectAligned(page)
  await page.evaluate(() => {
    const {doc, tableId} = (window as any).__autoWidth
    const table = doc.getBlockById(tableId)
    ;(window as any).__autoWidth.movedCellIds = table.getChildrenBlocks().map((row: any) => row.firstChildren.id)
    table.onColReorderStart({fromIndex: 0, count: 1})
    const rect = table.hostElement.querySelector('table').getBoundingClientRect()
    table.onColReorderMove({cursorX: rect.right - 1})
    table.onColReorderEnd({commit: true})
  })
  await expect.poll(async () => (await state(page)).widths.length).toBe(3)
  await expectAligned(page)
  const result = await page.evaluate(() => {
    const {doc, tableId, movedCellIds} = (window as any).__autoWidth
    const table = doc.getBlockById(tableId)
    return {
      auto: table.isAutoColumnWidth,
      rows: table.rowLength,
      indices: table.getChildrenBlocks().map((row: any, index: number) => row.childrenIds.indexOf(movedCellIds[index])),
      columns: table.colLength,
      metricCount: table.hostElement.querySelectorAll('tfoot td').length,
    }
  })
  expect(result).toEqual({auto: true, rows: 4, indices: [2, 2, 2, 2], columns: 3, metricCount: 3})
})

test('100行10列自动表格的内容和容器变化收敛，仅内容事务写入Yjs', async ({page}, testInfo) => {
  test.setTimeout(90_000)
  await setup(page, {rows: 100, columns: 10})
  await page.evaluate(() => { (window as any).__autoWidth.mount.style.width = '960px' })
  await enable(page)
  await expectAligned(page)
  const result = await page.evaluate(async () => {
    const {doc, tableId, mount} = (window as any).__autoWidth
    const table = doc.getBlockById(tableId)
    const element = table.hostElement.querySelector('table') as HTMLTableElement
    const cells = table.getChildrenByIndex(3).getChildrenBlocks()
    const stored = JSON.stringify(table.props.colWidths)
    let updates = 0
    const onUpdate = () => { updates++ }
    doc.yDoc.on('update', onUpdate)
    const geometry = () => ({
      widths: cells.map((cell: any) => cell.hostElement.getBoundingClientRect().width) as number[],
      width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height,
    })
    const settle = async (started: number) => {
      let previous = ''
      let sameFrames = 0
      let current = geometry()
      for (let frame = 0; frame < 120; frame++) {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
        current = geometry()
        const signature = JSON.stringify(current)
        sameFrames = signature === previous ? sameFrames + 1 : 0
        previous = signature
        if (sameFrames >= 3) return {stable: true, milliseconds: performance.now() - started, geometry: current}
      }
      return {stable: false, milliseconds: performance.now() - started, geometry: current}
    }
    try {
      const before = geometry()
      const paragraph = table.getChildrenByIndex(50).getChildrenByIndex(1).firstChildren
      const contentStart = performance.now()
      doc.crud.transact(() => paragraph.insertText(paragraph.textLength, '新增的一段较长名称应参与自动列宽布局，同时不会触发额外持久化更新。'))
      const content = await settle(contentStart)
      const updatesAfterContent = updates
      const containerStart = performance.now()
      mount.style.width = '720px'
      const container = await settle(containerStart)
      return {before, content, container, updatesAfterContent, updatesAfterContainer: updates,
        storedUnchanged: stored === JSON.stringify(table.props.colWidths)}
    } finally {
      doc.yDoc.off('update', onUpdate)
    }
  })
  expect(result.content.stable).toBe(true)
  expect(result.container.stable).toBe(true)
  expect(result.content.geometry.widths[1]).toBeGreaterThan(result.before.widths[1])
  expect(result.container.geometry.width).toBeLessThan(result.content.geometry.width - 100)
  expect(result.updatesAfterContent).toBe(1)
  expect(result.updatesAfterContainer).toBe(1)
  expect(result.storedUnchanged).toBe(true)
  await expectAligned(page)
  const observation = {
    browser: testInfo.project.name, rows: 100, columns: 10,
    contentToStableMs: Math.round(result.content.milliseconds),
    containerToStableMs: Math.round(result.container.milliseconds),
    stableFramesRequired: 3,
  }
  console.log(`自动列宽大表观测 ${JSON.stringify(observation)}`)
  await testInfo.attach('auto-width-large-table-observation', {
    body: JSON.stringify(observation, null, 2), contentType: 'application/json',
  })
})

test('真实分页的长单元格在纸张缩窄与继续输入后收敛，不残留旧列宽', async ({page}) => {
  test.setTimeout(90_000)
  await setup(page, {paginated: true})
  await enable(page)
  await page.evaluate(() => {
    const {pagination} = (window as any).__autoWidth
    pagination.enable()
    pagination.recompute()
  })
  const masks = page.locator(`${rootSelector} .bc-pagination-table-flow-mask`)
  await expect.poll(() => masks.count(), {timeout: 30_000}).toBeGreaterThan(0)
  await frames(page, 8)
  const before = await state(page)
  await page.evaluate(() => {
    const {pagination} = (window as any).__autoWidth
    pagination.updateConfig({pageSize: {width: 520, height: 540}})
  })
  await expect.poll(async () => (await state(page)).total, {timeout: 30_000}).toBeLessThan(before.total - 120)
  await expectAligned(page)
  await page.evaluate(() => {
    const {doc, tableId} = (window as any).__autoWidth
    const paragraph = doc.getBlockById(tableId).firstChildren.getChildrenByIndex(2).firstChildren
    paragraph.insertText(paragraph.textLength, '\n新增内容仍然需要正确分页并保持自动列宽。'.repeat(5))
  })
  await expect.poll(() => masks.count(), {timeout: 30_000}).toBeGreaterThan(0)
  await frames(page, 10)
  const settled = await state(page)
  expect(settled.total).toBeLessThanOrEqual(settled.available + 3)
  expect(settled.stored).toEqual(before.stored)
  const samples = await page.evaluate(async () => {
    const {doc, tableId} = (window as any).__autoWidth
    const table = doc.getBlockById(tableId)
    const samples: string[] = []
    for (let index = 0; index < 12; index++) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      const rect = table.hostElement.querySelector('table').getBoundingClientRect()
      samples.push(`${Math.round(rect.width)}:${Math.round(rect.height)}:${table.hostElement.querySelectorAll('.bc-pagination-table-flow-mask').length}`)
    }
    return samples
  })
  expect(new Set(samples).size, '空闲状态不应持续出现列宽/分页高度反馈循环').toBe(1)
  await page.screenshot({path: test.info().outputPath('auto-width-pagination.png')})
})
