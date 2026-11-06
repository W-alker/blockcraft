import {ScrollBlot} from './scroll-blot'
import {TextBlot} from './text-blot'
import {CursorBlot} from './cursor-blot'
import {BlotType} from './blot'
import {InlineRuntime} from '../runtime/inline-runtime'
import {InlinePaginationProjection} from '../runtime/inline-pagination-projection'
import {getLogicalLineAccess} from './logical-line-access'

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

  it('updates one source line without rereading unrelated text or rebuilding their records', () => {
    const source = Array.from({length: 128}, (_, index) => `value${index}`).join('\n')
    scroll.build([{insert: source, attributes: {'s:color': 'red'}}])
    const before = [...getLogicalLineAccess(scroll)!.sourceLines()]
    const target = getLogicalLineAccess(scroll)!.locate(before[64])!
    const unrelated = before[0].leaves[0] as TextBlot
    spyOnProperty(unrelated, 'text', 'get').and.throwError('unrelated DOM text read')
    spyOnProperty(unrelated, 'length', 'get').and.throwError('unrelated DOM length read')
    scroll.applyDelta([{retain: target.modelOffset + 2}, {insert: '中文🙂'}])
    const access = getLogicalLineAccess(scroll)!
    const after = access.sourceLines()
    expect(after[0]).toBe(before[0])
    expect(after[63]).toBe(before[63])
    expect(after[65]).toBe(before[65])
    expect(after[64]).not.toBe(before[64])
    expect(after[64].text).toBe('va中文🙂lue64\n')
    expect(access.trustedPlainText()).toBe(source.slice(0, target.modelOffset + 2) + '中文🙂' + source.slice(target.modelOffset + 2))
    const last = after.at(-1)!.leaves.at(-1)!
    expect(scroll.offsetOf(last)).toBe(source.lastIndexOf('\n') + 1 + '中文🙂'.length)
    expect(scroll.findByOffset(scroll.textLength - 1)?.blot).toBe(last)
    expect(scroll.hasCanonicalDomOrder()).toBeTrue()
  })

  it('normalizes LF locally when typing at a line end or into an empty source line', () => {
    for (const [source, at] of [['a\nb', 1], ['\nb', 0], ['a\n\nb', 2], ['a\r\nb', 2]] as const) {
      scroll.build([{insert: source}])
      const before = [...getLogicalLineAccess(scroll)!.sourceLines()]
      scroll.applyDelta([{retain: at}, {insert: 'X'}])
      const expected = source.slice(0, at) + 'X' + source.slice(at)
      const access = getLogicalLineAccess(scroll)!
      expect(access.trustedPlainText()).toBe(expected)
      expect(rows().map(lineText).join('')).toBe(expected)
      expect(scroll.leaves.filter(leaf => leaf instanceof TextBlot && leaf.text.includes('\n'))
        .every(leaf => (leaf as TextBlot).text === '\n')).toBeTrue()
      expect(access.sourceLines().at(-1)).toBe(before.at(-1)!)
      // A second edit exercises the updated index, including the newly split LF.
      scroll.applyDelta([{retain: at + 1}, {insert: 'Y'}])
      expect(getLogicalLineAccess(scroll)!.trustedPlainText()).toBe(source.slice(0, at) + 'XY' + source.slice(at))
    }
  })

  it('preserves unrelated source records through a complete one-line token replacement', () => {
    scroll.build([{insert: 'first\nsecond\nlast'}])
    const before = [...getLogicalLineAccess(scroll)!.sourceLines()]
    const start = getLogicalLineAccess(scroll)!.locate(before[1])!.leafStart
    const suffix = before[2].leaves[0] as TextBlot
    spyOnProperty(suffix, 'text', 'get').and.throwError('suffix text scanned')
    scroll.spliceLeaves(start, before[1].leaves.length, [
      new TextBlot('SECOND', {'s:color': 'blue'}),
      new TextBlot('!'),
      new TextBlot('\n'),
    ])
    const access = getLogicalLineAccess(scroll)!
    expect(access.sourceLines()[0]).toBe(before[0])
    expect(access.sourceLines()[2]).toBe(before[2])
    expect(access.sourceLines()[1].text).toBe('SECOND!\n')
    expect(access.locate(before[2])!.leafStart).toBe(start + 3)
    expect(scroll.offsetOf(suffix)).toBe('first\nSECOND!\n'.length)
    expect(access.blotFromDom(suffix.domNode)).toBe(suffix)
    expect(access.nextLeaf(access.sourceLines()[1].leaves.at(-1)!)).toBe(suffix)
  })

  it('keeps source lines independent when hidden LF joins their display row', () => {
    scroll.build([
      {insert: 'left'}, {insert: '\n', attributes: {'s:display': 'none'}},
      {insert: 'right\nlast'},
    ])
    const before = [...getLogicalLineAccess(scroll)!.sourceLines()]
    const beforeRows = rows()
    scroll.applyDelta([{retain: 6}, {insert: '!'}])
    const access = getLogicalLineAccess(scroll)!
    expect(access.sourceLines().map(line => line.text)).toEqual(['left\n', 'r!ight\n', 'last'])
    expect(access.sourceLines()[0]).toBe(before[0])
    expect(access.sourceLines()[2]).toBe(before[2])
    expect(rows()).toEqual(beforeRows)
    expect(rows().map(lineText)).toEqual(['left\nr!ight\n', 'last'])
  })

  it('updates local offsets after mixed delete, insert and formatting operations', () => {
    scroll.build([{insert: 'abcd\ntail', attributes: {'s:color': 'red'}}])
    const suffix = getLogicalLineAccess(scroll)!.sourceLines()[1]
    scroll.applyDelta([{retain: 1}, {delete: 2}, {insert: '🙂'}, {retain: 1, attributes: {'a:bold': true}}])
    const access = getLogicalLineAccess(scroll)!
    expect(access.sourceLines()[1]).toBe(suffix)
    expect(access.trustedPlainText()).toBe('a🙂d\ntail')
    expect(scroll.offsetOf(suffix.leaves[0])).toBe('a🙂d\n'.length)
    expect(scroll.findByOffset(3)?.localOffset).toBe(2)
    expect(rows().map(lineText)).toEqual(['a🙂d\n', 'tail'])
  })

  it('drains native text mutations synchronously and closes cached access until recovery', () => {
    scroll.build([{insert: 'first\nlast'}])
    const cached = getLogicalLineAccess(scroll)!
    const first = cached.sourceLines()[0].leaves[0] as TextBlot
    first.textNode.data = 'FIRST!'
    expect(getLogicalLineAccess(scroll)).toBeUndefined()
    expect(cached.trustedPlainText()).toBeUndefined()
    expect(scroll.textLength).toBe('FIRST!\nlast'.length)
    scroll.applyDelta([{retain: 8}, {insert: '!'}])
    expect(getLogicalLineAccess(scroll)!.trustedPlainText()).toBe('FIRST!\nl!ast')
  })

  it('never certifies native extra nodes merely because managed nodes remain in order', () => {
    scroll.build([{insert: 'a\nb'}])
    const raw = document.createTextNode('native')
    rows()[1].appendChild(raw)
    expect(getLogicalLineAccess(scroll)).toBeUndefined()
    scroll.restoreCanonicalDomOrder()
    expect(getLogicalLineAccess(scroll)).toBeUndefined()
    raw.remove()
    scroll.restoreCanonicalDomOrder()
    expect(getLogicalLineAccess(scroll)!.trustedPlainText()).toBe('a\nb')
  })

  it('disconnects on teardown and resumes observing after a new build', () => {
    scroll.build([{insert: 'old'}])
    const old = getLogicalLineAccess(scroll)!.sourceLines()[0].leaves[0] as TextBlot
    scroll.detachAll()
    expect(getLogicalLineAccess(scroll)).toBeUndefined()
    old.textNode.data = 'detached edit'
    scroll.build([{insert: 'new'}])
    expect(getLogicalLineAccess(scroll)!.trustedPlainText()).toBe('new')
    const next = scroll.leaves[0] as TextBlot
    next.textNode.data = 'NEW'
    expect(getLogicalLineAccess(scroll)).toBeUndefined()
  })

  it('revokes trust after a converter mutates another row and then throws', () => {
    scroll.detachAll()
    let other: TextBlot
    scroll = new ScrollBlot(container, new Map([['bad', {
      toView: () => {
        other.textNode.data = 'changed elsewhere'
        throw new Error('converter failed')
      },
    } as any]]), {lineContainerTag: 'c-line'})
    scroll.build([{insert: 'a\nlast'}])
    other = getLogicalLineAccess(scroll)!.sourceLines()[1].leaves[0] as TextBlot
    expect(() => scroll.applyDelta([{retain: 1}, {insert: {bad: 'x'}}])).toThrowError('converter failed')
    expect(getLogicalLineAccess(scroll)).toBeUndefined()
    expect(scroll.textLength).toBe('a\nchanged elsewhere'.length)
    scroll.build([{insert: 'restored'}])
    expect(getLogicalLineAccess(scroll)!.trustedPlainText()).toBe('restored')
  })
})
