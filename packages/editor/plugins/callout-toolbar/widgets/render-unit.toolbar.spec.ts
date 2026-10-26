import {TestBed} from '@angular/core/testing'
import {Subject} from 'rxjs'
import {RenderUnitToolbar} from './render-unit.toolbar'

describe('RenderUnitToolbar appearance', () => {
  it('offers background and border panels for render-unit blocks', () => {
    const block = makeBlock('render-unit', {})
    const toolbar = new RenderUnitToolbar()
    toolbar.containerBlock = block as any

    toolbar.ngOnInit()
    toolbar.onColorPicked({type: 'backColor', color: '#FBF3DB'})
    toolbar.onColorPicked({type: 'borderColor', color: '#DFAB01'})
    toolbar.onColorPicked({type: 'color', color: '#333333'})

    expect(toolbar.colorGroups.map(group => group.type))
      .toEqual(['backColor', 'borderColor', 'textFill'])
    expect(block.updateProps.calls.allArgs()).toEqual([
      [{backColor: '#FBF3DB'}],
      [{border: '1px solid #DFAB01', borders: null,
        borderTop: null, borderRight: null, borderBottom: null, borderLeft: null, borderColor: null}],
    ])
    expect(toolbar.activeColors).toEqual({
      backColor: '#FBF3DB',
      borderColor: '#DFAB01',
      textFill: null,
    })
  })

  it('writes only the selected render-unit background opacity', () => {
    const block = makeBlock('render-unit', {backColor: '#4857E2', backOpacity: 0.35})
    const toolbar = new RenderUnitToolbar()
    toolbar.containerBlock = block as any
    toolbar.ngOnInit()

    expect(toolbar.backOpacityPercent).toBe(35)
    toolbar.changeBackOpacity(60)
    expect(block.hostElement.style.getPropertyValue('--bc-render-unit-background-opacity')).toBe('60%')
    expect(block.updateProps).not.toHaveBeenCalled()
    toolbar.commitBackOpacity()
    expect(block.updateProps).toHaveBeenCalledOnceWith({backOpacity: 0.6})
    expect(toolbar.backOpacityPercent).toBe(60)
    toolbar.changeBackOpacity(-1)
    expect(block.updateProps).toHaveBeenCalledTimes(1)
    toolbar.changeBackOpacity(82)
    toolbar.commitBackOpacity()
    expect(block.updateProps).toHaveBeenCalledWith({backOpacity: null})
  })

  it('restores the stored opacity if the slider is dismissed mid-drag', () => {
    const block = makeBlock('render-unit', {backOpacity: 0.35})
    const toolbar = new RenderUnitToolbar()
    toolbar.containerBlock = block as any
    toolbar.ngOnInit()
    toolbar.changeBackOpacity(20)
    toolbar.ngOnDestroy()
    expect(block.hostElement.style.getPropertyValue('--bc-render-unit-background-opacity')).toBe('35%')
    expect(block.updateProps).not.toHaveBeenCalled()
  })

  it('writes region padding and only the edited text-style field', () => {
    const block = makeBlock('render-unit', {p: [4, 8], textFont: '18px 400 normal'})
    const toolbar = new RenderUnitToolbar()
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
    const toolbar = new RenderUnitToolbar()
    toolbar.containerBlock = block as any
    toolbar.ngOnInit()
    toolbar.changeBorderWidth(2)
    toolbar.changeBorderStyle('dashed')

    expect(block.updateProps).toHaveBeenCalledWith(jasmine.objectContaining({
      border: '2px dashed #DFAB01', borders: null, borderColor: null,
    }))
  })

  it('expands a compact uniform border before changing one edge', () => {
    const block = makeBlock('render-unit', {border: '2px solid #AABBCC'})
    const toolbar = new RenderUnitToolbar()
    toolbar.containerBlock = block as any
    toolbar.ngOnInit()
    toolbar.changeEdge('width', 3)
    expect(block.updateProps).toHaveBeenCalledWith(jasmine.objectContaining({
      border: '2px solid #AABBCC', borderTop: '3px solid #AABBCC',
      borderRight: null, borderBottom: null, borderLeft: null, borders: null,
    }))
  })

  it('writes a font ID and keeps a custom legacy font selectable', () => {
    const block = makeBlock('render-unit', {textFamily: 'Acme Custom, serif'})
    const toolbar = new RenderUnitToolbar()
    toolbar.containerBlock = block as any
    toolbar.ngOnInit()
    expect(toolbar.fontFamilyValue).toBe('Acme Custom, serif')
    expect(toolbar.fontOptions.at(-1)?.label).toBe('自定义字体')
    toolbar.changeFontFamily('arial')
    expect(block.updateProps).toHaveBeenCalledWith({textFamily: 'arial'})
  })

  it('uses a uniform border when editing the legacy partial border controls', () => {
    const block = makeBlock('render-unit', {borders: {top: '1px solid #112233'}} as any)
    const toolbar = new RenderUnitToolbar()
    toolbar.containerBlock = block as any
    toolbar.ngOnInit()
    toolbar.onColorPicked({type: 'borderColor', color: '#AABBCC'})

    expect(block.updateProps).toHaveBeenCalledWith(jasmine.objectContaining({
      border: '1px solid #AABBCC', borders: null, borderColor: null,
    }))
  })

  it('clears an existing structured border through the color picker', () => {
    const block = makeBlock('render-unit', {borders: {top: '2px dashed #112233'}} as any)
    const toolbar = new RenderUnitToolbar()
    toolbar.containerBlock = block as any
    toolbar.ngOnInit()
    toolbar.onColorPicked({type: 'borderColor', color: null})

    expect(block.updateProps).toHaveBeenCalledWith(jasmine.objectContaining({
      border: null, borders: null, borderColor: null,
    }))
    expect(toolbar.activeColors['borderColor']).toBeNull()
  })

  it('edits only the selected edge and restores the uniform border', () => {
    const block = makeBlock('render-unit', {
      borderColor: '#4857E2',
      borders: {top: '2px solid #9A7654', left: '1px dotted #123456'},
    })
    block.updateProps.and.callFake((patch: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) delete block.props[key]
        else block.props[key] = value
      }
    })
    const toolbar = new RenderUnitToolbar()
    toolbar.containerBlock = block as any
    toolbar.ngOnInit()

    expect(toolbar.hasIndependentBorders).toBeTrue()
    expect(toolbar.edgeWidth).toBe(2)
    toolbar.changeEdge('width', 3)
    expect(block.props['borders']).toBeUndefined()
    expect(block.props['border']).toBe('none')
    expect(block.props['borderTop']).toBe('3px solid #9A7654')
    expect(block.props['borderLeft']).toBe('1px dotted #123456')
    toolbar.selectBorderSide('left')
    expect(toolbar.edgeStyle).toBe('dotted')
    toolbar.changeEdge('color', '#AABBCC')
    expect(block.props['borderLeft']).toBe('1px dotted #AABBCC')
    toolbar.changeEdge('width', 0)
    expect(block.props['borderLeft']).toBeUndefined()
    toolbar.resetBorders()
    expect(block.props['borders']).toBeUndefined()
    expect(block.props['border']).toBeUndefined()
    expect(block.props['borderColor']).toBe('#4857E2')
    expect(toolbar.hasIndependentBorders).toBeFalse()
  })

  it('removes the side prop after the four borders match again', () => {
    const block = makeBlock('render-unit', {border: '2px solid #112233', borderLeft: '3px solid #112233'})
    block.updateProps.and.callFake((patch: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) delete block.props[key]
        else block.props[key] = value
      }
    })
    const toolbar = new RenderUnitToolbar()
    toolbar.containerBlock = block as any
    toolbar.ngOnInit()
    toolbar.selectBorderSide('left')
    toolbar.changeEdge('width', 2)
    expect(block.props['border']).toBe('2px solid #112233')
    expect(block.props['borderLeft']).toBeUndefined()
    expect(toolbar.hasIndependentBorders).toBeFalse()
  })
})

function makeBlock(
  flavour: 'render-unit',
  props: Record<string, any>,
) {
  return {
    flavour,
    props,
    hostElement: document.createElement('div'),
    updateProps: jasmine.createSpy('updateProps'),
    toggleSizeMode: jasmine.createSpy('toggleSizeMode'),
    onPropsChange: new Subject<Set<string>>(),
  }
}

it('renders the region rail and its two panels', () => {
  const fixture = TestBed.createComponent(RenderUnitToolbar)
  const block = makeBlock('render-unit', {})
  fixture.componentRef.setInput('containerBlock', block)
  fixture.detectChanges()
  const element: HTMLElement = fixture.nativeElement
  expect(element.querySelector('[data-bc-region-format-toolbar]')).not.toBeNull()
  expect(element.querySelector('bc-float-toolbar-item')).toBeNull()
  expect(element.querySelectorAll('.object-format__rail button').length).toBe(3)
  expect(element.querySelector('[aria-label="切换为固定尺寸"] .bc_size-auto')).not.toBeNull()
  expect(element.querySelector('[aria-label="恢复内容自适应"]')).toBeNull()
  expect(element.querySelector('.object-format__panel')).toBeNull()
  ;(element.querySelector('[aria-label="外观选项"]') as HTMLButtonElement).click()
  fixture.detectChanges()
  expect(element.querySelector('cs-segmented')).not.toBeNull()
  expect(element.querySelectorAll('.object-format__tabs label').length).toBe(2)
  expect(element.querySelectorAll('.object-format__tab-section')[0].hasAttribute('hidden')).toBeFalse()
  expect(element.querySelector('.region-format__opacity cs-slider')).not.toBeNull()
  ;(element.querySelectorAll('.object-format__tabs label')[1] as HTMLLabelElement).click()
  fixture.detectChanges()
  expect(element.querySelectorAll('.object-format__tab-section')[1].hasAttribute('hidden')).toBeFalse()
  expect(element.querySelector('.region-format__fields cs-input-number input')).not.toBeNull()
  expect(element.querySelector('.region-format__fields cs-select')).not.toBeNull()
  expect(element.querySelector('.region-format__per-side summary')?.textContent).toContain('四边独立设置')
  ;(element.querySelector('[aria-label="文本选项"]') as HTMLButtonElement).click()
  fixture.detectChanges()
  expect(element.querySelectorAll('.object-format__tabs label').length).toBe(2)
  expect(element.querySelectorAll('.object-format__tab-section')[2].hasAttribute('hidden')).toBeFalse()
  ;(element.querySelectorAll('.object-format__tabs label')[1] as HTMLLabelElement).click()
  fixture.detectChanges()
  expect(element.querySelectorAll('.object-format__tab-section')[3].hasAttribute('hidden')).toBeFalse()
  ;(element.querySelector('[aria-label="外观选项"]') as HTMLButtonElement).click()
  fixture.detectChanges()
  expect(element.querySelectorAll('.object-format__tab-section')[1].hasAttribute('hidden')).toBeFalse()
  expect(element.querySelectorAll('.object-format__panel cs-color-picker').length).toBe(4)
  expect(element.querySelectorAll('.region-format__reset .bc_huifu1').length).toBe(2)
  expect(element.querySelector('.object-format__panel bc-color-picker')).toBeNull()
  fixture.destroy()
})

it('switches mode icons and actions following local, undo and remote property changes', () => {
  const fixture = TestBed.createComponent(RenderUnitToolbar)
  const block = makeBlock('render-unit', {})
  fixture.componentRef.setInput('containerBlock', block)
  fixture.detectChanges()
  const element: HTMLElement = fixture.nativeElement
  const reset = () => element.querySelector<HTMLButtonElement>('[aria-label="恢复内容自适应"]')
  const fix = () => element.querySelector<HTMLButtonElement>('[aria-label="切换为固定尺寸"]')
  expect(reset()).toBeNull()
  expect(fix()!.querySelector('.bc_size-auto')).not.toBeNull()
  fix()!.click()
  expect(block.toggleSizeMode).toHaveBeenCalledTimes(1)
  for (const props of [{wr: 50, ar: 2}, {width: 320, height: 200}]) {
    block.props = props
    block.onPropsChange.next(new Set(['wr', 'ar', 'width', 'height']))
    fixture.detectChanges()
    expect(reset()).not.toBeNull()
    expect(reset()!.querySelector('.bc_size-fixed')).not.toBeNull()
    reset()!.click()
    expect(block.toggleSizeMode).toHaveBeenCalled()
    block.props = {wr: 50}
    block.onPropsChange.next(new Set(['ar', 'height']))
    fixture.detectChanges()
    expect(reset()).toBeNull()
    expect(fix()!.querySelector('.bc_size-auto')).not.toBeNull()
  }
  fixture.destroy()
  expect(block.onPropsChange.observed).toBeFalse()
})
