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
    expect(left.style.display).toBe('inline')
    expect(right.style.display).toBe('inline')
    expect(Number.parseFloat(right.style.marginInlineStart)).toBeCloseTo(
      geometry.containerWidth - geometry.rightTextWidth - 20,
    )

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
