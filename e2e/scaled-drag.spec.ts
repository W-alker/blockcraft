import {expect, test, type Page} from '@playwright/test'

async function setup(page: Page, scale: number) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng
    ?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  await page.evaluate(scale => {
    const source = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const viewport = document.createElement('div')
    viewport.style.cssText = 'position:fixed;left:20px;top:50px;width:1100px;height:600px;overflow:auto;background:white;z-index:99999'
    const mount = document.createElement('div')
    mount.style.width = '480px'
    viewport.appendChild(mount)
    document.body.appendChild(viewport)
    const blocks = ['拖动源', '目标段落', '尾部段落'].map(text => source.schemas.createSnapshot('paragraph', [text]))
    const snapshot = source.schemas.createSnapshot('root', ['scaled-drag', blocks])
    const doc = new source.constructor({
      ...source.config, yDoc: new source.yDoc.constructor(), docId: snapshot.id,
      plugins: [], scrollContainer: viewport, readonly: false, virtualization: {enabled: false},
    })
    doc.initBySnapshot(snapshot, mount)
    doc.root.hostElement.style.minHeight = '1200px'
    doc.viewScale.attach(mount)
    doc.viewScale.setScale(scale)
    ;(window as any).scaledDrag = {doc, viewport, ids: blocks.map(block => block.id)}
    const handle = document.createElement('button')
    handle.dataset['scaleDragHandle'] = ''
    handle.style.cssText = 'position:fixed;left:1150px;top:60px;width:40px;height:30px;z-index:999999'
    handle.addEventListener('pointerdown', event => {
      event.preventDefault()
      doc.dragController.startDrag(event, {kind: 'origin-block', blockId: blocks[0].id})
    })
    document.body.appendChild(handle)
  }, scale)
}

async function targetPoint(page: Page, position: string) {
  return page.evaluate(position => {
    const {doc, ids} = (window as any).scaledDrag
    const r = doc.getBlockById(ids[1]).hostElement.getBoundingClientRect()
    return {x: position === 'left' ? r.left + 2 : position === 'right' ? r.right - 2 : r.left + r.width / 2,
      y: position === 'before' ? r.top + 2 : r.bottom - 2}
  }, position)
}

async function expectLine(page: Page, position: string, file = false) {
  await expect.poll(() => page.evaluate(({position, file}) => {
    const {doc, ids} = (window as any).scaledDrag
    const ctrl = file ? doc.dndService : doc.dragController
    const line = file ? ctrl._fileDropLine : ctrl._dropLine
    if (!line || getComputedStyle(line).display === 'none') return 9999
    const target = file ? ctrl._fileDropTarget : ctrl._prevBlock
    if (target?.id !== ids[1]) return 9999
    const r = target.hostElement.getBoundingClientRect()
    const l = line.getBoundingClientRect()
    const scale = doc.viewScale.geometryScale
    const vertical = position === 'left' || position === 'right'
    const left = position === 'left' ? r.left - scale : position === 'right' ? r.right + scale : r.left
    const top = position === 'before' ? r.top - scale : position === 'after' ? r.bottom + scale : r.top
    return Math.max(Math.abs(l.left - left), Math.abs(l.top - top),
      Math.abs(l.width - (vertical ? 2 * scale : r.width)),
      Math.abs(l.height - (vertical ? r.height : 2 * scale)))
  }, {position, file})).toBeLessThan(1)
}

for (const scale of [0.5, 1, 1.5, 2]) {
  test(`scale ${scale}: live block drag aligns all drop lines and commits reorder`, async ({page}) => {
    await setup(page, scale)
    await page.locator('[data-scale-drag-handle]').hover()
    await page.mouse.down()
    for (const position of ['before', 'left', 'right', 'after']) {
      const point = await targetPoint(page, position)
      await page.mouse.move(point.x, point.y, {steps: 3})
      await expectLine(page, position)
      const ghostOffset = await page.evaluate(point => {
        const ghost = (window as any).scaledDrag.doc.dragController._ghost.getBoundingClientRect()
        return {x: ghost.left - point.x, y: ghost.top - point.y}
      }, point)
      // WebKit 的 PointerEvent 会将半像素坐标取整。
      expect(Math.abs(ghostOffset.x - 12)).toBeLessThan(1)
      expect(Math.abs(ghostOffset.y - 12)).toBeLessThan(1)
    }
    await page.mouse.up()
    await expect.poll(() => page.evaluate(() => {
      const {doc, ids} = (window as any).scaledDrag
      return doc.root.childrenIds.join() === [ids[1], ids[0], ids[2]].join()
    })).toBe(true)
  })

  test(`scale ${scale}: external file line aligns before and after`, async ({page}) => {
    await setup(page, scale)
    for (const position of ['before', 'after']) {
      const point = await targetPoint(page, position)
      await page.evaluate(point => {
        const {doc} = (window as any).scaledDrag
        const dataTransfer = new DataTransfer()
        dataTransfer.items.add(new File(['probe'], 'probe.txt', {type: 'text/plain'}))
        doc.root.hostElement.dispatchEvent(new DragEvent('dragenter', {...point, clientX: point.x, clientY: point.y, dataTransfer, bubbles: true}))
        document.dispatchEvent(new DragEvent('dragover', {clientX: point.x, clientY: point.y, dataTransfer, bubbles: true, cancelable: true}))
      }, point)
      await expectLine(page, position, true)
    }
    await page.evaluate(() => document.dispatchEvent(new DragEvent('dragend', {bubbles: true})))
  })
}

test('active drag refreshes line coordinates after scale changes and scrolling', async ({page}) => {
  await setup(page, 0.5)
  await page.locator('[data-scale-drag-handle]').hover()
  await page.mouse.down()
  for (const scale of [0.5, 1.5, 2, 1]) {
    await page.evaluate(scale => {
      const {doc, viewport} = (window as any).scaledDrag
      doc.viewScale.setScale(scale)
      viewport.scrollTop = 10 * scale
    }, scale)
    const point = await targetPoint(page, 'after')
    await page.mouse.move(point.x, point.y)
    await expectLine(page, 'after')
  }
  await page.keyboard.press('Escape')
  await page.mouse.up()
  expect(await page.evaluate(() => {
    const {doc, ids} = (window as any).scaledDrag
    return {state: doc.dragController.state, line: !!doc.dragController._dropLine,
      unchanged: doc.root.childrenIds.join() === ids.join()}
  })).toEqual({state: 'idle', line: false, unchanged: true})
})

for (const kind of ['new-block', 'origin-blocks', 'column'] as const) {
  test(`scale 1.5: ${kind} commits at the previewed target`, async ({page}) => {
    await setup(page, 1.5)
    // Replace only the handle's start command; retain real pointer hit testing and commit.
    await page.locator('[data-scale-drag-handle]').evaluate(handle => handle.remove())
    await page.evaluate(kind => {
      const {doc, ids} = (window as any).scaledDrag
      // 多块拖拽的源必须是连续兄弟节点。
      if (kind === 'origin-blocks') doc.crud.moveBlocks(doc.rootId, 2, 1, doc.rootId, 1)
      const handle = document.createElement('button')
      handle.dataset['scaleDragHandle'] = ''
      handle.style.cssText = 'position:fixed;left:1150px;top:60px;width:40px;height:30px;z-index:999999'
      handle.addEventListener('pointerdown', event => {
        event.preventDefault()
        const data = kind === 'new-block' ? {kind, flavour: 'paragraph'}
          : kind === 'origin-blocks' ? {kind, blockIds: [ids[0], ids[2]]}
          : {kind: 'origin-block', blockId: ids[0]}
        doc.dragController.startDrag(event, data)
      })
      document.body.appendChild(handle)
    }, kind)
    await page.locator('[data-scale-drag-handle]').hover()
    await page.mouse.down()
    const position = kind === 'column' ? 'left' : 'after'
    const point = await targetPoint(page, position)
    await page.mouse.move(point.x, point.y, {steps: 3})
    await expectLine(page, position)
    await page.mouse.up()
    await expect.poll(() => page.evaluate(kind => {
      const {doc, ids} = (window as any).scaledDrag
      const root = doc.root.childrenIds
      if (kind === 'new-block') return root.length === 4 && root[1] === ids[1]
        && !ids.includes(root[2]) && root[3] === ids[2]
      if (kind === 'origin-blocks') return root.join() === [ids[1], ids[0], ids[2]].join()
      const columns = doc.getBlockById(root[0])
      return columns.flavour === 'columns' && columns.childrenIds.length === 2
        && doc.getBlockById(columns.childrenIds[0]).childrenIds.includes(ids[0])
        && doc.getBlockById(columns.childrenIds[1]).childrenIds.includes(ids[1])
    }, kind)).toBe(true)
  })
}
