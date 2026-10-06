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
      .toEqual(['backColor', 'borderColor', 'textFill'])
    expect(block.updateProps.calls.allArgs()).toEqual([
      [{backColor: '#FBF3DB'}],
      [{borderColor: '#DFAB01'}],
    ])
    expect(toolbar.activeColors).toEqual({
      backColor: '#FBF3DB',
      borderColor: '#DFAB01',
      textFill: null,
    })
  })

  it('writes region padding and only the edited text-style field', () => {
    const block = makeBlock('render-unit', {p: [4, 8], textFont: '18px 400 normal'})
    const toolbar = new CalloutBlockToolbar()
    toolbar.containerBlock = block as any
    toolbar.ngOnInit()
    toolbar.changePadding('left', 12)
    toolbar.changeTextNumber('fontSize', 24)
    toolbar.onColorPicked({type: 'textFill', color: '#224466'})
    expect(block.updateProps.calls.allArgs()).toEqual([
      [{p: [4, 8, 4, 12]}],
      [{textFont: '24px 400 normal'}],
      [{textFill: '#224466'}],
    ])
    toolbar.resetPadding()
    toolbar.resetTypography()
    expect(block.updateProps).toHaveBeenCalledWith({p: null})
    expect(block.updateProps).toHaveBeenCalledWith({
      textFamily: null, textFont: null, textSpacing: null, textFill: null,
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
      expect(element.querySelectorAll('.object-format__rail button').length).toBe(2)
      expect(element.querySelector('.object-format__panel')).toBeNull()
      ;(element.querySelector('[aria-label="外观选项"]') as HTMLButtonElement).click()
      fixture.detectChanges()
      expect(element.querySelector('cs-segmented')).not.toBeNull()
      expect(element.querySelectorAll('cs-segmented label').length).toBe(2)
      expect(element.querySelectorAll('.object-format__tab-section')[0].hasAttribute('hidden')).toBeFalse()
      ;(element.querySelectorAll('cs-segmented label')[1] as HTMLLabelElement).click()
      fixture.detectChanges()
      expect(element.querySelectorAll('.object-format__tab-section')[1].hasAttribute('hidden')).toBeFalse()
      expect(element.querySelector('.region-format__fields cs-input-number input')).not.toBeNull()
      expect(element.querySelector('.region-format__fields cs-select')).not.toBeNull()
      ;(element.querySelector('[aria-label="文本选项"]') as HTMLButtonElement).click()
      fixture.detectChanges()
      expect(element.querySelectorAll('cs-segmented label').length).toBe(2)
      expect(element.querySelectorAll('.object-format__tab-section')[2].hasAttribute('hidden')).toBeFalse()
      ;(element.querySelectorAll('cs-segmented label')[1] as HTMLLabelElement).click()
      fixture.detectChanges()
      expect(element.querySelectorAll('.object-format__tab-section')[3].hasAttribute('hidden')).toBeFalse()
      ;(element.querySelector('[aria-label="外观选项"]') as HTMLButtonElement).click()
      fixture.detectChanges()
      expect(element.querySelectorAll('.object-format__tab-section')[1].hasAttribute('hidden')).toBeFalse()
      expect(element.querySelectorAll('.object-format__panel cs-color-picker').length).toBe(3)
      expect(element.querySelectorAll('.region-format__reset .bc_huifu1').length).toBe(2)
      expect(element.querySelector('.object-format__panel bc-color-picker')).toBeNull()
    } else {
      expect(element.querySelector('bc-float-toolbar-item')).not.toBeNull()
    }
    fixture.destroy()
  })
}
