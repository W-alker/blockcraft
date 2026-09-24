import {expect, test, type Page} from '@playwright/test'

test.use({viewport: {width: 1500, height: 1000}})

async function setup(page: Page, inColumn: boolean, flavour = 'sticker') {
  await page.goto('/')
  await page.getByText('模板装饰 →').click()
  await page.getByRole('button', {name: '初始化'}).click()
  if (inColumn) await page.getByText('多栏布局', {exact: true}).last().click()
  return page.evaluate(({inColumn, flavour}) => {
    const owner = document.querySelector(inColumn ? '.column-block' : '.paragraph-block')
    const block = (window as any).ng.getComponent(owner)
    const doc = block.doc
    const parentId = inColumn ? block.id : doc.rootId
    const source = flavour === 'sticker'
      ? doc.schemas.createSnapshot('sticker', ['sunburst'])
      : doc.schemas.createSnapshot('image', [{
        src: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="#ebc560"/></svg>'),
        wr: 18, ar: 1,
      }])
    if (flavour === 'image') source.props.wr = 18
    const target = doc.schemas.createSnapshot('paragraph', ['拖到这一段之后'])
    doc.crud.insertBlockSnapshots(parentId, 0, [source, target])
    doc.selection.blur()
    doc.crud.undoManager.clearHistory()
    return {sourceId: source.id, targetId: target.id, parentId}
  }, {inColumn, flavour})
}

for (const layout of ['flow', 'column', 'over'] as const) {
  test(`贴纸 ${layout} 可直接切换四周型环绕，撤销恢复，工具栏没有类型文案`, async ({page}) => {
    const {sourceId} = await setup(page, layout === 'column')
    const source = page.locator(`[data-block-id="${sourceId}"]`)
    await source.evaluate((element, layout) => {
      const block = (window as any).ng.getComponent(element)
      if (layout === 'over') block.doc.placement.setObjectLayout(block, 'over')
      block.updateProps({colors: {sun: '#123456'}, rotation: 12, width: 132, height: 93})
      block.doc.crud.undoManager.clearHistory()
    }, layout)
    await source.locator('img').click()
    const toolbar = page.locator('bc-inline-object-toolbar')
    await expect(toolbar.getByLabel('四周型环绕')).toBeVisible()
    await expect(toolbar).not.toContainText('贴纸')
    await expect(toolbar.locator('bc-float-toolbar-item')).toHaveCount(layout === 'column' ? 3 : 5)
    await expect(toolbar.getByLabel(layout === 'over' ? '浮于文字上方' : '上下型')).toHaveClass(/active/)
    await toolbar.getByLabel('四周型环绕').click()
    const inline = page.locator('.bc-inline-object-shell[data-bc-inline-object="sticker"]')
    await expect(inline).toHaveCount(1)
    await expect(source).toHaveCount(0)
    const wrap = () => inline.evaluate(element => {
      const block = (window as any).ng.getComponent(element.closest('[data-block-id]'))
      return block.textDeltas().find((delta: any) => delta.insert?.sticker)?.attributes?.wrap === true
    })
    await expect.poll(wrap).toBe(true)
    await inline.evaluate(element => {
      const block = (window as any).ng.getComponent(element.closest('[data-block-id]'))
      block.doc.crud.undoManager.undo()
    })
    await expect(source).toHaveCount(1)
    await expect(inline).toHaveCount(0)
    expect(await source.evaluate(element => {
      const block = (window as any).ng.getComponent(element)
      return block.doc.placement.getObjectLayout(block)
    })).toBe(layout === 'over' ? 'over' : 'top-bottom')
    await source.evaluate(element => (window as any).ng.getComponent(element).doc.crud.undoManager.redo())
    await expect.poll(wrap).toBe(true)
    // 从贴纸顶部的可见区域拾取，避免命中相邻正文段落的覆盖区域。
    await inline.locator('.bc-inline-object-frame').click({position: {x: 25, y: 15}})
    const inlineToolbar = page.locator('bc-inline-object-toolbar')
    await expect(inlineToolbar.getByLabel('四周型环绕')).toBeVisible()
    await expect(inlineToolbar.locator('.bc-inline-object-toolbar__type')).toHaveCount(0)
    await expect(inlineToolbar.locator('.bc-float-toolbar__divider')).toHaveCount(0)
    await inlineToolbar.getByLabel('嵌入型').click()
    await expect.poll(wrap).toBe(false)
    await inline.click()
    await inlineToolbar.getByLabel('上下型').click()
    await expect(page.locator('.sticker-block')).toHaveCount(1)
    expect(await page.locator('.sticker-block').evaluate(element => {
      const props = (window as any).ng.getComponent(element).props
      return {presetId: props.presetId, colors: props.colors, rotation: props.rotation, width: props.width, height: props.height}
    })).toEqual({presetId: 'sunburst', colors: {sun: '#123456'}, rotation: 12, width: 132, height: 93})
  })
}

for (const layout of ['flow', 'column', 'over', 'under'] as const) {
  test(`贴纸 ${layout} 的选区跟随可视表面，不在未旋转宿主上留下蓝底`, async ({page}) => {
    const {sourceId, targetId} = await setup(page, layout === 'column')
    const source = page.locator(`[data-block-id="${sourceId}"]`)
    await source.evaluate((element, layout) => {
      const block = (window as any).ng.getComponent(element)
      if (layout === 'over' || layout === 'under') block.doc.placement.setObjectLayout(block, layout)
      block.updateProps({presetId: 'leaf-label', width: 180, height: 120, rotation: layout === 'over' || layout === 'under' ? 40 : 0})
      block.doc.selection.selectBlock(block)
    }, layout)
    await page.mouse.move(0, 0)
    await expect(source).toHaveClass(/\bselected\b/)
    await expect(source).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await expect(source.locator('shape-resizer')).toBeVisible()
    await expect.poll(() => source.evaluate(element => {
      const surface = element.querySelector('.sticker-block__surface')!.getBoundingClientRect()
      const frame = element.querySelector('.shape-resizer__frame')!.getBoundingClientRect()
      return Math.max(...(['x', 'y', 'width', 'height'] as const).map(key => Math.abs(frame[key] - surface[key])))
    })).toBeLessThan(1)

    // 普通段落使用 focused + 原生文本选区，仍保留文本选区的高亮。
    const paragraph = page.locator(`[data-block-id="${targetId}"]`)
    await paragraph.evaluate(element => {
      const block = (window as any).ng.getComponent(element)
      block.doc.selection.selectBlock(block)
    })
    await expect(paragraph).toHaveClass(/\bfocused\b/)
    expect(await paragraph.evaluate(element => getComputedStyle(element, '::selection').backgroundColor))
      .not.toBe('rgba(0, 0, 0, 0)')
    await expect(source).not.toHaveClass(/\bselected\b/)
    await expect(source.locator('shape-resizer')).toBeHidden()
  })
}

for (const flavour of ['sticker', 'image']) for (const inColumn of [false, true]) {
  test(`上下型 ${flavour}${inColumn ? '在分栏内' : '在正文中'}可本体排序、撤销和取消`, async ({page}) => {
    const ids = await setup(page, inColumn, flavour)
    const source = page.locator(`[data-block-id="${ids.sourceId}"]`)
    const target = page.locator(`[data-block-id="${ids.targetId}"]`)
    const order = () => source.evaluate((element, ids) => {
      const doc = (window as any).ng.getComponent(element).doc
      return doc.model.getChildrenIds(ids.parentId).filter((id: string) =>
        id === ids.sourceId || id === ids.targetId)
    }, ids)
    const dragToTarget = async () => {
      const from = (await source.locator('img').boundingBox())!
      const to = (await target.boundingBox())!
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
      await page.mouse.down()
      await page.mouse.move(to.x + to.width / 2, to.y + to.height - 2, {steps: 8})
      await expect.poll(() => source.evaluate(element =>
        (window as any).ng.getComponent(element).doc.dragController.state)).toBe('dragging')
    }
    await dragToTarget()
    await page.mouse.up()
    await expect.poll(order).toEqual([ids.targetId, ids.sourceId])
    await source.evaluate(element => (window as any).ng.getComponent(element).doc.crud.undoManager.undo())
    await expect.poll(order).toEqual([ids.sourceId, ids.targetId])
    await dragToTarget()
    await page.keyboard.press('Escape')
    await page.mouse.up()
    await expect.poll(order).toEqual([ids.sourceId, ids.targetId])
  })
}

for (const flavour of ['sticker', 'image']) {
  test(`${flavour} 未选中时悬停显示八向抓手，缩放不触发排序，旋转抓手可连续移入`, async ({page}) => {
    const {sourceId} = await setup(page, false, flavour)
    const source = page.locator(`[data-block-id="${sourceId}"]`)
    const surface = source.locator(flavour === 'sticker' ? '.sticker-block__surface' : '.img-wrapper')
    await page.mouse.move(0, 0)
    await expect(source).not.toHaveClass(/\bselected\b/)
    await expect(source.locator('shape-resizer')).toBeHidden()
    await surface.hover()
    await expect(source.locator('.shape-resizer__handle:visible')).toHaveCount(8)
    await expect(source).not.toHaveClass(/\bselected\b/)
    await expect(source.locator('.shape-resizer__rotate')).toHaveCount(0)

    const before = (await surface.boundingBox())!
    const handle = (await source.locator('[data-handle="east"]').boundingBox())!
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2, {steps: 8})
    await expect(source.locator('[data-handle="east"]')).toBeVisible()
    await page.mouse.down()
    await page.mouse.move(handle.x + handle.width / 2 + 40, handle.y + handle.height / 2, {steps: 5})
    await page.mouse.up()
    await expect.poll(async () => (await surface.boundingBox())!.width).toBeGreaterThan(before.width + 20)
    expect(await source.evaluate(element =>
      (window as any).ng.getComponent(element).doc.dragController.state)).toBe('idle')

    await source.evaluate(element => {
      const block = (window as any).ng.getComponent(element)
      block.doc.placement.setObjectLayout(block, 'over')
      block.doc.selection.blur()
    })
    await surface.hover()
    const box = (await surface.boundingBox())!
    const rotate = source.locator('.shape-resizer__rotate')
    const knob = (await rotate.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + 3)
    await page.mouse.move(knob.x + knob.width / 2, knob.y + knob.height / 2, {steps: 10})
    await expect(rotate).toBeVisible()
    expect(await rotate.evaluate(element => {
      const rect = element.getBoundingClientRect()
      return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === element
    })).toBe(true)
    await page.mouse.move(0, 0)
    await expect(source.locator('shape-resizer')).toBeHidden()
  })
}


for (const layout of ['flow', 'column', 'over'] as const) {
  test(`贴纸 ${layout} 固定尺寸不随正文宽度及聚焦变化`, async ({page}) => {
    const {sourceId, targetId} = await setup(page, layout === 'column')
    const source = page.locator(`[data-block-id="${sourceId}"]`)
    if (layout === 'over') {
      await source.evaluate(element => {
        const block = (window as any).ng.getComponent(element)
        block.doc.placement.setObjectLayout(block, 'over')
      })
    }
    await page.locator(`[data-block-id="${targetId}"]`).click()
    const before = await source.evaluate(element => {
      const block = (window as any).ng.getComponent(element)
      return {props: JSON.stringify(block.props), basis: block.doc.objectSizing.rootContentWidth, width: block.renderedWidth}
    })
    // 真实 ResizeObserver 通知，改变布局容器而不触碰贴纸、选区或文档模型。
    await source.evaluate(element => {
      const block = (window as any).ng.getComponent(element)
      const root = block.doc.objectSizing.rootContentElement
      root.style.width = `${block.doc.objectSizing.rootContentWidth * 0.75}px`
    })
    await expect.poll(() => source.evaluate(element => {
      const block = (window as any).ng.getComponent(element)
      return block.doc.objectSizing.rootContentWidth
    })).toBeLessThan(before.basis - 10)
    const measure = () => source.evaluate(element => {
      const block = (window as any).ng.getComponent(element)
      const surface = element.querySelector('.sticker-block__surface')!
      return {
        actual: Number.parseFloat(getComputedStyle(surface).width),
        expected: block.renderedWidth,
        props: JSON.stringify(block.props),
      }
    })
    await expect.poll(async () => { const m = await measure(); return Math.abs(m.actual - m.expected) })
      .toBeLessThan(0.1)
    const unfocused = await measure()
    expect(unfocused.actual).toBeCloseTo(before.width, 1)
    await source.locator('img').click()
    await expect(source).toHaveClass(/\bselected\b/)
    const focused = await measure()
    expect(Math.abs(focused.actual - unfocused.actual)).toBeLessThan(0.1)
    expect(focused.props).toBe(before.props)
  })
}


test('固定尺寸贴纸组合和取消组合保持几何', async ({page}) => {
  const {sourceId} = await setup(page, false)
  const source = page.locator(`[data-block-id="${sourceId}"]`)
  const fixed = await source.evaluate(element => {
    const block = (window as any).ng.getComponent(element)
    const doc = block.doc
    const sticker = doc.schemas.createSnapshot('sticker', ['leaf-label'])
    sticker.props = {...sticker.props, width: 180, height: 120}
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [sticker])
    return {id: sticker.id}
  })
  const sticker = page.locator(`[data-block-id="${fixed.id}"]`)
  await expect(sticker).toBeVisible()
  const read = () => sticker.evaluate(element => {
    const block = (window as any).ng.getComponent(element)
    return {width: block.props.width, height: block.props.height, wr: block.props.wr ?? null, ar: block.props.ar ?? null}
  })
  await expect.poll(read).toEqual({width: 180, height: 120, wr: null, ar: null})
  const groupId = await sticker.evaluate((element, sourceId) => {
    const block = (window as any).ng.getComponent(element)
    const doc = block.doc
    doc.placement.setObjectLayout(block, 'over')
    doc.placement.setObjectLayout(doc.getBlockById(sourceId), 'over')
    doc.placement.updateObjectGeometry(block, {position: '20 30'})
    doc.placement.updateObjectGeometry(doc.getBlockById(sourceId), {position: '300 30'})
    return doc.placement.group([block.id, sourceId])
  }, sourceId)
  expect(groupId).toBeTruthy()
  await expect.poll(read).toEqual({width: 180, height: 120, wr: null, ar: null})
  await sticker.evaluate(element => {
    const block = (window as any).ng.getComponent(element)
    block.doc.placement.updateObjectGeometry(block, {width: 220, height: 110})
  })
  await expect.poll(read).toEqual({width: 220, height: 110, wr: null, ar: null})
  await sticker.evaluate((element, groupId) => {
    (window as any).ng.getComponent(element).doc.placement.ungroup(groupId)
  }, groupId)
  await expect.poll(read).toEqual({width: 220, height: 110, wr: null, ar: null})
})

for (const flavour of ['image', 'sticker']) {
  test(`${flavour} 共用本体入口恢复工具栏、移动浮动对象并撤销`, async ({page}) => {
    const {sourceId} = await setup(page, false, flavour)
    const source = page.locator(`[data-block-id="${sourceId}"]`)
    const surface = source.locator('[data-bc-object-drag-surface]')
    await expect.poll(() => source.locator('img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
    await surface.click()
    const toolbar = page.locator(flavour === 'image' ? 'bc-image-toolbar' : 'bc-inline-object-toolbar')
    await expect(toolbar).toBeVisible()
    await source.evaluate((element, flavour) => {
      const block = (window as any).ng.getComponent(element)
      const plugin = block.doc.plugins.find((item: any) => item.name === (flavour === 'image' ? 'img-toolbar' : 'sticker-toolbar'))
      if (flavour === 'image') plugin.closeToolbar()
      else plugin.close()
    }, flavour)
    await expect(toolbar).toBeHidden()
    // 模拟布局迁移后工具栏已关闭、对象模型选区仍然保留的情况。
    await expect(source).toHaveClass(/\bselected\b/)
    await surface.click()
    await expect(toolbar).toBeVisible()
    await source.evaluate(element => {
      const block = (window as any).ng.getComponent(element)
      block.doc.placement.setObjectLayout(block, 'over')
      block.doc.selection.blur()
      block.doc.crud.undoManager.clearHistory()
    })
    const before = (await surface.boundingBox())!
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2)
    await page.mouse.down()
    await page.mouse.move(before.x + before.width / 2 + 60, before.y + before.height / 2 + 24, {steps: 8})
    await page.mouse.up()
    await expect.poll(async () => (await surface.boundingBox())!.x).toBeCloseTo(before.x + 60, 0)
    await expect.poll(async () => (await surface.boundingBox())!.y).toBeCloseTo(before.y + 24, 0)
    await source.evaluate(element => (window as any).ng.getComponent(element).doc.crud.undoManager.undo())
    await expect.poll(async () => (await surface.boundingBox())!.x).toBeCloseTo(before.x, 0)
    await expect.poll(async () => (await surface.boundingBox())!.y).toBeCloseTo(before.y, 0)
    await surface.click()
    await expect(toolbar).toBeVisible()
  })
}

for (const container of ['root', 'column', 'render-unit']) {
  test(`图片工具栏在 ${container} 按实际定位能力显示按钮`, async ({page}) => {
    let {sourceId} = await setup(page, container === 'column', 'image')
    if (container === 'render-unit') {
      sourceId = await page.locator(`[data-block-id="${sourceId}"]`).evaluate(element => {
        const block = (window as any).ng.getComponent(element)
        const doc = block.doc
        const image = doc.schemas.createSnapshot('image', [{...block.props}])
        const wrapper = doc.schemas.createSnapshot('render-unit', [])
        wrapper.children = [image]
        doc.crud.insertBlockSnapshots(doc.rootId, 0, [wrapper])
        return image.id
      })
    }
    const source = page.locator(`[data-block-id="${sourceId}"]`)
    await source.locator('[data-bc-object-drag-surface]').click()
    const toolbar = page.locator('bc-image-toolbar')
    await expect(toolbar).toBeVisible()
    const expected = container === 'root'
      ? ['嵌入型', '上下型', '衬于文字下方', '浮于文字上方']
      : ['嵌入型', '上下型']
    await expect.poll(() => toolbar.locator('[name="object-layout"]').evaluateAll(items =>
      items.map(item => item.getAttribute('aria-label')))).toEqual(expected)
  })
}
