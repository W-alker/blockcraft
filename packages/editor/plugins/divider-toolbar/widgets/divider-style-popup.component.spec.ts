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

  it('keeps the top style tabs text-only', () => {
    const fixture = create()
    expect(fixture.componentInstance.styleTabOptions.every(option =>
      typeof option !== 'object' || !('icon' in option)
    )).toBe(true)
  })

  it('uses BlockCraft text-alignment icons in projected CSES segments', () => {
    const fixture = create()
    expect(fixture.componentInstance.alignList).toEqual([
      { key: 'left', icon: 'bc_zuoduiqi', label: '左对齐' },
      { key: 'center', icon: 'bc_juzhongduiqi', label: '居中' },
      { key: 'right', icon: 'bc_youduiqi', label: '右对齐' },
    ])
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

  it('reads and updates an independent line color', () => {
    const fixture = create({ lineColor: '#42A5F5' })
    expect(fixture.componentInstance.activeLineColor).toBe('#42A5F5')

    fixture.componentInstance.setLineColor('#EC407A')
    expect(fixture.componentInstance.activeLineColor).toBe('#EC407A')
    expect(fixture.componentInstance.dividerBlock.updateProps)
      .toHaveBeenCalledWith({ lineColor: '#EC407A' })
  })

  it('reads and updates the label font size', () => {
    const fixture = create({ fontSize: 18 })
    expect(fixture.componentInstance.activeFontSize).toBe(18)

    fixture.componentInstance.setFontSize(24)
    expect(fixture.componentInstance.activeFontSize).toBe(24)
    expect(fixture.componentInstance.dividerBlock.updateProps)
      .toHaveBeenCalledWith({ fontSize: 24 })
  })

  it('offers the complete label font-size and letter-spacing preset ranges', () => {
    const fixture = create()
    expect(fixture.componentInstance.fontSizeList).toEqual([10, 12, 14, 16, 18, 20, 24, 28, 32])
    expect(fixture.componentInstance.letterSpacingList).toEqual([0, 0.5, 1, 1.5, 2, 3, 4, 6, 8])
  })

  it('normalizes invalid label font sizes', () => {
    const fixture = create({ fontSize: 4 })
    expect(fixture.componentInstance.activeFontSize).toBe(10)

    fixture.componentInstance.dividerBlock = mockBlock({ fontSize: 80 })
    fixture.componentInstance.ngOnInit()
    expect(fixture.componentInstance.activeFontSize).toBe(32)

    fixture.componentInstance.dividerBlock = mockBlock({ fontSize: 'invalid' })
    fixture.componentInstance.ngOnInit()
    expect(fixture.componentInstance.activeFontSize).toBe(14)
  })

  it('toggles label emphasis and updates letter spacing', () => {
    const fixture = create({ fontWeight: 'bold', fontStyle: 'italic', letterSpacing: 2 })
    expect(fixture.componentInstance.activeFontWeight).toBe('bold')
    expect(fixture.componentInstance.activeFontStyle).toBe('italic')
    expect(fixture.componentInstance.activeLetterSpacing).toBe(2)

    fixture.componentInstance.toggleFontWeight()
    fixture.componentInstance.toggleFontStyle()
    fixture.componentInstance.setLetterSpacing(4)

    expect(fixture.componentInstance.dividerBlock.updateProps).toHaveBeenCalledWith({ fontWeight: 'normal' })
    expect(fixture.componentInstance.dividerBlock.updateProps).toHaveBeenCalledWith({ fontStyle: 'normal' })
    expect(fixture.componentInstance.dividerBlock.updateProps).toHaveBeenCalledWith({ letterSpacing: 4 })
  })

  it('normalizes imported letter spacing', () => {
    const fixture = create({ letterSpacing: 20 })
    expect(fixture.componentInstance.activeLetterSpacing).toBe(8)

    fixture.componentInstance.dividerBlock = mockBlock({ letterSpacing: 'invalid' })
    fixture.componentInstance.ngOnInit()
    expect(fixture.componentInstance.activeLetterSpacing).toBe(0)
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
