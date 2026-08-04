import {
  applyInlineImageFloatLayout,
  InlineFloatLayoutController,
  resolveInlineFloatGeometry,
} from './inline-float-layout'

describe('inline float layout', () => {
  it('exposes both readable text intervals for a centered auto image', () => {
    const result = resolveInlineFloatGeometry({
      containerWidth: 600,
      imageWidth: 180,
      imageHeight: 108,
      x: .35,
      side: 'auto',
      gap: 12,
    })

    expect(result.layoutMode).toBe('dual')
    expect(result.leftTextWidth).toBe(198)
    expect(result.rightTextWidth).toBe(198)
    expect(result.availableTextWidth).toBe(396)
    expect(result.textIntervals).toEqual([
      {side: 'left', start: 0, width: 198},
      {side: 'right', start: 402, width: 198},
    ])
  })

  it('requires both auto intervals to meet the minimum readable width', () => {
    const eligible = resolveInlineFloatGeometry({
      containerWidth: 404,
      imageWidth: 188,
      imageHeight: 94,
      x: 108 / 404,
      side: 'auto',
      gap: 12,
      minTextWidth: 96,
    })
    expect(eligible.leftTextWidth).toBeCloseTo(96, 5)
    expect(eligible.rightTextWidth).toBeCloseTo(96, 5)
    expect(eligible.layoutMode).toBe('dual')

    const fallback = resolveInlineFloatGeometry({
      containerWidth: 404,
      imageWidth: 188,
      imageHeight: 94,
      x: .265,
      side: 'auto',
      gap: 12,
      minTextWidth: 96,
    })
    expect(fallback.layoutMode).toBe('single')
    expect(fallback.resolvedTextSide).toBe('right')
    expect(fallback.textIntervals).toEqual([
      jasmine.objectContaining({side: 'right'}),
    ])
  })

  it('keeps explicit side modes single-sided even when both sides fit', () => {
    const left = resolveInlineFloatGeometry({
      containerWidth: 600,
      imageWidth: 180,
      imageHeight: 108,
      x: .35,
      side: 'left',
      gap: 12,
    })
    const right = resolveInlineFloatGeometry({
      containerWidth: 600,
      imageWidth: 180,
      imageHeight: 108,
      x: .35,
      side: 'right',
      gap: 12,
    })

    expect(left.layoutMode).toBe('single')
    expect(left.textIntervals).toEqual([
      {side: 'left', start: 0, width: 198},
    ])
    expect(right.layoutMode).toBe('single')
    expect(right.textIntervals).toEqual([
      {side: 'right', start: 402, width: 198},
    ])
  })

  it('resolves right-side text with a left float exclusion', () => {
    expect(resolveInlineFloatGeometry({
      containerWidth: 600,
      imageWidth: 180,
      imageHeight: 108,
      x: .1,
      side: 'right',
      gap: 12,
    })).toEqual(jasmine.objectContaining({
      resolvedTextSide: 'right',
      floatDirection: 'left',
      imageX: 60,
      imageWidth: 180,
      imageHeight: 108,
      exclusionWidth: 252,
      exclusionHeight: 120,
      frameLeft: 60,
    }))
  })

  it('resolves left-side text with a right float exclusion', () => {
    expect(resolveInlineFloatGeometry({
      containerWidth: 600,
      imageWidth: 180,
      imageHeight: 108,
      x: .6,
      side: 'left',
      gap: 12,
    })).toEqual(jasmine.objectContaining({
      resolvedTextSide: 'left',
      floatDirection: 'right',
      imageX: 360,
      exclusionWidth: 252,
      exclusionHeight: 120,
      frameLeft: 12,
    }))
  })

  it('chooses the wider side and clamps unsafe geometry', () => {
    const left = resolveInlineFloatGeometry({
      containerWidth: 600,
      imageWidth: 180,
      imageHeight: 90,
      x: .7,
      side: 'auto',
      gap: 12,
    })
    expect(left.resolvedTextSide).toBe('left')
    expect(left.availableTextWidth).toBeGreaterThanOrEqual(96)

    const narrow = resolveInlineFloatGeometry({
      containerWidth: 180,
      imageWidth: 400,
      imageHeight: 200,
      x: Number.NaN,
      side: 'right',
      gap: -1,
    })
    expect(narrow.imageWidth).toBe(180)
    expect(narrow.imageHeight).toBe(90)
    expect(narrow.imageX).toBe(0)
    expect(narrow.exclusionWidth).toBe(180)
    expect(Number.isFinite(narrow.normalizedX)).toBeTrue()
  })

  it('returns a safe inert result for a stale zero-width owner', () => {
    const result = resolveInlineFloatGeometry({
      containerWidth: 0,
      imageWidth: 180,
      imageHeight: 90,
      x: .5,
      side: 'auto',
      gap: 12,
    })
    expect(result.containerWidth).toBe(0)
    expect(result.exclusionWidth).toBe(0)
    expect(result.imageWidth).toBe(0)
    expect(result.normalizedX).toBe(0)
    expect(result.layoutMode).toBe('single')
    expect(result.textIntervals).toEqual([])
  })

  it('discovers the real EmbedBlot wrapper and contains the float owner', () => {
    const owner = document.createElement('div')
    const cElement = document.createElement('c-element')
    const wrapper = document.createElement('span')
    const shell = document.createElement('span')
    const frame = document.createElement('span')
    const image = document.createElement('img')
    wrapper.contentEditable = 'false'
    shell.className = 'bc-inline-image-shell'
    shell.dataset['bcInlineFloat'] = 'true'
    shell.dataset['bcInlineImageLayout'] = 'wrap'
    shell.dataset['bcInlineImageWrapSide'] = 'auto'
    shell.dataset['bcInlineImageWrapX'] = '.1'
    shell.dataset['bcInlineImageWrapGap'] = '12'
    shell.dataset['bcInlineImageWidth'] = '180'
    shell.dataset['bcInlineImageHeight'] = '108'
    frame.className = 'bc-inline-image-frame'
    frame.appendChild(image)
    shell.appendChild(frame)
    wrapper.appendChild(shell)
    cElement.appendChild(wrapper)
    owner.appendChild(cElement)
    Object.defineProperty(owner, 'clientWidth', {
      configurable: true,
      value: 600,
    })

    const controller = new InlineFloatLayoutController(owner)
    controller.sync()

    expect(owner.hasAttribute('data-bc-inline-float-owner')).toBeTrue()
    expect(shell.style.cssFloat).toBe('left')
    expect(shell.style.width).toBe('252px')
    expect(frame.style.left).toBe('60px')

    shell.remove()
    controller.sync()
    expect(owner.hasAttribute('data-bc-inline-float-owner')).toBeFalse()

    controller.destroy()
  })

  it('uses the generic inline-object float contract', () => {
    const owner = document.createElement('div')
    const shell = document.createElement('span')
    const frame = document.createElement('span')
    shell.dataset['bcInlineFloat'] = 'true'
    shell.dataset['bcInlineFloatLayout'] = 'wrap'
    shell.dataset['bcInlineFloatSide'] = 'right'
    shell.dataset['bcInlineFloatX'] = '.1'
    shell.dataset['bcInlineFloatGap'] = '10'
    shell.dataset['bcInlineFloatWidth'] = '160'
    shell.dataset['bcInlineFloatHeight'] = '80'
    frame.setAttribute('data-bc-inline-float-frame', '')
    shell.appendChild(frame)
    owner.appendChild(shell)
    Object.defineProperty(owner, 'clientWidth', {
      configurable: true,
      value: 500,
    })

    const controller = new InlineFloatLayoutController(owner)
    controller.sync()

    expect(owner.hasAttribute('data-bc-inline-float-owner')).toBeTrue()
    expect(shell.style.cssFloat).toBe('left')
    expect(frame.style.width).toBe('160px')
    expect(frame.style.height).toBe('80px')
    controller.destroy()
  })

  it('can preview a shell without mutating persisted data attributes', () => {
    const shell = document.createElement('span')
    const frame = document.createElement('span')
    frame.className = 'bc-inline-image-frame'
    shell.appendChild(frame)
    shell.dataset['bcInlineImageWrapX'] = '.2'

    const geometry = applyInlineImageFloatLayout(shell, {
      containerWidth: 500,
      imageWidth: 160,
      imageHeight: 80,
      x: .6,
      side: 'left',
      gap: 10,
    })

    expect(geometry.resolvedTextSide).toBe('left')
    expect(shell.dataset['bcInlineImageWrapX']).toBe('.2')
    expect(shell.dataset['bcInlineImageResolvedTextSide']).toBe('left')
    expect(frame.style.width).toBe('160px')
  })

  it('does not overwrite an active pointer preview during owner refresh', () => {
    const owner = document.createElement('div')
    const shell = document.createElement('span')
    const frame = document.createElement('span')
    frame.className = 'bc-inline-image-frame'
    shell.dataset['bcInlineFloat'] = 'true'
    shell.dataset['bcInlineImageLayout'] = 'wrap'
    shell.dataset['bcInlineImageWrapX'] = '.1'
    shell.dataset['bcInlineImageWidth'] = '120'
    shell.dataset['bcInlineImageHeight'] = '60'
    shell.setAttribute('data-bc-inline-float-preview', '')
    shell.style.width = '300px'
    frame.style.left = '180px'
    shell.appendChild(frame)
    owner.appendChild(shell)
    Object.defineProperty(owner, 'clientWidth', {
      configurable: true,
      value: 500,
    })

    const controller = new InlineFloatLayoutController(owner)
    controller.refresh()

    expect(shell.style.width).toBe('300px')
    expect(frame.style.left).toBe('180px')
    controller.destroy()
  })
})
