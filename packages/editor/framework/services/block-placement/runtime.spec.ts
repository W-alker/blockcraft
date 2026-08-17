import {BlockPlacementRuntime} from './runtime'

describe('BlockPlacementRuntime object selections', () => {
  const childrenById: Record<string, string[]> = {
    root: ['paragraph', 'layout'],
    layout: ['shape', 'word-art'],
    paragraph: [],
    shape: [],
    'word-art': [],
  }
  const parentById: Record<string, string | null> = {
    root: null,
    paragraph: 'root',
    layout: 'root',
    shape: 'layout',
    'word-art': 'layout',
  }
  const flavourById: Record<string, string> = {
    root: 'root',
    paragraph: 'paragraph',
    layout: 'placement-layout',
    shape: 'shape',
    'word-art': 'word-art',
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
})
