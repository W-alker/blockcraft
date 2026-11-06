import {InlinePositionMapper} from './inline-position-mapper'
import {ScrollBlot} from '../blot/scroll-blot'
import {TextBlot} from '../blot/text-blot'
import {CursorBlot} from '../blot/cursor-blot'
import {InlineModel} from '../../types'
import type {EmbedConverter} from '../index'

describe('InlinePositionMapper canonical code lines', () => {
  let container: HTMLElement
  let mapper: InlinePositionMapper
  let scroll: ScrollBlot

  function build(model: InlineModel, lineContainers = true): HTMLElement[] {
    scroll = new ScrollBlot(container, new Map(), lineContainers ? {lineContainerTag: 'c-line'} : undefined)
    scroll.build(model)
    mapper.setScrollBlot(scroll)
    return Array.from(container.children) as HTMLElement[]
  }

  beforeEach(() => {
    container = document.createElement('div')
    mapper = new InlinePositionMapper()
  })

  it('maps root child boundaries to complete logical lines', () => {
    build([{insert: 'ab\ncd\n'}])

    expect([0, 1, 2, 3].map(offset => mapper.domPointToModelPoint(container, container, offset)))
      .toEqual([0, 3, 6, 6])
  })

  it('maps line boundaries using model lengths and the preceding line base', () => {
    const lines = build([
      {insert: 'ab'},
      {insert: '\n', attributes: {color: 'red'}},
      {insert: 'c', attributes: {color: 'blue'}},
      {insert: 'd\n'},
    ])

    expect(mapper.domPointToModelPoint(container, lines[0], 0)).toBe(0)
    expect(mapper.domPointToModelPoint(container, lines[0], 1)).toBe(0)
    expect(mapper.domPointToModelPoint(container, lines[0], 2)).toBe(2)
    expect(mapper.domPointToModelPoint(container, lines[0], 3)).toBe(3)
    expect(mapper.domPointToModelPoint(container, lines[1], 0)).toBe(3)
    expect(mapper.domPointToModelPoint(container, lines[1], 1)).toBe(4)
    expect(mapper.domPointToModelPoint(container, lines[1], lines[1].childNodes.length)).toBe(6)
    expect(mapper.domPointToModelPoint(container, lines[2], 0)).toBe(6)
    expect(mapper.domPointToModelPoint(container, lines[2], lines[2].childNodes.length)).toBe(6)
  })

  it('returns the actual nested leading gap text for model offset zero', () => {
    const [line] = build([{insert: 'ab'}])
    const gap = scroll.leadingGapNode!

    expect(gap.parentNode).toBe(line)
    expect(mapper.modelPointToDomPoint(container, 0)).toEqual({node: gap.firstChild!, offset: 0})
    expect(mapper.domPointToModelPoint(container, gap.firstChild!, 1)).toBe(0)
  })

  it('parks after LF at the next line and preserves explicit before affinity', () => {
    const lines = build([{insert: 'ab\ncd\n'}])
    const newline = scroll.leaves[1] as TextBlot
    const second = scroll.leaves[2] as TextBlot

    expect(mapper.modelPointToDomPoint(container, 3)).toEqual({node: second.textNode, offset: 0})
    expect(mapper.modelPointToDomPoint(container, 3, 'before'))
      .toEqual({node: newline.textNode, offset: 1})
    expect(mapper.modelPointToDomPoint(container, 6)).toEqual({node: lines[2], offset: 0})
  })

  it('does not move a hidden revision LF to a later visible line', () => {
    const lines = build([
      {insert: 'a'},
      {insert: '\n', attributes: {'s:display': 'none'}},
      {insert: 'b\nc'},
    ])
    const hiddenNewline = scroll.leaves[1] as TextBlot

    expect(lines.length).toBe(2)
    expect(mapper.modelPointToDomPoint(container, 2))
      .toEqual({node: hiddenNewline.textNode, offset: 1})
    expect(mapper.domPointToModelPoint(container, lines[1], 0)).toBe(4)
  })

  it('uses a visible line boundary when its first revision leaf is hidden', () => {
    const lines = build([
      {insert: 'a\n'},
      {insert: 'deleted', attributes: {'s:display': 'none'}},
      {insert: 'visible'},
    ])
    const point = mapper.modelPointToDomPoint(container, 2)

    expect(point).toEqual({node: lines[1], offset: 0})
    expect(mapper.domPointToModelPoint(container, point.node, point.offset)).toBe(2)
  })

  for (const text of ['', '\n', '\n\n', 'a\nb', 'a\n\nb\n', 'a\r\nb\r\n', '中😀\n文\n']) {
    it(`round-trips every UTF-16 model point for ${JSON.stringify(text)}`, () => {
      build(text ? [{insert: text}] : [])

      for (let index = 0; index <= text.length; index++) {
        const point = mapper.modelPointToDomPoint(container, index)
        expect(mapper.domPointToModelPoint(container, point.node, point.offset))
          .withContext(`model index ${index}`).toBe(index)
      }
    })
  }

  it('maps the single empty line and its terminal break to zero', () => {
    const [line] = build([])

    expect(mapper.domPointToModelPoint(container, line, 0)).toBe(0)
    expect(mapper.domPointToModelPoint(container, line, line.childNodes.length)).toBe(0)
    expect(mapper.domPointToModelPoint(container, container, 1)).toBe(0)
    expect(mapper.modelPointToDomPoint(container, 0).node).toBe(scroll.leadingGapNode!.firstChild!)
  })

  it('ignores zero-length composition cursors in a logical line boundary', () => {
    const lines = build([{insert: 'a\nbc'}])
    const cursor = new CursorBlot()
    scroll.insertCursorBlot(3, cursor)
    const line = lines[1]
    const cursorIndex = Array.from(line.childNodes).indexOf(cursor.domNode as ChildNode)

    expect(cursorIndex).toBeGreaterThanOrEqual(0)
    expect(mapper.domPointToModelPoint(container, line, cursorIndex)).toBe(3)
    expect(mapper.domPointToModelPoint(container, line, cursorIndex + 1)).toBe(3)
    expect(mapper.domPointToModelPoint(container, cursor.anchorNode, 0)).toBe(3)
  })

  it('rejects unregistered and detached line containers', () => {
    const [line] = build([{insert: 'a'}])
    const foreignLine = document.createElement('c-line')
    container.appendChild(foreignLine)

    expect(() => mapper.domPointToModelPoint(container, foreignLine, 0)).toThrow()
    line.remove()
    expect(() => mapper.domPointToModelPoint(container, line, 0)).toThrow()
  })

  it('does not accept an arbitrary nested zero-space as the leading gap', () => {
    const [line] = build([{insert: 'a'}])
    const foreignGap = scroll.leadingGapNode!.cloneNode(true)
    line.appendChild(foreignGap)

    expect(() => mapper.domPointToModelPoint(container, foreignGap.firstChild!, 0)).toThrow()
  })

  it('preserves flat paragraph boundary points and direct leading-gap offsets', () => {
    build([{insert: 'ab\n'}, {insert: 'cd', attributes: {bold: true}}], false)
    const first = scroll.leaves[0] as TextBlot

    expect(mapper.domPointToModelPoint(container, container, 1)).toBe(0)
    expect(mapper.domPointToModelPoint(container, container, 2)).toBe(3)
    expect(mapper.modelPointToDomPoint(container, 3)).toEqual({node: first.textNode, offset: 3})
    expect(mapper.modelPointToDomPoint(container, 0).node).toBe(scroll.leadingGapNode!.firstChild!)
  })

  it('preserves flat embed gap mapping', () => {
    const converter: EmbedConverter = {
      toView: () => document.createElement('span'),
      toDelta: () => ({insert: {test: 'v'}}),
    }
    scroll = new ScrollBlot(container, new Map([['test', converter]]))
    scroll.build([{insert: {test: 'v'}}, {insert: 'a'}])
    mapper.setScrollBlot(scroll)
    const point = mapper.modelPointToDomPoint(container, 1)

    expect(mapper.domPointToModelPoint(container, point.node, point.offset)).toBe(1)
    expect(mapper.domPointToModelPoint(container, container, 2)).toBe(1)
  })

  it('keeps fragment wrappers and pagination gaps out of model offsets', () => {
    build([
      {insert: 'ab', attributes: {color: 'red'}},
      {insert: 'c', attributes: {color: 'blue'}},
      {insert: 'de', attributes: {bold: true}},
    ], false)
    const [first, second, third] = scroll.leaves as TextBlot[]
    const group = document.createElement('span')
    group.setAttribute('data-bc-inline-fragment-group', '')
    const fragment = document.createElement('span')
    fragment.setAttribute('data-bc-inline-fragment-side', 'left')
    container.insertBefore(group, first.domNode)
    fragment.append(first.domNode, second.domNode)
    group.appendChild(fragment)
    const pageGap = document.createElement('span')
    pageGap.setAttribute('data-bc-inline-pagination-gap', '')
    container.insertBefore(pageGap, third.domNode)

    expect([0, 1, 2, 3, 4, 5].map(offset => mapper.domPointToModelPoint(container, container, offset)))
      .toEqual([0, 0, 3, 3, 5, 5])
    expect(mapper.domPointToModelPoint(container, second.textNode, 1)).toBe(3)
    expect(mapper.modelPointToDomPoint(container, 3)).toEqual({node: second.textNode, offset: 1})
    expect(mapper.modelPointToDomPoint(container, 4)).toEqual({node: third.textNode, offset: 1})
  })

  it('refreshes offsets after text, attribute and line-structure mutations', () => {
    build([{insert: 'ab\ncd\nef'}])
    // Warm any derived index before each mutation so stale offsets are exposed.
    const assertRoundTrips = (text: string) => {
      for (let index = 0; index <= text.length; index++) {
        const point = mapper.modelPointToDomPoint(container, index)
        expect(mapper.domPointToModelPoint(container, point.node, point.offset))
          .withContext(`${JSON.stringify(text)} at ${index}`).toBe(index)
      }
    }
    assertRoundTrips('ab\ncd\nef')
    scroll.applyDelta([{retain: 1}, {insert: 'XY'}])
    assertRoundTrips('aXYb\ncd\nef')
    scroll.applyDelta([{retain: 2}, {retain: 5, attributes: {color: 'red'}}])
    assertRoundTrips('aXYb\ncd\nef')
    scroll.applyDelta([{retain: 3}, {delete: 4}])
    assertRoundTrips('aXY\nef')
    scroll.applyDelta([{retain: 3}, {insert: '\n'}])
    assertRoundTrips('aXY\n\nef')
  })

  it('maps indexed leaf points without materializing the flat leaf collection', () => {
    build([{insert: Array.from({length: 64}, (_, index) => `line${index}`).join('\n')}])
    const last = scroll.leaves.at(-1) as TextBlot
    const end = scroll.textLength
    spyOnProperty(scroll, 'leaves', 'get').and.throwError('Unexpected full leaf traversal')

    expect(mapper.modelPointToDomPoint(container, end)).toEqual({node: last.textNode, offset: last.length})
    expect(mapper.domPointToModelPoint(container, last.textNode, last.length)).toBe(end)
  })

  it('preserves model identity when native DOM temporarily wraps a canonical leaf', () => {
    const lines = build([{insert: 'a\nbc'}])
    const last = scroll.leaves.at(-1) as TextBlot
    const wrapper = document.createElement('span')
    lines[1].insertBefore(wrapper, last.domNode)
    wrapper.appendChild(last.domNode)

    expect(mapper.domPointToModelPoint(container, last.textNode, 1)).toBe(3)
    expect(mapper.modelPointToDomPoint(container, 3)).toEqual({node: last.textNode, offset: 1})
    expect(mapper.domPointToModelPoint(container, lines[1], 0)).toBe(2)
    expect(mapper.domPointToModelPoint(container, lines[1], 1)).toBe(4)
    const foreign = last.domNode.cloneNode(true)
    lines[1].appendChild(foreign)
    expect(() => mapper.domPointToModelPoint(container, foreign, 0)).toThrow()
  })

  it('preserves indexed embed gaps at logical-line boundaries', () => {
    const converter: EmbedConverter = {
      toView: () => document.createElement('span'),
      toDelta: () => ({insert: {test: 'v'}}),
    }
    scroll = new ScrollBlot(container, new Map([['test', converter]]), {lineContainerTag: 'c-line'})
    scroll.build([{insert: 'a\n'}, {insert: {test: 'v'}}, {insert: '\nb'}])
    mapper.setScrollBlot(scroll)

    for (let index = 0; index <= 5; index++) {
      for (const affinity of ['before', 'after'] as const) {
        const point = mapper.modelPointToDomPoint(container, index, affinity)
        expect(mapper.domPointToModelPoint(container, point.node, point.offset))
          .withContext(`embed model index ${index}, affinity ${affinity}`).toBe(index)
      }
    }
  })

  it('rejects offsets beyond the final leaf instead of returning an invalid DOM point', () => {
    build([{insert: 'a\nb'}])

    expect(() => mapper.modelPointToDomPoint(container, 4)).toThrow()
    expect(() => mapper.modelPointToDomPoint(container, Number.NaN)).toThrow()
    expect(() => mapper.modelPointToDomPoint(container, Number.POSITIVE_INFINITY)).toThrow()
  })
})
