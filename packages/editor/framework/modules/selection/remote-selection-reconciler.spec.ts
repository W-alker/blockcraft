import * as Y from 'yjs'
import {BehaviorSubject, Subject} from 'rxjs'
import {BlockNodeType} from '../../block-std'
import {IRemoteDocSyncLifecycleEvent} from '../../doc/sync-lifecycle'
import {BlockSelection} from './blockSelection'
import {lazyPoint} from './normalize'
import {RemoteSelectionReconciler} from './remote-selection-reconciler'

describe('RemoteSelectionReconciler', () => {
  let yDoc: Y.Doc
  let selection$: BehaviorSubject<BlockSelection | null>
  let lifecycle$: Subject<IRemoteDocSyncLifecycleEvent>
  let frameCallbacks: FrameRequestCallback[]
  let currentSelection: BlockSelection | null
  let doc: any
  let reconciler: RemoteSelectionReconciler
  let recalculate: jasmine.Spy
  let replay: jasmine.Spy

  beforeEach(() => {
    yDoc = new Y.Doc()
    const yBlock = new Y.Map<any>()
    const yText = new Y.Text()
    yBlock.set('text', yText)
    yBlock.set('children', new Y.Array<string>())
    yDoc.getMap('blocks').set('p1', yBlock)
    yText.insert(0, 'ab')

    const root: any = {
      id: 'root',
      flavour: 'root',
      nodeType: BlockNodeType.root,
      parentId: null,
      childrenIds: ['p1'],
    }
    const paragraph: any = {
      id: 'p1',
      flavour: 'paragraph',
      nodeType: BlockNodeType.editable,
      parentId: 'root',
      parentBlock: root,
      yBlock,
      yText,
      get textLength() { return yText.length },
    }
    const blocks = new Map<string, any>([['root', root], ['p1', paragraph]])
    selection$ = new BehaviorSubject<BlockSelection | null>(null)
    lifecycle$ = new Subject<IRemoteDocSyncLifecycleEvent>()
    frameCallbacks = []
    currentSelection = null
    recalculate = jasmine.createSpy('recalculate')
    replay = jasmine.createSpy('replay')
    doc = {
      yDoc,
      isInitialized: true,
      inputManger: {compositionSession: {isActive: false}},
      getBlockById: (id: string) => {
        const block = blocks.get(id)
        if (!block) throw new Error(`Block not found: ${id}`)
        return block
      },
      isEditable: (block: any) => block.nodeType === BlockNodeType.editable,
      schemas: {
        get: (flavour: string) => ({
          metadata: {selectionScope: flavour === 'root' ? 'document' : 'transparent'},
        }),
      },
      selection: {
        get value() { return currentSelection },
        recalculate,
        replay,
      },
    }
    root.doc = doc
    paragraph.doc = doc

    const activeElement = document.createElement('div')
    reconciler = new RemoteSelectionReconciler(
      doc,
      lifecycle$,
      selection$,
      {
        getActiveElement: () => activeElement,
        hasEditorFocus: () => true,
        ownsNativeSelection: () => true,
        requestFrame: (callback: FrameRequestCallback) => {
          frameCallbacks.push(callback)
          return frameCallbacks.length
        },
        cancelFrame: () => {},
      } as any,
    )
  })

  afterEach(() => {
    reconciler.destroy()
    selection$.complete()
    lifecycle$.complete()
    yDoc.destroy()
  })

  const selectionAt = (offset: number) => {
    const point = lazyPoint({blockId: 'p1', type: 'text', offset}, doc.getBlockById)
    return new BlockSelection(point, point, 'p1', doc.getBlockById, () => 0)
  }

  const publishRemoteLifecycle = (transaction: object) => {
    const event = (phase: IRemoteDocSyncLifecycleEvent['phase']): IRemoteDocSyncLifecycleEvent => ({
      phase,
      transaction: transaction as Y.Transaction,
      origin: {},
      isUndoRedo: false,
      affectedBlockIds: new Set(['p1']),
    })
    lifecycle$.next(event('before-view-sync'))
    return () => {
      lifecycle$.next(event('after-view-sync'))
      frameCallbacks.shift()?.(0)
    }
  }

  it('recalculates a native fallback after view sync invalidates the model selection', () => {
    currentSelection = selectionAt(1)
    selection$.next(currentSelection)
    const finishSync = publishRemoteLifecycle({})

    currentSelection = null
    selection$.next(null)
    finishSync()

    expect(recalculate).toHaveBeenCalledTimes(1)
    expect(replay).not.toHaveBeenCalled()
  })

  it('does not overwrite a newer live model selection', () => {
    currentSelection = selectionAt(1)
    selection$.next(currentSelection)
    const finishSync = publishRemoteLifecycle({})

    currentSelection = selectionAt(0)
    selection$.next(currentSelection)
    finishSync()

    expect(recalculate).not.toHaveBeenCalled()
    expect(replay).not.toHaveBeenCalled()
  })
})
