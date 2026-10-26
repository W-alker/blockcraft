import {expect, test} from '@playwright/test'

test.beforeEach(async ({page}) => {
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng
    ?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  await page.evaluate(() => {
    const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const viewport = document.createElement('div')
    viewport.id = 'readonly-link-fixture'
    viewport.style.cssText = 'position:fixed;inset:40px;overflow:auto;background:white;z-index:99999;padding:24px'
    const mount = document.createElement('div')
    viewport.appendChild(mount)
    document.body.appendChild(viewport)
    const paragraph = source.schemas.createSnapshot('paragraph', [[
      {insert: 'Read this linked document', attributes: {'a:link': 'https://example.com/document'}},
      {insert: ' ordinary text'},
    ]])
    const snapshot = source.schemas.createSnapshot('root', ['readonly-links', [paragraph]])
    const existing = source.config.plugins.find((p: any) => p.name === 'inline-link-extension')
    const opened: string[] = []
    const plugin = new existing.constructor((url: string) => opened.push(url))
    const doc = new source.constructor({
      ...source.config, yDoc: new source.yDoc.constructor(), docId: snapshot.id,
      plugins: [plugin], readonly: true, scrollContainer: viewport, virtualization: {enabled: false},
    })
    doc.initBySnapshot(snapshot, mount)
    source.destroy()
    ;(window as any).readonlyLinkProbe = {doc, plugin, opened, before: doc.exportSnapshot()}
  })
})

const linkSelector = '#readonly-link-fixture c-element[link] c-text'

test('只读单击只导航一次且不改正文，保存重开后仍可单击', async ({page}) => {
  const link = page.locator(linkSelector)
  await expect(link).toBeVisible()
  await link.click()
  expect(await page.evaluate(() => (window as any).readonlyLinkProbe.opened)).toEqual(['https://example.com/document'])
  expect(await page.evaluate(() => {
    const {doc, before, plugin} = (window as any).readonlyLinkProbe
    return {unchanged: JSON.stringify(doc.exportSnapshot()) === JSON.stringify(before), toolbar: !!plugin._cpr}
  })).toEqual({unchanged: true, toolbar: false})
  await page.evaluate(() => {
    const probe = (window as any).readonlyLinkProbe
    const old = probe.doc
    const snapshot = old.exportSnapshot()
    const config = old.config
    const Doc = old.constructor
    const Plugin = probe.plugin.constructor
    old.destroy()
    const mount = document.createElement('div')
    document.getElementById('readonly-link-fixture')!.appendChild(mount)
    probe.plugin = new Plugin((url: string) => probe.opened.push(url))
    probe.doc = new Doc({...config, yDoc: new old.yDoc.constructor(), plugins: [probe.plugin]})
    probe.doc.initBySnapshot(snapshot, mount)
  })
  await page.locator(linkSelector).click()
  expect(await page.evaluate(() => (window as any).readonlyLinkProbe.opened.length)).toBe(2)
})

test('只读双击不重复导航，右键不导航', async ({page}) => {
  const link = page.locator(linkSelector)
  await link.click({button: 'right'})
  expect(await page.evaluate(() => (window as any).readonlyLinkProbe.opened)).toEqual([])
  await page.keyboard.press('Escape')
  await link.dblclick()
  expect(await page.evaluate(() => (window as any).readonlyLinkProbe.opened.length)).toBe(1)
})

test('只读拖选链接文字不导航', async ({page}) => {
  const box = await page.locator(linkSelector).boundingBox()
  if (!box) throw new Error('missing link')
  await page.mouse.move(box.x + 3, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width - 3, box.y + box.height / 2, {steps: 12})
  await page.mouse.up()
  expect(await page.evaluate(() => window.getSelection()?.toString())).toContain('linked')
  expect(await page.evaluate(() => (window as any).readonlyLinkProbe.opened)).toEqual([])
})

test('编辑模式仍单击工具栏、双击导航，并支持动态切回只读', async ({page}) => {
  await page.evaluate(() => (window as any).readonlyLinkProbe.doc.toggleReadonly(false))
  await page.locator(linkSelector).click()
  expect(await page.evaluate(() => {
    const {opened, plugin} = (window as any).readonlyLinkProbe
    return {opened, toolbar: !!plugin._cpr}
  })).toEqual({opened: [], toolbar: true})
  await page.locator(linkSelector).dblclick()
  expect(await page.evaluate(() => (window as any).readonlyLinkProbe.opened.length)).toBe(1)
  await page.evaluate(() => {
    const {doc, plugin} = (window as any).readonlyLinkProbe
    plugin.closeToolbar()
    window.getSelection()?.removeAllRanges()
    doc.toggleReadonly(true)
  })
  await page.locator(linkSelector).click()
  expect(await page.evaluate(() => (window as any).readonlyLinkProbe.opened.length)).toBe(2)
})
