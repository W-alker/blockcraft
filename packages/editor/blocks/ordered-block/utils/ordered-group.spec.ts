import {IBlockProps} from '../../../framework'
import {
  applyOrderedMarkerStyle,
  resolveOrderedMarkerGroupIds,
} from './ordered-group'

type TestBlock = {flavour: string; props: IBlockProps}

const createHarness = (blocks: Array<[string, string, IBlockProps]>) => {
  const byId = new Map<string, TestBlock>()
  blocks.forEach(([id, flavour, props]) => byId.set(id, {flavour, props}))
  const ids = blocks.map(([id]) => id)
  const updateBlockProps = jasmine.createSpy('updateBlockProps').and.callFake(
    (id: string, patch: IBlockProps) => Object.assign(byId.get(id)!.props, patch),
  )
  const transact = jasmine.createSpy('transact').and.callFake((run: () => void) => run())
  const readonlyIds = new Set<string>()
  const doc = {
    model: {
      getFlavour: (id: string) => byId.get(id)?.flavour,
      getProps: (id: string) => byId.get(id)?.props,
      getParentId: (id: string) => byId.has(id) ? 'root' : null,
      getChildrenIds: () => ids,
    },
    readonlyManager: {
      isReadonly: (id: string) => readonlyIds.has(id),
    },
    crud: {transact, updateBlockProps},
  } as unknown as BlockCraft.Doc
  return {doc, byId, readonlyIds, transact, updateBlockProps}
}

describe('ordered marker group', () => {
  it('stops plain groups at same-level non-ordered siblings', () => {
    const {doc} = createHarness([
      ['a', 'ordered', {depth: 0}],
      ['a-child', 'ordered', {depth: 1}],
      ['b', 'ordered', {depth: 0}],
      ['paragraph', 'paragraph', {depth: 0}],
      ['c', 'ordered', {depth: 0}],
    ])

    expect(resolveOrderedMarkerGroupIds(doc, 'a')).toEqual(['a', 'b'])
    expect(resolveOrderedMarkerGroupIds(doc, 'a-child')).toEqual(['a-child'])
    expect(resolveOrderedMarkerGroupIds(doc, 'c')).toEqual(['c'])
  })

  it('keeps heading groups across same-level non-ordered siblings', () => {
    const {doc} = createHarness([
      ['a', 'ordered', {depth: 0, heading: 1}],
      ['paragraph', 'paragraph', {depth: 0}],
      ['b', 'ordered', {depth: 0, heading: 1}],
    ])

    expect(resolveOrderedMarkerGroupIds(doc, 'a')).toEqual(['a', 'b'])
    expect(resolveOrderedMarkerGroupIds(doc, 'b')).toEqual(['a', 'b'])
  })

  it('uses the same shallower-depth and heading pruning boundaries as counters', () => {
    const {doc} = createHarness([
      ['h1-a', 'ordered', {depth: 0, heading: 1}],
      ['h2', 'ordered', {depth: 0, heading: 2}],
      ['h1-b', 'ordered', {depth: 0, heading: 1}],
      ['child', 'ordered', {depth: 1}],
      ['root-boundary', 'ordered', {depth: 0}],
      ['child-next', 'ordered', {depth: 1}],
    ])
    expect(resolveOrderedMarkerGroupIds(doc, 'h1-a')).toEqual(['h1-a', 'h1-b'])
    expect(resolveOrderedMarkerGroupIds(doc, 'child')).toEqual(['child'])
    expect(resolveOrderedMarkerGroupIds(doc, 'child-next')).toEqual(['child-next'])
  })

  it('treats an explicit restart as a numbered-group boundary', () => {
    const {doc} = createHarness([
      ['a', 'ordered', {depth: 0}],
      ['restart', 'ordered', {depth: 0, start: 5}],
      ['b', 'ordered', {depth: 0}],
      ['next-restart', 'ordered', {depth: 0, start: 20}],
    ])

    expect(resolveOrderedMarkerGroupIds(doc, 'a')).toEqual(['a'])
    expect(resolveOrderedMarkerGroupIds(doc, 'restart')).toEqual(['restart', 'b'])
    expect(resolveOrderedMarkerGroupIds(doc, 'b')).toEqual(['restart', 'b'])
    expect(resolveOrderedMarkerGroupIds(doc, 'next-restart')).toEqual(['next-restart'])
  })

  it('writes distinct reached groups in one transaction and skips readonly blocks', () => {
    const {doc, readonlyIds, transact, updateBlockProps} = createHarness([
      ['a', 'ordered', {depth: 0}],
      ['b', 'ordered', {depth: 0}],
      ['break', 'paragraph', {depth: 0}],
      ['c', 'ordered', {depth: 0}],
    ])
    readonlyIds.add('b')

    applyOrderedMarkerStyle(doc, ['a', 'b', 'c'], 'a2')

    expect(transact).toHaveBeenCalledTimes(1)
    expect(updateBlockProps.calls.allArgs()).toEqual([
      ['a', {ms: 'a2'}],
      ['c', {ms: 'a2'}],
    ])
  })
})
