import {CalloutBlockToolbar} from './callout.toolbar'

describe('CalloutBlockToolbar container appearance', () => {
  it('keeps text, background, and border colors for callout blocks', () => {
    const block = makeBlock('callout', {
      color: '#333333',
      backColor: '#FFE6CD',
      borderColor: '#DFAB01',
    })
    const toolbar = new CalloutBlockToolbar()
    toolbar.containerBlock = block as any

    toolbar.ngOnInit()

    expect(toolbar.colorGroups.map(group => group.type))
      .toEqual(['color', 'backColor', 'borderColor'])
    expect(toolbar.activeColors).toEqual({
      color: '#333333',
      backColor: '#FFE6CD',
      borderColor: '#DFAB01',
    })
  })

  it('offers only background and border colors for render-unit blocks', () => {
    const block = makeBlock('render-unit', {})
    const toolbar = new CalloutBlockToolbar()
    toolbar.containerBlock = block as any

    toolbar.ngOnInit()
    toolbar.onColorPicked({type: 'backColor', color: '#FBF3DB'})
    toolbar.onColorPicked({type: 'borderColor', color: '#DFAB01'})
    toolbar.onColorPicked({type: 'color', color: '#333333'})

    expect(toolbar.colorGroups.map(group => group.type))
      .toEqual(['backColor', 'borderColor'])
    expect(block.updateProps.calls.allArgs()).toEqual([
      [{backColor: '#FBF3DB'}],
      [{borderColor: '#DFAB01'}],
    ])
    expect(toolbar.activeColors).toEqual({
      backColor: '#FBF3DB',
      borderColor: '#DFAB01',
    })
  })
})

function makeBlock(
  flavour: 'callout' | 'render-unit',
  props: Record<string, string>,
) {
  return {
    flavour,
    props,
    updateProps: jasmine.createSpy('updateProps'),
  }
}
