import {LogicalLineIndex} from './logical-line-index'
import {IBlot} from './blot'
import {TextBlot} from './text-blot'
import {EmbedBlot} from './embed-blot'
import {CursorBlot} from './cursor-blot'
import {BreakBlot} from './break-blot'
import {ScrollBlot} from './scroll-blot'
import type {EmbedConverter} from '../index'

describe('LogicalLineIndex', () => {
  type Leaf = TextBlot | EmbedBlot

  const isLeaf = (child: IBlot): child is Leaf => child instanceof TextBlot || child instanceof EmbedBlot

  // This oracle deliberately derives every answer from the supplied flat model
  // order, without using the index's line records or prefix-sum helpers.
  function expectLinearEquivalent(index: LogicalLineIndex, rows: readonly (readonly IBlot[])[]): void {
    const children = rows.flat()
    const leaves = children.filter(isLeaf)
    const offsets = new Map<IBlot, number>()
    let modelOffset = 0
    let childStart = 0
    let leafStart = 0

    expect(index.sourceLines().length).toBe(rows.length)
    rows.forEach((row, lineIndex) => {
      const line = index.sourceLines()[lineIndex]
      expect(index.locate(line)).toEqual({lineIndex, modelOffset, childStart, leafStart})
      expect(line.children.length).toBe(row.length)
      expect(line.leaves).toEqual(row.filter(isLeaf))
      expect(line.text).toBe(row.filter(child => child instanceof TextBlot).map(child => child.text).join(''))
      expect(line.length).toBe(row.reduce((sum, child) => sum + child.length, 0))
      row.forEach((child, localChildIndex) => {
        offsets.set(child, modelOffset)
        expect(line.children[localChildIndex]).toBe(child)
        expect(index.lineOf(child)).toBe(line)
        expect(index.offsetOf(child)).toBe(modelOffset)
        expect(index.childIndexOf(child)).toBe(childStart + localChildIndex)
        expect(index.blotFromDom(child.domNode)).toBe(child)
        modelOffset += child.length
      })
      childStart += row.length
      leafStart += row.filter(isLeaf).length
    })
    expect(index.textLength).toBe(modelOffset)
    leaves.forEach((leaf, leafIndex) => expect(index.nextLeaf(leaf)).toBe(leaves[leafIndex + 1]))

    // Include both ends and every UTF-16 position, including the interior of a
    // surrogate pair. Exact boundaries belong to the preceding leaf.
    for (let offset = 0; offset <= modelOffset; offset++) {
      const expected = leaves.find(leaf => offsets.get(leaf)! + leaf.length >= offset)
      const found = index.findByOffset(offset)
      if (!expected) {
        expect(found).withContext(`empty leaf collection at ${offset}`).toBeNull()
      } else {
        expect(found?.blot).withContext(`leaf at ${offset}`).toBe(expected)
        expect(found?.localOffset).withContext(`local offset at ${offset}`).toBe(offset - offsets.get(expected)!)
      }
    }
  }

  function expectRemoved(index: LogicalLineIndex, children: readonly IBlot[]): void {
    for (const child of children) {
      expect(index.offsetOf(child)).toBe(-1)
      expect(index.childIndexOf(child)).toBe(-1)
      expect(index.lineOf(child)).toBeUndefined()
      expect(index.blotFromDom(child.domNode)).toBeUndefined()
      if (isLeaf(child)) expect(index.nextLeaf(child)).toBeUndefined()
    }
  }

  it('keeps character, child and leaf prefixes distinct across hidden LF and cursors', () => {
    const rows: IBlot[][] = [
      [new TextBlot('A😀'), new CursorBlot(), new TextBlot('\n')],
      [new TextBlot('中'), new TextBlot('\n', {'s:display': 'none'})],
      [new CursorBlot(), new TextBlot('e\u0301'), new BreakBlot()],
    ]
    const index = new LogicalLineIndex(rows.flat())

    expectLinearEquivalent(index, rows)
    expect(index.locate(index.sourceLines()[1])).toEqual({lineIndex: 1, modelOffset: 4, childStart: 3, leafStart: 2})
    expect(index.locate(index.sourceLines()[2])).toEqual({lineIndex: 2, modelOffset: 6, childStart: 5, leafStart: 4})
    expect(index.trustedPlainText()).toBe('A😀\n中\ne\u0301')
  })

  it('indexes canonical ScrollBlot leaves with CRLF and an empty trailing source line', () => {
    const scroll = new ScrollBlot(document.createElement('div'), new Map(), {lineContainerTag: 'c-line'})
    scroll.build([{insert: '😀\r\n\n'}])
    const children = [...scroll.children]
    const index = new LogicalLineIndex(children)
    const rows = [children.slice(0, 2), children.slice(2, 3), children.slice(3)]

    expectLinearEquivalent(index, rows)
    expect(index.sourceLines().map(line => line.length)).toEqual([4, 1, 0])
    expect(index.sourceLines()[2].leaves.length).toBe(0)
    expect(index.sourceLines()[2].children[0]).toBeInstanceOf(BreakBlot)
    expect(index.trustedPlainText()).toBe('😀\r\n\n')
  })

  it('handles empty indexes and zero-length cursor/break-only lines', () => {
    const empty = new LogicalLineIndex([])
    expectLinearEquivalent(empty, [[]])
    expect(empty.trustedPlainText()).toBe('')

    const row = [new CursorBlot(), new BreakBlot()]
    const index = new LogicalLineIndex(row)
    expectLinearEquivalent(index, [row])
    expect(index.blotFromDom(document.createElement('c-element'))).toBeUndefined()
  })

  it('invalidates replaced line identities and DOM mappings while keeping retained neighbors', () => {
    const rows: IBlot[][] = [
      [new TextBlot('ab'), new TextBlot('\n')],
      [new TextBlot('cd'), new CursorBlot(), new BreakBlot()],
    ]
    const index = new LogicalLineIndex(rows.flat())
    const retiredLine = index.sourceLines()[0]
    const retainedLine = index.sourceLines()[1]
    const removed = rows[0]
    expect(index.trustedPlainText()).toBe('ab\ncd')

    rows[0] = [new CursorBlot(), new TextBlot('😀x'), new TextBlot('\n', {'s:display': 'none'})]
    const replacement = index.replaceLine(retiredLine, rows[0])

    expect(index.sourceLines()[0]).toBe(replacement)
    expect(index.sourceLines()[1]).toBe(retainedLine)
    expect(index.locate(retiredLine)).toBeUndefined()
    expectRemoved(index, removed)
    expectLinearEquivalent(index, rows)
    expect(index.trustedPlainText()).toBe('😀x\ncd')
  })

  it('counts embeds as model characters but does not certify them as plain text', () => {
    const converter: EmbedConverter = {
      toView: () => document.createElement('span'),
      toDelta: () => ({insert: {test: 'v'}}),
    }
    const scroll = new ScrollBlot(document.createElement('div'), new Map([['test', converter]]), {lineContainerTag: 'c-line'})
    scroll.build([{insert: 'a\n'}, {insert: {test: 'v'}}, {insert: '中'}])
    const children = [...scroll.children]
    const rows = [children.slice(0, 2), children.slice(2)]
    const index = new LogicalLineIndex(children)

    expectLinearEquivalent(index, rows)
    expect(index.textLength).toBe(4)
    expect(index.trustedPlainText()).toBeUndefined()

    const oldLine = index.sourceLines()[1]
    const removed = rows[1]
    rows[1] = [new TextBlot('😀'), new BreakBlot()]
    index.replaceLine(oldLine, rows[1])
    expectLinearEquivalent(index, rows)
    expectRemoved(index, removed)
  })

  it('updates cached lengths when a replacement reuses an edited TextBlot', () => {
    const edited = new TextBlot('ab')
    const rows: IBlot[][] = [
      [edited, new TextBlot('\n')],
      [new TextBlot('tail'), new BreakBlot()],
    ]
    const index = new LogicalLineIndex(rows.flat())
    const before = index.sourceLines()[0]
    expect(index.trustedPlainText()).toBe('ab\ntail')

    edited.insertAt(1, '😀')
    index.replaceLine(before, rows[0])

    expectLinearEquivalent(index, rows)
    expect(index.blotFromDom(edited.domNode)).toBe(edited)
    expect(index.trustedPlainText()).toBe('a😀b\ntail')
    expect(index.locate(index.sourceLines()[1])?.modelOffset).toBe(5)
  })

  for (const rowCount of [1, 7, 17]) {
    it(`matches the linear oracle through seeded replacements across ${rowCount} source lines`, () => {
      let state = (0x51a7c0de ^ rowCount) >>> 0
      const random = (limit: number) => {
        state ^= state << 13
        state ^= state >>> 17
        state ^= state << 5
        return (state >>> 0) % limit
      }
      const alphabet = ['a', '中', '😀', '\r', 'e\u0301']
      const makeRow = (isLast: boolean): IBlot[] => {
        const row: IBlot[] = []
        const tokenCount = random(5)
        for (let token = 0; token < tokenCount; token++) {
          if (random(3) === 0) row.push(new CursorBlot())
          const text = Array.from({length: 1 + random(3)}, () => alphabet[random(alphabet.length)]).join('')
          row.push(new TextBlot(text, {color: token % 2 ? 'red' : 'blue'}))
        }
        if (random(2) === 0) row.push(new CursorBlot())
        row.push(isLast ? new BreakBlot() : new TextBlot('\n', random(2) ? {'s:display': 'none'} : undefined))
        return row
      }
      const rows = Array.from({length: rowCount}, (_, row) => makeRow(row === rowCount - 1))
      const index = new LogicalLineIndex(rows.flat())
      expectLinearEquivalent(index, rows)

      for (let round = 0; round < 48; round++) {
        // Exercise both extreme prefixes and adjacent multi-row updates. Each
        // replace preserves source-line count; structural count changes rebuild.
        const start = round % 4 === 0 ? 0 : round % 4 === 1 ? rowCount - 1 : random(rowCount)
        const count = round % 3 === 0 ? Math.min(3, rowCount - start) : 1
        const retired = []
        for (let row = start; row < start + count; row++) {
          const previous = index.sourceLines()[row]
          const removed = rows[row]
          rows[row] = makeRow(row === rowCount - 1)
          index.replaceLine(previous, rows[row])
          retired.push({previous, removed})
        }
        expectLinearEquivalent(index, rows)
        expect(index.trustedPlainText()).toBe(rows.flat().filter(child => child instanceof TextBlot).map(child => child.text).join(''))
        for (const {previous, removed} of retired) {
          expect(index.locate(previous)).toBeUndefined()
          expectRemoved(index, removed)
        }
      }
    })
  }
})
