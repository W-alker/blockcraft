import {AudioBlockComponent} from './audio.block'

describe('AudioBlockComponent local preview', () => {
  function createComponent(url: string) {
    const fileService = {
      isLocalObjectURL: jasmine.createSpy('isLocalObjectURL')
        .and.callFake((value: string) => value.startsWith('local://')),
      getFilePreviewURLByObjectURL: jasmine.createSpy('getFilePreviewURLByObjectURL')
        .and.returnValue('blob:https://editor.test/audio'),
    }
    const component = Object.create(AudioBlockComponent.prototype) as any
    component._props = {url}
    component.doc = {injector: {get: () => fileService}}
    return {component: component as AudioBlockComponent, fileService}
  }

  it('resolves a browser-loadable URL for a local upload placeholder', () => {
    const {component, fileService} = createComponent('local://audio')

    expect((component as any).resourcePreviewUrl).toBe('blob:https://editor.test/audio')
    expect(fileService.getFilePreviewURLByObjectURL)
      .toHaveBeenCalledOnceWith('local://audio')
  })

  it('keeps an uploaded URL unchanged', () => {
    const {component, fileService} = createComponent('https://cdn.test/audio.mp3')

    expect((component as any).resourcePreviewUrl).toBe('https://cdn.test/audio.mp3')
    expect(fileService.getFilePreviewURLByObjectURL).not.toHaveBeenCalled()
  })

  it('formats playback time without exposing invalid media values', () => {
    const {component} = createComponent('https://cdn.test/audio.mp3')

    expect((component as any).formatTime(0)).toBe('0:00')
    expect((component as any).formatTime(65.9)).toBe('1:05')
    expect((component as any).formatTime(Number.NaN)).toBe('0:00')
    expect((component as any).formatTime(-1)).toBe('0:00')
  })

  it('synchronizes the custom controls from the native audio engine', () => {
    const {component} = createComponent('https://cdn.test/audio.mp3')
    const audio = {
      duration: 12,
      currentTime: 3,
      paused: false,
      ended: false,
      muted: true,
    } as HTMLAudioElement
    ;(component as any).audioElement = {nativeElement: audio}

    ;(component as any).syncAudioState()

    expect((component as any).duration).toBe(12)
    expect((component as any).currentTime).toBe(3)
    expect((component as any).isPlaying).toBeTrue()
    expect((component as any).isMuted).toBeTrue()
    expect((component as any).playbackPercent).toBe(25)
  })

  it('delegates play, pause, mute, and seek to the native audio engine', () => {
    const {component} = createComponent('https://cdn.test/audio.mp3')
    const audio = {
      duration: 12,
      currentTime: 0,
      paused: false,
      ended: false,
      muted: false,
      pause: jasmine.createSpy('pause'),
      play: jasmine.createSpy('play').and.resolveTo(),
    } as unknown as HTMLAudioElement
    ;(component as any).audioElement = {nativeElement: audio}

    ;(component as any).togglePlay()
    expect(audio.pause).toHaveBeenCalled()

    ;(audio as any).paused = true
    ;(component as any).togglePlay()
    expect(audio.play).toHaveBeenCalled()

    ;(component as any).toggleMuted()
    expect(audio.muted).toBeTrue()

    ;(component as any).seekTo({currentTarget: {valueAsNumber: 20}} as unknown as Event)
    expect(audio.currentTime).toBe(12)
  })

  it('disables custom controls while uploading or after a media error', () => {
    const {component} = createComponent('local://audio')

    ;(component as any).uploadInProgress = true
    ;(component as any).uploadProgress = 42
    expect((component as any).isUploading).toBeTrue()
    expect((component as any).playerDisabled).toBeTrue()

    ;(component as any).uploadInProgress = false
    ;(component as any).uploadProgress = 100
    ;(component as any).onAudioError()
    expect((component as any).isUploading).toBeFalse()
    expect((component as any).playerDisabled).toBeTrue()
  })
})
