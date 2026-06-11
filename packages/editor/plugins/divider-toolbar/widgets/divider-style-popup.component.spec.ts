import { TestBed } from '@angular/core/testing'
import { DividerStylePopupComponent } from './divider-style-popup.component'

function mockBlock(props: Record<string, unknown> = {}) {
  return {
    props,
    updateProps: jasmine.createSpy('updateProps'),
  } as unknown as DividerStylePopupComponent['dividerBlock']
}

describe('DividerStylePopupComponent', () => {
  function create(props: Record<string, unknown> = {}) {
    const fixture = TestBed.configureTestingModule({ imports: [DividerStylePopupComponent] })
      .createComponent(DividerStylePopupComponent)
    fixture.componentInstance.dividerBlock = mockBlock(props)
    fixture.componentInstance.ngOnInit()
    return fixture
  }

  it('exposes a 文字 tab', () => {
    const fixture = create()
    expect(fixture.componentInstance.styleTabs.some(t => t.key === 'text')).toBe(true)
  })

  it('ngOnInit reads text and align from props', () => {
    const f = create({ text: 'Hello', align: 'left' })
    expect(f.componentInstance.labelText).toBe('Hello')
    expect(f.componentInstance.activeAlign).toBe('left')
  })

  it('ngOnInit defaults align to center and text to empty', () => {
    const f = create({})
    expect(f.componentInstance.labelText).toBe('')
    expect(f.componentInstance.activeAlign).toBe('center')
  })

  it('setText writes the text prop and updates local state', () => {
    const fixture = create()
    fixture.componentInstance.setText('Chapter 1')
    expect(fixture.componentInstance.dividerBlock.updateProps)
      .toHaveBeenCalledWith({ text: 'Chapter 1' })
    expect(fixture.componentInstance.labelText).toBe('Chapter 1')
  })

  it('setAlign writes the align prop and updates active state', () => {
    const fixture = create()
    fixture.componentInstance.setAlign('right')
    expect(fixture.componentInstance.dividerBlock.updateProps)
      .toHaveBeenCalledWith({ align: 'right' })
    expect(fixture.componentInstance.activeAlign).toBe('right')
  })

  it('setColor writes the color prop and updates active state', () => {
    const fixture = create()
    fixture.componentInstance.setColor('#F44336')
    expect(fixture.componentInstance.dividerBlock.updateProps)
      .toHaveBeenCalledWith({ color: '#F44336' })
    expect(fixture.componentInstance.activeColor).toBe('#F44336')
  })

  it('ngOnInit reads color from props', () => {
    expect(create({ color: '#42A5F5' }).componentInstance.activeColor).toBe('#42A5F5')
  })

  it('ngOnInit defaults color to empty', () => {
    expect(create({}).componentInstance.activeColor).toBe('')
  })
})
