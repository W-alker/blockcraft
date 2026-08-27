import {BlockNodeType, type IBlockSnapshot} from '../../block-std'
import {BlockReadonlyOperation} from '../../doc/block-readonly.types'
import {
  duplicateAbsolutePlacementSelection,
  insertAbsolutePlacementCopies,
} from './duplicate-command'

const shapeSnapshot = (id: string, x = 20, y = 30): IBlockSnapshot => ({
  id,
  flavour: 'shape',
  nodeType: BlockNodeType.block,
  props: {position: {x, y}, placementLayer: 'under'},
  meta: {lock: 'owner-1', lockKind: 'template'},
  children: [{
    id: `${id}-text`,
    flavour: 'shape-text',
    nodeType: BlockNodeType.editable,
    props: {},
    meta: {lock: 'owner-1'},
    children: [{insert: '内容'}],
  }],
})

function makeHarness() {
  const source = shapeSnapshot('shape-1')
  const replay = jasmine.createSpy('replay')
  const assertInsertable = jasmine.createSpy('assertInsertable')
  const captureSelectionBeforeChange =
    jasmine.createSpy('captureSelectionBeforeChange')
  const insertBlockSnapshots = jasmine.createSpy('insertBlockSnapshots')
    .and.callFake((_parentId: string, _index: number, snapshots: IBlockSnapshot[]) =>
      snapshots.map(snapshot => snapshot.id),
    )
  const selection = {
    isInSameBlock: true,
    anchor: {blockId: source.id, type: 'selected'},
    head: {blockId: source.id, type: 'selected'},
    getBoundarySelectedChildIds: () => null,
  }
  const doc = {
    placement: {isAbsoluteObjectSelection: () => true},
    model: {
      exists: (id: string) => id === source.id || id === 'layout',
      getParentId: (id: string) => id === source.id ? 'layout' : 'root',
      indexInParent: (id: string) => id === source.id ? 0 : -1,
      toSnapshot: (id: string) => id === source.id ? source : null,
      getFlavour: (id: string) => id === 'layout' ? 'placement-layout' : 'shape',
      getYBlock: () => undefined,
    },
    schemas: {
      get: (flavour: string) => {
        if (flavour === 'shape') {
          return {metadata: {placement: {modes: ['relative', 'absolute']}}}
        }
        if (flavour === 'shape-text' || flavour === 'placement-layout') {
          return {metadata: {}}
        }
        return null
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
  return {
    doc,
    source,
    selection: selection as any,
    replay,
    assertInsertable,
    captureSelectionBeforeChange,
    insertBlockSnapshots,
  }
}

describe('absolute placement duplication', () => {
  it('duplicates a selected object with fresh IDs, unlocked meta and a visible offset', () => {
    const h = makeHarness()

    const result = duplicateAbsolutePlacementSelection(
      h.doc,
      h.selection,
      'input',
    )

    expect(result?.parentId).toBe('layout')
    expect(result?.index).toBe(1)
    expect(h.assertInsertable).toHaveBeenCalledOnceWith(
      'layout',
      BlockReadonlyOperation.Insert,
      'input',
    )
    expect(h.captureSelectionBeforeChange).toHaveBeenCalledTimes(1)
    const copies = h.insertBlockSnapshots.calls.mostRecent().args[2]
    expect(copies).toHaveSize(1)
    expect(copies[0].id).not.toBe(h.source.id)
    const copiedChild = copies[0].children[0] as IBlockSnapshot
    const sourceChild = h.source.children[0] as IBlockSnapshot
    expect(copiedChild.id).not.toBe(sourceChild.id)
    expect(copies[0].props['position']).toEqual({x: 32, y: 42})
    expect(copies[0].props['placementLayer']).toBe('under')
    expect(copies[0].meta['lock']).toBeUndefined()
    expect(copiedChild.meta['lock']).toBeUndefined()
    expect(h.replay).toHaveBeenCalledWith({
      anchor: {blockId: copies[0].id, type: 'selected'},
      head: {blockId: copies[0].id, type: 'selected'},
      commonParent: copies[0].id,
    })
  })

  it('pastes only placement-capable block roots into an absolute plane', () => {
    const h = makeHarness()
    const paragraph: IBlockSnapshot = {
      id: 'paragraph-1',
      flavour: 'paragraph',
      nodeType: BlockNodeType.editable,
      props: {},
      meta: {},
      children: [{insert: 'text'}],
    }

    expect(insertAbsolutePlacementCopies(
      h.doc,
      h.selection,
      [paragraph],
      BlockReadonlyOperation.Paste,
      'clipboard',
    )).toBeNull()
    expect(h.insertBlockSnapshots).not.toHaveBeenCalled()
    expect(h.replay).not.toHaveBeenCalled()
  })

  it('rejects the whole payload before insertion when a nested snapshot is invalid', () => {
    const h = makeHarness()
    const invalid = shapeSnapshot('shape-invalid')
    ;(invalid.children[0] as IBlockSnapshot).flavour = 'unknown-child' as any

    expect(insertAbsolutePlacementCopies(
      h.doc,
      h.selection,
      [h.source, invalid],
      BlockReadonlyOperation.Paste,
      'clipboard',
    )).toBeNull()
    expect(h.insertBlockSnapshots).not.toHaveBeenCalled()
    expect(h.captureSelectionBeforeChange).not.toHaveBeenCalled()
  })
})
