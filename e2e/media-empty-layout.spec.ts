import {expect, test} from '@playwright/test'

test('media empty states fit their own layout frames', async ({page}) => {
  await page.routeWebSocket('**', socket => socket.close())
  await page.goto('/')
  await page.getByRole('button', {name: '初始化', exact: true}).click()
  await page.waitForFunction(() => {
    const editor = document.querySelector('block-craft-editor')
    return !!editor && !!(window as any).ng?.getComponent(editor)?.doc?.isInitialized
  })

  const ids = await page.evaluate(() => {
    const editor = document.querySelector('block-craft-editor')!
    const doc = (window as any).ng.getComponent(editor).doc
    const video = doc.schemas.createSnapshot('video', [{url: '', sourceType: 'local', wr: 40, ar: 2}])
    const peerVideo = doc.schemas.createSnapshot('video', [{url: '__blockcraft_local__:blob:https://example.invalid/peer', sourceType: 'link', wr: 30, ar: 2}])
    const audio = doc.schemas.createSnapshot('audio', [{url: '', sourceType: 'local'}])
    const attachment = doc.schemas.createSnapshot('attachment', [{url: '', name: '', type: '', size: 0}])
    doc.crud.insertBlockSnapshots(doc.rootId, 0, [video, peerVideo, audio, attachment])
    return {video: video.id as string, peerVideo: peerVideo.id as string,
      audio: audio.id as string, attachment: attachment.id as string}
  })

  for (const id of Object.values(ids)) {
    await expect(page.locator(`[data-block-id="${id}"]`)).toBeVisible()
  }

  const sizes = async () => page.evaluate(ids => {
    const measure = (id: string, selector: string) => {
      const host = document.querySelector<HTMLElement>(`[data-block-id="${id}"]`)!
      const hint = host.querySelector<HTMLElement>(selector)!
      const outer = host.getBoundingClientRect()
      const inner = hint.getBoundingClientRect()
      return {hostWidth: outer.width, hostHeight: outer.height, hintWidth: inner.width, hintHeight: inner.height,
        hintRight: inner.right, hostRight: outer.right}
    }
    const measureVideo = (id: string, selector: string) => {
      const videoFrame = document.querySelector<HTMLElement>(`[data-block-id="${id}"] .video-block__placeholder-frame`)!
      const videoHint = videoFrame.querySelector<HTMLElement>(selector)!
      const frame = videoFrame.getBoundingClientRect()
      const hint = videoHint.getBoundingClientRect()
      return {frame: {x: frame.x, y: frame.y, width: frame.width, height: frame.height},
        hint: {x: hint.x, y: hint.y, width: hint.width, height: hint.height}}
    }
    const editor = document.querySelector('block-craft-editor')!
    const doc = (window as any).ng.getComponent(editor).doc
    return {
      video: {...measureVideo(ids.video, '.upload-hint'),
        expectedWidth: doc.objectSizing.rootContentWidth * doc.model.getProps(ids.video).wr / 100},
      peerVideo: measureVideo(ids.peerVideo, '.peer-uploading'),
      audio: measure(ids.audio, '.upload-hint'),
      attachment: measure(ids.attachment, '.attachment-block__empty'),
    }
  }, ids)
  const before = await sizes()
  expect(before.video.hint).toEqual(before.video.frame)
  expect(before.video.frame.width).toBeCloseTo(before.video.expectedWidth, 1)
  expect(before.video.frame.height).toBeCloseTo(before.video.frame.width / 2, 1)
  expect(before.peerVideo.hint).toEqual(before.peerVideo.frame)
  expect(before.audio.hintRight).toBeLessThanOrEqual(before.audio.hostRight)
  expect(before.attachment.hintRight).toBeLessThanOrEqual(before.attachment.hostRight)

  await page.evaluate(id => {
    const editor = document.querySelector('block-craft-editor')!
    const doc = (window as any).ng.getComponent(editor).doc
    doc.crud.updateBlockProps(id, {wr: 20})
  }, ids.video)
  await expect.poll(async () => (await sizes()).video.frame.width).toBeLessThan(before.video.frame.width)
  const after = await sizes()
  expect(after.video.hint).toEqual(after.video.frame)
  expect(after.video.frame.height).toBeCloseTo(after.video.frame.width / 2, 1)

  await page.evaluate(() => {
    const editor = document.querySelector('block-craft-editor')!
    const doc = (window as any).ng.getComponent(editor).doc
    doc.objectSizing.rootContentElement.style.width = `${doc.objectSizing.rootContentWidth * 0.75}px`
  })
  await expect.poll(async () => (await sizes()).video.frame.width).toBeLessThan(after.video.frame.width)
  const narrowed = await sizes()
  expect(narrowed.video.hint).toEqual(narrowed.video.frame)
  expect(narrowed.peerVideo.hint).toEqual(narrowed.peerVideo.frame)
})
