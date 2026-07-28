import {BehaviorSubject, Subject} from 'rxjs'
import {BlockNavigationManager} from './block-navigation-manager'

describe('BlockNavigationManager', () => {
  function createHarness(virtualizationEnabled = true) {
    const afterInit$ = new BehaviorSubject<any>(null)
    const onDestroy$ = new Subject<void>()
    const rootHost = document.createElement('div')
    const targetHost = document.createElement('div')
    rootHost.append(targetHost)
    const scrollIntoView = spyOn(targetHost, 'scrollIntoView')
    let initialized = false
    const modelIds = new Set(['target', 'second'])
    const selection = {value: {anchor: 'stable-selection'}}
    const virtualization = {
      enabled: virtualizationEnabled,
      scrollToBlock: jasmine.createSpy('scrollToBlock').and.resolveTo(true),
    }
    const doc = {
      get isInitialized() {
        return initialized
      },
      afterInit$,
      onDestroy$,
      root: {hostElement: rootHost},
      model: {exists: (id: string) => modelIds.has(id)},
      vm: {
        get: (id: string) => id === 'target' || id === 'second'
          ? {instance: {hostElement: targetHost}}
          : undefined,
      },
      virtualization,
      selection,
      logger: {warn: jasmine.createSpy('warn')},
    }
    const initialize = () => {
      initialized = true
      afterInit$.next(doc.root)
    }

    return {
      afterInit$,
      doc,
      initialize,
      manager: new BlockNavigationManager(doc as any),
      modelIds,
      onDestroy$,
      scrollIntoView,
      selection,
      virtualization,
    }
  }

  it('waits for document initialization before virtual navigation', async () => {
    const h = createHarness()
    const pending = h.manager.navigateToBlock('target')

    expect(h.virtualization.scrollToBlock).not.toHaveBeenCalled()
    h.initialize()

    expect(await pending).toBeTrue()
    expect(h.virtualization.scrollToBlock).toHaveBeenCalledOnceWith('target')
  })

  it('settles a superseded pre-init request immediately', async () => {
    const h = createHarness()
    const first = h.manager.navigateToBlock('target')
    const second = h.manager.navigateToBlock('second')

    expect(await first).toBeFalse()
    h.initialize()

    expect(await second).toBeTrue()
    expect(h.virtualization.scrollToBlock).toHaveBeenCalledOnceWith('second')
  })

  it('shares one initialization waiter across rapid pre-init requests', async () => {
    const h = createHarness()
    const pending = Array.from({length: 32}, (_, index) =>
      h.manager.navigateToBlock(index === 31 ? 'target' : 'second'),
    )

    expect(h.afterInit$.observers.length).toBe(1)
    h.initialize()

    const results = await Promise.all(pending)
    expect(results.slice(0, -1).every(result => result === false)).toBeTrue()
    expect(results[results.length - 1]).toBeTrue()
    expect(h.afterInit$.observers.length).toBe(0)
    expect(h.virtualization.scrollToBlock).toHaveBeenCalledOnceWith('target')
  })

  it('uses the mounted full-render view without changing selection', async () => {
    const h = createHarness(false)
    h.initialize()
    const selectionBefore = h.selection.value

    expect(await h.manager.navigateToBlock('target')).toBeTrue()
    expect(h.scrollIntoView).toHaveBeenCalledOnceWith({
      behavior: 'auto',
      block: 'center',
      inline: 'nearest',
    })
    expect(h.selection.value).toBe(selectionBefore)
    expect(h.virtualization.scrollToBlock).not.toHaveBeenCalled()
  })

  it('fails closed for a missing full-render target', async () => {
    const h = createHarness(false)
    h.initialize()

    expect(await h.manager.navigateToBlock('missing')).toBeFalse()
    expect(h.scrollIntoView).not.toHaveBeenCalled()
    expect(h.doc.logger.warn).not.toHaveBeenCalled()
  })

  it('settles an initialization waiter when destroyed', async () => {
    const h = createHarness()
    const pending = h.manager.navigateToBlock('target')

    h.manager.destroy()

    expect(await pending).toBeFalse()
    expect(h.virtualization.scrollToBlock).not.toHaveBeenCalled()
  })
})
