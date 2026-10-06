import {TestBed} from '@angular/core/testing'
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

  it('offers background and border panels for render-unit blocks', () => {
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

  it('writes border width and style without replacing unrelated props', () => {
    const block = makeBlock('render-unit', {borderColor: '#DFAB01'})
    const toolbar = new CalloutBlockToolbar()
    toolbar.containerBlock = block as any
    toolbar.ngOnInit()
    toolbar.changeBorderWidth(2)
    toolbar.changeBorderStyle('dashed')

    const allSides = {top: '2px dashed #DFAB01', right: '2px dashed #DFAB01',
      bottom: '2px dashed #DFAB01', left: '2px dashed #DFAB01'}
    expect(block.updateProps).toHaveBeenCalledWith({borders: allSides, borderColor: null})
  })

  it('keeps omitted sides omitted when editing an existing partial border', () => {
    const block = makeBlock('render-unit', {borders: {top: '1px solid #112233'}} as any)
    const toolbar = new CalloutBlockToolbar()
    toolbar.containerBlock = block as any
    toolbar.ngOnInit()
    toolbar.onColorPicked({type: 'borderColor', color: '#AABBCC'})

    expect(block.updateProps).toHaveBeenCalledWith({
      borders: {top: '1px solid #AABBCC'}, borderColor: null,
    })
  })

  it('clears an existing structured border through the color picker', () => {
    const block = makeBlock('render-unit', {borders: {top: '2px dashed #112233'}} as any)
    const toolbar = new CalloutBlockToolbar()
    toolbar.containerBlock = block as any
    toolbar.ngOnInit()
    toolbar.onColorPicked({type: 'borderColor', color: null})

    expect(block.updateProps).toHaveBeenCalledWith({borders: null, borderColor: null})
    expect(toolbar.activeColors['borderColor']).toBeNull()
  })
})

function makeBlock(
  flavour: 'callout' | 'render-unit',
  props: Record<string, any>,
) {
  return {
    flavour,
    props,
    updateProps: jasmine.createSpy('updateProps'),
  }
}

for (const flavour of ['render-unit', 'callout'] as const) {
  it(`renders the compact entry for ${flavour}`, () => {
    const fixture = TestBed.createComponent(CalloutBlockToolbar)
    fixture.componentRef.setInput('containerBlock', makeBlock(flavour, {}))
    fixture.detectChanges()
    const element: HTMLElement = fixture.nativeElement
    if (flavour === 'render-unit') {
      expect(element.querySelector('[data-bc-region-format-toolbar]')).not.toBeNull()
      expect(element.querySelector('bc-float-toolbar-item')).toBeNull()
      expect(element.querySelectorAll('.object-format__rail button').length).toBe(1)
      expect(element.querySelector('.object-format__panel')).toBeNull()
      ;(element.querySelector('[aria-label="内容区域设置"]') as HTMLButtonElement).click()
      fixture.detectChanges()
      expect(element.querySelector('cs-segmented')).not.toBeNull()
      expect(element.querySelectorAll('.object-format__tab-section')[0].hasAttribute('hidden')).toBeFalse()
      ;(element.querySelectorAll('cs-segmented label')[1] as HTMLLabelElement).click()
      fixture.detectChanges()
      expect(element.querySelectorAll('.object-format__tab-section')[1].hasAttribute('hidden')).toBeFalse()
      expect(element.querySelector('.region-format__fields cs-input-number input')).not.toBeNull()
      expect(element.querySelector('.region-format__fields cs-select')).not.toBeNull()
      expect(element.querySelectorAll('.object-format__panel cs-color-picker').length).toBe(2)
      expect(element.querySelector('.object-format__panel bc-color-picker')).toBeNull()
    } else {
      expect(element.querySelector('bc-float-toolbar-item')).not.toBeNull()
    }
    fixture.destroy()
  })
}
