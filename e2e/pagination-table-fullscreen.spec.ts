import {expect, test, type Page} from '@playwright/test'

const editorSelector = 'block-craft-editor'

async function waitForEditor(page: Page): Promise<void> {
  await page.waitForFunction((selector) => {
    const element = document.querySelector(selector)
    const debug = (window as unknown as {
      ng?: {getComponent: (target: Element) => {doc?: {isInitialized?: boolean}}}
    }).ng
    return !!element && !!debug?.getComponent(element)?.doc?.isInitialized
  }, editorSelector)
}

test('paginated table fullscreen fills the viewport and keeps cell input editable', async ({page}) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await waitForEditor(page)

  const target = await page.evaluate(async (selector) => {
    const editor = document.querySelector(selector)!
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor).doc
    const tableId = (doc.model.getChildrenIds(doc.rootId) as string[])
      .find(id => doc.model.getFlavour(id) === 'table')
    if (!tableId) throw new Error('Demo table is unavailable')
    const rowIds = doc.model.getChildrenIds(tableId)
    const cellId = doc.model.getChildrenIds(rowIds[0])[0]
    const paragraphId = doc.model.getChildrenIds(cellId)[0]
    const initialText = doc.model.getTextDeltas(paragraphId)
      .map((delta: {insert: unknown}) => typeof delta.insert === 'string' ? delta.insert : '')
      .join('')
    const pagination = doc.plugins.find((plugin: any) => plugin.name === 'pagination')
    if (!pagination) throw new Error('PaginationPlugin is unavailable')
    pagination.enable()
    await doc.navigateToBlock(tableId)
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
    return {tableId, rowIds, cellId, paragraphId, initialText}
  }, editorSelector)

  const table = page.locator(
    `${editorSelector} .table-block[data-block-id="${target.tableId}"]`,
  )
  const editable = page.locator(
    `${editorSelector} .paragraph-block[data-block-id="${target.paragraphId}"]`,
  )
  await expect(table).toBeVisible()
  const projectionState = await table.evaluate((host, projection) => {
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => any}
    }).ng
    const component = debug.getComponent(host)
    const backgroundScroller = component.doc.scrollContainer as HTMLElement
    const backgroundBefore = {
      overflowX: getComputedStyle(backgroundScroller).overflowX,
      overflowY: getComputedStyle(backgroundScroller).overflowY,
      scrollLeft: backgroundScroller.scrollLeft,
      scrollTop: backgroundScroller.scrollTop,
      maxScrollLeft: Math.max(0, backgroundScroller.scrollWidth - backgroundScroller.clientWidth),
    }
    component._applyPaginationBreaks([
      {beforeRowId: projection.beforeRowId, gap: 48},
      {
        kind: 'cell-flow',
        rowId: projection.rowId,
        cells: [{
          cellId: projection.cellId,
          anchor: {
            kind: 'text',
            blockId: projection.paragraphId,
            offset: Math.min(3, Math.max(1, projection.initialText.length - 1)),
          },
          gap: 48,
          backdropOffset: 14,
          backdropHeight: 20,
        }],
        mask: {top: 70, height: 48, backdropOffset: 14, backdropHeight: 20},
      },
    ])
    const before = {
      masks: host.querySelectorAll('.bc-pagination-table-flow-mask').length,
      spacers: host.querySelectorAll('tr.bc-pagination-spacer').length,
      textGaps: host.querySelectorAll('[data-bc-inline-pagination-gap]').length,
    }
    component.setFullscreen(true)
    const after = {
      masks: host.querySelectorAll('.bc-pagination-table-flow-mask').length,
      spacers: host.querySelectorAll('tr.bc-pagination-spacer').length,
      textGaps: host.querySelectorAll('[data-bc-inline-pagination-gap]').length,
    }
    component.setFullscreen(false)
    const replayed = {
      masks: host.querySelectorAll('.bc-pagination-table-flow-mask').length,
      spacers: host.querySelectorAll('tr.bc-pagination-spacer').length,
      textGaps: host.querySelectorAll('[data-bc-inline-pagination-gap]').length,
    }
    component.setFullscreen(true)
    const tableScroller = host.querySelector<HTMLElement>('.table-scrollable')!
    const root = host.closest<HTMLElement>('[data-blockcraft-root="true"]')!
    return {
      backgroundBefore,
      before,
      after,
      replayed,
      fullscreen: {
        backgroundOverflowX: getComputedStyle(backgroundScroller).overflowX,
        backgroundOverflowY: getComputedStyle(backgroundScroller).overflowY,
        backgroundScrollLeft: backgroundScroller.scrollLeft,
        backgroundScrollTop: backgroundScroller.scrollTop,
        backgroundMaxScrollLeft: Math.max(
          0,
          backgroundScroller.scrollWidth - backgroundScroller.clientWidth,
        ),
        hostOverflowX: getComputedStyle(host).overflowX,
        hostOverflowY: getComputedStyle(host).overflowY,
        tableOverflowX: getComputedStyle(tableScroller).overflowX,
        tableOverflowY: getComputedStyle(tableScroller).overflowY,
        tableMaxScrollLeft: Math.max(0, tableScroller.scrollWidth - tableScroller.clientWidth),
        rootLeft: getComputedStyle(root).left,
        rootTransform: getComputedStyle(root).transform,
      },
    }
  }, {
    beforeRowId: target.rowIds[1],
    rowId: target.rowIds[0],
    cellId: target.cellId,
    paragraphId: target.paragraphId,
    initialText: target.initialText,
  })
  expect(projectionState.before).toEqual({masks: 1, spacers: 1, textGaps: 1})
  expect(projectionState.after).toEqual({masks: 0, spacers: 0, textGaps: 0})
  expect(projectionState.replayed).toEqual(projectionState.before)
  expect(projectionState.fullscreen).toMatchObject({
    backgroundOverflowX: 'hidden',
    backgroundOverflowY: 'hidden',
    backgroundScrollLeft: projectionState.backgroundBefore.scrollLeft,
    backgroundScrollTop: projectionState.backgroundBefore.scrollTop,
    hostOverflowX: 'hidden',
    hostOverflowY: 'auto',
    tableOverflowX: 'auto',
    tableOverflowY: 'hidden',
    tableMaxScrollLeft: 0,
    rootLeft: '0px',
    rootTransform: 'none',
  })
  expect(projectionState.fullscreen.backgroundMaxScrollLeft)
    .toBeLessThanOrEqual(projectionState.backgroundBefore.maxScrollLeft + 1)

  await expect(table).toHaveClass(/\bis-fullscreen\b/)
  await expect(page.locator('body')).toHaveClass(/\bbc-table-fullscreen-lock\b/)
  await expect(table.locator('.bc-pagination-table-flow-mask')).toHaveCount(0)
  await expect(table.locator('tr.bc-pagination-spacer')).toHaveCount(0)
  await expect(table.locator('[data-bc-inline-pagination-gap]')).toHaveCount(0)
  await expect(table).toBeVisible()
  const rect = await table.boundingBox()
  expect(rect).not.toBeNull()
  expect(rect!.x).toBeCloseTo(0, 0)
  expect(rect!.y).toBeCloseTo(0, 0)
  expect(rect!.width).toBeCloseTo(await page.evaluate(() => document.documentElement.clientWidth), 0)
  expect(rect!.height).toBeCloseTo(await page.evaluate(() => document.documentElement.clientHeight), 0)

  const suffix = ' 可编辑'
  await editable.click()
  await page.keyboard.press('End')
  await page.keyboard.type(suffix)
  const expectedText = `${target.initialText}${suffix}`
  await expect.poll(() => page.evaluate(({selector, blockId}) => {
    const editor = document.querySelector(selector)!
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor).doc
    return doc.model.getTextDeltas(blockId)
      .map((delta: {insert: unknown}) => typeof delta.insert === 'string' ? delta.insert : '')
      .join('')
  }, {selector: editorSelector, blockId: target.paragraphId})).toBe(expectedText)
  await expect.poll(() => editable.evaluate(element =>
    element.textContent?.replace(/[\u200b-\u200d\ufeff]/g, '') ?? '',
  )).toBe(expectedText)

  const expectedProjectionAfterExit = await table.evaluate(host => {
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => any}
    }).ng
    const breaks = debug.getComponent(host)._lastPaginationBreaks as Array<{
      kind?: string
    }>
    return {
      masks: breaks.filter(value => value.kind === 'cell-flow').length,
      spacers: breaks.filter(value => value.kind === undefined).length,
    }
  })

  await page.keyboard.press('Escape')
  await expect(table).not.toHaveClass(/\bis-fullscreen\b/)
  await expect(page.locator('body')).not.toHaveClass(/\bbc-table-fullscreen-lock\b/)
  await expect(table.locator('.bc-pagination-table-flow-mask')).toHaveCount(
    expectedProjectionAfterExit.masks,
  )
  await expect(table.locator('tr.bc-pagination-spacer')).toHaveCount(
    expectedProjectionAfterExit.spacers,
  )
  const backgroundAfter = await table.evaluate(host => {
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => any}
    }).ng
    const backgroundScroller = debug.getComponent(host).doc.scrollContainer as HTMLElement
    return {
      overflowX: getComputedStyle(backgroundScroller).overflowX,
      overflowY: getComputedStyle(backgroundScroller).overflowY,
    }
  })
  expect(backgroundAfter).toEqual({
    overflowX: projectionState.backgroundBefore.overflowX,
    overflowY: projectionState.backgroundBefore.overflowY,
  })
})
