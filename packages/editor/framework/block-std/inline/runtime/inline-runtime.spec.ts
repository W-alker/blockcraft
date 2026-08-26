import {
  createInlineImageDelta,
  withDefaultEmbedConverters,
} from '../image-embed'
import type {EmbedConverter} from '../index'
import {InlineRuntime} from './inline-runtime'
import {INLINE_PAGINATION_GAP_ATTRIBUTE} from './inline-pagination-projection'
import {InlineRangeMeasurer} from './inline-fragment-layout'
import {
  applyInlinePaginationGaps,
  clearInlinePaginationGaps,
  isInlinePaginationProjectionWritable,
  measureInlinePaginationLineStarts,
  subscribeInlinePaginationProjectionInvalidated,
  whenInlinePaginationProjectionWritable,
} from './inline-pagination-access'
import {
  createInlineShapeDelta,
  createInlineShapeEmbedConverter,
} from '../../../../blocks/shape-block/shape-embed'

const TEST_IMAGE_URL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='

function createConnectedInlineRuntime(
  width = 600,
  options?: ConstructorParameters<typeof InlineRuntime>[2],
  configuredEmbeds: [string, EmbedConverter][] = [],
): {
  host: HTMLElement
  container: HTMLElement
  runtime: InlineRuntime
} {
  const host = document.createElement('div')
  const container = document.createElement('div')
  host.dataset['inlineRuntimeTestHost'] = 'true'
  host.style.width = `${width}px`
  container.className = 'edit-container'
  container.style.cssText = [
    `width:${width}px`,
    'font:16px/20px monospace',
    'white-space:break-spaces',
    'word-break:break-all',
  ].join(';')
  host.appendChild(container)
  document.body.appendChild(host)

  const runtime = new InlineRuntime(
    container,
    new Map(withDefaultEmbedConverters([
      ['shape', createInlineShapeEmbedConverter()] as const,
      ...configuredEmbeds,
    ])),
    options,
  )
  return {host, container, runtime}
}

function refreshInlineFloatLayout(runtime: InlineRuntime): void {
  ;(runtime as unknown as {
    _inlineFloatLayout: {refresh(): void}
  })._inlineFloatLayout.refresh()
}

function runtimeModelOrder(runtime: InlineRuntime): string {
  return runtime.scrollBlot.leaves
    .map(leaf => leaf.domNode.textContent ?? '')
    .join('')
}

function relativeBand(
  container: HTMLElement,
  element: HTMLElement,
): {top: number; bottom: number} {
  const containerRect = container.getBoundingClientRect()
  const rect = element.getBoundingClientRect()
  return {
    top: rect.top - containerRect.top,
    bottom: rect.bottom - containerRect.top,
  }
}

describe('InlineRuntime inline float lifecycle', () => {
  afterEach(() => {
    document.body
      .querySelectorAll('[data-inline-runtime-test-host]')
      .forEach(element => element.remove())
  })

  it('syncs owner state after full and incremental renders', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600,
    })
    const runtime = new InlineRuntime(
      container,
      new Map(withDefaultEmbedConverters()),
    )
    const wrapped = createInlineImageDelta(
      'https://cdn.example.com/a.png',
      180,
      108,
      {wrap: true, side: 'auto', x: 0.1, gap: 12},
    )!

    runtime.render([wrapped])
    expect(container.hasAttribute('data-bc-inline-float-owner')).toBeTrue()
    expect(container.querySelector('[data-bc-inline-float]')).not.toBeNull()

    runtime.applyDelta([
      {retain: 1, attributes: {wrap: null, side: null, x: null, gap: null}},
    ])
    expect(container.hasAttribute('data-bc-inline-float-owner')).toBeFalse()

    runtime.destroy()
    expect(container.hasAttribute('data-bc-inline-float-owner')).toBeFalse()
  })

  it('does not mark an owner for ordinary inline images', () => {
    const container = document.createElement('div')
    const runtime = new InlineRuntime(
      container,
      new Map(withDefaultEmbedConverters()),
    )

    runtime.render([
      createInlineImageDelta('https://cdn.example.com/a.png', 120, 60)!,
    ])

    expect(container.hasAttribute('data-bc-inline-float-owner')).toBeFalse()
    runtime.destroy()
  })

  it('parks the DOM caret after the trailing embed marker', () => {
    const container = document.createElement('div')
    const runtime = new InlineRuntime(
      container,
      new Map(withDefaultEmbedConverters()),
    )
    runtime.render([{insert: {icon: 'csicon csicon-add'}}])

    const point = runtime.modelPointToDom(1)

    expect(point.node.parentElement?.dataset['zeroSpace']).toBe('true')
    expect(point.offset).toBe(point.node.textContent?.length ?? 0)
    expect(runtime.domPointToModel(point.node, point.offset)).toBe(1)
    runtime.destroy()
  })

  it('projects and revokes zero-model-length pagination gaps without changing offsets', () => {
    const container = document.createElement('div')
    const runtime = new InlineRuntime(container, new Map())
    runtime.render([{insert: 'abcdef'}])

    expect(applyInlinePaginationGaps(runtime, [{
      offset: 3,
      height: 140,
      backdropOffset: 80,
      backdropHeight: 20,
    }])).toBeTrue()
    const marker = container.querySelector<HTMLElement>(
      `[${INLINE_PAGINATION_GAP_ATTRIBUTE}]`,
    )
    expect(marker).not.toBeNull()
    expect(marker!.style.height).toBe('140px')
    expect(marker!.style.background).toBe('transparent')
    expect(runtime.textLength).toBe(6)
    expect(runtime.scrollBlot.leaves.length).toBe(2)
    expect(runtime.modelPointToDom(3).node.textContent).toBe('abc')

    // Boundary lies after leading-gap + left blot + pagination marker, but
    // the marker contributes zero model characters.
    const markerIndex = Array.from(container.childNodes).indexOf(marker!)
    expect(runtime.domPointToModel(container, markerIndex + 1)).toBe(3)

    clearInlinePaginationGaps(runtime)
    expect(container.querySelector(`[${INLINE_PAGINATION_GAP_ATTRIBUTE}]`)).toBeNull()
    expect(runtime.scrollBlot.leaves.length).toBe(1)
    expect(runtime.textLength).toBe(6)
    runtime.destroy()
  })

  it('keeps fit-content line wrapping stable while a pagination gap splits text', () => {
    const host = document.createElement('div')
    const prefix = document.createElement('span')
    const container = document.createElement('div')
    host.dataset['inlineRuntimeTestHost'] = 'true'
    host.style.cssText = 'display:flex;width:200px;'
    prefix.style.cssText = 'flex:0 0 30px;'
    container.style.cssText = [
      'width:fit-content',
      'max-width:170px',
      'font:16px/20px monospace',
      'white-space:break-spaces',
      'word-break:break-all',
    ].join(';')
    host.append(prefix, container)
    document.body.appendChild(host)
    const runtime = new InlineRuntime(container, new Map())
    runtime.render([{insert: 'abcdefghijklmnopqrstuvwx012345'}])
    const naturalWidth = container.getBoundingClientRect().width

    applyInlinePaginationGaps(runtime, [{
      offset: 15,
      height: 100,
      backdropOffset: 70,
      backdropHeight: 20,
    }])

    expect(container.getBoundingClientRect().width).toBeCloseTo(naturalWidth, 1)
    expect(container.style.width).toBe(`${container.clientWidth}px`)
    clearInlinePaginationGaps(runtime)
    expect(container.style.width).toBe('fit-content')
    runtime.destroy()
  })

  it('clears a pagination projection before an incremental model patch', () => {
    const container = document.createElement('div')
    const runtime = new InlineRuntime(container, new Map())
    runtime.render([{insert: 'abcdef'}])
    applyInlinePaginationGaps(runtime, [{
      offset: 3,
      height: 100,
      backdropOffset: 70,
      backdropHeight: 20,
    }])

    runtime.applyDelta([{retain: 6}, {insert: '!'}])

    expect(container.querySelector(`[${INLINE_PAGINATION_GAP_ATTRIBUTE}]`)).toBeNull()
    expect(runtime.textLength).toBe(7)
    expect(runtime.scrollBlot.leaves.map(leaf => leaf.domNode.textContent).join('')).toBe('abcdef!')
    runtime.destroy()
  })

  it('notifies pagination when a canonical mutation revokes its live projection', () => {
    const container = document.createElement('div')
    const runtime = new InlineRuntime(container, new Map())
    const invalidated = jasmine.createSpy('invalidated')
    const unsubscribe = subscribeInlinePaginationProjectionInvalidated(
      runtime,
      invalidated,
    )
    runtime.render([{insert: 'abcdef'}])
    applyInlinePaginationGaps(runtime, [{
      offset: 3,
      height: 100,
      backdropOffset: 70,
      backdropHeight: 20,
    }])

    runtime.render([{insert: 'abcdef'}])
    runtime.render([{insert: 'abcdef'}])

    expect(invalidated).toHaveBeenCalledTimes(1)
    unsubscribe()
    runtime.destroy()
  })

  it('measures safe model offsets at visual line starts', () => {
    const host = document.createElement('div')
    const container = document.createElement('div')
    host.dataset['inlineRuntimeTestHost'] = 'true'
    host.style.width = '100px'
    container.style.cssText = [
      'width:100px',
      'font:16px/20px monospace',
      'white-space:pre-wrap',
      'word-break:break-all',
    ].join(';')
    host.appendChild(container)
    document.body.appendChild(host)
    const runtime = new InlineRuntime(container, new Map())
    runtime.render([{insert: 'abcdefghijklmnopqrstuvwx'}])
    const hiddenFit = spyOn(
      InlineRangeMeasurer.prototype,
      'fitFragment',
    ).and.callThrough()

    const points = measureInlinePaginationLineStarts(runtime, 2)

    expect(points.length).toBeGreaterThan(1)
    expect(points.length).toBeLessThanOrEqual(2)
    expect(hiddenFit).not.toHaveBeenCalled()
    expect(points.every((point, index) =>
      point.offset > (points[index - 1]?.offset ?? 0)
      && point.top > (points[index - 1]?.top ?? -1),
    )).toBeTrue()
    expect(points.every(point => point.offset > 0 && point.offset < runtime.textLength)).toBeTrue()
    runtime.destroy()
  })

  it('inserts many pagination gaps in model order without changing text', () => {
    const container = document.createElement('div')
    const runtime = new InlineRuntime(container, new Map())
    runtime.render([{insert: 'abcdefghijkl'}])

    expect(applyInlinePaginationGaps(runtime, [3, 6, 9].map(offset => ({
      offset,
      height: 100,
      backdropOffset: 70,
      backdropHeight: 20,
    })))).toBeTrue()

    const markers = Array.from(container.querySelectorAll(
      `[${INLINE_PAGINATION_GAP_ATTRIBUTE}]`,
    ))
    expect(markers.length).toBe(3)
    expect(runtime.scrollBlot.leaves.map(leaf => leaf.domNode.textContent).join(''))
      .toBe('abcdefghijkl')
    expect(runtime.textLength).toBe(12)
    runtime.destroy()
  })

  it('rebuilds the same pagination projection after a marker is detached', () => {
    const container = document.createElement('div')
    const runtime = new InlineRuntime(container, new Map())
    runtime.render([{insert: 'abcdefghijkl'}])
    const gaps = [{
      offset: 6,
      height: 100,
      backdropOffset: 70,
      backdropHeight: 20,
    }]

    expect(applyInlinePaginationGaps(runtime, gaps)).toBeTrue()
    const firstMarker = container.querySelector<HTMLElement>(
      `[${INLINE_PAGINATION_GAP_ATTRIBUTE}]`,
    )!
    firstMarker.remove()

    expect(applyInlinePaginationGaps(runtime, gaps)).toBeTrue()
    const replayedMarker = container.querySelector<HTMLElement>(
      `[${INLINE_PAGINATION_GAP_ATTRIBUTE}]`,
    )
    expect(replayedMarker).not.toBeNull()
    expect(replayedMarker).not.toBe(firstMarker)
    expect(replayedMarker!.parentElement).toBe(container)
    expect(runtime.scrollBlot.leaves.length).toBe(2)
    expect(runtime.textLength).toBe(12)
    runtime.destroy()
  })

  it('restores a detached model-owned break before an unprojected mutation', () => {
    const container = document.createElement('div')
    const runtime = new InlineRuntime(container, new Map())
    runtime.render([{insert: 'abcdef'}])
    const breakBlot = runtime.scrollBlot.children.find(
      child => child.type === 'break',
    )!
    breakBlot.domNode.parentNode?.removeChild(breakBlot.domNode)

    runtime.applyDelta([{retain: 6}, {insert: '!'}])

    expect(breakBlot.domNode.parentNode).toBe(container)
    expect(runtime.textLength).toBe(7)
    runtime.destroy()
  })

  it('does not enumerate every native line rect for a very long paragraph', () => {
    const host = document.createElement('div')
    const container = document.createElement('div')
    host.dataset['inlineRuntimeTestHost'] = 'true'
    host.style.width = '100px'
    container.style.cssText = [
      'width:100px',
      'font:16px/20px monospace',
      'white-space:pre-wrap',
      'word-break:break-all',
    ].join(';')
    host.appendChild(container)
    document.body.appendChild(host)
    const runtime = new InlineRuntime(container, new Map())
    runtime.render([{insert: 'abcdefghij'.repeat(500)}])
    const rectReads = spyOn(runtime, 'modelRangeToClientRects').and.callThrough()

    const points = measureInlinePaginationLineStarts(runtime, 4)

    expect(points.length).toBeLessThanOrEqual(4)
    expect(rectReads.calls.allArgs().some(
      ([start, end]) => start === 0 && end === runtime.textLength,
    )).toBeFalse()
    runtime.destroy()
  })

  it('keeps every line anchor for an ordinary multiline rich cell', () => {
    const host = document.createElement('div')
    const container = document.createElement('div')
    host.dataset['inlineRuntimeTestHost'] = 'true'
    container.style.cssText = [
      'width:240px',
      'font:24px/40px sans-serif',
      'white-space:pre-wrap',
    ].join(';')
    host.appendChild(container)
    document.body.appendChild(host)
    const runtime = new InlineRuntime(container, new Map())
    runtime.render([{insert: Array.from(
      {length: 10},
      (_, index) => `第 ${index + 1} 行 ⭐`,
    ).join('\n')}])

    const points = measureInlinePaginationLineStarts(runtime, 64)
    const secondLineInkTop = runtime
      .modelRangeToClientRects(points[0].offset, points[0].offset + 1)[0]
      .top - container.getBoundingClientRect().top

    expect(points.length).toBe(9)
    expect(points[0].top).toBeLessThan(secondLineInkTop - 2)
    expect(points.every((point, index) =>
      point.offset > (points[index - 1]?.offset ?? 0)
      && point.top > (points[index - 1]?.top ?? -1),
    )).toBeTrue()
    runtime.destroy()
  })

  it('keeps heading line-box anchors in visual coordinates under CSS zoom', () => {
    const host = document.createElement('div')
    const container = document.createElement('div')
    host.dataset['inlineRuntimeTestHost'] = 'true'
    host.style.zoom = '1.25'
    container.style.cssText = [
      'width:360px',
      'font:700 28px/42px sans-serif',
      'white-space:pre-wrap',
    ].join(';')
    host.appendChild(container)
    document.body.appendChild(host)
    const runtime = new InlineRuntime(container, new Map())
    runtime.render([{insert: 'MVP workflow 标题\n第二行标题\n第三行标题'}])

    const points = measureInlinePaginationLineStarts(runtime, 64)
    const containerRect = container.getBoundingClientRect()
    const nextInkRect = runtime.modelRangeToClientRects(
      points[0].offset,
      points[0].offset + 1,
    )[0]
    const layoutLineHeight = Number.parseFloat(getComputedStyle(container).lineHeight)
    const visualScale = containerRect.height / container.offsetHeight
    const expectedLineBoxTop = nextInkRect.top
      - Math.max(0, (layoutLineHeight * visualScale - nextInkRect.height) / 2)
      - containerRect.top

    expect(visualScale).toBeCloseTo(1.25, 1)
    expect(points.length).toBe(2)
    expect(points[0].top).toBeCloseTo(expectedLineBoxTop, 1)
    expect(points[0].visualGuardHeight).toBeCloseTo(
      Math.max(layoutLineHeight * visualScale, nextInkRect.height)
        + 0.75,
      1,
    )
    runtime.destroy()
  })

  it('keeps a normal line-height guard in visual pixels without double-applying CSS zoom', () => {
    const host = document.createElement('div')
    const container = document.createElement('div')
    host.dataset['inlineRuntimeTestHost'] = 'true'
    host.style.zoom = '1.25'
    container.style.cssText = [
      'width:360px',
      'font:700 28px sans-serif',
      'line-height:normal',
      'white-space:pre-wrap',
    ].join(';')
    host.appendChild(container)
    document.body.appendChild(host)
    const runtime = new InlineRuntime(container, new Map())
    runtime.render([{insert: 'normal first line\nnormal second line\nnormal third line'}])

    const points = measureInlinePaginationLineStarts(runtime, 64)
    const containerRect = container.getBoundingClientRect()
    const visualScale = containerRect.height / container.offsetHeight
    const nextInkRect = runtime.modelRangeToClientRects(
      points[0].offset,
      points[0].offset + 1,
    )[0]

    expect(getComputedStyle(container).lineHeight).toBe('normal')
    expect(visualScale).toBeCloseTo(1.25, 1)
    expect(points.length).toBe(2)
    // InlineRangeMeasurer's normal fallback is already a Range BCR height.
    // Multiplying it by visualScale again would make this 1.25x too large.
    expect(points[0].visualGuardHeight).toBeCloseTo(
      nextInkRect.height + 0.75,
      1,
    )
    runtime.destroy()
  })

  it('does not reserve a guard when a visual line already starts at a Blot boundary', () => {
    const host = document.createElement('div')
    const container = document.createElement('div')
    host.dataset['inlineRuntimeTestHost'] = 'true'
    container.style.cssText = [
      'width:420px',
      'font:24px/40px sans-serif',
      'white-space:pre-wrap',
    ].join(';')
    host.appendChild(container)
    document.body.appendChild(host)
    const runtime = new InlineRuntime(container, new Map())
    const firstLine = '第一行\n'
    runtime.render([
      {insert: firstLine, attributes: {bold: true}},
      {insert: '第二行\n第三行'},
    ])

    const points = measureInlinePaginationLineStarts(runtime, 64)

    expect(points.length).toBe(2)
    expect(points[0].offset).toBe(firstLine.length)
    expect(points[0].visualGuardHeight).toBe(0)
    expect(points[1].visualGuardHeight).toBeGreaterThan(0)
    runtime.destroy()
  })

  it('does not treat mixed-format and emoji ink tops as extra visual lines', () => {
    const host = document.createElement('div')
    const container = document.createElement('div')
    host.dataset['inlineRuntimeTestHost'] = 'true'
    container.style.cssText = [
      'width:420px',
      'font:24px/40px sans-serif',
      'white-space:pre-wrap',
    ].join(';')
    host.appendChild(container)
    document.body.appendChild(host)
    const runtime = new InlineRuntime(container, new Map())
    runtime.render([
      {insert: '普通文字 '},
      {insert: '强调', attributes: {bold: true}},
      {insert: ' ⭐\n第二行 '},
      {insert: '斜体', attributes: {italic: true}},
      {insert: ' ⭐\n第三行'},
    ])

    const points = measureInlinePaginationLineStarts(runtime, 64)

    expect(points.length).toBe(2)
    expect(points.map(point => point.offset)).toEqual([
      '普通文字 强调 ⭐\n'.length,
      '普通文字 强调 ⭐\n第二行 斜体 ⭐\n'.length,
    ])
    runtime.destroy()
  })

  it('measures dual-auto pagination anchors only outside a wrapped shape band', () => {
    const {container, runtime} = createConnectedInlineRuntime()
    const before = '环绕对象之前的普通段落文本。'.repeat(8)
    const after = '环绕对象之后继续形成足够多的视觉行用于分页。'.repeat(45)
    runtime.render([
      {insert: before},
      createInlineShapeDelta(
        {shapeType: 'ellipse', width: 180, height: 100},
        [{insert: '环绕形状'}],
        {wrap: true, x: 0.35, gap: 12},
      ),
      {insert: after},
    ])
    refreshInlineFloatLayout(runtime)

    const group = container.querySelector<HTMLElement>(
      '[data-bc-inline-fragment-group]',
    )!
    expect(group).not.toBeNull()
    const band = relativeBand(container, group)
    expect(band.bottom - band.top).toBeGreaterThanOrEqual(112)

    const points = measureInlinePaginationLineStarts(runtime, 256)

    expect(points.length).toBeGreaterThan(2)
    expect(points.some(point => point.top < band.top - 0.75)).toBeTrue()
    expect(points.some(point => point.top >= band.bottom - 0.75)).toBeTrue()
    expect(points.filter(point =>
      point.top > band.top + 0.75
      && point.top < band.bottom - 0.75,
    )).toEqual([])
    expect(points.every((point, index) =>
      point.offset > (points[index - 1]?.offset ?? 0)
      && point.top > (points[index - 1]?.top ?? -1),
    )).toBeTrue()
    runtime.destroy()
  })

  it('composes dual-auto wrapping with page gaps without changing model offsets', () => {
    const releases: jasmine.Spy[] = []
    const beginSelectionProjection = jasmine.createSpy(
      'beginSelectionProjection',
    ).and.callFake(() => {
      const release = jasmine.createSpy('releaseSelectionProjection')
      releases.push(release)
      return release
    })
    const {container, runtime} = createConnectedInlineRuntime(600, {
      beginSelectionProjection,
    })
    const before = '图片之前的文字用于建立稳定锚点。'.repeat(6)
    const after = '图片之后的长文本继续跨越多个页面视觉行。'.repeat(50)
    runtime.render([
      {insert: before},
      createInlineImageDelta(TEST_IMAGE_URL, 180, 100, {
        wrap: true,
        side: 'auto',
        x: 0.35,
        gap: 12,
      })!,
      {insert: after},
    ])
    refreshInlineFloatLayout(runtime)
    beginSelectionProjection.calls.reset()
    releases.length = 0

    const naturalGroup = container.querySelector<HTMLElement>(
      '[data-bc-inline-fragment-group]',
    )!
    const band = relativeBand(container, naturalGroup)
    const point = measureInlinePaginationLineStarts(runtime, 256).find(
      candidate => candidate.top >= band.bottom - 0.75,
    )!
    expect(point).toBeDefined()
    const originalLength = runtime.textLength
    const originalOrder = runtimeModelOrder(runtime)
    const mappedOffset = Math.min(originalLength - 1, point.offset + 3)

    const gap = {
      offset: point.offset,
      height: 140,
      backdropOffset: 100,
      backdropHeight: 20,
    }
    expect(applyInlinePaginationGaps(runtime, [gap])).toBeTrue()

    const marker = container.querySelector<HTMLElement>(
      `[${INLINE_PAGINATION_GAP_ATTRIBUTE}]`,
    )!
    const projectedGroup = container.querySelector<HTMLElement>(
      '[data-bc-inline-fragment-group]',
    )
    const frame = container.querySelector<HTMLElement>(
      '.bc-inline-image-frame',
    )
    expect(marker).not.toBeNull()
    expect(marker.parentElement).toBe(container)
    expect(projectedGroup).not.toBeNull()
    expect(frame).not.toBeNull()
    expect(frame!.isConnected).toBeTrue()
    expect(frame!.style.visibility).toBe('visible')
    expect(applyInlinePaginationGaps(runtime, [gap])).toBeTrue()
    expect(container.querySelector(
      `[${INLINE_PAGINATION_GAP_ATTRIBUTE}]`,
    )).toBe(marker)
    expect(container.querySelector(
      '[data-bc-inline-fragment-group]',
    )).toBe(projectedGroup)
    expect(runtime.textLength).toBe(originalLength)
    expect(runtimeModelOrder(runtime)).toBe(originalOrder)
    let domPoint = runtime.modelPointToDom(mappedOffset)
    expect(runtime.domPointToModel(domPoint.node, domPoint.offset))
      .toBe(mappedOffset)

    clearInlinePaginationGaps(runtime)

    expect(container.querySelector(
      `[${INLINE_PAGINATION_GAP_ATTRIBUTE}]`,
    )).toBeNull()
    expect(container.querySelector(
      '[data-bc-inline-fragment-group]',
    )).not.toBeNull()
    expect(container.querySelector('.bc-inline-image-frame')).not.toBeNull()
    expect(runtime.textLength).toBe(originalLength)
    expect(runtimeModelOrder(runtime)).toBe(originalOrder)
    domPoint = runtime.modelPointToDom(mappedOffset)
    expect(runtime.domPointToModel(domPoint.node, domPoint.offset))
      .toBe(mappedOffset)
    expect(beginSelectionProjection).toHaveBeenCalled()
    expect(releases.length).toBe(beginSelectionProjection.calls.count())
    expect(releases.every(release => release.calls.count() === 1)).toBeTrue()
    runtime.destroy()
  })

  it('fails closed when a manual page gap intersects a dual float group', () => {
    const {container, runtime} = createConnectedInlineRuntime()
    const before = '环绕图片前置文本。'.repeat(5)
    const after = '环绕图片带内以及带后的正文。'.repeat(35)
    runtime.render([
      {insert: before},
      createInlineImageDelta(TEST_IMAGE_URL, 180, 100, {
        wrap: true,
        side: 'auto',
        x: 0.35,
        gap: 12,
      })!,
      {insert: after},
    ])
    refreshInlineFloatLayout(runtime)
    const originalLength = runtime.textLength
    const originalOrder = runtimeModelOrder(runtime)
    const insideGroupOffset = before.length + 1

    expect(applyInlinePaginationGaps(runtime, [{
      offset: insideGroupOffset,
      height: 140,
      backdropOffset: 100,
      backdropHeight: 20,
    }])).toBeFalse()

    expect(container.querySelector(
      `[${INLINE_PAGINATION_GAP_ATTRIBUTE}]`,
    )).toBeNull()
    expect(container.querySelector(
      '[data-bc-inline-fragment-group]',
    )).not.toBeNull()
    const frame = container.querySelector<HTMLElement>(
      '.bc-inline-image-frame',
    )
    expect(frame).not.toBeNull()
    expect(frame!.isConnected).toBeTrue()
    expect(frame!.style.visibility).toBe('visible')
    expect(runtime.textLength).toBe(originalLength)
    expect(runtimeModelOrder(runtime)).toBe(originalOrder)
    runtime.destroy()
  })

  it('ignores legacy shape-side metadata when paginating its wrap band', () => {
    const {container, runtime} = createConnectedInlineRuntime()
    const after = '单侧环绕形状后的长文本继续形成安全视觉行。'.repeat(55)
    const shape = createInlineShapeDelta(
      {shapeType: 'ellipse', width: 160, height: 80},
      [{insert: '环绕形状'}],
      {wrap: true, x: 0.1, gap: 12},
    )
    shape.attributes = {...shape.attributes, side: 'left'}
    runtime.render([
      shape,
      {insert: after},
    ])
    refreshInlineFloatLayout(runtime)

    const shell = container.querySelector<HTMLElement>(
      '[data-bc-inline-object="shape"]',
    )!
    expect(shell).not.toBeNull()
    expect(shell.style.cssFloat).toBe('left')
    expect(container.querySelector(
      '[data-bc-inline-fragment-group]',
    )).toBeNull()
    const band = relativeBand(container, shell)
    const points = measureInlinePaginationLineStarts(runtime, 256)
    expect(points.length).toBeGreaterThan(0)
    expect(points.every(point => point.top >= band.bottom - 0.75)).toBeTrue()
    const point = points[0]
    const originalLength = runtime.textLength
    const originalOrder = runtimeModelOrder(runtime)

    expect(applyInlinePaginationGaps(runtime, [{
      offset: point.offset,
      height: 140,
      backdropOffset: 100,
      backdropHeight: 20,
    }])).toBeTrue()

    const marker = container.querySelector<HTMLElement>(
      `[${INLINE_PAGINATION_GAP_ATTRIBUTE}]`,
    )!
    expect(marker).not.toBeNull()
    expect(marker.parentElement).toBe(container)
    expect(shell.isConnected).toBeTrue()
    expect(shell.style.cssFloat).toBe('left')
    expect(container.querySelector('.bc-inline-shape-frame')).not.toBeNull()
    expect(runtime.textLength).toBe(originalLength)
    expect(runtimeModelOrder(runtime)).toBe(originalOrder)

    clearInlinePaginationGaps(runtime)
    expect(container.querySelector(
      `[${INLINE_PAGINATION_GAP_ATTRIBUTE}]`,
    )).toBeNull()
    expect(shell.style.cssFloat).toBe('left')
    expect(runtime.textLength).toBe(originalLength)
    expect(runtimeModelOrder(runtime)).toBe(originalOrder)
    runtime.destroy()
  })

  it('projects eligible auto wrapping into real left and right text fragments', () => {
    const host = document.createElement('div')
    const container = document.createElement('div')
    host.dataset['inlineRuntimeTestHost'] = 'true'
    host.style.width = '600px'
    container.className = 'edit-container'
    container.style.width = '600px'
    container.style.font = '16px/20px Arial'
    container.style.whiteSpace = 'break-spaces'
    container.style.wordBreak = 'break-all'
    host.appendChild(container)
    document.body.appendChild(host)
    const runtime = new InlineRuntime(
      container,
      new Map(withDefaultEmbedConverters()),
    )

    const before = '前置文本用于确认锚点行与左侧片段。'
    const after =
      '后置文本继续进入右侧以及后续多行片段，且必须保留真实文本节点。'.repeat(3)
    runtime.render([
      {insert: before},
      createInlineImageDelta('https://cdn.example.com/center.png', 180, 80, {
        wrap: true,
        side: 'auto',
        x: 0.35,
        gap: 12,
      })!,
      {insert: after},
    ])
    ;(runtime as any)._inlineFloatLayout.refresh()

    const group = container.querySelector('[data-bc-inline-fragment-group]')
    const left = group?.querySelector('[data-bc-inline-fragment-side="left"]')
    const right = group?.querySelector('[data-bc-inline-fragment-side="right"]')
    expect(group).not.toBeNull()
    expect(left?.querySelector('c-text')).not.toBeNull()
    expect(right?.querySelector('c-text')).not.toBeNull()
    const leftRect = left!.getBoundingClientRect()
    const rightRect = right!.getBoundingClientRect()
    const frameRect = group!
      .querySelector<HTMLElement>('.bc-inline-image-frame')!
      .getBoundingClientRect()
    expect(Math.abs(leftRect.top - rightRect.top)).toBeLessThanOrEqual(0.75)
    expect(leftRect.right).toBeLessThanOrEqual(frameRect.left - 12 + 0.75)
    expect(rightRect.left).toBeGreaterThanOrEqual(frameRect.right + 12 - 0.75)
    expect(runtime.textLength).toBeGreaterThan(100)

    runtime.applyDelta([
      {retain: before.length + 1 + after.length},
      {insert: '增量'},
    ])
    ;(runtime as any)._inlineFloatLayout.refresh()
    expect(runtime.textLength).toBe(before.length + 1 + after.length + 2)
    expect(
      container.querySelector('[data-bc-inline-fragment-group]'),
    ).not.toBeNull()

    runtime.destroy()
    expect(
      container.querySelector('[data-bc-inline-fragment-group]'),
    ).toBeNull()
  })

  it('keeps heading Mention, link and formula geometry out of a wrapped image', () => {
    const mentionConverter: EmbedConverter = {
      toView: delta => {
        const span = document.createElement('span')
        span.dataset['richMention'] = 'true'
        span.style.display = 'inline-block'
        span.style.whiteSpace = 'nowrap'
        span.textContent = `@${String(delta.insert['mention'] ?? '')}`
        return span
      },
      toDelta: element => ({
        insert: {mention: (element.textContent ?? '').replace(/^@/, '')},
      }),
    }
    const latexConverter: EmbedConverter = {
      toView: delta => {
        const span = document.createElement('span')
        span.dataset['richLatex'] = 'true'
        span.style.display = 'inline-block'
        span.style.whiteSpace = 'nowrap'
        span.textContent = String(delta.insert['latex'] ?? '')
        return span
      },
      toDelta: element => ({
        insert: {latex: element.textContent ?? ''},
      }),
    }
    const {container, runtime} = createConnectedInlineRuntime(
      682,
      undefined,
      [
        ['mention', mentionConverter],
        ['latex', latexConverter],
      ],
    )
    container.style.fontFamily = 'Arial'
    container.style.fontSize = '32px'
    container.style.fontWeight = '700'
    container.style.lineHeight = '48px'
    container.style.fontVariantNumeric = 'tabular-nums'
    container.style.whiteSpace = 'pre-wrap'

    const prefix = 'Blockcraft 2.0 Playground：'
    const bold = '用真实 block 组合'
    const beforeMention = ' 展示正式编辑器需要覆盖的内容结构，包括 '
    const punctuation = '、'
    const linked = '产品文档'
    const beforeFormula = ' 和行内公式 '
    const suffix = '。'
    const image = createInlineImageDelta(TEST_IMAGE_URL, 180, 108, {
      wrap: true,
      side: 'auto',
      x: 0.32,
      gap: 12,
    })!
    runtime.render([
      {insert: prefix},
      image,
      {insert: bold, attributes: {'a:bold': true}},
      {insert: beforeMention},
      {
        insert: {mention: 'Alice Chen'},
        attributes: {mentionId: 'user_alice', mentionType: 'user'},
      },
      {insert: punctuation},
      {insert: linked, attributes: {'a:link': 'https://blockcraft.dev/docs'}},
      {insert: beforeFormula},
      {insert: {latex: 'E = mc²'}},
      {insert: suffix},
    ])
    const pendingFrame = container.querySelector<HTMLElement>(
      '.bc-inline-image-frame',
    )!
    // The package Karma target does not load the application-level frame
    // display rule. Keep the test geometry equivalent to the real editor.
    pendingFrame.style.display = 'block'
    refreshInlineFloatLayout(runtime)

    const expectedLength =
      prefix.length + 1 + bold.length + beforeMention.length + 1 +
      punctuation.length + linked.length + beforeFormula.length + 1 +
      suffix.length
    const mentionOffset =
      prefix.length + 1 + bold.length + beforeMention.length
    const formulaOffset =
      mentionOffset + 1 + punctuation.length + linked.length +
      beforeFormula.length

    const expectRichLayout = () => {
      const group = container.querySelector<HTMLElement>(
        '[data-bc-inline-fragment-group]',
      )!
      const frame = group?.querySelector<HTMLElement>(
        '.bc-inline-image-frame',
      )!
      const mention = container.querySelector<HTMLElement>(
        '[data-rich-mention]',
      )!.closest<HTMLElement>('c-element')!
      const link = container.querySelector<HTMLElement>(
        'c-element[link="https://blockcraft.dev/docs"]',
      )!
      const formula = container.querySelector<HTMLElement>(
        '[data-rich-latex]',
      )!.closest<HTMLElement>('c-element')!

      expect(group).not.toBeNull()
      expect(frame).not.toBeNull()
      expect(mention.isConnected).toBeTrue()
      expect(link.isConnected).toBeTrue()
      expect(formula.isConnected).toBeTrue()

      const groupRect = group.getBoundingClientRect()
      const frameRect = frame.getBoundingClientRect()
      const frameLeft = groupRect.left + Number.parseFloat(frame.style.left)
      const frameRight = frameLeft + Number.parseFloat(frame.style.width)
      const overlapsFrame = (rect: DOMRect) =>
        rect.left < frameRight - 0.75 &&
        rect.right > frameLeft + 0.75 &&
        rect.top < frameRect.bottom - 0.75 &&
        rect.bottom > frameRect.top + 0.75

      for (const richNode of [mention, link, formula]) {
        expect(overlapsFrame(richNode.getBoundingClientRect())).toBeFalse()
      }

      for (const left of Array.from(group.querySelectorAll<HTMLElement>(
        '[data-bc-inline-fragment-side="left"]',
      ))) {
        const rect = left.getBoundingClientRect()
        if (rect.width > 0.75) {
          expect(rect.right).toBeLessThanOrEqual(frameLeft - 12 + 0.75)
        }
      }
      for (const right of Array.from(group.querySelectorAll<HTMLElement>(
        '[data-bc-inline-fragment-side="right"]',
      ))) {
        const rect = right.getBoundingClientRect()
        if (rect.width > 0.75) {
          expect(rect.left).toBeGreaterThanOrEqual(frameRight + 12 - 0.75)
          expect(rect.right).toBeLessThanOrEqual(
            container.getBoundingClientRect().right + 0.75,
          )
        }
      }
    }
    const expectRichOffsets = () => {
      for (const offset of [
        mentionOffset,
        mentionOffset + 1,
        formulaOffset,
        formulaOffset + 1,
      ]) {
        const point = runtime.modelPointToDom(offset)
        expect(runtime.domPointToModel(point.node, point.offset)).toBe(offset)
      }
    }

    expect(getComputedStyle(container).fontSize).toBe('32px')
    expect(getComputedStyle(container).fontWeight).toBe('700')
    expect(runtime.textLength).toBe(expectedLength)
    expectRichLayout()
    expectRichOffsets()

    runtime.applyDelta([{retain: expectedLength}, {insert: '增量'}])
    refreshInlineFloatLayout(runtime)
    expect(runtime.textLength).toBe(expectedLength + 2)
    expectRichLayout()
    expectRichOffsets()

    runtime.destroy()
    expect(container.querySelector(
      '[data-bc-inline-fragment-group]',
    )).toBeNull()
  })

  it('defers a dirty refresh while a layout freeze lease is held', () => {
    let scheduledFrame: FrameRequestCallback | undefined
    spyOn(window, 'requestAnimationFrame').and.callFake(callback => {
      scheduledFrame = callback
      return 1
    })
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 500,
    })
    const runtime = new InlineRuntime(
      container,
      new Map(withDefaultEmbedConverters()),
    )
    runtime.render([
      createInlineImageDelta('https://cdn.example.com/freeze.png', 120, 60, {
        wrap: true,
        side: 'right',
        x: 0.1,
        gap: 12,
      })!,
    ])
    const shell = container.querySelector<HTMLElement>(
      '[data-bc-inline-float]',
    )!
    const originalWidth = shell.style.width
    const release = runtime.acquireFloatLayoutFreeze()
    const projectionReady = jasmine.createSpy('projectionReady')
    whenInlinePaginationProjectionWritable(runtime, projectionReady)
    expect(isInlinePaginationProjectionWritable(runtime)).toBeFalse()
    shell.dataset['bcInlineImageWrapX'] = '.5'
    ;(runtime as any)._inlineFloatLayout.refresh()
    expect(shell.style.width).toBe(originalWidth)

    release()
    expect(projectionReady).not.toHaveBeenCalled()
    expect(scheduledFrame).toBeDefined()
    scheduledFrame!(performance.now())
    expect(isInlinePaginationProjectionWritable(runtime)).toBeTrue()
    expect(projectionReady).toHaveBeenCalledTimes(1)
    expect(shell.style.width).not.toBe(originalWidth)
    runtime.destroy()
  })

  it('keeps multiple dual anchors in Delta order and pushes the later band down', () => {
    const host = document.createElement('div')
    const container = document.createElement('div')
    host.dataset['inlineRuntimeTestHost'] = 'true'
    host.style.width = '600px'
    container.className = 'edit-container'
    container.style.cssText = [
      'width:600px',
      'font:16px/20px Arial',
      'white-space:break-spaces',
      'word-break:break-all',
    ].join(';')
    host.appendChild(container)
    document.body.appendChild(host)
    const runtime = new InlineRuntime(
      container,
      new Map(withDefaultEmbedConverters()),
    )

    runtime.render([
      {insert: '第一锚点前文本'},
      createInlineImageDelta('https://cdn.example.com/first.png', 140, 60, {
        wrap: true,
        side: 'auto',
        x: 0.38,
        gap: 12,
      })!,
      {insert: '两个锚点之间的文本'},
      createInlineImageDelta('https://cdn.example.com/second.png', 140, 60, {
        wrap: true,
        side: 'auto',
        x: 0.38,
        gap: 12,
      })!,
      {insert: '第二锚点后的文本继续排版。'.repeat(8)},
    ])
    ;(runtime as any)._inlineFloatLayout.refresh()

    const groups = Array.from(
      container.querySelectorAll<HTMLElement>(
        '[data-bc-inline-fragment-group]',
      ),
    )
    expect(groups.length).toBe(2)
    expect(
      groups[0].compareDocumentPosition(groups[1]) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(Number.parseFloat(groups[0].style.minHeight)).toBeGreaterThanOrEqual(
      72,
    )
    expect(groups[1].offsetTop).toBeGreaterThanOrEqual(
      groups[0].offsetTop + groups[0].offsetHeight,
    )

    runtime.destroy()
  })

  it('starts long-paragraph wrapping near the anchor and ends with the image band', () => {
    const host = document.createElement('div')
    const container = document.createElement('div')
    host.dataset['inlineRuntimeTestHost'] = 'true'
    host.style.width = '800px'
    container.className = 'edit-container'
    container.style.cssText = [
      'width:800px',
      'font:24px/48px monospace',
      'white-space:pre-wrap',
      'word-break:break-all',
    ].join(';')
    host.appendChild(container)
    document.body.appendChild(host)
    const runtime = new InlineRuntime(
      container,
      new Map(withDefaultEmbedConverters()),
    )
    const before = 'a'.repeat(3000)
    const after = 'b'.repeat(1000)

    runtime.render([
      {insert: before},
      createInlineImageDelta(
        'https://cdn.example.com/long-anchor.png',
        260,
        173,
        {wrap: true, side: 'auto', x: 0.36, gap: 12},
      )!,
      {insert: after},
    ])
    ;(runtime as any)._inlineFloatLayout.refresh()

    const group = container.querySelector<HTMLElement>(
      '[data-bc-inline-fragment-group]',
    )!
    const rows = group.querySelectorAll('[data-bc-inline-fragment-row]')
    let textBeforeGroup = ''
    for (const child of Array.from(container.children)) {
      if (child === group) break
      textBeforeGroup += child.textContent ?? ''
    }

    expect(group).not.toBeNull()
    expect(textBeforeGroup.length).toBeGreaterThan(2900)
    expect(rows.length).toBe(4)
    expect(Number.parseFloat(group.style.minHeight)).toBe(192)
    expect(group.nextElementSibling?.matches('c-element')).toBeTrue()
    expect(group.nextElementSibling?.textContent).toContain('b')

    runtime.destroy()
  })
})
