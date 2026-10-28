import {expect, test, type Page} from '@playwright/test'

async function setup(page: Page, scale = 1, rows = 3, values?: string[][]) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng
    ?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  await page.evaluate(({scale, rows, values}) => {
    const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const viewport = document.createElement('div')
    viewport.style.cssText = 'position:fixed;left:20px;top:30px;width:1100px;height:700px;overflow:auto;background:white;z-index:100'
    const mount = document.createElement('div')
    mount.style.cssText = 'width:640px'
    viewport.appendChild(mount)
    document.body.appendChild(viewport)
    const snapshot = source.schemas.createSnapshot('table', [rows, values?.[0].length ?? 3])
    snapshot.props.colWidths = values ? Array(values[0].length).fill(140) : [260, 80, 160]
    snapshot.children.forEach((row: any, r: number) => row.children.forEach((cell: any, c: number) => {
      const text = values?.[r][c] ?? (c === 0 ? '编号' : c === 1 ? 'This column has a considerably longer description' : '第一行\n第二行')
      cell.children = [source.schemas.createSnapshot('paragraph', [text])]
    }))
    const root = source.schemas.createSnapshot('root', ['column-fit-test', [snapshot]])
    const doc = new source.constructor({
      ...source.config, yDoc: new source.yDoc.constructor(), docId: root.id,
      plugins: [], scrollContainer: viewport, readonly: false, virtualization: {enabled: false},
    })
    doc.initBySnapshot(root, mount)
    doc.viewScale.attach(mount)
    doc.viewScale.setScale(scale)
    ;(window as any).__columnFit = {doc, viewport, mount, tableId: snapshot.id}
  }, {scale, rows, values})
  await expect(page.locator('[data-block-id="column-fit-test"] .table-block')).toBeVisible()
}

async function widths(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const {doc, tableId} = (window as any).__columnFit
    return [...doc.getBlockById(tableId).props.colWidths]
  })
}

for (const scale of [0.75, 1.5]) {
  test(`双击列边界：缩放 ${scale} 下收窄短列且一次撤销恢复`, async ({page}) => {
    await setup(page, scale)
    const cell = page.locator('[data-block-id="column-fit-test"] td').first()
    const box = (await cell.boundingBox())!
    await page.mouse.move(box.x + box.width - 1, box.y + 20)
    await page.mouse.dblclick(box.x + box.width - 1, box.y + 20)
    await expect.poll(async () => (await widths(page))[0]).toBeLessThan(90)
    expect((await widths(page)).slice(1)).toEqual([80, 160])
    await page.evaluate(() => (window as any).__columnFit.doc.crud.undoManager.undo())
    await expect.poll(() => widths(page)).toEqual([260, 80, 160])
    // 原有单列拖动仍然只改变一列，并按文档缩放转换鼠标距离。
    const restored = (await cell.boundingBox())!
    await page.mouse.move(restored.x + restored.width - 1, restored.y + 20)
    await page.mouse.down()
    await page.mouse.move(restored.x + restored.width - 1 + 40 * scale, restored.y + 20, {steps: 10})
    await page.mouse.up()
    await expect.poll(async () => Math.round((await widths(page))[0])).toBe(300)
    expect((await widths(page)).slice(1)).toEqual([80, 160])
  })
}

test('菜单选中多列、长文本上限、富文本、全屏一致性和快照重开', async ({page}) => {
  await setup(page)
  await page.evaluate(() => {
    const {doc, tableId} = (window as any).__columnFit
    doc.getBlockById(tableId).onColBarSelected([0, 1])
  })
  await page.getByRole('button', {name: '适应宽度', exact: true}).click()
  await expect.poll(async () => (await widths(page))[1]).toBeGreaterThan(300)
  const fit = await widths(page)
  expect(fit[0]).toBeLessThan(90)
  expect(fit[2]).toBe(160)
  const result = await page.evaluate(async () => {
    const state = (window as any).__columnFit
    const {doc, tableId, mount} = state
    const table = doc.getBlockById(tableId)
    table.setFullscreen(true)
    await table.fitColumnWidths(0, 2)
    const fullscreen = [...table.props.colWidths]
    table.setFullscreen(false)
    const paragraph = table.firstChildren.getChildrenByIndex(1).firstChildren
    paragraph.hostElement.style.fontSize = '32px'
    await table.fitColumnWidths(1, 1)
    const largeFont = table.props.colWidths[1]
    const snapshot = doc.exportSnapshot()
    const reopenedMount = document.createElement('div')
    mount.appendChild(reopenedMount)
    const reopened = new doc.constructor({...doc.config, yDoc: new doc.yDoc.constructor()})
    reopened.initBySnapshot(snapshot, reopenedMount)
    const persisted = [...reopened.getBlockById(tableId).props.colWidths]
    reopened.destroy()
    reopenedMount.remove()
    return {fullscreen, largeFont, persisted, width: table._getParentContentWidth()}
  })
  expect(result.fullscreen).toEqual(fit)
  expect(result.largeFont).toBeGreaterThan(fit[1])
  expect(result.largeFont).toBeLessThanOrEqual(result.width)
  expect(result.persisted).toEqual(await widths(page))
  await page.screenshot({path: test.info().outputPath('column-fit.png')})
})

test('智能调整收紧编号和金额，将正文宽度留给说明并降低实际行高', async ({page}) => {
  const values = Array.from({length: 8}, (_, i) => [String(i + 1), '设备采购', '120.00',
    '这是需要合理换行的说明文字，包含交付条件、验收要求以及后续维护安排。避免因为一段长内容让整张表超出正文。'])
  await setup(page, 1, values.length, values)
  await page.evaluate(() => {
    const {doc, tableId} = (window as any).__columnFit
    const table = doc.getBlockById(tableId)
    table.onColBarSelected([0, 0])
  })
  await page.getByRole('button', {name: '均分列宽', exact: true}).click()
  const before = await widths(page)
  const tableElement = page.locator('[data-block-id="column-fit-test"] table').first()
  const initialHeight = (await tableElement.boundingBox())!.height
  await page.getByRole('button', {name: '智能调整列宽', exact: true}).click()
  await expect.poll(async () => (await widths(page))[3]).toBeGreaterThan(250)
  const fit = await widths(page)
  expect(fit[0]).toBeLessThan(90)
  expect(fit[2]).toBeLessThan(110)
  await expect.poll(async () => (await tableElement.boundingBox())!.height).toBeLessThan(initialHeight)
  const result = await page.evaluate(async () => {
    const {doc, tableId} = (window as any).__columnFit
    const table = doc.getBlockById(tableId)
    const available = table._getParentContentWidth()
    doc.crud.undoManager.undo()
    const undone = [...table.props.colWidths]
    doc.crud.undoManager.redo()
    table.setFullscreen(true)
    table.setFullscreenZoom(1.5)
    await table.optimizeColumnWidths()
    const fullscreen = [...table.props.colWidths]
    table.setFullscreen(false)
    const same = await table.optimizeColumnWidths()
    const snapshot = doc.exportSnapshot()
    return {available, undone, fullscreen, same,
      saved: snapshot.children.find((child: any) => child.id === tableId).props.colWidths}
  })
  expect(fit.reduce((sum, width) => sum + width)).toBeLessThanOrEqual(result.available)
  expect(result.undone).toEqual(before)
  expect(result.fullscreen).toEqual(fit)
  expect(result.saved).toEqual(fit)
  expect(result.same).toBe(false)
  await page.screenshot({path: test.info().outputPath('smart-column-fit.png')})
})

test('智能调整处理合并标题，计算中编辑会取消且只读不写入', async ({page}) => {
  const values = Array.from({length: 50}, (_, i) => [String(i + 1), '2026-10-27', '这是一段需要换行的备注说明文字，不应把表格撑出正文。'])
  await setup(page, 0.75, values.length, values)
  const result = await page.evaluate(async () => {
    const {doc, tableId} = (window as any).__columnFit
    const table = doc.getBlockById(tableId)
    doc.crud.transact(() => {
      const row = table.firstChildren
      row.firstChildren.updateProps({colspan: 3})
      row.firstChildren.firstChildren.insertText(0, '采购计划与验收记录')
      row.getChildrenByIndex(1).updateProps({display: 'none'})
      row.getChildrenByIndex(2).updateProps({display: 'none'})
    })
    await table.optimizeColumnWidths()
    const merged = [...table.props.colWidths]
    const available = table._getParentContentWidth()
    const pending = table.optimizeColumnWidths()
    table.updateProps({colWidths: [111, 222, 333]})
    const cancelled = await pending
    doc.toggleReadonly(true)
    const readonly = await table.optimizeColumnWidths()
    return {merged, available, cancelled, readonly, widths: [...table.props.colWidths]}
  })
  expect(result.merged.reduce((sum, width) => sum + width)).toBeLessThanOrEqual(result.available)
  expect(result.merged[0]).toBeLessThan(result.merged[2])
  expect(result.cancelled).toBe(false)
  expect(result.readonly).toBe(false)
  expect(result.widths).toEqual([111, 222, 333])
})

test('跨列合并忽略、跨行只算一次，并测量屏幕外行', async ({page}) => {
  await setup(page, 1, 50)
  const result = await page.evaluate(async () => {
    const {doc, tableId} = (window as any).__columnFit
    const table = doc.getBlockById(tableId)
    doc.crud.transact(() => {
      for (const row of table.getChildrenBlocks()) {
        row.getChildrenByIndex(1).updateProps({colspan: 2})
        row.getChildrenByIndex(2).updateProps({display: 'none'})
      }
      table.firstChildren.firstChildren.updateProps({rowspan: 2})
      table.getChildrenByIndex(1).firstChildren.updateProps({display: 'none'})
      const lastParagraph = table.getChildrenByIndex(49).firstChildren.firstChildren
      lastParagraph.insertText(0, '屏幕之外这一行有最长的文字需要参与整列宽度计算')
    })
    await table.fitColumnWidths()
    return [...table.props.colWidths]
  })
  expect(result[0]).toBeGreaterThan(250)
  expect(result.slice(1)).toEqual([80, 160])
})

test('分批测量期间发生内容修改则取消，且只读不写入', async ({page}) => {
  await setup(page, 1, 50)
  const result = await page.evaluate(async () => {
    const {doc, tableId} = (window as any).__columnFit
    const table = doc.getBlockById(tableId)
    const pending = table.fitColumnWidths()
    table.updateProps({colWidths: [111, 222, 333]})
    const cancelled = await pending
    doc.toggleReadonly(true)
    const readonly = await table.fitColumnWidths()
    return {cancelled, readonly, widths: [...table.props.colWidths]}
  })
  expect(result).toEqual({cancelled: false, readonly: false, widths: [111, 222, 333]})
})

test('多列选区双击保持范围，分页文字占位不改变测量结果', async ({page}) => {
  await setup(page)
  await page.evaluate(() => {
    const {doc, tableId} = (window as any).__columnFit
    doc.getBlockById(tableId).onColBarSelected([0, 1])
  })
  const cell = page.locator('[data-block-id="column-fit-test"] td').first()
  const box = (await cell.boundingBox())!
  await page.mouse.move(box.x + box.width - 1, box.y + 20)
  await page.mouse.dblclick(box.x + box.width - 1, box.y + 20)
  await expect.poll(async () => (await widths(page))[1]).toBeGreaterThan(300)
  const fit = await widths(page)
  expect(fit[0]).toBeLessThan(90)
  expect(fit[2]).toBe(160)
  const result = await page.evaluate(async () => {
    const {doc, tableId} = (window as any).__columnFit
    const table = doc.getBlockById(tableId)
    doc.crud.undoManager.undo()
    const undone = [...table.props.colWidths]
    doc.crud.undoManager.redo()
    const redone = [...table.props.colWidths]
    table.updateProps({colWidths: [260, 80, 160]})
    const row = table.firstChildren
    const cell = row.getChildrenByIndex(1)
    table._applyPaginationBreaks([
      {beforeRowId: table.getChildrenByIndex(1).id, gap: 48},
      {
        kind: 'cell-flow', rowId: row.id,
        cells: [{cellId: cell.id, anchor: {kind: 'text', blockId: cell.firstChildren.id, offset: 5},
          gap: 48, backdropOffset: 14, backdropHeight: 20}],
        mask: {top: 70, height: 48, backdropOffset: 14, backdropHeight: 20},
      },
    ])
    const gaps = table.hostElement.querySelectorAll('[data-bc-inline-pagination-gap]').length
    await table.fitColumnWidths(0, 2)
    return {undone, redone, gaps, projected: [...table.props.colWidths]}
  })
  expect(result.undone).toEqual([260, 80, 160])
  expect(result.redone).toEqual(fit)
  expect(result.gaps).toBeGreaterThan(0)
  expect(result.projected).toEqual(fit)
})
