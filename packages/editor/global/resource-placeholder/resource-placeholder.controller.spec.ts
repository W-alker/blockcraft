import {
  ResourcePlaceholderAdapter,
  ResourcePlaceholderController,
} from './index'

describe('ResourcePlaceholderController', () => {
  it('coordinates loading, error, retry, ready, and cleanup on one stable frame', () => {
    const frame = document.createElement('div')
    const image = document.createElement('img')
    frame.append(image)
    const handlers: {
      ready?: () => void
      error?: () => void
    } = {}
    const retry = jasmine.createSpy('retry')
    const states: string[] = []
    const adapter: ResourcePlaceholderAdapter<HTMLImageElement> = {
      kind: 'test-image',
      subscribe: (_element, nextHandlers) => {
        handlers.ready = nextHandlers.ready
        handlers.error = nextHandlers.error
        return () => {
          handlers.ready = undefined
          handlers.error = undefined
        }
      },
      isReady: () => false,
      readIntrinsicSize: () => ({width: 640, height: 360, ar: 16 / 9}),
      retry,
    }
    const intrinsicSize = jasmine.createSpy('intrinsicSize')
    const controller = new ResourcePlaceholderController(frame, {
      onStateChange: state => states.push(state),
      onIntrinsicSize: intrinsicSize,
    })

    controller.bind({
      element: image,
      adapter,
      resourceKey: 'image-a',
    })
    expect(controller.state).toBe('loading')

    handlers.error?.()
    expect(controller.state).toBe('error')

    frame.querySelector<HTMLButtonElement>('.bc-resource-placeholder__retry')!
      .click()
    expect(retry).toHaveBeenCalledOnceWith(image)
    expect(controller.state).toBe('loading')

    handlers.ready?.()
    expect(controller.state).toBe('ready')
    expect(intrinsicSize).toHaveBeenCalledOnceWith({
      width: 640,
      height: 360,
      ar: 16 / 9,
    })

    controller.destroy()
    expect(frame.classList.contains('bc-resource-placeholder-frame')).toBeFalse()
    expect(frame.querySelector('.bc-resource-placeholder')).toBeNull()
    expect(states).toContain('error')
  })
})
