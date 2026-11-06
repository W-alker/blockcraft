import {expect, test, type Page} from '@playwright/test'

async function setup(page: Page, flavour: 'text-box' | 'callout') {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng
    ?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
  const ids = await page.evaluate(flavour => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const container = doc.schemas.createSnapshot(flavour, flavour === 'text-box'
      ? ['容器内部段落', {width: 300, height: 150}] : [])
    const outside = doc.schemas.createSnapshot('paragraph', ['容器外部段落'])
    const tail = doc.schemas.createSnapshot('paragraph', ['后续段落'])
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [container, outside, tail])
    return {container: container.id, child: container.children[0].id, outside: outside.id, tail: tail.id}
  }, flavour)
  await page.locator(`[data-block-id="${ids.container}"]`).scrollIntoViewIfNeeded()
  return ids
}

async function beginDrag(page: Page, id: string) {
  const host = page.locator(`[data-block-id="${id}"]`)
  await host.scrollIntoViewIfNeeded()
  // A dedicated handle isolates the controller from object-selection picking.
  // Hit testing, preview, pointer movement and commits use the live editor DOM.
  await page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const handle = document.createElement('button')
    handle.dataset['testDragHandle'] = ''
    handle.style.cssText = 'position:fixed;left:0;top:0;width:40px;height:30px;z-index:99999'
    handle.addEventListener('pointerdown', event => {
      event.preventDefault()
      doc.dragController.startDrag(event, {kind: 'origin-block', blockId: id})
    }, {once: true})
    document.body.appendChild(handle)
  }, id)
  await page.mouse.move(20, 15)
  await page.mouse.down()
  await page.mouse.move(30, 15)
  await expect.poll(() => preview(page)).toMatchObject({state: 'dragging'})
  await page.locator('[data-test-drag-handle]').evaluate(element => element.remove())
}

async function moveTo(page: Page, id: string) {
  const box = (await page.locator(`[data-block-id="${id}"]`).boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 2)
}

async function preview(page: Page) {
  return page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const ctrl = doc.dragController
    return {
      state: ctrl.state,
      target: ctrl._prevBlock?.id ?? null,
      visible: !!ctrl._dropLine && getComputedStyle(ctrl._dropLine).display !== 'none'
        && ctrl._dropLine.getBoundingClientRect().width > 0,
      highlighted: doc.root.hostElement.querySelectorAll('.drag-over').length,
    }
  })
}

async function structure(page: Page, container: string) {
  return page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    return {root: doc.root.childrenIds, children: doc.getBlockById(id).childrenIds}
  }, container)
}

for (const flavour of ['text-box', 'callout'] as const) {
  test(`${flavour}: own children hide the drop line and pointerup preserves the tree`, async ({page}) => {
    const ids = await setup(page, flavour)
    const before = await structure(page, ids.container)
    await beginDrag(page, ids.container)
    await moveTo(page, ids.outside)
    await expect.poll(() => preview(page)).toMatchObject({visible: true, target: ids.outside})
    await moveTo(page, ids.child)
    await expect.poll(() => preview(page)).toEqual({state: 'dragging', target: null, visible: false, highlighted: 0})
    // A second sub-threshold movement must not revive the old outside target.
    const box = (await page.locator(`[data-block-id="${ids.child}"]`).boundingBox())!
    await page.mouse.move(box.x + box.width / 2 + 1, box.y + box.height - 2)
    await page.mouse.up()
    expect(await structure(page, ids.container)).toEqual(before)
  })

  test(`${flavour}: leaving own children restores reorder and outside paragraphs can still enter`, async ({page}) => {
    const ids = await setup(page, flavour)
    await beginDrag(page, ids.container)
    await moveTo(page, ids.child)
    await expect.poll(() => preview(page)).toMatchObject({visible: false, target: null})
    await moveTo(page, ids.tail)
    await expect.poll(() => preview(page)).toMatchObject({visible: true, target: ids.tail})
    await page.mouse.up()
    await expect.poll(async () => (await structure(page, ids.container)).root.slice(0, 3))
      .toEqual([ids.outside, ids.tail, ids.container])

    await beginDrag(page, ids.outside)
    await moveTo(page, ids.child)
    await expect.poll(() => preview(page)).toMatchObject({visible: true, target: ids.child})
    await page.mouse.up()
    await expect.poll(async () => (await structure(page, ids.container)).children)
      .toEqual([ids.child, ids.outside])
  })
}
