import {EventEmitter} from '@angular/core'
import {Subject} from 'rxjs'
import type {DocAttachmentInfo} from '../../framework/host/file.service'
import {LocalVideoUpload} from './local-video-upload'
import {VideoBlockSchema} from './index'
import {VideoBlockComponent} from './video.block'

describe('VideoBlockComponent local preview', () => {
  function createComponent(url: string) {
    const fileService = {
      isLocalObjectURL: jasmine.createSpy('isLocalObjectURL')
        .and.callFake((value: string) => value.startsWith('local://')),
      getFilePreviewURLByObjectURL: jasmine.createSpy('getFilePreviewURLByObjectURL')
        .and.returnValue('blob:https://editor.test/video'),
    }
    const component = Object.create(VideoBlockComponent.prototype) as any
    component._props = {url}
    component.doc = {injector: {get: () => fileService}}
    return {component: component as VideoBlockComponent, fileService}
  }

  it('resolves a browser-loadable URL for a local upload placeholder', () => {
    const {component, fileService} = createComponent('local://video')

    expect((component as any).resourcePreviewUrl).toBe('blob:https://editor.test/video')
    expect(fileService.getFilePreviewURLByObjectURL)
      .toHaveBeenCalledOnceWith('local://video')
  })

  it('keeps an uploaded URL unchanged', () => {
    const {component, fileService} = createComponent('https://cdn.test/video.mp4')

    expect((component as any).resourcePreviewUrl).toBe('https://cdn.test/video.mp4')
    expect(fileService.getFilePreviewURLByObjectURL).not.toHaveBeenCalled()
  })
})

describe('VideoBlockComponent poster upload lifecycle', () => {
  function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (reason: unknown) => void
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
    return {promise, resolve, reject}
  }

  function harness(poster?: string) {
    const video = deferred<DocAttachmentInfo>()
    const cover = deferred<string>()
    const frame = deferred<File | undefined>()
    spyOn(LocalVideoUpload.prototype, 'preparePoster').and.returnValue(frame.promise)
    const file = new File(['video'], 'test.mp4', {type: 'video/mp4'})
    const service = {
      isLocalObjectURL: (url: string) => url.startsWith('local://'),
      getFileByObjectURL: jasmine.createSpy().and.returnValue(file),
      removeObjectURL: jasmine.createSpy(),
      uploadVideo: jasmine.createSpy().and.returnValue(video.promise),
      uploadImg: jasmine.createSpy().and.returnValue(cover.promise),
    }
    const component = Object.create(VideoBlockComponent.prototype) as any
    component._props = {url: 'local://video', sourceType: 'local', poster}
    Object.defineProperty(component, 'isReadonly', {value: false, writable: true})
    component._isGone = jasmine.createSpy().and.returnValue(false)
    component.onPropsChange = new EventEmitter()
    component.onDestroy$ = new Subject()
    component.doc = {injector: {get: () => service}, messageService: {warn: jasmine.createSpy()}}
    component.changeDetectorRef = {markForCheck: jasmine.createSpy()}
    component.processEmbedContent = jasmine.createSpy()
    component.setInitProps = jasmine.createSpy().and.callFake((patch: object) => {
      Object.assign(component._props, patch)
      const changes = new Map(Object.keys(patch).map(key => [key, {}]))
      component.onPropsChange.emit(changes)
      // CRUD 同时有同步通知和排队的视图通知。
      queueMicrotask(() => component.onPropsChange.emit(changes))
    })
    const info = {url: 'https://cdn.test/video.mp4', name: file.name, size: file.size, type: file.type}
    return {component, service, video, cover, frame, info}
  }

  async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve() }

  it('publishes the video before the optional poster, then persists the uploaded image', async () => {
    const h = harness()
    const pending = h.component.uploadFile('local://video')
    h.video.resolve(h.info)
    await flush()
    expect(h.component.props.url).toBe(h.info.url)
    expect(h.component.uploadProgress).toBe(100)
    expect(h.service.uploadImg).not.toHaveBeenCalled()
    h.frame.resolve(new File(['frame'], 'poster.jpg'))
    await flush()
    h.cover.resolve('https://cdn.test/poster.jpg')
    await pending
    expect(h.component.props.poster).toBe('https://cdn.test/poster.jpg')
    expect(h.component.doc.messageService.warn).not.toHaveBeenCalled()
  })

  it('ignores a queued notification from clearing the previous video poster before upload', async () => {
    const h = harness()
    queueMicrotask(() => h.component.onPropsChange.emit(new Map([['poster', {oldValue: 'previous.jpg'}]])))
    const pending = h.component.uploadFile('local://video')
    h.video.resolve(h.info)
    h.frame.resolve(new File(['frame'], 'poster.jpg'))
    await flush()
    h.cover.resolve('https://cdn.test/new-poster.jpg')
    await pending
    expect(h.component.props.poster).toBe('https://cdn.test/new-poster.jpg')
  })

  it('keeps successful video upload when poster extraction or upload fails', async () => {
    const h = harness()
    const pending = h.component.uploadFile('local://video')
    h.video.resolve(h.info)
    h.frame.resolve(new File(['frame'], 'poster.jpg'))
    await flush()
    h.cover.reject(new Error('poster upload failed'))
    await pending
    expect(h.component.props.url).toBe(h.info.url)
    expect(h.component.props.poster).toBeUndefined()
    expect(h.component.doc.messageService.warn).not.toHaveBeenCalled()
  })

  for (const change of ['deleted', 'readonly', 'replaced', 'poster', 'cleared']) {
    it(`does not write a late poster after ${change}`, async () => {
      const h = harness()
      const pending = h.component.uploadFile('local://video')
      h.video.resolve(h.info)
      h.frame.resolve(new File(['frame'], 'poster.jpg'))
      await flush()
      expect(h.service.uploadImg).toHaveBeenCalledTimes(1)
      if (change === 'deleted') h.component._isGone.and.returnValue(true)
      if (change === 'readonly') h.component.isReadonly = true
      if (change === 'replaced') h.component.setInitProps({url: 'https://cdn.test/new.mp4'})
      if (change === 'poster') h.component.setInitProps({poster: 'custom.jpg'})
      if (change === 'cleared') {
        h.component.setInitProps({poster: 'custom.jpg'})
        h.component.setInitProps({poster: undefined})
      }
      h.component.setInitProps.calls.reset()
      h.cover.resolve('https://cdn.test/stale.jpg')
      await pending
      expect(h.component.setInitProps).not.toHaveBeenCalled()
    })
  }

  it('skips thumbnail upload if the block disappeared before extraction finished', async () => {
    const h = harness()
    const pending = h.component.uploadFile('local://video')
    h.video.resolve(h.info)
    await flush()
    h.component._isGone.and.returnValue(true)
    h.frame.resolve(new File(['frame'], 'poster.jpg'))
    await pending
    expect(h.service.uploadImg).not.toHaveBeenCalled()
  })

  it('does not overwrite a replacement when the old video upload fails', async () => {
    const h = harness()
    const pending = h.component.uploadFile('local://video')
    h.component.setInitProps({url: 'https://cdn.test/new.mp4'})
    h.video.reject(new Error('failed'))
    await pending
    expect(h.component.props.url).toBe('https://cdn.test/new.mp4')
    expect(h.component.doc.messageService.warn).not.toHaveBeenCalled()
  })

  it('does not extract an existing poster or upload on a readonly or peer-only block', async () => {
    const h = harness('saved.jpg')
    const pending = h.component.uploadFile('local://video')
    h.video.resolve(h.info)
    await pending
    expect(LocalVideoUpload.prototype.preparePoster).not.toHaveBeenCalled()
    expect(h.component.props.poster).toBe('saved.jpg')
    h.service.uploadVideo.calls.reset()
    h.component.isReadonly = true
    await h.component.uploadFile('local://readonly')
    h.component.isReadonly = false
    h.service.getFileByObjectURL.and.returnValue(undefined)
    await h.component.uploadFile('local://peer')
    expect(h.service.uploadVideo).not.toHaveBeenCalled()
  })

  it('preserves supplied poster in new snapshots', () => {
    const snapshot = VideoBlockSchema.createSnapshot({sourceType: 'link', url: 'video.mp4', poster: 'saved.jpg'})
    expect(snapshot.props.poster).toBe('saved.jpg')
  })
})
