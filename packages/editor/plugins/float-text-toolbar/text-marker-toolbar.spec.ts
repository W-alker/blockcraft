import {fakeAsync, tick} from '@angular/core/testing'
import {Subject, Subscription, filter, take, takeUntil} from 'rxjs'
import {TextMarkerPlugin} from './text-marker-toolbar'

type EventRegistration = {
  name: string
  flavour?: string
  handler: (...args: any[]) => unknown
  removed: boolean
}

type OverlaySession = {
  close$: Subject<unknown>
  onDestroy?: () => void
  closed: boolean
  overlayRef: {dispose: jasmine.Spy; hasAttached: jasmine.Spy; detachments: () => Subject<void>}
  componentRef: {setInput: jasmine.Spy}
}

function createHarness() {
  const selection$ = new Subject<any>()
  const readonly$ = new Subject<boolean>()
  const readonlyState$ = new Subject<void>()
  const destroyed$ = new Subject<void>()
  const subscriptions = new Subscription()
  const registrations: EventRegistration[] = []
  const sessions: OverlaySession[] = []
  const scrollContainer = document.createElement('div')
  scrollContainer.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600)
  document.body.appendChild(scrollContainer)
  const makeBlock = (id: string, flavour: string) => {
    const hostElement = document.createElement('pre')
    hostElement.getBoundingClientRect = () => new DOMRect(20, 100, 500, 200)
    scrollContainer.appendChild(hostElement)
    return {
      id, flavour, nodeType: 'editable', props: {}, hostElement,
      textLength: 20,
      textDeltas: () => [{insert: 'const value = true;\n'}],
      onTextChange: new Subject<any>(),
      onDestroy$: new Subject<void>(),
    }
  }
  const owner = makeBlock('code-1', 'code')
  const other = makeBlock('paragraph-1', 'paragraph')
  const liveIds = new Set(['root', owner.id, other.id])
  const makeSelection = (start = 0, end = 5, block = owner) => {
    const anchor = {blockId: block.id, type: 'text', offset: start, block}
    const head = {blockId: block.id, type: 'text', offset: end, block}
    return {
      anchor, head, start: anchor, end: head,
      collapsed: start === end,
      isAllSelected: false,
      isEmpty: false,
      isInSameBlock: true,
      commonParent: 'root',
      direction: 'forward',
      firstBlock: block,
      lastBlock: block,
      getDirection: () => 'forward',
      toJSON: () => ({
        anchor: {blockId: block.id, type: 'text', offset: start},
        head: {blockId: block.id, type: 'text', offset: end},
        commonParent: 'root',
      }),
    }
  }
  const selectionValue: {current: any} = {current: makeSelection()}
  const isSelectionReadonly = jasmine.createSpy('isSelectionReadonly').and.returnValue(false)
  const createConnectedOverlay = jasmine.createSpy('createConnectedOverlay').and.callFake((
    _options: unknown,
    close$: Subject<unknown>,
    onDestroy?: () => void,
  ) => {
    const detached$ = new Subject<void>()
    let detached = false
    const session: OverlaySession = {
      close$, onDestroy, closed: false,
      overlayRef: {
        dispose: jasmine.createSpy('dispose').and.callFake(() => {
          if (detached) return
          detached = true
          detached$.next()
          detached$.complete()
        }),
        hasAttached: jasmine.createSpy('hasAttached').and.callFake(() => !detached),
        detachments: () => detached$,
      },
      componentRef: {setInput: jasmine.createSpy('setInput')},
    }
    sessions.push(session)
    // Match the real service: one close notification invokes the supplied
    // callback before disposing; backdrop/readonly/document teardown use it too.
    subscriptions.add(close$.pipe(take(1)).subscribe(() => {
      session.closed = true
      onDestroy?.()
      session.overlayRef.dispose()
    }))
    subscriptions.add(readonly$.pipe(filter(Boolean), takeUntil(close$)).subscribe(() => close$.next(true)))
    subscriptions.add(destroyed$.pipe(takeUntil(close$)).subscribe(() => close$.next(true)))
    return {overlayRef: session.overlayRef, componentRef: session.componentRef}
  })
  const doc = {
    isReadonly: false,
    scrollContainer,
    onDestroy$: destroyed$,
    readonlySwitch$: readonly$,
    model: {exists: (id: string) => liveIds.has(id)},
    selection: {
      get value() { return selectionValue.current },
      changeObserve: () => selection$,
      nextChangeObserve: () => selection$,
      getSelectionRects: () => [new DOMRect(40, 120, 120, 20)],
    },
    readonlyManager: {stateChange$: readonlyState$, isSelectionReadonly},
    inputManger: {
      compositionSession: {
        isActive: false,
        activeBlockId: null as string | null,
        phase: 'idle',
        get isIdle() { return this.phase === 'idle' },
      },
    },
    subscribeReadonlyChange: (callback: (readonly: boolean) => void) => readonly$.subscribe(callback),
    event: {
      status: {isComposing: false},
      add: (name: string, handler: EventRegistration['handler'], options?: {flavour?: string}) => {
        const registration = {name, handler, flavour: options?.flavour, removed: false}
        registrations.push(registration)
        return () => { registration.removed = true }
      },
    },
    overlayService: {createConnectedOverlay},
    getBlockById: (id: string) => id === owner.id ? owner : id === other.id ? other : undefined,
    queryBlocksBetween: () => [owner.id],
    isEditable: () => true,
  }
  const plugin = new TextMarkerPlugin(['paragraph'], ['code'])
  ;(plugin as any).doc = doc
  plugin.init()
  spyOn((plugin as any).utils, 'getCurrentCommonAttrs').and.returnValue({attrs: new Map(), colors: {}, props: {}})
  const select = (selection: any) => {
    selectionValue.current = selection
    selection$.next(selection)
  }
  const open = () => {
    plugin.onSelectEnd()
    return sessions.at(-1)!
  }
  const expectClosed = (session: OverlaySession) => {
    expect(session.closed).toBeTrue()
    expect(session.overlayRef.dispose).toHaveBeenCalled()
    expect((plugin as any).toolbarOvr).toBeFalsy()
    expect((plugin as any)._cpr).toBeFalsy()
  }
  const cleanup = () => {
    plugin.destroy()
    subscriptions.unsubscribe()
    selection$.complete()
    readonly$.complete()
    readonlyState$.complete()
    destroyed$.complete()
    owner.onTextChange.complete()
    other.onTextChange.complete()
    scrollContainer.remove()
  }
  return {
    plugin, doc, owner, other, liveIds, sessions, registrations, selection$, readonly$, readonlyState$,
    destroyed$, makeSelection, select, open, expectClosed, cleanup,
  }
}

describe('TextMarkerPlugin overlay lifecycle', () => {
  let harness: ReturnType<typeof createHarness>

  beforeEach(() => { harness = createHarness() })
  afterEach(() => { harness.cleanup() })

  it('opens one color-only overlay for repeated selectEnd on the same range', () => {
    const session = harness.open()
    harness.open()
    harness.plugin.openToolbar()
    expect(harness.sessions.length).toBe(1)
    expect(session.closed).toBeFalse()
    expect(session.componentRef.setInput).toHaveBeenCalledWith('colorOnly', true)
  })

  it('closes when the final selected range changes and can reopen', fakeAsync(() => {
    const session = harness.open()
    harness.select(harness.makeSelection(1, 7))
    tick(0)
    harness.expectClosed(session)
    const next = harness.open()
    expect(harness.sessions.length).toBe(2)
    expect(next.closed).toBeFalse()
    expect(next.close$).not.toBe(session.close$)
  }))

  it('keeps the overlay through same-task null and equivalent range restoration during coloring', fakeAsync(() => {
    const session = harness.open()
    harness.select(null)
    harness.owner.onTextChange.next({op: [{retain: 5, attributes: {'s:color': 'red'}}], tr: {local: true}})
    harness.select(harness.makeSelection())
    tick(0)
    expect(session.closed).toBeFalse()
    expect(session.overlayRef.dispose).not.toHaveBeenCalled()
    expect(harness.sessions.length).toBe(1)
  }))

  it('closes when null remains the final selection', fakeAsync(() => {
    const session = harness.open()
    harness.select(null)
    tick(0)
    harness.expectClosed(session)
  }))

  it('closes for a caret or a range moved into another block', fakeAsync(() => {
    const first = harness.open()
    harness.select(harness.makeSelection(3, 3))
    tick(0)
    harness.expectClosed(first)
    harness.select(harness.makeSelection())
    const second = harness.open()
    harness.select(harness.makeSelection(0, 5, harness.other))
    tick(0)
    harness.expectClosed(second)
  }))

  it('closes when the selected block becomes stale even if endpoints are unchanged', fakeAsync(() => {
    const session = harness.open()
    harness.liveIds.delete(harness.owner.id)
    harness.select(harness.makeSelection())
    tick(0)
    harness.expectClosed(session)
  }))

  for (const [name, op] of [
    ['insert', [{retain: 2}, {insert: '中文🙂'}]],
    ['delete', [{retain: 2}, {delete: 1}]],
    ['replacement', [{retain: 2}, {delete: 1}, {insert: '替换'}]],
  ] as const) {
    it(`closes immediately on an owner text ${name}, before a selection event`, () => {
      const session = harness.open()
      harness.owner.onTextChange.next({op, tr: {local: true}})
      harness.expectClosed(session)
    })
  }

  it('retains format-only and empty text events, but closes for remote content changes', () => {
    const session = harness.open()
    harness.owner.onTextChange.next({op: [], tr: {local: true}})
    harness.owner.onTextChange.next({op: [{retain: 2}, {retain: 4, attributes: {'s:background': 'yellow'}}], tr: {local: true}})
    harness.other.onTextChange.next({op: [{delete: 1}], tr: {local: false}})
    expect(session.closed).toBeFalse()
    harness.owner.onTextChange.next({op: [{insert: 'remote'}], tr: {local: false}})
    harness.expectClosed(session)
  })

  it('closes on compositionStart without consuming the framework input event', () => {
    const session = harness.open()
    const listeners = harness.registrations.filter(item => item.name === 'compositionStart' && item.flavour === 'code')
    expect(listeners.length).toBe(1)
    const event = new CompositionEvent('compositionstart', {data: '', cancelable: true})
    const result = listeners[0]?.handler({event, target: harness.owner})
    expect(result).not.toBeTrue()
    expect(event.defaultPrevented).toBeFalse()
    harness.expectClosed(session)
  })

  it('does not reopen during committing after native composing has ended', () => {
    const composition = harness.doc.inputManger.compositionSession
    expect(composition.isIdle).toBeTrue()
    expect(composition.activeBlockId).toBeNull()
    const initial = harness.open()
    expect(initial.closed).toBeFalse()
    composition.isActive = true
    composition.activeBlockId = harness.owner.id
    composition.phase = 'committing'
    harness.doc.event.status.isComposing = false
    expect(composition.isIdle).toBeFalse()
    harness.plugin.onSelectEnd()
    harness.plugin.openToolbar()
    harness.expectClosed(initial)
    expect(harness.sessions.length).toBe(1)
    composition.isActive = false
    composition.activeBlockId = null
    composition.phase = 'idle'
    expect(harness.open().closed).toBeFalse()
    expect(harness.sessions.length).toBe(2)
  })

  it('clears references for readonly and lock-state closure, then permits reopening', () => {
    const first = harness.open()
    harness.doc.isReadonly = true
    harness.readonly$.next(true)
    harness.expectClosed(first)
    harness.doc.isReadonly = false
    harness.readonly$.next(false)
    const second = harness.open()
    harness.doc.readonlyManager.isSelectionReadonly.and.returnValue(true)
    harness.readonlyState$.next()
    harness.expectClosed(second)
    harness.doc.readonlyManager.isSelectionReadonly.and.returnValue(false)
    expect(harness.open().closed).toBeFalse()
    expect(harness.sessions.length).toBe(3)
  })

  it('clears references when the overlay service closes from its backdrop', () => {
    const session = harness.open()
    session.close$.next(true)
    harness.expectClosed(session)
    expect(harness.open()).not.toBe(session)
    expect(harness.sessions.length).toBe(2)
  })

  it('clears references when the overlay service handles document teardown', () => {
    const session = harness.open()
    harness.destroyed$.next()
    harness.expectClosed(session)
  })

  it('closes the session when CDK disposes its overlay directly and can reopen', () => {
    const session = harness.open()
    session.overlayRef.dispose()
    harness.expectClosed(session)
    expect(harness.open()).not.toBe(session)
    expect(harness.sessions.length).toBe(2)
  })

  it('does not let a delayed old-session callback close or detach the new overlay', fakeAsync(() => {
    const previous = harness.open()
    harness.select(harness.makeSelection(1, 6))
    tick(0)
    harness.expectClosed(previous)
    const current = harness.open()
    previous.onDestroy?.()
    previous.close$.next(true)
    expect(current.closed).toBeFalse()
    expect(current.overlayRef.dispose).not.toHaveBeenCalled()
    harness.plugin.openToolbar()
    expect(harness.sessions.length).toBe(2)
    harness.owner.onTextChange.next({op: [{delete: 1}], tr: {local: true}})
    harness.expectClosed(current)
  }))

  it('destroys the active session and removes every listener and pending range check', fakeAsync(() => {
    const session = harness.open()
    harness.select(harness.makeSelection(1, 6))
    harness.plugin.destroy()
    tick(0)
    harness.expectClosed(session)
    expect(harness.registrations.length).toBeGreaterThan(0)
    expect(harness.registrations.every(item => item.removed)).toBeTrue()
    harness.select(harness.makeSelection())
    harness.owner.onTextChange.next({op: [{insert: 'later'}], tr: {local: true}})
    harness.readonly$.next(true)
    tick(0)
    expect(harness.sessions.length).toBe(1)
  }))
})
