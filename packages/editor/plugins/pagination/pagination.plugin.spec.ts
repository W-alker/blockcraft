import {Subject} from 'rxjs'
import {
  IBlockModelContentChange,
  IBlockModelStructureChange,
} from '../../framework/doc/model-graph'
import {PaginationPlugin} from './pagination.plugin'

describe('PaginationPlugin', () => {
  function createDoc() {
    const scrollContainer = document.createElement('div')
    const rootHost = document.createElement('div')
    rootHost.setAttribute('data-blockcraft-root', 'true')
    scrollContainer.appendChild(rootHost)

    const exportSnapshot = jasmine.createSpy('exportSnapshot').and.returnValue({
      id: 'root',
      flavour: 'root',
      nodeType: 'block',
      props: {},
      meta: {},
      children: [],
    })
    const rootToSnapshot = jasmine.createSpy('toSnapshot')
    const contentChange$ = new Subject<IBlockModelContentChange>()
    const structureChange$ = new Subject<IBlockModelStructureChange>()
    const themeChange$ = new Subject<string>()
    const config = {
      scrollContainer,
      theme: 'light',
      virtualization: {estimatedHeights: {}},
    }

    return {
      scrollContainer,
      rootHost,
      exportSnapshot,
      rootToSnapshot,
      doc: {
        isInitialized: true,
        rootId: 'root',
        config,
        get theme() {
          return config.theme || 'light'
        },
        root: {
          hostElement: rootHost,
          childrenIds: [],
          toSnapshot: rootToSnapshot,
        },
        exportSnapshot,
        event: {bindHotkey: jasmine.createSpy('bindHotkey')},
        ngZone: {runOutsideAngular: (fn: () => void) => fn()},
        model: {
          contentChange$,
          structureChange$,
          getChildrenIds: () => [],
          getPath: () => null,
          getFlavour: () => undefined,
          getNodeType: () => undefined,
          getProps: () => undefined,
        },
        themeChange$,
        onChildrenUpdate$: new Subject<void>(),
        onPropsUpdate$: new Subject<void>(),
        getBlockById: () => null,
        afterInit: (fn: () => void) => fn(),
        logger: {warn: jasmine.createSpy('warn')},
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

  it('takes print snapshots from the model without traversing the root view', async () => {
    const {doc, exportSnapshot, rootToSnapshot} = createDoc()
    exportSnapshot.and.throwError('stop-after-model-snapshot')
    const plugin = new PaginationPlugin()
    ;(plugin as unknown as {doc: BlockCraft.Doc}).doc = doc
    plugin.init()

    await plugin.print()

    expect(exportSnapshot).toHaveBeenCalledTimes(1)
    expect(rootToSnapshot).not.toHaveBeenCalled()
    plugin.destroy()
  })

  it('holds exact full-document views only while live pagination is enabled', () => {
    const {doc} = createDoc()
    const release = jasmine.createSpy('releaseFullDocumentViewLease')
    const acquire = jasmine.createSpy('acquireFullDocumentViewLease').and.returnValue(release)
    ;(doc as any).virtualization = {
      enabled: true,
      acquireFullDocumentViewLease: acquire,
    }
    const plugin = new PaginationPlugin()
    ;(plugin as unknown as {doc: BlockCraft.Doc}).doc = doc
    plugin.init()

    plugin.enable()
    plugin.enable()
    expect(acquire).toHaveBeenCalledTimes(1)
    const controller = (plugin as any)._controller
    controller.captureStableLayout()
    expect(controller.captureShadowLayout()).not.toBeNull()

    plugin.disable()
    plugin.disable()
    expect(release).toHaveBeenCalledTimes(1)
    plugin.destroy()
  })

  it('uses the experimental sparse projection path without acquiring a full-document lease', () => {
    const {doc} = createDoc()
    const releaseProjection = jasmine.createSpy('releaseLayoutProjection')
    const registerLayoutProjection = jasmine.createSpy('registerLayoutProjection')
      .and.callFake((_projection: unknown, hooks: any) => {
        hooks?.beforeActivate?.()
        return () => {
          hooks?.beforeDeactivate?.()
          releaseProjection()
        }
      })
    const acquireFullDocumentViewLease = jasmine.createSpy('acquireFullDocumentViewLease')
    ;(doc as any).vm = {getMountedRootChildIds: () => []}
    ;(doc as any).virtualization = {
      enabled: true,
      viewChange$: new Subject<{mountedRootIds: readonly string[]}>(),
      registerLayoutProjection,
      acquireFullDocumentViewLease,
    }
    const plugin = new PaginationPlugin({experimentalSparseView: true})
    ;(plugin as unknown as {doc: BlockCraft.Doc}).doc = doc
    plugin.init()

    plugin.enable()

    expect(registerLayoutProjection).toHaveBeenCalledTimes(1)
    expect(acquireFullDocumentViewLease).not.toHaveBeenCalled()

    plugin.disable()
    expect(releaseProjection).toHaveBeenCalledTimes(1)
    plugin.destroy()
  })

  it('does not reuse estimated sparse layout for print or PDF export', () => {
    const plugin = new PaginationPlugin({experimentalSparseView: true})
    const layout = {revision: 1}
    const controller = {
      captureStableLayout: jasmine.createSpy('captureStableLayout')
        .and.returnValue(layout),
      captureShadowLayout: jasmine.createSpy('captureShadowLayout')
        .and.returnValue({exact: false}),
    }
    ;(plugin as any)._controller = controller

    expect((plugin as any)._captureReusableLayout()).toBeUndefined()

    controller.captureShadowLayout.and.returnValue({exact: true})
    expect((plugin as any)._captureReusableLayout()).toBe(layout)
  })

  it('rolls back the full-document lease when pagination enable fails', () => {
    const {doc} = createDoc()
    const release = jasmine.createSpy('releaseFullDocumentViewLease')
    ;(doc as any).virtualization = {
      enabled: true,
      acquireFullDocumentViewLease: jasmine.createSpy('acquireFullDocumentViewLease')
        .and.returnValue(release),
    }
    const controller = {
      enable: jasmine.createSpy('enable').and.throwError('enable failed'),
      disable: jasmine.createSpy('disable'),
      destroy: jasmine.createSpy('destroy'),
    }
    const plugin = new PaginationPlugin()
    ;(plugin as unknown as {doc: BlockCraft.Doc}).doc = doc
    plugin.init()
    ;(plugin as any)._controller = controller

    expect(() => plugin.enable()).toThrowError('enable failed')

    expect(plugin.enabled).toBeFalse()
    expect(controller.destroy).toHaveBeenCalledTimes(1)
    expect(release).toHaveBeenCalledTimes(1)
    expect((plugin as any)._controller).toBeNull()
    plugin.destroy()
  })

  it('releases the full-document lease when pagination disable fails', () => {
    const {doc} = createDoc()
    const release = jasmine.createSpy('releaseFullDocumentViewLease')
    ;(doc as any).virtualization = {
      enabled: true,
      acquireFullDocumentViewLease: jasmine.createSpy('acquireFullDocumentViewLease')
        .and.returnValue(release),
    }
    const controller = {
      enable: jasmine.createSpy('enable'),
      disable: jasmine.createSpy('disable').and.throwError('disable failed'),
      destroy: jasmine.createSpy('destroy'),
    }
    const plugin = new PaginationPlugin()
    ;(plugin as unknown as {doc: BlockCraft.Doc}).doc = doc
    plugin.init()
    ;(plugin as any)._controller = controller
    plugin.enable()

    expect(() => plugin.disable()).toThrowError('disable failed')

    expect(plugin.enabled).toBeFalse()
    expect(release).toHaveBeenCalledTimes(1)
    plugin.destroy()
  })

  it('releases the full-document lease when pagination destroy fails', () => {
    const {doc} = createDoc()
    const release = jasmine.createSpy('releaseFullDocumentViewLease')
    ;(doc as any).virtualization = {
      enabled: true,
      acquireFullDocumentViewLease: jasmine.createSpy('acquireFullDocumentViewLease')
        .and.returnValue(release),
    }
    const controller = {
      enable: jasmine.createSpy('enable'),
      disable: jasmine.createSpy('disable'),
      destroy: jasmine.createSpy('destroy').and.throwError('destroy failed'),
    }
    const plugin = new PaginationPlugin()
    ;(plugin as unknown as {doc: BlockCraft.Doc}).doc = doc
    plugin.init()
    ;(plugin as any)._controller = controller
    plugin.enable()

    expect(() => plugin.destroy()).toThrowError('destroy failed')

    expect(release).toHaveBeenCalledTimes(1)
    expect((plugin as any)._controller).toBeNull()
  })
})
