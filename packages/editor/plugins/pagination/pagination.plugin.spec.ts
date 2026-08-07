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

  it('applies an initially enabled view when document initialization completes', () => {
    const {doc, rootHost} = createDoc()
    const afterInitCallbacks: Array<() => void> = []
    const mutableDoc = doc as unknown as {
      isInitialized: boolean
      afterInit(callback: () => void): void
    }
    mutableDoc.isInitialized = false
    mutableDoc.afterInit = callback => afterInitCallbacks.push(callback)
    let deferredEnable: FrameRequestCallback | undefined
    spyOn(window, 'requestAnimationFrame').and.callFake(callback => {
      deferredEnable = callback
      return 1
    })
    const plugin = new PaginationPlugin({enabled: true})
    ;(plugin as unknown as {doc: BlockCraft.Doc}).doc = doc

    plugin.init()

    expect(plugin.enabled).toBeTrue()
    expect(rootHost.classList.contains('bc-paginated')).toBeFalse()
    expect(afterInitCallbacks.length).toBe(1)

    mutableDoc.isInitialized = true
    afterInitCallbacks[0]()

    expect(rootHost.classList.contains('bc-paginated')).toBeFalse()
    expect(deferredEnable).toBeDefined()
    deferredEnable!(0)

    expect(rootHost.classList.contains('bc-paginated')).toBeTrue()
    plugin.destroy()
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
    expect(scrollContainer.classList.contains('bc-pagination-surface')).toBeTrue()
    expect(scrollContainer.querySelectorAll('.bc-pagination-backdrop').length).toBe(1)

    plugin.disable()
    plugin.disable()
    expect(plugin.enabled).toBeFalse()
    expect(rootHost.classList.contains('bc-paginated')).toBeFalse()
    expect(scrollContainer.classList.contains('bc-pagination-surface')).toBeFalse()
    expect(scrollContainer.querySelector('.bc-pagination-backdrop')).toBeNull()

    plugin.destroy()
    plugin.destroy()
  })

  it('keeps page frames on the root layout surface when the scroll container is an ancestor', () => {
    const {doc, rootHost, scrollContainer} = createDoc()
    const header = document.createElement('header')
    const editorWrapper = document.createElement('div')
    const layoutSurface = document.createElement('div')
    rootHost.remove()
    layoutSurface.append(rootHost)
    editorWrapper.append(layoutSurface)
    scrollContainer.append(header, editorWrapper)
    const plugin = new PaginationPlugin()
    ;(plugin as unknown as {doc: BlockCraft.Doc}).doc = doc
    plugin.init()

    plugin.enable()

    expect(scrollContainer.classList.contains('bc-paginated-scroll')).toBeTrue()
    expect(scrollContainer.classList.contains('bc-pagination-surface')).toBeFalse()
    expect(layoutSurface.classList.contains('bc-pagination-surface')).toBeTrue()
    expect(layoutSurface.querySelector(':scope > .bc-pagination-backdrop')).not.toBeNull()
    expect(scrollContainer.querySelector(':scope > .bc-pagination-backdrop')).toBeNull()

    plugin.disable()
    expect(layoutSurface.classList.contains('bc-pagination-surface')).toBeFalse()
    expect(layoutSurface.querySelector('.bc-pagination-backdrop')).toBeNull()
    plugin.destroy()
  })

  it('recomputes page geometry and chrome when custom header content changes', () => {
    const {doc, rootHost, scrollContainer} = createDoc()
    const plugin = new PaginationPlugin({margins: {top: 20}})
    ;(plugin as unknown as {doc: BlockCraft.Doc}).doc = doc
    plugin.init()
    plugin.enable()

    plugin.updateConfig({
      header: {left: 'Project', center: '第 {page}/{total} 页', height: 40},
    })
    const controller = (plugin as unknown as {
      _controller: {captureStableLayout(): unknown}
    })._controller
    controller.captureStableLayout()

    expect(rootHost.style.getPropertyValue('--bc-page-margin-top')).toBe('0px')
    expect(rootHost.style.getPropertyValue('--bc-page-root-offset-top')).toBe('60px')
    const header = scrollContainer.querySelector<HTMLElement>('.bc-page-header')!
    expect(header.style.height).toBe('40px')
    expect(header.querySelector('.bc-page-chrome-left')?.textContent).toBe('Project')
    expect(header.querySelector('.bc-page-chrome-center')?.textContent).toBe('第 1/1 页')

    plugin.updateConfig({header: {right: 'Updated', height: 64}})
    controller.captureStableLayout()
    expect(rootHost.style.getPropertyValue('--bc-page-margin-top')).toBe('0px')
    expect(rootHost.style.getPropertyValue('--bc-page-root-offset-top')).toBe('84px')
    expect(scrollContainer.querySelector<HTMLElement>('.bc-page-header')?.style.height).toBe('64px')
    expect(scrollContainer.querySelector('.bc-page-chrome-right')?.textContent).toBe('Updated')

    plugin.destroy()
  })

  it('positions header and footer from independent page-edge distances', () => {
    const {doc, rootHost, scrollContainer} = createDoc()
    const plugin = new PaginationPlugin({
      pageSize: {width: 800, height: 1000},
      margins: {top: 72, right: 72, bottom: 72, left: 72},
      header: {center: '{page}', height: 24, distance: 48},
      footer: {center: '{page}', height: 24, distance: 36},
    })
    ;(plugin as unknown as {doc: BlockCraft.Doc}).doc = doc
    plugin.init()
    plugin.enable()

    const controller = (plugin as unknown as {
      _controller: {captureStableLayout(): unknown}
    })._controller
    controller.captureStableLayout()

    expect(rootHost.style.getPropertyValue('--bc-page-margin-top')).toBe('0px')
    expect(rootHost.style.getPropertyValue('--bc-page-root-offset-top')).toBe('72px')
    expect(rootHost.style.getPropertyValue('--bc-page-margin-bottom')).toBe('72px')
    expect(scrollContainer.querySelector<HTMLElement>('.bc-page-header')?.style.top).toBe('48px')
    expect(scrollContainer.querySelector<HTMLElement>('.bc-page-footer')?.style.top).toBe('940px')

    plugin.destroy()
  })

  it('projects a custom document header into the root surface and restores it on disable', () => {
    const {doc, rootHost, scrollContainer} = createDoc()
    const documentHeader = document.createElement('section')
    const editorWrapper = document.createElement('div')
    const layoutSurface = document.createElement('div')
    rootHost.remove()
    scrollContainer.prepend(documentHeader)
    layoutSurface.append(rootHost)
    editorWrapper.append(layoutSurface)
    scrollContainer.append(editorWrapper)
    document.body.append(scrollContainer)
    let documentHeaderHeight = 120
    spyOn(documentHeader, 'getBoundingClientRect').and.callFake(() => ({
      x: 0, y: 0, top: 0, right: 649, bottom: documentHeaderHeight,
      left: 0, width: 649, height: documentHeaderHeight, toJSON: () => ({}),
    }))
    const plugin = new PaginationPlugin({
      pageSize: {width: 793, height: 1123},
      margins: {top: 72, right: 72, bottom: 72, left: 72},
      documentHeader: {element: documentHeader, gap: 16},
    })
    ;(plugin as unknown as {doc: BlockCraft.Doc}).doc = doc
    plugin.init()

    plugin.enable()

    expect(documentHeader.parentElement).toBe(layoutSurface)
    expect(documentHeader.nextElementSibling).toBe(rootHost)
    expect(documentHeader.classList.contains('bc-pagination-document-header')).toBeTrue()
    expect(documentHeader.style.width).toBe('649px')
    expect(documentHeader.style.top).toBe('96px')
    expect(rootHost.style.getPropertyValue('--bc-page-margin-top')).toBe('0px')
    expect(rootHost.style.getPropertyValue('--bc-page-root-offset-top')).toBe('208px')
    // header 是 root 外部的首页 sibling；正文与绝对块共享 root-local 零点。
    expect(rootHost.style.getPropertyValue('--bc-placement-content-origin-y')).toBe('0px')
    expect(layoutSurface.querySelector(':scope > .bc-pagination-backdrop')).not.toBeNull()
    expect(scrollContainer.contains(layoutSurface)).toBeTrue()

    // captureStableLayout 是 Word 式同步屏障：即使 ResizeObserver 尚未投递，也必须
    // 主动读取最终 header 高度并把它写入同一次稳定分页 geometry。
    documentHeaderHeight = 144
    plugin.captureStableLayout()
    expect(rootHost.style.getPropertyValue('--bc-page-root-offset-top')).toBe('232px')

    plugin.disable()

    expect(documentHeader.parentElement).toBe(scrollContainer)
    expect(documentHeader.nextElementSibling).toBe(editorWrapper)
    expect(documentHeader.classList.contains('bc-pagination-document-header')).toBeFalse()
    expect(documentHeader.style.cssText).toBe('')

    plugin.enable()
    expect(rootHost.style.getPropertyValue('--bc-page-root-offset-top')).toBe('232px')
    expect(rootHost.style.getPropertyValue('--bc-placement-content-origin-y')).toBe('0px')
    plugin.disable()
    expect(rootHost.style.getPropertyValue('--bc-page-root-offset-top')).toBe('')
    expect(rootHost.style.getPropertyValue('--bc-placement-content-origin-y')).toBe('')
    plugin.destroy()
    scrollContainer.remove()
  })

  it('can place a custom document header inside the first-page top margin', () => {
    const {doc, rootHost, scrollContainer} = createDoc()
    const documentHeader = document.createElement('section')
    scrollContainer.prepend(documentHeader)
    document.body.append(scrollContainer)
    Object.defineProperty(documentHeader, 'offsetHeight', {value: 120})
    const plugin = new PaginationPlugin({
      pageSize: {width: 793, height: 1123},
      margins: {top: 96, right: 96, bottom: 96, left: 96},
      documentHeader: {
        element: documentHeader,
        placement: 'top-margin',
        topInset: 20,
        gap: 16,
      },
    })
    ;(plugin as unknown as {doc: BlockCraft.Doc}).doc = doc
    plugin.init()
    plugin.enable()

    expect(documentHeader.style.top).toBe('44px')
    // body top = 96；header end = 20 + 120 + 16，因此只额外扣除 60。
    expect(rootHost.style.getPropertyValue('--bc-page-margin-top')).toBe('0px')
    expect(rootHost.style.getPropertyValue('--bc-page-root-offset-top')).toBe('156px')
    expect(rootHost.style.getPropertyValue('--bc-placement-content-origin-y')).toBe('0px')

    plugin.destroy()
    scrollContainer.remove()
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

    ;(plugin as any)._registered = true
    ;(plugin as any)._enabled = true
    ;(plugin as any)._destroyed = false
    ;(plugin as any).doc = {isInitialized: true}

    expect(plugin.captureStableLayout()).toBeUndefined()

    controller.captureShadowLayout.and.returnValue({exact: true})
    expect(plugin.captureStableLayout()).toBe(layout as any)
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
