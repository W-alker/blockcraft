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
      flavour: 'paragraph',
      textContent: () => ' ',
    }
    const plugin = new BlockTransformerPlugin()
    ;(plugin as any).doc = {
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
})
