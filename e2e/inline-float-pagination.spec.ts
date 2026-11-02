import {expect, test, type Page} from '@playwright/test'

type Scenario = {
  sparse: boolean
  mode: 'left' | 'right' | 'dual'
  prefix: 'start' | 'character' | 'line'
  paginated?: boolean
  longDocument?: boolean
  pageHeight?: number
}

async function initializeParagraphFloat(page: Page, scenario: Scenario) {
  // Synthetic local fixture only; never connect to the user's document/provider.
  await page.routeWebSocket('**', socket => socket.close())
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    return ['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname)
      ? route.abort() : route.continue()
  })
  await page.goto('/')
  await page.waitForFunction(() => !!(window as any).ng?.getComponent(
    document.querySelector('block-craft-editor'))?.doc)
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  const fixture = await page.evaluate(scenario => {
    const editor = (window as any).ng.getComponent(document.querySelector('block-craft-editor'))
    const home = (window as any).ng.getComponent(document.querySelector('playground-home'))
    const doc = editor.doc
    const paragraph = (text: string) => doc.schemas.createSnapshot('paragraph', [text])
    const prefix = scenario.prefix === 'start' ? '' : scenario.prefix === 'character' ? '前' : '图片之前的整行文字'.repeat(10)
    const src = 'data:image/svg+xml,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="110" height="137"><rect width="110" height="137" fill="#568ab4"/></svg>')
    const owner = doc.schemas.createSnapshot('paragraph', [[
      ...(prefix ? [{insert: prefix}] : []),
      {insert: {image: src}, attributes: {
        width: 110, height: 137, wrap: true, gap: 12,
        side: scenario.mode === 'dual' ? 'auto' : scenario.mode === 'left' ? 'right' : 'left',
        x: scenario.mode === 'dual' ? 0.4 : scenario.mode === 'left' ? 0 : 1,
      }},
      {insert: '图片同段正文用于验证环绕文字不穿过图片。'.repeat(7)},
    ]])
    const empty = paragraph('')
    const following = paragraph('下一段正文应恢复完整宽度，并位于图片段落之后。')
    const lead = paragraph('独立前置段落不应改变图片所属段落的绕排。')
    const children = [
      ...(scenario.sparse ? [lead] : []), owner, empty, following,
      ...Array.from({length: scenario.longDocument ? 120 : 12}, (_, index) => paragraph(`分页与滚动验证正文 ${index + 1}`)),
    ]
    const root = doc.schemas.createSnapshot('root', [editor.rootId, children])
    home.ensureEditorInitialized(root)
    doc.viewScale.attach(home.documentScaleSurface)
    doc.viewScale.setScale(1)
    const pagination = doc.plugins.find((plugin: any) => plugin.name === 'pagination')
    pagination.disable()
    pagination._controller?.destroy()
    pagination._controller = null
    pagination._experimentalSparseView = scenario.sparse
    pagination._documentHeader = undefined
    pagination.updateConfig({pageSize: {width: 796, height: scenario.pageHeight ?? 500}, orientation: 'portrait',
      margins: {top: 48, right: 48, bottom: 48, left: 48}, pageGap: 24,
      header: undefined, footer: undefined})
    const ownerIndex = scenario.sparse ? 1 : 0
    const ids = {ownerId: root.children[ownerIndex].id, emptyId: root.children[ownerIndex + 1].id,
      followingId: root.children[ownerIndex + 2].id}
    ;(window as any).__paragraphFloatTest = {doc, pagination, ...ids, mode: scenario.mode,
      prefixLength: prefix.length, paginated: scenario.paginated !== false}
    if (scenario.paginated !== false) pagination.enable()
    return {...ids, snapshot: JSON.stringify(doc.exportSnapshot())}
  }, scenario)
  // The default empty-paragraph placeholder belongs to the focused caret.
  await page.locator(`[data-block-id="${fixture.emptyId}"] .edit-container`).click({position: {x: 8, y: 8}})
  await expect(page.locator(`[data-block-id="${fixture.emptyId}"] .bc-placeholder-target`)).toBeAttached()
  return fixture
}

async function sampleParagraph(page: Page) {
  return page.evaluate(async () => {
    const state = (window as any).__paragraphFloatTest
    const {doc, pagination, ownerId, emptyId, followingId, mode, paginated} = state
    const samples: Array<any> = []
    for (let frame = 0; frame < 54; frame++) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      if (frame < 18) continue
      const owner = document.querySelector<HTMLElement>(`[data-block-id="${ownerId}"]`)!
      const container = owner.querySelector<HTMLElement>('.bc-paragraph-text')!
      const image = owner.querySelector<HTMLElement>('.bc-inline-image-frame')!
      const shell = owner.querySelector<HTMLElement>('.bc-inline-image-shell')!
      const empty = document.querySelector<HTMLElement>(`[data-block-id="${emptyId}"]`)!
      const following = document.querySelector<HTMLElement>(`[data-block-id="${followingId}"]`)!
      if (!owner || !empty || !following) throw new Error('Paragraph fixture is not mounted')
      const ownerRect = owner.getBoundingClientRect()
      const imageRect = image.getBoundingClientRect()
      const rootTop = doc.root.hostElement.getBoundingClientRect().top
      const placeholder = empty.querySelector<HTMLElement>('.bc-placeholder-target')
        ?? (empty.matches('.bc-placeholder-target') ? empty : null)
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
      const rows: DOMRect[] = []
      let node: Node | null
      while ((node = walker.nextNode())) {
        if (node.parentElement?.closest('[contenteditable="false"],[data-zero-space]')) continue
        const range = document.createRange()
        range.selectNodeContents(node)
        rows.push(...Array.from(range.getClientRects()).filter(row => row.width > 0
          && row.bottom > imageRect.top + 1 && row.top < imageRect.bottom - 1))
      }
      const runtime = doc.getBlockById(ownerId).runtime
      const anchor = runtime.scrollBlot.leaves.find((leaf: any) => leaf.embedElement === shell)
      const layout = paginated ? pagination._controller?._stableLayout : null
      const item = layout?.items.find((entry: any) => entry.id === ownerId)
      samples.push({
        ownerTop: ownerRect.top - rootTop, ownerHeight: ownerRect.height,
        rootHeight: doc.root.hostElement.getBoundingClientRect().height,
        ownerDisplay: getComputedStyle(container).display,
        contained: ownerRect.bottom >= imageRect.bottom - 1,
        emptyTop: empty.getBoundingClientRect().top - rootTop,
        emptyAfterOwner: empty.getBoundingClientRect().top >= ownerRect.bottom - 1,
        placeholderContent: placeholder ? getComputedStyle(placeholder, '::before').content : null,
        placeholderAfterImage: !!placeholder && placeholder.getBoundingClientRect().top >= imageRect.bottom - 1,
        followingAfterOwner: following.getBoundingClientRect().top >= ownerRect.bottom - 1,
        followingWidth: following.getBoundingClientRect().width,
        rows: rows.length,
        leftRows: rows.filter(row => row.right <= imageRect.left + 1).length,
        rightRows: rows.filter(row => row.left >= imageRect.right - 1).length,
        textAvoidsImage: rows.every(row => row.right <= imageRect.left + 1 || row.left >= imageRect.right - 1),
        anchorOffset: anchor ? runtime.offsetOf(anchor) : null,
        float: getComputedStyle(shell).cssFloat,
        dual: !!owner.querySelector('[data-bc-inline-fragment-group]'),
        page: layout?.result.byBlock.get(ownerId)?.pageIndex ?? null,
        emptyPage: layout?.result.byBlock.get(emptyId)?.pageIndex ?? null,
        measurementError: item ? item.height - ownerRect.height - (parseFloat(getComputedStyle(owner).marginBottom) || 0) : 0,
      })
    }
    return {samples, snapshot: JSON.stringify(doc.exportSnapshot()), prefixLength: state.prefixLength, mode}
  })
}

function assertParagraph(result: Awaited<ReturnType<typeof sampleParagraph>>, snapshot: string) {
  expect(result.snapshot).toBe(snapshot)
  expect(new Set(result.samples.map(row => [row.ownerTop, row.ownerHeight, row.emptyTop, row.rootHeight, row.page, row.emptyPage].join(':'))).size,
    JSON.stringify(result.samples)).toBe(1)
  for (const row of result.samples) {
    expect(row.ownerDisplay).toBe('flow-root')
    expect(row.contained, JSON.stringify(row)).toBe(true)
    expect(row.emptyAfterOwner).toBe(true)
    expect(row.placeholderContent).not.toBeNull()
    expect(row.placeholderContent).not.toBe('none')
    expect(row.placeholderAfterImage).toBe(true)
    expect(row.followingAfterOwner).toBe(true)
    expect(row.followingWidth).toBeCloseTo(700, 0)
    expect(row.rows).toBeGreaterThan(0)
    expect(row.textAvoidsImage, JSON.stringify(row)).toBe(true)
    expect(row.anchorOffset).toBe(result.prefixLength)
    expect(Math.abs(row.measurementError)).toBeLessThan(1.5)
    if (result.mode === 'dual') {
      expect(row.dual).toBe(true)
      expect(row.leftRows).toBeGreaterThan(0)
      expect(row.rightRows).toBeGreaterThan(0)
    } else expect(row.float).toBe(result.mode)
  }
}

for (const sparse of [false, true]) {
  for (const mode of ['left', 'right', 'dual'] as const) {
    for (const prefix of ['start', 'character', 'line'] as const) {
      test(`${sparse ? 'sparse' : 'full'} ${mode} ${prefix} 单段绕排包含图片且空段占位不覆盖`, async ({page}, testInfo) => {
        const fixture = await initializeParagraphFloat(page, {sparse, mode, prefix})
        assertParagraph(await sampleParagraph(page), fixture.snapshot)
        const capture = await page.evaluate(() => {
          const {doc, pagination} = (window as any).__paragraphFloatTest
          return {layout: !!pagination._controller.captureStableLayout(), snapshot: JSON.stringify(doc.exportSnapshot())}
        })
        expect(capture.layout).toBe(true)
        expect(capture.snapshot).toBe(fixture.snapshot)
        assertParagraph(await sampleParagraph(page), fixture.snapshot)
        if (!sparse && mode === 'left' && prefix === 'character' && testInfo.project.name === 'chromium') {
          await page.locator('bc-pagination-settings').getByTitle('收起', {exact: true}).click()
          await expect(page.locator('bc-pagination-settings .bc-pg-panel')).not.toBeVisible()
          await page.setViewportSize({width: 1280, height: 900})
          await page.locator(`[data-block-id="${fixture.followingId}"]`).scrollIntoViewIfNeeded()
          await page.locator(`[data-block-id="${fixture.emptyId}"] .edit-container`).click({position: {x: 8, y: 8}})
          await expect(page.locator(`[data-block-id="${fixture.emptyId}"] .bc-placeholder-target`)).toBeVisible()
          await page.screenshot({path: testInfo.outputPath('single-paragraph-nonzero-anchor-placeholder.png')})
        }
      })
    }
  }
}

for (const mode of ['left', 'right', 'dual'] as const) {
  test(`flow ${mode} character 非分页也保持单段绕排`, async ({page}) => {
    const fixture = await initializeParagraphFloat(page, {sparse: false, mode, prefix: 'character', paginated: false})
    const result = await sampleParagraph(page)
    // Flow has its own available width; all containment and placeholder checks still apply.
    expect(result.snapshot).toBe(fixture.snapshot)
    for (const row of result.samples) {
      expect(row.ownerDisplay).toBe('flow-root')
      expect(row.contained).toBe(true)
      expect(row.emptyAfterOwner).toBe(true)
      expect(row.placeholderAfterImage).toBe(true)
      expect(row.anchorOffset).toBe(1)
      expect(row.rows).toBeGreaterThan(0)
      expect(row.textAvoidsImage).toBe(true)
      if (mode === 'dual') {
        expect(row.dual).toBe(true)
        expect(row.leftRows).toBeGreaterThan(0)
        expect(row.rightRows).toBeGreaterThan(0)
      } else expect(row.float).toBe(mode)
    }
  })
}

// Long sparse documents refine offscreen estimates in bounded idle batches.
// Wait for cold-start/refill work to settle before the separate strict frame sample.
async function waitForSparseGeometrySettled(page: Page) {
  await page.evaluate(async () => {
    const {doc} = (window as any).__paragraphFloatTest
    const started = performance.now()
    let previousHeight = Number.NaN
    let stableSince = started
    while (performance.now() - started < 15_000) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      const height = doc.root.hostElement.getBoundingClientRect().height
      if (height !== previousHeight) {
        previousHeight = height
        stableSince = performance.now()
      }
      if (performance.now() - stableSince >= 1_500) return
    }
    throw new Error(`Sparse document did not settle after idle measurement: ${previousHeight}`)
  })
}

for (const sparse of [false, true]) {
  test(`${sparse ? 'sparse' : 'full'} 短页非零锚点图片后空段稳定进入下一页`, async ({page}) => {
    const fixture = await initializeParagraphFloat(page, {sparse, mode: 'left', prefix: 'character', pageHeight: 274})
    const before = await sampleParagraph(page)
    assertParagraph(before, fixture.snapshot)
    for (const row of before.samples) expect(row.emptyPage).toBe(row.page + 1)
    await page.evaluate(() => (window as any).__paragraphFloatTest.pagination.captureStableLayout())
    const after = await sampleParagraph(page)
    assertParagraph(after, fixture.snapshot)
    for (const row of after.samples) expect(row.emptyPage).toBe(row.page + 1)
  })
}

test('sparse 非零锚点图片滚动卸载重挂后仍包含于原段落', async ({page}) => {
  test.setTimeout(60_000)
  const fixture = await initializeParagraphFloat(page, {sparse: true, mode: 'left', prefix: 'character', longDocument: true})
  await waitForSparseGeometrySettled(page)
  assertParagraph(await sampleParagraph(page), fixture.snapshot)
  const editor = await page.locator('block-craft-editor').boundingBox()
  if (!editor) throw new Error('Editor not visible')
  await page.mouse.move(editor.x + editor.width / 2, Math.max(140, Math.min(editor.y + 150, 450)))
  for (let index = 0; index < 8; index++) await page.mouse.wheel(0, 700)
  // Move the real caret to the document end so selection leases no longer retain the owner.
  await page.keyboard.press('ControlOrMeta+End')
  await expect(page.locator(`[data-block-id="${fixture.ownerId}"]`)).not.toBeAttached()
  for (let index = 0; index < 10; index++) await page.mouse.wheel(0, -900)
  await page.keyboard.press('ControlOrMeta+Home')
  await expect(page.locator(`[data-block-id="${fixture.ownerId}"]`)).toBeAttached()
  await page.locator(`[data-block-id="${fixture.emptyId}"] .edit-container`).click({position: {x: 8, y: 8}})
  await waitForSparseGeometrySettled(page)
  assertParagraph(await sampleParagraph(page), fixture.snapshot)
})
