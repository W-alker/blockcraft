import {expect, test, type Page} from '@playwright/test'
import {createRequire} from 'node:module'
import path from 'node:path'

const projectRequire = createRequire(path.resolve('package.json'))
const buildRequire = createRequire(projectRequire.resolve('@angular-devkit/build-angular/package.json'))
const {compile, Logger} = buildRequire('sass')
const {transformSync} = buildRequire('esbuild')
// A host targeting Chrome does not automatically add Safari's user-select
// prefix. Exercise the shipped theme instead of the playground's CSS target.
const hostThemeCss = transformSync(compile(path.resolve('packages/editor/themes/base.scss'), {
  logger: Logger.silent,
}).css, {loader: 'css', target: ['chrome114']}).code

for (const readonly of [true, false]) {
  test(`原始主题在宿主禁选样式下允许${readonly ? '只读' : '编辑'}正文拖选和复制`, async ({page}) => {
    await page.setContent(`<style>${hostThemeCss}
      body {margin:40px}
      .shell > .content {-webkit-user-select:none!important;user-select:none!important}
    </style>
    <div class="shell"><div class="content"><div data-blockcraft-root="true"
      class="root-block ${readonly ? 'readonly' : ''}" contenteditable="${!readonly}">
      <p class="paragraph-block" data-block-id="paragraph" data-node-type="editable">
        <span class="bc-paragraph-text edit-container" contenteditable="${!readonly}"><c-element><c-text>Readonly selection must remain available</c-text></c-element><c-element><span contenteditable="false">Atomic embed</span></c-element></span>
      </p>
    </div></div></div><textarea aria-label="复制结果"></textarea>`)
    const text = page.locator('c-text')
    const bounds = await text.boundingBox()
    if (!bounds) throw new Error('Readonly text is not mounted')
    await page.mouse.move(bounds.x + 2, bounds.y + bounds.height / 2)
    await page.mouse.down()
    await page.mouse.move(bounds.x + bounds.width - 2, bounds.y + bounds.height / 2, {steps: 12})
    await page.mouse.up()
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toContain('selection')
    await page.keyboard.press('ControlOrMeta+c')
    await page.getByRole('textbox', {name: '复制结果'}).click()
    await page.keyboard.press('ControlOrMeta+v')
    await expect(page.getByRole('textbox', {name: '复制结果'})).toHaveValue('Readonly selection must remain available')
    expect(await page.locator('.edit-container span[contenteditable="false"]').evaluate(element =>
      getComputedStyle(element).getPropertyValue('-webkit-user-select'),
    )).toBe('none')
  })
}

async function mountReadonlyDocument(page: Page) {
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng
    ?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  await page.evaluate(() => {
    const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const viewport = document.createElement('div')
    viewport.id = 'readonly-copy-fixture'
    viewport.style.cssText = 'position:fixed;left:40px;top:40px;width:850px;height:540px;overflow:auto;background:white;z-index:99999;padding:24px'
    const mount = document.createElement('div')
    viewport.appendChild(mount)
    document.body.appendChild(viewport)
    const paragraph = source.schemas.createSnapshot('paragraph', ['Readonly selection must remain available'])
    const table = source.schemas.createSnapshot('table', [1, 2])
    table.children[0].children.forEach((cell: any, i: number) => {
      cell.children = [source.schemas.createSnapshot('paragraph', [i === 0 ? 'Alpha' : 'Beta'])]
    })
    const snapshot = source.schemas.createSnapshot('root', ['readonly-copy', [paragraph, table]])
    const binding = source.config.plugins.find((plugin: any) => plugin.name === 'table-block-binding')
    const doc = new source.constructor({
      ...source.config, yDoc: new source.yDoc.constructor(), docId: snapshot.id,
      plugins: [new binding.constructor()], readonly: true,
      scrollContainer: viewport, virtualization: {enabled: false},
    })
    doc.initBySnapshot(snapshot, mount)
    ;(window as any).readonlyCopyFixture = {doc, paragraphId: paragraph.id, tableId: table.id}
  })
  await expect(page.locator('#readonly-copy-fixture [data-blockcraft-root]')).toHaveClass(/readonly/)
}

test('只读正文允许原生鼠标拖选，复制不改动文档', async ({page}) => {
  await mountReadonlyDocument(page)
  const text = page.locator('#readonly-copy-fixture c-text').first()
  const bounds = await text.boundingBox()
  if (!bounds) throw new Error('Readonly text is not mounted')
  await page.mouse.move(bounds.x + 2, bounds.y + bounds.height / 2)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width - 2, bounds.y + bounds.height / 2, {steps: 12})
  await page.mouse.up()
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toContain('selection')

  const result = await page.evaluate(() => {
    const {doc} = (window as any).readonlyCopyFixture
    const before = JSON.stringify(doc.exportSnapshot())
    const data = new DataTransfer()
    const event = new ClipboardEvent('copy', {bubbles: true, cancelable: true, clipboardData: data})
    // Firefox does not retain constructor-supplied synthetic clipboard data.
    Object.defineProperty(event, 'clipboardData', {value: data})
    doc.root.hostElement.dispatchEvent(event)
    return {text: data.getData('text/plain'), prevented: event.defaultPrevented,
      unchanged: before === JSON.stringify(doc.exportSnapshot())}
  })
  expect(result).toMatchObject({prevented: true, unchanged: true})
  expect(result.text).toContain('selection')
})

test('只读表格矩形选区保留编辑器焦点和复制入口', async ({page}) => {
  await mountReadonlyDocument(page)
  const result = await page.evaluate(() => {
    const {doc, tableId} = (window as any).readonlyCopyFixture
    const table = doc.getBlockById(tableId)
    const cells = doc.model.getChildrenIds(doc.model.getChildrenIds(tableId)[0])
    doc.selection.setTableCellSelection(table, cells[0], cells[1], true)
    const before = JSON.stringify(doc.exportSnapshot())
    let copied = false
    doc.clipboard.copyBlocksModel = () => { copied = true; return Promise.resolve() }
    const data = new DataTransfer()
    const event = new ClipboardEvent('copy', {bubbles: true, cancelable: true, clipboardData: data})
    Object.defineProperty(event, 'clipboardData', {value: data})
    doc.root.hostElement.dispatchEvent(event)
    return {focused: document.activeElement === doc.root.hostElement,
      copied, prevented: event.defaultPrevented, readonly: doc.isReadonly,
      unchanged: before === JSON.stringify(doc.exportSnapshot())}
  })
  expect(result).toEqual({focused: true, copied: true, prevented: true, readonly: true, unchanged: true})
})

test('只读表格通过快捷键写入剪贴板，随后可重新拖选正文', async ({page}) => {
  await mountReadonlyDocument(page)
  const before = await page.evaluate(() => {
    const fixture = (window as any).readonlyCopyFixture
    const {doc, tableId} = fixture
    const cells = doc.model.getChildrenIds(doc.model.getChildrenIds(tableId)[0])
    doc.selection.setTableCellSelection(doc.getBlockById(tableId), cells[0], cells[1], true)
    const original = doc.clipboard.copyBlocksModel.bind(doc.clipboard)
    fixture.copyResult = 'pending'
    doc.clipboard.copyBlocksModel = (...args: any[]) => original(...args).then(
      (value: unknown) => { fixture.copyResult = 'success'; return value },
      (error: unknown) => { fixture.copyResult = String(error); throw error },
    )
    const destination = document.createElement('textarea')
    destination.id = 'readonly-copy-destination'
    document.getElementById('readonly-copy-fixture')!.appendChild(destination)
    return doc.exportSnapshot()
  })
  await page.keyboard.press('ControlOrMeta+c')
  await expect.poll(() => page.evaluate(() => (window as any).readonlyCopyFixture.copyResult)).toBe('success')
  await page.locator('#readonly-copy-destination').click()
  await page.keyboard.press('ControlOrMeta+v')
  await expect(page.locator('#readonly-copy-destination')).toHaveValue(/Alpha[\s\S]*Beta/)

  const text = page.locator('#readonly-copy-fixture c-text').first()
  const bounds = await text.boundingBox()
  if (!bounds) throw new Error('Readonly text is not mounted')
  await page.mouse.move(bounds.x + 2, bounds.y + bounds.height / 2)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width - 2, bounds.y + bounds.height / 2, {steps: 12})
  await page.mouse.up()
  // After a textarea paste Firefox's Selection.toString() can still report
  // that control's empty selection. Inspect the DOM Range and actual copy.
  await expect.poll(() => page.evaluate(() => {
    const selection = window.getSelection()
    return selection?.rangeCount ? selection.getRangeAt(0).toString() : ''
  })).toContain('selection')
  await page.keyboard.press('ControlOrMeta+c')
  await page.locator('#readonly-copy-destination').fill('')
  await page.keyboard.press('ControlOrMeta+v')
  await expect(page.locator('#readonly-copy-destination')).toHaveValue('Readonly selection must remain available')
  expect(await page.evaluate(() => (window as any).readonlyCopyFixture.doc.exportSnapshot())).toEqual(before)
})

test('切换阅读和编辑模式时维护焦点属性，阅读模式仍禁止剪切和粘贴', async ({page}) => {
  await mountReadonlyDocument(page)
  const root = page.locator('#readonly-copy-fixture [data-blockcraft-root]')
  await expect(root).toHaveAttribute('tabindex', '-1')
  await page.evaluate(() => (window as any).readonlyCopyFixture.doc.toggleReadonly(false))
  await expect(root).not.toHaveAttribute('tabindex')
  await expect(root).toHaveAttribute('contenteditable', 'true')
  await page.evaluate(() => (window as any).readonlyCopyFixture.doc.toggleReadonly(true))
  await expect(root).toHaveAttribute('tabindex', '-1')
  await expect(root).toHaveAttribute('contenteditable', 'false')

  const result = await page.evaluate(() => {
    const {doc, tableId} = (window as any).readonlyCopyFixture
    const cells = doc.model.getChildrenIds(doc.model.getChildrenIds(tableId)[0])
    doc.selection.setTableCellSelection(doc.getBlockById(tableId), cells[0], cells[1], true)
    const before = JSON.stringify(doc.exportSnapshot())
    for (const type of ['cut', 'paste']) {
      const data = new DataTransfer()
      data.setData('text/plain', 'Forbidden mutation')
      const event = new ClipboardEvent(type, {bubbles: true, cancelable: true, clipboardData: data})
      Object.defineProperty(event, 'clipboardData', {value: data})
      doc.root.hostElement.dispatchEvent(event)
    }
    return before === JSON.stringify(doc.exportSnapshot())
  })
  expect(result).toBe(true)
})

test('完整插件装配只读正文拖选后，原生复制进入 BlockCraft 与 adapter 链路', async ({page}) => {
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng
    ?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.toggleReadonly(true)
    const probe = {copyCalls: 0, copyFinished: false, adapters: [] as string[], warnings: [] as string[], html: '', prevented: false, before: doc.exportSnapshot()}
    ;(window as any).readonlyAdapterProbe = probe
    const originalCopy = doc.clipboard.copyFromSelection.bind(doc.clipboard)
    doc.clipboard.copyFromSelection = (...args: any[]) => {
      probe.copyCalls++
      return originalCopy(...args).then((value: unknown) => { probe.copyFinished = true; return value })
    }
    for (const adapter of doc.clipboard.adapter.supportedAdapters) {
      const original = adapter.fromSnapshot.bind(adapter)
      adapter.fromSnapshot = (...args: any[]) => {
        probe.adapters.push(adapter.type)
        return original(...args)
      }
    }
    const originalWarn = doc.logger.warn.bind(doc.logger)
    doc.logger.warn = (...args: any[]) => {
      probe.warnings.push(args.map(String).join(' '))
      originalWarn(...args)
    }
    document.addEventListener('copy', event => { probe.prevented = event.defaultPrevented }, {once: true})
    const destination = document.createElement('textarea')
    destination.id = 'readonly-adapter-destination'
    destination.style.cssText = 'position:fixed;bottom:20px;left:40px;z-index:99999'
    destination.addEventListener('paste', event => { probe.html = event.clipboardData?.getData('text/html') ?? '' })
    document.body.appendChild(destination)
  })
  const text = page.locator('block-craft-editor .paragraph-block c-text').filter({hasText: '产品说明'}).first()
  await text.scrollIntoViewIfNeeded()
  const points = await text.evaluate(element => {
    const node = element.firstChild!
    const range = element.ownerDocument.createRange()
    range.setStart(node, 0)
    range.setEnd(node, 1)
    const first = range.getBoundingClientRect()
    // Keep the gesture inside visible prose, away from the playground's
    // floating scale controls and text wrapping boundaries.
    const end = Math.min(12, node.textContent!.length)
    range.setStart(node, end - 1)
    range.setEnd(node, end)
    const last = range.getBoundingClientRect()
    return {start: {x: first.left + 1, y: first.top + first.height / 2},
      end: {x: last.right - 1, y: last.top + last.height / 2}}
  })
  await page.mouse.move(points.start.x, points.start.y)
  await page.mouse.down()
  await page.mouse.move(points.end.x, points.end.y, {steps: 12})
  await page.mouse.up()
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toContain('产品说明')
  await page.keyboard.press('ControlOrMeta+c')
  await expect.poll(() => page.evaluate(() => (window as any).readonlyAdapterProbe.copyCalls)).toBe(1)
  await expect.poll(() => page.evaluate(() => (window as any).readonlyAdapterProbe.adapters)).toEqual(['text/html', 'text/markdown'])
  await expect.poll(() => page.evaluate(() => (window as any).readonlyAdapterProbe.copyFinished)).toBe(true)
  await page.locator('#readonly-adapter-destination').click()
  await page.keyboard.press('ControlOrMeta+v')
  await expect(page.locator('#readonly-adapter-destination')).toHaveValue(/产品说明/)
  const result = await page.evaluate(() => {
    const probe = (window as any).readonlyAdapterProbe
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    return {html: probe.html, prevented: probe.prevented, warnings: probe.warnings,
      unchanged: JSON.stringify(probe.before) === JSON.stringify(doc.exportSnapshot())}
  })
  expect(result).toMatchObject({prevented: true, warnings: [], unchanged: true})
  expect(result.html).toContain('产品说明')
  expect(result.html).toContain('data-bc-clipboard-format')
})
