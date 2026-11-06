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
})
