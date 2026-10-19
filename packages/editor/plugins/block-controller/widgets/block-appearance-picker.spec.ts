import {BlockAppearancePickerComponent} from './block-appearance-picker'
import {BlockNodeType} from '../../../framework'

describe('BlockAppearancePickerComponent', () => {
  it('writes only the active block and deletes transparent overrides', () => {
    const h = createHarness()

    h.component.onColorPicked({type: 'backColor', color: '#FBF3DB'})
    h.component.onColorPicked({type: 'borderColor', color: 'transparent'})

    expect(h.block.updateProps).toHaveBeenCalledWith({backColor: '#FBF3DB'})
    expect(h.block.updateProps).toHaveBeenCalledWith({borderColor: null})
    expect(h.parent.updateProps).not.toHaveBeenCalled()
    expect(h.component.activeColors).toEqual({
      backColor: '#FBF3DB',
      borderColor: null,
    })
  })

  it('writes every selected editable block in one transaction, including unmounted blocks', () => {
    const h = createMultiHarness()

    expect(h.component.activeColors).toEqual({
      backColor: '#DDEDEA',
      borderColor: null,
    })

    h.component.onColorPicked({type: 'backColor', color: '#FBF3DB'})
    h.component.onColorPicked({type: 'borderColor', color: 'transparent'})

    expect(h.doc.crud.transact).toHaveBeenCalledTimes(2)
    expect(h.doc.crud.updateBlockProps.calls.allArgs()).toEqual([
      ['p1', {backColor: '#FBF3DB'}],
      ['p2', {backColor: '#FBF3DB'}],
      ['p3', {backColor: '#FBF3DB'}],
      ['p1', {borderColor: null}],
      ['p2', {borderColor: null}],
      ['p3', {borderColor: null}],
    ])
    expect(h.block.updateProps).not.toHaveBeenCalled()
    expect(h.doc.getBlockById).not.toHaveBeenCalledWith('p2')
    expect(h.doc.getBlockById).not.toHaveBeenCalledWith('p3')
  })

  it('writes only the eligible target subset of a mixed multi-block selection', () => {
    const h = createMultiHarness({targetIds: ['p2']})

    h.component.onColorPicked({type: 'backColor', color: '#FBF3DB'})

    expect(h.doc.crud.transact).toHaveBeenCalledTimes(1)
    expect(h.doc.crud.updateBlockProps).toHaveBeenCalledOnceWith(
      'p2',
      {backColor: '#FBF3DB'},
    )
    expect(h.block.updateProps).not.toHaveBeenCalled()
  })

  it('fails closed when the multi-selection changes or any target becomes protected', () => {
    const changed = createMultiHarness()
    changed.selection.end.index = 2
    changed.component.onColorPicked({type: 'backColor', color: '#fff'})

    const protectedRange = createMultiHarness({protectedId: 'p2'})
    protectedRange.component.onColorPicked({type: 'backColor', color: '#fff'})

    expect(changed.doc.crud.updateBlockProps).not.toHaveBeenCalled()
    expect(protectedRange.doc.crud.updateBlockProps).not.toHaveBeenCalled()
  })

  it('fails closed for readonly, protected, or stale blocks', () => {
    const readonlyHarness = createHarness({readonly: true})
    readonlyHarness.component.onColorPicked({type: 'backColor', color: '#fff'})

    const descendantHarness = createHarness({containsReadonly: true})
    descendantHarness.component.onColorPicked({type: 'backColor', color: '#fff'})

    const staleHarness = createHarness({stale: true})
    staleHarness.component.onColorPicked({type: 'backColor', color: '#fff'})

    expect(readonlyHarness.block.updateProps).not.toHaveBeenCalled()
    expect(descendantHarness.block.updateProps).not.toHaveBeenCalled()
    expect(staleHarness.block.updateProps).not.toHaveBeenCalled()
  })

  it('ignores non-appearance color events', () => {
    const h = createHarness()

    h.component.onColorPicked({type: 'color', color: '#fff'})

    expect(h.block.updateProps).not.toHaveBeenCalled()
  })

  it('offers and writes appearance colors only for editable blocks', () => {
    const editable = createHarness()
    expect(editable.component.colorGroups.map(group => group.type))
      .toEqual(['backColor', 'borderColor'])

    const nonEditable = createHarness({nodeType: BlockNodeType.void})
    expect(nonEditable.component.colorGroups.map(group => group.type))
      .toEqual([])

    nonEditable.component.onColorPicked({type: 'borderColor', color: '#DFAB01'})
    nonEditable.component.onColorPicked({type: 'backColor', color: '#FBF3DB'})

    expect(nonEditable.block.updateProps)
      .not.toHaveBeenCalledWith({borderColor: '#DFAB01'})
    expect(nonEditable.block.updateProps).not.toHaveBeenCalled()
  })
})

function createHarness(options: {
  readonly?: boolean
  containsReadonly?: boolean
  stale?: boolean
  nodeType?: BlockNodeType
} = {}) {
  const parent = {updateProps: jasmine.createSpy('parentUpdateProps')}
  const block = {
    id: 'p1',
    nodeType: options.nodeType ?? BlockNodeType.editable,
    props: {backColor: '#DDEDEA', borderColor: '#E9E9E7'},
    isReadonly: false,
    updateProps: jasmine.createSpy('updateProps'),
  }
  const doc = {
    getBlockById: jasmine.createSpy('getBlockById')
      .and.returnValue(options.stale ? {...block} : block),
    readonlyManager: {
      isReadonly: jasmine.createSpy('isReadonly').and.returnValue(!!options.readonly),
      containsReadonly: jasmine.createSpy('containsReadonly')
        .and.returnValue(!!options.containsReadonly),
    },
    logger: {warn: jasmine.createSpy('warn')},
  }
  const component = new BlockAppearancePickerComponent()
  component.doc = doc as any
  component.block = block as any
  return {component, block, parent}
}

function createMultiHarness(options: {
  protectedId?: string
  targetIds?: string[]
} = {}) {
  const ids = ['p1', 'p2', 'p3']
  const props: Record<string, Record<string, unknown>> = {
    p1: {backColor: '#DDEDEA', borderColor: '#E9E9E7'},
    p2: {backColor: '#DDEDEA', borderColor: '#DFAB01'},
    p3: {backColor: '#DDEDEA', borderColor: null},
  }
  const block = {
    id: 'p1',
    nodeType: BlockNodeType.editable,
    props: props['p1'],
    isReadonly: false,
    updateProps: jasmine.createSpy('updateProps'),
  }
  const selection = {
    start: {blockId: 'root', type: 'boundary', index: 0},
    end: {blockId: 'root', type: 'boundary', index: 3},
    isInSameBlock: false,
  }
  const transact = jasmine.createSpy('transact').and.callFake((run: () => void) => run())
  const doc = {
    isReadonly: false,
    selection: {value: selection},
    model: {
      exists: jasmine.createSpy('exists').and.callFake((id: string) => id === 'root' || ids.includes(id)),
      getNodeType: jasmine.createSpy('getNodeType').and.callFake((id: string) =>
        ids.includes(id) ? BlockNodeType.editable : BlockNodeType.root
      ),
      getProps: jasmine.createSpy('getProps').and.callFake((id: string) => props[id]),
      getChildrenIds: jasmine.createSpy('getChildrenIds').and.callFake((id: string) => id === 'root' ? ids : []),
      getParentId: jasmine.createSpy('getParentId').and.callFake((id: string) => ids.includes(id) ? 'root' : null),
      getPath: jasmine.createSpy('getPath').and.callFake((id: string) => id === 'root' ? ['root'] : ['root', id]),
      indexInParent: jasmine.createSpy('indexInParent').and.callFake((id: string) => ids.indexOf(id)),
    },
    getBlockById: jasmine.createSpy('getBlockById').and.callFake((id: string) => {
      if (id === 'p1') return block
      throw new Error(`view not mounted: ${id}`)
    }),
    readonlyManager: {
      isReadonly: jasmine.createSpy('isReadonly').and.callFake((id: string) => id === options.protectedId),
      containsReadonly: jasmine.createSpy('containsReadonly').and.returnValue(false),
    },
    crud: {
      transact,
      updateBlockProps: jasmine.createSpy('updateBlockProps'),
    },
    logger: {warn: jasmine.createSpy('warn')},
  }
  const component = new BlockAppearancePickerComponent()
  component.doc = doc as any
  component.block = block as any
  component.targetBlockIds = options.targetIds ?? ids
  component.selectionBlockIds = ids
  return {component, block, doc, selection}
}
