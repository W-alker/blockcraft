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

  it('does not expose the removed text tab', () => {
    const fixture = create()
    expect(fixture.componentInstance.styleTabs.some(t => t.key === 'text')).toBe(false)
  })

  it('keeps the top style tabs text-only', () => {
    const fixture = create()
    expect(fixture.componentInstance.styleTabOptions.every(option =>
      typeof option !== 'object' || !('icon' in option)
    )).toBe(true)
  })


  it('exposes the complete classic and decorative line catalog', () => {
    const fixture = create()
    expect(fixture.componentInstance.lineStyles.map(style => style.key)).toEqual([
      'solid',
      'dashed',
      'dotted',
      'double',
      'fade',
      'wave',
      'zigzag',
      'sketch',
      'triple-dot',
      'diamond',
    ])
  })

  it('exposes six named colorful edge patterns', () => {
    const fixture = create()
    expect(fixture.componentInstance.edgePatterns.map(pattern => pattern.key)).toEqual([
      'edge-grass',
      'edge-flower',
      'edge-vine',
      'edge-daisy',
      'edge-stars',
      'edge-berries',
    ])
  })

  it('exposes independent length and thickness catalogs', () => {
    const fixture = create()
    expect(fixture.componentInstance.lengthList).toEqual([
      { key: 'short', label: '短' },
      { key: 'medium', label: '中' },
      { key: 'long', label: '长' },
      { key: 'full', label: '通栏' },
    ])
    expect(fixture.componentInstance.thicknessList).toEqual([
      { key: 'thin', label: '细' },
      { key: 'regular', label: '常规' },
      { key: 'thick', label: '粗' },
    ])
  })

  it('reads and updates length, thickness and opacity independently', () => {
    const fixture = create({ length: 'medium', thickness: 'thick', opacity: .55 })
    expect(fixture.componentInstance.activeLength).toBe('medium')
    expect(fixture.componentInstance.activeThickness).toBe('thick')
    expect(fixture.componentInstance.activeOpacity).toBe(55)

    fixture.componentInstance.selectLength('full')
    fixture.componentInstance.selectThickness('thin')
    fixture.componentInstance.setOpacity(75)

    expect(fixture.componentInstance.dividerBlock.updateProps).toHaveBeenCalledWith({ length: 'full' })
    expect(fixture.componentInstance.dividerBlock.updateProps).toHaveBeenCalledWith({ thickness: 'thin' })
    expect(fixture.componentInstance.dividerBlock.updateProps).toHaveBeenCalledWith({ opacity: .75 })
  })

  it('maps legacy size snapshots to the split appearance model', () => {
    const fixture = create({ size: 'thin' })
    expect(fixture.componentInstance.activeLength).toBe('short')
    expect(fixture.componentInstance.activeThickness).toBe('thin')

    fixture.componentInstance.dividerBlock = mockBlock({ size: 'small' })
    fixture.componentInstance.ngOnInit()
    expect(fixture.componentInstance.activeLength).toBe('medium')
    expect(fixture.componentInstance.activeThickness).toBe('thin')

    fixture.componentInstance.dividerBlock = mockBlock({ size: 'medium' })
    fixture.componentInstance.ngOnInit()
    expect(fixture.componentInstance.activeLength).toBe('long')
    expect(fixture.componentInstance.activeThickness).toBe('regular')

    fixture.componentInstance.dividerBlock = mockBlock({ size: 'large' })
    fixture.componentInstance.ngOnInit()
    expect(fixture.componentInstance.activeLength).toBe('full')
    expect(fixture.componentInstance.activeThickness).toBe('thick')
  })

  it('normalizes opacity to a visible 10–100 percent range', () => {
    const fixture = create({ opacity: 0 })
    expect(fixture.componentInstance.activeOpacity).toBe(10)

    fixture.componentInstance.setOpacity(120)
    expect(fixture.componentInstance.activeOpacity).toBe(100)
    expect(fixture.componentInstance.dividerBlock.updateProps).toHaveBeenCalledWith({ opacity: 1 })

    fixture.componentInstance.dividerBlock = mockBlock({ opacity: 'invalid' })
    fixture.componentInstance.ngOnInit()
    expect(fixture.componentInstance.activeOpacity).toBe(100)
  })








  it('reads and updates an independent line color', () => {
    const fixture = create({ lineColor: '#42A5F5' })
    expect(fixture.componentInstance.activeLineColor).toBe('#42A5F5')

    fixture.componentInstance.setLineColor('#EC407A')
    expect(fixture.componentInstance.activeLineColor).toBe('#EC407A')
    expect(fixture.componentInstance.dividerBlock.updateProps)
      .toHaveBeenCalledWith({ lineColor: '#EC407A' })
  })






  it('preserves native interaction for CSES controls while isolating editor events', () => {
    const fixture = create()
    const stopPropagation = jasmine.createSpy('stopPropagation')
    const preventDefault = jasmine.createSpy('preventDefault')

    fixture.componentInstance.onMouseDown({
      target: document.createElement('button'),
      stopPropagation,
      preventDefault,
    } as unknown as MouseEvent)

    expect(stopPropagation).toHaveBeenCalled()
    expect(preventDefault).not.toHaveBeenCalled()
  })

  it('prevents focus-changing mouse defaults on non-interactive popup surfaces', () => {
    const fixture = create()
    const stopPropagation = jasmine.createSpy('stopPropagation')
    const preventDefault = jasmine.createSpy('preventDefault')

    fixture.componentInstance.onMouseDown({
      target: document.createElement('div'),
      stopPropagation,
      preventDefault,
    } as unknown as MouseEvent)

    expect(preventDefault).toHaveBeenCalled()
    expect(stopPropagation).toHaveBeenCalled()
  })

  it('treats blank space inside the flexible color-picker host as non-interactive', () => {
    const fixture = create()
    const stopPropagation = jasmine.createSpy('stopPropagation')
    const preventDefault = jasmine.createSpy('preventDefault')
    const colorPickerHost = document.createElement('cs-color-picker')

    fixture.componentInstance.onMouseDown({
      target: colorPickerHost,
      stopPropagation,
      preventDefault,
    } as unknown as MouseEvent)

    expect(stopPropagation).toHaveBeenCalled()
    expect(preventDefault).toHaveBeenCalled()
  })

  it('keeps the actual color-picker trigger button natively interactive', () => {
    const fixture = create()
    const stopPropagation = jasmine.createSpy('stopPropagation')
    const preventDefault = jasmine.createSpy('preventDefault')
    const colorPickerHost = document.createElement('cs-color-picker')
    const trigger = document.createElement('button')
    colorPickerHost.appendChild(trigger)

    fixture.componentInstance.onMouseDown({
      target: trigger,
      stopPropagation,
      preventDefault,
    } as unknown as MouseEvent)

    expect(stopPropagation).toHaveBeenCalled()
    expect(preventDefault).not.toHaveBeenCalled()
  })

  it('stops every popup pointerdown before it reaches the editor', () => {
    const fixture = create()
    const stopPropagation = jasmine.createSpy('stopPropagation')

    fixture.componentInstance.onPointerDown({ stopPropagation } as unknown as PointerEvent)

    expect(stopPropagation).toHaveBeenCalled()
  })
})
