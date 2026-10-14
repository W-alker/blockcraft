import {expect, test, type Page} from '@playwright/test'

async function updateStream(page: Page, method: 'replace' | 'append', text: string) {
  await page.locator('playground-home').evaluate((element, args) => {
    const app = (window as any).ng.getComponent(element)
    app.ensureMarkdownStreamViewer()[args.method](args.text)
  }, {method, text})
}

test('snapshot Mermaid survives incomplete source and following streamed paragraphs', async ({page}, testInfo) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await page.getByRole('tab', {name: 'Snapshot Viewer', exact: true}).click()
  await page.getByRole('button', {name: 'Markdown Stream', exact: true}).click()
  const viewer = page.locator('.markdown-stream-demo__viewer')
  const graph = viewer.locator('.mermaid-block .graph-con')

  await updateStream(page, 'replace', '```mermaid\ngraph TD\nA[Start] --> B[First]')
  await expect(graph.locator('svg')).toBeVisible({timeout: 30_000})
  await expect(graph.locator('.nodeLabel')).toHaveText(['Start', 'First'])
  const mountedGraph = await graph.elementHandle()
  const firstSvg = await graph.locator('svg').elementHandle()

  await updateStream(page, 'append', '\nB --> C[')
  await page.evaluate(() => new Promise<void>(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  ))
  expect(await firstSvg!.evaluate(element => element.isConnected)).toBe(true)
  await expect(graph.locator('svg')).toBeVisible()

  await updateStream(page, 'append', 'Updated]\n```\n\nAfter')
  await expect(graph.locator('.nodeLabel')).toHaveText(['Start', 'First', 'Updated'])
  expect(await mountedGraph!.evaluate(element => element.isConnected)).toBe(true)
  await expect(viewer.locator('.mermaid-block .head, .mermaid-block .text-container, .mermaid-block button')).toHaveCount(0)
  const finalSvg = await graph.locator('svg').elementHandle()

  for (const chunk of [' one', ' two', '\n\nNext paragraph']) {
    await updateStream(page, 'append', chunk)
    await expect(viewer).toContainText(chunk.trim())
    expect(await finalSvg!.evaluate(element => element.isConnected)).toBe(true)
  }
  const bounds = await graph.locator('svg').boundingBox()
  expect(bounds!.width).toBeGreaterThan(0)
  expect(bounds!.height).toBeGreaterThan(0)
  await viewer.screenshot({path: testInfo.outputPath('stream-mermaid.png')})
})

test('snapshot shows the graph from editor text mode without changing editor controls or data', async ({page}, testInfo) => {
  test.setTimeout(60_000)
  await page.goto('/')
  const id = await page.locator('playground-home').evaluate(async element => {
    const app = (window as any).ng.getComponent(element)
    await app.renderMarkdown('```mermaid\ngraph LR\nA[Editor source] --> B[Snapshot graph]\n```')
    const doc = app.editor.doc
    const mermaidId = doc.model.getChildrenIds(doc.rootId)
      .find((id: string) => doc.model.getFlavour(id) === 'mermaid')
    if (!mermaidId) throw new Error('Markdown import did not create a Mermaid block')
    doc.crud.updateBlockProps(mermaidId, {mode: 'text'})
    return mermaidId as string
  })
  const editorMermaid = page.locator(`block-craft-editor .mermaid-block[data-block-id="${id}"]`)
  await expect(editorMermaid.locator('.text-container')).toBeVisible()

  await page.getByRole('tab', {name: 'Snapshot Viewer', exact: true}).click()
  const snapshotMermaid = page.locator(`bc-snapshot-viewer .mermaid-block[data-block-id="${id}"]`)
  await expect(snapshotMermaid.locator('.graph-con svg')).toBeVisible({timeout: 30_000})
  await expect(snapshotMermaid.locator('.nodeLabel')).toHaveText(['Editor source', 'Snapshot graph'])
  await expect(snapshotMermaid.locator('.head, .text-container, button')).toHaveCount(0)
  await snapshotMermaid.screenshot({path: testInfo.outputPath('snapshot-mermaid.png')})

  await page.getByRole('tab', {name: '编辑器', exact: true}).click()
  await expect(editorMermaid).toHaveAttribute('data-mode', 'text')
  await expect(editorMermaid.locator('.text-container')).toBeVisible()
  await expect(editorMermaid.getByRole('button', {name: '全屏', exact: true})).toBeVisible()
  const mode = await editorMermaid.evaluate(element => (window as any).ng.getComponent(element).props.mode)
  expect(mode).toBe('text')
})
