import {BlockNodeType, type IBlockSnapshot} from '../../block-std'
import {BlockReadonlyOperation} from '../../doc/block-readonly.types'
import {ClipboardManager} from './index'
import {
  BLOCKCRAFT_WEB_SNAPSHOT_MIME,
  buildClipboardSnapshotMarkerHtml,
  serializeClipboardSnapshot,
} from './internal-clipboard'
import {ClipboardDataType} from './types'

describe('ClipboardManager absolute-object paste', () => {
  it('pastes an internal object snapshot beside the selected absolute object', async () => {
    const source: IBlockSnapshot = {
      id: 'shape-source',
      flavour: 'shape',
      nodeType: BlockNodeType.block,
      props: {position: {x: 40, y: 50}},
      meta: {},
      children: [],
    }
    const rootSnapshot: IBlockSnapshot = {
      id: 'clipboard-root',
      flavour: 'root',
      nodeType: BlockNodeType.root,
      props: {},
      meta: {},
      children: [source],
    }
    const selection = {
      isInSameBlock: true,
      anchor: {blockId: 'shape-selected', type: 'selected'},
      head: {blockId: 'shape-selected', type: 'selected'},
      getBoundarySelectedChildIds: () => null,
    } as any
    const assertInsertable = jasmine.createSpy('assertInsertable')
    const captureSelectionBeforeChange =
      jasmine.createSpy('captureSelectionBeforeChange')
    const insertBlockSnapshots = jasmine.createSpy('insertBlockSnapshots')
      .and.callFake((_parentId: string, _index: number, snapshots: IBlockSnapshot[]) =>
        snapshots.map(snapshot => snapshot.id),
      )
    const replay = jasmine.createSpy('replay')
    const doc = {
      event: {add: () => () => {}, bindHotkey: () => () => {}},
      config: {},
      injector: {
        get: () => ({supportedAdapters: [], getAdapter: () => undefined}),
      },
      logger: {warn: jasmine.createSpy('warn')},
      placement: {isAbsoluteObjectSelection: () => true},
      model: {
        exists: (id: string) => ['shape-selected', 'layout'].includes(id),
        getParentId: (id: string) => id === 'shape-selected' ? 'layout' : 'root',
        indexInParent: (id: string) => id === 'shape-selected' ? 0 : -1,
        getFlavour: (id: string) => id === 'layout' ? 'placement-layout' : 'shape',
        getYBlock: () => undefined,
      },
      schemas: {
        get: (flavour: string) => {
          if (flavour === 'shape') {
            return {metadata: {placement: {modes: ['relative', 'absolute']}}}
          }
          return flavour === 'placement-layout' ? {metadata: {}} : null
        },
        isValidChildrenForInstance: () => true,
      },
      readonlyManager: {assertInsertable},
      crud: {
        undoManager: {captureSelectionBeforeChange},
        insertBlockSnapshots,
      },
      selection: {replay},
    } as any
    const manager = new ClipboardManager(doc)
    const preventDefault = jasmine.createSpy('preventDefault')
    const state = {
      selection,
      dataTypes: [ClipboardDataType.BLOCKCRAFT_SNAPSHOT],
      getData: (type: ClipboardDataType) => type === ClipboardDataType.BLOCKCRAFT_SNAPSHOT
        ? serializeClipboardSnapshot(rootSnapshot)
        : null,
    }

    const result = await manager.onPaste({
      preventDefault,
      get: () => state,
    } as any)

    expect(result).toBeTrue()
    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(assertInsertable).toHaveBeenCalledOnceWith(
      'layout',
      BlockReadonlyOperation.Paste,
      'clipboard',
    )
    const inserted = insertBlockSnapshots.calls.mostRecent().args[2]
    expect(inserted[0].id).not.toBe(source.id)
    expect(inserted[0].props['position']).toEqual({x: 52, y: 62})
    expect(replay).toHaveBeenCalledWith({
      anchor: {blockId: inserted[0].id, type: 'selected'},
      head: {blockId: inserted[0].id, type: 'selected'},
      commonParent: inserted[0].id,
    })
  })

  it('recovers an object snapshot from the synchronous HTML clipboard marker', async () => {
    const source: IBlockSnapshot = {
      id: 'shape-source',
      flavour: 'shape',
      nodeType: BlockNodeType.block,
      props: {position: {x: 5, y: 8}},
      meta: {},
      children: [],
    }
    const rootSnapshot: IBlockSnapshot = {
      id: 'clipboard-root',
      flavour: 'root',
      nodeType: BlockNodeType.root,
      props: {},
      meta: {},
      children: [source],
    }
    const selection = {
      isInSameBlock: true,
      anchor: {blockId: 'shape-selected', type: 'selected'},
      head: {blockId: 'shape-selected', type: 'selected'},
      getBoundarySelectedChildIds: () => null,
    } as any
    const insertBlockSnapshots = jasmine.createSpy('insertBlockSnapshots')
      .and.callFake((_parentId: string, _index: number, snapshots: IBlockSnapshot[]) =>
        snapshots.map(snapshot => snapshot.id),
      )
    const doc = {
      event: {add: () => () => {}, bindHotkey: () => () => {}},
      config: {},
      injector: {
        get: () => ({supportedAdapters: [], getAdapter: () => undefined}),
      },
      logger: {warn: jasmine.createSpy('warn')},
      placement: {isAbsoluteObjectSelection: () => true},
      model: {
        exists: (id: string) => ['shape-selected', 'layout'].includes(id),
        getParentId: (id: string) => id === 'shape-selected' ? 'layout' : 'root',
        indexInParent: (id: string) => id === 'shape-selected' ? 0 : -1,
        getFlavour: (id: string) => id === 'layout' ? 'placement-layout' : 'shape',
        getYBlock: () => undefined,
      },
      schemas: {
        get: (flavour: string) => flavour === 'shape'
          ? {metadata: {placement: {modes: ['relative', 'absolute']}}}
          : flavour === 'placement-layout' ? {metadata: {}} : null,
        isValidChildrenForInstance: () => true,
      },
      readonlyManager: {assertInsertable: () => {}},
      crud: {
        undoManager: {captureSelectionBeforeChange: () => {}},
        insertBlockSnapshots,
      },
      selection: {replay: () => {}},
    } as any
    const manager = new ClipboardManager(doc)

    const result = await manager.onPaste({
      preventDefault: () => {},
      get: () => ({
        selection,
        dataTypes: [BLOCKCRAFT_WEB_SNAPSHOT_MIME, ClipboardDataType.HTML],
        getData: (type: string) => type === ClipboardDataType.HTML
          ? buildClipboardSnapshotMarkerHtml(rootSnapshot)
          : '',
      }),
    } as any)

    expect(result).toBeTrue()
    expect(insertBlockSnapshots).toHaveBeenCalledTimes(1)
  })
})
