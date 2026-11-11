import {expect, test, type Page} from '@playwright/test'

async function setup(page: Page, collapsed: boolean, flavour = 'text-box') {
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
  await page.evaluate(async () => {
    await document.fonts.ready
    for (let i = 0; i < 2; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  })
  return page.evaluate(async ({collapsed, flavour}) => {
    const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const viewport = document.createElement('div')
    viewport.style.cssText = 'position:fixed;left:50px;top:60px;width:1100px;height:800px;overflow:auto;background:white;z-index:20;padding:70px'
    const mount = document.createElement('div')
    viewport.append(mount); document.body.append(viewport)
    const args = flavour === 'shape' ? ['rectangle', '浮动工具栏'] : ['浮动工具栏', {width: 280, height: 120}]
    const canvas = document.createElement('canvas'); canvas.width = 560; canvas.height = 140
    const first = source.schemas.createSnapshot(flavour, flavour === 'image' ? [{src: canvas.toDataURL(), wr: 70, ar: 4}]
      : flavour === 'render-unit' ? [{}, {width: 560, height: 140}] : args)
    if (flavour === 'shape') Object.assign(first.props, {width: 280, height: 120})
    const second = source.schemas.createSnapshot('text-box', ['第二个对象', {width: 280, height: 120}])
    const Format = source.plugins.find((p: any) => p.name === (flavour === 'image' ? 'img-toolbar' : flavour === 'render-unit' ? 'callout-toolbar' : 'object-format-toolbar')).constructor
    const plugin = new Format({collapsed})
    const doc = new source.constructor({...source.config, yDoc: new source.yDoc.constructor(), plugins: [plugin],
      readonly: false, virtualization: {enabled: false}, scrollContainer: viewport})
    doc.initBySnapshot({...source.model.toSnapshot(source.rootId), children: [first, second]}, mount)
    await doc.navigateToBlock(first.id)
    doc.root.hostElement.focus()
    // 聚焦会异步发出原生 selectionchange，先让它落地再设置对象选区。
    for (let i = 0; i < 2; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    doc.selection.selectBlock(first.id)
    source.destroy()
    ;(window as any).__toolbarFixture = {doc, plugin, first: first.id, second: second.id}
    return {first: first.id as string, second: second.id as string}
  }, {collapsed, flavour})
}


async function place(page: Page, side: string) {
  await page.evaluate(async side => {
    const {doc, first} = (window as any).__toolbarFixture
    const viewport = doc.scrollContainer
    viewport.style.cssText = 'position:fixed;left:60px;top:60px;width:600px;height:600px;overflow:auto;background:white;z-index:20;padding:0;box-sizing:border-box'
    doc.root.hostElement.style.minHeight = '900px'
    const wide = side === 'top' || side === 'bottom'
    const block = doc.getBlockById(first)
    if (block.flavour === 'render-unit') doc.root.hostElement.style.padding = '12px 20px'
    block.updateProps({wr: null, ar: null, width: wide ? 560 : 280, height: 140})
    doc.placement.setObjectLayout(first, 'over')
    doc.placement.updateAbsolute(first, {x: wide ? -36 : side === 'left' ? 295 : 20, y: side === 'bottom' ? -36 : 260})
    doc.root.hostElement.focus()
    for (let i = 0; i < 3; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    doc.selection.selectBlock(first)
  }, side)
}
async function inBounds(page: Page) {
  return page.locator('bc-object-format-toolbar,bc-object-group-toolbar,bc-image-toolbar,render-unit-toolbar').evaluate(element => {
    const {doc} = (window as any).__toolbarFixture
    const b = doc.scrollContainer.getBoundingClientRect()
    return [...element.querySelectorAll('.floating-toolbar__toggle,.object-format__rail,.object-format__panel')].every(el => {
      const r = el.getBoundingClientRect()
      return r.left >= b.left + 7 && r.top >= b.top + 7 && r.right <= b.right - 7 && r.bottom <= b.bottom - 7
    })
  })
}
for (const side of ['right', 'left', 'top', 'bottom']) {
  test(`mini toolbar chooses ${side} and independently fits its panel`, async ({page}) => {
    await setup(page, false)
    await place(page, side)
    const shell = page.locator('bc-object-format-toolbar bc-floating-toolbar')
    await expect(shell).toHaveAttribute('data-bc-toolbar-placement', side)
    await expect(shell.locator('.object-format__rail')).toHaveCSS('flex-direction', side === 'top' || side === 'bottom' ? 'row' : 'column')
    const toggle = shell.locator('.floating-toolbar__toggle')
    const before = await toggle.boundingBox()
    await shell.getByRole('button', {name: '文本选项', exact: true}).click()
    await expect(shell.locator('.object-format__panel')).toBeVisible()
    await expect.poll(() => inBounds(page)).toBe(true)
    const after = await toggle.boundingBox()
    expect(Math.abs(before!.x - after!.x)).toBeLessThan(1)
    expect(Math.abs(before!.y - after!.y)).toBeLessThan(1)
    await page.screenshot({path: `/tmp/blockcraft-toolbar-${side}-${test.info().project.name}.png`})
    await shell.getByRole('button', {name: '收起对象工具栏', exact: true}).click()
    await expect(shell.locator('.object-format__panel')).toHaveCount(0)
    await expect(shell).toHaveAttribute('data-bc-toolbar-placement', side)
    await shell.getByRole('button', {name: '展开对象工具栏', exact: true}).click()
    await expect.poll(() => inBounds(page)).toBe(true)
  })
}

for (const flavour of ['image', 'render-unit']) {
  test(`${flavour}: narrow scroll container uses a horizontal rail and reachable settings`, async ({page}) => {
    await setup(page, false, flavour)
    await place(page, 'bottom')
    const toolbar = page.locator(flavour === 'image' ? 'bc-image-toolbar' : 'render-unit-toolbar')
    const shell = toolbar.locator('bc-floating-toolbar')
    await expect(shell).toHaveAttribute('data-bc-toolbar-placement', 'bottom')
    await toolbar.getByRole('button', {name: flavour === 'image' ? '布局' : '外观选项', exact: true}).click()
    await expect.poll(() => inBounds(page)).toBe(true)
    await expect(toolbar.locator('.object-format__panel')).toBeVisible()
    await page.screenshot({path: `/tmp/blockcraft-toolbar-${flavour}-${test.info().project.name}.png`})
    if (flavour === 'image') {
      await page.evaluate(() => {
        const {doc, first} = (window as any).__toolbarFixture
        doc.getBlockById(first).updateProps({rotation: 180})
      })
      await expect.poll(() => toolbar.locator('.object-format__rail').evaluate(rail => {
        const {doc, first} = (window as any).__toolbarFixture
        const r = rail.getBoundingClientRect()
        return [...doc.getBlockById(first).hostElement.querySelectorAll('.shape-resizer__handle,.shape-resizer__rotate')].every((el: any) => {
          const c = el.getBoundingClientRect()
          return r.right <= c.left || r.left >= c.right || r.bottom <= c.top || r.top >= c.bottom
        })
      })).toBe(true)
    }
  })
}

test('viewport intersection, scrolling, resizing and card scrolling stay live without idle layout work', async ({page}) => {
  await setup(page, false, 'word-art')
  await place(page, 'bottom')
  const toolbar = page.locator('bc-object-format-toolbar')
  await toolbar.getByRole('button', {name: '文本选项', exact: true}).click()
  await toolbar.locator('.object-format__tabs').getByText('外观', {exact: true}).click()
  const section = toolbar.locator('[data-object-format-section="text-effects"]')
  for (const label of ['文字轮廓', '文字阴影', '文字发光']) {
    const control = section.locator('label').filter({hasText: label}).getByRole('switch')
    if (await control.getAttribute('aria-checked') !== 'true') await control.click()
  }
  await expect.poll(() => inBounds(page)).toBe(true)
  await page.evaluate(() => {
    const {doc} = (window as any).__toolbarFixture
    doc.scrollContainer.style.height = '330px'
    doc.scrollContainer.style.width = '460px'
    doc.scrollContainer.dispatchEvent(new Event('scroll'))
  })
  await expect.poll(() => inBounds(page)).toBe(true)
  const scroller = toolbar.locator('.object-format__scroll')
  await expect.poll(() => scroller.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true)
  await scroller.hover()
  await page.mouse.wheel(0, 200)
  await expect.poll(() => scroller.evaluate(el => el.scrollTop)).toBeGreaterThan(0)
  await page.setViewportSize({width: 500, height: 420})
  await expect.poll(() => toolbar.evaluate(element => [...element.querySelectorAll('.object-format__rail,.object-format__panel')].every(el => {
    const r = el.getBoundingClientRect(); return r.left >= 8 && r.right <= innerWidth - 8 && r.bottom <= innerHeight - 8
  }))).toBe(true)
  // Count geometry reads only after resize/scroll work settles.
  await page.waitForTimeout(250)
  const reads = await toolbar.locator('bc-floating-toolbar').evaluate(async el => {
    let reads = 0
    const original = el.getBoundingClientRect.bind(el)
    el.getBoundingClientRect = () => { reads++; return original() }
    await new Promise(resolve => setTimeout(resolve, 350))
    el.getBoundingClientRect = original
    return reads
  })
  expect(reads).toBe(0)
})

test('group mini rail uses the same horizontal placement and keeps ungroup working', async ({page}) => {
  await setup(page, false)
  await place(page, 'bottom')
  const id = await page.evaluate(() => {
    const {doc, first, second} = (window as any).__toolbarFixture
    doc.getBlockById(second).updateProps({width: 100, height: 80})
    doc.placement.setObjectLayout(second, 'over')
    doc.placement.updateAbsolute(second, {x: 20, y: 0})
    const id = doc.placement.group([first, second])
    if (!id) throw new Error('Cannot group fixture')
    doc.selection.selectBlock(id)
    return id as string
  })
  const toolbar = page.locator('bc-object-group-toolbar')
  await expect(toolbar.locator('bc-floating-toolbar')).toHaveAttribute('data-bc-toolbar-placement', 'bottom')
  await expect(toolbar.locator('.object-format__rail')).toHaveCSS('flex-direction', 'row')
  await toolbar.getByRole('button', {name: '布局', exact: true}).click()
  await expect.poll(() => inBounds(page)).toBe(true)
  await page.evaluate(id => {
    const {doc} = (window as any).__toolbarFixture
    doc.placement.updateAbsolute(id, {x: 260, y: 240})
  }, id)
  await expect(toolbar.locator('bc-floating-toolbar')).toHaveAttribute('data-bc-toolbar-placement', 'left')
  await expect.poll(() => inBounds(page)).toBe(true)
  await toolbar.getByRole('button', {name: '解除组合', exact: true}).click()
  await expect.poll(() => page.evaluate(id => (window as any).__toolbarFixture.doc.model.exists(id), id)).toBe(false)
})
