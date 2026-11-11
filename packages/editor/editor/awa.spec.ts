import {BehaviorSubject, Subject} from 'rxjs'
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
  it('defers virtual window reads until a pre-init document finishes initialization', () => {
    const selectionChange$ = new Subject<any>()
    const onTextUpdate$ = new Subject<any>()
    const onDestroy$ = new Subject<void>()
    const viewChange$ = new Subject<{mountedRootIds: readonly string[]}>()
    const structureChange$ = new Subject<void>()
    const afterInitCallbacks: Array<(root: any) => void> = []
    const scrollContainer = document.createElement('div')
    const rootHost = document.createElement('div')
    scrollContainer.appendChild(rootHost)
    document.body.appendChild(scrollContainer)

    let initialized = false
    let mountedRootIds: readonly string[] = []
    const getMountedRootChildIds = jasmine.createSpy('getMountedRootChildIds').and.callFake(() => {
      if (!initialized) throw new Error('Doc not init yet')
      return [...mountedRootIds]
    })
    const editableBlock = {
      id: 'a-child',
      textLength: 2,
      runtime: {textLength: 2},
    }
    const createSelection = jasmine.createSpy('createSelection').and.returnValue({
      start: {blockId: 'a-child', type: 'text', offset: 2, block: editableBlock},
      end: {blockId: 'a-child', type: 'text', offset: 2, block: editableBlock},
      firstBlockId: 'a-child',
      lastBlockId: 'a-child',
      isInSameBlock: true,
      contains: (blockId: string) => blockId === 'a' || blockId === 'a-child',
    })
    const createFakeRange = jasmine.createSpy('createFakeRange').and.callFake(() => {
      const overlay = document.createElement('span')
      overlay.appendChild(document.createElement('span'))
      rootHost.appendChild(overlay)
      return {
        fakeSpans: [overlay],
        hasLostRenderedSpans: false,
        destroy: () => overlay.remove(),
      }
    })
    const doc = {
      rootId: 'root',
      get isInitialized() {
        return initialized
      },
      selection: {selectionChange$, createSelection, createFakeRange},
      crud: {onTextUpdate$},
      onDestroy$,
      afterInit: (callback: (root: any) => void) => afterInitCallbacks.push(callback),
      scrollContainer,
      config: {},
      virtualization: {enabled: true, viewChange$},
      vm: {
        getMountedRootChildIds,
        isMounted: (id: string) => id === 'a-child' && mountedRootIds.includes('a'),
      },
      model: {
        structureChange$,
        getTextLength: () => 2,
        getPath: (id: string) => {
          if (id === 'a' || id === 'a-child') return ['root', 'a', ...(id === 'a-child' ? ['a-child'] : [])]
          return null
        },
      },
      getBlockById: () => editableBlock,
      isEditable: () => true,
      queryBlocksBetween: jasmine.createSpy('queryBlocksBetween').and.returnValue([]),
      logger: {warn: jasmine.createSpy('warn')},
    }
    const awareness = new AwarenessHarness()
    let manager: BlockCraftAwareness | null = null

    try {
      expect(() => {
        manager = new BlockCraftAwareness(doc as any, awareness as any)
      }).not.toThrow()
      expect(getMountedRootChildIds).not.toHaveBeenCalled()

      manager!.setLocalUser({id: 'local', name: 'Local'})
      const cursor: ISelectionJSON = {
        anchor: {blockId: 'a-child', type: 'text', offset: 2},
        head: {blockId: 'a-child', type: 'text', offset: 2},
        commonParent: 'a-child',
      }
      awareness.states.set(7, {
        user: {id: 'remote', name: 'Remote'},
        cursor,
      })
      awareness.emitChange({added: [7], updated: [], removed: []})
      expect(createSelection).not.toHaveBeenCalled()

      initialized = true
      afterInitCallbacks.forEach(callback => callback({hostElement: rootHost}))
      expect(createSelection).toHaveBeenCalledTimes(1)
      expect(createFakeRange).not.toHaveBeenCalled()

      mountedRootIds = ['a']
      viewChange$.next({mountedRootIds})
      expect(createFakeRange).toHaveBeenCalledTimes(1)
    } finally {
      const managerToDestroy = manager as BlockCraftAwareness | null
      managerToDestroy?.destroy()
      scrollContainer.remove()
      selectionChange$.complete()
      onTextUpdate$.complete()
      onDestroy$.complete()
      viewChange$.complete()
      structureChange$.complete()
    }
  })

  it('rebuilds a related remote cursor only when an inline rerender detached it', async () => {
    const selectionChange$ = new Subject<any>()
    const onTextUpdate$ = new Subject<any>()
    const onDestroy$ = new Subject<void>()
    const overlays: HTMLElement[] = []
    const renderedSelections: ISelectionJSON[] = []
    const caretRectSpies: jasmine.Spy[] = []
    let textLength = 3
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
    const editableBlock = {
      id: 'p1',
      get textLength() {
        return textLength
      },
      runtime: {
        get textLength() {
          return textLength
        },
      },
    }
    const createSelection = jasmine.createSpy('createSelection').and.callFake((selection: ISelectionJSON) => ({
      ...selection,
      start: {...selection.anchor, block: editableBlock},
      end: {...selection.head, block: editableBlock},
      firstBlockId: 'p1',
      lastBlockId: 'p1',
      isInSameBlock: true,
    }))
    const createFakeRange = jasmine.createSpy('createFakeRange').and.callFake((selection: any) => {
      renderedSelections.push(selection)
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
      selection: {selectionChange$, createSelection, createFakeRange},
      crud: {onTextUpdate$},
      onDestroy$,
      afterInit: (callback: (root: any) => void) => callback({hostElement: rootHost}),
      onDestroy: (callback: () => void) => onDestroy$.subscribe(callback),
      scrollContainer: null,
      config: {},
      model: {
        getTextLength: () => textLength,
      },
      getBlockById: () => editableBlock,
      isEditable: () => true,
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
    textLength = 1
    onTextUpdate$.next({transactions: [{block: {id: 'other'}}]})
    await Promise.resolve()
    expect(createFakeRange).toHaveBeenCalledTimes(1)

    onTextUpdate$.next({transactions: [{block: {id: 'p1'}}]})
    await Promise.resolve()
    expect(createFakeRange).toHaveBeenCalledTimes(2)
    expect(renderedSelections[1].anchor).toEqual({blockId: 'p1', type: 'text', offset: 1})
    expect(renderedSelections[1].head).toEqual({blockId: 'p1', type: 'text', offset: 1})
    expect(doc.logger.warn).not.toHaveBeenCalled()
    expect(overlays[1].isConnected).toBeTrue()

    onDestroy$.next()
    expect(document.body.querySelector('[data-blockcraft-cursor-label-layer="true"]')).toBeNull()
    overlays.forEach(overlay => overlay.remove())
    scrollContainer.remove()
    selectionChange$.complete()
    onTextUpdate$.complete()
    onDestroy$.complete()
  })

  it('defers an unmappable cross-block cursor and retries after view sync', async () => {
    const selectionChange$ = new Subject<any>()
    const onTextUpdate$ = new Subject<any>()
    const onDestroy$ = new Subject<void>()
    const rootHost = document.createElement('div')
    document.body.appendChild(rootHost)
    let renderedTextLength = 9
    const blocks: Record<string, any> = {
      p1: {
        id: 'p1',
        textLength: 11,
        runtime: {
          get textLength() {
            return renderedTextLength
          },
        },
      },
      p2: {
        id: 'p2',
        textLength: 5,
        runtime: {textLength: 5},
      },
    }
    const normalizedSelection = {
      start: {blockId: 'p1', type: 'text', offset: 2, block: blocks['p1']},
      end: {blockId: 'p2', type: 'text', offset: 3, block: blocks['p2']},
      firstBlockId: 'p1',
      lastBlockId: 'p2',
      isInSameBlock: false,
    }
    const createSelection = jasmine.createSpy('createSelection').and.returnValue(normalizedSelection)
    const createFakeRange = jasmine.createSpy('createFakeRange').and.callFake(
      (selection: any) => {
        expect(selection).toBe(normalizedSelection)
        const overlay = document.createElement('span')
        overlay.appendChild(document.createElement('span'))
        rootHost.appendChild(overlay)
        return {
          fakeSpans: [overlay],
          hasLostRenderedSpans: false,
          destroy: () => overlay.remove(),
        }
      },
    )
    const doc = {
      selection: {selectionChange$, createSelection, createFakeRange},
      crud: {onTextUpdate$},
      onDestroy$,
      afterInit: (callback: (root: any) => void) => callback({hostElement: rootHost}),
      scrollContainer: null,
      config: {},
      model: {
        getTextLength: (id: string) => blocks[id].textLength,
      },
      getBlockById: (id: string) => blocks[id],
      isEditable: () => true,
      queryBlocksBetween: jasmine.createSpy('queryBlocksBetween').and.returnValue([]),
      logger: {warn: jasmine.createSpy('warn')},
    }
    const awareness = new AwarenessHarness()
    const manager = new BlockCraftAwareness(doc as any, awareness as any)
    manager.setLocalUser({id: 'local', name: 'Local'})

    try {
      const cursor: ISelectionJSON = {
        anchor: {blockId: 'p1', type: 'text', offset: 2},
        head: {blockId: 'p2', type: 'text', offset: 3},
        commonParent: 'root',
      }
      awareness.states.set(7, {
        user: {id: 'remote', name: 'Remote'},
        cursor,
      })
      awareness.emitChange({added: [7], updated: [], removed: []})

      expect(createFakeRange).not.toHaveBeenCalled()

      renderedTextLength = 11
      onTextUpdate$.next({transactions: [{block: {id: 'p1'}}]})
      await Promise.resolve()

      expect(createFakeRange).toHaveBeenCalledTimes(1)
      expect(doc.logger.warn).not.toHaveBeenCalled()
    } finally {
      manager.destroy()
      rootHost.remove()
      selectionChange$.complete()
      onTextUpdate$.complete()
      onDestroy$.complete()
    }
  })

  it('keeps an in-range collapsed cursor visible while its composing view is stale', () => {
    const selectionChange$ = new Subject<any>()
    const onTextUpdate$ = new Subject<any>()
    const onDestroy$ = new Subject<void>()
    const rootHost = document.createElement('div')
    document.body.appendChild(rootHost)
    const editableBlock = {
      id: 'p1',
      textLength: 11,
      runtime: {
        textLength: 9,
      },
    }
    const normalizedSelection = {
      start: {blockId: 'p1', type: 'text', offset: 4, block: editableBlock},
      end: {blockId: 'p1', type: 'text', offset: 4, block: editableBlock},
      firstBlockId: 'p1',
      lastBlockId: 'p1',
      isInSameBlock: true,
    }
    const createSelection = jasmine.createSpy('createSelection').and.returnValue(normalizedSelection)
    const createFakeRange = jasmine.createSpy('createFakeRange').and.callFake(() => {
      const overlay = document.createElement('span')
      overlay.appendChild(document.createElement('span'))
      rootHost.appendChild(overlay)
      return {
        fakeSpans: [overlay],
        hasLostRenderedSpans: false,
        destroy: () => overlay.remove(),
      }
    })
    const doc = {
      selection: {selectionChange$, createSelection, createFakeRange},
      crud: {onTextUpdate$},
      onDestroy$,
      afterInit: (callback: (root: any) => void) => callback({hostElement: rootHost}),
      scrollContainer: null,
      config: {},
      model: {
        getTextLength: () => 11,
      },
      getBlockById: () => editableBlock,
      isEditable: () => true,
      queryBlocksBetween: jasmine.createSpy('queryBlocksBetween').and.returnValue([]),
      logger: {warn: jasmine.createSpy('warn')},
    }
    const awareness = new AwarenessHarness()
    const manager = new BlockCraftAwareness(doc as any, awareness as any)
    manager.setLocalUser({id: 'local', name: 'Local'})

    try {
      const cursor: ISelectionJSON = {
        anchor: {blockId: 'p1', type: 'text', offset: 4},
        head: {blockId: 'p1', type: 'text', offset: 4},
        commonParent: 'p1',
      }
      awareness.states.set(7, {
        user: {id: 'remote', name: 'Remote'},
        cursor,
      })
      awareness.emitChange({added: [7], updated: [], removed: []})

      expect(createFakeRange).toHaveBeenCalledTimes(1)
      expect(doc.logger.warn).not.toHaveBeenCalled()
    } finally {
      manager.destroy()
      rootHost.remove()
      selectionChange$.complete()
      onTextUpdate$.complete()
      onDestroy$.complete()
    }
  })

  it('projects remote cursors only while their virtual root unit is mounted', () => {
    const selectionChange$ = new Subject<any>()
    const onTextUpdate$ = new Subject<any>()
    const onDestroy$ = new Subject<void>()
    const viewChange$ = new Subject<{mountedRootIds: readonly string[]}>()
    const structureChange$ = new Subject<void>()
    const scrollContainer = document.createElement('div')
    const rootHost = document.createElement('div')
    scrollContainer.appendChild(rootHost)
    document.body.appendChild(scrollContainer)

    let mountedRootIds: readonly string[] = ['other']
    const destroyedRanges: jasmine.Spy[] = []
    const createFakeRange = jasmine.createSpy('createFakeRange').and.callFake(() => {
      const overlay = document.createElement('span')
      const caret = document.createElement('span')
      overlay.appendChild(caret)
      rootHost.appendChild(overlay)
      const destroy = jasmine.createSpy('destroy').and.callFake(() => overlay.remove())
      destroyedRanges.push(destroy)
      return {
        fakeSpans: [overlay],
        hasLostRenderedSpans: false,
        destroy,
      }
    })
    const normalizedSelection = {
      start: {
        blockId: 'a-child',
        type: 'text',
        offset: 2,
        block: {id: 'a-child', textLength: 2, runtime: {textLength: 2}},
      },
      end: {
        blockId: 'a-child',
        type: 'text',
        offset: 2,
        block: {id: 'a-child', textLength: 2, runtime: {textLength: 2}},
      },
      firstBlockId: 'a-child',
      lastBlockId: 'a-child',
      isInSameBlock: true,
      contains: (blockId: string) => blockId === 'a' || blockId === 'a-child',
    }
    const createSelection = jasmine.createSpy('createSelection').and.returnValue(normalizedSelection)
    const doc = {
      rootId: 'root',
      selection: {selectionChange$, createFakeRange, createSelection},
      crud: {onTextUpdate$},
      onDestroy$,
      afterInit: (callback: (root: any) => void) => callback({hostElement: rootHost}),
      scrollContainer,
      config: {},
      virtualization: {
        enabled: true,
        viewChange$,
      },
      vm: {
        getMountedRootChildIds: () => [...mountedRootIds],
        isMounted: (id: string) => id === 'a-child' && mountedRootIds.includes('a'),
      },
      model: {
        structureChange$,
        getTextLength: () => 2,
        getPath: (id: string) => {
          if (id === 'a' || id === 'a-child') return ['root', 'a', ...(id === 'a-child' ? ['a-child'] : [])]
          if (id === 'other') return ['root', 'other']
          return null
        },
      },
      getBlockById: () => normalizedSelection.start.block,
      isEditable: () => true,
      queryBlocksBetween: jasmine.createSpy('queryBlocksBetween').and.returnValue([]),
      logger: {warn: jasmine.createSpy('warn')},
    }
    const awareness = new AwarenessHarness()
    const manager = new BlockCraftAwareness(doc as any, awareness as any)
    manager.setLocalUser({id: 'local', name: 'Local'})

    try {
      const cursor: ISelectionJSON = {
        anchor: {blockId: 'a-child', type: 'text', offset: 2},
        head: {blockId: 'a-child', type: 'text', offset: 2},
        commonParent: 'a-child',
      }
      awareness.states.set(7, {
        user: {id: 'remote', name: 'Remote'},
        cursor,
      })
      awareness.emitChange({added: [7], updated: [], removed: []})

      expect(createSelection).toHaveBeenCalledTimes(1)
      expect(createFakeRange).not.toHaveBeenCalled()

      mountedRootIds = ['a']
      viewChange$.next({mountedRootIds})
      expect(createFakeRange).toHaveBeenCalledTimes(1)

      mountedRootIds = ['a', 'other']
      viewChange$.next({mountedRootIds})
      expect(createFakeRange).toHaveBeenCalledTimes(1)

      mountedRootIds = ['other']
      viewChange$.next({mountedRootIds})
      expect(createFakeRange).toHaveBeenCalledTimes(1)
      expect(destroyedRanges[0]).toHaveBeenCalledTimes(1)

      mountedRootIds = ['a']
      viewChange$.next({mountedRootIds})
      expect(createFakeRange).toHaveBeenCalledTimes(2)

      structureChange$.next()
      expect(createSelection).toHaveBeenCalledTimes(2)
      expect(createFakeRange).toHaveBeenCalledTimes(3)
      expect(destroyedRanges[1]?.calls.count()).toBe(1)

      manager.destroy()
      viewChange$.next({mountedRootIds: ['a']})
      structureChange$.next()
      expect(createFakeRange).toHaveBeenCalledTimes(3)
      expect(createSelection).toHaveBeenCalledTimes(2)
    } finally {
      manager.destroy()
      scrollContainer.remove()
      selectionChange$.complete()
      onTextUpdate$.complete()
      onDestroy$.complete()
      viewChange$.complete()
      structureChange$.complete()
    }
  })

  it('uses stable solid cursor chrome and a translucent remote range', () => {
    const selectionChange$ = new Subject<any>()
    const onTextUpdate$ = new Subject<any>()
    const onDestroy$ = new Subject<void>()
    const rootHost = document.createElement('div')
    document.body.appendChild(rootHost)
    const editableBlock = {
      id: 'p1',
      textLength: 4,
      runtime: {textLength: 4},
    }
    const createSelection = jasmine.createSpy('createSelection').and.callFake(
      (selection: ISelectionJSON) => ({
        ...selection,
        start: {...selection.anchor, block: editableBlock},
        end: {...selection.head, block: editableBlock},
        firstBlockId: 'p1',
        lastBlockId: 'p1',
        isInSameBlock: true,
        collapsed:
          selection.anchor.type === 'text' &&
          selection.head.type === 'text' &&
          selection.anchor.offset === selection.head.offset,
      }),
    )
    const rangeColors: jasmine.Spy[] = []
    const createFakeRange = jasmine.createSpy('createFakeRange').and.callFake(
      (_selection: any, _config: any) => {
        const overlay = document.createElement('span')
        overlay.appendChild(document.createElement('span'))
        rootHost.appendChild(overlay)
        const setColor = jasmine.createSpy('setColor')
        rangeColors.push(setColor)
        return {
          fakeSpans: [overlay],
          hasLostRenderedSpans: false,
          setColor,
          destroy: () => overlay.remove(),
        }
      },
    )
    const doc = {
      selection: {selectionChange$, createSelection, createFakeRange},
      crud: {onTextUpdate$},
      onDestroy$,
      afterInit: (callback: (root: any) => void) => callback({hostElement: rootHost}),
      scrollContainer: null,
      config: {},
      model: {
        getTextLength: () => 4,
      },
      getBlockById: () => editableBlock,
      isEditable: () => true,
      queryBlocksBetween: jasmine.createSpy('queryBlocksBetween').and.returnValue([]),
      logger: {warn: jasmine.createSpy('warn')},
    }
    const awareness = new AwarenessHarness()
    const manager = new BlockCraftAwareness(doc as any, awareness as any)
    manager.setLocalUser({id: 'local', name: 'Local'})

    try {
      awareness.states.set(7, {
        user: {id: 'remote', name: 'Remote', color: '#2563EB'},
        cursor: {
          anchor: {blockId: 'p1', type: 'text', offset: 2},
          head: {blockId: 'p1', type: 'text', offset: 2},
          commonParent: 'p1',
        },
      })
      awareness.emitChange({added: [7], updated: [], removed: []})

      expect(createFakeRange.calls.mostRecent().args[1]).toEqual({
        bgColor: '#2563EB',
        minCursorWidth: 2,
      })
      const label = document.body.querySelector<HTMLElement>('.blockcraft-cursor-tag')
      expect(label?.innerText).toBe('Remote')
      expect(label?.style.backgroundColor).toBe('rgb(37, 99, 235)')
      expect(label?.style.color).toBe('rgb(255, 255, 255)')

      awareness.states.set(7, {
        user: {id: 'remote', name: 'Remote', color: '#2563EB'},
        cursor: {
          anchor: {blockId: 'p1', type: 'text', offset: 1},
          head: {blockId: 'p1', type: 'text', offset: 3},
          commonParent: 'p1',
        },
      })
      awareness.emitChange({added: [], updated: [7], removed: []})
      expect(createFakeRange.calls.mostRecent().args[1].bgColor)
        .toBe('rgba(37, 99, 235, 0.18)')

      awareness.states.set(7, {
        user: {id: 'remote', name: 'Remote renamed', color: '#0F766E'},
        cursor: {
          anchor: {blockId: 'p1', type: 'text', offset: 1},
          head: {blockId: 'p1', type: 'text', offset: 3},
          commonParent: 'p1',
        },
      })
      awareness.emitChange({added: [], updated: [7], removed: []})

      expect(rangeColors[1]).toHaveBeenCalledOnceWith({
        bgColor: 'rgba(15, 118, 110, 0.18)',
      })
      expect(createFakeRange.calls.mostRecent().args[1].bgColor)
        .toBe('rgba(15, 118, 110, 0.18)')
      expect(label?.innerText).toBe('Remote renamed')
      expect(label?.style.backgroundColor).toBe('rgb(15, 118, 110)')
    } finally {
      manager.destroy()
      rootHost.remove()
      selectionChange$.complete()
      onTextUpdate$.complete()
      onDestroy$.complete()
    }
  })
})

describe('BlockCraftAwareness local cursor broadcast control', () => {
  it('clears the local cursor while disabled and restores the current selection when enabled', () => {
    jasmine.clock().install()
    const selectionChange$ = new BehaviorSubject<any>(null)
    const onTextUpdate$ = new Subject<any>()
    const onDestroy$ = new Subject<void>()
    const rootHost = document.createElement('div')
    document.body.appendChild(rootHost)
    const doc = {
      selection: {
        selectionChange$,
        get value() {
          return selectionChange$.value
        },
      },
      crud: {onTextUpdate$},
      onDestroy$,
      afterInit: (callback: (root: any) => void) => callback({hostElement: rootHost}),
      scrollContainer: null,
      config: {},
      logger: {warn: jasmine.createSpy('warn')},
    }
    const awareness = new AwarenessHarness()
    const manager = new BlockCraftAwareness(doc as any, awareness as any)
    const first = {
      anchor: {blockId: 'p1', type: 'text', offset: 1},
      head: {blockId: 'p1', type: 'text', offset: 1},
      commonParent: 'p1',
    }
    const second = {
      anchor: {blockId: 'p2', type: 'text', offset: 2},
      head: {blockId: 'p2', type: 'text', offset: 2},
      commonParent: 'p2',
    }

    try {
      jasmine.clock().tick(100)
      awareness.setLocalStateField.calls.reset()

      selectionChange$.next({toJSON: () => first})
      jasmine.clock().tick(100)
      expect(awareness.setLocalStateField).toHaveBeenCalledWith('cursor', first)

      manager.setLocalCursorEnabled(false)
      expect(manager.localCursorEnabled).toBeFalse()
      expect(awareness.setLocalStateField).toHaveBeenCalledWith('cursor', null)

      awareness.setLocalStateField.calls.reset()
      selectionChange$.next({toJSON: () => second})
      jasmine.clock().tick(100)
      expect(awareness.setLocalStateField).toHaveBeenCalledOnceWith('cursor', null)

      manager.setLocalCursorEnabled(true)
      expect(manager.localCursorEnabled).toBeTrue()
      expect(awareness.setLocalStateField).toHaveBeenCalledWith('cursor', second)
    } finally {
      manager.destroy()
      rootHost.remove()
      selectionChange$.complete()
      onTextUpdate$.complete()
      onDestroy$.complete()
      jasmine.clock().uninstall()
    }
  })

  it('keeps filtered presence states connected without rendering their remote cursor', () => {
    const selectionChange$ = new BehaviorSubject<any>(null)
    const onTextUpdate$ = new Subject<any>()
    const onDestroy$ = new Subject<void>()
    const rootHost = document.createElement('div')
    document.body.appendChild(rootHost)
    const destroyRange = jasmine.createSpy('destroyRange')
    const createFakeRange = jasmine.createSpy('createFakeRange').and.callFake(() => {
      const overlay = document.createElement('span')
      overlay.appendChild(document.createElement('span'))
      rootHost.appendChild(overlay)
      return {
        fakeSpans: [overlay],
        hasLostRenderedSpans: false,
        destroy: () => {
          destroyRange()
          overlay.remove()
        },
      }
    })
    const point = {blockId: 'p1', type: 'selected'}
    const doc = {
      selection: {
        selectionChange$,
        value: null,
        createSelection: () => ({
          start: point,
          end: point,
          firstBlockId: 'p1',
          lastBlockId: 'p1',
          isInSameBlock: true,
          collapsed: true,
        }),
        createFakeRange,
      },
      crud: {onTextUpdate$},
      onDestroy$,
      afterInit: (callback: (root: any) => void) => callback({hostElement: rootHost}),
      scrollContainer: null,
      config: {},
      queryBlocksBetween: () => [],
      logger: {warn: jasmine.createSpy('warn')},
    }
    const awareness = new AwarenessHarness()
    const manager = new BlockCraftAwareness(doc as any, awareness as any, {
      shouldRenderRemoteCursor: state => state['status'] !== 'viewing',
    })
    const cursor = {anchor: point, head: point, commonParent: 'root'}

    try {
      manager.setLocalUser({id: 'local', name: 'Local'})
      awareness.states.set(7, {
        user: {id: 'remote', name: 'Remote'},
        status: 'viewing',
        cursor,
      })
      awareness.emitChange({added: [7], updated: [], removed: []})
      expect(createFakeRange).not.toHaveBeenCalled()

      awareness.states.set(7, {
        user: {id: 'remote', name: 'Remote'},
        status: 'editing',
        cursor,
      })
      awareness.emitChange({added: [], updated: [7], removed: []})
      expect(createFakeRange).toHaveBeenCalledTimes(1)

      awareness.states.set(7, {
        user: {id: 'remote', name: 'Remote'},
        status: 'viewing',
        cursor,
      })
      awareness.emitChange({added: [], updated: [7], removed: []})
      expect(destroyRange).toHaveBeenCalledTimes(1)
    } finally {
      manager.destroy()
      rootHost.remove()
      selectionChange$.complete()
      onTextUpdate$.complete()
      onDestroy$.complete()
    }
  })
})
