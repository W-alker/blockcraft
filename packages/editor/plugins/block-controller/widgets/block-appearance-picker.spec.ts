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
