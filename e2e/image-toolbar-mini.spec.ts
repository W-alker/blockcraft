import {expect, test, type Page} from '@playwright/test'

async function setup(page: Page, collapsed = false, floating = false) {
  await page.setViewportSize({width: 1440, height: 1000})
  await page.routeWebSocket('**', socket => socket.close())
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    return ['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname)
      ? route.abort() : route.continue()
  })
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  await page.evaluate(async () => { await document.fonts.ready })
  const ids = await page.evaluate(async ({collapsed, floating}) => {
    const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const viewport = document.createElement('div')
    viewport.style.cssText = 'position:fixed;left:50px;top:60px;width:1100px;height:800px;overflow:auto;background:white;z-index:20;padding:70px'
    const mount = document.createElement('div')
    viewport.append(mount); document.body.append(viewport)
    const src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"><rect width="240" height="120" fill="#84bdf5"/></svg>')
    const images = [0, 1].map(() => source.schemas.createSnapshot('image', [{src, wr: 35, ar: 2}]))
    const paragraph = source.schemas.createSnapshot('paragraph', ['图片之后的正文'])
    const Img = source.plugins.find((p: any) => p.name === 'img-toolbar').constructor
    const Drag = source.plugins.find((p: any) => p.name === 'ObjectDrag').constructor
    const actions: string[] = []
    const plugin = new Img({collapsed, extraItems: [{name: 'edit', icon: 'bc_bianji', label: '编辑图片'}],
      onExtraItemClick: (name: string) => { actions.push(name); return true }})
    const doc = new source.constructor({...source.config, yDoc: new source.yDoc.constructor(), plugins: [plugin, new Drag()],
      readonly: false, virtualization: {enabled: false}, scrollContainer: viewport})
    doc.initBySnapshot({...source.model.toSnapshot(source.rootId), children: [...images, paragraph]}, mount)
    plugin.fileService = {...plugin.fileService, downloadAttachment: () => actions.push('download')}
    doc.clipboard.copyText = async () => { actions.push('copy-url') }
    if (floating) {
      doc.placement.setObjectLayout(images[0].id, 'over')
      doc.placement.updateAbsolute(images[0].id, {x: 300, y: 180})
    }
    await doc.navigateToBlock(images[0].id)
    doc.root.hostElement.focus()
    for (let i = 0; i < 2; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    ;(window as any).__imageMiniFixture = {doc, plugin, first: images[0].id, second: images[1].id, actions}
    return {first: images[0].id as string, second: images[1].id as string}
  }, {collapsed, floating})
  await page.locator(`[data-block-id="${ids.first}"] .img-wrapper`).click({position: {x: 20, y: 20}})
  return ids
}

test('flow image keeps alignment in secondary settings and quick commands work with mouse and keyboard', async ({page}) => {
  const {first} = await setup(page)
  const toolbar = page.locator('bc-image-toolbar')
  const rail = toolbar.locator('.object-format__rail')
  await expect(rail).toHaveCSS('width', '34px')
  await expect(rail.getByRole('button', {name: '布局', exact: true})).toHaveCSS('width', '26px')
  await expect(toolbar.locator('[name="align"]')).toHaveCount(0)
  await rail.getByRole('button', {name: '布局', exact: true}).click()
  await expect(toolbar.locator('.object-format__panel')).toHaveCSS('width', '176px')
  await expect(toolbar.locator('[name="align"]')).toHaveCount(3)
  await expect(toolbar.locator('.object-layout-option__check')).toHaveCount(1)
  await expect(toolbar.locator('.object-layout-option').first()).toHaveCSS('height', '28px')
  expect(await toolbar.locator('.object-layout-segmented').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(3)
  await toolbar.getByRole('button', {name: '居中', exact: true}).click()
  await expect.poll(() => page.evaluate(() => {
    const {doc, first} = (window as any).__imageMiniFixture
    return doc.model.getProps(first).align
  })).toBe('center')
  await rail.getByRole('button', {name: '下载图片', exact: true}).click()
  await rail.getByRole('button', {name: '复制图片链接', exact: true}).click()
  const edit = rail.getByRole('button', {name: '编辑图片', exact: true})
  await edit.focus()
  await edit.press('Enter')
  expect(await page.evaluate(() => (window as any).__imageMiniFixture.actions)).toEqual(['download', 'copy-url', 'edit'])
  await toolbar.screenshot({path: `/tmp/blockcraft-image-mini-flow-${test.info().project.name}.png`})
  await rail.getByRole('button', {name: '添加图片标题', exact: true}).click()
  await expect(page.locator(`[data-block-id="${first}"] .caption-block`)).toHaveCount(1)
})

test('floating image mini toolbar has no flow alignment and retains live collapse state, anchoring and side flip', async ({page}) => {
  const {first} = await setup(page, true, true)
  const toolbar = page.locator('bc-image-toolbar')
  const shell = toolbar.locator('bc-floating-toolbar')
  const toggle = shell.locator('.floating-toolbar__toggle')
  const expand = shell.getByRole('button', {name: '展开图片工具栏', exact: true})
  await expect(expand).toBeVisible()
  await expect(toolbar.locator('[data-bc-image-format-toolbar]')).toHaveCount(0)
  const top = (await toggle.boundingBox())!.y
  await expand.focus()
  await expand.press('Enter')
  const layout = toolbar.getByRole('button', {name: '布局', exact: true})
  await layout.click()
  await expect(toolbar.locator('.object-format__panel')).toBeVisible()
  await expect(toolbar.locator('[name="align"]')).toHaveCount(0)
  await expect(toolbar.getByRole('button', {name: '添加图片标题', exact: true})).toHaveCount(0)
  await expect(toolbar.getByRole('button', {name: '浮于文字上方', exact: true})).toHaveAttribute('aria-pressed', 'true')
  await expect(toolbar.locator('[name="object-layout"]')).toHaveCount(5)
  await expect.poll(async () => Math.abs((await toggle.boundingBox())!.y - top)).toBeLessThan(1)
  await expect(toolbar.getByRole('button', {name: '上移一层', exact: true})).toBeDisabled()
  await toolbar.getByRole('button', {name: '下移一层', exact: true}).click()
  await expect(toolbar.getByRole('button', {name: '上移一层', exact: true})).toBeEnabled()
  await toolbar.getByRole('button', {name: '上移一层', exact: true}).click()
  await expect(toolbar.getByRole('button', {name: '上移一层', exact: true})).toBeDisabled()
  await page.evaluate(() => (window as any).__imageMiniFixture.plugin.setCollapsed(true))
  await expect(toolbar.locator('.object-format__panel')).toHaveCount(0)
  await expect.poll(async () => Math.abs((await toggle.boundingBox())!.y - top)).toBeLessThan(1)
  await page.evaluate(() => (window as any).__imageMiniFixture.plugin.setCollapsed(false))
  await expect(toolbar.locator('.object-format__panel')).toHaveCount(0)
  await page.evaluate(() => {
    const {doc, first} = (window as any).__imageMiniFixture
    doc.placement.updateAbsolute(first, {x: 700, y: 180})
  })
  await layout.click()
  await expect(toolbar.locator('[data-bc-image-format-toolbar]')).toHaveClass(/object-format--left/)
  await expect.poll(() => toolbar.locator('.object-format__scroll').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0)
  await toolbar.screenshot({path: `/tmp/blockcraft-image-mini-floating-${test.info().project.name}.png`})
  await toolbar.getByRole('button', {name: '上下型', exact: true}).click()
  await expect.poll(() => page.evaluate(id => (window as any).__imageMiniFixture.doc.placement.getObjectLayout(id), first)).toBe('top-bottom')
  await page.evaluate(() => {
    const {doc, first} = (window as any).__imageMiniFixture
    doc.selection.selectBlock(first)
  })
  await toolbar.getByRole('button', {name: '布局', exact: true}).click()
  await expect(toolbar.locator('[name="align"]')).toHaveCount(3)
  await page.evaluate(() => (window as any).__imageMiniFixture.doc.toggleReadonly(true))
  await expect(toolbar).toHaveCount(0)
})

test('image switching retains collapse preference and clears the previous settings card', async ({page}) => {
  await setup(page)
  const toolbar = page.locator('bc-image-toolbar')
  await toolbar.getByRole('button', {name: '布局', exact: true}).click()
  await toolbar.getByRole('button', {name: '收起图片工具栏', exact: true}).click()
  await page.evaluate(() => {
    const {doc, second} = (window as any).__imageMiniFixture
    doc.selection.selectBlock(second)
  })
  await expect(toolbar.getByRole('button', {name: '展开图片工具栏', exact: true})).toBeVisible()
  await toolbar.getByRole('button', {name: '展开图片工具栏', exact: true}).click()
  await expect(toolbar.locator('.object-format__panel')).toHaveCount(0)
  await expect(toolbar.getByRole('button', {name: '布局', exact: true})).toBeVisible()
})

for (const scale of [0.75, 1, 1.5]) {
  test(`floating image toolbar follows the visible frame and clears rotated controls at ${scale}x`, async ({page}) => {
    const {first} = await setup(page, false, true)
    const toolbar = page.locator('bc-image-toolbar')
    await expect(toolbar).toBeVisible()
    await page.evaluate(({first, scale}) => {
      const {doc} = (window as any).__imageMiniFixture
      doc.viewScale.attach(doc.root.hostElement.parentElement)
      doc.viewScale.setScale(scale)
    }, {first, scale})
    const measure = () => page.evaluate(id => {
      const host = document.querySelector(`[data-block-id="${id}"]`)!
      const frame = host.querySelector('.shape-resizer__frame')!.getBoundingClientRect()
      const controls = [...host.querySelectorAll('.shape-resizer__handle,.shape-resizer__rotate')].map(el => el.getBoundingClientRect())
      const left = Math.min(frame.left, ...controls.map(rect => rect.left))
      const right = Math.max(frame.right, ...controls.map(rect => rect.right))
      const rail = document.querySelector('bc-image-toolbar .object-format__rail')!.getBoundingClientRect()
      const toggle = document.querySelector('bc-image-toolbar .floating-toolbar__toggle')!.getBoundingClientRect()
      return {
        topError: Math.abs(toggle.top - frame.top),
        gap: rail.left >= right ? rail.left - right : left - rail.right,
        controlsClear: controls.every(rect => rail.right <= rect.left || rail.left >= rect.right || rail.bottom <= rect.top || rail.top >= rect.bottom),
      }
    }, first)
    for (const rotation of [0, 45, 90, 180, 270]) {
      await page.evaluate(({first, rotation}) => {
        const {doc} = (window as any).__imageMiniFixture
        doc.getBlockById(first).updateProps({rotation})
      }, {first, rotation})
      await expect.poll(() => page.locator(`[data-block-id="${first}"] .img-wrapper`).evaluate(el => {
        const matrix = new DOMMatrixReadOnly(getComputedStyle(el).transform)
        return Math.round(((Math.atan2(matrix.b, matrix.a) * 180 / Math.PI + 360) % 360) * 1000) / 1000
      })).toBe(rotation)
      await expect.poll(async () => (await measure()).topError).toBeLessThan(1)
      await expect.poll(async () => Math.abs((await measure()).gap - 6)).toBeLessThan(1)
      await expect.poll(async () => (await measure()).controlsClear).toBe(true)
    }
  })
}
