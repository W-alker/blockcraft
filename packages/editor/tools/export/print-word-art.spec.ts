import {finalizeWordArtCssForPrint} from './print-word-art'

const CHROME_USER_AGENT = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
  'AppleWebKit/537.36 (KHTML, like Gecko)',
  'Chrome/151.0.0.0 Safari/537.36',
].join(' ')
const SAFARI_USER_AGENT = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
  'AppleWebKit/605.1.15 (KHTML, like Gecko)',
  'Version/18.6 Safari/605.1.15',
].join(' ')
const IOS_CHROME_USER_AGENT = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X)',
  'AppleWebKit/605.1.15 (KHTML, like Gecko)',
  'CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1',
].join(' ')

describe('finalizeWordArtCssForPrint', () => {
  let root: HTMLElement

  beforeEach(() => {
    root = document.createElement('div')
    root.style.cssText = 'position:absolute;left:-9999px;top:0;'
    document.body.appendChild(root)
  })

  afterEach(() => root.remove())

  it('rejects invalid stable CSS props without reading print-time geometry', () => {
    const target = appendTarget('{}')
    const rectSpy = spyOn(target, 'getBoundingClientRect')
    const rangeSpy = spyOn(document, 'createRange')

    let thrown: unknown
    try {
      finalizeWordArtCssForPrint(root)
    } catch (error) {
      thrown = error
    }

    expect(thrown).toEqual(jasmine.objectContaining({
      code: 'layout-not-ready',
      context: jasmine.objectContaining({stage: 'layout'}),
    }))
    expect(rectSpy).not.toHaveBeenCalled()
    expect(rangeSpy).not.toHaveBeenCalled()
    expect(target.isConnected).toBeTrue()
  })

  it('prints a stable solid fill without measuring or rebuilding text', () => {
    spyOnProperty(navigator, 'userAgent', 'get').and.returnValue(
      CHROME_USER_AGENT,
    )
    const target = appendTarget(printProps({fillType: 'solid'}))
    const rectSpy = spyOn(target, 'getBoundingClientRect')
    const rangeSpy = spyOn(document, 'createRange')

    expect(finalizeWordArtCssForPrint(root)).toBe(1)

    expect(rectSpy).not.toHaveBeenCalled()
    expect(rangeSpy).not.toHaveBeenCalled()
    expect(target.dataset['bcPrintWordArtCss']).toBe('true')
    expect(target.isContentEditable).toBeFalse()
    expect(target.style.color).toBe('rgb(20, 184, 166)')
    expect(target.style.webkitTextFillColor).toBe('rgb(20, 184, 166)')
    expect(target.style.backgroundImage).toBe('none')
    expect(target.style.backgroundClip).toBe('border-box')
    expect(target.style.webkitBackgroundClip).toBe('border-box')
    expect(target.style.webkitTextStroke).toBe('0.025em rgb(19, 78, 74)')
    expect(target.style.textShadow).toContain('rgba(15, 118, 110, 0.24)')
    expect(target.style.transform).toBe('skewX(10deg)')
  })

  it('falls back to the first gradient color in pure WebKit', () => {
    spyOnProperty(navigator, 'userAgent', 'get').and.returnValue(
      SAFARI_USER_AGENT,
    )
    const target = appendTarget(printProps())

    expect(finalizeWordArtCssForPrint(root)).toBe(1)

    expect(target.style.color).toBe('rgb(94, 234, 212)')
    expect(target.style.webkitTextFillColor).toBe('rgb(94, 234, 212)')
    expect(target.style.backgroundImage).toBe('none')
    expect(target.style.backgroundClip).toBe('border-box')
    expect(target.style.webkitBackgroundClip).toBe('border-box')
  })

  it('keeps gradient CSS in Chrome even though its UA contains AppleWebKit', () => {
    spyOnProperty(navigator, 'userAgent', 'get').and.returnValue(
      CHROME_USER_AGENT,
    )
    const target = appendTarget(printProps())

    expect(finalizeWordArtCssForPrint(root)).toBe(1)

    expect(target.style.color).toBe('transparent')
    expect(target.style.webkitTextFillColor).toBe('transparent')
    expect(target.style.backgroundImage).toContain('linear-gradient(')
    expect(target.style.backgroundImage).toContain('rgb(94, 234, 212) 0%')
    expect(target.style.backgroundImage).toContain('rgb(15, 118, 110) 100%')
    expect(target.style.backgroundClip).toBe('text')
    expect(target.style.webkitBackgroundClip).toBe('text')
  })

  it('uses the WebKit fallback for iOS branded browsers', () => {
    spyOnProperty(navigator, 'userAgent', 'get').and.returnValue(
      IOS_CHROME_USER_AGENT,
    )
    const target = appendTarget(printProps())

    expect(finalizeWordArtCssForPrint(root)).toBe(1)

    expect(target.style.color).toBe('rgb(94, 234, 212)')
    expect(target.style.webkitTextFillColor).toBe('rgb(94, 234, 212)')
    expect(target.style.backgroundImage).toBe('none')
    expect(target.style.webkitBackgroundClip).toBe('border-box')
  })

  function appendTarget(props: string): HTMLElement {
    const surface = document.createElement('div')
    surface.className = 'word-art-block__surface'
    surface.style.cssText = 'position:relative;width:240px;height:72px;'
    const target = document.createElement('div')
    target.className = 'word-art-block__editor'
    target.contentEditable = 'true'
    target.setAttribute('data-bc-word-art-print-props', props)
    target.setAttribute('data-bc-word-art-effect-transform', 'skewX(10deg)')
    target.style.cssText = [
      'display:block',
      'width:180px',
      'height:56px',
      'font:700 36px/1.2 Arial',
    ].join(';')
    target.textContent = '艺术字'
    surface.appendChild(target)
    root.appendChild(surface)
    return target
  }

  function printProps(
    overrides: Partial<{fillType: 'solid' | 'linear-gradient'}> = {},
  ): string {
    return JSON.stringify({
      fillType: 'linear-gradient',
      fillColor: '#14b8a6',
      gradientAngle: 180,
      gradientColors: ['#5eead4', '#0f766e'],
      gradientStops: [0, 1],
      outlineColor: '#134e4a',
      outlineWidthEm: 0.025,
      shadowEnabled: true,
      shadowColor: '#0f766e',
      shadowOpacity: 0.24,
      shadowOffsetXEm: 0.06,
      shadowOffsetYEm: 0.1,
      shadowBlurEm: 0.08,
      ...overrides,
    })
  }
})
