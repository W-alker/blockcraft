import {EmbedBlot, ScrollBlot, TextBlot} from '../blot'
import type {EmbedConverter} from '../index'
import type {InlineModel} from '../../types'
import {resolveInlineFloatGeometry} from './inline-float-layout'
import {
  buildInlineFragmentPlan,
  graphemeBoundaries,
  InlineFragmentProjection,
  InlineRangeMeasurer,
} from './inline-fragment-layout'
import {INLINE_PAGINATION_GAP_ATTRIBUTE} from './inline-pagination-projection'

describe('inline fragment layout', () => {
  const converter: EmbedConverter = {
    toView: () => {
      const shell = document.createElement('span')
      const frame = document.createElement('span')
      shell.className = 'bc-inline-image-shell'
      frame.className = 'bc-inline-image-frame'
      shell.appendChild(frame)
      return shell
    },
    toDelta: () => ({insert: {image: 'test'}}),
  }

  function createScroll(
    deltas: InlineModel,
    imageConverter: EmbedConverter = converter,
  ) {
    const container = document.createElement('div')
    const scroll = new ScrollBlot(
      container,
      new Map([['image', imageConverter]]),
    )
    scroll.build(deltas)
    return {container, scroll}
  }

  it('keeps emoji and combining graphemes indivisible', () => {
    const text = `Á👩‍👩‍👧‍👦👍🏽Z`
    const boundaries = graphemeBoundaries(text)

    expect(boundaries[0]).toBe(0)
    expect(boundaries[boundaries.length - 1]).toBe(text.length)
    expect(boundaries.length).toBe(5)
    expect(boundaries).not.toContain(1)
    expect(boundaries).not.toContain(text.indexOf('\u200d'))
  })

  it('plans model-ordered left then right fragments until the exclusion bottom', () => {
    const {scroll} = createScroll([
      {insert: 'abcdefghij'},
      {insert: {image: 'test'}},
      {insert: 'klmnopqrstuvwxyz'},
    ])
    const anchor = scroll.leaves[1] as EmbedBlot
    const geometry = resolveInlineFloatGeometry({
      containerWidth: 600,
      imageWidth: 180,
      imageHeight: 40,
      x: 0.35,
      side: 'auto',
      gap: 0,
    })
    const advanceRequests: boolean[] = []
    const plan = buildInlineFragmentPlan({
      anchor,
      anchorOffset: 10,
      lineStart: 0,
      endOffset: scroll.textLength,
      lineHeight: 20,
      geometry,
      fitFragment: (start, end, _width, measureAdvance) => {
        advanceRequests.push(measureAdvance)
        return {
          end: Math.min(end, start + 4),
          advance: measureAdvance ? 40 : 0,
        }
      },
      nextOffset: offset => offset + 1,
    })!

    expect(plan.rows).toEqual([
      {
        left: {start: 0, end: 4},
        right: {start: 4, end: 8},
        leftAdvance: 40,
      },
      {
        left: {start: 8, end: 12},
        right: {start: 12, end: 16},
        leftAdvance: 40,
      },
    ])
    expect(plan.endOffset).toBe(16)
    expect(advanceRequests).toEqual([true, false, true, false])
  })

  it('falls back instead of extending the center exclusion past the image', () => {
    const {scroll} = createScroll([
      {insert: 'abcdefghij'},
      {insert: {image: 'test'}},
      {insert: 'klmnopqrstuvwxyz'},
    ])
    const anchor = scroll.leaves[1] as EmbedBlot
    const geometry = resolveInlineFloatGeometry({
      containerWidth: 600,
      imageWidth: 180,
      imageHeight: 20,
      x: 0.35,
      side: 'auto',
      gap: 0,
    })

    expect(
      buildInlineFragmentPlan({
        anchor,
        anchorOffset: 10,
        lineStart: 0,
        endOffset: scroll.textLength,
        lineHeight: 20,
        geometry,
        fitFragment: (start, end) => ({
          end: Math.min(end, start + 1),
          advance: 10,
        }),
        nextOffset: offset => offset + 1,
      }),
    ).toBeNull()
  })

  it('tries the right interval before rejecting an atomic unit that cannot fit left', () => {
    const {scroll} = createScroll([
      {insert: {image: 'test'}},
      {insert: 'after'},
    ])
    const anchor = scroll.leaves[0] as EmbedBlot
    const geometry = resolveInlineFloatGeometry({
      containerWidth: 600,
      imageWidth: 180,
      imageHeight: 20,
      x: 0.35,
      side: 'auto',
      gap: 0,
    })

    const plan = buildInlineFragmentPlan({
      anchor,
      anchorOffset: 0,
      lineStart: 0,
      endOffset: scroll.textLength,
      lineHeight: 20,
      geometry,
      fitFragment: (start, end, _width, measureAdvance) => ({
        end: measureAdvance ? start : Math.min(end, start + 1),
        advance: 0,
      }),
      nextOffset: offset => offset + 1,
    })

    expect(plan).not.toBeNull()
    expect(plan!.rows[0]).toEqual({
      left: {start: 0, end: 0},
      right: {start: 0, end: 1},
      leftAdvance: 0,
    })
  })

  it('keeps safe line candidates nearest a long anchor', () => {
    const text = 'a'.repeat(3000)
    const {container, scroll} = createScroll([
      {insert: text},
      {insert: {image: 'test'}},
    ])
    const measurer = new InlineRangeMeasurer(container, scroll, () =>
      document.createRange(),
    )

    const offsets = measurer.safeOffsetsEndingAt(952, text.length, 513)

    expect(offsets.length).toBe(513)
    expect(offsets[0]).toBe(2488)
    expect(offsets[offsets.length - 1]).toBe(text.length)
  })

  it('finds the visual line containing an anchor after long text', () => {
    const text = 'a'.repeat(3000)
    const {container, scroll} = createScroll([
      {insert: text},
      {insert: {image: 'test'}},
    ])
    const host = document.createElement('div')
    host.style.width = '240px'
    container.className = 'edit-container'
    container.style.cssText = [
      'display:block',
      'width:240px',
      'font:16px/20px monospace',
      'white-space:pre-wrap',
      'word-break:break-all',
    ].join(';')
    host.appendChild(container)
    document.body.appendChild(host)
    const textBlot = scroll.leaves[0] as TextBlot
    const createRange = (start: number, end: number) => {
      const range = document.createRange()
      range.setStart(textBlot.textNode, start)
      range.setEnd(textBlot.textNode, end)
      return range
    }
    const measurer = new InlineRangeMeasurer(container, scroll, createRange)

    const lineStart = measurer.findLineStart(text.length)
    const startRect = createRange(
      lineStart,
      lineStart + 1,
    ).getBoundingClientRect()
    const anchorRect = createRange(
      text.length - 1,
      text.length,
    ).getBoundingClientRect()

    expect(text.length - lineStart).toBeLessThan(100)
    expect(Math.abs(startRect.top - anchorRect.top)).toBeLessThanOrEqual(0.75)
    host.remove()
  })

  it('expands the fit window when a wide line holds more than 64 graphemes', () => {
    const text = 'a'.repeat(300)
    const {container, scroll} = createScroll([{insert: text}])
    const host = document.createElement('div')
    container.className = 'edit-container'
    container.style.cssText = [
      'display:block',
      'width:5000px',
      'font:16px/20px monospace',
      'white-space:pre-wrap',
      'word-break:break-all',
    ].join(';')
    host.appendChild(container)
    document.body.appendChild(host)
    const measurer = new InlineRangeMeasurer(container, scroll, () =>
      document.createRange(),
    )

    measurer.beginLayoutPass()
    const fit = measurer.fitFragment(0, text.length, 5000, false)
    measurer.endLayoutPass()

    expect(fit).toEqual({end: text.length, advance: 0})
    host.remove()
  })

  it('keeps heading font metrics and ordinary atomic Embeds in hidden measurement', () => {
    const mentionConverter: EmbedConverter = {
      toView: delta => {
        const span = document.createElement('span')
        span.dataset['measureMention'] = 'true'
        span.style.display = 'inline-block'
        span.style.width = '80px'
        span.style.whiteSpace = 'nowrap'
        span.textContent = String(delta.insert['mention'] ?? '')
        return span
      },
      toDelta: element => ({
        insert: {mention: element.textContent ?? ''},
      }),
    }
    const container = document.createElement('div')
    const scroll = new ScrollBlot(
      container,
      new Map([['mention', mentionConverter]]),
    )
    scroll.build([
      {insert: 'aa'},
      {insert: {mention: 'Alice'}},
      {insert: 'bb'},
    ])
    const host = document.createElement('div')
    container.className = 'edit-container'
    container.style.cssText = [
      'display:block',
      'width:400px',
      'font-family:Arial',
      'font-size:32px',
      'font-weight:700',
      'line-height:48px',
      'font-variant-numeric:tabular-nums',
      'white-space:pre-wrap',
      'word-break:break-all',
    ].join(';')
    host.appendChild(container)
    document.body.appendChild(host)

    const prefix = scroll.leaves[0] as TextBlot
    const mention = scroll.leaves[1] as EmbedBlot
    const suffix = scroll.leaves[2] as TextBlot
    const throughMentionRange = document.createRange()
    throughMentionRange.setStart(prefix.textNode, 0)
    throughMentionRange.setEndAfter(mention.cElement)
    const throughSuffixRange = document.createRange()
    throughSuffixRange.setStart(prefix.textNode, 0)
    throughSuffixRange.setEnd(suffix.textNode, 1)
    const throughMention = throughMentionRange.getBoundingClientRect().width
    const throughFirstSuffix = throughSuffixRange.getBoundingClientRect().width
    const fragmentWidth = (throughMention + throughFirstSuffix) / 2
    const measurer = new InlineRangeMeasurer(container, scroll, () =>
      document.createRange(),
    )

    measurer.beginLayoutPass()
    const measurement = (measurer as unknown as {
      _createMeasurementContent(
        start: number,
        end: number,
        width: number,
      ): {root: HTMLElement}
    })._createMeasurementContent(0, scroll.textLength, 400)
    const measuredMention = measurement.root.querySelector<HTMLElement>(
      '[data-measure-mention]',
    )!.closest<HTMLElement>('c-element')!
    const measuredMentionWidth = measuredMention.getBoundingClientRect().width
    const sourceStyle = getComputedStyle(container)
    const measuredStyle = getComputedStyle(measurement.root)
    const sourceFontMetrics = {
      fontFamily: sourceStyle.fontFamily,
      fontSize: sourceStyle.fontSize,
      fontWeight: sourceStyle.fontWeight,
      fontStyle: sourceStyle.fontStyle,
      fontStretch: sourceStyle.fontStretch,
      fontVariant: sourceStyle.fontVariant,
      lineHeight: sourceStyle.lineHeight,
    }
    const measuredFontMetrics = {
      fontFamily: measuredStyle.fontFamily,
      fontSize: measuredStyle.fontSize,
      fontWeight: measuredStyle.fontWeight,
      fontStyle: measuredStyle.fontStyle,
      fontStretch: measuredStyle.fontStretch,
      fontVariant: measuredStyle.fontVariant,
      lineHeight: measuredStyle.lineHeight,
    }
    const fit = measurer.fitFragment(0, scroll.textLength, fragmentWidth, true)
    measurement.root.remove()
    measurer.endLayoutPass()

    expect(throughFirstSuffix).toBeGreaterThan(throughMention)
    expect(measuredMentionWidth).toBeGreaterThanOrEqual(80)
    expect(measuredFontMetrics).toEqual(sourceFontMetrics)
    expect(fit.end).toBeLessThan(scroll.textLength)
    host.remove()
  })

  it('fits only one real text line when font size exceeds line height', () => {
    const {container, scroll} = createScroll([{insert: 'abcdefgh'}])
    container.style.cssText = [
      'display:block',
      'width:64px',
      'font:32px/20px monospace',
      'white-space:pre-wrap',
      'word-break:break-all',
    ].join(';')
    document.body.appendChild(container)
    try {
      const text = (scroll.leaves[0] as TextBlot).textNode
      const range = document.createRange()
      range.selectNodeContents(text)
      const rects = Array.from(range.getClientRects())
      expect(rects.length).toBeGreaterThan(1)
      expect(rects[0].bottom).toBeGreaterThan(rects[1].top)
      const measurer = new InlineRangeMeasurer(container, scroll, () => range)
      const fit = measurer.fitFragment(0, scroll.textLength, 64)
      expect(fit.end).toBe(3)
      expect(fit.advance).toBeCloseTo(rects[0].width, 1)
    } finally {
      container.remove()
    }
  })

  describe('first-line rectangle measurement', () => {
    function measureRects(rects: DOMRect[], width = 100) {
      const {container, scroll} = createScroll([{insert: 'a'}])
      const text = (scroll.leaves[0] as TextBlot).textNode
      const content = {
        root: container,
        offsets: [0, 1],
        points: new Map([[1, {node: text, offset: 1}]]),
      }
      type Content = typeof content
      const measurer = new InlineRangeMeasurer(container, scroll, () =>
        document.createRange(),
      ) as unknown as {
        _fitsFirstLine(content: Content, end: number, width: number): boolean
        _firstLineAdvance(content: Content, end: number): number
      }
      spyOn(Range.prototype, 'getClientRects').and.returnValue(
        rects as unknown as DOMRectList,
      )
      spyOn(container, 'getBoundingClientRect').and.returnValue(
        new DOMRect(100, 0, width, 100),
      )
      return {
        fits: measurer._fitsFirstLine(content, 1, width),
        advance: measurer._firstLineAdvance(content, 1),
      }
    }

    it('accepts Firefox wrapper and glyph boxes with different tops on one line', () => {
      expect(measureRects([
        new DOMRect(100, 26, 16, 20),
        new DOMRect(100, 25, 16, 23),
        new DOMRect(116, 25, 32, 23),
      ])).toEqual({fits: true, advance: 48})
    })

    it('rejects the next visual line and excludes it from first-line advance', () => {
      expect(measureRects([
        new DOMRect(100, 26, 16, 20),
        new DOMRect(100, 25, 16, 23),
        new DOMRect(100, 49, 80, 23),
      ])).toEqual({fits: false, advance: 16})
    })

    it('does not merge lines through a tall overlapping wrapper', () => {
      expect(measureRects([
        new DOMRect(100, 0, 20, 80),
        new DOMRect(100, 10, 20, 20),
        new DOMRect(120, 25, 20, 20),
        new DOMRect(100, 34, 80, 20),
      ])).toEqual({fits: false, advance: 20})
    })

    it('retains conservative fallback for shifted script boxes without containment', () => {
      expect(measureRects([
        new DOMRect(100, 12, 20, 20),
        new DOMRect(120, 8, 10, 14),
        new DOMRect(130, 20, 10, 14),
      ])).toEqual({fits: false, advance: 20})
    })

    it('rejects tightly spaced adjacent lines even when their glyphs overlap', () => {
      expect(measureRects([
        new DOMRect(100, 0, 30, 37),
        new DOMRect(100, 20, 80, 37),
      ])).toEqual({fits: false, advance: 30})
    })

    it('accepts contained mixed-font and bold boxes without changing their widths', () => {
      expect(measureRects([
        new DOMRect(100, 0, 20, 36),
        new DOMRect(120, 12, 15, 20),
        new DOMRect(135, 11, 17, 22),
      ])).toEqual({fits: true, advance: 52})
    })

    it('keeps an ordinary atomic embed width when checking the interval', () => {
      expect(measureRects([
        new DOMRect(100, 12, 20, 20),
        new DOMRect(120, 0, 90, 36),
      ])).toEqual({fits: false, advance: 110})
    })

    it('ignores empty float anchor rectangles without ignoring text width', () => {
      expect(measureRects([
        new DOMRect(100, 0, 0, 0),
        new DOMRect(100, 26, 16, 20),
        new DOMRect(100, 25, 16, 23),
        new DOMRect(500, 100, 0, 0),
      ])).toEqual({fits: true, advance: 16})
    })
  })

  it('moves real Blot nodes and revokes without changing content or semantic boundaries', () => {
    const {container, scroll} = createScroll([
      {insert: 'abcd', attributes: {bold: true}},
      {insert: {image: 'test'}},
      {insert: 'efgh', attributes: {italic: true}},
    ])
    const originalText = (
      scroll.leaves.filter(leaf => leaf instanceof TextBlot) as TextBlot[]
    )
      .map(leaf => leaf.text)
      .join('')
    const originalLength = scroll.textLength
    const originalLeafCount = scroll.leaves.length
    const anchor = scroll.leaves[1] as EmbedBlot
    const geometry = resolveInlineFloatGeometry({
      containerWidth: 600,
      imageWidth: 180,
      imageHeight: 40,
      x: 0.35,
      side: 'auto',
      gap: 0,
    })
    const projection = new InlineFragmentProjection(scroll)
    const applied = projection.apply([
      {
        anchor,
        anchorOffset: 4,
        startOffset: 0,
        endOffset: 9,
        lineHeight: 20,
        geometry,
        rows: [
          {
            left: {start: 0, end: 2},
            right: {start: 2, end: 5},
            leftAdvance: 20,
          },
          {
            left: {start: 5, end: 7},
            right: {start: 7, end: 9},
            leftAdvance: 20,
          },
        ],
      },
    ])

    expect(applied).toBeTrue()
    expect(projection.active).toBeTrue()
    expect(
      container.querySelectorAll('[data-bc-inline-fragment-group]').length,
    ).toBe(1)
    expect(scroll.textLength).toBe(originalLength)
    expect(container.querySelectorAll('c-text').length).toBe(4)
    const firstRow = container.querySelector<HTMLElement>(
      '[data-bc-inline-fragment-row="0"]',
    )!
    const left = firstRow.querySelector<HTMLElement>(
      '[data-bc-inline-fragment-side="left"]',
    )!
    const right = firstRow.querySelector<HTMLElement>(
      '[data-bc-inline-fragment-side="right"]',
    )!
    expect(firstRow.style.display).toBe('block')
    expect(firstRow.style.gridTemplateColumns).toBe('')
    document.body.appendChild(container)
    expect(getComputedStyle(left).display).toBe('inline')
    expect(getComputedStyle(right).display).toBe('inline')
    expect(Number.parseFloat(getComputedStyle(right).marginInlineStart)).toBeCloseTo(
      geometry.containerWidth - geometry.rightTextWidth - 20,
    )

    container.remove()
    projection.revoke()

    expect(projection.active).toBeFalse()
    expect(
      container.querySelector('[data-bc-inline-fragment-group]'),
    ).toBeNull()
    expect(scroll.textLength).toBe(originalLength)
    expect(scroll.leaves.length).toBe(originalLeafCount)
    expect(
      (scroll.leaves.filter(leaf => leaf instanceof TextBlot) as TextBlot[])
        .map(leaf => leaf.text)
        .join(''),
    ).toBe(originalText)
    expect((scroll.leaves[0] as TextBlot).attrs).toEqual({bold: true})
    expect((scroll.leaves[2] as TextBlot).attrs).toEqual({italic: true})
  })

  it('keeps layout text splits owned after clearing only the pagination layer', () => {
    const {container, scroll} = createScroll([{insert: 'abcdefgh'}])
    const projection = new InlineFragmentProjection(scroll)

    expect(projection.apply([], [{
      offset: 4,
      height: 120,
      backdropOffset: 80,
      backdropHeight: 20,
    }])).toBeTrue()
    expect(scroll.leaves.length).toBe(2)
    expect(container.querySelector(
      `[${INLINE_PAGINATION_GAP_ATTRIBUTE}]`,
    )).not.toBeNull()

    projection.clearPaginationLayerInPlace()
    expect(container.querySelector(
      `[${INLINE_PAGINATION_GAP_ATTRIBUTE}]`,
    )).toBeNull()
    expect(projection.active).toBeTrue()

    projection.revoke()
    expect(projection.active).toBeFalse()
    expect(scroll.leaves.length).toBe(1)
    expect(scroll.textLength).toBe(8)
  })

  it('repeated apply and revoke cycles are idempotent', () => {
    const {scroll} = createScroll([
      {insert: 'abcd'},
      {insert: {image: 'test'}},
      {insert: 'efgh'},
    ])
    const anchor = scroll.leaves[1] as EmbedBlot
    const geometry = resolveInlineFloatGeometry({
      containerWidth: 600,
      imageWidth: 180,
      imageHeight: 20,
      x: 0.35,
      side: 'auto',
      gap: 0,
    })
    const plan = {
      anchor,
      anchorOffset: 4,
      startOffset: 0,
      endOffset: 9,
      lineHeight: 20,
      geometry,
      rows: [
        {
          left: {start: 0, end: 4},
          right: {start: 4, end: 9},
          leftAdvance: 40,
        },
      ],
    }
    const projection = new InlineFragmentProjection(scroll)

    expect(projection.apply([plan])).toBeTrue()
    expect(projection.apply([plan])).toBeTrue()
    projection.revoke()
    projection.revoke()

    expect(scroll.textLength).toBe(9)
    expect(scroll.leaves.length).toBe(3)
  })

  it('rolls back every split and moved node when projection fails', () => {
    const brokenConverter: EmbedConverter = {
      toView: () => document.createElement('span'),
      toDelta: () => ({insert: {image: 'test'}}),
    }
    const {container, scroll} = createScroll(
      [{insert: 'abcd'}, {insert: {image: 'test'}}, {insert: 'efgh'}],
      brokenConverter,
    )
    const originalText = container.textContent
    const originalLength = scroll.textLength
    const originalLeafCount = scroll.leaves.length
    const anchor = scroll.leaves[1] as EmbedBlot
    const projection = new InlineFragmentProjection(scroll)

    expect(
      projection.apply([
        {
          anchor,
          anchorOffset: 4,
          startOffset: 0,
          endOffset: 9,
          lineHeight: 20,
          geometry: resolveInlineFloatGeometry({
            containerWidth: 600,
            imageWidth: 180,
            imageHeight: 20,
            x: 0.35,
            side: 'auto',
            gap: 0,
          }),
          rows: [
            {
              left: {start: 0, end: 2},
              right: {start: 2, end: 9},
              leftAdvance: 20,
            },
          ],
        },
      ]),
    ).toBeFalse()
    expect(projection.active).toBeFalse()
    expect(
      container.querySelector('[data-bc-inline-fragment-group]'),
    ).toBeNull()
    expect(container.textContent).toBe(originalText)
    expect(scroll.textLength).toBe(originalLength)
    expect(scroll.leaves.length).toBe(originalLeafCount)
  })
})
