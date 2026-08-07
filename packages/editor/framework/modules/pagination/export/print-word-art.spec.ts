import {materializeWordArtForPrint} from './print-word-art'

describe('materializeWordArtForPrint', () => {
  let root: HTMLElement

  beforeEach(() => {
    root = document.createElement('div')
    root.style.cssText = 'position:absolute;left:-9999px;top:0;'
    document.body.appendChild(root)
  })

  afterEach(() => root.remove())

  it('replaces CSS gradient text with an equal-size SVG vector', () => {
    const target = document.createElement('div')
    target.setAttribute('data-bc-word-art-print-props', JSON.stringify({
      fillType: 'linear-gradient',
      fillColor: '#f97316',
      gradientAngle: 180,
      gradientColors: ['#fde047', '#f97316', '#dc2626'],
      gradientStops: [0, 0.58, 1],
      outlineColor: '#9a3412',
      outlineWidthEm: 0.03,
      shadowEnabled: true,
      shadowColor: '#7c2d12',
      shadowOpacity: 0.3,
      shadowOffsetXEm: 0.08,
      shadowOffsetYEm: 0.12,
      shadowBlurEm: 0.04,
    }))
    target.style.cssText = [
      'display:block',
      'box-sizing:border-box',
      'width:320px',
      'height:72px',
      'padding:4px 6px',
      'font-family:Arial,sans-serif',
      'font-size:48px',
      'font-weight:700',
      'line-height:1.2',
      'background-image:linear-gradient(180deg,#fde047 0%,#f97316 58%,#dc2626 100%)',
      'background-clip:text',
      '-webkit-background-clip:text',
      '-webkit-text-fill-color:transparent',
    ].join(';')
    target.textContent = '非常帅气'
    root.appendChild(target)
    const originalSize = [target.offsetWidth, target.offsetHeight]
    const sourceRange = document.createRange()
    sourceRange.selectNodeContents(target)
    const sourceRect = sourceRange.getBoundingClientRect()
    sourceRange.detach()

    expect(materializeWordArtForPrint(root)).toBe(1)

    const svg = root.querySelector<SVGSVGElement>(
      'svg[data-bc-print-word-art-vector="true"]',
    )
    expect(svg).not.toBeNull()
    expect([svg!.width.baseVal.value, svg!.height.baseVal.value]).toEqual(originalSize)
    expect(svg!.querySelectorAll('linearGradient stop').length).toBe(3)
    expect(svg!.querySelector('text')?.textContent).toBe('非常帅气')
    expect(svg!.querySelector('text')?.getAttribute('fill')).toMatch(/^url\(#bc-word-art-gradient-/)
    expect(svg!.querySelector('text')?.getAttribute('stroke')).toBe('#9a3412')
    expect(svg!.querySelector('feDropShadow')).not.toBeNull()
    const vectorRect = svg!.querySelector('text')!.getBoundingClientRect()
    expect(Math.abs(vectorRect.left - sourceRect.left)).toBeLessThan(1)
    expect(Math.abs(vectorRect.top - sourceRect.top)).toBeLessThan(1)
    expect(root.querySelector('[data-bc-word-art-print-props]')).toBeNull()
  })

  it('uses a direct fill for solid WordArt', () => {
    const target = document.createElement('span')
    target.setAttribute('data-bc-word-art-print-props', JSON.stringify({
      fillType: 'solid',
      fillColor: '#14b8a6',
      gradientAngle: 180,
      gradientColors: ['#5eead4', '#0f766e'],
      gradientStops: [0, 1],
      outlineColor: '#134e4a',
      outlineWidthEm: 0.025,
      shadowEnabled: false,
      shadowColor: '#0f766e',
      shadowOpacity: 0.24,
      shadowOffsetXEm: 0.06,
      shadowOffsetYEm: 0.1,
      shadowBlurEm: 0.08,
    }))
    target.style.cssText = 'display:block;width:180px;height:56px;font:700 36px/1.2 Arial;'
    target.textContent = 'Solid'
    root.appendChild(target)

    materializeWordArtForPrint(root)

    const svg = root.querySelector('svg')!
    expect(svg.querySelector('linearGradient')).toBeNull()
    expect(svg.querySelector('text')?.getAttribute('fill')).toBe('#14b8a6')
    expect(svg.querySelector('filter')).toBeNull()
  })

  it('ignores a Safari zero-width boundary rect before the visual glyph rect', () => {
    const target = document.createElement('div')
    target.setAttribute('data-bc-word-art-print-props', JSON.stringify({
      fillType: 'solid',
      fillColor: '#14b8a6',
      gradientAngle: 180,
      gradientColors: ['#5eead4', '#0f766e'],
      gradientStops: [0, 1],
      outlineColor: '#134e4a',
      outlineWidthEm: 0,
      shadowEnabled: false,
      shadowColor: '#0f766e',
      shadowOpacity: 0,
      shadowOffsetXEm: 0,
      shadowOffsetYEm: 0,
      shadowBlurEm: 0,
    }))
    target.style.cssText =
      'display:block;width:180px;height:56px;font:700 36px/1.2 Arial;'
    target.textContent = 'A'
    root.appendChild(target)
    Object.defineProperties(target, {
      offsetWidth: {configurable: true, value: 180},
      offsetHeight: {configurable: true, value: 56},
    })
    spyOn(target, 'getBoundingClientRect').and.returnValue({
      x: 100,
      y: 200,
      top: 200,
      right: 280,
      bottom: 256,
      left: 100,
      width: 180,
      height: 56,
      toJSON: () => ({}),
    })
    const range = {
      setStart: jasmine.createSpy('setStart'),
      setEnd: jasmine.createSpy('setEnd'),
      detach: jasmine.createSpy('detach'),
      getClientRects: () => [
        {
          x: 100,
          y: 208,
          top: 208,
          right: 100,
          bottom: 248,
          left: 100,
          width: 0,
          height: 40,
          toJSON: () => ({}),
        },
        {
          x: 112,
          y: 208,
          top: 208,
          right: 132,
          bottom: 248,
          left: 112,
          width: 20,
          height: 40,
          toJSON: () => ({}),
        },
      ],
    }
    spyOn(document, 'createRange').and.returnValue(range as unknown as Range)

    materializeWordArtForPrint(root)

    const text = root.querySelector('svg text')!
    expect(text.getAttribute('x')).toBe('12')
    expect(text.getAttribute('y')).toBe('8')
    expect(text.getAttribute('dominant-baseline')).toBe('text-before-edge')
    expect(text.getAttribute('textLength')).toBe('20')
  })
})
