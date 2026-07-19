import * as Y from 'yjs'
import {BehaviorSubject} from 'rxjs'
import {BlockNodeType} from '../../block-std'
import {BlockSelection} from './blockSelection'
import {LiveSelectionBookmarkTracker} from './live-bookmark-tracker'
import {lazyPoint} from './normalize'

describe('LiveSelectionBookmarkTracker', () => {
  let yDoc: Y.Doc
  let selection$: BehaviorSubject<BlockSelection | null>
  let p1: any
  let doc: any

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
    p1 = {
      id: 'p1',
      flavour: 'paragraph',
      nodeType: BlockNodeType.editable,
      parentId: 'root',
      parentBlock: root,
      yBlock,
      yText,
      get textLength() { return yText.length },
    }
    const blocks = new Map<string, any>([['root', root], ['p1', p1]])
    selection$ = new BehaviorSubject<BlockSelection | null>(null)
    doc = {
      yDoc,
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
        changeObserve: () => selection$.asObservable(),
      },
    }
    root.doc = doc
    p1.doc = doc
  })

  afterEach(() => {
    selection$.complete()
    yDoc.destroy()
  })

  const selectionAt = (offset: number) => {
    const point = lazyPoint({blockId: 'p1', type: 'text', offset}, doc.getBlockById)
    return new BlockSelection(point, point, 'p1', doc.getBlockById, () => 0)
  }

  it('increments revision for every published selection intent', () => {
    const tracker = new LiveSelectionBookmarkTracker(doc, selection$)
    const initial = tracker.snapshot().revision

    selection$.next(selectionAt(1))
    const first = tracker.snapshot().revision
    selection$.next(selectionAt(0))

    expect(first).toBe(initial + 1)
    expect(tracker.snapshot().revision).toBe(first + 1)
    tracker.destroy()
  })

  it('increments revision when the same model selection is published again', () => {
    const tracker = new LiveSelectionBookmarkTracker(doc, selection$)
    selection$.next(selectionAt(1))
    const first = tracker.snapshot()

    selection$.next(selectionAt(1))
    const repeated = tracker.snapshot()

    expect(repeated.revision).toBe(first.revision + 1)
    expect(repeated.bookmark?.anchor).toBe(first.bookmark?.anchor)
    expect(repeated.bookmark?.head).toBe(first.bookmark?.head)
    tracker.destroy()
  })

  it('reuses relative point bookmarks when Yjs already maps to the new caret', () => {
    const tracker = new LiveSelectionBookmarkTracker(doc, selection$)
    selection$.next(selectionAt(1))
    const before = tracker.snapshot().bookmark!

    p1.yText.insert(1, 'X')
    selection$.next(selectionAt(2))
    const after = tracker.snapshot().bookmark!

    expect(after.anchor).toBe(before.anchor)
    expect(after.head).toBe(before.head)
    expect(after.source.anchor).toEqual({blockId: 'p1', type: 'text', offset: 2})
    tracker.destroy()
  })

  it('captures new point bookmarks when the user moves independently of Yjs', () => {
    const tracker = new LiveSelectionBookmarkTracker(doc, selection$)
    selection$.next(selectionAt(1))
    const before = tracker.snapshot().bookmark!

    selection$.next(selectionAt(0))
    const after = tracker.snapshot().bookmark!

    expect(after.anchor).not.toBe(before.anchor)
    expect(after.head).not.toBe(before.head)
    tracker.destroy()
  })

  it('clears on null and stops observing after destroy', () => {
    const tracker = new LiveSelectionBookmarkTracker(doc, selection$)
    selection$.next(selectionAt(1))
    selection$.next(null)
    const cleared = tracker.snapshot()
    expect(cleared.bookmark).toBeNull()

    tracker.destroy()
    selection$.next(selectionAt(0))

    expect(tracker.snapshot()).toEqual({revision: cleared.revision, bookmark: null})
  })
})
