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
  await sourceEditor.getByText('B', {exact: true}).click()
  await expect.poll(() => sourceEditor.evaluate(el => {
    const c = (window as any).ng.getComponent(el)
    return c.doc.selection.value?.anchor?.blockId
  })).toBe(target.textareaId)
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

test('fullscreen canvas writes source, shares undo, and releases on exit', async ({page}) => {
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await waitForEditor(page)
  const ids = await page.evaluate(async () => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const [id] = doc.crud.insertBlockSnapshots(doc.rootId, 0,
      [doc.schemas.createSnapshot('mermaid', ['default', 'flowchart TD\n  A[Start] --> B[End]'])])
    await doc.navigateToBlock(id)
    return {id, text: doc.model.getChildrenIds(id)[0]}
  })
  const block = page.locator(`.mermaid-block[data-block-id="${ids.id}"]`)
  const read = () => page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    return doc.getBlockById(id).textContent()
  }, ids.text)
  await expect(block.locator('.mw-canvas')).toHaveCount(0)
  await block.getByRole('button', {name: '全屏', exact: true}).click()
  const canvas = block.locator('.mw-canvas')
  await expect(canvas.locator('[data-mw-entity="node:A"]').first()).toBeVisible()
  await canvas.locator('[data-mw-entity="node:A"]').first().dblclick()
  const label = canvas.locator('[contenteditable="true"]')
  await expect(label).toBeVisible()
  await label.fill('新的开始')
  await label.press('Enter')
  await expect.poll(read).toContain('新的开始')
  await canvas.focus()
  await canvas.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
  await expect.poll(read).toContain('Start')
  await canvas.focus()
  await canvas.press(process.platform === 'darwin' ? 'Meta+Shift+z' : 'Control+Shift+z')
  await expect.poll(read).toContain('新的开始')

  // 外部文本更新应投影到图，且不重复写回文档。
  await page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const text = doc.getBlockById(id)
    doc.crud.transact(() => text.replaceText(0, text.textLength, 'flowchart TD\n  A[Remote] --> B[End]'))
  }, ids.text)
  await expect(canvas).toContainText('Remote')
  await canvas.locator('[data-mw-entity="node:A"]').first().dblclick()
  await canvas.locator('[contenteditable="true"]').fill('退出前的输入')
  // 不等待图上输入的 450ms 防抖，退出也必须保留输入。
  await block.getByRole('button', {name: '退出全屏', exact: true}).click()
  await expect(block.locator('.mw-canvas')).toHaveCount(0)
  await expect.poll(read).toContain('退出前的输入')
  await expect(block.locator('.graph-con')).toContainText('退出前的输入')
  await block.getByRole('button', {name: '全屏', exact: true}).click()
  await expect(canvas).toContainText('退出前的输入')
  // 全屏切换的 IntersectionObserver 回调可能先暂时报告不可见。
  await block.evaluate(host => { (window as any).ng.getComponent(host).isIntersecting = false })
  await page.keyboard.press('Escape')
  await expect(block.locator('.mw-canvas')).toHaveCount(0)
  await expect(block.locator('.graph-con svg')).toBeVisible()
  await expect(block.locator('.graph-con')).toContainText('退出前的输入')

  // 即使下一次源码渲染失败，预览也保留最后一次成功的图。
  await block.evaluate(host => {
    const component = (window as any).ng.getComponent(host)
    component.isIntersecting = true
    const text = component.firstChildren
    component.doc.crud.transact(() => text.replaceText(0, text.textLength, 'flowchart TD\nA[broken'))
    return component.renderGraph(true)
  })
  await expect(block.locator('.graph-con svg')).toBeVisible()
  await expect(block.locator('.graph-con')).toContainText('退出前的输入')
})

test('leaving fullscreen during lazy loading keeps the preview and cancels the canvas', async ({page}) => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/*mermaid-visual-session*', async route => {
    await gate
    await route.continue()
  })
  try {
    await page.goto('/')
    await page.getByRole('button', {name: '初始化', exact: true}).click()
    await waitForEditor(page)
    const id = await page.evaluate(async () => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      const [id] = doc.crud.insertBlockSnapshots(doc.rootId, 0,
        [doc.schemas.createSnapshot('mermaid', ['graph', 'flowchart TD\nA[保留预览] --> B[End]'])])
      await doc.navigateToBlock(id)
      return id
    })
    const block = page.locator(`.mermaid-block[data-block-id="${id}"]`)
    await expect(block.locator('.graph-con svg')).toBeVisible()
    await block.getByRole('button', {name: '全屏', exact: true}).click()
    await expect(block.getByRole('status')).toContainText('正在加载')
    await expect(block.locator('.graph-con svg')).toBeVisible()
    await block.getByRole('button', {name: '退出全屏', exact: true}).click()
    await expect(block.locator('.graph-con svg')).toBeVisible()
    release()
    await block.getByRole('button', {name: '全屏', exact: true}).click()
    await expect(block.locator('.mw-canvas')).toContainText('保留预览')
    await expect(block.locator('.mw-canvas')).toHaveCount(1)
    await page.keyboard.press('Escape')
    await expect(block.locator('.mw-canvas')).toHaveCount(0)
    await expect(block.locator('.graph-con svg')).toBeVisible()
  } finally { release() }
})

test('two clients converge on graph edits and local undo preserves remote edits', async ({browser}) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext()])
  const pages = await Promise.all(contexts.map(context => context.newPage()))
  const room = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2)}`
  try {
    for (const page of pages) {
      await page.addInitScript(roomName => {
        const NativeSocket = window.WebSocket
        window.WebSocket = new Proxy(NativeSocket, {
          construct(target, args) {
            const url = new URL(String(args[0]))
            if (url.hostname === '196.168.1.153' && url.port === '1234') args[0] = `ws://127.0.0.1:12345/${roomName}`
            return Reflect.construct(target, args)
          },
        })
      }, room)
      await page.route(/https?:\/\/(?!127\.0\.0\.1|localhost)/, route => route.abort())
      await page.goto('http://127.0.0.1:8081')
    }
    await pages[0].getByRole('button', {name: '初始化', exact: true}).click()
    await waitForEditor(pages[0])
    await pages[0].getByRole('button', {name: '进入协同', exact: true}).click()
    await expect.poll(() => pages[0].evaluate(() => { const p = (window as any).ng.getComponent(document.querySelector('playground-home')).provider;return {connected:p?.wsconnected,state:p?.ws?.readyState,url:p?.ws?.url} })).toMatchObject({connected:true})
    const ids = await pages[0].evaluate(() => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      const [id] = doc.crud.insertBlockSnapshots(doc.rootId, 0,
        [doc.schemas.createSnapshot('mermaid', ['default', 'flowchart TD\nA[Start] --> B[End]'])])
      doc.crud.undoManager.clearHistory()
      return {id, text: doc.model.getChildrenIds(id)[0]}
    })
    await pages[1].getByRole('button', {name: '进入协同', exact: true}).click()
    await waitForEditor(pages[1])
    const blocks = pages.map(page => page.locator(`.mermaid-block[data-block-id="${ids.id}"]`))
    for (let index = 0; index < 2; index++) {
      await pages[index].waitForFunction(id => {
        const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
        return !!doc.model.getYBlock(id)
      }, ids.id)
      await pages[index].evaluate(id => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.navigateToBlock(id), ids.id)
      await blocks[index].getByRole('button', {name: '全屏', exact: true}).click()
      await expect(blocks[index].locator('.mw-canvas')).toContainText('Start')
    }
    const read = (index: number) => pages[index].evaluate(id => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      return doc.getBlockById(id).textContent() as string
    }, ids.text)
    const rename = async (index: number, node: string, label: string) => {
      const canvas = blocks[index].locator('.mw-canvas')
      await canvas.locator(`[data-mw-entity="node:${node}"]`).first().dblclick()
      const input = canvas.locator('[contenteditable="true"]')
      await input.fill(label)
      await input.press('Enter')
      await expect.poll(() => read(index)).toContain(label)
    }
    await rename(0, 'A', 'Alice')
    await expect.poll(() => read(1)).toContain('Alice')
    await rename(1, 'B', 'Bob')
    await expect.poll(() => read(0)).toContain('Bob')
    await pages[0].evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.crud.undoManager.undo())
    await expect.poll(() => read(1)).toBe('flowchart TD\nA[Start] --> B[Bob]')

    // 两端暂时断开后各自修改不同节点，重新连接后验证真实 CRDT 合并。
    for (const page of pages) await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('playground-home')).provider.disconnect())
    await rename(0, 'A', 'OfflineAlice')
    await rename(1, 'B', 'OfflineBob')
    for (const page of pages) await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('playground-home')).provider.connect())
    for (let index = 0; index < 2; index++) {
      await expect.poll(() => read(index)).toBe('flowchart TD\nA[OfflineAlice] --> B[OfflineBob]')
      await expect(blocks[index].locator('.mw-canvas')).toContainText('OfflineAlice')
      await expect(blocks[index].locator('.mw-canvas')).toContainText('OfflineBob')
    }
    // 远端更新取消尚未提交的旧标签会话，随后退出不能把旧草稿写回来。
    const canvas = blocks[0].locator('.mw-canvas')
    await canvas.locator('[data-mw-entity="node:A"]').first().dblclick()
    await canvas.locator('[contenteditable="true"]').fill('UncommittedDraft')
    await pages[1].evaluate(id => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      const text = doc.getBlockById(id)
      doc.crud.transact(() => text.replaceText(text.textContent().indexOf('OfflineBob'), 'OfflineBob'.length, 'RemoteUpdate'))
    }, ids.text)
    await expect(canvas.locator('[contenteditable="true"]')).toHaveCount(0)
    await expect.poll(() => read(0)).toBe('flowchart TD\nA[OfflineAlice] --> B[RemoteUpdate]')
    await expect.poll(() => read(1)).toBe('flowchart TD\nA[OfflineAlice] --> B[RemoteUpdate]')

    // 其他协作者删除正在全屏编辑的块，也必须释放本地画布和全屏锁。
    await pages[1].evaluate(id => {
      const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
      doc.crud.deleteBlocks(doc.rootId, doc.model.getChildrenIds(doc.rootId).indexOf(id), 1)
    }, ids.id)
    for (const page of pages) {
      await expect(page.locator('.mw-canvas')).toHaveCount(0)
      await expect(page.locator('body')).not.toHaveClass(/bc-table-fullscreen-lock/)
    }
  } finally {
    await Promise.all(contexts.map(context => context.close()))
  }
})

test('disposed canvases release document listeners and observers, including late renders', async ({page}) => {
  await page.addInitScript(() => {
    const listeners = new Set<string>()
    const ids = new WeakMap<object, number>()
    let nextId = 0
    const add = EventTarget.prototype.addEventListener
    const remove = EventTarget.prototype.removeEventListener
    const key = (target: EventTarget, type: string, listener: any, options: any) => {
      if ((target !== document && target !== window) || !listener || options?.once) return null
      if (!ids.has(listener)) ids.set(listener, ++nextId)
      return `${target === document ? 'doc' : 'window'}:${type}:${typeof options === 'boolean' ? options : !!options?.capture}:${ids.get(listener)}`
    }
    EventTarget.prototype.addEventListener = function(type: string, listener: any, options?: any) {
      const id = key(this, type, listener, options)
      if (id) listeners.add(id)
      return add.call(this, type, listener, options)
    }
    EventTarget.prototype.removeEventListener = function(type: string, listener: any, options?: any) {
      const id = key(this, type, listener, options)
      if (id) listeners.delete(id)
      return remove.call(this, type, listener, options)
    }
    const observers = new Set<object>()
    const observe = MutationObserver.prototype.observe
    const disconnect = MutationObserver.prototype.disconnect
    MutationObserver.prototype.observe = function(target: Node, options?: MutationObserverInit) {
      observers.add(this)
      return observe.call(this, target, options)
    }
    MutationObserver.prototype.disconnect = function() {
      observers.delete(this)
      return disconnect.call(this)
    }
    ;(window as any).__mermaidResources = () => ({
      observers: observers.size,
      documentPointerDown: [...listeners].filter(id => id.startsWith('doc:pointerdown:')).length,
    })
  })
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await waitForEditor(page)
  const id = await page.evaluate(async () => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const [id] = doc.crud.insertBlockSnapshots(doc.rootId, 0,
      [doc.schemas.createSnapshot('mermaid', ['graph', 'flowchart TD\nA[Start] --> B[End]'])])
    await doc.navigateToBlock(id)
    return id
  })
  const block = page.locator(`.mermaid-block[data-block-id="${id}"]`)
  const toggle = () => block.evaluate(el => (window as any).ng.getComponent(el).toggleFullscreen())
  await toggle()
  await expect(block.locator('.mw-canvas .mw-svg-host > svg')).toBeVisible()
  await toggle()
  const readResources = () => page.evaluate(() => (window as any).__mermaidResources())
  const baseline = await readResources()
  for (let iteration = 0; iteration < 12; iteration++) {
    await toggle()
    await expect(block.locator('.mw-canvas')).toHaveCount(1)
    await toggle()
  }
  await expect.poll(readResources).toEqual(baseline)

  await toggle()
  await expect(block.locator('.mw-canvas .mw-svg-host > svg')).toBeVisible()
  await block.evaluate(el => {
    const component = (window as any).ng.getComponent(el)
    const session = component.visualSession
    const render = session.mermaid.render
    session.mermaid.render = async (id: string, code: string) => {
      ;(window as any).__lateRenderStarted = true
      await new Promise<void>(resolve => { (window as any).__releaseLateRender = resolve })
      const result = await render(id, code)
      ;(window as any).__lateRenderFinished = true
      return result
    }
    const text = component.firstChildren
    component.doc.crud.transact(() => text.replaceText(0, text.textLength, 'flowchart TD\nA[Changed] --> B[End]'))
  })
  await page.waitForFunction(() => (window as any).__lateRenderStarted)
  await toggle()
  await page.evaluate(() => (window as any).__releaseLateRender())
  await page.waitForFunction(() => (window as any).__lateRenderFinished)
  await expect(block.locator('.mw-canvas')).toHaveCount(0)
  await expect.poll(readResources).toEqual(baseline)
  await expect(block.locator('.graph-con')).toContainText('Changed')
})
