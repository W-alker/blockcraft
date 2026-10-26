import {BlockLinkNavigator} from './block-link-navigator'

describe('BlockLinkNavigator', () => {
  function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>(settle => {
      resolve = settle
    })
    return {promise, resolve}
  }

  function createHarness(href = 'https://example.test/document/1?room=alpha#editor') {
    let currentHref = href
    const listeners = new Set<EventListenerOrEventListenerObject>()
    const pushState = jasmine.createSpy('pushState').and.callFake(
      (_state: unknown, _title: string, url?: string | URL | null) => {
        if (url != null) currentHref = new URL(String(url), currentHref).href
      },
    )
    const browserWindow = {
      get location() {
        return {href: currentHref}
      },
      history: {pushState},
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === 'popstate') listeners.add(listener)
      },
      removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === 'popstate') listeners.delete(listener)
      },
      setTimeout: window.setTimeout.bind(window),
      clearTimeout: window.clearTimeout.bind(window),
    }
    const rootHost = document.createElement('div')
    const targetHosts = new Map<string, HTMLElement>()
    for (const id of ['first', 'second', 'target']) {
      const host = document.createElement('div')
      host.dataset['blockId'] = id
      rootHost.append(host)
      targetHosts.set(id, host)
    }
    const navigateToBlock = jasmine.createSpy('navigateToBlock').and.resolveTo(true)
    const selection = {value: {anchor: {blockId: 'stable'}}}
    const doc = {
      navigateToBlock,
      root: {hostElement: rootHost},
      vm: {
        get: (id: string) => {
          const hostElement = targetHosts.get(id)
          return hostElement ? {instance: {hostElement}} : undefined
        },
      },
      selection,
    }
    const navigator = new BlockLinkNavigator(doc as any, browserWindow as any)
    const emitPopState = () => {
      const event = new PopStateEvent('popstate')
      listeners.forEach(listener => {
        if (typeof listener === 'function') listener(event)
        else listener.handleEvent(event)
      })
    }

    return {
      browserWindow,
      doc,
      emitPopState,
      get href() {
        return currentHref
      },
      listeners,
      navigateToBlock,
      navigator,
      pushState,
      selection,
      targetHosts,
    }
  }

  it('builds a current-document URL and replaces only blockId', () => {
    const h = createHarness('https://example.test/document/1?room=alpha&blockId=old#editor')

    const url = new URL(h.navigator.createBlockLink('next id'))

    expect(url.origin + url.pathname).toBe('https://example.test/document/1')
    expect(url.searchParams.get('room')).toBe('alpha')
    expect(url.searchParams.get('blockId')).toBe('next id')
    expect(url.hash).toBe('#editor')
  })

  it('navigates an initial URL target and preserves selection', async () => {
    const h = createHarness('https://example.test/document/1?room=alpha&blockId=target#editor')
    const selectionBefore = h.selection.value

    expect(await h.navigator.navigateFromCurrentUrl()).toBeTrue()

    expect(h.navigateToBlock).toHaveBeenCalledOnceWith('target')
    expect(h.targetHosts.get('target')?.getAttribute('data-bc-block-link-target'))
      .toBe('true')
    expect(h.selection.value).toBe(selectionBefore)
    h.navigator.destroy()
  })

  it('intercepts same-document block links without changing the current URL', async () => {
    const h = createHarness()
    const local = 'https://example.test/document/1?room=alpha&blockId=target#editor'
    const external = 'https://example.test/document/2?room=alpha&blockId=target#editor'
    const hrefBefore = h.href

    expect(h.navigator.openBlockLink(local)).toBeTrue()
    await Promise.resolve()
    expect(h.pushState).not.toHaveBeenCalled()
    expect(h.href).toBe(hrefBefore)
    expect(h.navigateToBlock).toHaveBeenCalledOnceWith('target')
    expect(h.navigator.openBlockLink(external)).toBeFalse()
    h.navigator.destroy()
  })

  it('highlights only the newest rapid navigation target', async () => {
    const h = createHarness()
    const first = deferred<boolean>()
    const second = deferred<boolean>()
    h.navigateToBlock.and.callFake((id: string) =>
      id === 'first' ? first.promise : second.promise,
    )

    expect(h.navigator.openBlockLink(
      'https://example.test/document/1?room=alpha&blockId=first#editor',
    )).toBeTrue()
    expect(h.navigator.openBlockLink(
      'https://example.test/document/1?room=alpha&blockId=second#editor',
    )).toBeTrue()

    second.resolve(true)
    await Promise.resolve()
    first.resolve(true)
    await Promise.resolve()

    expect(h.targetHosts.get('first')?.hasAttribute('data-bc-block-link-target'))
      .toBeFalse()
    expect(h.targetHosts.get('second')?.getAttribute('data-bc-block-link-target'))
      .toBe('true')
    h.navigator.destroy()
  })

  it('listens to popstate and removes transient state on destroy', async () => {
    const h = createHarness('https://example.test/document/1?blockId=target#editor')
    h.navigator.start()
    await Promise.resolve()

    expect(h.listeners.size).toBe(1)
    expect(h.navigateToBlock).toHaveBeenCalledOnceWith('target')
    expect(h.targetHosts.get('target')?.hasAttribute('data-bc-block-link-target'))
      .toBeTrue()

    h.emitPopState()
    await Promise.resolve()
    expect(h.navigateToBlock).toHaveBeenCalledTimes(2)

    h.navigator.destroy()
    expect(h.listeners.size).toBe(0)
    expect(h.targetHosts.get('target')?.hasAttribute('data-bc-block-link-target'))
      .toBeFalse()
  })
})
