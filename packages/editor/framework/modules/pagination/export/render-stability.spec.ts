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

  it('observes final print boundaries instead of every nested block clone', async () => {
    const root = document.createElement('div')
    root.className = 'bc-print-root'
    root.dataset['bcPrintRoot'] = 'true'
    const nestedBlocks: HTMLElement[] = []
    for (let pageIndex = 0; pageIndex < 6; pageIndex++) {
      const page = document.createElement('div')
      page.className = 'bc-print-page'
      const content = document.createElement('div')
      content.className = 'bc-print-content'
      const fragment = document.createElement('div')
      fragment.className = 'bc-print-frag'
      for (let index = 0; index < 200; index++) {
        const block = document.createElement('div')
        block.dataset['blockId'] = `p${pageIndex}-nested-${index}`
        fragment.appendChild(block)
        nestedBlocks.push(block)
      }
      content.appendChild(fragment)
      page.appendChild(content)
      root.appendChild(page)
    }
    document.body.appendChild(root)

    const observed: Element[] = []
    const originalResizeObserver = window.ResizeObserver
    class BoundaryResizeObserver {
      constructor(_callback: ResizeObserverCallback) {}
      observe(target: Element): void { observed.push(target) }
      unobserve(_target: Element): void {}
      disconnect(): void {}
    }
    Object.defineProperty(window, 'ResizeObserver', {
      configurable: true,
      value: BoundaryResizeObserver,
    })

    try {
      await waitForPaginationRenderStable(root, {
        quietFrames: 2,
        timeoutMs: 1000,
      })
      expect(observed.length).toBe(19)
      expect(observed).not.toContain(nestedBlocks[0]!)
    } finally {
      Object.defineProperty(window, 'ResizeObserver', {
        configurable: true,
        value: originalResizeObserver,
      })
      root.remove()
    }
  })

  it('still waits for descendant DOM content to become quiet', async () => {
    const root = document.createElement('div')
    root.className = 'bc-print-root'
    root.dataset['bcPrintRoot'] = 'true'
    const page = document.createElement('div')
    page.className = 'bc-print-page'
    const content = document.createElement('div')
    content.className = 'bc-print-content'
    const fragment = document.createElement('div')
    const nested = document.createElement('span')
    fragment.appendChild(nested)
    content.appendChild(fragment)
    page.appendChild(content)
    root.appendChild(page)
    document.body.appendChild(root)

    let churn = true
    const mutateNestedContent = () => {
      if (!churn) return
      nested.toggleAttribute('data-test-churn')
      requestAnimationFrame(mutateNestedContent)
    }
    requestAnimationFrame(mutateNestedContent)

    try {
      await expectAsync(waitForPaginationRenderStable(root, {
        quietFrames: 2,
        timeoutMs: 80,
      })).toBeRejectedWith(jasmine.objectContaining({code: 'layout-not-ready'}))
    } finally {
      churn = false
      root.remove()
    }
  })
})
