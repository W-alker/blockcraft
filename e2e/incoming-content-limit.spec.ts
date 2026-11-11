import {expect, test, type Page} from '@playwright/test'

async function ready(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('playground-home')))
  await page.evaluate(() => { (window as any).ng.getComponent(document.querySelector('playground-home')).ensureEditorInitialized() })
}

async function mount(page: Page) {
  await ready(page)
  await page.evaluate(() => {
    const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const viewport = document.createElement('div')
    viewport.style.cssText = 'position:fixed;inset:20px;background:white;z-index:99999;overflow:auto'
    const target = document.createElement('div')
    viewport.append(target)
    document.body.append(viewport)
    const p = source.schemas.createSnapshot('paragraph', ['keep me'])
    const root = source.schemas.createSnapshot('root', ['incoming-limit', [p]])
    const doc = new source.constructor({...source.config, yDoc: new source.yDoc.constructor(),
      docId: root.id, plugins: [], readonly: false, scrollContainer: viewport, virtualization: {enabled: false}})
    doc.initBySnapshot(root, target)
    doc.crud.undoManager.clearHistory()
    const warnings: string[] = []
    doc.messageService.warn = (message: string) => warnings.push(message)
    const block = doc.getBlockById(p.id)
    block.hostElement.querySelector('.edit-container').focus()
    doc.selection.setSelection({type: 'text', blockId: p.id, offset: 0}, {type: 'text', blockId: p.id, offset: 4})
    ;(window as any).incomingLimit = {doc, block, warnings, updates: 0}
    doc.yDoc.on('update', () => (window as any).incomingLimit.updates++)
  })
}

async function paste(page: Page, text: string) {
  return page.evaluate(async text => {
    const probe = (window as any).incomingLimit
    const data = new DataTransfer()
    data.setData('text/plain', text)
    const event = new ClipboardEvent('paste', {bubbles: true, cancelable: true})
    Object.defineProperty(event, 'clipboardData', {value: data})
    probe.block.hostElement.dispatchEvent(event)
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    return {text: probe.block.textContent(), dom: probe.block.hostElement.querySelector('.edit-container').textContent,
      prevented: event.defaultPrevented, warnings: probe.warnings, updates: probe.updates,
      undo: probe.doc.crud.undoManager.isCanUndo(), selection: probe.doc.selection.value.toJSON()}
  }, text)
}

test('1.5 MB 超限粘贴不修改 DOM、Yjs、选区或 Undo；后续小粘贴仍可撤销', async ({page}) => {
  await mount(page)
  const before = await page.evaluate(() => (window as any).incomingLimit.doc.selection.value.toJSON())
  const rejected = await paste(page, '中'.repeat(530000))
  expect(rejected.prevented).toBe(true)
  expect(rejected.text).toBe('keep me')
  expect(rejected.dom).toContain('keep me')
  expect(rejected.updates).toBe(0)
  expect(rejected.undo).toBe(false)
  expect(rejected.selection).toEqual(before)
  expect(rejected.warnings).toEqual(['本次粘贴或导入的协同内容超过 1.5 MB，请分批插入'])
  const accepted = await paste(page, 'ok')
  expect(accepted.text).toBe('ok me')
  expect(accepted.dom).toContain('ok me')
  expect(accepted.updates).toBeGreaterThan(0)
  await page.evaluate(() => (window as any).incomingLimit.doc.crud.undoManager.undo())
  expect(await page.evaluate(() => (window as any).incomingLimit.block.textContent())).toBe('keep me')
})

test('大于上限的既有文档仍允许小粘贴', async ({page}) => {
  await mount(page)
  await page.evaluate(() => {
    const probe = (window as any).incomingLimit
    probe.doc.yDoc.getMap('existing-data').set('history', 'x'.repeat(2000000))
    probe.updates = 0
  })
  expect((await paste(page, 'small')).text).toBe('small me')
})

test('多行粘贴复用已校验快照，光标到末段且一次撤销完整恢复', async ({page}) => {
  await mount(page)
  await paste(page, 'a\nb\nc')
  const result = await page.evaluate(() => {
    const {doc} = (window as any).incomingLimit
    const blocks = doc.model.getChildrenIds(doc.rootId).map((id: string) => doc.getBlockById(id))
    return {text: blocks.map((block: any) => block.textContent()),
      dom: blocks.map((block: any) => block.hostElement.querySelector('.edit-container').textContent),
      end: doc.selection.value.end.offset, endId: doc.selection.value.end.blockId, lastId: blocks.at(-1).id}
  })
  expect(result.text).toEqual(['a me', 'b', 'c'])
  expect(result.dom[0]).toContain('a me')
  expect(result.dom[2]).toContain('c')
  expect(result.endId).toBe(result.lastId)
  expect(result.end).toBe(1)
  await page.evaluate(() => (window as any).incomingLimit.doc.crud.undoManager.undo())
  expect(await page.evaluate(() => {
    const {doc} = (window as any).incomingLimit
    return doc.model.getChildrenIds(doc.rootId).map((id: string) => doc.getBlockById(id).textContent())
  })).toEqual(['keep me'])
})

for (const method of ['importMarkdown', 'importHTML', 'importBlockSnapshotTxt']) {
  test(`${method} 在正式入模前拒绝超限解析结果`, async ({page}) => {
    await ready(page)
    const input = await page.evaluate(method => {
      const app = (window as any).ng.getComponent(document.querySelector('playground-home'))
      const editor = app.ensureEditorInitialized()
      const doc = editor.doc
      doc.config.maxIncomingContentBytes = 1024
      const warnings: string[] = []
      doc.messageService.warn = (s: string) => warnings.push(s)
      const text = '中'.repeat(600)
      const root = doc.schemas.createSnapshot('root', ['import-test', [doc.schemas.createSnapshot('paragraph', [text])]])
      const input = method === 'importMarkdown' ? text : method === 'importHTML' ? `<p>${text}</p>` : JSON.stringify(root)
      const before = JSON.stringify(doc.exportSnapshot())
      let updates = 0
      doc.yDoc.on('update', () => updates++)
      let conversions = 0
      if (method !== 'importBlockSnapshotTxt') {
        const adapter = doc.clipboard.adapter.getAdapter(method === 'importMarkdown' ? 'text/markdown' : 'text/html')
        const original = adapter.toSnapshot
        adapter.toSnapshot = (...args: unknown[]) => {conversions++; return original(...args)}
      }
      ;(window as any).incomingImport = {app, doc, warnings, before, get updates() { return updates }, get conversions() {return conversions}}
      return input
    }, method)
    const chooserPromise = page.waitForEvent('filechooser')
    await page.evaluate(method => {
      const probe = (window as any).incomingImport
      probe.done = probe.app[method]()
    }, method)
    const chooser = await chooserPromise
    await chooser.setFiles({name: method === 'importMarkdown' ? 'incoming.md' : method === 'importHTML' ? 'incoming.html' : 'incoming.txt', mimeType: 'text/plain', buffer: Buffer.from(input)})
    const result = await page.evaluate(async () => {
      const probe = (window as any).incomingImport
      await probe.done
      return {unchanged: probe.before === JSON.stringify(probe.doc.exportSnapshot()), updates: probe.updates, warnings: probe.warnings, conversions: probe.conversions}
    })
    expect(result.unchanged).toBe(true)
    expect(result.updates).toBe(0)
    expect(result.conversions).toBe(0)
    expect(result.warnings.some(message => message.includes('超过 1024 字节'))).toBe(true)
  })
}
