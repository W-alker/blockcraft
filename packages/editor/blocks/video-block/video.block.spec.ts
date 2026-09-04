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
