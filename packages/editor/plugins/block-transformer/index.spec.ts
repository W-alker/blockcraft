import {fakeAsync, flushMicrotasks} from "@angular/core/testing";
import {BlockTransformerPlugin} from "./index";

describe('BlockTransformerPlugin beforeInput', () => {
  function stubNextTick() {
    const scheduler = (window as any).scheduler

    if (scheduler?.yield) {
      spyOn(scheduler, 'yield').and.returnValue(Promise.resolve())
    } else if ('requestIdleCallback' in window) {
      spyOn(window as any, 'requestIdleCallback').and.callFake((cb: IdleRequestCallback) => {
        cb({didTimeout: false, timeRemaining: () => 0} as IdleDeadline)
        return 1
      })
    }
  }

  function createPlugin() {
    const block = {
      id: 'block',
      flavour: 'paragraph',
      textContent: () => ' ',
    }
    const plugin = new BlockTransformerPlugin()
    ;(plugin as any).doc = {
      getBlockById: jasmine.createSpy('getBlockById').and.callFake((id: string) => {
        const current = (plugin as any).doc.selection.value?.firstBlock
        if (current?.id === id) return current
        return id === block.id ? block : undefined
      }),
      schemas: {
        get: jasmine.createSpy('get').and.returnValue({metadata: {isLeaf: false}})
      },
      selection: {
        value: {
          collapsed: true,
          start: {type: 'text', offset: 0},
          firstBlock: block
        },
        recalculate: jasmine.createSpy('recalculate').and.callFake(() => ({
          value: (plugin as any).doc.selection.value
        }))
      }
    }
    return plugin as any
  }

  it('triggers markdown transform when Safari provides space through dataTransfer', fakeAsync(() => {
    const plugin = createPlugin()
    spyOn<any>(plugin, '_mdTransform').and.callFake(() => true)
    stubNextTick()

    plugin.onBeforeInput({
      getDefaultEvent: () => ({
        data: null,
        dataTransfer: {
          types: ['text/plain'],
          getData: () => ' '
        }
      })
    } as any)

    flushMicrotasks()

    expect(plugin._mdTransform).toHaveBeenCalled()
  }))

  it('triggers markdown transform from keyDown fallback when beforeInput text is missing', fakeAsync(() => {
    const plugin = createPlugin()
    spyOn<any>(plugin, '_mdTransform').and.callFake(() => true)
    stubNextTick()

    plugin.onKeyDown({
      get: (name: string) => {
        if (name === 'keyboardState') {
          return {
            raw: {
              key: ' ',
              metaKey: false,
              ctrlKey: false,
              altKey: false
            }
          }
        }
        throw new Error(`Unexpected state ${name}`)
      }
    } as any)

    flushMicrotasks()

    expect(plugin._mdTransform).toHaveBeenCalled()
  }))

  it('opens the context menu when Safari provides slash through dataTransfer', fakeAsync(() => {
    const plugin = createPlugin()
    const block = {
      id: 'slash-block',
      flavour: 'paragraph',
      textContent: () => '/',
    }
    plugin.doc.selection.value = {
      collapsed: true,
      start: {type: 'text'},
      firstBlock: block
    }
    spyOn(plugin, 'openContextMenu')
    stubNextTick()

    plugin.onBeforeInput({
      getDefaultEvent: () => ({
        data: null,
        dataTransfer: {
          types: ['text/plain'],
          getData: () => '/'
        }
      })
    } as any)

    flushMicrotasks()

    expect(plugin.openContextMenu).toHaveBeenCalledWith(block)
  }))

  it('opens the context menu from keyDown fallback when slash is typed', fakeAsync(() => {
    const plugin = createPlugin()
    const block = {
      id: 'slash-block',
      flavour: 'paragraph',
      textContent: () => '/',
    }
    plugin.doc.selection.value = {
      collapsed: true,
      start: {type: 'text'},
      firstBlock: block
    }
    spyOn(plugin, 'openContextMenu')
    stubNextTick()

    plugin.onKeyDown({
      get: (name: string) => {
        if (name === 'keyboardState') {
          return {
            raw: {
              key: '/',
              metaKey: false,
              ctrlKey: false,
              altKey: false
            }
          }
        }
        throw new Error(`Unexpected state ${name}`)
      }
    } as any)

    flushMicrotasks()

    expect(plugin.openContextMenu).toHaveBeenCalledWith(block)
  }))

  it('lets a later beforeInput trigger replace an earlier keyDown trigger', fakeAsync(() => {
    const plugin = createPlugin()
    const block = {
      id: 'heading-block',
      flavour: 'paragraph',
      textContent: () => '# ',
    }
    plugin.doc.selection.value = {
      collapsed: true,
      start: {type: 'text', offset: 1},
      firstBlock: block
    }
    plugin.doc.selection.recalculate.and.callFake(() => ({
      value: plugin.doc.selection.value
    }))
    spyOn<any>(plugin, '_mdTransform').and.callFake(() => true)
    stubNextTick()

    block.textContent = () => '#'
    plugin.onKeyDown({
      get: (name: string) => {
        if (name === 'keyboardState') {
          return {
            raw: {
              key: ' ',
              metaKey: false,
              ctrlKey: false,
              altKey: false
            }
          }
        }
        throw new Error(`Unexpected state ${name}`)
      }
    } as any)

    block.textContent = () => '# '
    plugin.doc.selection.value = {
      collapsed: true,
      start: {type: 'text', offset: 1},
      firstBlock: block
    }
    plugin.onBeforeInput({
      getDefaultEvent: () => ({
        data: ' '
      })
    } as any)

    flushMicrotasks()

    expect(plugin._mdTransform).toHaveBeenCalled()
  }))

  it('does not run a queued input trigger after destroy', fakeAsync(() => {
    const plugin = createPlugin()
    spyOn<any>(plugin, '_mdTransform').and.callFake(() => true)
    stubNextTick()

    plugin.onKeyDown({
      get: (name: string) => {
        if (name === 'keyboardState') {
          return {
            raw: {
              key: ' ',
              metaKey: false,
              ctrlKey: false,
              altKey: false
            }
          }
        }
        throw new Error(`Unexpected state ${name}`)
      }
    } as any)
    plugin.destroy()

    flushMicrotasks()

    expect(plugin._mdTransform).not.toHaveBeenCalled()
  }))

  it('does not open the slash context menu for a stale block', fakeAsync(() => {
    const plugin = createPlugin()
    const block = {
      id: 'stale-block',
      flavour: 'paragraph',
      textContent: () => '/',
    }
    plugin.doc.selection.value = {
      collapsed: true,
      start: {type: 'text'},
      firstBlock: block
    }
    plugin.doc.getBlockById.and.throwError('missing')
    spyOn(plugin, 'openContextMenu')
    stubNextTick()

    plugin.onBeforeInput({
      getDefaultEvent: () => ({
        data: '/'
      })
    } as any)

    flushMicrotasks()

    expect(plugin.openContextMenu).not.toHaveBeenCalled()
  }))

  it('does not format heading for a stale selected block', () => {
    const plugin = createPlugin()
    const block = {
      id: 'stale-heading',
      flavour: 'paragraph',
      updateProps: jasmine.createSpy('updateProps'),
    }
    plugin.doc.getBlockById.and.throwError('missing')
    const preventDefault = jasmine.createSpy('preventDefault')

    plugin.formatHeading({
      preventDefault,
      get: (name: string) => {
        if (name === 'keyboardState') {
          return {
            raw: {key: '1'},
            selection: {
              isInSameBlock: true,
              start: {type: 'text'},
              firstBlock: block,
            },
          }
        }
        throw new Error(`Unexpected state ${name}`)
      },
    } as any)

    expect(preventDefault).not.toHaveBeenCalled()
    expect(block.updateProps).not.toHaveBeenCalled()
  })

  it('does not run transform hotkeys for a stale selected block', () => {
    const plugin = new BlockTransformerPlugin([
      {
        flavour: 'bullet',
        description: 'Bullet',
        hotkey: {key: 'b'},
      } as any,
    ]) as any
    let hotkeyHandler!: (evt: any) => unknown
    const block = {
      id: 'stale-transform',
      flavour: 'paragraph',
    }
    plugin.doc = {
      getBlockById: jasmine.createSpy('getBlockById').and.throwError('missing'),
      schemas: {
        get: jasmine.createSpy('get').and.returnValue({metadata: {}}),
      },
      event: {
        bindHotkey: jasmine.createSpy('bindHotkey').and.callFake((_hotkey: any, handler: (evt: any) => unknown) => {
          hotkeyHandler = handler
        }),
      },
    }
    const transformEditableBlock = spyOn(BlockTransformerPlugin, 'transformEditableBlock')
    const preventDefault = jasmine.createSpy('preventDefault')

    plugin.init()
    const result = hotkeyHandler({
      preventDefault,
      get: (name: string) => {
        if (name === 'keyboardState') {
          return {
            selection: {
              isInSameBlock: true,
              start: {type: 'text'},
              firstBlock: block,
            },
          }
        }
        throw new Error(`Unexpected state ${name}`)
      },
    })

    expect(result).toBeUndefined()
    expect(preventDefault).not.toHaveBeenCalled()
    expect(transformEditableBlock).not.toHaveBeenCalled()
  })
})
