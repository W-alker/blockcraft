import {Subject} from 'rxjs'
import {BlockNodeType} from '../../../block-std/types/block.type'
import {
  IBlockModelContentChange,
  IBlockModelStructureChange,
} from '../../../doc/model-graph'
import {PaginatedViewController} from './paginated-view.controller'

describe('PaginatedViewController sparse view', () => {
  it('keeps offscreen roots estimated and replays their gap when they mount', () => {
    const scrollContainer = document.createElement('div')
    const rootHost = document.createElement('div')
    const hosts = new Map([
      ['a', blockHost('a', 160)],
      ['b', blockHost('b', 160)],
    ])
    rootHost.setAttribute('data-blockcraft-root', 'true')
    rootHost.append(hosts.get('a')!)
    scrollContainer.append(rootHost)
    document.body.append(scrollContainer)

    let mountedIds = ['a']
    const viewChange$ = new Subject<{mountedRootIds: readonly string[]}>()
    const contentChange$ = new Subject<IBlockModelContentChange>()
    const structureChange$ = new Subject<IBlockModelStructureChange>()
    const themeChange$ = new Subject<string>()
    const childrenChange$ = new Subject<void>()
    const releaseProjection = jasmine.createSpy('releaseProjection')
    const registerLayoutProjection = jasmine.createSpy('registerLayoutProjection')
      .and.callFake((_projection: unknown, hooks: any) => {
        hooks.beforeActivate?.()
        return () => {
          hooks.beforeDeactivate?.()
          releaseProjection()
        }
      })
    const getBlockById = jasmine.createSpy('getBlockById').and.callFake(
      (id: string, onError?: () => void) => {
        if (!mountedIds.includes(id)) {
          onError?.()
          throw new Error(`Block not found: ${id}`)
        }
        return {
          id,
          flavour: 'paragraph',
          nodeType: BlockNodeType.editable,
          hostElement: hosts.get(id),
          heading: false,
        }
      },
    )
    const config = {
      scrollContainer,
      theme: 'light',
      virtualization: {
        enabled: true,
        estimatedHeights: {paragraph: 160},
      },
    }
    const doc = {
      rootId: 'root',
      root: {
        childrenIds: ['a', 'b'],
        hostElement: rootHost,
      },
      model: {
        contentChange$,
        structureChange$,
        getChildrenIds: (id: string) => id === 'root' ? ['a', 'b'] : [],
        getPath: (id: string) => ['root', id],
        getFlavour: () => 'paragraph',
        getNodeType: () => BlockNodeType.editable,
        getProps: () => ({}),
      },
      config,
      get theme() {
        return config.theme
      },
      themeChange$,
      onChildrenUpdate$: childrenChange$,
      getBlockById,
      vm: {getMountedRootChildIds: () => [...mountedIds]},
      virtualization: {
        enabled: true,
        viewChange$,
        registerLayoutProjection,
      },
      ngZone: {runOutsideAngular: (run: () => void) => run()},
      logger: {warn: jasmine.createSpy('warn')},
    } as unknown as BlockCraft.Doc
    const controller = new PaginatedViewController(
      doc,
      {
        pageSize: {width: 400, height: 220},
        margins: {top: 10, right: 10, bottom: 10, left: 10},
        pageGap: 20,
      },
      scrollContainer,
      undefined,
      {sparseView: true},
    )

    try {
      controller.enable()
      expect(registerLayoutProjection).toHaveBeenCalledTimes(1)
      expect(gapBefore(hosts.get('b')!)).toBeNull()
      expect(controller.captureStableLayout()).not.toBeNull()
      const entries = controller.captureShadowLayout()!.entries
      expect(entries.find(entry => entry.blockId === 'a')?.source).toBe('measured')
      expect(entries.find(entry => entry.blockId === 'b')?.source).toBe('estimated')

      controller.updateConfig({pageSize: {width: 500, height: 220}})
      expect(rootHost.style.getPropertyValue('--bc-page-width')).toBe('400px')
      expect(controller.captureStableLayout()).not.toBeNull()
      expect(rootHost.style.getPropertyValue('--bc-page-width')).toBe('500px')

      const scheduleRecompute = spyOn(controller, 'scheduleRecompute')
      contentChange$.next({
        blockIds: ['b'],
        kinds: ['text'],
        origin: 'remote-test',
        local: false,
        isUndoRedo: false,
      })
      expect(scheduleRecompute).toHaveBeenCalledTimes(1)

      getBlockById.calls.reset()
      rootHost.replaceChildren(hosts.get('b')!)
      mountedIds = ['b']
      viewChange$.next({mountedRootIds: mountedIds})

      expect(getBlockById).not.toHaveBeenCalledWith('a', jasmine.anything())
      expect(gapBefore(hosts.get('a')!)).toBeNull()
      expect(gapBefore(hosts.get('b')!)?.style.height).toBe('80px')

      controller.disable()
      expect(releaseProjection).toHaveBeenCalledTimes(1)
      expect(gapBefore(hosts.get('b')!)).toBeNull()
      expect(rootHost.classList.contains('bc-paginated')).toBeFalse()
    } finally {
      controller.destroy()
      contentChange$.complete()
      structureChange$.complete()
      themeChange$.complete()
      childrenChange$.complete()
      viewChange$.complete()
      scrollContainer.remove()
    }
  })
})

function blockHost(id: string, height: number): HTMLElement {
  const host = document.createElement('div')
  host.dataset['blockId'] = id
  host.style.marginBottom = '0'
  Object.defineProperty(host, 'offsetHeight', {value: height})
  Object.defineProperty(host, 'scrollHeight', {value: height})
  return host
}

function gapBefore(host: HTMLElement): HTMLElement | null {
  const previous = host.previousElementSibling as HTMLElement | null
  return previous?.dataset['bcPageGapSpacer'] ? previous : null
}
