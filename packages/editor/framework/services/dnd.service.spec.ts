import { DocDndService } from "./dnd.service"
import { BLOCK_POSITION } from "../doc"

function makeBlock(id: string, parentId: string | null, flavour = 'paragraph', extra: Partial<any> = {}): any {
  const host = document.createElement('div')
  return {
    id,
    flavour,
    parentId,
    hostElement: host,
    props: { depth: 0 },
    parentBlock: null as any,
    getIndexOfParent: jasmine.createSpy(`getIndexOfParent-${id}`).and.callFake(() => (extra as any)['__index'] ?? 0),
    updateProps: jasmine.createSpy(`updateProps-${id}`),
    ...extra,
  }
}

function makeMockDoc(blocks: Record<string, any>): any {
  const calls: { moveBlocks: any[][], transact: number, warn: any[] } = { moveBlocks: [], transact: 0, warn: [] }
  return {
    event: { add: () => {}, bindHotkey: () => {} },
    isReadonly: false,
    schemas: {
      isValidChildren: jasmine.createSpy('isValidChildren').and.returnValue(true),
      has: () => false,
      get: () => null,
      createSnapshot: () => null,
    },
    getBlockById: (id: string) => blocks[id],
    compareBlockPosition: jasmine.createSpy('compareBlockPosition').and.returnValue(BLOCK_POSITION.AFTER),
    messageService: { warn: (msg: string) => calls.warn.push(msg), success: () => {} },
    crud: {
      transact: (fn: () => void) => { calls.transact++; fn() },
      moveBlocks: (...args: any[]) => calls.moveBlocks.push(args),
      insertBlocks: () => {},
      deleteBlockById: () => {},
    },
    injector: { get: () => null },
    _calls: calls,
  }
}

describe('DocDndService.onSortBlocks — same parent reorder', () => {
  it('moves contiguous siblings as a single moveBlocks call', () => {
    const parent = makeBlock('p', null)
    const b1 = makeBlock('b1', 'p', 'paragraph', { __index: 0 })
    const b2 = makeBlock('b2', 'p', 'paragraph', { __index: 1 })
    const target = makeBlock('t', 'p', 'paragraph', { __index: 5 })
    b1.parentBlock = parent
    b2.parentBlock = parent
    target.parentBlock = parent

    const doc = makeMockDoc({ p: parent, b1, b2, t: target })
    const svc = new DocDndService(doc)
    svc.onSortBlocks([b1, b2], target, 'after')

    expect(doc._calls.moveBlocks.length).toBe(1)
    const [sourceParentId, firstIdx, count, targetParentId, targetIdx] = doc._calls.moveBlocks[0]
    expect(sourceParentId).toBe('p')
    expect(firstIdx).toBe(0)
    expect(count).toBe(2)
    expect(targetParentId).toBe('p')
    // Same parent, sources [0, 1] before target (idx 5), position='after':
    //   delete(0, 2) shifts target down by count(2) to idx 3; for 'after' we want
    //   sources right after target, so insert at 3 + 1 = 4.
    expect(targetIdx).toBe(4)
  })

  it('drops "before" target lands sources immediately before target (count-aware)', () => {
    // [b1, b2, c, d, e, t, ...] — drop sources [b1, b2] before t at index 5
    // After delete(0, 2), t is at index 3. To land sources just before t, insert at 3.
    const parent = makeBlock('p', null)
    const b1 = makeBlock('b1', 'p', 'paragraph', { __index: 0 })
    const b2 = makeBlock('b2', 'p', 'paragraph', { __index: 1 })
    const target = makeBlock('t', 'p', 'paragraph', { __index: 5 })
    b1.parentBlock = parent
    b2.parentBlock = parent
    target.parentBlock = parent

    const doc = makeMockDoc({ p: parent, b1, b2, t: target })
    const svc = new DocDndService(doc)
    svc.onSortBlocks([b1, b2], target, 'before')

    expect(doc._calls.moveBlocks.length).toBe(1)
    const [, firstIdx, count, , targetIdx] = doc._calls.moveBlocks[0]
    expect(firstIdx).toBe(0)
    expect(count).toBe(2)
    expect(targetIdx).toBe(3)   // Was 4 in buggy code (off-by-(count-1))
  })

  it('no-ops when dropping "after" the block immediately before the source range', () => {
    const parent = makeBlock('p', null)
    const adjacentBefore = makeBlock('adj', 'p', 'paragraph', { __index: 0 })
    const b1 = makeBlock('b1', 'p', 'paragraph', { __index: 1 })
    const b2 = makeBlock('b2', 'p', 'paragraph', { __index: 2 })
    adjacentBefore.parentBlock = parent
    b1.parentBlock = parent
    b2.parentBlock = parent

    const doc = makeMockDoc({ p: parent, adj: adjacentBefore, b1, b2 })
    const svc = new DocDndService(doc)
    svc.onSortBlocks([b1, b2], adjacentBefore, 'after')

    // Adjacent no-op: target at firstIdx - 1 with position 'after' → already there.
    expect(doc._calls.moveBlocks.length).toBe(0)
  })

  it('no-ops when dropping "before" the block immediately after the source range', () => {
    const parent = makeBlock('p', null)
    const b1 = makeBlock('b1', 'p', 'paragraph', { __index: 0 })
    const b2 = makeBlock('b2', 'p', 'paragraph', { __index: 1 })
    const adjacentAfter = makeBlock('adj', 'p', 'paragraph', { __index: 2 })
    b1.parentBlock = parent
    b2.parentBlock = parent
    adjacentAfter.parentBlock = parent

    const doc = makeMockDoc({ p: parent, b1, b2, adj: adjacentAfter })
    const svc = new DocDndService(doc)
    svc.onSortBlocks([b1, b2], adjacentAfter, 'before')

    // Adjacent no-op: target at lastIdx + 1 with position 'before' → already there.
    expect(doc._calls.moveBlocks.length).toBe(0)
  })
})

describe('DocDndService.onSortBlocks — cross parent', () => {
  it('rejects when any source is invalid child of target parent', () => {
    const parentA = makeBlock('pa', null)
    const parentB = makeBlock('pb', null, 'column')
    const b1 = makeBlock('b1', 'pa', 'paragraph', { __index: 0 })
    const b2 = makeBlock('b2', 'pa', 'image', { __index: 1 })
    const target = makeBlock('t', 'pb', 'paragraph', { __index: 0 })
    b1.parentBlock = parentA
    b2.parentBlock = parentA
    target.parentBlock = parentB

    const doc = makeMockDoc({ pa: parentA, pb: parentB, b1, b2, t: target })
    ;(doc.schemas.isValidChildren as jasmine.Spy).and.callFake((flavour: string) => flavour !== 'image')

    const svc = new DocDndService(doc)
    svc.onSortBlocks([b1, b2], target, 'before')

    expect(doc._calls.moveBlocks.length).toBe(0)
    expect(doc._calls.warn).toEqual(['不允许的移动'])
  })

  it('moves valid blocks across parents in one moveBlocks call', () => {
    const parentA = makeBlock('pa', null)
    const parentB = makeBlock('pb', null)
    const b1 = makeBlock('b1', 'pa', 'paragraph', { __index: 0 })
    const b2 = makeBlock('b2', 'pa', 'paragraph', { __index: 1 })
    const target = makeBlock('t', 'pb', 'paragraph', { __index: 3 })
    b1.parentBlock = parentA
    b2.parentBlock = parentA
    target.parentBlock = parentB

    const doc = makeMockDoc({ pa: parentA, pb: parentB, b1, b2, t: target })
    // Cross-parent move: delete from source parent doesn't affect target parent
    // indices, so insert at target's original index (3) for 'before' drop.
    const svc = new DocDndService(doc)
    svc.onSortBlocks([b1, b2], target, 'before')

    expect(doc._calls.moveBlocks.length).toBe(1)
    const [, firstIdx, count, targetParentId, targetIdx] = doc._calls.moveBlocks[0]
    expect(firstIdx).toBe(0)
    expect(count).toBe(2)
    expect(targetParentId).toBe('pb')
    expect(targetIdx).toBe(3)
  })

  it('returns silently when target is descendant of any source', () => {
    const parent = makeBlock('p', null)
    const b1 = makeBlock('b1', 'p', 'paragraph', { __index: 0 })
    const b2 = makeBlock('b2', 'p', 'paragraph', { __index: 1 })
    const target = makeBlock('t', 'p', 'paragraph', { __index: 5 })
    b1.parentBlock = parent
    b2.parentBlock = parent
    target.parentBlock = parent
    b1.hostElement.appendChild(target.hostElement)   // target is inside b1

    const doc = makeMockDoc({ p: parent, b1, b2, t: target })
    const svc = new DocDndService(doc)
    svc.onSortBlocks([b1, b2], target, 'before')

    expect(doc._calls.moveBlocks.length).toBe(0)
    expect(doc._calls.warn.length).toBe(0)
  })

  it('forwards to onSortBlock when sources.length === 1', () => {
    const parent = makeBlock('p', null)
    const b1 = makeBlock('b1', 'p', 'paragraph', { __index: 0 })
    const target = makeBlock('t', 'p', 'paragraph', { __index: 2 })
    b1.parentBlock = parent
    target.parentBlock = parent

    const doc = makeMockDoc({ p: parent, b1, t: target })
    const svc = new DocDndService(doc)
    spyOn(svc, 'onSortBlock')
    svc.onSortBlocks([b1], target, 'after')

    expect(svc.onSortBlock).toHaveBeenCalledWith(b1, target, 'after')
  })
})

describe('DocDndService.onSortBlocks — column path', () => {
  function makeColumnMockDoc(blocks: Record<string, any>) {
    const doc = makeMockDoc(blocks)
    const newColumnSnapshot = { id: 'new-col', flavour: 'column', props: {}, children: [], meta: {} }
    const columnsSnapshot = { id: 'new-cols', flavour: 'columns', props: {}, children: [], meta: {} }
    doc.schemas.has = (flavour: string) => flavour === 'column' || flavour === 'columns'
    doc.schemas.get = (flavour: string) => flavour === 'column' || flavour === 'columns'
      ? { metadata: {}, flavour }
      : null
    doc.schemas.createSnapshot = (flavour: string) =>
      flavour === 'column' ? { ...newColumnSnapshot } :
      flavour === 'columns' ? { ...columnsSnapshot, children: [{ ...newColumnSnapshot, id: 'c1' }, { ...newColumnSnapshot, id: 'c2' }] } :
      null
    doc.crud.insertBlocks = jasmine.createSpy('insertBlocks')
    return doc
  }

  it('drops multi-block into a new column to the right of an existing column member', () => {
    const root = makeBlock('root', null, 'root', { childrenLength: 3 })
    const columnsBlock = makeBlock('cols', 'root', 'columns', { __index: 0, childrenLength: 2 })
    const existingCol = makeBlock('col1', 'cols', 'column', { __index: 0, childrenLength: 2 })
    const b1 = makeBlock('b1', 'pa', 'paragraph', { __index: 0 })
    const b2 = makeBlock('b2', 'pa', 'paragraph', { __index: 1 })
    const parentA = makeBlock('pa', 'root', 'section', { __index: 1 })
    const targetInCol = makeBlock('t', 'col1', 'paragraph', { __index: 0 })
    b1.parentBlock = parentA
    b2.parentBlock = parentA
    parentA.parentBlock = root
    targetInCol.parentBlock = existingCol
    existingCol.parentBlock = columnsBlock
    columnsBlock.parentBlock = root

    const doc = makeColumnMockDoc({ root, cols: columnsBlock, col1: existingCol, pa: parentA, b1, b2, t: targetInCol })
    const svc = new DocDndService(doc)
    svc.onSortBlocks([b1, b2], targetInCol, 'right')

    // Expect: new column inserted next to existingCol, then both b1 and b2 moved into it.
    expect((doc.crud.insertBlocks as jasmine.Spy)).toHaveBeenCalled()
    expect(doc._calls.moveBlocks.length).toBe(1)
    const [sourceParentId, firstIdx, count] = doc._calls.moveBlocks[0]
    expect(sourceParentId).toBe('pa')
    expect(firstIdx).toBe(0)
    expect(count).toBe(2)
  })

  it('rejects column drop when existing parent already has 8 columns', () => {
    const root = makeBlock('root', null, 'root')
    const columnsBlock = makeBlock('cols', 'root', 'columns', { childrenLength: 8 })
    const existingCol = makeBlock('col1', 'cols', 'column', { __index: 0 })
    const parentA = makeBlock('pa', 'root', 'section')
    const b1 = makeBlock('b1', 'pa', 'paragraph', { __index: 0 })
    const b2 = makeBlock('b2', 'pa', 'paragraph', { __index: 1 })
    const targetInCol = makeBlock('t', 'col1', 'paragraph', { __index: 0 })
    b1.parentBlock = parentA
    b2.parentBlock = parentA
    parentA.parentBlock = root
    targetInCol.parentBlock = existingCol
    existingCol.parentBlock = columnsBlock
    columnsBlock.parentBlock = root

    const doc = makeColumnMockDoc({ root, cols: columnsBlock, col1: existingCol, pa: parentA, b1, b2, t: targetInCol })
    const svc = new DocDndService(doc)
    svc.onSortBlocks([b1, b2], targetInCol, 'right')

    expect(doc._calls.warn).toEqual(['分栏最多支持8列'])
    expect(doc._calls.moveBlocks.length).toBe(0)
  })
})
