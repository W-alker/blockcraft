import {expect, test, type Page} from '@playwright/test'

const editorSelector = 'block-craft-editor'

interface OversizedTableTarget {
  tableId: string
  headingId: string
  initialText: string
}

interface ProjectionState {
  maskCount: number
  textGapCount: number
  textRectCount: number
  intersectionCount: number
  maskWithoutTextGap: boolean
  modelText: string
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

async function waitForAnimationFrames(page: Page, count = 4): Promise<void> {
  await page.evaluate(async frames => {
    for (let index = 0; index < frames; index++) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    }
  }, count)
}

async function createOversizedTable(page: Page, kind: 'cell-flow' | 'rows' = 'cell-flow', columns = 1): Promise<OversizedTableTarget> {
  return page.evaluate(async ({selector, kind, columns}) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const initialText = Array.from({length: kind === 'rows' ? 1 : 36}, (_, index) =>
      `${index + 1}. 分页回归标题正文，验证超长单元格里的整行文字不会被页间遮罩盖住。`,
    ).join('\n')
    const heading = doc.schemas.createSnapshot('paragraph', [[{
      insert: initialText,
    }], {heading: 4}])
    const table = doc.schemas.createSnapshot('table', [kind === 'rows' ? 20 : 1, columns])
    table.props.colWidths = Array.from({length: columns}, () => 560 / columns)
    if (kind === 'rows') Object.assign(table.props, {rowHead: true, colHead: true})
    table.children.forEach((row: any, i: number) => row.children.forEach((cell: any, j: number) => {
      cell.props.backColor = '#eef5ff'
      cell.children = [doc.schemas.createSnapshot('paragraph', [`第 ${i + 1} 行，第 ${j + 1} 列`])]
    }))
    table.children[0].children[0].children = [heading]

    doc.selection.blur()
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [table])
    doc.virtualization?.ensureViewMounted?.([table.id])
    await doc.navigateToBlock(table.id)
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )

    const pagination = doc.plugins.find((plugin: any) => plugin.name === 'pagination')
    if (!pagination) throw new Error('PaginationPlugin is unavailable')
    pagination.updateConfig({
      pageSize: {width: 720, height: 540},
      margins: {top: 48, right: 48, bottom: 48, left: 48},
      pageGap: 28,
      widowOrphanLines: 2,
    })
    pagination.enable()
    pagination.recompute()

    return {
      tableId: table.id,
      headingId: heading.id,
      initialText,
    }
  }, {selector: editorSelector, kind, columns})
}

async function readProjectionState(
  page: Page,
  target: OversizedTableTarget,
): Promise<ProjectionState> {
  return page.evaluate(({selector, tableId, headingId}) => {
    const editor = document.querySelector(selector)
    const table = editor?.querySelector<HTMLElement>(
      `.table-block[data-block-id="${tableId}"]`,
    )
    const heading = editor?.querySelector<HTMLElement>(
      `.paragraph-block[data-block-id="${headingId}"]`,
    )
    if (!table || !heading) {
      return {
        maskCount: 0,
        textGapCount: 0,
        textRectCount: 0,
        intersectionCount: 0,
        maskWithoutTextGap: false,
        modelText: '',
      }
    }

    const masks = Array.from(
      table.querySelectorAll<HTMLElement>('.bc-pagination-table-flow-mask'),
    )
    const textGaps = Array.from(
      heading.querySelectorAll<HTMLElement>('[data-bc-inline-pagination-gap]'),
    )
    const maskRects = masks.map(mask => mask.getBoundingClientRect())
    const textRects: DOMRect[] = []
    const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()
    while (node) {
      const text = node as Text
      if (!text.parentElement?.closest('[data-bc-inline-pagination-gap]')) {
        // WebKit may append a phantom next-line rect when a Range selects an
        // entire split text node. Character ranges represent actual painted
        // glyphs and make this a visual-overlap assertion instead of a Range
        // boundary-engine assertion.
        for (let offset = 0; offset < text.data.length;) {
          const codePoint = text.data.codePointAt(offset)
          const length = codePoint !== undefined && codePoint > 0xffff ? 2 : 1
          const end = Math.min(text.data.length, offset + length)
          const content = text.data.slice(offset, end)
          if (!/[\u200b-\u200d\ufeff\n\r]/.test(content)) {
            const range = document.createRange()
            range.setStart(text, offset)
            range.setEnd(text, end)
            textRects.push(...Array.from(range.getClientRects()).filter(rect =>
              rect.width > 0.5 && rect.height > 1))
            range.detach()
          }
          offset = end
        }
      }
      node = walker.nextNode()
    }

    const intersects = (textRect: DOMRect, maskRect: DOMRect) =>
      Math.min(textRect.right, maskRect.right)
        - Math.max(textRect.left, maskRect.left) > 0.5
      && Math.min(textRect.bottom, maskRect.bottom)
        - Math.max(textRect.top, maskRect.top) > 1
    const intersectionCount = textRects.reduce(
      (count, textRect) => count + maskRects.filter(maskRect =>
        intersects(textRect, maskRect)).length,
      0,
    )

    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const modelText = doc.model.getTextDeltas(headingId)
      .map((delta: {insert: unknown}) =>
        typeof delta.insert === 'string' ? delta.insert : '')
      .join('')

    return {
      maskCount: masks.length,
      textGapCount: textGaps.length,
      textRectCount: textRects.length,
      intersectionCount,
      maskWithoutTextGap: masks.length > 0 && textGaps.length === 0,
      modelText,
    }
  }, {
    selector: editorSelector,
    tableId: target.tableId,
    headingId: target.headingId,
  })
}

test('oversized table-cell heading keeps text outside page-flow masks after editing', async ({page}) => {
  test.setTimeout(90_000)
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await waitForEditor(page)

  const target = await createOversizedTable(page)
  await waitForAnimationFrames(page, 6)

  await expect.poll(async () => {
    const state = await readProjectionState(page, target)
    return state.maskCount > 0
      && state.textGapCount === state.maskCount
      && state.textRectCount > 0
  }, {timeout: 30_000}).toBe(true)

  const initial = await readProjectionState(page, target)
  expect(initial.modelText).toBe(target.initialText)

  const appliedScale = await page.evaluate(selector => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const pagination = doc.plugins.find((plugin: any) => plugin.name === 'pagination')
    const scale = doc.viewScale.setScale(1.25)
    pagination?.recompute()
    return scale
  }, editorSelector)
  expect(appliedScale).toBe(1.25)
  await waitForAnimationFrames(page, 6)
  await expect.poll(async () => {
    const state = await readProjectionState(page, target)
    return state.maskCount > 0
      && state.textGapCount === state.maskCount
      && state.textRectCount > 0
  }, {timeout: 30_000}).toBe(true)
  const scaled = await readProjectionState(page, target)

  const suffix = ' 编辑后恢复'
  await page.evaluate(({selector, headingId}) => {
    const editor = document.querySelector(selector)
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor!).doc
    const heading = doc.getBlockById(headingId)
    heading.hostElement.focus({preventScroll: true})
    doc.selection.setCursorAt(heading, heading.textLength)
  }, {selector: editorSelector, headingId: target.headingId})
  await page.keyboard.type(suffix)

  await expect.poll(async () =>
    (await readProjectionState(page, target)).modelText,
  ).toBe(`${target.initialText}${suffix}`)
  await expect.poll(async () => {
    const state = await readProjectionState(page, target)
    return state.maskCount > 0
      && state.textGapCount === state.maskCount
      && !state.maskWithoutTextGap
  }, {timeout: 30_000}).toBe(true)

  const afterEdit = await readProjectionState(page, target)
  expect.soft(initial.textGapCount, '1x mask/gap count').toBe(initial.maskCount)
  expect.soft(initial.maskWithoutTextGap, '1x mask must have a text gap').toBe(false)
  expect.soft(initial.intersectionCount, '1x glyphs must stay outside flow masks').toBe(0)
  expect.soft(scaled.textGapCount, '1.25x mask/gap count').toBe(scaled.maskCount)
  expect.soft(scaled.maskWithoutTextGap, '1.25x mask must have a text gap').toBe(false)
  expect.soft(scaled.intersectionCount, '1.25x glyphs must stay outside flow masks').toBe(0)
  expect.soft(afterEdit.textGapCount, 'edited mask/gap count').toBe(afterEdit.maskCount)
  expect.soft(afterEdit.maskWithoutTextGap, 'edited mask must have a restored text gap').toBe(false)
  expect.soft(afterEdit.intersectionCount, 'edited glyphs must stay outside flow masks').toBe(0)
})

for (const kind of ['cell-flow', 'rows'] as const) {
  for (const scale of [0.75, 1.25]) {
    test(`${kind} 表格在 ${scale * 100}% 缩放时透明分割并透出原有纸张阴影`, async ({page}, testInfo) => {
      await page.setViewportSize({width: 1900, height: 1200})
      await page.goto('/')
      await page.getByRole('button', {name: '初始化', exact: true}).click()
      await waitForEditor(page)
      const target = await createOversizedTable(page, kind, 2)
      await page.evaluate(scale => {
        const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
        doc.viewScale.attach(document.querySelector('.playground-scale-surface'))
        doc.viewScale.setScale(scale)
        doc.plugins.find((p: any) => p.name === 'pagination').recompute()
      }, scale)
      const host = page.locator(`[data-block-id="${target.tableId}"]`)
      const marker = host.locator(kind === 'cell-flow' ? '.bc-pagination-table-flow-mask' : '.bc-pagination-spacer').first()
      await expect(marker).toBeAttached()
      // 缩放后的重测或虚拟窗口更新可能替换几何标记，重新定位后再滚动。
      await expect(() => marker.scrollIntoViewIfNeeded()).toPass({timeout: 10_000})
      await waitForAnimationFrames(page)
      const pairs = await host.evaluate(el => {
        const table = el.querySelector('table')!.getBoundingClientRect()
        const marker = el.querySelector('.bc-pagination-table-flow-mask, .bc-pagination-spacer')!.getBoundingClientRect()
        const sheets = Array.from(document.querySelectorAll('.bc-page-sheet')).map(el => el.getBoundingClientRect())
        const sheet = sheets.find(r => r.bottom > marker.top && r.bottom < marker.bottom)!
        const next = sheets.find(r => r.top > sheet.bottom)!
        // 页脚、两侧纸张阴影、纸间画布和下一页页眉都应透出真实底层。
        const rows = [sheet.bottom - 10, sheet.bottom + 2, (sheet.bottom + next.top) / 2, next.top - 2, next.top + 10]
        return rows.flatMap(y => [table.left + table.width / 4, table.right - 1].map(x => [
          {x, y}, {x: sheet.left + 12, y},
        ]))
      })
      const screenshot = await page.screenshot({scale: 'css', path: testInfo.outputPath('table-transparent-gap.png')})
      const pixels = await page.evaluate(async ({base64, pairs}) => {
        const image = new Image()
        image.src = `data:image/png;base64,${base64}`
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(image, 0, 0)
        return pairs.map(pair => pair.map(({x, y}) => Array.from(ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data)))
      }, {base64: screenshot.toString('base64'), pairs})
      for (const [actual, expected] of pixels) expect(actual).toEqual(expected)
      if (kind === 'cell-flow') {
        expect((await readProjectionState(page, target)).intersectionCount).toBe(0)
        const table = host.locator('table')
        expect(await table.evaluate(el => getComputedStyle(el).clipPath)).not.toBe('none')
        // 复用真实全屏入口；退出后应恢复分页裁切，关闭分页则彻底撤销。
        await host.getByRole('button', {name: '全屏', exact: true}).click()
        await expect(table).toHaveCSS('clip-path', 'none')
        await page.keyboard.press('Escape')
        await expect.poll(() => table.evaluate(el => getComputedStyle(el).clipPath)).not.toBe('none')
      }
      await page.evaluate(() => {
        const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
        doc.plugins.find((p: any) => p.name === 'pagination').disable()
      })
      await expect(host.locator('.bc-pagination-table-flow-mask, .bc-pagination-spacer')).toHaveCount(0)
      await expect(host.locator('table')).toHaveCSS('clip-path', 'none')
    })
  }
}
