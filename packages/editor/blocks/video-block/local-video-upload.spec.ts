import type {DocFileService} from '../../framework/host/file.service'
import {getLocalVideoUpload, LocalVideoUpload} from './local-video-upload'

describe('LocalVideoUpload', () => {
  const file = () => new File(['video'], 'clip.mp4', {type: 'video/mp4'})
  function service() {
    return {
      uploadVideo: jasmine.createSpy().and.resolveTo({url: 'video.mp4'}),
      uploadImg: jasmine.createSpy().and.resolveTo('poster.jpg'),
    } as unknown as DocFileService
  }

  it('reuses one upload task for the same host and File across remounts', async () => {
    const host = service()
    const clip = file()
    const first = getLocalVideoUpload(host, clip)
    expect(getLocalVideoUpload(host, clip)).toBe(first)
    await first.video
    expect(host.uploadVideo).toHaveBeenCalledTimes(1)
    expect(getLocalVideoUpload(service(), clip)).not.toBe(first)
  })

  it('extracts and uploads the thumbnail at most once', async () => {
    const host = service()
    const frame = new File(['frame'], 'poster.jpg')
    const extract = jasmine.createSpy().and.resolveTo(frame)
    const task = new LocalVideoUpload(host, file(), extract)
    expect(await task.preparePoster()).toBe(frame)
    await task.preparePoster()
    expect(extract).toHaveBeenCalledTimes(1)
    expect(host.uploadImg).not.toHaveBeenCalled()
    expect(await task.uploadPoster(frame)).toBe('poster.jpg')
    await task.uploadPoster(frame)
    expect(host.uploadImg).toHaveBeenCalledTimes(1)
  })

  it('isolates thumbnail errors from a successful video upload', async () => {
    const host = service()
    const task = new LocalVideoUpload(host, file(), () => Promise.reject(new Error('decoder failed')))
    expect(await task.preparePoster()).toBeUndefined()
    expect(await task.video).toEqual(jasmine.objectContaining({url: 'video.mp4'}))
    expect(host.uploadImg).not.toHaveBeenCalled()
  })
})
