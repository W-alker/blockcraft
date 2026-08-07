import {
  finalizeWordArtVectorsForPrint,
  mutationAffectsWordArtVector,
  refreshWordArtVectorMirror,
} from './print-word-art'

describe('finalizeWordArtVectorsForPrint', () => {
  let root: HTMLElement

  beforeEach(() => {
    root = document.createElement('div')
    root.style.cssText = 'position:absolute;left:-9999px;top:0;'
    document.body.appendChild(root)
  })

  afterEach(() => root.remove())

  it('rejects WordArt without a stable SVG instead of remeasuring it during export', () => {
    const surface = document.createElement('div')
    surface.className = 'word-art-block__surface'
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
    surface.appendChild(target)
    root.appendChild(surface)
    const rectSpy = spyOn(target, 'getBoundingClientRect')

    let thrown: unknown
    try {
      finalizeWordArtVectorsForPrint(root)
    } catch (error) {
      thrown = error
    }

    expect(thrown).toEqual(jasmine.objectContaining({
      code: 'layout-not-ready',
      context: jasmine.objectContaining({stage: 'layout'}),
    }))
    expect(rectSpy).not.toHaveBeenCalled()
    expect(target.isConnected).toBeTrue()
    expect(root.querySelector('svg')).toBeNull()
  })

  it('preserves the direct fill from the stable screen SVG', () => {
    const surface = document.createElement('div')
    surface.className = 'word-art-block__surface'
    surface.style.cssText = 'position:relative;width:180px;height:56px;'
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
    surface.appendChild(target)
    root.appendChild(surface)

    expect(refreshWordArtVectorMirror(target)).toBeTrue()
    finalizeWordArtVectorsForPrint(root)

    const svg = root.querySelector('svg')!
    expect(svg.querySelector('linearGradient')).toBeNull()
    expect(svg.querySelector('text')?.getAttribute('fill')).toBe('#14b8a6')
    expect(svg.querySelector('filter')).toBeNull()
  })

  it('keeps contenteditable as the input host while screen and print reuse one SVG node', () => {
    const surface = document.createElement('div')
    surface.className = 'word-art-block__surface'
    surface.style.cssText =
      'position:relative;display:flex;width:240px;height:72px;align-items:center;'
    const target = document.createElement('div')
    target.className = 'word-art-block__editor'
    target.contentEditable = 'true'
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
    target.style.cssText =
      'display:block;width:180px;height:56px;font:700 36px/1.2 Arial;'
    target.dataset['bcWordArtEffectTransform'] = 'skewX(10deg)'
    target.textContent = 'SVG 编辑'
    surface.appendChild(target)
    root.appendChild(surface)

    expect(refreshWordArtVectorMirror(target)).toBeTrue()
    const vector = surface.querySelector<SVGSVGElement>(
      ':scope > [data-bc-word-art-vector-mirror="true"]',
    )!
    expect(vector).not.toBeNull()
    expect(vector.querySelector('text')?.textContent).toBe('SVG 编辑')
    expect(vector.style.transform).toBe('skewX(10deg)')
    expect(target.style.transform).toBe('')
    expect(surface.hasAttribute('data-bc-word-art-vector-ready')).toBeTrue()
    expect(target.isConnected).toBeTrue()
    expect(target.isContentEditable).toBeTrue()

    const vectorGeometry = {
      width: vector.getAttribute('width'),
      height: vector.getAttribute('height'),
      viewBox: vector.getAttribute('viewBox'),
      style: vector.getAttribute('style'),
      transform: vector.style.transform,
      textX: vector.querySelector('text')?.getAttribute('x'),
      textY: vector.querySelector('text')?.getAttribute('y'),
    }
    const rectSpy = spyOn(target, 'getBoundingClientRect')
    const rangeSpy = spyOn(document, 'createRange')

    expect(finalizeWordArtVectorsForPrint(root)).toBe(1)
    expect(rectSpy).not.toHaveBeenCalled()
    expect(rangeSpy).not.toHaveBeenCalled()
    expect(target.isConnected).toBeFalse()
    expect(surface.querySelectorAll('svg').length).toBe(1)
    expect(surface.querySelector('svg')).toBe(vector)
    expect(vector.hasAttribute('data-bc-word-art-vector-mirror')).toBeFalse()
    expect(vector.getAttribute('data-bc-print-word-art-vector')).toBe('true')
    expect({
      width: vector.getAttribute('width'),
      height: vector.getAttribute('height'),
      viewBox: vector.getAttribute('viewBox'),
      style: vector.getAttribute('style'),
      transform: vector.style.transform,
      textX: vector.querySelector('text')?.getAttribute('x'),
      textY: vector.querySelector('text')?.getAttribute('y'),
    }).toEqual(vectorGeometry)
  })

  it('preserves Chrome subpixel flex geometry for the editable SVG mirror', () => {
    const surface = document.createElement('div')
    surface.className = 'word-art-block__surface'
    surface.style.cssText = [
      'position:relative',
      'display:flex',
      'width:320px',
      'height:96px',
      'align-items:center',
    ].join(';')
    const target = document.createElement('div')
    target.className = 'word-art-block__editor'
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
    target.style.cssText = [
      'display:block',
      'box-sizing:border-box',
      'width:320px',
      'height:60.46875px',
      'font:700 48px/1.1 Arial',
    ].join(';')
    target.textContent = '艺术字'
    surface.appendChild(target)
    root.appendChild(surface)

    const targetHeight = parseFloat(getComputedStyle(target).height)
    spyOn(surface, 'getBoundingClientRect').and.returnValue({
      x: 100,
      y: 200,
      top: 200,
      right: 420,
      bottom: 296,
      left: 100,
      width: 320,
      height: 96,
      toJSON: () => ({}),
    })
    spyOn(target, 'getBoundingClientRect').and.returnValue({
      x: 100,
      y: 217.765625,
      top: 217.765625,
      right: 420,
      bottom: 217.765625 + targetHeight,
      left: 100,
      width: 320,
      height: targetHeight,
      toJSON: () => ({}),
    })

    expect(refreshWordArtVectorMirror(target)).toBeTrue()

    const vector = surface.querySelector<SVGSVGElement>(
      ':scope > [data-bc-word-art-vector-mirror="true"]',
    )!
    expect(parseFloat(vector.style.top)).toBeCloseTo(17.765625, 4)
    expect(parseFloat(vector.style.left)).toBe(0)
    expect(parseFloat(vector.style.height)).toBeCloseTo(targetHeight, 4)
    expect(vector.height.baseVal.value).toBeCloseTo(targetHeight, 4)
  })

  it('excludes virtual cursor content from the WordArt vector source', () => {
    const surface = document.createElement('div')
    surface.className = 'word-art-block__surface'
    surface.style.cssText =
      'position:relative;display:flex;width:240px;height:72px;align-items:center;'
    const target = document.createElement('div')
    target.className = 'word-art-block__editor'
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
    target.append('艺')
    const fakeCursor = document.createElement('span')
    fakeCursor.className = 'blockcraft-cursor'
    fakeCursor.style.position = 'absolute'
    const fakeCursorPart = document.createElement('span')
    fakeCursorPart.textContent = '虚拟光标'
    fakeCursor.appendChild(fakeCursorPart)
    target.append(fakeCursor, '术字')
    surface.appendChild(target)
    root.appendChild(surface)

    expect(refreshWordArtVectorMirror(target)).toBeTrue()

    expect(
      surface.querySelector('svg[data-bc-word-art-vector-mirror] text')
        ?.textContent,
    ).toBe('艺术字')
  })

  it('does not invalidate the WordArt vector when a virtual cursor mounts or unmounts', () => {
    const target = document.createElement('div')
    root.appendChild(target)
    const observer = new MutationObserver(() => undefined)
    observer.observe(target, {
      childList: true,
      characterData: true,
      subtree: true,
    })
    const fakeCursor = document.createElement('span')
    fakeCursor.className = 'blockcraft-cursor'
    const part = document.createElement('span')
    part.textContent = 'remote selection'
    fakeCursor.appendChild(part)

    target.appendChild(fakeCursor)
    expect(mutationAffectsWordArtVector(observer.takeRecords())).toBeFalse()

    part.firstChild!.textContent = 'updated remote selection'
    expect(mutationAffectsWordArtVector(observer.takeRecords())).toBeFalse()

    fakeCursor.remove()
    expect(mutationAffectsWordArtVector(observer.takeRecords())).toBeFalse()

    target.append('real content')
    expect(mutationAffectsWordArtVector(observer.takeRecords())).toBeTrue()
    observer.disconnect()
  })

  it('ignores a Safari zero-width boundary rect before the visual glyph rect', () => {
    const surface = document.createElement('div')
    surface.className = 'word-art-block__surface'
    surface.style.cssText = 'position:relative;width:180px;height:56px;'
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
    surface.appendChild(target)
    root.appendChild(surface)
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

    expect(refreshWordArtVectorMirror(target)).toBeTrue()

    const text = surface.querySelector('svg text')!
    expect(text.getAttribute('x')).toBe('12')
    expect(text.getAttribute('y')).toBe('8')
    expect(text.getAttribute('dominant-baseline')).toBe('text-before-edge')
    expect(text.getAttribute('textLength')).toBe('20')
  })
})
