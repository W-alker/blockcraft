import {BlockPlacementRuntime} from './runtime'

describe('BlockPlacementRuntime object selections', () => {
  const childrenById: Record<string, string[]> = {
    root: ['paragraph', 'flow-group', 'layout'],
    layout: ['shape', 'word-art', 'absolute-group'],
    paragraph: [],
    'flow-group': ['flow-group-shape'],
    'flow-group-shape': [],
    shape: [],
    'word-art': [],
    'absolute-group': ['absolute-group-shape'],
    'absolute-group-shape': [],
  }
  const parentById: Record<string, string | null> = {
    root: null,
    paragraph: 'root',
    'flow-group': 'root',
    'flow-group-shape': 'flow-group',
    layout: 'root',
    shape: 'layout',
    'word-art': 'layout',
    'absolute-group': 'layout',
    'absolute-group-shape': 'absolute-group',
  }
  const flavourById: Record<string, string> = {
    root: 'root',
    paragraph: 'paragraph',
    'flow-group': 'object-group',
    'flow-group-shape': 'shape',
    layout: 'placement-layout',
    shape: 'shape',
    'word-art': 'word-art',
    'absolute-group': 'object-group',
    'absolute-group-shape': 'shape',
  }
  const runtime = new BlockPlacementRuntime({
    rootId: 'root',
    model: {
      getChildrenIds: (id: string) => childrenById[id] ?? [],
      getParentId: (id: string) => parentById[id] ?? null,
      getFlavour: (id: string) => flavourById[id],
    },
  } as any)

  it('recognizes a placement-layout boundary as one object-owned selection', () => {
    const selection = {
      isInSameBlock: true,
      anchor: {blockId: 'layout', type: 'boundary', index: 0},
      head: {blockId: 'layout', type: 'boundary', index: 2},
      getBoundarySelectedChildIds: () => ['shape', 'word-art'],
    } as any

    expect(runtime.getAbsoluteObjectSelectionIds(selection))
      .toEqual(['shape', 'word-art'])
    expect(runtime.isAbsoluteObjectSelection(selection)).toBeTrue()
  })

  it('does not classify a root boundary as an absolute object selection', () => {
    const selection = {
      isInSameBlock: true,
      anchor: {blockId: 'root', type: 'boundary', index: 0},
      head: {blockId: 'root', type: 'boundary', index: 2},
      getBoundarySelectedChildIds: () => ['paragraph', 'layout'],
    } as any

    expect(runtime.getAbsoluteObjectSelectionIds(selection)).toBeNull()
    expect(runtime.isAbsoluteObjectSelection(selection)).toBeFalse()
  })

  it('allows gaps only for an object group that has returned to root flow', () => {
    expect(runtime.allowsGapCursor('flow-group')).toBeTrue()
    expect(runtime.allowsGapCursor('layout')).toBeFalse()
    expect(runtime.allowsGapCursor('absolute-group')).toBeFalse()
    expect(runtime.allowsGapCursor('flow-group-shape')).toBeFalse()
    expect(runtime.allowsGapCursor('absolute-group-shape')).toBeFalse()
  })
})
