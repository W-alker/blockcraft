import {Subject} from 'rxjs'
import {BlockCraftAwareness} from './awa'
import {ISelectionJSON} from '../framework'

class AwarenessHarness {
  readonly states = new Map<number, any>()
  readonly setLocalStateField = jasmine.createSpy('setLocalStateField')
  private changeHandler: ((changes: any, origin: any) => void) | null = null

  getStates() {
    return this.states
  }

  on(eventName: string, handler: (changes: any, origin: any) => void) {
    if (eventName === 'change') this.changeHandler = handler
  }

  off(eventName: string, handler: (changes: any, origin: any) => void) {
    if (eventName === 'change' && this.changeHandler === handler) this.changeHandler = null
  }

  emitChange(changes: any, origin = 'remote') {
    this.changeHandler?.(changes, origin)
  }
}

describe('BlockCraftAwareness cursor view reconciliation', () => {
  it('rebuilds a related remote cursor only when an inline rerender detached it', async () => {
    const selectionChange$ = new Subject<any>()
    const onTextUpdate$ = new Subject<any>()
    const onDestroy$ = new Subject<void>()
    const overlays: HTMLElement[] = []
    const caretRectSpies: jasmine.Spy[] = []
    const scrollContainer = document.createElement('div')
    scrollContainer.style.position = 'relative'
    scrollContainer.style.overflow = 'auto'
    const rootHost = document.createElement('div')
    rootHost.setAttribute('data-blockcraft-root', 'true')
    rootHost.style.position = 'relative'
    Object.defineProperty(scrollContainer, 'clientWidth', {configurable: true, value: 300})
    Object.defineProperty(scrollContainer, 'clientHeight', {configurable: true, value: 200})
    const scrollRectSpy = spyOn(scrollContainer, 'getBoundingClientRect').and.returnValue({
      left: 10,
      top: 20,
      right: 310,
      bottom: 220,
      width: 300,
      height: 200,
    } as DOMRect)
    const clippedBlock = document.createElement('div')
    clippedBlock.style.position = 'relative'
    clippedBlock.style.overflow = 'hidden'
    rootHost.appendChild(clippedBlock)
    scrollContainer.appendChild(rootHost)
    document.body.appendChild(scrollContainer)
    const createFakeRange = jasmine.createSpy('createFakeRange').and.callFake(() => {
      const overlay = document.createElement('span')
      const caret = document.createElement('span')
      overlay.appendChild(caret)
      clippedBlock.appendChild(overlay)
      const caretRectSpy = spyOn(caret, 'getBoundingClientRect').and.returnValue({
        left: 50,
        top: 60,
        right: 52,
        bottom: 78,
        width: 2,
        height: 18,
      } as DOMRect)
      caretRectSpies.push(caretRectSpy)
      overlays.push(overlay)
      return {
        fakeSpans: [overlay],
        get hasLostRenderedSpans() {
          return !overlay.isConnected
        },
        destroy: () => overlay.remove(),
      }
    })
    const doc = {
      selection: {selectionChange$, createFakeRange},
      crud: {onTextUpdate$},
      onDestroy$,
      afterInit: (callback: (root: any) => void) => callback({hostElement: rootHost}),
      onDestroy: (callback: () => void) => onDestroy$.subscribe(callback),
      scrollContainer: null,
      config: {},
      queryBlocksBetween: jasmine.createSpy('queryBlocksBetween').and.returnValue([]),
      logger: {warn: jasmine.createSpy('warn')},
    }
    const awareness = new AwarenessHarness()
    const manager = new BlockCraftAwareness(doc as any, awareness as any)
    manager.setLocalUser({id: 'local', name: 'Local'})

    const cursor: ISelectionJSON = {
      anchor: {blockId: 'p1', type: 'text', offset: 2},
      head: {blockId: 'p1', type: 'text', offset: 2},
      commonParent: 'p1',
    }
    awareness.states.set(7, {
      user: {id: 'remote', name: 'Remote'},
      cursor,
    })
    awareness.emitChange({added: [7], updated: [], removed: []})
    expect(createFakeRange).toHaveBeenCalledTimes(1)
    const labelLayer = document.body.querySelector<HTMLElement>('[data-blockcraft-cursor-label-layer="true"]')
    const label = labelLayer?.querySelector('.blockcraft-cursor-tag') as HTMLElement | null
    expect(labelLayer).not.toBeNull()
    expect(label).not.toBeNull()
    expect(clippedBlock.contains(label)).toBeFalse()
    expect(labelLayer!.contains(label)).toBeTrue()
    expect(label!.style.left).toBe('40px')
    expect(label!.style.top).toBe('40px')
    expect(labelLayer!.style.left).toBe('10px')
    expect(labelLayer!.style.top).toBe('20px')
    expect(labelLayer!.style.width).toBe('300px')
    expect(labelLayer!.style.height).toBe('200px')

    const readsBeforeScroll = caretRectSpies[0].calls.count()
    const boundaryReadsBeforeScroll = scrollRectSpy.calls.count()
    scrollContainer.dispatchEvent(new Event('scroll'))
    scrollContainer.dispatchEvent(new Event('scroll'))
    scrollContainer.dispatchEvent(new Event('scroll'))
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    expect(caretRectSpies[0].calls.count()).toBe(readsBeforeScroll + 1)
    expect(scrollRectSpy.calls.count()).toBe(boundaryReadsBeforeScroll)

    onTextUpdate$.next({transactions: [{block: {id: 'p1'}}]})
    await Promise.resolve()
    expect(createFakeRange).toHaveBeenCalledTimes(1)

    overlays[0].remove()
    onTextUpdate$.next({transactions: [{block: {id: 'other'}}]})
    await Promise.resolve()
    expect(createFakeRange).toHaveBeenCalledTimes(1)

    onTextUpdate$.next({transactions: [{block: {id: 'p1'}}]})
    await Promise.resolve()
    expect(createFakeRange).toHaveBeenCalledTimes(2)
    expect(overlays[1].isConnected).toBeTrue()

    onDestroy$.next()
    expect(document.body.querySelector('[data-blockcraft-cursor-label-layer="true"]')).toBeNull()
    overlays.forEach(overlay => overlay.remove())
    scrollContainer.remove()
    selectionChange$.complete()
    onTextUpdate$.complete()
    onDestroy$.complete()
  })
})
