import {expect, test, type Locator, type Page} from '@playwright/test'

async function createTable(page: Page, headers: boolean) {
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    return /^https?:$/.test(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname)
      ? route.abort() : route.continue()
  })
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => {
    const editor = document.querySelector('block-craft-editor')!
    return (window as any).ng?.getComponent(editor)?.doc?.isInitialized
  })
  const id = await page.evaluate(async headers => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const table = doc.schemas.createSnapshot('table', [8, 6])
    table.props = {...table.props, colHead: headers, rowHead: headers, colWidths: [130, 260, 260, 260, 260, 260]}
    table.children.forEach((row: any, r: number) => row.children.forEach((cell: any, c: number) => {
      cell.children = [doc.schemas.createSnapshot('paragraph', [[{
        insert: c === 0 ? `标题姓名${r}` : `其他列内容 ${r}:${c}，横向滚动遮挡测试`,
      }]])]
    }))
    // 合并标题列跨过下一行，覆盖后续行的普通内容也是同一层叠规则的职责。
    table.children[1].children[0].props.rowspan = 2
    table.children[2].children[0].props.display = 'none'
    table.children[2].children[0].children = []
    doc.selection.blur()
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [table])
    await doc.navigateToBlock(table.id)
    return table.id as string
  }, headers)
  const table = page.locator(`block-craft-editor .table-block[data-block-id="${id}"]`)
  await expect(table).toBeVisible()
  return table
}

async function scroll(table: Locator, vertical = false) {
  await table.evaluate((host, vertical) => {
    const scroller = host.querySelector<HTMLElement>('.table-scrollable')!
    // 给双向表头一个有限的滚动视口，检验跨行层叠而非只断言 z-index 数值。
    if (vertical) {
      scroller.style.maxHeight = '260px'
      scroller.style.overflowY = 'auto'
    }
    scroller.scrollLeft = 100
    scroller.scrollTop = vertical ? 60 : 0
  }, vertical)
  await table.page().evaluate(() => new Promise<void>(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  ))
}

async function readHeaderHit(table: Locator, row: number, column = 0, bottom = false) {
  return table.evaluate((host, {row, column, bottom}) => {
    const rows = host.querySelectorAll<HTMLTableRowElement>('tr.table-row-block')
    const cell = rows[row].cells[column]
    const rect = cell.getBoundingClientRect()
    const x = column === 0 ? rect.left + Math.min(60, rect.width / 2) : rect.right - 40
    const y = bottom ? rect.bottom - 20 : rect.top + 24
    const hit = document.elementFromPoint(x, y)?.closest('td.table-cell-block')
    return {
      expected: cell.dataset['blockId'],
      actual: (hit as HTMLElement | null)?.dataset['blockId'],
      x, y,
      position: getComputedStyle(cell).position,
      background: getComputedStyle(cell).backgroundColor,
      scrollLeft: host.querySelector('.table-scrollable')!.scrollLeft,
    }
  }, {row, column, bottom})
}

test('标题列盖住滚动内容，保留单元格选择、编辑和标题开关', async ({page}) => {
  const table = await createTable(page, false)
  const ordinary = await readHeaderHit(table, 0)
  expect(ordinary.position).toBe('relative')

  await table.evaluate(host => (window as any).ng.getComponent(host).toggleHeaderColumn())
  await expect(table).toHaveClass(/col-head/)
  await scroll(table)
  for (const row of [0, 1, 3]) {
    const hit = await readHeaderHit(table, row, 0, row === 1)
    expect(hit.scrollLeft).toBe(100)
    expect(hit.position).toBe('sticky')
    expect(hit.actual).toBe(hit.expected)
  }

  // 其他列的选中高亮不能越过 sticky 标题列。
  await table.evaluate(host => (window as any).ng.getComponent(host).onColBarSelected([1, 1]))
  await expect(table.locator('td.bc-table-cell-selected').first()).toBeAttached()
  const selected = await readHeaderHit(table, 0)
  expect(selected.actual).toBe(selected.expected)

  const before = await table.evaluate(host => {
    const cell = host.querySelector('td.table-cell-block')!
    return (window as any).ng.getComponent(cell.querySelector('.paragraph-block')).textContent()
  })
  await page.mouse.click(selected.x, selected.y)
  await page.keyboard.type('HEADER')
  await expect.poll(() => table.evaluate(host => {
    const cell = host.querySelector('td.table-cell-block')!
    return (window as any).ng.getComponent(cell.querySelector('.paragraph-block')).textContent()
  })).toContain('HEADER')
  expect(before).not.toContain('HEADER')

  await table.evaluate(host => (window as any).ng.getComponent(host).toggleHeaderColumn())
  await expect(table).not.toHaveClass(/col-head/)
  const cleared = await readHeaderHit(table, 0)
  expect(cleared.position).toBe('relative')
})

test('双向表头和合并标题格跨行覆盖，切换全屏保持层叠和内容', async ({page}) => {
  const table = await createTable(page, true)
  const before = await table.evaluate(host => (window as any).ng.getComponent(host).doc.exportSnapshot())
  await scroll(table, true)
  for (const [row, column, bottom] of [[0, 0, false], [0, 1, false], [1, 0, true]] as const) {
    const hit = await readHeaderHit(table, row, column, bottom)
    expect(hit.actual).toBe(hit.expected)
  }
  await table.evaluate(host => {
    const scroller = host.querySelector<HTMLElement>('.table-scrollable')!
    scroller.style.maxHeight = ''
    scroller.style.overflowY = ''
    ;(window as any).ng.getComponent(host).setFullscreen(true)
  })
  await expect(table).toHaveClass(/is-fullscreen/)
  await scroll(table)
  const fullscreen = await readHeaderHit(table, 0)
  expect(fullscreen.actual).toBe(fullscreen.expected)
  expect(fullscreen.scrollLeft).toBe(100)
  await table.evaluate(host => (window as any).ng.getComponent(host).setFullscreen(false))
  await expect(table).not.toHaveClass(/is-fullscreen/)
  expect(await table.evaluate(host => (window as any).ng.getComponent(host).doc.exportSnapshot())).toEqual(before)
})

test('编辑器只读模式的深色表头沿用相同覆盖顺序', async ({page}) => {
  const table = await createTable(page, true)
  await table.evaluate(host => {
    const doc = (window as any).ng.getComponent(host).doc
    doc.toggleTheme('dark')
    doc.toggleReadonly(true)
  })
  await expect.poll(() => table.evaluate(host =>
    host.closest('[data-blockcraft-root="true"]')!.classList.contains('readonly'),
  )).toBe(true)
  await scroll(table)
  for (const row of [0, 1, 3]) {
    const hit = await readHeaderHit(table, row, 0, row === 1)
    expect(hit.actual).toBe(hit.expected)
    expect(hit.background).toBe('rgb(37, 37, 37)')
  }
})
