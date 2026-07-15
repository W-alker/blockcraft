import {Subject} from 'rxjs'
import {PaginationPlugin} from './pagination.plugin'

describe('PaginationPlugin', () => {
  function createDoc() {
    const scrollContainer = document.createElement('div')
    const rootHost = document.createElement('div')
    rootHost.setAttribute('data-blockcraft-root', 'true')
    scrollContainer.appendChild(rootHost)

    return {
      scrollContainer,
      rootHost,
      doc: {
        isInitialized: true,
        config: {scrollContainer},
        root: {
          hostElement: rootHost,
          childrenIds: [],
        },
        event: {bindHotkey: jasmine.createSpy('bindHotkey')},
        ngZone: {runOutsideAngular: (fn: () => void) => fn()},
        onChildrenUpdate$: new Subject<void>(),
        onPropsUpdate$: new Subject<void>(),
        getBlockById: () => null,
        afterInit: (fn: () => void) => fn(),
      } as unknown as BlockCraft.Doc,
    }
  }

  it('defaults to disabled and merges nested margins', () => {
    const plugin = new PaginationPlugin({margins: {top: 40, left: 20}})

    expect(plugin.enabled).toBeFalse()
    plugin.updateConfig({margins: {bottom: 30}})
    expect(plugin.config.margins).toEqual({top: 40, left: 20, bottom: 30})
  })

  it('enables and disables idempotently without leaving pagination DOM', () => {
    const {doc, rootHost, scrollContainer} = createDoc()
    const plugin = new PaginationPlugin()
    ;(plugin as unknown as {doc: BlockCraft.Doc}).doc = doc
    plugin.init()

    plugin.enable()
    plugin.enable()
    expect(plugin.enabled).toBeTrue()
    expect(rootHost.classList.contains('bc-paginated')).toBeTrue()
    expect(scrollContainer.querySelectorAll('.bc-pagination-backdrop').length).toBe(1)

    plugin.disable()
    plugin.disable()
    expect(plugin.enabled).toBeFalse()
    expect(rootHost.classList.contains('bc-paginated')).toBeFalse()
    expect(scrollContainer.querySelector('.bc-pagination-backdrop')).toBeNull()

    plugin.destroy()
    plugin.destroy()
  })

  it('only consumes the print shortcut while enabled and configured', () => {
    const plugin = new PaginationPlugin({printShortcut: true})
    const ctx = {
      preventDefault: jasmine.createSpy('preventDefault'),
      stopPropagation: jasmine.createSpy('stopPropagation'),
    }
    spyOn(plugin, 'print').and.resolveTo()

    expect(plugin.onPrintShortcut(ctx as never)).toBeUndefined()
    plugin.enable()
    expect(plugin.onPrintShortcut(ctx as never)).toBeTrue()
    expect(ctx.preventDefault).toHaveBeenCalledTimes(1)
    expect(ctx.stopPropagation).toHaveBeenCalledTimes(1)
    expect(plugin.print).toHaveBeenCalledTimes(1)
  })

  it('aborts in-flight PDF work when destroyed', () => {
    const {doc} = createDoc()
    const plugin = new PaginationPlugin()
    ;(plugin as unknown as {doc: BlockCraft.Doc}).doc = doc
    plugin.init()

    const signal = (plugin as unknown as {_exportAbort: AbortController})._exportAbort.signal
    expect(signal.aborted).toBeFalse()

    plugin.destroy()
    expect(signal.aborted).toBeTrue()
  })
})
