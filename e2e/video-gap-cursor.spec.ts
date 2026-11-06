import {expect, test, type Page} from '@playwright/test'
import fs from 'node:fs'

async function initialize(page: Page) {
  await page.routeWebSocket('**', socket => socket.close())
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    return ['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname)
      ? route.abort() : route.continue()
  })
  await page.route('**/gap-video.mp4', route => route.fulfill({
    contentType: 'video/mp4', body: fs.readFileSync('e2e/fixtures/video-poster.mp4'),
  }))
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => (window as any).ng?.getComponent(document.querySelector('block-craft-editor'))?.doc?.isInitialized)
}

async function geometry(page: Page, id: string) {
  return page.locator(`[data-block-id="${id}"]`).evaluate(host => {
    const rect = (element: Element) => {
      const {left, right, top, bottom, width, height} = element.getBoundingClientRect()
      return {left, right, top, bottom, width, height}
    }
    return {
      host: rect(host),
      video: rect(host.querySelector('.video-block__wrapper')!),
      before: rect(host.querySelector(':scope > [data-block-gap-side="before"]')!),
      after: rect(host.querySelector(':scope > [data-block-gap-side="after"]')!),
      nativeSide: document.getSelection()?.anchorNode?.parentElement?.getAttribute('data-block-gap-side'),
    }
  })
}

test('视频 gap 跟随播放器、嵌入、链接和空态的显示宽度及文档缩放', async ({page}) => {
  await initialize(page)
  const ids = await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const blocks = [
      {url: '/gap-video.mp4', sourceType: 'local', wr: 25, ar: 2},
      {url: '/gap-video.mp4', sourceType: 'local', width: 240},
      {url: '', sourceType: 'local', wr: 25, ar: 2},
      {url: 'https://example.test/watch', sourceType: 'link', wr: 25, ar: 2},
      {url: 'https://www.youtube.com/watch?v=abcdefghijk', sourceType: 'link', wr: 25, ar: 2},
    ].map(props => doc.schemas.createSnapshot('video', [props]))
    doc.crud.insertBlockSnapshots(doc.rootId, 0, blocks)
    return blocks.map((block: any) => block.id) as string[]
  })
  for (const id of ids) {
    for (const scale of [1, .75, 1.5]) {
      for (const wr of [25, 60, 100]) {
        await page.evaluate(({id, scale, wr, legacy}) => {
          const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
          doc.viewScale.setScale(scale)
          doc.crud.updateBlockProps(id, legacy ? {width: doc.objectSizing.rootContentWidth * wr / 100} : {wr})
          doc.selection.setGapCursor(id, 'after')
        }, {id, scale, wr, legacy: id === ids[1]})
        await page.locator(`[data-block-id="${id}"]`).scrollIntoViewIfNeeded()
        await expect.poll(async () => {
          const {after, video} = await geometry(page, id)
          return Math.abs(after.left - video.right - scale)
        }).toBeLessThan(.6)
        const bounds = await geometry(page, id)
        expect(bounds.video.width).toBeGreaterThan(20)
        expect(Math.abs(bounds.before.left - bounds.video.left + 2 * scale)).toBeLessThan(.6)
        expect(bounds.nativeSide).toBe('after')
        expect(Math.abs(bounds.host.width - bounds.video.width)).toBeLessThan(.6)
        if (id === ids[0] && scale === 1 && wr === 25) {
          await page.evaluate(id => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.selection.setGapCursor(id, 'before'), id)
          await page.mouse.click(bounds.video.right + 15, bounds.video.top + bounds.video.height / 2)
          await expect.poll(async () => (await geometry(page, id)).nativeSide).toBe('after')
        }
      }
    }
  }
})

test('窄单元格内的视频 gap 支持点击、前后输入、撤销及实时拖动改宽', async ({page}) => {
  await initialize(page)
  const {id, parentId} = await page.evaluate(() => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    const video = doc.schemas.createSnapshot('video', [{url: '/gap-video.mp4', sourceType: 'local', wr: 15, ar: 2}])
    const table = doc.schemas.createSnapshot('table', [1, 1])
    table.props.colWidths = [260]
    const cell = table.children[0].children[0]
    cell.children = [video]
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [table])
    return {id: video.id as string, parentId: cell.id as string}
  })
  const block = page.locator(`[data-block-id="${id}"]`)
  await block.scrollIntoViewIfNeeded()
  const initial = await geometry(page, id)
  expect(Math.abs(initial.after.right - initial.video.right)).toBeLessThan(.6)
  await page.mouse.click(initial.video.right + 15, initial.video.top + initial.video.height / 2)
  await expect.poll(async () => (await geometry(page, id)).nativeSide).toBe('after')

  // 按正文宽度存储的视频仍须收敛到更窄的单元格，宿主与播放器同步收缩。
  await page.evaluate(id => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.crud.updateBlockProps(id, {wr: 100}), id)
  await expect.poll(async () => (await geometry(page, id)).video.width).toBeGreaterThan(initial.video.width + 30)
  const capped = await geometry(page, id)
  const available = await block.evaluate(host => host.parentElement!.clientWidth)
  expect(capped.host.width).toBeLessThanOrEqual(available + .6)
  expect(Math.abs(capped.host.width - capped.video.width)).toBeLessThan(.6)
  expect(Math.abs(capped.after.right - capped.video.right)).toBeLessThan(.6)
  await page.evaluate(id => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.crud.updateBlockProps(id, {wr: 15}), id)
  await expect.poll(async () => Math.abs((await geometry(page, id)).video.width - initial.video.width)).toBeLessThan(.6)

  const children = () => page.evaluate(parentId => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    return doc.model.getChildrenIds(parentId).map((childId: string) => ({id: childId, flavour: doc.model.getFlavour(childId)}))
  }, parentId)
  await page.evaluate(id => {
    const doc = (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc
    doc.crud.undoManager.clearHistory()
    doc.selection.setGapCursor(id, 'before')
  }, id)
  await page.keyboard.press('Enter')
  await expect.poll(children).toEqual([{id: expect.any(String), flavour: 'paragraph'}, {id, flavour: 'video'}])
  await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.crud.undoManager.undo())
  await expect.poll(children).toEqual([{id, flavour: 'video'}])
  await page.evaluate(id => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.selection.setGapCursor(id, 'after'), id)
  await page.keyboard.insertText('视频后输入')
  await expect.poll(children).toEqual([{id, flavour: 'video'}, {id: expect.any(String), flavour: 'paragraph'}])
  await expect(block.locator('..').locator('.paragraph-block')).toHaveText(/视频后输入$/)
  await page.evaluate(() => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.crud.undoManager.undo())
  await expect.poll(children).toEqual([{id, flavour: 'video'}])

  await page.evaluate(id => (window as any).ng.getComponent(document.querySelector('block-craft-editor')).doc.selection.selectBlock(id), id)
  await block.hover()
  const grip = (await block.locator('.block-resizer__bar--right').boundingBox())!
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await page.mouse.down()
  await page.mouse.move(grip.x + grip.width / 2 + 35, grip.y + grip.height / 2, {steps: 5})
  await expect.poll(async () => (await geometry(page, id)).video.width).toBeGreaterThan(initial.video.width + 30)
  const preview = await geometry(page, id)
  expect(Math.abs(preview.after.right - preview.video.right)).toBeLessThan(.6)
  await page.mouse.up()
  const committed = await geometry(page, id)
  expect(Math.abs(committed.after.right - committed.video.right)).toBeLessThan(.6)
})
