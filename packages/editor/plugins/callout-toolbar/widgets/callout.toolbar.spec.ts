import {TestBed} from '@angular/core/testing'
import {CalloutBlockToolbar} from './callout.toolbar'

describe('CalloutBlockToolbar', () => {
  const makeBlock = () => ({
    props: {color: '#333333', backColor: '#FFE6CD', borderColor: '#DFAB01'},
    updateProps: jasmine.createSpy('updateProps'),
  })

  it('keeps callout text, background and border colors', () => {
    const block = makeBlock()
    const toolbar = new CalloutBlockToolbar()
    toolbar.containerBlock = block as any
    toolbar.ngOnInit()

    expect(toolbar.colorGroups.map(group => group.type))
      .toEqual(['color', 'backColor', 'borderColor'])
    expect(toolbar.activeColors).toEqual(block.props)
    toolbar.onColorPicked({type: 'backColor', color: '#123456'})
    expect(block.updateProps).toHaveBeenCalledOnceWith({backColor: '#123456'})
  })

  it('renders only the original compact color entry', () => {
    const fixture = TestBed.createComponent(CalloutBlockToolbar)
    fixture.componentRef.setInput('containerBlock', makeBlock())
    fixture.detectChanges()
    const element: HTMLElement = fixture.nativeElement
    expect(element.querySelector('bc-float-toolbar-item')).not.toBeNull()
    expect(element.querySelector('[data-bc-region-format-toolbar]')).toBeNull()
    fixture.destroy()
  })
})
