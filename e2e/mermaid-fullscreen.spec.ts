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

test('mermaid fullscreen fills the viewport and keeps source editing live', async ({page}) => {
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
    doc.viewScale.setScale(1.25)
    const outerScroller = doc.scrollContainer.parentElement as HTMLElement | null
    if (!outerScroller || outerScroller === document.body) {
      throw new Error('Playground outer document container is unavailable')
    }
    outerScroller.setAttribute('data-mermaid-outer-scroller', 'true')
    outerScroller.style.setProperty('overflow-y', 'scroll', 'important')
    const source = 'graph TD\nA-->B'
    const snapshot = doc.schemas.createSnapshot('mermaid', ['graph', source])
    const [mermaidId] = doc.crud.insertBlockSnapshots(
      doc.rootId,
      doc.model.getChildrenIds(doc.rootId).length,
      [snapshot],
    )
    const textareaId = doc.model.getChildrenIds(mermaidId)[0]
    await doc.navigateToBlock(mermaidId)
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
    return {mermaidId, textareaId, source}
  }, editorSelector)

  const mermaid = page.locator(
    `${editorSelector} .mermaid-block[data-block-id="${target.mermaidId}"]`,
  )
  const sourceEditor = mermaid.locator(
    `.mermaid-textarea[data-block-id="${target.textareaId}"]`,
  )
  await expect(mermaid).toBeVisible()
  await mermaid.getByRole('button', {name: '全屏', exact: true}).click()

  await expect(mermaid).toHaveClass(/\bis-fullscreen\b/)
  await expect(page.locator('body')).toHaveClass(/\bbc-table-fullscreen-lock\b/)
  await expect(mermaid.locator('.graph-con')).toHaveCSS('cursor', 'default')
  const fullscreenGeometry = await mermaid.evaluate(host => {
    const rect = host.getBoundingClientRect()
    const text = host.querySelector<HTMLElement>('.text-container')!
    const graph = host.querySelector<HTMLElement>('.graph-container')!
    const outerScroller = document.querySelector<HTMLElement>('[data-mermaid-outer-scroller]')!
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const backgroundScroller = debug.getComponent(host).doc.scrollContainer as HTMLElement
    return {
      rect: {left: rect.left, top: rect.top, width: rect.width, height: rect.height},
      viewport: {
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
      },
      text: {width: text.getBoundingClientRect().width, maxHeight: getComputedStyle(text).maxHeight},
      graph: {
        width: graph.getBoundingClientRect().width,
        maxHeight: getComputedStyle(graph).maxHeight,
      },
      backgroundOverflowY: getComputedStyle(backgroundScroller).overflowY,
      outerOverflowY: getComputedStyle(outerScroller).overflowY,
    }
  })
  expect(fullscreenGeometry.rect.left).toBeCloseTo(0, 0)
  expect(fullscreenGeometry.rect.top).toBeCloseTo(0, 0)
  expect(fullscreenGeometry.rect.width).toBeCloseTo(fullscreenGeometry.viewport.width, 0)
  expect(fullscreenGeometry.rect.height).toBeCloseTo(fullscreenGeometry.viewport.height, 0)
  expect(fullscreenGeometry.text.width).toBe(0)
  expect(fullscreenGeometry.graph.width).toBeGreaterThan(0)
  expect(fullscreenGeometry.text.maxHeight).toBe('none')
  expect(fullscreenGeometry.graph.maxHeight).toBe('none')
  expect(fullscreenGeometry.backgroundOverflowY).toBe('hidden')
  expect(fullscreenGeometry.outerOverflowY).toBe('hidden')

  const modifierWheel = await mermaid.evaluate(host => {
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => any}
    }).ng
    const component = debug.getComponent(host)
    const graph = host.querySelector<HTMLElement>('.graph-container')!
    let bubbledToHost = false
    const bubbleHandler = () => {
      bubbledToHost = true
    }
    host.addEventListener('wheel', bubbleHandler)
    const beforeDocumentScale = component.doc.viewScale.value
    const beforeGraphScale = component.graphScale
    const event = new WheelEvent('wheel', {
      ctrlKey: true,
      deltaY: -100,
      bubbles: true,
      cancelable: true,
    })
    graph.dispatchEvent(event)
    host.removeEventListener('wheel', bubbleHandler)
    return {
      defaultPrevented: event.defaultPrevented,
      bubbledToHost,
      beforeDocumentScale,
      afterDocumentScale: component.doc.viewScale.value,
      beforeGraphScale,
      afterGraphScale: component.graphScale,
    }
  })
  expect(modifierWheel.defaultPrevented).toBe(true)
  expect(modifierWheel.bubbledToHost).toBe(false)
  expect(modifierWheel.afterDocumentScale).toBe(modifierWheel.beforeDocumentScale)
  expect(modifierWheel.afterGraphScale).toBe(modifierWheel.beforeGraphScale)

  await mermaid.evaluate(host => {
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    debug.getComponent(host).doc.toggleReadonly(true)
  })
  await expect(mermaid.locator('.switch-btn')).toBeHidden()
  const readonlyControls = await mermaid.evaluate(host => {
    const download = host.querySelector<HTMLElement>('.download-btn')!.getBoundingClientRect()
    const zoom = host.querySelector<HTMLElement>('.control-btns')!.getBoundingClientRect()
    const fullscreen = host.querySelector<HTMLElement>('.fullscreen-btn')!.getBoundingClientRect()
    return {
      downloadRight: download.right,
      zoomLeft: zoom.left,
      zoomRight: zoom.right,
      fullscreenLeft: fullscreen.left,
    }
  })
  expect(readonlyControls.zoomLeft - readonlyControls.downloadRight).toBeLessThanOrEqual(8)
  expect(readonlyControls.fullscreenLeft - readonlyControls.zoomRight).toBeLessThanOrEqual(8)

  await mermaid.evaluate(host => {
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    debug.getComponent(host).doc.toggleReadonly(false)
  })
  const switchButton = mermaid.locator('.switch-btn')
  await expect(switchButton).toBeVisible()
  await switchButton.click()
  const viewMenu = page.locator('.cdk-overlay-pane').filter({hasText: '文本与预览'})
  await expect(viewMenu).toBeVisible()
  const overlayGeometry = await Promise.all([
    switchButton.boundingBox(),
    viewMenu.boundingBox(),
  ])
  expect(overlayGeometry[0]).not.toBeNull()
  expect(overlayGeometry[1]).not.toBeNull()
  expect(overlayGeometry[1]!.x + overlayGeometry[1]!.width)
    .toBeCloseTo(overlayGeometry[0]!.x + overlayGeometry[0]!.width, 0)
  expect(overlayGeometry[1]!.y).toBeGreaterThanOrEqual(
    overlayGeometry[0]!.y + overlayGeometry[0]!.height,
  )
  await viewMenu.locator('bc-float-toolbar-item').last().dispatchEvent('mousedown')
  await expect(viewMenu).toBeHidden()

  const suffix = '\nB-->C'
  await sourceEditor.click()
  await page.keyboard.press('End')
  await page.keyboard.type(suffix)
  await expect.poll(() => page.evaluate(({selector, blockId}) => {
    const editor = document.querySelector(selector)!
    const debug = (window as unknown as {
      ng: {getComponent: (target: Element) => {doc: any}}
    }).ng
    const doc = debug.getComponent(editor).doc
    return doc.model.getTextDeltas(blockId)
      .map((delta: {insert: unknown}) => typeof delta.insert === 'string' ? delta.insert : '')
      .join('')
  }, {selector: editorSelector, blockId: target.textareaId})).toBe(target.source + suffix)

  await page.keyboard.press('Escape')
  await expect(mermaid).not.toHaveClass(/\bis-fullscreen\b/)
  await expect(page.locator('body')).not.toHaveClass(/\bbc-table-fullscreen-lock\b/)
  await expect(page.locator('[data-mermaid-outer-scroller]')).toHaveCSS('overflow-y', 'scroll')
})
