import {ScrollBlot} from './scroll-blot'
import {TextBlot} from './text-blot'
import {CursorBlot} from './cursor-blot'
import {BlotType} from './blot'
import {InlineRuntime} from '../runtime/inline-runtime'
import {InlinePaginationProjection} from '../runtime/inline-pagination-projection'

describe('ScrollBlot canonical logical lines', () => {
  let container: HTMLElement
  let scroll: ScrollBlot

  beforeEach(() => {
    container = document.createElement('pre')
    document.body.appendChild(container)
    scroll = new ScrollBlot(container, new Map(), {lineContainerTag: 'c-line'})
  })

  afterEach(() => {
    scroll.detachAll()
    container.remove()
  })

  const lineText = (line: Element) => Array.from(line.querySelectorAll('c-text'))
    .map(node => node.textContent ?? '').join('')
  const rows = () => Array.from(container.children)
  const modelText = () => scroll.leaves.map(leaf => leaf instanceof TextBlot ? leaf.text : '\ufffc').join('')

  it('splits LF leaves, preserves CRLF and puts gap/break inside the first/last line', () => {
    scroll.build([{insert: 'first\r\n\nlast\n'}])
    expect(rows().map(lineText)).toEqual(['first\r\n', '\n', 'last\n', ''])
    expect(rows().every(row => row.localName === 'c-line')).toBeTrue()
    expect(modelText()).toBe('first\r\n\nlast\n')
    expect(scroll.leaves.filter(leaf => leaf instanceof TextBlot && leaf.text.includes('\n'))
      .every(leaf => (leaf as TextBlot).text === '\n')).toBeTrue()
    expect(scroll.leadingGapNode?.parentNode).toBe(rows()[0])
    const endBreak = scroll.children.find(child => child.type === BlotType.Break)!
    expect(endBreak.domNode.parentNode).toBe(rows().at(-1)!)
    expect(scroll.hasCanonicalDomOrder()).toBeTrue()
  })

  it('keeps exactly one empty line and never treats a bare CR as a line break', () => {
    scroll.build([])
    expect(rows().length).toBe(1)
    expect(scroll.textLength).toBe(0)
    scroll.build([{insert: 'a\rb'}])
    expect(rows().map(lineText)).toEqual(['a\rb'])
    expect(scroll.textLength).toBe(3)
  })

  it('preserves unaffected row and leaf DOM identities during input', () => {
    scroll.build([{insert: 'a\nb\nc'}])
    const beforeRows = rows()
    const beforeLast = scroll.leaves.at(-1)!
    scroll.applyDelta([{retain: 2}, {insert: 'edited '}])
    expect(rows()).toEqual(beforeRows)
    expect(scroll.leaves.at(-1)).toBe(beforeLast)
    expect(modelText()).toBe('a\nedited b\nc')
    expect(rows().map(lineText)).toEqual(['a\n', 'edited b\n', 'c'])
  })

  it('inserts and removes rows without stealing unaffected suffix wrappers', () => {
    scroll.build([{insert: 'a\nb\nc'}])
    const beforeRows = rows()
    scroll.applyDelta([{insert: '\n'}])
    expect(rows().map(lineText)).toEqual(['\n', 'a\n', 'b\n', 'c'])
    expect(rows()[1]).toBe(beforeRows[0])
    expect(rows()[2]).toBe(beforeRows[1])
    expect(rows()[3]).toBe(beforeRows[2])
    scroll.applyDelta([{delete: 1}])
    expect(rows().map(lineText)).toEqual(['a\n', 'b\n', 'c'])
    expect(rows()[1]).toBe(beforeRows[1])
    expect(rows()[2]).toBe(beforeRows[2])
  })

  it('does not remove or reinsert unchanged suffix rows when deleting a whole row', () => {
    for (const deleteOffset of [0, 2]) {
      scroll.build([{insert: 'a\nb\nc\nd'}])
      const beforeRows = rows()
      const suffix = beforeRows.slice(deleteOffset / 2 + 1)
      const observer = new MutationObserver(() => {})
      observer.observe(container, {childList: true})
      scroll.applyDelta([{retain: deleteOffset}, {delete: 2}])
      const records = observer.takeRecords()
      observer.disconnect()
      const moved = records.flatMap(record => [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)])
      expect(suffix.every(line => !moved.includes(line))).toBeTrue()
      expect(rows().slice(deleteOffset / 2)).toEqual(suffix)
      expect(rows().map(lineText)).toEqual(deleteOffset === 0
        ? ['b\n', 'c\n', 'd'] : ['a\n', 'c\n', 'd'])
      expect(scroll.hasCanonicalDomOrder()).toBeTrue()
    }
  })

  it('merges visible lines when a revision hides LF and restores them when shown', () => {
    scroll.build([{insert: 'left\nright'}])
    scroll.applyDelta([{retain: 4}, {retain: 1, attributes: {'s:display': 'none'}}])
    expect(rows().length).toBe(1)
    expect(modelText()).toBe('left\nright')
    expect(scroll.textLength).toBe(10)
    const newline = scroll.leaves.find(leaf => leaf instanceof TextBlot && leaf.text === '\n') as TextBlot
    expect(newline.attrs?.['s:display']).toBe('none')
    scroll.applyDelta([{retain: 4}, {retain: 1, attributes: {'s:display': null}}])
    expect(rows().map(lineText)).toEqual(['left\n', 'right'])
    expect(modelText()).toBe('left\nright')
  })

  it('keeps hidden trailing LF in the last visible row', () => {
    scroll.build([
      {insert: 'a'},
      {insert: '\n', attributes: {'s:display': 'none'}},
    ])
    expect(rows().length).toBe(1)
    expect(scroll.textLength).toBe(2)
  })

  it('supports batch highlight replacement and public leaf insertions inside rows', () => {
    scroll.build([{insert: 'a\nb\nc'}])
    const beforeRows = rows()
    scroll.spliceLeaves(2, 1, [new TextBlot('B', {'s:color': 'red'})])
    expect(rows()).toEqual(beforeRows)
    expect(rows().map(lineText)).toEqual(['a\n', 'B\n', 'c'])
    scroll.insertLeafBefore(new TextBlot('\ntail'), null)
    expect(rows().map(lineText)).toEqual(['a\n', 'B\n', 'c\n', 'tail'])
    expect(scroll.hasCanonicalDomOrder()).toBeTrue()
  })

  it('keeps cursor blots inside canonical rows at newline boundaries', () => {
    scroll.build([{insert: 'a\nb\n'}])
    const cursor = new CursorBlot()
    scroll.insertCursorBlot(2, cursor)
    expect(cursor.domNode.parentNode).toBe(rows()[1])
    expect(scroll.offsetOf(cursor)).toBe(2)
    scroll.removeCursorBlot(cursor)
    expect(rows().map(lineText)).toEqual(['a\n', 'b\n', ''])
    expect(scroll.hasCanonicalDomOrder()).toBeTrue()
  })

  it('recognizes only registered direct line wrappers and releases them on teardown', () => {
    scroll.build([{insert: 'a\nb'}])
    const registered = rows()[0]
    expect(scroll.isCanonicalLineContainer(registered)).toBeTrue()
    const fake = document.createElement('c-line')
    container.appendChild(fake)
    expect(scroll.isCanonicalLineContainer(fake)).toBeFalse()
    scroll.detachAll()
    expect(scroll.isCanonicalLineContainer(registered)).toBeFalse()
    expect(scroll.leadingGapNode).toBeNull()
  })

  it('restores canonical line ownership after a temporary wrapper moves real leaves', () => {
    scroll.build([{insert: 'a\nb'}])
    const beforeRows = rows()
    const fragment = document.createElement('span')
    container.appendChild(fragment)
    for (const child of scroll.children) fragment.appendChild(child.domNode)
    expect(scroll.hasCanonicalDomOrder()).toBeFalse()
    scroll.restoreCanonicalDomOrder()
    fragment.remove()
    expect(rows()).toEqual(beforeRows)
    expect(rows().map(lineText)).toEqual(['a\n', 'b'])
    expect(scroll.hasCanonicalDomOrder()).toBeTrue()
    new InlinePaginationProjection(scroll).revoke()
    expect(rows()).toEqual(beforeRows)
  })

  it('keeps line topology through InlineRuntime canonical-mutation preparation', () => {
    const runtime = new InlineRuntime(container, new Map(), {lineContainerTag: 'c-line'})
    runtime.render([{insert: 'a\nb'}])
    const beforeRows = rows()
    runtime.applyDelta([{retain: 3}, {insert: '!'}])
    expect(rows()).toEqual(beforeRows)
    expect(rows().map(lineText)).toEqual(['a\n', 'b!'])
    runtime.destroy()
  })

  it('preserves the default flat topology when line mode is omitted', () => {
    const flat = new ScrollBlot(container, new Map())
    flat.build([{insert: 'a\nb'}])
    expect(container.querySelector('c-line')).toBeNull()
    expect(flat.leaves.length).toBe(1)
    flat.applyDelta([{retain: 3}, {insert: '!'}])
    expect((flat.leaves[0] as TextBlot).text).toBe('a\nb!')
    expect(flat.hasCanonicalDomOrder()).toBeTrue()
    flat.detachAll()
  })
})
