import {expect, test, type Page} from '@playwright/test'

async function setup(page: Page, mode: 'fixed' | 'paginated' | 'root') {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng
    ?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  return page.evaluate(mode => {
    const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const columns = source.schemas.createSnapshot('columns', [2])
    const region = source.schemas.createSnapshot('render-unit', [{tplRegion: true},
      mode === 'fixed' ? {width: 400, height: 200} : {}])
    region.children = [columns]
    const viewport = document.createElement('div')
    viewport.style.cssText = 'position:fixed;left:20px;top:50px;width:950px;height:600px;overflow:auto;background:white;z-index:10;padding:16px'
    const mount = document.createElement('div')
    viewport.appendChild(mount)
    document.body.appendChild(viewport)
    const snapshot = source.schemas.createSnapshot('root', ['columns-layout', [mode === 'root' ? columns : region]])
    const gapPlugin = source.plugins.find((plugin: any) => plugin.name === 'block-gap-creator')
    const paginationPlugin = source.plugins.find((plugin: any) => plugin.name === 'pagination')
    const plugins = [new gapPlugin.constructor()]
    if (mode === 'paginated') plugins.push(new paginationPlugin.constructor({enabled: true}))
    const doc = new source.constructor({
      ...source.config, yDoc: new source.yDoc.constructor(), docId: snapshot.id,
      plugins, scrollContainer: viewport, readonly: false, virtualization: {enabled: false},
    })
    doc.initBySnapshot(snapshot, mount)
    ;(window as any).columnsFixture = doc
    return {region: region.id, columns: columns.id, paragraph: columns.children[0].children[0].id}
  }, mode)
}

for (const mode of ['fixed', 'paginated', 'root'] as const) {
  test(`${mode}: 分栏控件不撑宽或越界，调宽和添加列仍可操作`, async ({page}) => {
    const ids = await setup(page, mode)
    const columns = page.locator(`[data-block-id="${ids.columns}"]`)
    await columns.scrollIntoViewIfNeeded()
    await columns.locator('.paragraph-block').first().click()

    const checkBounds = async () => {
      const bounds = await columns.evaluate(host => {
        const content = host.closest('.render-unit-content') as HTMLElement | null
        return {overflow: content ? content.scrollWidth - content.clientWidth : 0}
      })
      expect(bounds.overflow).toBeLessThanOrEqual(1)
    }
    await checkBounds()

    const divider = columns.locator('[data-divider-index="0"]')
    const box = (await divider.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 4)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 35, box.y + box.height - 4, {steps: 5})
    await page.mouse.up()
    await expect.poll(() => page.evaluate(id => {
      const doc = (window as any).columnsFixture
      return doc.getBlockById(id).props.columnWidths[0]
    }, ids.columns)).toBeGreaterThan(50)
    await checkBounds()

    await page.mouse.move(5, 5)
    await columns.locator('.paragraph-block').first().click()
    const toolbar = page.getByRole('toolbar', {name: '分栏操作'})
    await expect(toolbar).toBeVisible()
    expect(await toolbar.evaluate(el => !!el.closest('.render-unit-content'))).toBe(false)
    await toolbar.getByRole('button', {name: '在右侧插入栏', exact: true}).click()
    await expect(columns.locator('.column-block')).toHaveCount(3)
    await checkBounds()
    const beforeInsert = await page.evaluate(id => {
      const doc = (window as any).columnsFixture
      doc.crud.undoManager.stopCapturing()
      return [...doc.getBlockById(id).childrenIds]
    }, ids.columns)
    await toolbar.getByRole('button', {name: '在右侧插入栏'}).click()
    await expect(columns.locator('.column-block')).toHaveCount(4)
    expect(await page.evaluate(id => {
      const doc = (window as any).columnsFixture
      return [...doc.getBlockById(id).childrenIds].filter((_: string, index: number) => index !== 1)
    }, ids.columns)).toEqual(beforeInsert)
    await page.evaluate(() => (window as any).columnsFixture.crud.undoManager.undo())
    await expect(columns.locator('.column-block')).toHaveCount(3)
    await page.keyboard.press('Escape')
    await expect(toolbar).toHaveCount(0)

    for (const side of ['before', 'after']) {
      const gap = columns.locator(`:scope > [data-block-gap-side="${side}"]`)
      const rect = (await gap.boundingBox())!
      await page.mouse.click(rect.x + rect.width / 2,
        side === 'before' ? rect.y + 1 : rect.y + rect.height - 1)
      await expect.poll(() => page.evaluate(() =>
        (window as any).columnsFixture.selection.value?.toJSON().anchor,
      )).toEqual({blockId: ids.columns, type: 'gap', side})
    }

    if (mode === 'fixed') {
      await page.evaluate(id => {
        const doc = (window as any).columnsFixture
        const paragraph = doc.getBlockById(id)
        paragraph.replaceText(0, paragraph.textLength, Array(40).fill('长内容仍能滚动').join('\n'))
      }, ids.paragraph)
      const content = page.locator(`[data-block-id="${ids.region}"] > .render-unit-content`)
      await expect.poll(() => content.evaluate(el => el.scrollHeight - el.clientHeight)).toBeGreaterThan(200)
      await content.evaluate(el => { el.scrollTop = 100 })
      expect(await content.evaluate(el => el.scrollTop)).toBeGreaterThan(0)
    }
  })
}

for (const count of [2, 3]) {
  for (const deletedIndex of Array.from({length: count}, (_, index) => index)) {
    for (const key of ['Backspace', 'Delete']) {
      test(`${count} 栏删除第 ${deletedIndex + 1} 栏（${key}），立即恢复可输入的文字光标`, async ({page}) => {
        const ids = await setup(page, 'fixed')
        const before = await page.evaluate(({id, count, deletedIndex}) => {
          const doc = (window as any).columnsFixture
          const block = doc.getBlockById(id)
          if (count === 3) doc.crud.insertBlockSnapshots(id, 2, [doc.schemas.createSnapshot('column', [])])
          block.getChildrenBlocks().forEach((column: any, index: number) => column.firstChildren.replaceText(0, 0, `第 ${index + 1} 栏`))
          const columnIds = [...block.childrenIds]
          const landingBlock = block.getChildrenByIndex(deletedIndex ? deletedIndex - 1 : 1).firstChildren
          doc.selection.setCursorAtBlock(block.getChildrenByIndex(deletedIndex).firstChildren.id, true)
          doc.selection.selectBlock(columnIds[deletedIndex])
          doc.crud.undoManager.clearHistory()
          return {columnIds, landing: landingBlock.id, offset: deletedIndex ? landingBlock.textLength : 0}
        }, {id: ids.columns, count, deletedIndex})
        const expectTextCaret = async () => {
          await expect.poll(() => page.evaluate(() => {
            const doc = (window as any).columnsFixture
            const sel = document.getSelection()
            const focus = sel?.focusNode?.nodeType === 1 ? sel.focusNode as Element : sel?.focusNode?.parentElement
            return {model: doc.selection.value?.head, native: focus?.closest('[data-block-id]')?.getAttribute('data-block-id'),
              ranges: sel?.rangeCount, focused: doc.root.hostElement.contains(document.activeElement)}
          })).toMatchObject({model: {type: 'text', blockId: before.landing, offset: before.offset}, native: before.landing, ranges: 1, focused: true})
        }
        await page.keyboard.press(key)
        await expect(page.locator(`[data-block-id="${before.columnIds[deletedIndex]}"]`)).toHaveCount(0)
        await expectTextCaret()
        for (let round = 0; round < 2; round++) {
          await page.evaluate(() => (window as any).columnsFixture.crud.undoManager.undo())
          await expect(page.locator(`[data-block-id="${ids.columns}"] .column-block`)).toHaveCount(count)
          await expect.poll(() => page.evaluate(() => (window as any).columnsFixture.selection.value?.head))
            .toMatchObject({type: 'selected', blockId: before.columnIds[deletedIndex]})
          await page.evaluate(() => (window as any).columnsFixture.crud.undoManager.redo())
          await expectTextCaret()
        }
        await page.keyboard.type('继续输入')
        await expect(page.locator(`[data-block-id="${before.landing}"]`)).toContainText('继续输入')
      })
    }
  }
}

test('工具栏固定在分栏中间，操作跟随聚焦子栏，且随只读和块销毁清理', async ({page}) => {
  const ids = await setup(page, 'fixed')
  const columns = page.locator(`[data-block-id="${ids.columns}"]`)
  const toolbar = page.getByRole('toolbar', {name: '分栏操作'})
  await columns.hover()
  await expect(toolbar).toHaveCount(0)
  await columns.locator('.paragraph-block').first().click()
  await expect(toolbar).toContainText('第 1 栏')
  const firstBox = (await toolbar.boundingBox())!
  const columnsBox = (await columns.boundingBox())!
  expect(Math.abs(firstBox.x + firstBox.width / 2 - columnsBox.x - columnsBox.width / 2)).toBeLessThan(2)
  await columns.locator('.paragraph-block').nth(1).click()
  await expect(toolbar).toContainText('第 2 栏')
  const secondBox = (await toolbar.boundingBox())!
  expect(Math.abs(secondBox.x - firstBox.x)).toBeLessThan(2)
  await page.mouse.move(5, 5)
  await expect(toolbar).toBeVisible()
  await toolbar.getByRole('button', {name: '在左侧插入栏'}).click()
  await expect(columns.locator('.column-block')).toHaveCount(3)
  await expect(toolbar).toContainText('第 3 栏')
  const insertedBox = (await toolbar.boundingBox())!
  expect(Math.abs(insertedBox.x - firstBox.x)).toBeLessThan(2)
  for (let count = 4; count <= 8; count++) {
    await toolbar.getByRole('button', {name: '在右侧插入栏'}).click()
    await expect(columns.locator('.column-block')).toHaveCount(count)
  }
  await expect(toolbar.getByRole('button', {name: '在右侧插入栏'})).toBeDisabled()
  await expect(toolbar.getByRole('button', {name: '在左侧插入栏'})).toBeDisabled()
  await page.evaluate(() => (window as any).columnsFixture.toggleReadonly(true))
  await expect(toolbar).toHaveCount(0)
  await columns.locator('.paragraph-block').first().click()
  await expect(toolbar).toHaveCount(0)
  await page.evaluate(() => (window as any).columnsFixture.toggleReadonly(false))
  await columns.locator('.paragraph-block').first().click()
  await expect(toolbar).toBeVisible()
  await page.evaluate(id => (window as any).columnsFixture.crud.deleteBlockById(id), ids.columns)
  await expect(toolbar).toHaveCount(0)
})

for (const scrollOwner of ['document', 'region'] as const) {
  test(`${scrollOwner}: 顶部空间不足时浮层翻到分栏下方，滚回后恢复上方`, async ({page}) => {
    const ids = await setup(page, 'fixed')
    await page.evaluate(({ids, scrollOwner}) => {
      const doc = (window as any).columnsFixture
      const parent = scrollOwner === 'document' ? doc.root : doc.getBlockById(ids.region)
      doc.crud.transact(() => {
        doc.crud.insertBlockSnapshots(parent.id, 0, Array.from({length: 4}, () => doc.schemas.createSnapshot('paragraph', [])))
        doc.crud.insertBlockSnapshots(parent.id, parent.childrenLength, Array.from({length: 30}, () => doc.schemas.createSnapshot('paragraph', [])))
      })
    }, {ids, scrollOwner})
    const columns = page.locator(`[data-block-id="${ids.columns}"]`)
    const toolbar = page.getByRole('toolbar', {name: '分栏操作'})
    await columns.locator('.paragraph-block').first().click()
    const expectSide = async (below: boolean) => {
      await expect(toolbar).toBeVisible()
      await expect.poll(async () => {
        const bar = await toolbar.boundingBox()
        const block = (await columns.boundingBox())!
        return bar ? Math.abs(below ? bar.y - block.y - block.height - 8 : block.y - bar.y - bar.height - 8) : Infinity
      }).toBeLessThan(2)
      const bar = (await toolbar.boundingBox())!
      const block = (await columns.boundingBox())!
      expect(Math.abs(bar.x + bar.width / 2 - block.x - block.width / 2)).toBeLessThan(2)
    }
    await expectSide(false)
    await page.evaluate(({ids, scrollOwner}) => {
      const doc = (window as any).columnsFixture
      const scroller = scrollOwner === 'document' ? doc.scrollContainer :
        doc.getBlockById(ids.region).hostElement.querySelector('.render-unit-content')
      scroller.scrollTop += doc.getBlockById(ids.columns).hostElement.getBoundingClientRect().top -
        doc.scrollContainer.getBoundingClientRect().top - 16
    }, {ids, scrollOwner})
    await expectSide(true)
    await page.keyboard.press('Escape')
    // 顶部空间不足时重新打开，也应直接使用下方候选位置。
    await columns.locator('.paragraph-block').first().dispatchEvent('click')
    await expectSide(true)
    await page.evaluate(({ids, scrollOwner}) => {
      const doc = (window as any).columnsFixture
      const scroller = scrollOwner === 'document' ? doc.scrollContainer :
        doc.getBlockById(ids.region).hostElement.querySelector('.render-unit-content')
      scroller.scrollTop = 0
    }, {ids, scrollOwner})
    await expectSide(false)
  })

  test(`${scrollOwner}: 滚动时分栏浮层保持显示并跟随定位，无关面板滚动不关闭`, async ({page}) => {
    const ids = await setup(page, 'fixed')
    await page.evaluate(({ids, scrollOwner}) => {
      const doc = (window as any).columnsFixture
      const parent = scrollOwner === 'document' ? doc.root : doc.getBlockById(ids.region)
      doc.crud.transact(() => {
        doc.crud.insertBlockSnapshots(parent.id, 0, Array.from({length: 4}, () => doc.schemas.createSnapshot('paragraph', [])))
        doc.crud.insertBlockSnapshots(parent.id, parent.childrenLength, Array.from({length: 30}, () => doc.schemas.createSnapshot('paragraph', [])))
      })
    }, {ids, scrollOwner})
    const columns = page.locator(`[data-block-id="${ids.columns}"]`)
    await columns.locator('.paragraph-block').first().click()
    const toolbar = page.getByRole('toolbar', {name: '分栏操作'})
    await expect(toolbar).toBeVisible()
    const before = (await toolbar.boundingBox())!
    const selected = (await columnState(page, ids.columns)).head
    const scrollBy = 32
    await page.evaluate(({ids, scrollOwner, scrollBy}) => {
      const doc = (window as any).columnsFixture
      const scroller = scrollOwner === 'document' ? doc.scrollContainer :
        doc.getBlockById(ids.region).hostElement.querySelector('.render-unit-content')
      scroller.scrollTop += scrollBy
    }, {ids, scrollOwner, scrollBy})
    await expect(toolbar).toBeVisible()
    await expect.poll(async () => {
      const after = await toolbar.boundingBox()
      return after ? Math.abs(after.y - before.y + scrollBy) : Infinity
    }).toBeLessThan(2)
    const after = (await toolbar.boundingBox())!
    expect(Math.abs(after.x - before.x)).toBeLessThan(2)
    expect((await columnState(page, ids.columns)).head).toEqual(selected)

    await page.evaluate(async () => {
      const panel = document.createElement('div')
      panel.style.cssText = 'position:fixed;right:0;bottom:0;width:20px;height:20px;overflow:auto'
      const content = document.createElement('div')
      content.style.height = '200px'
      panel.appendChild(content)
      document.body.appendChild(panel)
      await new Promise<void>(resolve => {
        panel.addEventListener('scroll', () => { panel.remove(); resolve() }, {once: true})
        panel.scrollTop = 50
      })
    })
    await expect(toolbar).toBeVisible()
    const unchanged = (await toolbar.boundingBox())!
    expect(Math.abs(unchanged.x - after.x)).toBeLessThan(2)
    expect(Math.abs(unchanged.y - after.y)).toBeLessThan(2)
    await toolbar.getByRole('button', {name: '在右侧插入栏'}).click()
    await expect(columns.locator('.column-block')).toHaveCount(3)
  })
}

for (const mode of ['fixed', 'paginated', 'root'] as const) {
  test(`${mode}: 取消分栏保留内容顺序、块身份和选区，撤销恢复结构与栏宽`, async ({page}) => {
    const ids = await setup(page, mode)
    const columns = page.locator(`[data-block-id="${ids.columns}"]`)
    const toolbar = page.getByRole('toolbar', {name: '分栏操作'})
    const before = await page.evaluate(id => {
      const doc = (window as any).columnsFixture
      const block = doc.getBlockById(id)
      const paragraphs = block.getChildrenBlocks().map((column: any, index: number) => {
        const paragraph = column.firstChildren
        paragraph.replaceText(0, 0, index === 0 ? '左栏内容' : '右栏内容')
        return paragraph.id
      })
      block.updateProps({columnWidths: [35, 65]})
      return {paragraphs, parentId: block.parentId, columnIds: [...block.childrenIds]}
    }, ids.columns)
    await page.getByText('右栏内容', {exact: true}).click()
    await expect(toolbar).toContainText('第 2 栏')
    await toolbar.getByRole('button', {name: '取消分栏', exact: true}).click()
    await expect(columns).toHaveCount(0)
    const after = await page.evaluate(({parentId, paragraphs}) => {
      const doc = (window as any).columnsFixture
      return {children: doc.model.getChildrenIds(parentId), head: doc.selection.value?.head.blockId,
        texts: paragraphs.map(id => doc.getBlockById(id).hostElement.textContent.replace(/[\u200b\u200c]/g, ''))}
    }, before)
    expect(after.children).toEqual(before.paragraphs)
    expect(after.head).toEqual(before.paragraphs[1])
    expect(after.texts).toEqual(['左栏内容', '右栏内容'])
    await expect(toolbar).toHaveCount(0)
    await page.evaluate(() => (window as any).columnsFixture.crud.undoManager.undo())
    await expect(columns.locator('.column-block')).toHaveCount(2)
    expect(await page.evaluate(id => {
      const block = (window as any).columnsFixture.getBlockById(id)
      return {ids: [...block.childrenIds], widths: [...block.props.columnWidths]}
    }, ids.columns)).toEqual({ids: before.columnIds, widths: [35, 65]})
    await page.evaluate(() => (window as any).columnsFixture.crud.undoManager.redo())
    await expect(columns).toHaveCount(0)
    await expect(page.getByText('左栏内容', {exact: true})).toBeVisible()
    await expect(page.getByText('右栏内容', {exact: true})).toBeVisible()
  })
}

test('模型选区切换子栏，浮层按钮可用键盘操作，外部点击和 Escape 关闭', async ({page}) => {
  const ids = await setup(page, 'fixed')
  const columns = page.locator(`[data-block-id="${ids.columns}"]`)
  const toolbar = page.getByRole('toolbar', {name: '分栏操作'})
  await columns.locator('.paragraph-block').first().click()
  await page.evaluate(id => {
    const doc = (window as any).columnsFixture
    doc.selection.setCursorAtBlock(doc.getBlockById(id).getChildrenByIndex(1).firstChildren.id, true)
  }, ids.columns)
  await expect(toolbar).toContainText('第 2 栏')
  await toolbar.getByRole('button', {name: '在右侧插入栏'}).focus()
  await page.keyboard.press('Enter')
  await expect(columns.locator('.column-block')).toHaveCount(3)
  await page.keyboard.press('Escape')
  await expect(toolbar).toHaveCount(0)
  await columns.locator('.paragraph-block').first().click()
  await expect(toolbar).toBeVisible()
  await page.mouse.click(5, 5)
  await expect(toolbar).toHaveCount(0)
})

test('含只读后代时禁止取消分栏，解锁后恢复，不部分移动内容', async ({page}) => {
  const ids = await setup(page, 'fixed')
  const columns = page.locator(`[data-block-id="${ids.columns}"]`)
  await columns.locator('.paragraph-block').first().click()
  const cancel = page.getByRole('toolbar', {name: '分栏操作'}).getByRole('button', {name: '取消分栏'})
  await expect(cancel).toBeEnabled()
  await page.evaluate(id => {
    const doc = (window as any).columnsFixture
    doc.setBlockReadonly(doc.getBlockById(id).getChildrenByIndex(1).firstChildren.id, true)
  }, ids.columns)
  await expect(cancel).toBeDisabled()
  await expect(columns.locator('.column-block')).toHaveCount(2)
  await page.evaluate(id => {
    const doc = (window as any).columnsFixture
    doc.setBlockReadonly(doc.getBlockById(id).getChildrenByIndex(1).firstChildren.id, false)
  }, ids.columns)
  await expect(cancel).toBeEnabled()
  await cancel.click()
  await expect(columns).toHaveCount(0)
})

async function columnState(page: Page, columnsId: string) {
  return page.evaluate(id => {
    const doc = (window as any).columnsFixture
    const block = doc.model.exists(id) ? doc.getBlockById(id) : null
    const native = document.getSelection()
    const focus = native?.focusNode?.nodeType === 1 ? native.focusNode as Element : native?.focusNode?.parentElement
    return {ids: block ? [...block.childrenIds] : null, widths: block ? [...block.props.columnWidths] : null,
      head: doc.selection.value?.head.blockId, native: focus?.closest('[data-block-id]')?.getAttribute('data-block-id'),
      focused: doc.root.hostElement.contains(document.activeElement)}
  }, columnsId)
}

async function dragColumn(page: Page, sourceId: string, targetId: string, side: 'left' | 'right' | 'after', allowed = true) {
  const source = page.locator(`[data-block-id="${sourceId}"]`)
  await source.hover()
  const handle = source.getByRole('button', {name: '拖动子栏', exact: true})
  await expect(handle).toHaveCSS('opacity', '1')
  const grab = (await handle.boundingBox())!
  await page.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2)
  await page.mouse.down()
  await page.mouse.move(grab.x + grab.width / 2 + 6, grab.y + grab.height / 2)
  const target = (await page.locator(`[data-block-id="${targetId}"]`).boundingBox())!
  await page.mouse.move(side === 'left' ? target.x + 12 : side === 'right' ? target.x + target.width - 12 : target.x + target.width / 2,
    side === 'after' ? target.y + target.height - 2 : target.y + target.height / 2, {steps: 5})
  await expect.poll(() => page.evaluate(() => (window as any).columnsFixture.dragController._prevDragPosition)).toBe(allowed ? side : 'none')
  const preview = page.locator('.bc-column-reorder-preview')
  const line = page.locator('.bc-column-reorder-line')
  if (allowed) {
    await expect(preview).toBeVisible()
    await expect(line).toBeVisible()
    expect(await preview.evaluate(el => !!el.closest('.cdk-overlay-container'))).toBe(true)
    const previewBox = (await preview.boundingBox())!
    const sourceBox = (await source.boundingBox())!
    expect(Math.abs(previewBox.width - sourceBox.width)).toBeLessThan(2)
    const lineBox = (await line.boundingBox())!
    expect(Math.abs(lineBox.x + 1 - (side === 'left' ? target.x : target.x + target.width))).toBeLessThan(2)
    expect(lineBox.height).toBeGreaterThan(20)
    if (test.info().title.startsWith('fixed: mini')) {
      await page.screenshot({path: test.info().outputPath('column-reorder-preview.png')})
    }
  } else {
    await expect(preview).toBeHidden()
    await expect(line).toBeHidden()
  }
  await page.mouse.up()
  await expect(page.locator('bc-column-drag-preview')).toHaveCount(0)
}

for (const mode of ['fixed', 'paginated', 'root'] as const) {
  test(`${mode}: mini 抓手重排整栏且宽度跟随，Undo/Redo 恢复光标与结构`, async ({page}) => {
    const ids = await setup(page, mode)
    const before = await page.evaluate(id => {
      const doc = (window as any).columnsFixture
      const block = doc.getBlockById(id)
      block.updateProps({columnWidths: [35, 65]})
      const paragraphs = block.getChildrenBlocks().map((column: any, index: number) => {
        column.firstChildren.replaceText(0, 0, `子栏 ${index + 1}`)
        return column.firstChildren.id
      })
      doc.crud.undoManager.clearHistory()
      return {columns: [...block.childrenIds], paragraphs}
    }, ids.columns)
    await page.getByText('子栏 2', {exact: true}).click()
    await dragColumn(page, before.columns[1], before.columns[0], 'left')
    await expect.poll(() => columnState(page, ids.columns)).toMatchObject({ids: [...before.columns].reverse(), widths: [65, 35],
      head: before.paragraphs[1], native: before.paragraphs[1], focused: true})
    for (let round = 0; round < 2; round++) {
      await page.evaluate(() => (window as any).columnsFixture.crud.undoManager.undo())
      await expect.poll(() => columnState(page, ids.columns)).toMatchObject({ids: before.columns, widths: [35, 65],
        head: before.paragraphs[1], native: before.paragraphs[1], focused: true})
      await page.evaluate(() => (window as any).columnsFixture.crud.undoManager.redo())
      await expect.poll(() => columnState(page, ids.columns)).toMatchObject({ids: [...before.columns].reverse(), widths: [65, 35],
        head: before.paragraphs[1], native: before.paragraphs[1], focused: true})
    }
  })
}

test('拖出当前分栏不显示落点且不移动，原选区和历史保持正确', async ({page}) => {
  const ids = await setup(page, 'fixed')
  const before = await page.evaluate(id => {
    const doc = (window as any).columnsFixture
    const block = doc.getBlockById(id)
    const tail = doc.schemas.createSnapshot('paragraph', ['组外正文'])
    doc.crud.insertBlocks(block.parentId, 1, [tail])
    doc.selection.setCursorAtBlock(block.getChildrenByIndex(1).firstChildren.id, true)
    doc.crud.undoManager.clearHistory()
    return {columns: [...block.childrenIds], paragraph: block.getChildrenByIndex(1).firstChildren.id, tail: tail.id}
  }, ids.columns)
  await dragColumn(page, before.columns[1], before.tail, 'after', false)
  await expect.poll(() => columnState(page, ids.columns)).toMatchObject({ids: before.columns,
    head: before.paragraph, native: before.paragraph, focused: true})
  expect(await page.evaluate(() => (window as any).columnsFixture.crud.undoManager.isCanUndo())).toBe(false)
})

test('删除到单栏只在事务终态展开，中间删除再补栏不误展开', async ({page}) => {
  const ids = await setup(page, 'fixed')
  const before = await page.evaluate(id => {
    const doc = (window as any).columnsFixture
    const block = doc.getBlockById(id)
    const columns = [...block.childrenIds]
    doc.selection.setCursorAtBlock(block.getChildrenByIndex(0).firstChildren.id, true)
    doc.crud.undoManager.clearHistory()
    doc.crud.transact(() => {
      doc.crud.deleteBlocks(id, 1, 1)
      doc.crud.insertBlockSnapshots(id, 1, [doc.schemas.createSnapshot('column', [])])
    })
    return {columns, paragraph: block.getChildrenByIndex(0).firstChildren.id}
  }, ids.columns)
  await expect.poll(() => columnState(page, ids.columns)).toMatchObject({ids: expect.any(Array)})
  await expect(page.locator(`[data-block-id="${ids.columns}"] .column-block`)).toHaveCount(2)
  await page.evaluate(id => {
    const doc = (window as any).columnsFixture
    doc.crud.undoManager.stopCapturing()
    doc.crud.deleteBlocks(id, 1, 1)
  }, ids.columns)
  await expect.poll(() => columnState(page, ids.columns)).toMatchObject({ids: null, head: before.paragraph, native: before.paragraph})
  await page.evaluate(() => (window as any).columnsFixture.crud.undoManager.undo())
  await expect(page.locator(`[data-block-id="${ids.columns}"] .column-block`)).toHaveCount(2)
  await page.evaluate(() => (window as any).columnsFixture.crud.undoManager.redo())
  await expect.poll(() => columnState(page, ids.columns)).toMatchObject({ids: null, head: before.paragraph, native: before.paragraph})
})

test('未记录事务内嵌套 CRUD 不触发单栏退化或遗留撤销选区', async ({page}) => {
  const ids = await setup(page, 'fixed')
  await page.evaluate(id => {
    const doc = (window as any).columnsFixture
    doc.selection.setCursorAtBlock(doc.getBlockById(id).firstChildren.firstChildren.id, true)
    doc.crud.undoManager.clearHistory()
    doc.crud.transact(() => doc.crud.deleteBlocks(id, 1, 1), 'untracked-column-repair')
  }, ids.columns)
  await expect(page.locator(`[data-block-id="${ids.columns}"] .column-block`)).toHaveCount(1)
  expect(await page.evaluate(() => {
    const undo = (window as any).columnsFixture.crud.undoManager
    return {history: undo._yUndoManager.undoStack.length, pending: undo._pendingUndoSnapshot !== undefined}
  })).toEqual({history: 0, pending: false})
  await page.evaluate(id => {
    const doc = (window as any).columnsFixture
    doc.crud.insertBlockSnapshots(id, 1, [doc.schemas.createSnapshot('column', [])])
    doc.crud.undoManager.stopCapturing()
    doc.crud.deleteBlocks(id, 1, 1)
  }, ids.columns)
  await expect(page.locator(`[data-block-id="${ids.columns}"]`)).toHaveCount(0)
  await page.evaluate(() => (window as any).columnsFixture.crud.undoManager.undo())
  await expect(page.locator(`[data-block-id="${ids.columns}"] .column-block`)).toHaveCount(2)
})

test('其他分栏组也不响应，命令层拒绝跨组和正文落点', async ({page}) => {
  const ids = await setup(page, 'fixed')
  const before = await page.evaluate(id => {
    const doc = (window as any).columnsFixture
    const block = doc.getBlockById(id)
    const target = doc.schemas.createSnapshot('columns', [2])
    doc.crud.insertBlocks(block.parentId, 1, [target])
    doc.selection.setCursorAtBlock(block.getChildrenByIndex(1).firstChildren.id, true)
    doc.crud.undoManager.clearHistory()
    return {source: [...block.childrenIds], target: target.id, targetIds: target.children.map((child: any) => child.id)}
  }, ids.columns)
  await dragColumn(page, before.source[1], before.targetIds[0], 'left', false)
  await page.evaluate(before => {
    const doc = (window as any).columnsFixture
    const source = doc.getBlockById(before.source[1])
    doc.dndService.onSortBlock(source, doc.getBlockById(before.targetIds[0]), 'left')
    doc.dndService.onSortBlock(source, doc.getBlockById(before.target), 'after')
  }, before)
  await expect.poll(() => columnState(page, ids.columns)).toMatchObject({ids: before.source})
  await expect.poll(() => columnState(page, before.target)).toMatchObject({ids: before.targetIds})
  expect(await page.evaluate(() => (window as any).columnsFixture.crud.undoManager.isCanUndo())).toBe(false)
})

test('取消子栏拖拽不生成历史，下一次输入的撤销使用新的焦点', async ({page}) => {
  const ids = await setup(page, 'fixed')
  const columns = page.locator(`[data-block-id="${ids.columns}"]`)
  const handles = columns.getByRole('button', {name: '拖动子栏'})
  await columns.locator('.paragraph-block').first().click()
  await page.evaluate(() => (window as any).columnsFixture.crud.undoManager.clearHistory())
  await columns.locator('.column-block').first().hover()
  const grab = (await handles.first().boundingBox())!
  await page.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2)
  await page.mouse.down()
  await page.mouse.move(grab.x + grab.width / 2 + 20, grab.y + grab.height / 2 + 20)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  expect(await page.evaluate(() => (window as any).columnsFixture.crud.undoManager.isCanUndo())).toBe(false)
  await columns.locator('.paragraph-block').nth(1).click()
  const selected = (await columnState(page, ids.columns)).head
  await page.keyboard.type('继续输入')
  await page.evaluate(() => (window as any).columnsFixture.crud.undoManager.undo())
  await expect.poll(() => columnState(page, ids.columns)).toMatchObject({head: selected, native: selected, focused: true})
})

test('未先聚焦正文也能直接换位，光标落在拖动栏中', async ({page}) => {
  const ids = await setup(page, 'fixed')
  const before = await page.evaluate(id => {
    const doc = (window as any).columnsFixture
    const block = doc.getBlockById(id)
    const source = block.getChildrenByIndex(1)
    source.firstChildren.replaceText(0, 0, '直接拖动')
    doc.selection.blur()
    return {column: source.id, paragraph: source.firstChildren.id, target: block.firstChildren.id}
  }, ids.columns)
  await dragColumn(page, before.column, before.target, 'left')
  await expect.poll(() => columnState(page, ids.columns)).toMatchObject({ids: [before.column, before.target], head: before.paragraph, native: before.paragraph, focused: true})
})
