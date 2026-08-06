import {waitForPaginationRenderStable} from './render-stability'

describe('waitForPaginationRenderStable', () => {
  it('resolves after the requested quiet frames', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)

    await waitForPaginationRenderStable(root, {quietFrames: 1, timeoutMs: 1000})

    expect(root.isConnected).toBeTrue()
    root.remove()
  })

  it('fails with layout-not-ready when the timeout is exhausted', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)

    await expectAsync(waitForPaginationRenderStable(root, {timeoutMs: 0}))
      .toBeRejectedWith(jasmine.objectContaining({code: 'layout-not-ready'}))

    root.remove()
  })

  it('stops immediately when the export is aborted', async () => {
    const root = document.createElement('div')
    const abort = new AbortController()
    abort.abort()

    await expectAsync(waitForPaginationRenderStable(root, {}, abort.signal))
      .toBeRejectedWith(jasmine.objectContaining({code: 'aborted'}))
  })
})
