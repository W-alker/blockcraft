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
    const first = source.schemas.createSnapshot(flavour, args)
    if (flavour === 'shape') Object.assign(first.props, {width: 280, height: 120})
    const second = source.schemas.createSnapshot('text-box', ['第二个对象', {width: 280, height: 120}])
    const Format = source.plugins.find((p: any) => p.name === 'object-format-toolbar').constructor
    const plugin = new Format({collapsed})
    const doc = new source.constructor({...source.config, yDoc: new source.yDoc.constructor(), plugins: [plugin],
      readonly: false, virtualization: {enabled: false}, scrollContainer: viewport})
    doc.initBySnapshot({...source.model.toSnapshot(source.rootId), children: [first, second]}, mount)
    await doc.navigateToBlock(first.id)
    doc.root.hostElement.focus()
    // 聚焦会异步发出原生 selectionchange，先让它落地再设置对象选区。
    for (let i = 0; i < 2; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    doc.selection.selectBlock(first.id)
    ;(window as any).__toolbarFixture = {doc, plugin, first: first.id, second: second.id}
    return {first: first.id as string, second: second.id as string}
  }, {collapsed, flavour})
}

for (const flavour of ['text-box', 'word-art', 'shape']) {
  test(`${flavour}: mini rail supports initial collapse, keyboard expansion and object switching`, async ({page}) => {
    await setup(page, true, flavour)
    const shell = page.locator('bc-object-format-toolbar bc-floating-toolbar')
    const toolbar = page.locator('[data-bc-object-format-toolbar]')
    const expand = shell.getByRole('button', {name: '展开对象工具栏', exact: true})
    await expect(expand).toBeVisible()
    await expect(toolbar).toHaveCount(0)
    await expect(expand).toHaveAttribute('aria-expanded', 'false')
    await expect.poll(() => shell.evaluate(element => {
      const pane = element.closest('.cdk-overlay-pane')!
      return pane.scrollHeight === pane.clientHeight && pane.scrollWidth === pane.clientWidth
    })).toBe(true)
    await expect(shell.locator('.floating-toolbar__toggle')).toHaveCSS('width', '24px')
    expect(await shell.locator('.floating-toolbar__toggle').evaluate(button => {
      const circle = getComputedStyle(button, '::before')
      const pane = button.closest('.cdk-overlay-pane')!
      return {circleWidth: circle.width, overflowX: getComputedStyle(pane).overflowX, overflowY: getComputedStyle(pane).overflowY}
    })).toEqual({circleWidth: '20px', overflowX: 'visible', overflowY: 'visible'})
    await expand.focus()
    await expand.press('Enter')
    await expect(toolbar).toBeVisible()
    await expect(toolbar.locator('.object-format__rail')).toHaveCSS('width', '34px')
    await expect(toolbar.getByRole('button', {name: '布局与排列', exact: true})).toHaveCSS('width', '26px')
    await toolbar.getByRole('button', {name: '文本选项', exact: true}).click()
    await expect(toolbar.locator('.object-format__panel')).toBeVisible()
    const collapse = shell.getByRole('button', {name: '收起对象工具栏', exact: true})
    await collapse.focus()
    await collapse.press('Space')
    await expect(toolbar).toHaveCount(0)
    await expect(toolbar.locator('.object-format__panel')).toHaveCount(0)
    await page.evaluate(() => {
      const {doc, second} = (window as any).__toolbarFixture
      doc.selection.selectBlock(second)
    })
    await expect(expand).toBeVisible()
    await expect(toolbar).toBeHidden()
    await expand.click()
    await expect(toolbar).toBeVisible()
    await expect(toolbar.locator('.object-format__panel')).toHaveCount(0)
    await page.evaluate(() => (window as any).__toolbarFixture.doc.toggleReadonly(true))
    await expect(shell).toHaveCount(0)
  })
}

test('live API closes settings, returns focus to the toggle and never writes document data', async ({page}) => {
  await setup(page, false)
  const shell = page.locator('bc-object-format-toolbar bc-floating-toolbar')
  const toolbar = page.locator('[data-bc-object-format-toolbar]')
  await toolbar.getByRole('button', {name: '布局与排列', exact: true}).click()
  await expect(toolbar.locator('.object-format__panel')).toBeVisible()
  await toolbar.getByRole('button', {name: '布局与排列', exact: true}).focus()
  const before = await page.evaluate(() => {
    const {doc} = (window as any).__toolbarFixture
    return JSON.stringify(doc.model.toSnapshot(doc.rootId))
  })
  await page.evaluate(() => (window as any).__toolbarFixture.plugin.setCollapsed(true))
  await expect(toolbar).toBeHidden()
  await expect(shell.getByRole('button', {name: '展开对象工具栏', exact: true})).toBeFocused()
  await expect(toolbar.locator('.object-format__panel')).toHaveCount(0)
  await page.evaluate(() => (window as any).__toolbarFixture.plugin.setCollapsed(false))
  await expect(toolbar).toBeVisible()
  expect(await page.evaluate(() => {
    const {doc} = (window as any).__toolbarFixture
    return JSON.stringify(doc.model.toSnapshot(doc.rootId))
  })).toBe(before)
})

test('an empty layout group leaves no leading divider and ordinary groups keep their dividers', async ({page}) => {
  const {first} = await setup(page, false)
  await page.evaluate(() => {
    const {doc, first, second} = (window as any).__toolbarFixture
    for (const [index, id] of [first, second].entries()) {
      doc.placement.setObjectLayout(id, 'over')
      doc.placement.updateAbsolute(id, {x: 100 + index * 300, y: 120})
    }
    const group = doc.placement.group([first, second])
    if (!group) throw new Error('Cannot group fixture')
    doc.selection.selectBlock(first)
  })
  const toolbar = page.locator('bc-object-format-toolbar')
  await expect.poll(() => toolbar.evaluate(element => (window as any).ng.getComponent(element).state.blockIds)).toEqual([first])
  await toolbar.getByRole('button', {name: '布局与排列', exact: true}).click()
  const align = toolbar.locator('section[aria-label="页面对齐"] .object-layout-tools')
  await expect(toolbar.locator('section[aria-label="布局与排列"]')).toHaveCount(0)
  await expect(align).toHaveCSS('border-top-width', '0px')
  await expect(align).toHaveCSS('margin-top', '0px')
  await expect(align).toHaveCSS('padding-top', '0px')
  await expect(toolbar.locator('section[aria-label="层级"] .object-layout-tools')).toHaveCSS('border-top-width', '1px')
  await toolbar.screenshot({path: `/tmp/blockcraft-layout-first-group-${test.info().project.name}.png`})
  await page.evaluate(() => {
    const {doc, first} = (window as any).__toolbarFixture
    doc.placement.ungroup(doc.model.getParentId(first))
    doc.selection.selectBlock(first)
  })
  await expect(toolbar.locator('.object-layout-option')).not.toHaveCount(0)
  await expect(align).toHaveCSS('border-top-width', '1px')
})

test('multi-selection keeps horizontal commands before opening the group mini rail', async ({page}) => {
  await setup(page, false)
  await page.evaluate(() => {
    const {doc} = (window as any).__toolbarFixture
    const ids = [0, 1].map(index => {
      const snapshot = doc.schemas.createSnapshot('text-box', ['组合成员', {width: 150, height: 100}])
      const id = doc.placement.insertAbsoluteSnapshot(snapshot, {anchorRect: null})
      doc.placement.updateAbsolute(id, {x: 160 + index * 180, y: 120 + index * 20})
      return id
    })
    const parent = doc.model.getParentId(ids[0])
    const index = doc.model.getChildrenIds(parent).indexOf(ids[0])
    doc.selection.replay({anchor: {blockId: parent, type: 'boundary', index},
      head: {blockId: parent, type: 'boundary', index: index + ids.length}, commonParent: parent})
  })
  const shell = page.locator('bc-object-group-toolbar bc-floating-toolbar')
  const strip = shell.locator('.object-group-toolbar')
  await expect(strip).toBeVisible()
  await expect(strip).toHaveCSS('display', 'flex')
  await expect(strip.getByRole('button', {name: '左对齐', exact: true})).toHaveCSS('width', '26px')
  await expect(strip.getByRole('button', {name: '左对齐', exact: true})).toHaveCSS('padding-left', '0px')
  await expect(strip.getByRole('button', {name: '横向分布', exact: true})).toBeDisabled()
  await strip.getByRole('button', {name: '组合', exact: true}).click()
  await expect(shell.locator('[data-bc-group-format-toolbar]')).toBeVisible()
  await expect(shell.locator('.object-format__rail button')).toHaveCount(2)
  await expect(shell.getByRole('button', {name: '解除组合', exact: true})).toBeEnabled()
})

test('group toolbar reuses the same collapse state and keeps ungroup actions working', async ({page}) => {
  await setup(page, true)
  const group = await page.evaluate(() => {
    const {doc} = (window as any).__toolbarFixture
    const ids = [0, 1].map(index => {
      const snapshot = doc.schemas.createSnapshot('text-box', ['组合成员', {width: 150, height: 100}])
      const id = doc.placement.insertAbsoluteSnapshot(snapshot, {anchorRect: null})
      doc.placement.updateAbsolute(id, {x: 160 + index * 180, y: 120})
      return id
    })
    const groupId = doc.placement.group(ids)
    if (!groupId) throw new Error('Cannot create group fixture')
    doc.selection.selectBlock(groupId)
    return groupId as string
  })
  const shell = page.locator('bc-object-group-toolbar bc-floating-toolbar')
  await expect(shell.getByRole('button', {name: '展开组合工具栏'})).toBeVisible()
  await expect(shell.locator('[data-bc-group-format-toolbar]')).toBeHidden()
  await shell.getByRole('button', {name: '展开组合工具栏'}).click()
  await expect(shell.locator('[data-bc-group-format-toolbar]')).toBeVisible()
  const groupTop = await page.locator(`[data-block-id="${group}"]`).evaluate(element => element.getBoundingClientRect().top)
  const groupToggle = shell.locator('.floating-toolbar__toggle')
  await expect.poll(async () => Math.abs((await groupToggle.boundingBox())!.y - groupTop)).toBeLessThan(1)
  await expect(shell.locator('.object-format__rail')).toHaveCSS('width', '34px')
  await expect(shell.locator('.object-format__rail button')).toHaveCount(2)
  await expect(shell.locator('.object-format__panel')).toHaveCount(0)
  const layout = shell.getByRole('button', {name: '布局', exact: true})
  await layout.focus()
  await layout.press('Enter')
  await expect(shell.locator('.object-format__panel')).toHaveCSS('width', '176px')
  await expect(layout).toHaveAttribute('aria-expanded', 'true')
  await expect(shell.getByRole('button', {name: '浮于文字上方', exact: true})).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(async () => Math.abs((await groupToggle.boundingBox())!.y - groupTop)).toBeLessThan(1)
  expect(await shell.locator('.object-format__scroll').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await shell.screenshot({path: `/tmp/blockcraft-group-menu-${test.info().project.name}.png`})
  await shell.getByRole('button', {name: '收起组合工具栏'}).click()
  await expect.poll(async () => Math.abs((await groupToggle.boundingBox())!.y - groupTop)).toBeLessThan(1)
  await shell.getByRole('button', {name: '展开组合工具栏'}).click()
  await expect.poll(async () => Math.abs((await groupToggle.boundingBox())!.y - groupTop)).toBeLessThan(1)
  await expect(shell.locator('.object-format__panel')).toHaveCount(0)
  await page.evaluate(id => {
    const {doc} = (window as any).__toolbarFixture
    doc.placement.updateAbsolute(id, {x: 700, y: 120})
    doc.selection.selectBlock(id)
  }, group)
  await layout.click()
  await expect(shell.locator('[data-bc-group-format-toolbar]')).toHaveClass(/object-format--left/)
  expect(await shell.locator('.object-format__panel').evaluate(el => {
    const rect = el.getBoundingClientRect()
    return rect.left >= 0 && rect.right <= innerWidth
  })).toBe(true)
  await shell.getByRole('button', {name: '解除组合', exact: true}).click()
  await expect.poll(() => page.evaluate(id => (window as any).__toolbarFixture.doc.model.exists(id), group)).toBe(false)
})

test('region toolbar uses the reusable mini shell and live plugin control', async ({page}) => {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/template')
  await page.getByRole('button', {name: '内容区域', exact: true}).click()
  await page.getByRole('button', {name: '选中内容区域并拖动', exact: true}).click({force: true})
  const shell = page.locator('render-unit-toolbar bc-floating-toolbar')
  const toolbar = page.locator('[data-bc-region-format-toolbar]')
  await expect(toolbar).toBeVisible()
  await toolbar.getByRole('button', {name: '外观选项', exact: true}).click()
  await expect(toolbar.locator('.object-format__panel')).toBeVisible()
  await shell.getByRole('button', {name: '收起内容区域工具栏', exact: true}).click()
  await expect(toolbar).toBeHidden()
  await expect(toolbar.locator('.object-format__panel')).toHaveCount(0)
  await page.locator('render-unit-toolbar').evaluate(element => {
    const component = (window as any).ng.getComponent(element)
    const plugin = component.containerBlock.doc.plugins.find((p: any) => p.name === 'callout-toolbar')
    if (!plugin.collapsed) throw new Error('Plugin did not retain collapse state')
    plugin.setCollapsed(false)
  })
  await expect(toolbar).toBeVisible()
})

test('the collapse button stays aligned with the rail when the settings flip left', async ({page}) => {
  await setup(page, false)
  await page.evaluate(() => {
    const {doc, first} = (window as any).__toolbarFixture
    doc.placement.setMode(first, 'absolute')
    doc.placement.updateAbsolute(first, {x: 600, y: 120})
    doc.selection.selectBlock(first)
  })
  const toolbar = page.locator('[data-bc-object-format-toolbar]')
  await toolbar.getByRole('button', {name: '布局与排列', exact: true}).click()
  await expect(toolbar).toHaveClass(/object-format--left/)
  await expectToggleNearRail(page)
  const shell = page.locator('bc-object-format-toolbar bc-floating-toolbar')
  await expect.poll(() => shell.evaluate(element => {
    const toggle = element.querySelector('button')!.getBoundingClientRect()
    const rail = element.querySelector('.object-format__rail')!.getBoundingClientRect()
    return Math.abs(toggle.left + toggle.width / 2 - rail.left - rail.width / 2)
  })).toBeLessThan(1)
  await shell.getByRole('button', {name: '收起对象工具栏', exact: true}).click()
  await expect(shell.getByRole('button', {name: '展开对象工具栏', exact: true})).toBeInViewport()
})

for (const flavour of ['text-box', 'word-art', 'shape']) {
  test(`${flavour}: settings retain their grid layout and light tab highlighting after compilation`, async ({page}) => {
    await setup(page, false, flavour)
    const toolbar = page.locator('[data-bc-object-format-toolbar]')
    const textTab = toolbar.getByRole('button', {name: '文本选项', exact: true})
    await textTab.click()
    await expect(textTab).toHaveCSS('box-shadow', 'none')
    await expectToggleNearRail(page)
    await expect(toolbar.locator('.object-format__panel')).toHaveCSS('width', '240px')
    const grid = toolbar.locator('.object-format__margin-grid')
    await expect(grid.locator('cs-input-number').first()).toHaveCSS('height', '24px')
    await expect(grid).toHaveCSS('display', 'grid')
    await expect(toolbar.locator('[data-object-format-section="text-frame"] .object-format__section-title')).toBeHidden()
    const dimensions = await grid.evaluate(element => {
      const panel = element.closest('.object-format__panel')!.getBoundingClientRect()
      const labels = [...element.querySelectorAll('label')].map(label => label.getBoundingClientRect())
      return {
        columns: getComputedStyle(element).gridTemplateColumns.split(' ').length,
        sameRow: Math.abs(labels[0].top - labels[1].top) < 1,
        nextRow: labels[2].top > labels[0].bottom,
        inside: labels.every(label => label.left >= panel.left && label.right <= panel.right),
      }
    })
    expect(dimensions).toEqual({columns: 2, sameRow: true, nextRow: true, inside: true})
    await expect(toolbar.locator('.object-format__tabs .cs-segmented-item-selected').first()).toHaveCSS('box-shadow', 'none')
    await expect(toolbar.locator('.object-format__tabs')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await toolbar.locator('.object-format__tabs').getByText('字体', {exact: true}).click()
    await expect(toolbar.getByText('斜体', {exact: true})).toHaveCount(0)
    await toolbar.getByRole('button', {name: '布局与排列', exact: true}).click()
    await expect(toolbar.locator('.object-format__panel')).toHaveCSS('width', '176px')
    const layoutGrid = toolbar.locator('.object-layout-list')
    await expect(layoutGrid).toHaveCSS('display', 'flex')
    await expectToggleNearRail(page)
    const layoutButton = layoutGrid.locator('button').first()
    await expect(layoutButton).toHaveCSS('flex-direction', 'row')
    expect(await layoutButton.evaluate(element => element.getBoundingClientRect().height)).toBe(28)
    await expect(layoutGrid.locator('.object-layout-option__check')).toHaveCount(1)
    expect(await layoutGrid.evaluate(element => {
      const rows = [...element.querySelectorAll('button')].map(button => button.getBoundingClientRect())
      return rows.every((rect, i) => i === 0 || rect.top >= rows[i - 1].bottom)
    })).toBe(true)
    await toolbar.screenshot({path: `/tmp/blockcraft-layout-list-${flavour}-${test.info().project.name}.png`})
    const scroll = toolbar.locator('.object-format__scroll')
    expect(await scroll.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  })
}

async function expectToggleNearRail(page: Page) {
  const shell = page.locator('bc-object-format-toolbar bc-floating-toolbar')
  const toggle = shell.locator('.floating-toolbar__toggle')
  await expect(toggle).toHaveCSS('width', '24px')
  await expect(toggle).toHaveCSS('height', '24px')
  await expect.poll(() => shell.evaluate(element => {
    const button = element.querySelector('.floating-toolbar__toggle')!
    const toggle = button.getBoundingClientRect()
    const circle = getComputedStyle(button, '::before')
    const rail = element.querySelector('.object-format__rail')!.getBoundingClientRect()
    return Math.round(rail.top - toggle.bottom + parseFloat(circle.bottom))
  })).toBe(3)
}

for (const flavour of ['text-box', 'word-art', 'shape']) {
  for (const nearBottom of [false, true]) {
    test(`${flavour}: rail start stays fixed through collapse and tab changes${nearBottom ? ' near viewport bottom' : ''}`, async ({page}) => {
      const {first} = await setup(page, false, flavour)
      if (nearBottom) {
        await page.evaluate(() => {
          const {doc, first} = (window as any).__toolbarFixture
          doc.placement.setMode(first, 'absolute')
          doc.placement.updateAbsolute(first, {x: 80, y: 580})
          doc.selection.selectBlock(first)
        })
      }
      const toolbar = page.locator('[data-bc-object-format-toolbar]')
      const shell = page.locator('bc-object-format-toolbar bc-floating-toolbar')
      const surface = page.locator(`[data-block-id="${first}"] [data-bc-object-surface]`).first()
      await expect(shell).toHaveAttribute('data-bc-toolbar-placement', /right|left|top|bottom/)
      await expect.poll(() => shell.evaluate(element => {
        const r = element.getBoundingClientRect()
        const {doc} = (window as any).__toolbarFixture
        const b = doc.scrollContainer.getBoundingClientRect()
        return r.top >= b.top + 8 && r.bottom <= Math.min(b.bottom, innerHeight) - 7
      })).toBe(true)
      const start = (await shell.locator('.floating-toolbar__toggle').boundingBox())!
      if (!nearBottom) expect(Math.abs(start.y - (await surface.boundingBox())!.y)).toBeLessThan(1)
      const expectTop = async () => {
        await expect.poll(async () => {
          const toggle = await shell.locator('.floating-toolbar__toggle').boundingBox()
          return toggle ? Math.max(Math.abs(toggle.y - start.y), Math.abs(toggle.x - start.x)) : Infinity
        }).toBeLessThan(1)
      }
      await expectTop()
      for (const tab of ['文本选项', '形状选项', '布局与排列']) {
        const button = toolbar.getByRole('button', {name: tab, exact: true})
        if (!await button.count()) continue
        await button.click()
        await expect(toolbar.locator('.object-format__panel')).toBeVisible()
        await expectTop()
        if (tab === '文本选项') {
          for (const label of ['字体', '外观', '文本框']) {
            const sectionTab = toolbar.locator('.object-format__tabs').getByText(label, {exact: true})
            if (!await sectionTab.count()) continue
            await sectionTab.click()
            await expectTop()
          }
        }
      }
      await shell.getByRole('button', {name: '收起对象工具栏', exact: true}).click()
      await expectTop()
      await shell.getByRole('button', {name: '展开对象工具栏', exact: true}).click()
      await expectTop()
    })
  }
}

for (const nearBottom of [false, true]) {
  test(`settings scroll with the real mouse wheel through the final field${nearBottom ? ' near viewport bottom' : ''}`, async ({page}) => {
    await setup(page, false, 'word-art')
    if (nearBottom) {
      await page.evaluate(() => {
        const {doc, first} = (window as any).__toolbarFixture
        doc.placement.setMode(first, 'absolute')
        doc.placement.updateAbsolute(first, {x: 80, y: 420})
        doc.selection.selectBlock(first)
      })
    }
    const toolbar = page.locator('[data-bc-object-format-toolbar]')
    await toolbar.getByRole('button', {name: '文本选项', exact: true}).click()
    await toolbar.locator('.object-format__tabs').getByText('外观', {exact: true}).click()
    const section = toolbar.locator('[data-object-format-section="text-effects"]')
    for (const label of ['文字轮廓', '文字阴影', '文字发光']) {
      const control = section.locator('label').filter({hasText: label}).getByRole('switch')
      if (await control.getAttribute('aria-checked') !== 'true') await control.click()
    }
    const scroll = toolbar.locator('.object-format__scroll')
    await expect.poll(() => scroll.evaluate(element => element.scrollHeight - element.clientHeight)).toBeGreaterThan(30)
    const toggle = page.locator('bc-object-format-toolbar .floating-toolbar__toggle')
    const top = (await toggle.boundingBox())!.y
    const rect = (await scroll.boundingBox())!
    await page.mouse.move(rect.x + 12, rect.y + Math.min(60, rect.height / 2))
    await page.mouse.wheel(0, 10000)
    await expect.poll(() => scroll.evaluate(element => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThan(2)
    const last = section.locator('label').last()
    await expect(last).toBeVisible()
    expect(await last.evaluate(element => {
      const rect = element.getBoundingClientRect()
      const panel = element.closest('.object-format__panel')!.getBoundingClientRect()
      return rect.bottom <= panel.bottom && rect.top >= panel.top
    })).toBe(true)
    expect(Math.abs((await toggle.boundingBox())!.y - top)).toBeLessThan(1)
    expect(await page.locator('bc-object-format-toolbar .floating-toolbar__content').evaluate(element => element.scrollTop)).toBe(0)
  })
}
